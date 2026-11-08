import type { Query, QueryClient } from "@tanstack/react-query";
import {
  collectDocIds, collectProgDocIds, commentImagePath, docFilePath, extFor, groupFamilies, stripFiches,
} from "@/features/shared/types/fiches";
import type {
  Doc, DocAssignment, DocComment, DocFamily, FicheAttachment, FicheCategory,
} from "@/features/shared/types/fiches";
import type { AthleteModifications } from "@/features/shared/types/athlete";
import type { ProgSession } from "@/features/coach/components/programmation/types";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";
import { readAppData } from "./appData";

/**
 * Fiches (`docs`, `doc_assignments`, `doc_comments`, `doc_schedule`, bucket
 * privé `docs`).
 *
 * Droits : entièrement portés par la base (`can_read_doc`, `staff_can_edit_doc`,
 * `staff_can_write_bank`, RLS Storage). Ce module ne filtre rien de plus et
 * n'élargit rien : il lit ce que la RLS rend et écrit ce qu'elle accepte.
 *
 * - Lectures : lèvent en cas d'erreur.
 * - Un fichier n'est stocké qu'une fois ; une attribution = une ligne
 *   `doc_assignments`. Les attributions issues de la programmation passent par
 *   la RPC atomique `sync_doc_assignments` (jamais les 'manuel').
 * - Écritures fichier + ligne : la ligne échoue → le fichier est retiré ;
 *   fiche + attribution : l'attribution échoue → la fiche est retirée.
 * - Après toute écriture : `invalidateDocs`.
 */

export const DOCS_BUCKET = "docs";

// ── Clés React Query ─────────────────────────────────────────────────────────
// Mêmes valeurs que les anciennes clés `QK.docs*` (src/lib/queryKeys.ts) :
// les écrans pas encore migrés restent synchronisés.

export const docsKeys = {
  all: ["docs"] as const,
  bank: (coachId: string) => ["docs", "bank", coachId] as const,
  selfService: (coachId: string) => ["docs", "self-service", coachId] as const,
  byIds: (sortedIds: string) => ["docs", "by-ids", sortedIds] as const,
  one: (id: string) => ["docs", "one", id] as const,
  family: (originId: string) => ["docs", "family", originId] as const,
  athlete: (athleteId: string) => ["docs", "athlete", athleteId] as const,
  familyAssignments: (originId: string) => ["docs", "assignments", originId] as const,
  comments: (docId: string, athleteId: string) => ["docs", "comments", docId, athleteId] as const,
  athleteComments: (athleteId: string, limit: number) => ["docs", "comments", "all", athleteId, limit] as const,
  signedUrl: (path: string) => ["docs", "signed-url", path] as const,
  /** Fiches posées sur les jours du planning. */
  schedule: (athleteId: string) => ["doc-schedule", athleteId] as const,
  scheduleRange: (athleteId: string, start: string, end: string) => ["doc-schedule", athleteId, start, end] as const,
};

/**
 * Tout ce qui affiche des fiches. Les URL signées ne sont pas relues : elles ne
 * dépendent que du chemin, et un fichier remplacé change de chemin (relire
 * ferait clignoter les aperçus ouverts).
 */
export function invalidateDocs(qc: QueryClient, athleteId?: string | null): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({
      predicate: (q: Query) => q.queryKey[0] === "docs" && q.queryKey[1] !== "signed-url",
    }),
    qc.invalidateQueries({ queryKey: athleteId ? docsKeys.schedule(athleteId) : ["doc-schedule"] }),
  ]).then(() => undefined);
}

const asDocs = (rows: unknown) => (rows ?? []) as Doc[];
const familyFilter = (originId: string) => `id.eq.${originId},origin_id.eq.${originId}`;

// ── Lectures ─────────────────────────────────────────────────────────────────

/** Fiches de banque du coach (origines + variantes), archivées comprises. */
export async function listBankDocs(coachId: string): Promise<DocFamily[]> {
  const rows = unwrapRows(
    await db().from("docs").select("*").eq("coach_id", coachId).is("athlete_id", null)
      .order("title", { ascending: true }),
    "Lecture de la banque de fiches impossible",
  );
  return groupFamilies(asDocs(rows));
}

