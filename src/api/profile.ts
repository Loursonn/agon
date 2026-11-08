import type { QueryClient } from "@tanstack/react-query";
import { isIsoDay, localIsoDay, type IsoDay } from "@shared/domain/dates";
import type { WellnessHistory } from "@shared/domain/wellness";
import {
  ALL_MEASUREMENT_KEYS,
  MEASUREMENT_BUCKET,
  type MeasurementKey,
  type MeasurementLog,
  type MeasurementPhotos,
  type PhotoSlot,
} from "@/features/shared/types/measurements";
import { ARTICULATIONS, type TestCategory } from "@/features/shared/types/tests";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";

/**
 * Profil d'un athlète : fiche (`profiles`), mensurations (`measurement_logs`
 * + photos du bucket `test-media`), profil articulaire (résultats des tests
 * « bilan articulaire »), éléments de profil (`athlete_profile_items`), poids
 * (`app_data` : `asp:wlog`, `asp:wmile`, `asp:bw`), tendances (Mon profil).
 *
 * Rattachement au coach, inscription, roster : `account.ts`. Le `coach_id`
 * n'est jamais écrit ici (`updateAthleteProfile` ne l'accepte pas).
 */

// ── Clés React Query ──────────────────────────────────────────────────────────

export const profileKeys = {
  all: (aid: string) => ["profile", aid] as const,
  measurements: (aid: string) => ["profile", aid, "measurements"] as const,
  /** URLs signées des photos : pas d'athlète dans la clé (liste de chemins). */
  photoUrls: (paths: readonly string[]) => ["profile", "_photos", [...paths].sort().join(",")] as const,
  items: (aid: string) => ["profile", aid, "items"] as const,
  /**
   * Ancienne valeur gardée : le domaine « tests » (`useAthleteTests`,
   * `useCoachTestQueue`) invalide `['articularProfile', aid]` après une saisie.
   * À passer sous `['profile', aid, …]` quand il appellera `invalidateProfile`.
   */
  articular: (aid: string) => ["articularProfile", aid] as const,
  /** Ancienne valeur gardée : `invalidateWorkouts` vise le préfixe `athlete-trend-sessions`. */
  trendSessions: (aid: string, from: IsoDay, to: IsoDay) => ["athlete-trend-sessions", aid, from, to] as const,
  /** Ancienne valeur gardée : `invalidateWellness` / `invalidateWorkouts` visent `athlete-insights`. */
  insights: (aid: string, day: IsoDay, days: number) => ["athlete-insights", aid, day, days] as const,
};

/** Tout ce qui dépend du profil d'un athlète. */
export function invalidateProfile(qc: QueryClient, athleteId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: profileKeys.all(athleteId) }),
    qc.invalidateQueries({ queryKey: ["articularProfile", athleteId] }),
    qc.invalidateQueries({ queryKey: ["athlete-trend-sessions", athleteId] }),
    qc.invalidateQueries({ queryKey: ["athlete-insights", athleteId] }),
  ]).then(() => undefined);
}

// ── Fiche (`profiles`) ────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  role: "coach" | "athlete" | "coach_athlete" | "staff";
  full_name: string;
  coach_id: string | null;
  coach_code: string | null;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  birth_date: string | null;
  height_cm: number | null;
  gender: "male" | "female" | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  base_metabolism: number | null;
  is_admin: boolean;
  is_certified_coach: boolean;
  is_hyrox_athlete: boolean;
  /** Lien Calendly du coach pour le point hebdo (null = aucune réservation proposée) */
  booking_url: string | null;
  /** Métier par défaut d'un professionnel (staff). Les droits suivent le métier du lien. */
  profession?: string | null;
  /** true = masqué par son coach (liste, sélecteur, accueil). Sans effet côté athlète. */
  coach_hidden?: boolean;
  /** true = compte pré-créé par le coach, pas encore réclamé par l'athlète */
  is_pending?: boolean;
  /** Côté coach : je suis co-coach de cet athlète (son coach référent est coach_id) */
  co_coached_by_me?: boolean;
  /** Côté coach : id du co-coach de l'athlète (null = un seul coach) */
  co_coach_id?: string | null;
}

