/**
 * Archive d'export Strava lue sortie par sortie : chaque fichier d'activité,
 * complété par sa ligne d'`activities.csv` (titre, description, RPE,
 * matériel…), puis les lignes sans fichier (saisies à la main dans Strava)
 * en « résumé seul ».
 *
 * Un générateur et non un tableau : une archive de plusieurs milliers de
 * sorties ne tient pas décodée en mémoire sur un téléphone. L'appelant
 * consomme par paquets, envoie, oublie.
 */
import { listZipEntries, readZipEntry, type ByteSource } from "./archive.ts";
import { activityDetailOf, looksLikeActivityName, parseActivityFile } from "./index.ts";
import type { NormalizedActivity } from "./stream.ts";
import { parseStravaCsv, StravaCsvError, type StravaCsvActivity } from "./stravaCsv.ts";
import {
  localDateOf,
  paceFrom,
  qualityOf,
  type ActivityExtras,
  type ImportActivity,
  type ParsedActivity,
} from "./types.ts";

export type ArchiveItem =
  | { kind: "activity"; name: string; activity: ImportActivity; detail: NormalizedActivity | null }
  | { kind: "rejected"; name: string; reason: string };

export interface ArchiveScan {
  /** Fichiers d'activité dans l'archive. */
  files: number;
  /** Lignes d'`activities.csv` lues (0 si absent). */
  csvRows: number;
  /** Lignes sans fichier (ou dont le fichier manque) : importées en résumé seul. */
  summaryOnly: number;
  /** Membres ignorés sans examen (profil, médias…). */
  ignored: number;
  /** Total d'éléments que le générateur va rendre (pour la barre de progression). */
  total: number;
  /** Langue des en-têtes CSV. */
  csvLanguage: "en" | "fr" | null;
  /** Problème de lecture du CSV (l'archive reste lue, sans ses métadonnées). */
  csvError: string | null;
}

/** Décalage horaire à appliquer à une sortie sans fichier (le CSV n'en donne pas). */
export type UtcOffsetAt = (ms: number) => number;

const isMeta = (name: string) => {
  const base = name.split("/").pop() ?? name;
  return name.endsWith("/") || base.startsWith("._") || name.startsWith("__MACOSX/");
};

const baseName = (path: string) => path.split("/").pop() ?? path;

/** Champs propres à Strava, à partir d'une ligne CSV. */
export function extrasFromCsv(csv: StravaCsvActivity): ActivityExtras {
  return {
    title: csv.name,
    description: csv.description,
    rpe: csv.rpe,
    gear: csv.gear,
    commute: csv.commute,
    stravaActivityId: csv.stravaId,
  };
}

/**
 * Fichier décodé + sa ligne CSV : le fichier fait foi pour les mesures, le
 * CSV comble les vides (calories, D+…) et apporte titre, description, RPE.
 */
export function withCsv(act: ParsedActivity, csv: StravaCsvActivity | null): ImportActivity {
  const quality = qualityOf(act);
  if (!csv) return { ...act, quality, extras: null };
  const durationS = act.durationS ?? csv.movingS ?? csv.elapsedS;
  const distanceM = act.distanceM ?? csv.distanceM;
  return {
    ...act,
    sport: act.sport ?? csv.sport,
    durationS,
    distanceM,
    elevationGainM: act.elevationGainM ?? csv.elevationGainM,
    avgHr: act.avgHr ?? csv.avgHr,
    maxHr: act.maxHr ?? csv.maxHr,
    avgPaceSPerKm: act.avgPaceSPerKm ?? paceFrom(distanceM, durationS),
    calories: act.calories ?? csv.calories,
    quality,
    extras: extrasFromCsv(csv),
  };
}

/** Sortie sans fichier : résumé seul, à partir de la ligne CSV. */
export function summaryFromCsv(csv: StravaCsvActivity, utcOffsetAt: UtcOffsetAt = () => 0): ImportActivity {
  const ms = Date.parse(csv.startedAt);
  const durationS = csv.movingS ?? csv.elapsedS;
  return {
    externalId: `strava:${csv.stravaId}`,
    startedAt: csv.startedAt,
    localDate: localDateOf(ms, utcOffsetAt(ms)),
    sport: csv.sport,
    durationS,
    distanceM: csv.distanceM,
    elevationGainM: csv.elevationGainM,
    avgHr: csv.avgHr,
    maxHr: csv.maxHr,
    avgPaceSPerKm: paceFrom(csv.distanceM, durationS),
    calories: csv.calories,
    details: {
      elapsedS: csv.elapsedS,
      descentM: csv.elevationLossM,
      maxSpeedMps: csv.maxSpeedMps,
      avgCadence: csv.avgCadence,
      avgPowerW: csv.avgPowerW,
    },
    raw: { format: "strava_csv", stravaType: csv.type },
    quality: "summary",
    extras: extrasFromCsv(csv),
  };
}

