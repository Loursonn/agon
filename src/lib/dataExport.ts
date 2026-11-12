import { readOwnRows } from "@/api/account";
import { getProfile } from "@/api/profile";
import { tableMissing } from "@/api/wellness";
import { providerAttribution } from "@/lib/activityDisplay";

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

/**
 * Une lecture de l'export : les lignes de `table` dont `column` vaut l'id de
 * l'utilisateur, avec ses droits (RLS). `select` liste les colonnes quand il
 * faut en écarter (secrets) ou embarquer une table enfant ; un embarquement
 * refusé est rejoué en `*` pour ne pas perdre la table parente.
 */
export interface ExportJob {
  table: string;
  column: string;
  select?: string;
}

/** Invitations staff sans `token` : le lien d'invitation est un secret. */
const STAFF_INVITATION_COLUMNS =
  "id, athlete_id, email, profession, permissions, can_edit_coach_content, invited_by, invited_by_role, used_at, used_by, expires_at, created_at";

const job = (table: string, column: string, select?: string): ExportJob => ({ table, column, select });

/**
 * Inventaire des tables contenant des données d'un utilisateur (schéma de
 * prod du 2026-11-08 : toutes les colonnes qui pointent vers `profiles` ou
 * `auth.users`). Une table lue par plusieurs colonnes (athlète d'un côté,
 * coach / staff de l'autre) est fusionnée sous un seul nom dans l'archive.
 *
 * Volontairement absentes :
 *  - secrets et état technique : `athlete_claims` (jeton du lien de première
 *    connexion), `provider_oauth_states` (vérificateur PKCE), `provider_tokens`
 *    (jetons, dans le Vault), `coach_api_rate` (compteur), `provider_fit_quota` ;
 *  - bibliothèques sans auteur et contenus de l'application (exercices
 *    officiels, grilles Hyrox, nouveautés, roadmap).
 * La nutrition et le wellness vivent dans `app_data` (clés `asp:*`), exporté
 * en entier.
 */
/** Tables de la migration santé (20261110100000), absentes tant qu'elle n'est pas appliquée. */
const OPTIONAL_TABLES = new Set(["wellness_entries", "body_weight_logs", "body_weight_milestones", "body_weight_goals"]);