/**
 * Banque libre-service du coach de l'athlète. Les variantes d'une fiche
 * libre-service n'ont pas le flag : on garde les origines flaguées et leurs variantes.
 */
export async function listSelfServiceDocs(coachId: string): Promise<DocFamily[]> {
  const rows = unwrapRows(
    await db().from("docs").select("*").eq("coach_id", coachId).is("athlete_id", null).is("archived_at", null)
      .order("title", { ascending: true }),
    "Lecture des fiches en libre-service impossible",
  );
  return groupFamilies(asDocs(rows)).filter((f) => f.origin.is_self_service);
}

export async function getDoc(docId: string): Promise<Doc | null> {
  const row = unwrap(
    await db().from("docs").select("*").eq("id", docId).maybeSingle(),
    "Lecture de la fiche impossible",
  );
  return (row as unknown as Doc | null) ?? null;
}

/** Origine + variantes d'une famille (lisibles par l'utilisateur courant). */
export async function listFamilyDocs(originId: string): Promise<Doc[]> {
  const rows = asDocs(unwrapRows(
    await db().from("docs").select("*").or(familyFilter(originId)),
    "Lecture des variantes impossible",
  ));
  const fam = groupFamilies(rows)[0];
  return fam ? [fam.origin, ...fam.variants] : rows;
}

/** Fiches par ids ; les ids illisibles sont ignorés (absents du résultat). */
export async function getDocsByIds(ids: string[]): Promise<Record<string, Doc>> {
  if (ids.length === 0) return {};
  const rows = unwrapRows(
    await db().from("docs").select("*").in("id", ids),
    "Lecture des fiches impossible",
  );
  return Object.fromEntries(asDocs(rows).map((d) => [d.id, d]));
}

export interface AssignedDoc {
  doc: Doc;
  /** Sources cumulées (une fiche peut être attribuée par la programmation ET manuellement) */
  sources: DocAssignment["source"][];
  assignments: DocAssignment[];
  coachNote: string | null;
  /** Vue si au moins une attribution est vue */
  seenAt: string | null;
}

export interface AthleteDocs {
  assigned: AssignedDoc[];
  /** Fiches personnelles importées par le coach pour cet athlète */
  personal: Doc[];
  /** Fichiers ajoutés par l'athlète */
  uploads: Doc[];
}

/** Regroupe les attributions par fiche (pur). */
export function groupAssignments(rows: (DocAssignment & { docs: Doc | null })[]): AssignedDoc[] {
  const byDoc = new Map<string, AssignedDoc>();
  for (const row of rows) {
    if (!row.docs) continue;
    const { docs: doc, ...a } = row;
    const cur = byDoc.get(doc.id) ?? { doc, sources: [], assignments: [], coachNote: null, seenAt: null };
    cur.assignments.push(a);
    if (!cur.sources.includes(a.source)) cur.sources.push(a.source);
    if (a.coach_note && !cur.coachNote) cur.coachNote = a.coach_note;
    if (a.seen_at && (!cur.seenAt || a.seen_at > cur.seenAt)) cur.seenAt = a.seen_at;
    byDoc.set(doc.id, cur);
  }
  return [...byDoc.values()];
}

/** Fiches d'un athlète : attribuées (toutes sources) + personnelles + ajouts. */
export async function getAthleteDocs(athleteId: string): Promise<AthleteDocs> {
  const [asg, own] = await Promise.all([
    db().from("doc_assignments").select("*, docs(*)").eq("athlete_id", athleteId)
      .order("created_at", { ascending: false }),
    db().from("docs").select("*").eq("athlete_id", athleteId).order("created_at", { ascending: false }),
  ]);
  const assignments = unwrapRows(asg, "Lecture des fiches attribuées impossible");
  const ownDocs = asDocs(unwrapRows(own, "Lecture des fiches de l'athlète impossible"));
  return {
    assigned: groupAssignments(assignments as unknown as (DocAssignment & { docs: Doc | null })[]),
    personal: ownDocs.filter((d) => d.uploaded_by !== athleteId),
    uploads: ownDocs.filter((d) => d.uploaded_by === athleteId),
  };
}

