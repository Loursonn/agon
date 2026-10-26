import { supabase } from "@/integrations/supabase/client";

/**
 * Export des données personnelles (RGPD art. 15 et 20).
 *
 * Choix d'implémentation : l'export est fait depuis le client, avec le jeton
 * de session de l'utilisateur, et non par une Edge Function à clé
 * service_role. Conséquence directe : les politiques RLS s'appliquent, donc
 * l'export ne peut contenir que les lignes que cet utilisateur a le droit de
 * lire. Un export écrit avec la clé service_role devrait filtrer lui-même sur
 * `user_id`, et une seule table oubliée dans ce filtre livrerait les données
 * d'un autre athlète. Ici, l'erreur est structurellement impossible.
 *
 * L'art. 20 ne porte que sur les données « fournies par » la personne, mais
 * l'art. 15 couvre toutes les données la concernant. On exporte donc aussi ce
 * que le coach a produit à son sujet (programmes, retours, documents
 * assignés) : c'est plus favorable à la personne, et c'est ce que la politique
 * de confidentialité annonce.
 */

/** Tables dont la colonne de rattachement est `athlete_id`. */
const ATHLETE_TABLES = [
  "app_data",
  "athlete_life_events",
  "athlete_profile_items",
  "athlete_test_results",
  "competitions",
  "cycles",
  "day_themes",
  "doc_assignments",
  "doc_comments",
  "docs",
  "energy_session_assignments",
  "energy_sessions",
  "exercise_pr_logs",
  "habit_logs",
  "habits",
  "hyrox_race_plans",
  "hyrox_results",
  "macrocycles",
  "measurement_logs",
  "medical_attachments",
  "medical_entries",
  "medical_history",
  "performance_logs",
  "performance_notifications",
  "planning_blocks",
  "retours",
  "seasons",
  "test_results",
  "test_sessions",
  "weekly_retours",
  "workout_logs",
  "workout_rpe",
] as const;

/** Tables dont la colonne de rattachement est `user_id`. */
const USER_TABLES = [
  "app_update_reads",
  "citation_likes",
  "retours_votes",
  "roadmap_votes",
  "user_consents",
] as const;

export interface ExportResult {
  payload: unknown;
  /** Tables qui n'ont pu être lues, avec le motif. Jamais masqué à l'utilisateur. */
  failures: { table: string; reason: string }[];
  rowCount: number;
}

/*
  Le client Supabase est typé table par table : `from()` n'accepte qu'un nom
  littéral connu, et `eq()` qu'une colonne de cette table. Ici les deux sont
  des variables de boucle — l'intérêt de l'export est précisément d'être
  générique. Cette vue non typée isole la seule entorse nécessaire, au lieu de
  répéter 37 appels typés qu'il faudrait maintenir à la main.
*/
interface DynamicQuery {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

async function readTable(table: string, column: string, value: string) {
  const db = supabase as unknown as DynamicQuery;
  const { data, error } = await db.from(table).select("*").eq(column, value);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Construit l'archive JSON des données de l'utilisateur.
 *
 * Une table illisible n'interrompt pas l'export : elle est consignée dans
 * `failures` et reportée à l'utilisateur. Un export partiel annoncé comme tel
 * vaut mieux qu'un bouton qui échoue sans rien livrer.
 */
export async function buildDataExport(userId: string): Promise<ExportResult> {
  const tables: Record<string, unknown[]> = {};
  const failures: { table: string; reason: string }[] = [];
  let rowCount = 0;

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) failures.push({ table: "profiles", reason: profileErr.message });

  const jobs: { table: string; column: string }[] = [
    ...ATHLETE_TABLES.map((t) => ({ table: t, column: "athlete_id" })),
    ...USER_TABLES.map((t) => ({ table: t, column: "user_id" })),
  ];

  for (const job of jobs) {
    try {
      const rows = await readTable(job.table, job.column, userId);
      if (rows.length > 0) {
        tables[job.table] = rows;
        rowCount += rows.length;
      }
    } catch (e) {
      failures.push({ table: job.table, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const payload = {
    _export: {
      application: "Agon",
      generated_at: new Date().toISOString(),
      subject_id: userId,
      format: "JSON",
      basis: "RGPD art. 15 (droit d'accès) et art. 20 (portabilité)",
      note:
        "Export réalisé avec vos propres droits d'accès : il contient exactement les données que votre compte peut lire. " +
        "Les fichiers que vous avez déposés (documents médicaux, photos de tests) ne sont pas inclus dans ce JSON ; " +
        "leurs chemins figurent dans les tables correspondantes et ils restent téléchargeables depuis l'application.",
      tables_empty_omitted: true,
      tables_unreadable: failures,
    },
    profile: profile ?? null,
    ...tables,
  };

  return { payload, failures, rowCount };
}

/** Déclenche le téléchargement du JSON. Nom de fichier daté, pour l'archivage. */
export function downloadExport(payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agon-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Sans revoke, le blob reste en mémoire tant que l'onglet vit.
  URL.revokeObjectURL(url);
}
