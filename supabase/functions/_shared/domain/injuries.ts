/**
 * Ce que l'API coach (assistant IA du coach) a le droit d'exporter d'une blessure.
 *
 * Source : `medical_entries` (l'ancienne clé `asp:injuries` n'a plus de ligne
 * en prod : l'assistant ne voyait aucune blessure, 2026-11-08).
 *
 * Liste blanche (docs/COUCHE_API.md §5) : type, statut, douleur, impact sur
 * l'entraînement, dates et zone. Jamais le texte libre — titre, diagnostic,
 * traitement, notes — où un diagnostic ou un traitement peut se glisser. Les
 * opérations, pathologies et « autre » ne sortent pas : seules les blessures.
 *
 * Pur, sans dépendance : importé par `coach-api` et par le front (`@shared`).
 */
import { isIsoDay, type IsoDay } from "./dates.ts";

/** Colonnes à lire, et rien d'autre : la requête ne ramène pas le texte libre. */
export const INJURY_EXPORT_COLUMNS = "kind, status, zone, date, return_date, injury_type, pain_level, training_impact";

export type ExportedInjuryStatus = "en_cours" | "gueri";
export type ExportedInjuryType = "traumatique" | "chronique_surmenage" | "recidive";
export type ExportedTrainingImpact = "aucun" | "adapte" | "arret_partiel" | "arret_total";

export interface ExportedInjury {
  /** Zone du corps (libellé court, borné). */
  zone: string | null;
  type: ExportedInjuryType | null;
  statut: ExportedInjuryStatus;
  /** Douleur déclarée, 0 à 10. */
  douleur: number | null;
  impact: ExportedTrainingImpact | null;
  /** Début. */
  debut: IsoDay | null;
  /** Retour prévu ou effectif. */
  retour: IsoDay | null;
}

const STATUSES: readonly string[] = ["en_cours", "gueri"];
const TYPES: readonly string[] = ["traumatique", "chronique_surmenage", "recidive"];
const IMPACTS: readonly string[] = ["aucun", "adapte", "arret_partiel", "arret_total"];

function oneOf<T extends string>(v: unknown, allowed: readonly string[]): T | null {
  return typeof v === "string" && allowed.includes(v) ? (v as T) : null;
}

/** Zone saisie à la main : une ligne, sans caractère de balisage, 40 caractères. */
function zoneLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\r\n`$<>{}]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  return s || null;
}

function pain(v: unknown): number | null {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 10 ? Math.round(n) : null;
}

const day = (v: unknown): IsoDay | null => (isIsoDay(v) ? v : null);

/** Une ligne `medical_entries` → blessure exportable, ou null (pas une blessure). */
export function toExportedInjury(row: unknown): ExportedInjury | null {
  if (row === null || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (r.kind !== "blessure") return null;
  const statut = oneOf<ExportedInjuryStatus>(r.status, STATUSES);
  if (!statut) return null;
  return {
    zone: zoneLabel(r.zone),
    type: oneOf<ExportedInjuryType>(r.injury_type, TYPES),
    statut,
    douleur: pain(r.pain_level),
    impact: oneOf<ExportedTrainingImpact>(r.training_impact, IMPACTS),
    debut: day(r.date),
    retour: day(r.return_date),
  };
}

/** La blessure concerne-t-elle la période [from, to] ? */
function overlaps(i: ExportedInjury, from: IsoDay, to: IsoDay): boolean {
  if (i.debut && i.debut > to) return false; // commence après la période
  if (i.statut === "en_cours") return true;   // encore ouverte
  // Guérie : il faut savoir qu'elle touchait la période.
  if (i.retour) return i.retour >= from;
  return !!i.debut && i.debut >= from;
}

/**
 * Blessures à exporter pour une période : en cours, ou guéries pendant / après
 * le début de la période. En cours d'abord, puis la plus récente ; 20 au plus.
 */
export function exportableInjuries(rows: unknown[], from: IsoDay, to: IsoDay): ExportedInjury[] {
  return rows
    .map(toExportedInjury)
    .filter((i): i is ExportedInjury => i !== null && overlaps(i, from, to))
    .sort((a, b) =>
      a.statut !== b.statut ? (a.statut === "en_cours" ? -1 : 1) : (b.debut ?? "").localeCompare(a.debut ?? ""))
    .slice(0, 20);
}