/** Champs de la fiche modifiables depuis l'app (jamais rôle, coach, drapeaux). */
export interface AthleteProfileFields {
  first_name: string;
  last_name: string;
  age: number | null;
  birth_date: string | null;
  height_cm: number | null;
  gender: "male" | "female" | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
  base_metabolism: number | null;
  is_hyrox_athlete?: boolean;
}

/** Fiche d'un utilisateur ; null s'il n'en a pas (encore) ou si la RLS la cache. Lève si la lecture échoue. */
export async function getProfile(id: string): Promise<Profile | null> {
  const row = unwrap(
    await db().from("profiles").select("*").eq("id", id).maybeSingle(),
    "Lecture du profil impossible",
  );
  return (row as unknown as Profile | null) ?? null;
}

/** Plusieurs fiches (roster du coach). */
export async function getProfiles(ids: readonly string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  const rows = unwrapRows(
    await db().from("profiles").select("*").in("id", [...ids]),
    "Lecture des profils impossible",
  );
  return rows as unknown as Profile[];
}

/** Met à jour la fiche ; `full_name` suit prénom + nom (s'il y en a un). */
export async function updateAthleteProfile(athleteId: string, fields: AthleteProfileFields): Promise<void> {
  const full_name = [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim();
  check(
    await db().from("profiles").update({ ...fields, ...(full_name ? { full_name } : {}) }).eq("id", athleteId),
    "Enregistrement du profil impossible",
  );
}

/** Nom affiché d'un coach (prénom + nom, sinon nom complet, sinon « Coach ») ; null si invisible. */
export async function getCoachName(coachId: string): Promise<string | null> {
  const row = unwrap(
    await db().from("profiles").select("full_name, first_name, last_name").eq("id", coachId).maybeSingle(),
    "Lecture du coach impossible",
  );
  if (!row) return null;
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.full_name || "Coach";
}

// ── Mensurations ──────────────────────────────────────────────────────────────

export interface NewMeasurement {
  weight_kg?: number;
  measurements: Partial<Record<MeasurementKey, number>>;
  /** Fichiers déjà compressés (`compressImage`) par l'appelant. */
  photoFiles: Partial<Record<PhotoSlot, File>>;
  /** Jour local de la saisie ; défaut : aujourd'hui (jamais `toISOString`, qui datait la veille après minuit). */
  day?: IsoDay;
}

export interface MeasurementUpdate {
  id: string;
  existingPhotos: MeasurementPhotos;
  weight_kg?: number;
  measurements: Partial<Record<MeasurementKey, number>>;
  /** Fichiers déjà compressés par l'appelant. */
  newPhotoFiles: Partial<Record<PhotoSlot, File>>;
  removedSlots: PhotoSlot[];
}

const extOf = (file: File) => (file.name.split(".").pop() || "jpg").toLowerCase();
const photos = () => db().storage.from(MEASUREMENT_BUCKET);

/** Saisies, la plus récente d'abord. */
export async function getMeasurementLogs(athleteId: string): Promise<MeasurementLog[]> {
  const rows = unwrapRows(
    await db().from("measurement_logs").select("*").eq("athlete_id", athleteId).order("date", { ascending: false }),
    "Lecture des mensurations impossible",
  );
  return rows as unknown as MeasurementLog[];
}

/**
 * Nouvelle saisie : ligne d'abord (pour l'id), puis photos sous
 * `{athlete}/mensurations/{log}/{slot}.{ext}`, puis chemins. Si une photo
 * échoue, la ligne est retirée. Enfin, les mesures biométriques planifiées par
 * le coach (échues ou du jour) passent « faites ».
 */
export async function createMeasurementLog(athleteId: string, input: NewMeasurement): Promise<MeasurementLog> {
  const day = input.day ?? localIsoDay();
  if (!isIsoDay(day)) throw new ApiError("Jour de mensuration invalide", { message: String(day) });
  const row = unwrap(
    await db().from("measurement_logs").insert({
      athlete_id: athleteId,
      date: day,
      weight_kg: input.weight_kg ?? null,
      ...input.measurements,
      photos: {},
    }).select().single(),
    "Enregistrement des mensurations impossible",
  ) as unknown as MeasurementLog;

  const saved: MeasurementPhotos = {};
  for (const [slot, file] of Object.entries(input.photoFiles) as [PhotoSlot, File | undefined][]) {
    if (!file) continue;
    const path = `${athleteId}/mensurations/${row.id}/${slot}.${extOf(file)}`;
    const up = await photos().upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) {
      await db().from("measurement_logs").delete().eq("id", row.id);
      throw new ApiError("Envoi de la photo impossible", up.error);
    }
    saved[slot] = path;
  }

  if (Object.keys(saved).length > 0) {
    check(
      await db().from("measurement_logs").update({ photos: saved }).eq("id", row.id),
      "Enregistrement des photos impossible",
    );
  }

  // Comme avant : un échec ici ne fait pas échouer la saisie (le coach peut
  // cocher la mesure à la main).
  await db().from("test_sessions").update({ completed: true })
    .eq("athlete_id", athleteId).eq("type", "biometric").eq("completed", false).lte("date", day);

  return { ...row, photos: Object.keys(saved).length > 0 ? saved : row.photos };
}