export interface DocAssignmentWithFamily extends DocAssignment {
  doc_title: string;
  variant_label: string | null;
}

/** Coach : attributions d'une famille de fiches (qui l'a, qui l'a vue). */
export async function listFamilyAssignments(originId: string): Promise<DocAssignmentWithFamily[]> {
  const fam = unwrapRows(
    await db().from("docs").select("id, title, variant_label").or(familyFilter(originId)),
    "Lecture des variantes impossible",
  );
  const ids = fam.map((d) => d.id);
  if (ids.length === 0) return [];
  const rows = unwrapRows(
    await db().from("doc_assignments").select("*").in("doc_id", ids),
    "Lecture des attributions impossible",
  ) as unknown as DocAssignment[];
  const meta = new Map(fam.map((d) => [d.id, d]));
  return rows.map((a) => ({
    ...a,
    doc_title: meta.get(a.doc_id)?.title ?? "",
    variant_label: meta.get(a.doc_id)?.variant_label ?? null,
  }));
}

/** URL signée (bucket privé), valable 1 h. */
export async function docSignedUrl(filePath: string): Promise<string | null> {
  const data = unwrap(
    await db().storage.from(DOCS_BUCKET).createSignedUrl(filePath, 3600),
    "Ouverture du fichier impossible",
  );
  return data?.signedUrl ?? null;
}

// ── Écritures : fiches ───────────────────────────────────────────────────────

export interface UploadDocInput {
  /** Fichier prêt (format contrôlé et image compressée par l'appelant). */
  file: File;
  coachId: string;
  /** null = banque ; sinon fiche personnelle / ajout athlète */
  athleteId: string | null;
  uploadedBy: string;
  title: string;
  category?: FicheCategory;
  description?: string | null;
  tags?: string[];
  isSelfService?: boolean;
  /** Variante : id de la fiche d'origine */
  originId?: string | null;
  variantLabel?: string | null;
  variantOrder?: number;
  /**
   * Fiche de banque à attribuer aussitôt (attribution 'manuel') : dépôt d'un
   * pro dans la banque du coach principal pour un athlète.
   */
  assignTo?: string | null;
}

const kindFor = (mime: string) => (mime === "application/pdf" ? "pdf" : "image");

/** Retire une fiche qu'on vient de créer (fichier puis ligne), sans masquer l'erreur d'origine. */
async function undoUpload(id: string, path: string): Promise<void> {
  await db().storage.from(DOCS_BUCKET).remove([path]);
  await db().from("docs").delete().eq("id", id);
}

/**
 * Upload + insertion. Fiche personnelle importée par quelqu'un d'autre que
 * l'athlète (ou `assignTo`) : crée aussi l'attribution 'manuel'. Si
 * l'attribution échoue, la fiche est retirée (pas de fiche orpheline).
 */
export async function uploadDoc(input: UploadDocInput): Promise<Doc> {
  const { file } = input;
  const id = crypto.randomUUID();
  const path = docFilePath({
    coachId: input.coachId,
    athleteId: input.athleteId,
    docId: id,
    ext: extFor(file.type, file.name),
  });

  check(
    await db().storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type, upsert: false }),
    "Envoi du fichier impossible",
  );

  const res = await db().from("docs").insert({
    id,
    coach_id: input.coachId,
    athlete_id: input.athleteId,
    uploaded_by: input.uploadedBy,
    origin_id: input.originId ?? null,
    variant_label: input.variantLabel ?? null,
    variant_order: input.variantOrder ?? 0,
    title: input.title.trim() || "Fiche",
    description: input.description ?? null,
    category: input.category ?? "autre",
    tags: input.tags ?? [],
    kind: kindFor(file.type),
    file_path: path,
    file_size: file.size,
    mime_type: file.type,
    is_self_service: input.athleteId ? false : !!input.isSelfService,
  }).select("*").single();
  if (res.error) {
    await db().storage.from(DOCS_BUCKET).remove([path]);
    throw new ApiError("Enregistrement de la fiche impossible", res.error);
  }

  const assignee = input.assignTo
    ?? (input.athleteId && input.uploadedBy !== input.athleteId ? input.athleteId : null);
  if (assignee) {
    const a = await db().from("doc_assignments").insert({
      doc_id: id, athlete_id: assignee, assigned_by: input.uploadedBy, source: "manuel",
    });
    if (a.error) {
      await undoUpload(id, path);
      throw new ApiError("Attribution de la fiche impossible", a.error);
    }
  }
  return res.data as unknown as Doc;
}

