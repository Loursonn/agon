import type { QueryClient } from "@tanstack/react-query";
import { ApiError, check, db, unwrap, unwrapRows } from "./client";
import { signIn, signUp } from "./auth";
import { getProfiles, type Profile } from "./profile";
import { signupBirthDateError } from "@/lib/age";

/**
 * Compte : inscription, rattachement au coach, roster du coach, lien de
 * première connexion, consentements RGPD, export et suppression du compte.
 *
 * `profiles.coach_id` (CLAUDE.md) : un coach n'est posé que par les RPC
 * `link_to_coach_by_code` ou par les Edge Functions.
 * `setOwnCoach` (RPC `set_own_coach`) n'accepte que les deux valeurs que le
 * trigger `guard_profile_privileged_fields` laisse passer : `null` (quitter
 * son coach) et soi-même (coach-athlète qui se coache).
 */

// ── Erreurs ───────────────────────────────────────────────────────────────────

/** Refus du serveur ; `reason` = message brut (affiché ou reconnu par l'écran). */
export class AccountError extends ApiError {
  readonly reason: string;
  constructor(what: string, err: { message: string; code?: string }) {
    super(what, err);
    this.name = "AccountError";
    this.reason = err.message;
  }
}

function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T | null {
  if (res.error) throw new AccountError(what, res.error);
  return res.data;
}

type FnError = { message: string; context?: unknown };
type Invoke = <T>(fn: string, opts: { body: unknown }) => Promise<{ data: T | null; error: FnError | null }>;
const invoke: Invoke = (fn, opts) => db().functions.invoke(fn, opts) as never;

// ── Clés React Query ──────────────────────────────────────────────────────────

export const accountKeys = {
  all: (uid: string) => ["account", uid] as const,
  consents: (uid: string) => ["account", uid, "consents"] as const,
  claimLink: (aid: string) => ["account", aid, "claimLink"] as const,
  /** Page publique du lien : pas encore d'utilisateur. */
  claimInfo: (token: string) => ["account", "_claim", token] as const,
  coachEmail: (uid: string) => ["account", uid, "coachEmail"] as const,
};

/**
 * Tout ce qui dépend du compte d'un utilisateur, dont le bandeau « accord
 * staff » (`['staff', 'consent', uid]`, lu par `AthleteStaffPanel`).
 */
export function invalidateAccount(qc: QueryClient, userId: string): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: accountKeys.all(userId) }),
    qc.invalidateQueries({ queryKey: ["staff", "consent", userId] }),
  ]).then(() => undefined);
}

// ── Code coach, inscription ───────────────────────────────────────────────────

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCoachCode(random: () => number = Math.random): string {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(random() * CODE_CHARS.length)]).join("");
}

export const normalizeCoachCode = (code: string) => code.toUpperCase().trim();

/** Un code coach existe-t-il ? (RPC sans données, appelable avant connexion). Lève si l'appel échoue. */
export async function coachCodeExists(code: string): Promise<boolean> {
  return !!must(await db().rpc("coach_code_exists", { p_code: normalizeCoachCode(code) }), "Vérification du code coach impossible");
}

/**
 * Code coach libre (5 nouveaux tirages au plus en cas de collision). Une
 * vérification impossible n'empêche pas l'inscription : comme avant, on garde
 * le code tiré.
 */
/**
 * Nom du coach qui porte ce code (inscription, « Coach trouvé »), null si le
 * code est incomplet ou inconnu. Rien d'autre n'est exposé avant connexion.
 */
export async function coachPreviewByCode(code: string): Promise<string | null> {
  const name = must(await db().rpc("coach_preview_by_code", { p_code: normalizeCoachCode(code) }), "Vérification du code impossible");
  return (name as string | null) ?? null;
}

export async function pickFreeCoachCode(random: () => number = Math.random): Promise<string> {
  let code = generateCoachCode(random);
  for (let attempts = 0; attempts < 5; attempts++) {
    const taken = await coachCodeExists(code).catch(() => false);
    if (!taken) break;
    code = generateCoachCode(random);
  }
  return code;
}

type NewProfile = {
  id: string; role: Profile["role"]; full_name: string; birth_date: string;
  coach_code?: string; coach_id?: string; profession?: string;
};

async function insertProfile(row: NewProfile): Promise<void> {
  const res = await db().from("profiles").insert(row);
  if (res.error) throw new AccountError("Création du profil impossible", res.error);
}