/**
 * Lit l'index de l'archive et son CSV, sans décoder les sorties. Rend le plan
 * (compteurs) et le générateur qui les décode une à une.
 */
export async function openStravaArchive(
  source: ByteSource,
  options: { withDetail?: boolean; utcOffsetAt?: UtcOffsetAt } = {},
): Promise<{ scan: ArchiveScan; items: () => AsyncGenerator<ArchiveItem> }> {
  const entries = await listZipEntries(source);
  const files = entries.filter((e) => !isMeta(e.name) && looksLikeActivityName(baseName(e.name)));
  const csvEntry = entries.find((e) => !isMeta(e.name) && /(^|\/)activities\.csv$/i.test(e.name));

  let csvRows: StravaCsvActivity[] = [];
  let csvLanguage: ArchiveScan["csvLanguage"] = null;
  let csvError: string | null = null;
  const csvRejected: Array<{ name: string; reason: string }> = [];
  if (csvEntry) {
    try {
      const bytes = await readZipEntry(source, csvEntry);
      const res = parseStravaCsv(new TextDecoder("utf-8").decode(bytes));
      csvRows = res.activities;
      csvLanguage = res.language;
      csvRejected.push(...res.rejected);
    } catch (e) {
      csvError = e instanceof StravaCsvError || e instanceof Error ? e.message : String(e);
    }
  }

  // Jointure par chemin exact, puis par nom de fichier seul (archive recompressée).
  const byPath = new Map<string, StravaCsvActivity>();
  const byBase = new Map<string, StravaCsvActivity>();
  for (const row of csvRows) {
    if (!row.filename) continue;
    byPath.set(row.filename.toLowerCase(), row);
    byBase.set(baseName(row.filename).toLowerCase(), row);
  }
  const fileNames = new Set(files.map((f) => f.name.toLowerCase()));
  const fileBases = new Set(files.map((f) => baseName(f.name).toLowerCase()));
  const summaryRows = csvRows.filter((r) =>
    !r.filename || !(fileNames.has(r.filename.toLowerCase()) || fileBases.has(baseName(r.filename).toLowerCase()))
  );

  const scan: ArchiveScan = {
    files: files.length,
    csvRows: csvRows.length,
    summaryOnly: summaryRows.length,
    ignored: entries.length - files.length - (csvEntry ? 1 : 0),
    total: files.length + summaryRows.length + csvRejected.length,
    csvLanguage,
    csvError,
  };

  async function* items(): AsyncGenerator<ArchiveItem> {
    for (const r of csvRejected) yield { kind: "rejected", ...r };

    for (const entry of files) {
      const label = baseName(entry.name);
      const csv = byPath.get(entry.name.toLowerCase()) ?? byBase.get(label.toLowerCase()) ?? null;
      let parsed: ParsedActivity[] = [];
      let detail: NormalizedActivity | null = null;
      let reason: string | null = null;
      try {
        const bytes = await readZipEntry(source, entry);
        const res = await parseActivityFile(label, bytes);
        parsed = res.activities;
        if (res.rejected.length > 0) reason = res.rejected.map((r) => r.reason).join(" ; ");
        if (options.withDetail && parsed.length === 1) detail = await activityDetailOf(label, bytes);
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
      }

      if (parsed.length === 0) {
        /*
          Fichier illisible mais ligne CSV présente : la sortie entre quand
          même, en résumé seul. Un fichier abîmé ne doit pas effacer une
          sortie dont on connaît la date, la durée et la distance.
        */
        yield { kind: "rejected", name: label, reason: reason ?? "aucune activité dans le fichier" };
        if (csv) yield { kind: "activity", name: label, activity: summaryFromCsv(csv, options.utcOffsetAt), detail: null };
        continue;
      }
      // Multisport : la ligne CSV (et son identifiant Strava) va à la première session.
      for (let i = 0; i < parsed.length; i++) {
        yield {
          kind: "activity",
          name: label,
          activity: withCsv(parsed[i], i === 0 ? csv : null),
          detail: i === 0 ? detail : null,
        };
      }
    }

    for (const row of summaryRows) {
      yield {
        kind: "activity",
        name: row.filename ? baseName(row.filename) : `Strava ${row.stravaId}`,
        activity: summaryFromCsv(row, options.utcOffsetAt),
        detail: null,
      };
    }
  }

  return { scan, items };
}