export type DocPatch = Partial<Pick<Doc,
  "title" | "description" | "category" | "tags" | "is_self_service" | "variant_label" | "variant_order">>;

export async function updateDoc(id: string, patch: DocPatch): Promise<void> {
  check(await db().from("docs").update(patch).eq("id", id), "Enregistrement de la fiche impossible");
}

/** Archive / désarchive une famille (origine + variantes). */
export async function setFamilyArchived(originId: string, archived: boolean): Promise<void> {
  check(
    await db().from("docs").update({ archived_at: archived ? new Date().toISOString() : null })
      .or(familyFilter(originId)),
    "Archivage de la fiche impossible",
  );
}

/**
 * « Remplacer partout » : nouveau fichier sur la même ligne (nouveau nom :
 * évite les URL signées en cache sur l'ancien contenu), ancien objet supprimé.
 */
export async function replaceDocFile(doc: Doc, file: File): Promise<void> {
  const path = docFilePath({
    coachId: doc.coach_id,
    athleteId: doc.athlete_id,
    docId: `${doc.id}-${Date.now().toString(36)}`,
    ext: extFor(file.type, file.name),
  });
  check(
    await db().storage.from(DOCS_BUCKET).upload(path, file, { contentType: file.type, upsert: false }),
    "Envoi du fichier impossible",
  );
  const res = await db().from("docs").update({
    file_path: path, file_size: file.size, mime_type: file.type, kind: kindFor(file.type),
  }).eq("id", doc.id);
  if (res.error) {
    await db().storage.from(DOCS_BUCKET).remove([path]);
    throw new ApiError("Remplacement du fichier impossible", res.error);
  }
  // Ancien objet : nettoyage (la fiche pointe déjà sur le nouveau fichier).
  if (doc.file_path) {
    const rm = await db().storage.from(DOCS_BUCKET).remove([doc.file_path]);
    if (rm.error) console.warn("[fiches] ancien fichier non supprimé", rm.error.message);
  }
}

/**
 * Supprime une fiche (ajout de l'athlète, fiche du pro, fiche non référencée
 * du coach) : fichier d'abord (la RLS Storage exige que l'objet soit encore
 * lisible), puis la ligne.
 */
export async function deleteDoc(doc: Pick<Doc, "id" | "file_path">): Promise<void> {
  if (doc.file_path) check(await db().storage.from(DOCS_BUCKET).remove([doc.file_path]), "Suppression du fichier impossible");
  check(await db().from("docs").delete().eq("id", doc.id), "Suppression de la fiche impossible");
}

// ── Écritures : attributions ─────────────────────────────────────────────────

/** Attribution manuelle (avec note coach optionnelle). */
export async function assignDoc(p: {
  docId: string; athleteId: string; assignedBy: string; coachNote?: string | null;
}): Promise<void> {
  check(
    await db().from("doc_assignments").upsert(
      { doc_id: p.docId, athlete_id: p.athleteId, assigned_by: p.assignedBy, source: "manuel", coach_note: p.coachNote || null },
      { onConflict: "doc_id,athlete_id,source" },
    ),
    "Attribution de la fiche impossible",
  );
}

/** Retire l'attribution manuelle (jamais celles de la programmation). */
export async function unassignDoc(docId: string, athleteId: string): Promise<void> {
  check(
    await db().from("doc_assignments").delete()
      .eq("doc_id", docId).eq("athlete_id", athleteId).eq("source", "manuel"),
    "Retrait de la fiche impossible",
  );
}

/** Athlète : marque la fiche comme vue (RPC, seule écriture autorisée sur doc_assignments). */
export async function markDocSeen(docId: string): Promise<void> {
  check(await db().rpc("mark_doc_seen", { doc_uuid: docId }), "Lecture de la fiche non enregistrée");
}