/** Rattache l'utilisateur connecté au coach de ce code (RPC). `reason` : « Code coach invalide », « …propre code… ». */
export async function linkToCoachByCode(code: string): Promise<string> {
  return must(await db().rpc("link_to_coach_by_code", { p_code: normalizeCoachCode(code) }), "Rattachement au coach impossible") as string;
}

/** Les erreurs d'inscription gardent le message affiché jusqu'ici. */
const plain = (msg: string) => new Error(msg);
/** Message brut d'un refus du serveur (sans le préfixe de `ApiError`). */
export const serverReason = (e: unknown) => (e instanceof AccountError ? e.reason : e instanceof Error ? e.message : String(e));
const reasonOf = serverReason;

/**
 * Âge minimum (15 ans) : vérifié AVANT de créer le compte d'authentification,
 * sinon un refus laisserait un compte sans profil. La base refait le contrôle
 * (trigger `enforce_min_age_on_signup`) pour qui contournerait l'app.
 */
function assertBirthDate(birthDate: string): string {
  const msg = signupBirthDateError(birthDate);
  if (msg) throw plain(msg);
  return birthDate.trim();
}

export async function registerCoach(
  email: string, password: string, fullName: string, birthDate: string, isCoachAthlete = false,
): Promise<string> {
  const birth_date = assertBirthDate(birthDate);
  const user = await signUp(email, password);
  const code = await pickFreeCoachCode();
  await insertProfile({
    id: user.id,
    role: isCoachAthlete ? "coach_athlete" : "coach",
    full_name: fullName,
    birth_date,
    coach_code: code,
    // Coach-athlète : son propre coach par défaut (apparaît dans ses athlètes)
    ...(isCoachAthlete ? { coach_id: user.id } : {}),
  }).catch((e) => { throw plain(reasonOf(e)); });
  return user.id;
}

export async function registerAthleteWithCode(
  email: string, password: string, fullName: string, birthDate: string, coachCode: string,
): Promise<string> {
  const birth_date = assertBirthDate(birthDate);
  const code = normalizeCoachCode(coachCode);
  const exists = await coachCodeExists(code).catch(() => false);
  if (!exists) throw plain("Code coach invalide — vérifie auprès de ton coach");
  const user = await signUp(email, password);
  await insertProfile({ id: user.id, role: "athlete", full_name: fullName, birth_date }).catch((e) => { throw plain(reasonOf(e)); });
  // Le rattachement au coach passe par le serveur (contrôle du code)
  await linkToCoachByCode(code).catch((e) => {
    throw plain("Compte créé, mais le rattachement au coach a échoué : " + reasonOf(e));
  });
  return user.id;
}

export async function registerStaff(
  email: string, password: string, fullName: string, birthDate: string, profession: string,
): Promise<string> {
  const birth_date = assertBirthDate(birthDate);
  const user = await signUp(email, password);
  await insertProfile({ id: user.id, role: "staff", full_name: fullName, birth_date, profession }).catch((e) => { throw plain(reasonOf(e)); });
  return user.id;
}

/**
 * Coach sans code (anciens comptes) : en tire un et l'enregistre. Si
 * l'enregistrement échoue, la fiche est rendue sans code — avant, un code
 * jamais enregistré s'affichait et ne marchait pas.
 */
export async function ensureCoachCode(profile: Profile): Promise<Profile> {
  if ((profile.role !== "coach" && profile.role !== "coach_athlete") || profile.coach_code) return profile;
  const code = generateCoachCode();
  const res = await db().from("profiles").update({ coach_code: code }).eq("id", profile.id);
  if (res.error) {
    console.error("[ensureCoachCode]", res.error.message);
    return profile;
  }
  return { ...profile, coach_code: code };
}

/**
 * Quitter son coach (`null`) ou se coacher soi-même (coach-athlète : son propre id).
 * Passe par la RPC `set_own_coach` (CLAUDE.md : `profiles.coach_id` ne
 * s'écrit que par RPC).
 */
export async function setOwnCoach(userId: string, coachId: null | string, what = "Erreur"): Promise<void> {
  if (coachId !== null && coachId !== userId) {
    throw new ApiError(what, { message: "Rattachement à un autre coach : passer par le code coach" });
  }
  // Les types générés ne savent pas que l'argument accepte NULL.
  check(await db().rpc("set_own_coach", { p_coach: coachId as string }), what);
}

