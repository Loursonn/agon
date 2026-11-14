// athlete-insights — 3-4 phrases de synthèse sur les tendances d'un athlète (Mon profil).
// Reçoit uniquement des agrégats chiffrés (aucune donnée d'identité). Appelé 1×/jour/athlète max (cache client).
// Modèle : Claude (Anthropic), via l'API — Anthropic est sous-traitant d'Agon pour ce traitement.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { hasConsent, requireUser } from "../_shared/auth.ts";
import { sanitizeTrendStats } from "../_shared/aiGuard.ts";
import { AI_ASSISTANT_SINCE } from "../_shared/coachApiOps.ts";
import {
  buildInsightsUserMessage,
  INSIGHTS_MODEL,
  INSIGHTS_SCHEMA,
  INSIGHTS_SYSTEM,
  parseInsights,
} from "../_shared/insightsAi.ts";

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
      appel au modèle : sans cela la fonction était ouverte à l'internet et
      son quota consommable par n'importe qui.
    */
    const user = await requireUser(req);

    /*
      Le consentement au traitement par IA doit avoir un effet côté serveur,
      sinon la case décochée dans l'interface ne protège de rien. Et il doit
      avoir été donné sous un texte qui nomme Claude (Anthropic) : celui du
      30 octobre 2026 ou plus récent. Un accord plus ancien ne nommait que
      Google Gemini et ne vaut pas pour ce destinataire.
    */
    if (!(await hasConsent(user.id, "ai_programming", AI_ASSISTANT_SINCE))) {
      return json({ error: "consentement_ia_absent", insights: [] }, 403);
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

    /*
      Le corps de requête est filtré avant d'approcher le prompt. Il était
      jusqu'ici interpolé tel quel : c'est le client qui décidait du contenu
      envoyé au modèle, donc n'importe quel champ et jusqu'à 4 000 caractères de
      texte libre, à notre charge et dans les instructions du modèle.

      Conséquence voulue pour la suite : quand les données de montre
      arriveront, elles ne pourront entrer dans ce prompt qu'en ajoutant
      explicitement un champ à `SafeTrendStats` — l'occasion forcée de vérifier
      `aiEligibleSources` pour l'athlète concerné.
    */
    const stats = sanitizeTrendStats(await req.json());

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 2, timeout: 30_000 });
    let response;
    try {
      response = await client.beta.messages.create({
        model: INSIGHTS_MODEL,
        max_tokens: 4000,
        system: INSIGHTS_SYSTEM,
        messages: [{ role: "user", content: buildInsightsUserMessage(stats) }],
        // Tâche courte : peu de réflexion suffit.
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: INSIGHTS_SCHEMA },
        },
        // Si le modèle décline par erreur (filtre de sécurité trop prudent),
        // l'API relance la même demande sur un autre modèle Claude.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        console.error("Claude error:", err.status, err.message.slice(0, 300));
        return json({ error: "ia_" + (err.status ?? "reseau") }, 502);
      }
      throw err;
    }

    // Refus du modèle : aucune phrase, le client retombe sur ses règles.
    if (response.stop_reason === "refusal") {
      console.warn("athlete-insights: refus", response.stop_details?.category ?? "");
      return json({ insights: [] });
    }
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const insights = parseInsights(text);
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