// ── Synchronisation depuis la programmation ──────────────────────────────────
// asp:prog (app_data), les adaptations d'occurrence
// (workout_logs.athlete_modifications.coachOverride) et energy_sessions.fiches
// sont du JSON : la base ne suit pas les références seule. Après chaque
// sauvegarde, on recalcule les doc_id référencés et la RPC remplace, d'un bloc,
// les attributions de la source ('programme' ou 'energie').

export async function syncAssignments(athleteId: string, source: "programme" | "energie", docIds: string[]): Promise<void> {
  check(
    await db().rpc("sync_doc_assignments", { p_athlete: athleteId, p_source: source, p_doc_ids: docIds }),
    "Synchronisation des fiches impossible",
  );
}

/** doc_id référencés par les adaptations d'occurrence de l'athlète. */
async function overrideDocIds(athleteId: string): Promise<string[]> {
  const rows = unwrapRows(
    await db().from("workout_logs").select("athlete_modifications")
      .eq("athlete_id", athleteId)
      .not("athlete_modifications->coachOverride", "is", null),
    "Lecture des adaptations impossible",
  );
  const sessions = rows.map((r) => {
    const o = (r.athlete_modifications as AthleteModifications | null)?.coachOverride;
    return { fiches: o?.fiches, blocs: (o?.blocs ?? []) as { fiches?: FicheAttachment[] }[] };
  });
  return collectProgDocIds(sessions);
}

/**
 * Source 'programme' : séances + blocs de asp:prog (variantes par semaine
 * comprises) + adaptations d'occurrence. `sessions` absent → relu en base.
 */
export async function syncProgrammeAssignments(athleteId: string, sessions?: ProgSession[]): Promise<void> {
  const list = sessions ?? ((await readAppData<ProgSession[]>(athleteId, "asp:prog")).value ?? []);
  const ids = new Set([...collectProgDocIds(list), ...(await overrideDocIds(athleteId))]);
  await syncAssignments(athleteId, "programme", [...ids]);
}

/** Source 'energie' : fiches des séances énergie attribuées à l'athlète. */
export async function syncEnergyAssignments(athleteId: string): Promise<void> {
  const rows = unwrapRows(
    await db().from("energy_session_assignments").select("energy_sessions(fiches)").eq("athlete_id", athleteId),
    "Lecture des séances énergie impossible",
  );
  const lists = rows.map(
    (r) => (r.energy_sessions as unknown as { fiches?: FicheAttachment[] | null } | null)?.fiches,
  );
  await syncAssignments(athleteId, "energie", collectDocIds(lists));
}

/** Athlètes qui ont une séance énergie au planning. */
export async function listEnergySessionAthletes(energySessionId: string): Promise<string[]> {
  const rows = unwrapRows(
    await db().from("energy_session_assignments").select("athlete_id").eq("energy_session_id", energySessionId),
    "Lecture des athlètes de la séance impossible",
  );
  return [...new Set(rows.map((r) => r.athlete_id as string))];
}

/**
 * Duplication vers un autre athlète : retire les rattachements vers une fiche
 * personnelle d'un autre athlète (les fiches de banque suivent sans remapping).
 */
export async function stripForeignPersonalFiches<T extends ProgSession>(
  session: T,
  targetAthleteId: string,
): Promise<{ session: T; removed: number }> {
  const ids = collectProgDocIds([session]);
  if (ids.length === 0) return { session, removed: 0 };
  const rows = unwrapRows(
    await db().from("docs").select("id, athlete_id").in("id", ids),
    "Lecture des fiches impossible",
  );
  const foreign = new Set(rows.filter((d) => d.athlete_id && d.athlete_id !== targetAthleteId).map((d) => d.id));
  return stripFiches(session, (id) => foreign.has(id));
}

// ── Commentaires ─────────────────────────────────────────────────────────────

export async function listDocComments(docId: string, athleteId: string): Promise<DocComment[]> {
  const rows = unwrapRows(
    await db().from("doc_comments").select("*").eq("doc_id", docId).eq("athlete_id", athleteId)
      .order("created_at", { ascending: true }),
    "Lecture des commentaires impossible",
  );
  return rows as unknown as DocComment[];
}

