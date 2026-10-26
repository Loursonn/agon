import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { canActForAthlete, hasConsent, requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Formes des données envoyées par le client. Le corps de requête sort de
 * `req.json()` donc non typé : on déclare ici les seuls champs réellement lus,
 * pour que `s.name` ou `f.mimeType` soient vérifiés plutôt que silencieux.
 */
interface SessionInfo {
  id: string;
  name?: string;
  short?: string;
}

/** Un tour de conversation, en mode `chat_edit`. */
interface HistoryMessage {
  role: string;
  content: string;
}

/** Fichier joint, encodé en base64 par le client. */
interface FileData {
  name?: string;
  mimeType?: string;
  data?: string;
  sessionTags?: string[];
}

/** Fragment de requête Gemini : du texte, ou un fichier inline. */
type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type?: string; data?: string } };

/**
 * Message d'une erreur attrapée.
 *
 * Le contrôle de flux ci-dessous compare ce message aux sentinelles
 * `__503__` / `__429__` / `__json_invalid__` levées par `callGemini` : il doit
 * rendre une string même si ce qui remonte n'est pas une `Error`, sinon une
 * panne réseau inattendue ferait planter la branche de retry elle-même.
 */
function errMessage(err: unknown, fallback = "unknown"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err || fallback;
  return fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    /*
      Vérification d'identité en tête, avant toute dépense. La fonction était
      jusqu'ici appelable sans compte : la clé anonyme suffisait, et elle est
      publique par nature puisqu'elle figure dans le bundle JavaScript. Le
      quota Gemini était donc consommable par n'importe qui.
    */
    const user = await requireUser(req);

    const body = await req.json();
    const { mode, prompt, imageBase64, filesData, sessions, targetSessions, currentProgram, conversationHistory, message, athleteId } = body;

    /*
      Le consentement porte sur l'athlète dont on traite les données, pas sur
      le coach qui tape la demande. D'où `athleteId` dans le corps : sans lui,
      la fonction n'avait personne à qui demander, et la case décochée dans
      l'interface ne protégeait de rien côté serveur.

      Un identifiant absent est un refus, pas un cas à laisser passer : sinon
      le jour où un appelant oublie le champ, le refus de l'athlète
      redevient décoratif sans que personne ne le remarque.
    */
    if (typeof athleteId !== "string" || !athleteId) {
      return json({ error: "athlete_absent" }, 400);
    }
    // Vérifié avant le consentement : un identifiant qu'on ne peut pas réclamer
    // serait sinon un moyen d'emprunter celui d'un athlète consentant.
    if (!(await canActForAthlete(user, athleteId))) {
      return json({ error: "athlete_non_autorise" }, 403);
    }
    if (!(await hasConsent(athleteId, "ai_programming"))) {
      return json({ error: "consentement_ia_absent" }, 403);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const sessionsList: SessionInfo[] = sessions && Array.isArray(sessions) && sessions.length > 0
      ? sessions
      : [{ id: "s1", name: "Séance 1", short: "S1" }];

    // Si targetSessions est défini, restreindre la génération à ces sessions uniquement
    const targetList = targetSessions && Array.isArray(targetSessions) && targetSessions.length > 0
      ? sessionsList.filter((s: SessionInfo) => targetSessions.includes(s.id))
      : sessionsList;
    const generateList = targetList.length > 0 ? targetList : sessionsList;

    const sessIds = sessionsList.map((s: SessionInfo) => s.id).join(", ");
    const sessDesc = sessionsList.map((s: SessionInfo) => `${s.id} (${s.name})`).join(", ");
    const genIds = generateList.map((s: SessionInfo) => s.id).join(", ");
    const genDesc = generateList.map((s: SessionInfo) => `${s.id} (${s.name})`).join(", ");
    const sessKeysExample = generateList.map((s: SessionInfo) => `"${s.id}":[...]`).join(",");

    const SESSIONS_INFO = `SESSIONS DU PROGRAMME (toutes): ${sessDesc}
SESSIONS A GENERER (uniquement celles-ci): ${genDesc}
BLOCS: PERF (mouvement principal), ESTH (hypertrophie esthetique), ASSOC (muscles associes/esthetique associe), BESOIN (besoins individuels/correctifs/mobilite specifique), CORE (gainage/core/poids de corps), MOBIL (mobilite/souplesse generale)
MUSCLES VALIDES: Pecs, Dos-GD, Dos-Trap, Dos-Rhom, Ep-Ant, Ep-Lat, Ep-Post, Quads, Ischios, Fessiers, Adducteurs, Triceps, Biceps, Core, Mollets
TYPES D'EXERCICES:
- "muscu" (defaut): exercice de musculation classique avec kg, sets, repsRange, rir
- "plio": exercice pliometrique (sauts, lancers) avec sets, repsRange, PAS de kg ni rir
- "mobilite": exercice de mobilite/souplesse avec sets, repsRange (peut etre une duree ex "30s"), PAS de kg ni rir`;

    const JSON_FORMAT = `Reponds UNIQUEMENT avec un JSON valide, sans markdown, sans commentaires. Format exact:
{"sessions":{${sessKeysExample}},"rationale":"Explication courte"}
Chaque session contient un array d'exercices au format: {"id":"g_SESSID_NUM","name":"NOM EXERCICE","bloc":"PERF","target":"Pecs","exType":"muscu","weeks":{"1":{"kg":80,"sets":4,"repsRange":"10","rir":2.5}}}
REGLES:
- GENERE UNIQUEMENT les sessions: ${genIds} — ne pas inclure d'autres sessions dans le JSON
- Reproduis TOUS les exercices de la source sans en omettre, progression logique, RIR 3->1.5, ids uniques g_[sessid]_[num]
- PERF = 1 seul mouvement poly par session
- JSON compact, PAS de rationale longue (1 phrase max)
- CRITICAL: Le JSON DOIT etre COMPLET. Ne tronque JAMAIS la sortie.`;

    const systemPrompt = `Tu es un preparateur physique expert en musculation. Tu generes des programmes structures en JSON strict.\n${SESSIONS_INFO}\n${JSON_FORMAT}`;

    let userPrompt: string;
    if (mode === "generate") {
      userPrompt = prompt;
    } else if (mode === "chat_edit") {
      const limitedHistory = (conversationHistory || []).slice(-6);
      const historyText = limitedHistory.map((m: HistoryMessage) =>
        `${m.role === "user" ? "Coach" : "IA"}: ${m.content}`
      ).join("\n");
      userPrompt = `PROGRAMME ACTUEL:
${JSON.stringify(currentProgram)}

${historyText ? `HISTORIQUE:\n${historyText}\n\n` : ""}DEMANDE: ${message}

Retourne UNIQUEMENT les sessions modifiees dans {"sessions":{...},"rationale":"..."}. N'inclus PAS les sessions non modifiees — elles seront conservees automatiquement cote client. Exemple: si seule la session "s1" change, retourne {"sessions":{"s1":[...]},"rationale":"..."}.`;
    } else {
      const fileCount = (filesData?.length || 0) + (imageBase64 ? 1 : 0);
      const hasTaggedFiles = filesData?.some((f: FileData) => (f.sessionTags?.length ?? 0) > 0);

      const getSessionsLabel = (sessionTags: string[] | undefined) => {
        if (!sessionTags?.length) return null;
        return sessionTags.map((id: string) => {
          const s = sessionsList.find((x: SessionInfo) => x.id === id);
          return s ? `"${s.name}" (${id})` : id;
        }).join(" + ");
      };

      let fileContext = "";
      if (fileCount > 1) {
        if (hasTaggedFiles) {
          const taggedDesc = filesData?.map((f: FileData, i: number) => {
            const label = getSessionsLabel(f.sessionTags);
            const dest = label ? `sessions ${label} UNIQUEMENT` : "contexte general (repartir intelligemment)";
            return `  - Fichier ${i + 1}: "${f.name || "sans nom"}" → ${dest}`;
          }).join("\n") || "";
          fileContext = `\nATTENTION: ${fileCount} fichiers joints avec affectations:\n${taggedDesc}\nREGLE CRITIQUE: pour chaque fichier ayant des sessions cibles, placer SES exercices EXCLUSIVEMENT dans ces sessions (et les y repartir equitablement si plusieurs). Pour les fichiers "contexte general", repartir librement sur toutes les sessions.`;
        } else {
          const fileNames = filesData?.map((f: FileData, i: number) => `fichier ${i + 1}: "${f.name || "sans nom"}"`).join(", ") || "";
          fileContext = `\nATTENTION: ${fileCount} fichiers sont joints (${fileNames}). OBLIGATION: lire et extraire les exercices de CHAQUE fichier. Chaque fichier peut representer une seance differente ou une partie du programme. Combine TOUT le contenu pour creer un programme complet.`;
        }
      } else if (fileCount === 1) {
        const f = filesData?.[0];
        const label = getSessionsLabel(f?.sessionTags);
        if (label) {
          fileContext = `\n1 fichier joint affecte aux sessions ${label}. Placer TOUS ses exercices dans ces sessions uniquement, repartis equitablement.`;
        } else {
          fileContext = `\n1 fichier joint. Extraire tous les exercices du fichier.`;
        }
      }

      const hasText = (prompt || "").trim().length > 0 && prompt !== "Programme dans les fichiers ci-joints";
      userPrompt = `A partir du contenu suivant, cree un programme de musculation complet en repartissant les exercices dans les sessions disponibles: ${sessDesc}. Repartis intelligemment les exercices selon leur type et les noms des sessions.${fileContext}

CONTENU A IMPORTER:
${hasText ? prompt : fileCount > 1 ? "Programme reparti sur les fichiers joints (voir ci-dessous)" : "Programme dans le fichier joint (voir ci-dessous)"}`;
    }

    // Build Gemini request parts — text first, then files
    const parts: GeminiPart[] = [{ text: systemPrompt + "\n\n" + userPrompt }];

    // Support multi-file (new format) or legacy single image
    if (filesData && Array.isArray(filesData) && filesData.length > 0) {
      for (let i = 0; i < filesData.length; i++) {
        const f = filesData[i];
        // Label indiquant le fichier et ses sessions assignées
        const tags: string[] = f.sessionTags || [];
        const dest = tags.length > 0
          ? `→ SESSIONS ${tags.map((id: string) => { const s = sessionsList.find((x: SessionInfo) => x.id === id); return s ? `"${s.name}"` : id; }).join(" + ")} UNIQUEMENT`
          : `→ contexte général`;
        parts.push({ text: `[Fichier ${i + 1}/${filesData.length}: ${f.name || "sans nom"} ${dest}]` });
        parts.push({ inline_data: { mime_type: f.mimeType, data: f.data } });
      }
    } else if (imageBase64) {
      parts.push({ inline_data: { mime_type: "image/jpeg", data: imageBase64 } });
    }

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Helper: call Gemini and parse JSON, returns parsed object or throws
    const callGemini = async (temperature: number, modelId = "gemini-2.5-flash") => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { maxOutputTokens: 32768, temperature, responseMimeType: "application/json" },
          }),
        }
      );

      if (!response.ok) {
        const t = await response.text();
        console.error("Gemini error:", response.status, t);
        if (response.status === 429) throw new Error("__429__");
        if (response.status === 503) throw new Error("__503__");
        let detail = "";
        try { detail = JSON.parse(t)?.error?.message?.slice(0, 150) || t.slice(0, 150); } catch { detail = t.slice(0, 150); }
        throw new Error("Gemini " + response.status + ": " + detail);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) {
        const reason = data.candidates?.[0]?.finishReason || "unknown";
        const safetyRatings = JSON.stringify(data.candidates?.[0]?.safetyRatings || []);
        console.error("Gemini empty response, finishReason:", reason, "safety:", safetyRatings);
        throw new Error("Reponse vide (" + reason + ")");
      }

      let clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const start = clean.indexOf("{");
      if (start > 0) clean = clean.slice(start);

      try {
        return JSON.parse(clean);
      } catch {
        // Repair: trailing commas
        clean = clean.replace(/,\s*([}\]])/g, "$1");
        try {
          return JSON.parse(clean);
        } catch {
          throw new Error("__json_invalid__:" + clean.slice(0, 400));
        }
      }
    };

    // chat_edit uses faster model; generate/import use quality model
    // Import ciblé (targetSessions défini) → 2.0-flash plus rapide, scope limité
    // Import global ou generate → 2.5-flash pour la qualité
    const primaryModel = (mode === "chat_edit" || (mode === "import" && targetSessions?.length > 0))
      ? "gemini-2.0-flash"
      : "gemini-2.5-flash";

    const fallbackModel = "gemini-2.0-flash";

    // Attempt 1
    let parsed: unknown;
    let attempt1Error = "";
    try {
      parsed = await callGemini(0.3, primaryModel);
    } catch (e) {
      if (errMessage(e) === "__503__" && primaryModel !== fallbackModel) {
        // 503 on premium model → switch immediately to fallback model (no wait)
        console.warn(`503 on ${primaryModel}, switching to fallback ${fallbackModel}...`);
        try {
          parsed = await callGemini(0.3, fallbackModel);
        } catch (e2) {
          attempt1Error = errMessage(e2);
        }
      } else if (errMessage(e) === "__429__") {
        // Rate limited: wait 22s and retry
        console.warn("Rate limited (429), waiting 22s before retry...");
        await sleep(22000);
        try {
          parsed = await callGemini(0.3, primaryModel);
        } catch (e2) {
          if (errMessage(e2) === "__429__") {
            return new Response(JSON.stringify({ error: "Trop de requetes. Attends 30 secondes et reessaie." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          attempt1Error = errMessage(e2);
        }
      } else {
        attempt1Error = errMessage(e);
      }

      if (!parsed && attempt1Error) {
        const retryModel = attempt1Error === "__503__" ? fallbackModel : primaryModel;
        console.warn("Tentative 1 echouee (" + attempt1Error.slice(0, 120) + "), retry temp 0.1 model " + retryModel + "...");
        try {
          parsed = await callGemini(0.1, retryModel);
        } catch (e3) {
          if (errMessage(e3) === "__429__") {
            await sleep(22000);
            try {
              parsed = await callGemini(0.1, retryModel);
            } catch {
              return new Response(JSON.stringify({ error: "Trop de requetes. Attends 30 secondes et reessaie." }), {
                status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } else if (errMessage(e3) === "__503__") {
            return new Response(JSON.stringify({ error: "Les modeles Gemini sont surchargés. Reessaie dans quelques secondes." }), {
              status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          } else {
            const detail = attempt1Error.startsWith("__json_invalid__") ? "Reponse JSON invalide" : attempt1Error.slice(0, 120);
            return new Response(JSON.stringify({ error: "Generation echouee: " + detail }), {
              status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = errMessage(e, "Erreur inconnue");
    // 401 pour un refus d'authentification : le client doit pouvoir distinguer
    // « reconnecte-toi » d'une panne serveur.
    if (msg === "Non autorisé") {
      return new Response(JSON.stringify({ error: msg }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("ai-program error:", e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