/** Modifie une saisie : photos retirées / remplacées, toutes les mesures (non saisies → null). */
export async function updateMeasurementLog(athleteId: string, input: MeasurementUpdate): Promise<void> {
  const next: MeasurementPhotos = { ...input.existingPhotos };
  const toRemove: string[] = [];
  for (const slot of input.removedSlots) {
    if (next[slot]) { toRemove.push(next[slot]!); delete next[slot]; }
  }
  for (const [slot, file] of Object.entries(input.newPhotoFiles) as [PhotoSlot, File | undefined][]) {
    if (!file) continue;
    // Nom unique → toujours un INSERT (le bucket n'a pas de policy UPDATE), l'ancien est supprimé ensuite.
    const path = `${athleteId}/mensurations/${input.id}/${slot}_${Date.now()}.${extOf(file)}`;
    const up = await photos().upload(path, file, { upsert: false, contentType: file.type });
    if (up.error) throw new ApiError("Envoi de la photo impossible", up.error);
    const old = next[slot];
    if (old && old !== path) toRemove.push(old);
    next[slot] = path;
  }
  // Fichiers orphelins sans conséquence pour l'athlète : échec ignoré, comme avant.
  if (toRemove.length > 0) await photos().remove(toRemove);

  const fields: Record<string, number | null> = {};
  for (const k of ALL_MEASUREMENT_KEYS) fields[k] = input.measurements[k] ?? null;
  check(
    await db().from("measurement_logs").update({ weight_kg: input.weight_kg ?? null, ...fields, photos: next }).eq("id", input.id),
    "Modification des mensurations impossible",
  );
}

/** Supprime une saisie et ses photos. */
export async function deleteMeasurementLog(log: Pick<MeasurementLog, "id" | "photos">): Promise<void> {
  const paths = Object.values(log.photos ?? {}).filter(Boolean) as string[];
  if (paths.length > 0) await photos().remove(paths);
  check(await db().from("measurement_logs").delete().eq("id", log.id), "Suppression des mensurations impossible");
}

/** URLs signées (1 h) des photos, par chemin. */
export async function getMeasurementPhotoUrls(paths: readonly string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const res = await photos().createSignedUrls([...paths].sort(), 3600);
  if (res.error) throw new ApiError("Lecture des photos impossible", res.error);
  const out: Record<string, string> = {};
  for (const item of res.data ?? []) if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  return out;
}

// ── Profil articulaire ────────────────────────────────────────────────────────

export interface ScorePoint { date: string; score: number | null }
export interface ArticularAction {
  testId: string;
  /** Nom de l'action (sans le préfixe articulation). */
  action: string;
  /** Dernière note /5. */
  score: number | null;
  date: string | null;
  mediaUrl: string | null;
  /** Toutes les saisies, plus récente en premier. */
  history: ScorePoint[];
}
export interface ArticularGroup {
  articulation: string;
  items: ArticularAction[];
}

export interface ArticularDef { id: string; name: string; articulation: string; media_url: string | null }
export interface ArticularResult { test_definition_id: string; performed_at: string; athlete_test_values: { value: number }[] | null }