/** Coach : derniers commentaires d'un athlète, toutes fiches confondues. */
export async function listAthleteDocComments(athleteId: string, limit = 30): Promise<DocComment[]> {
  const rows = unwrapRows(
    await db().from("doc_comments").select("*").eq("athlete_id", athleteId)
      .order("created_at", { ascending: false }).limit(limit),
    "Lecture des commentaires impossible",
  );
  return rows as unknown as DocComment[];
}

export interface AddDocCommentInput {
  docId: string;
  athleteId: string;
  authorId: string;
  /** Coach propriétaire du dossier Storage de l'athlète */
  coachId: string;
  body: string;
  /** Image prête (compressée par l'appelant). */
  image?: File | null;
}

/** Commentaire (image optionnelle, retirée si la ligne échoue). */
export async function addDocComment(input: AddDocCommentInput): Promise<void> {
  const id = crypto.randomUUID();
  let imagePath: string | null = null;
  if (input.image) {
    if (!input.image.type.startsWith("image/")) throw new Error("Image uniquement");
    imagePath = commentImagePath({
      coachId: input.coachId, athleteId: input.athleteId, commentId: id, ext: extFor(input.image.type, input.image.name),
    });
    check(
      await db().storage.from(DOCS_BUCKET).upload(imagePath, input.image, { contentType: input.image.type, upsert: false }),
      "Envoi de l'image impossible",
    );
  }
  const res = await db().from("doc_comments").insert({
    id, doc_id: input.docId, athlete_id: input.athleteId, author_id: input.authorId,
    body: input.body.trim(), image_path: imagePath,
  });
  if (res.error) {
    if (imagePath) await db().storage.from(DOCS_BUCKET).remove([imagePath]);
    throw new ApiError("Envoi du commentaire impossible", res.error);
  }
}

/** Image d'abord (la RLS Storage exige que l'objet soit encore lisible), puis la ligne. */
export async function deleteDocComment(c: Pick<DocComment, "id" | "image_path">): Promise<void> {
  if (c.image_path) check(await db().storage.from(DOCS_BUCKET).remove([c.image_path]), "Suppression de l'image impossible");
  check(await db().from("doc_comments").delete().eq("id", c.id), "Suppression du commentaire impossible");
}

// ── Fiches posées sur un jour du planning ────────────────────────────────────
// Lues par l'athlète, son coach et le staff (fiches: read) ; posées par un pro
// (fiches: write) ou le coach. La RLS tranche.

export interface ScheduledDoc {
  id: string;
  doc_id: string;
  athlete_id: string;
  date: string;
  added_by: string | null;
  note: string | null;
  doc: Pick<Doc, "id" | "title" | "category" | "file_path" | "mime_type" | "coach_id" | "uploaded_by"> | null;
}

export async function listDocSchedule(athleteId: string, range: { start: string; end: string }): Promise<ScheduledDoc[]> {
  const rows = unwrapRows(
    await db().from("doc_schedule")
      .select("id, doc_id, athlete_id, date, added_by, note, doc:docs(id, title, category, file_path, mime_type, coach_id, uploaded_by)")
      .eq("athlete_id", athleteId)
      .gte("date", range.start)
      .lte("date", range.end)
      .order("date")
      .order("created_at"),
    "Lecture des fiches du planning impossible",
  );
  return rows as unknown as ScheduledDoc[];
}

/** Pose une fiche sur des jours ; renvoie le nombre de jours posés. */
export async function scheduleDoc(p: { athleteId: string; docId: string; dates: string[]; note?: string }): Promise<number> {
  const n = unwrap(
    await db().rpc("schedule_doc", { p_athlete: p.athleteId, p_doc: p.docId, p_dates: p.dates, p_note: p.note ?? undefined }),
    "Fiche non posée sur le planning",
  );
  return (n as number | null) ?? 0;
}

/** Retire une fiche d'un jour. Rien retiré (RLS) → erreur lisible. */
export async function unscheduleDoc(id: string): Promise<void> {
  const rows = unwrapRows(
    await db().from("doc_schedule").delete().eq("id", id).select("id"),
    "Retrait de la fiche impossible",
  );
  if (!rows.length) throw new Error("Tu ne peux pas retirer cette fiche");
}