export const EXPORT_JOBS: readonly ExportJob[] = [
  // ── Athlète : tout ce qui le concerne (`athlete_id`) ─────────────────────
  job("app_data", "athlete_id"),
  // Santé (copie relationnelle d'app_data, migration 20261110100000) : lue
  // seulement si la table existe déjà en prod.
  job("wellness_entries", "athlete_id"),
  job("body_weight_logs", "athlete_id"),
  job("body_weight_milestones", "athlete_id"),
  job("body_weight_goals", "athlete_id"),
  job("athlete_co_coaches", "athlete_id"),
  job("athlete_life_events", "athlete_id"),
  job("athlete_profile_items", "athlete_id"),
  job("athlete_staff", "athlete_id"),
  job("athlete_test_results", "athlete_id", "*, athlete_test_values(*)"),
  job("competitions", "athlete_id"),
  job("cycles", "athlete_id", "*, microcycles(*)"),
  job("day_themes", "athlete_id"),
  job("doc_assignments", "athlete_id"),
  job("doc_comments", "athlete_id"),
  job("doc_schedule", "athlete_id"),
  job("docs", "athlete_id"),
  job("energy_session_assignments", "athlete_id"),
  job("energy_sessions", "athlete_id"),
  job("exercise_pr_logs", "athlete_id"),
  job("habit_logs", "athlete_id"),
  job("habits", "athlete_id"),
  job("hyrox_race_plans", "athlete_id"),
  job("hyrox_results", "athlete_id"),
  job("hyrox_test_analyses", "athlete_id", "*, hyrox_test_axes_drafts(*)"),
  job("macrocycles", "athlete_id", "*, mesocycles(*)"),
  job("measurement_logs", "athlete_id"),
  job("medical_attachments", "athlete_id"),
  job("medical_entries", "athlete_id"),
  job("medical_history", "athlete_id"),
  job("performance_logs", "athlete_id"),
  job("performance_notifications", "athlete_id"),
  job("planning_blocks", "athlete_id"),
  // Montres connectées : état des connexions (aucun jeton : ils sont dans
  // `provider_tokens`, illisible côté client, et dans le Vault), activités et
  // données quotidiennes, avec la mention de provenance « Garmin [appareil] ».
  job("provider_activities", "athlete_id"),
  // Détail des activités : séries seconde par seconde, tours, séries de muscu.
  job("activity_laps", "athlete_id"),
  job("activity_sets", "athlete_id"),
  job("activity_streams", "athlete_id"),
  job("activity_zone_summaries", "athlete_id"),
  job("hr_zone_models", "athlete_id"),
  job(
    "provider_connections", "athlete_id",
    "id, athlete_id, provider, status, external_user_id, api_host, granted_scopes, connected_at, last_sync_at, synced_through, last_error, updated_at",
  ),
  job("provider_dailies", "athlete_id"),
  // Tout ce que Garmin a envoyé, tel quel (échantillons et .FIT : chemins
  // vers le bucket privé `provider-raw`, lisible par l'athlète lui-même).
  job("provider_raw_records", "athlete_id"),
  job("retours", "athlete_id"),
  job("seasons", "athlete_id"),
  job("staff_invitations", "athlete_id", STAFF_INVITATION_COLUMNS),
  job("test_results", "athlete_id"),
  job("test_sessions", "athlete_id"),
  job("weekly_retours", "athlete_id"),
  job("workout_logs", "athlete_id", "*, workout_exercise_comments(*)"),
  job("workout_rpe", "athlete_id"),

  // ── Compte (`user_id`) ───────────────────────────────────────────────────
  job("app_update_reads", "user_id"),
  job("citation_likes", "user_id"),
  job("retours_votes", "user_id"),
  job("roadmap_votes", "user_id"),
  job("user_consents", "user_id"),

  // ── Ce que la personne a écrit ailleurs ──────────────────────────────────
  job("app_feedback", "author_id"),
  job("doc_comments", "author_id"),

  // ── Co-coach et staff : les liens vus de l'autre côté ────────────────────
  job("athlete_co_coaches", "co_coach_id"),
  job("athlete_staff", "staff_id"),
  job("staff_invitations", "invited_by", STAFF_INVITATION_COLUMNS),
  job("staff_invitations", "used_by", STAFF_INVITATION_COLUMNS),

  // ── Coach : invitations, assistant IA, fiches et bibliothèques ───────────
  job("invitations", "coach_id", "id, coach_id, email, used_at, created_at"),
  // Jamais la clé ni son empreinte : nom et dates seulement.
  job("coach_api_keys", "coach_id", "id, coach_id, name, created_at, last_used_at, revoked_at"),
  job("coach_api_drafts", "coach_id"),
  job("coach_api_access_log", "coach_id"),
  // Fiches : métadonnées et chemin du fichier (`file_path`), pas le fichier.
  job("docs", "coach_id"),
  job("physical_qualities", "coach_id"),
  job("specific_blocks", "coach_id"),
  job("specific_sports", "coach_id"),
  job("training_methods", "created_by"),
  job("exercises", "created_by"),
  job("test_definitions", "created_by", "*, test_variables(*)"),
];

/**
 * Colonnes qui ne sortent jamais, même si une lecture `*` les ramène (filet de
 * sécurité : un `select` explicite les écarte déjà).
 */
const SECRET_COLUMNS = new Set([
  "key_hash", "token", "code_verifier", "sync_lock_token", "access_secret_id", "refresh_secret_id",
]);

/** Retire les colonnes secrètes, y compris dans les tables embarquées. */
export function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_COLUMNS.has(k)) continue;
    out[k] = v && typeof v === "object" ? stripSecrets(v) : v;
  }
  return out;
}