/**
 * Enregistre la version de l'app (build) que l'utilisateur connecté fait tourner :
 * sert à compter les clients encore sur une vieille version (docs/SANTE_TABLES.md).
 * RPC `report_client_build` : n'écrit que sur le profil de l'appelant et
 * seulement si la valeur change ou date de plus d'une heure.
 */
export async function reportClientBuild(build: string): Promise<void> {
  check(await db().rpc("report_client_build", { p_build: build }), "Version non enregistrée");
}

// ── Roster du coach ───────────────────────────────────────────────────────────

/**
 * Athlètes du coach : les siens (avec l'id de leur co-coach éventuel) et ceux
 * dont il est co-coach (masquage lu sur sa ligne de liaison). Trié par nom.
 * Lève si une lecture échoue (avant : liste vide silencieuse).
 */
export async function getCoachRoster(coachId: string): Promise<Profile[]> {
  const [ownRes, coRes] = await Promise.all([
    db().from("profiles").select("*").eq("coach_id", coachId).order("full_name"),
    db().from("athlete_co_coaches").select("athlete_id, hidden").eq("co_coach_id", coachId),
  ]);
  const own = unwrapRows(ownRes, "Lecture des athlètes impossible") as unknown as Profile[];
  const links = unwrapRows(coRes, "Lecture des co-coachings impossible") as { athlete_id: string; hidden: boolean }[];

  const ownIds = own.map((a) => a.id);
  const myLinks = ownIds.length
    ? unwrapRows(
        await db().from("athlete_co_coaches").select("athlete_id, co_coach_id").in("athlete_id", ownIds),
        "Lecture des co-coachs impossible",
      ) as { athlete_id: string; co_coach_id: string }[]
    : [];
  const coCoachOf = new Map(myLinks.map((l) => [l.athlete_id, l.co_coach_id]));

  const hiddenById = new Map(links.map((l) => [l.athlete_id, l.hidden]));
  const coList = links.length
    ? (await getProfiles(links.map((l) => l.athlete_id))).map((a) => ({
        ...a,
        coach_hidden: hiddenById.get(a.id) ?? false,
        co_coached_by_me: true,
        co_coach_id: coachId,
      }))
    : [];

  return [
    ...own.map((a) => ({ ...a, co_coach_id: coCoachOf.get(a.id) ?? null })),
    ...coList,
  ].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "fr"));
}

/** Masque / réaffiche un athlète dans la liste du coach (référent : profil ; co-coach : sa liaison). */
export async function setAthleteHidden(athleteId: string, hidden: boolean): Promise<void> {
  const res = await db().rpc("set_athlete_hidden", { athlete_id: athleteId, hidden });
  if (res.error) throw plain(res.error.message);
}

/** Crée un athlète avant sa première connexion (Edge Function) ; renvoie son id. */
export async function createPendingAthlete(firstName: string, lastName: string): Promise<string> {
  const { data, error } = await invoke<{ athleteId?: string; error?: string }>("pending-athlete", {
    body: { action: "create", firstName, lastName },
  });
  if (error || data?.error || !data?.athleteId) throw plain(data?.error ?? "Création impossible");
  return data.athleteId;
}

/** Supprime un athlète pré-créé encore non réclamé (Edge Function). */
export async function removePendingAthlete(athleteId: string): Promise<void> {
  const { data, error } = await invoke<{ error?: string }>("pending-athlete", { body: { action: "delete", athleteId } });
  if (error || data?.error) throw plain(data?.error ?? "Suppression impossible");
}

// ── Lien de première connexion (athlète pré-créé) ─────────────────────────────

/** Jeton du lien de première connexion ; null si le compte a déjà été réclamé. */
export async function getClaimToken(athleteId: string): Promise<string | null> {
  const row = unwrap(
    await db().from("athlete_claims").select("token").eq("athlete_id", athleteId).maybeSingle(),
    "Lecture du lien de connexion impossible",
  );
  return row?.token ?? null;
}

export interface ClaimInfo { coach_code: string; coach_name: string; first_name: string; last_name: string }

/** Infos affichées sur la page du lien, avant connexion ; null si le jeton n'existe plus. */
export async function getClaimInfo(token: string): Promise<ClaimInfo | null> {
  const rows = unwrapRows(await db().rpc("get_claim_info", { p_token: token }), "Lecture du lien impossible");
  return rows[0] ?? null;
}

