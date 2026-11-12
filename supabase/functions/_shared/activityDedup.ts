/**
 * Doublons inter-sources, côté serveur.
 *
 * Une même sortie peut arriver par plusieurs chemins : l'archive Strava
 * déposée par l'athlète (`file_import`), puis sa montre COROS, puis Garmin le
 * jour où il change de montre. `external_id` ne suffit pas à les rapprocher :
 * c'est l'empreinte du *contenu* d'un fichier, et le FIT relu par COROS, le
 * GPX exporté par Strava ou le résumé envoyé par Garmin n'ont pas les mêmes
 * octets. La contrainte d'unicité `(athlete_id, source, external_id)` ne peut
 * rien y voir.
 *
 * La règle est celle de l'import de fichiers dans le navigateur
 * (`src/lib/activityImport.ts`, décision « Deux enregistrements d'une même
 * sortie sont rapprochés sur l'heure de départ et le sport ») : même
 * empreinte, OU départ à ±2 min — sauf si les deux sports sont connus et
 * différents. Sans cette exception, la transition d'un triathlon (natation
 * puis vélo démarrés à une minute d'intervalle) ferait disparaître une
 * discipline entière ; un doublon affiché se voit et s'efface, une sortie
 * avalée disparaît sans message.
 *
 * Partagé par toutes les synchronisations serveur (COROS, Garmin) : une seule
 * règle, sinon un import manuel et une synchronisation automatique du même
 * fichier finissent par ne plus donner le même résultat.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DedupCandidate {
  athleteId: string;
  sport: string | null;
  /** ISO 8601. */
  startedAt: string;
  externalId?: string | null;
}

export interface DuplicateHit {
  id: string;
  source: string;
}

/** Tolérance par défaut sur l'heure de départ, en secondes. */
export const SAME_OUTING_TOLERANCE_S = 120;

/** Ce que le rapprochement lit d'une activité. */
export interface OutingStart {
  startedAt: string;
  sport: string | null;
}

/**
 * Famille de sport, même règle que `public.activity_sport_family` (SQL,
 * P41 lot E) : run, hyrox, bike, row, swim, strength, other.
 */
export function sportFamily(sport: string | null | undefined): string | null {
  const k = (sport ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (k === "") return null;
  if (RUN.has(k)) return "run";
  if (k.includes("hyrox")) return "hyrox";
  if (k.includes("cycling") || k.includes("biking") || ["ride", "virtualride", "bike", "cyclocross"].includes(k)) return "bike";
  if (k.includes("rowing")) return "row";
  if (k.includes("swim")) return "swim";
  if (STRENGTH.has(k)) return "strength";
  return "other";
}

const RUN = new Set(["running", "run", "trailrunning", "trailrun", "treadmillrunning", "treadmill", "indoorrunning",
  "trackrunning", "streetrunning", "virtualrun", "virtualrunning", "ultrarun", "ultrarunning", "obstaclerun"]);
const STRENGTH = new Set(["training", "strengthtraining", "strength", "hiit", "cardio", "cardiotraining", "indoorcardio",
  "fitnessequipment", "crossfit", "functionaltraining", "bootcamp"]);

/**
 * Deux sports compatibles pour une même sortie (même règle que
 * `public.outing_sports_compatible`) : l'un inconnu, même famille, ou HYROX /
 * renforcement (une séance HYROX enregistrée « Entraînement » sur Strava).
 * Natation et vélo d'un triathlon restent deux sorties.
 */
export function sportsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const fa = sportFamily(a);
  const fb = sportFamily(b);
  if (fa === null || fb === null || fa === fb) return true;
  const hs = (f: string) => f === "hyrox" || f === "strength";
  return hs(fa) && hs(fb);
}

/**
 * Vrai si `a` et `b` sont deux enregistrements de la même sortie : départs à
 * `toleranceSec` près, et sports compatibles (`sportsCompatible`).
 */
export function isSameOuting(
  a: OutingStart,
  b: OutingStart,
  toleranceSec = SAME_OUTING_TOLERANCE_S,
): boolean {
  const ma = Date.parse(a.startedAt);
  const mb = Date.parse(b.startedAt);
  if (!Number.isFinite(ma) || !Number.isFinite(mb)) return false;
  if (Math.abs(ma - mb) > toleranceSec * 1000) return false;
  return sportsCompatible(a.sport, b.sport);
}

/**
 * Cherche, toutes sources confondues, une activité du même athlète : même
 * `external_id`, OU même sport (null = n'importe lequel) avec départ à
 * ±`toleranceSec`.
 *
 * **Lève** si la base ne répond pas : « je n'ai pas pu vérifier » n'est pas
 * « il n'y a pas de doublon ». L'appelant doit traiter l'exception comme une
 * erreur passagère (réessayer plus tard), pas insérer quand même.
 */
export async function findCrossSourceDuplicate(
  db: SupabaseClient,
  c: DedupCandidate,
  toleranceSec = SAME_OUTING_TOLERANCE_S,
): Promise<DuplicateHit | null> {
  if (c.externalId) {
    const { data, error } = await db
      .from("provider_activities")
      .select("id, source")
      .eq("athlete_id", c.athleteId)
      .eq("external_id", c.externalId)
      .limit(1);
    if (error) throw new Error(`contrôle de doublon (empreinte) : ${error.message}`);
    const row = (data as Array<{ id: string; source: string }> | null)?.[0];
    if (row) return { id: row.id, source: row.source };
  }

  const ms = Date.parse(c.startedAt);
  if (!Number.isFinite(ms)) return null;

  const { data, error } = await db
    .from("provider_activities")
    .select("id, source, sport, started_at")
    .eq("athlete_id", c.athleteId)
    .gte("started_at", new Date(ms - toleranceSec * 1000).toISOString())
    .lte("started_at", new Date(ms + toleranceSec * 1000).toISOString())
    .order("started_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(`contrôle de doublon (heure de départ) : ${error.message}`);

  const rows = (data ?? []) as Array<{ id: string; source: string; sport: string | null; started_at: string }>;
  const hit = rows.find((r) =>
    isSameOuting({ startedAt: c.startedAt, sport: c.sport }, { startedAt: r.started_at, sport: r.sport }, toleranceSec)
  );
  return hit ? { id: hit.id, source: hit.source } : null;
}