/** Fusionne deux lectures d'une même table (par `id`, sinon par contenu). */
function mergeRows(a: unknown[], b: unknown[]): unknown[] {
  const keyOf = (r: unknown) => {
    const id = r && typeof r === "object" ? (r as Record<string, unknown>).id : undefined;
    return typeof id === "string" || typeof id === "number" ? `id:${id}` : `json:${JSON.stringify(r)}`;
  };
  const seen = new Set(a.map(keyOf));
  return [...a, ...b.filter((r) => !seen.has(keyOf(r)))];
}

export interface ExportResult {
  payload: unknown;
  /** Tables qui n'ont pu être lues, avec le motif. Jamais masqué à l'utilisateur. */
  failures: { table: string; reason: string }[];
  rowCount: number;
}

/**
 * Mention de provenance sur chaque ligne de montre exportée.
 *
 * Les conditions Garmin exigent l'attribution « Garmin [modèle] » dans les
 * exports aussi, pas seulement à l'écran : un fichier transmis à un tiers ne
 * doit pas présenter une donnée Garmin comme anonyme. La colonne `source` le
 * dit pour une machine ; `attribution` le dit pour une personne.
 */
export function withAttribution(table: string, rows: unknown[]): unknown[] {
  // Toute table de données de montre : provider_* (sauf connexions) et activity_*.
  const watchData = (table.startsWith("provider_") && table !== "provider_connections") || table.startsWith("activity_");
  if (!watchData) return rows;
  return rows.map((r) => {
    if (!r || typeof r !== "object") return r;
    const row = r as Record<string, unknown>;
    if (typeof row.source !== "string") return row;
    const payload = row.payload && typeof row.payload === "object" ? (row.payload as Record<string, unknown>) : {};
    const device = typeof row.device_name === "string"
      ? row.device_name
      : typeof payload.deviceName === "string" ? payload.deviceName : null;
    return { attribution: providerAttribution(row.source, device), ...row };
  });
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

  let profile: unknown = null;
  try {
    profile = await getProfile(userId);
  } catch (e) {
    failures.push({ table: "profiles", reason: e instanceof Error ? e.message : String(e) });
  }

  for (const j of EXPORT_JOBS) {
    let rows: unknown[];
    try {
      rows = await readOwnRows(j.table, j.column, userId, j.select);
    } catch (e) {
      // Table pas encore créée en prod (migration à venir) : rien à exporter,
      // pas un échec.
      if (OPTIONAL_TABLES.has(j.table) && tableMissing(e)) continue;
      const reason = e instanceof Error ? e.message : String(e);
      // Embarquement refusé : la table parente seule, l'échec reste signalé.
      if (j.select?.includes("(")) {
        try {
          rows = await readOwnRows(j.table, j.column, userId);
          failures.push({ table: `${j.table} (${j.select})`, reason });
        } catch (e2) {
          failures.push({ table: `${j.table}.${j.column}`, reason: e2 instanceof Error ? e2.message : String(e2) });
          continue;
        }
      } else {
        failures.push({ table: `${j.table}.${j.column}`, reason });
        continue;
      }
    }
    if (rows.length === 0) continue;
    const clean = withAttribution(j.table, stripSecrets(rows) as unknown[]);
    tables[j.table] = mergeRows(tables[j.table] ?? [], clean);
  }
  const rowCount = Object.values(tables).reduce((n, rows) => n + rows.length, 0);

  const payload = {
    _export: {
      application: "Agon",
      generated_at: new Date().toISOString(),
      subject_id: userId,
      format: "JSON",
      basis: "RGPD art. 15 (droit d'accès) et art. 20 (portabilité)",
      note:
        "Export réalisé avec vos propres droits d'accès : il contient exactement les données que votre compte peut lire. " +
        "Les fichiers (documents médicaux, fiches, photos de tests) ne sont pas inclus dans ce JSON ; " +
        "leurs chemins figurent dans les tables correspondantes (file_path, image_path) et ils restent téléchargeables depuis l'application. " +
        "Les secrets (clés d'API, jetons de liens et de montres) ne sont jamais exportés.",
      tables_empty_omitted: true,
      tables_unreadable: failures,
    },
    // Données du compte, dont la date de naissance (`birth_date`).
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