function stripJoint(name: string, joint: string): string {
  const prefix = `${joint} — `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/** Regroupe par articulation (ordre connu d'abord, puis alphabétique). `results` : plus récent d'abord. */
export function groupArticular(defs: ArticularDef[], results: ArticularResult[]): ArticularGroup[] {
  const history: Record<string, ScorePoint[]> = {};
  for (const r of results) {
    (history[r.test_definition_id] ??= []).push({ date: r.performed_at, score: r.athlete_test_values?.[0]?.value ?? null });
  }
  const groups = new Map<string, ArticularAction[]>();
  for (const d of defs) {
    const hist = history[d.id] ?? [];
    const item: ArticularAction = {
      testId: d.id,
      action: stripJoint(d.name, d.articulation),
      score: hist[0]?.score ?? null,
      date: hist[0]?.date ?? null,
      mediaUrl: d.media_url,
      history: hist,
    };
    if (!groups.has(d.articulation)) groups.set(d.articulation, []);
    groups.get(d.articulation)!.push(item);
  }
  const order = (a: string) => {
    const i = (ARTICULATIONS as readonly string[]).indexOf(a);
    return i === -1 ? 99 : i;
  };
  return [...groups.entries()]
    .map(([articulation, items]) => ({ articulation, items: items.sort((x, y) => x.action.localeCompare(y.action)) }))
    .sort((a, b) => order(a.articulation) - order(b.articulation) || a.articulation.localeCompare(b.articulation));
}

export async function getArticularProfile(athleteId: string): Promise<ArticularGroup[]> {
  const defs = unwrapRows(
    await db().from("test_definitions").select("id, name, articulation, media_url")
      .eq("category", "bilan_articulaire").not("articulation", "is", null),
    "Lecture des tests articulaires impossible",
  ) as unknown as ArticularDef[];
  if (defs.length === 0) return [];
  const results = unwrapRows(
    await db().from("athlete_test_results").select("test_definition_id, performed_at, athlete_test_values(value)")
      .eq("athlete_id", athleteId).in("test_definition_id", defs.map((d) => d.id))
      .order("performed_at", { ascending: false }),
    "Lecture du profil articulaire impossible",
  ) as unknown as ArticularResult[];
  return groupArticular(defs, results);
}

// ── Éléments de profil (points forts / faibles notés) ─────────────────────────

export interface ProfileItem {
  id: string;
  athlete_id: string;
  category: TestCategory;
  label: string;
  /** /5 */
  rating: number | null;
  note: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProfileItemInput {
  category: TestCategory;
  label: string;
  rating: number | null;
  note: string | null;
}

export async function getProfileItems(athleteId: string): Promise<ProfileItem[]> {
  const rows = unwrapRows(
    await db().from("athlete_profile_items").select("*").eq("athlete_id", athleteId).order("category").order("sort_order"),
    "Lecture du profil impossible",
  );
  return rows as unknown as ProfileItem[];
}

const itemFields = (input: ProfileItemInput) => ({
  category: input.category,
  label: input.label.trim(),
  rating: input.rating,
  note: input.note?.trim() || null,
});

export async function createProfileItem(athleteId: string, input: ProfileItemInput): Promise<void> {
  check(
    await db().from("athlete_profile_items").insert({ athlete_id: athleteId, ...itemFields(input) } as never),
    "Ajout impossible",
  );
}

export async function updateProfileItem(id: string, input: ProfileItemInput): Promise<void> {
  check(
    await db().from("athlete_profile_items").update({ ...itemFields(input), updated_at: new Date().toISOString() } as never).eq("id", id),
    "Mise à jour impossible",
  );
}

export async function deleteProfileItem(id: string): Promise<void> {
  check(await db().from("athlete_profile_items").delete().eq("id", id), "Suppression impossible");
}

// ── Poids ─────────────────────────────────────────────────────────────────────

/**
 * Moyenne des `n` dernières pesées saisies avec le wellness (fiche coach).
 * Jours ISO, donc l'ordre et la date affichée sont justes quel que soit le
 * format de stockage (avant : clés "YYYYMMDD" → date jamais affichée).
 */
export function recentWeights(history: WellnessHistory, n = 3): { avg: number; lastDate: IsoDay; count: number } | null {
  const entries = Object.values(history)
    .filter((e) => e.weightKg != null && e.weightKg > 0)
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, n);
  if (entries.length === 0) return null;
  const avg = entries.reduce((s, e) => s + (e.weightKg as number), 0) / entries.length;
  return { avg: Math.round(avg * 10) / 10, lastDate: entries[0].day, count: entries.length };
}

type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: { message: string; code?: string } | null;
}>;
// `weight_set_day` / `weight_record_milestone` ne sont pas encore dans les types générés (migration 20261109150000).
const rpc: UntypedRpc = (fn, args) => (db() as unknown as { rpc: UntypedRpc }).rpc(fn, args);

