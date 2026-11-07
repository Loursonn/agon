import type { QueryClient } from "@tanstack/react-query";
import type {
  DeclaredBy, MedicalAttachment, MedicalEntry, MedicalEntryInput, MedicalHistory, MedicalHistoryInput,
} from "@/features/shared/types/medical";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Médical : antécédents détaillés (`medical_entries` + `medical_attachments`,
 * fichiers dans le bucket privé `medical`) et fiche d'antécédents
 * (`medical_history`, une ligne par athlète).
 *
 * Les droits sont ceux de la RLS : l'athlète, ses coachs (`is_coach_of`, co-coach
 * compris) et le staff autorisé sur le domaine « medical ». Ce module ne les
 * élargit pas ; il pose seulement `declared_by` / `created_by` à la création.
 *
 * Ce que l'assistant IA du coach a le droit d'en lire : `@shared/domain/injuries`.
 */

export const MEDICAL_BUCKET = "medical";
export const MEDICAL_MAX_BYTES = 10 * 1024 * 1024;
export const MEDICAL_ACCEPT = "image/*,application/pdf";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const ENTRY_SELECT = "*, medical_attachments(*)";

export const medicalKeys = {
  all: (athleteId: string) => ["medical", athleteId] as const,
  entries: (athleteId: string) => ["medical", athleteId, "entries"] as const,
  history: (athleteId: string) => ["medical", athleteId, "history"] as const,
  signedUrls: (athleteId: string, paths: string[]) => ["medical", athleteId, "signedUrls", ...paths] as const,
};

async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getUser();
  return data.user?.id ?? null;
}

// ── Antécédents ──────────────────────────────────────────────────────────────

/** Antécédents d'un athlète, en cours d'abord puis le plus récent, avec leurs pièces jointes. */
export async function listEntries(athleteId: string): Promise<MedicalEntry[]> {
  const rows = unwrapRows(
    await db().from("medical_entries").select(ENTRY_SELECT)
      .eq("athlete_id", athleteId)
      .order("status", { ascending: false }) // en_cours avant gueri
      .order("date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    "Lecture des antécédents impossible",
  );
  return rows as unknown as MedicalEntry[];
}

/**
 * Crée (sans `id`) ou modifie un antécédent.
 * `declared_by` n'est pas un choix de formulaire : on sait qui saisit. Posé à la
 * création seulement, pour qu'une relecture du coach ne réécrive pas l'origine
 * d'une déclaration faite par l'athlète.
 */
export async function saveEntry(
  athleteId: string,
  { id, input }: { id?: string; input: MedicalEntryInput },
  opts: { asStaff?: boolean } = {},
): Promise<MedicalEntry> {
  const me = await currentUserId();
  const declared_by: DeclaredBy = me === athleteId ? "athlete" : opts.asStaff ? "staff" : "coach";
  const q = id
    ? db().from("medical_entries").update(input).eq("id", id)
    : db().from("medical_entries").insert({ ...input, athlete_id: athleteId, declared_by, created_by: me });
  const row = unwrap(await q.select(ENTRY_SELECT).single(), "Enregistrement de l'antécédent impossible");
  return row as unknown as MedicalEntry;
}

/** Supprime un antécédent : fichiers d'abord (la RLS Storage exige qu'ils soient encore rattachés), puis la ligne. */
export async function deleteEntry(entry: Pick<MedicalEntry, "id" | "medical_attachments">): Promise<void> {
  const paths = (entry.medical_attachments ?? []).map((a) => a.file_path);
  if (paths.length) check(await db().storage.from(MEDICAL_BUCKET).remove(paths), "Suppression des fichiers impossible");
  check(await db().from("medical_entries").delete().eq("id", entry.id), "Suppression de l'antécédent impossible");
}

// ── Pièces jointes ───────────────────────────────────────────────────────────

function extFor(type: string): string {
  if (type === "application/pdf") return "pdf";
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  return "jpg";
}

/**
 * Ajoute une photo (déjà compressée par l'appelant) ou un PDF. Le fichier est
 * retiré du bucket si la ligne ne peut pas être créée.
 * Messages d'erreur de format/poids : lisibles tels quels par l'athlète.
 */
export async function addAttachment(
  athleteId: string,
  entryId: string,
  file: Blob,
  fileName: string,
): Promise<void> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Format non pris en charge (JPEG, PNG, WebP ou PDF)");
  if (file.size > MEDICAL_MAX_BYTES) throw new Error("Fichier trop lourd (10 Mo max)");

  const id = crypto.randomUUID();
  const path = `${athleteId}/${entryId}/${id}.${extFor(file.type)}`;
  check(
    await db().storage.from(MEDICAL_BUCKET).upload(path, file, { contentType: file.type, upsert: false }),
    "Envoi du fichier impossible",
  );

  const res = await db().from("medical_attachments").insert({
    id, entry_id: entryId, athlete_id: athleteId, file_path: path,
    file_name: fileName, mime_type: file.type, file_size: file.size,
    created_by: await currentUserId(),
  });
  if (res.error) {
    await db().storage.from(MEDICAL_BUCKET).remove([path]);
    throw new ApiError("Enregistrement du fichier impossible", res.error);
  }
}

/** Retire une pièce jointe : le fichier, puis la ligne. */
export async function deleteAttachment(att: Pick<MedicalAttachment, "id" | "file_path">): Promise<void> {
  check(await db().storage.from(MEDICAL_BUCKET).remove([att.file_path]), "Suppression du fichier impossible");
  check(await db().from("medical_attachments").delete().eq("id", att.id), "Suppression du fichier impossible");
}

/** URLs signées (1 h) des pièces jointes, par chemin. */
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const data = unwrap(
    await db().storage.from(MEDICAL_BUCKET).createSignedUrls(paths, 3600),
    "Ouverture des fichiers impossible",
  );
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

// ── Fiche d'antécédents ──────────────────────────────────────────────────────

export async function getHistory(athleteId: string): Promise<MedicalHistory | null> {
  const row = unwrap(
    await db().from("medical_history").select("*").eq("athlete_id", athleteId).maybeSingle(),
    "Lecture des antécédents médicaux impossible",
  );
  return (row as unknown as MedicalHistory) ?? null;
}

export async function upsertHistory(
  athleteId: string,
  input: Omit<MedicalHistoryInput, "athlete_id">,
): Promise<MedicalHistory> {
  const payload = { ...input, athlete_id: athleteId } as never;
  const row = unwrap(
    await db().from("medical_history").upsert(payload, { onConflict: "athlete_id" }).select().single(),
    "Enregistrement des antécédents médicaux impossible",
  );
  return row as unknown as MedicalHistory;
}

// ── Cache ────────────────────────────────────────────────────────────────────

/** Antécédents et fiche d'un athlète (badges « blessure active », Retours, profil). */
export function invalidateMedical(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: medicalKeys.entries(athleteId) }),
    qc.invalidateQueries({ queryKey: medicalKeys.history(athleteId) }),
  ]).then(() => undefined);
}
