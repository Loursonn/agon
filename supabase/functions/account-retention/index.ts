import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceRoleBearer } from "../_shared/auth.ts";
import { deleteAccount, type DeletionAdmin } from "../_shared/accountDeletion.ts";
import { runRetention, type RetentionCandidate, type RetentionNotice } from "../_shared/accountRetention.ts";

/**
 * Purge des comptes pré-créés jamais réclamés (6 mois) et des comptes inactifs
 * (3 ans, après préavis par e-mail). Revue juridique I6, AIPD A6.
 *
 * Réservée au cron `account-retention` (porteur = clé service_role).
 *
 * Deux verrous, tous deux posés par Hugo :
 *   - secret RETENTION_ENABLED=true (sinon : aperçu, nombres seulement) ;
 *   - corps `{"apply": true}` (le cron l'envoie ; un appel manuel sans lui
 *     ne fait que compter).
 * Préavis : RESEND_API_KEY + RETENTION_MAIL_FROM. Sans eux, aucun compte
 * inactif n'est prévenu, donc aucun n'est supprimé (les comptes pré-créés,
 * qui n'ont pas d'adresse réelle, si).
 *
 * Aucun identifiant ni e-mail dans les journaux ni dans la réponse : des nombres.
 * Détail et activation : docs/PURGE_COMPTES.md.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Envoi par l'API HTTP de Resend (sous-traitant à déclarer avant activation). */
function resendSender(apiKey: string, from: string) {
  return async (to: string, notice: RetentionNotice) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: notice.subject, text: notice.text }),
    });
    if (!res.ok) throw new Error(`envoi refusé (${res.status})`);
  };
}

serve(async (req) => {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!(await isServiceRoleBearer(bearer))) {
    return json({ error: "Non autorisé" }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const apply = Deno.env.get("RETENTION_ENABLED") === "true" && body?.apply === true;

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RETENTION_MAIL_FROM");
  const sendNotice = apiKey && from ? resendSender(apiKey, from) : null;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const report = await runRetention(
      {
        candidates: async () => {
          const { data, error } = await admin.rpc("account_retention_candidates");
          if (error) throw new Error(`liste : ${error.message}`);
          return (data ?? []) as RetentionCandidate[];
        },
        deleteAccount: (userId) => deleteAccount(admin as unknown as DeletionAdmin, userId, "retention"),
        emailOf: async (userId) => {
          const { data, error } = await admin.auth.admin.getUserById(userId);
          if (error) throw new Error("adresse illisible");
          return data.user?.email ?? null;
        },
        sendNotice,
        recordNotice: async (userId, notifiedAt, purgeAfter) => {
          const { error } = await admin.from("account_retention_notices").upsert({
            user_id: userId,
            notified_at: notifiedAt.toISOString(),
            purge_after: purgeAfter.toISOString(),
          });
          if (error) throw new Error("préavis non enregistré");
        },
        cancelNotice: async (userId) => {
          const { error } = await admin.from("account_retention_notices").delete().eq("user_id", userId);
          if (error) throw new Error("préavis non annulé");
        },
        now: () => new Date(),
      },
      { apply },
    );
    console.log("account-retention", JSON.stringify(report));
    return json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    console.error("account-retention", message);
    return json({ error: message }, 500);
  }
});