function checkWeight(day: IsoDay, kg: number) {
  if (!isIsoDay(day)) throw new ApiError("Jour de pesée invalide", { message: String(day), code: "22023" });
  if (!Number.isFinite(kg) || kg <= 0 || kg >= 500) throw new ApiError("Poids invalide", { message: String(kg), code: "22023" });
}

/**
 * Enregistre la pesée d'UN jour dans `asp:wlog` (RPC atomique : les autres
 * jours ne sont pas réécrits). Renvoie le journal à jour, clés compactes
 * "YYYYMMDD" comme le stockage (c'est ce qu'attend `checkMilestone`).
 */
export async function saveWeight(athleteId: string, day: IsoDay, kg: number): Promise<Record<string, number>> {
  checkWeight(day, kg);
  const log = unwrap(await rpc("weight_set_day", { p_athlete: athleteId, p_day: day, p_kg: kg }), "Enregistrement du poids impossible");
  if (log === null || typeof log !== "object" || Array.isArray(log)) {
    throw new ApiError("Journal de poids illisible", { message: "valeur inattendue" });
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(log as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/**
 * Palier de poids franchi : ajoute `{date, kg}` à `asp:wmile` et pose
 * `asp:bw.current` (l'objectif est gardé), dans la même transaction.
 * Renvoie le poids de corps à jour.
 */
export async function recordWeightMilestone(athleteId: string, day: IsoDay, kg: number): Promise<{ current: number; target: number }> {
  checkWeight(day, kg);
  const bw = unwrap(await rpc("weight_record_milestone", { p_athlete: athleteId, p_day: day, p_kg: kg }), "Enregistrement du palier impossible") as
    { current?: unknown; target?: unknown } | null;
  return { current: Number(bw?.current ?? kg), target: Number(bw?.target ?? 0) || 0 };
}

// ── Tendances (Mon profil) ────────────────────────────────────────────────────

export interface TrendSessionRow { scheduled_date: string; status: string | null }

/** Séances prescrites (muscu + énergie / spécifique) entre deux jours inclus, pour l'assiduité. */
export async function getTrendSessions(athleteId: string, from: IsoDay, to: IsoDay): Promise<TrendSessionRow[]> {
  const [workouts, energy] = await Promise.all([
    db().from("workout_logs").select("scheduled_date, status").eq("athlete_id", athleteId).gte("scheduled_date", from).lte("scheduled_date", to),
    db().from("energy_session_assignments").select("scheduled_date, status").eq("athlete_id", athleteId).gte("scheduled_date", from).lte("scheduled_date", to),
  ]);
  return [
    ...unwrapRows(workouts, "Lecture des séances impossible"),
    ...unwrapRows(energy, "Lecture des séances énergie impossible"),
  ] as TrendSessionRow[];
}

/**
 * Phrases de synthèse rédigées par l'IA (Edge Function `athlete-insights`) à
 * partir d'agrégats seulement. Lève si l'appel échoue ; null si la réponse
 * est vide (l'appelant retombe alors sur les règles).
 */
export async function getAiInsights(payload: Record<string, unknown>): Promise<string[] | null> {
  const { data, error } = await db().functions.invoke("athlete-insights", { body: payload });
  if (error) throw new ApiError("Synthèse IA indisponible", error);
  const list = (data as { insights?: unknown } | null)?.insights;
  if (!Array.isArray(list)) return null;
  const clean = list.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 4);
  return clean.length ? clean : null;
}
