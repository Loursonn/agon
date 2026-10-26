// athlete-insights — 3-4 phrases de synthèse sur les tendances d'un athlète (Mon profil).
// Reçoit uniquement des agrégats chiffrés (aucune donnée d'identité). Appelé 1×/jour/athlète max (cache client).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { hasConsent, requireUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    /*
      Identité vérifiée avant toute autre chose, et notamment avant le moindre
      appel à Gemini : sans cela la fonction était ouverte à l'internet et son
      quota consommable par n'importe qui.
    */
    const user = await requireUser(req);

    // Le consentement au traitement par IA doit avoir un effet côté serveur,
    // sinon la case décochée dans l'interface ne protège de rien.
    if (!(await hasConsent(user.id, "ai_programming"))) {
      return json({ error: "consentement_ia_absent", insights: [] }, 403);
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 500);

    const stats = await req.json();
    const prompt = `Tu es un préparateur physique bienveillant. Voici les données agrégées d'un athlète sur les ${stats?.periode_jours ?? 30} derniers jours, comparées à la période précédente (JSON) :
${JSON.stringify(stats).slice(0, 4000)}

Rédige 3 ou 4 phrases courtes (max 140 caractères chacune), en français, en tutoyant l'athlète.
- Chaque phrase s'appuie sur un chiffre précis des données.
- Priorise : progrès marquants, signaux d'alerte (sommeil, fatigue, stress), assiduité, poids vs objectif.
- Ton motivant, concret, sans jargon médical, sans inventer de données absentes ou nulles.
Réponds uniquement en JSON : {"insights": ["...", "..."]}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      },
    );
    if (!res.ok) {
      console.error("Gemini error:", res.status, (await res.text()).slice(0, 300));
      return json({ error: "gemini_" + res.status }, 502);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(text);
    const insights = Array.isArray(parsed?.insights)
      ? parsed.insights.filter((s: unknown) => typeof s === "string").slice(0, 4)
      : [];
    return json({ insights });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Un refus d'authentification doit répondre 401, pas 500 : le client doit
    // pouvoir distinguer « reconnecte-toi » de « le serveur est en panne ».
    if (msg === "Non autorisé") return json({ error: msg }, 401);
    console.error("athlete-insights:", e);
    return json({ error: msg }, 500);
  }
});