/**
 * Active le compte pré-créé (Edge Function `claim-athlete`) puis connecte
 * l'athlète. La date de naissance est vérifiée ici puis par la fonction, qui
 * l'enregistre sur le profil.
 */
export async function claimAthleteAccount(token: string, email: string, password: string, birthDate: string): Promise<void> {
  const birth_date = assertBirthDate(birthDate);
  const { data, error } = await invoke<{ error?: string }>("claim-athlete", {
    body: { token, email, password, birthDate: birth_date },
  });
  if (error || data?.error) throw plain(data?.error ?? "Activation impossible");
  await signIn(email, password);
}

/** E-mail du coach de l'utilisateur connecté (tutoriel d'export Strava) ; null s'il n'en a pas. */
export async function getMyCoachEmail(): Promise<string | null> {
  return (unwrap(await db().rpc("get_my_coach_email"), "Lecture de l'e-mail du coach impossible") as string | null) ?? null;
}

// ── Consentements RGPD ────────────────────────────────────────────────────────

/** Finalités de traitement nécessitant un consentement distinct. */
export type ConsentPurpose = "health_data" | "ai_programming" | "garmin_sync" | "coros_sync" | "staff_sharing";

export interface ConsentState {
  purpose: ConsentPurpose;
  granted: boolean;
  /** Version du document acceptée — peut être antérieure à LEGAL_VERSION. */
  docVersion: string;
  decidedAt: string;
}

export interface ConsentDecision {
  purpose: ConsentPurpose;
  granted: boolean;
  docVersion: string;
  /** Texte affiché au moment du clic, archivé tel quel. */
  statement: string;
}

/** État courant (dernière décision par finalité, vue `current_consents`). Lève si la lecture échoue. */
export async function getConsents(userId: string): Promise<ConsentState[]> {
  const rows = unwrapRows(
    await db().from("current_consents").select("purpose, granted, doc_version, decided_at").eq("user_id", userId),
    "Lecture des consentements impossible",
  );
  return rows.map((r) => ({
    purpose: r.purpose as ConsentPurpose,
    granted: !!r.granted,
    docVersion: r.doc_version ?? "",
    decidedAt: r.decided_at ?? "",
  }));
}

/**
 * Enregistre des décisions. Toujours un INSERT, y compris pour un retrait : le
 * journal `user_consents` est append-only (preuve de l'art. 7.1 du RGPD).
 */
export async function recordConsents(userId: string, decisions: ConsentDecision[]): Promise<void> {
  if (decisions.length === 0) return;
  check(
    await db().from("user_consents").insert(decisions.map((d) => ({
      user_id: userId,
      purpose: d.purpose,
      granted: d.granted,
      doc_version: d.docVersion,
      statement: d.statement,
    }))),
    "Enregistrement du consentement impossible",
  );
}

// ── Export et suppression (RGPD art. 15, 17, 20) ──────────────────────────────

/*
  `from()` n'accepte qu'un nom de table littéral et `eq()` qu'une colonne de
  cette table : l'export, générique par nature, passe par cette vue non typée.
*/
interface DynamicQuery {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
    };
  };
}

/**
 * Toutes les lignes d'une table rattachées à `value` par `column`, avec les
 * droits (RLS) de l'utilisateur. `columns` : liste explicite (pour écarter un
 * secret) ou embarquement d'une table enfant (`*, enfant(*)`).
 */
export async function readOwnRows(table: string, column: string, value: string, columns = "*"): Promise<unknown[]> {
  const q = db() as unknown as DynamicQuery;
  return unwrapRows(await q.from(table).select(columns).eq(column, value), `Lecture de ${table} impossible`);
}

export interface DeleteAccountResult {
  success: boolean;
  /** Étapes qui n'ont pas abouti (ex. révocation d'un provider injoignable). */
  warnings?: string[];
}

/**
 * Suppression définitive du compte connecté (Edge Function `delete-account`).
 * L'identité supprimée est celle du jeton de session, jamais un id du corps ;
 * le mot de confirmation est exigé par le serveur.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data, error } = await invoke<DeleteAccountResult>("delete-account", { body: { confirm: "SUPPRIMER" } });
  if (error) throw plain(error.message);
  if (!data?.success) throw plain("La suppression n'a pas abouti");
  return data;
}
