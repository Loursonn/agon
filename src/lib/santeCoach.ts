import type { HealthDay } from "@/api/health";
import type { WellnessHistory } from "@shared/domain/wellness";
import { addDays, type IsoDay } from "@shared/domain/dates";
import { baselineAt, dailyValues } from "@/lib/healthView";
import { agreement, type Agreement } from "@/lib/feltVsMeasured";

/**
 * Santé côté coach (planches CoachOrdiASante, CoachTelSante) : ressenti du
 * wellness face à la mesure de la montre. Pur, testé. Les mesures de marque
 * (score de sommeil, Body Battery, stress) sont seulement affichées : rien
 * n'est recalculé à partir d'elles en dehors de cette comparaison visuelle.
 */

export type FeltKey = "sommeil" | "energie" | "stress";

export interface FeltMeasuredDef {
  key: FeltKey;
  label: string;
  measuredLabel: string;
  pick: (d: HealthDay) => number | null;
  higherIsBetter: boolean;
}

export const FELT_MEASURED: readonly FeltMeasuredDef[] = [
  { key: "sommeil", label: "Sommeil", measuredLabel: "score de sommeil", pick: (d) => d.sleepScore, higherIsBetter: true },
  { key: "energie", label: "Énergie", measuredLabel: "Body Battery", pick: (d) => d.bodyBatteryMax, higherIsBetter: true },
  { key: "stress", label: "Sérénité", measuredLabel: "stress moyen", pick: (d) => d.stressAvg, higherIsBetter: false },
];

export interface FeltMeasuredRow {
  def: FeltMeasuredDef;
  felt: number;
  measured: number;
  /** Attribution exigée par Garmin à côté de la mesure. */
  source: string | null;
  mean: number | null;
  agr: Agreement | null;
}

/** Lignes « ressenti / mesuré » du jour : seulement celles où les deux existent. */
export function feltMeasuredRows(health: readonly HealthDay[], wh: WellnessHistory | null | undefined, day: IsoDay): FeltMeasuredRow[] {
  const entry = wh?.[day] ?? null;
  return FELT_MEASURED.flatMap((def) => {
    const felt = entry?.items[def.key] ?? null;
    const values = dailyValues(health, def.pick);
    const cur = values.get(day) ?? null;
    if (felt == null || cur == null) return [];
    const base = baselineAt(values, day);
    return [{ def, felt, measured: cur.v, source: cur.source, mean: base?.mean ?? null, agr: base ? agreement(felt, cur.v, base.mean, def.higherIsBetter) : null }];
  });
}

export interface FeltMeasuredPoint {
  day: IsoDay;
  /** Note du wellness × 20 (même échelle 0-100 que la mesure), null sans saisie. */
  felt: number | null;
  measured: number | null;
}

/** Ressenti (× 20) et mesure jour par jour sur `n` jours jusqu'à `day` compris. */
export function feltMeasuredSeries(
  health: readonly HealthDay[], wh: WellnessHistory | null | undefined, key: FeltKey, day: IsoDay, n = 28,
): FeltMeasuredPoint[] {
  const def = FELT_MEASURED.find((d) => d.key === key)!;
  const values = dailyValues(health, def.pick);
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(day, i - n + 1);
    const f = wh?.[d]?.items[key] ?? null;
    return { day: d, felt: f == null ? null : f * 20, measured: values.get(d)?.v ?? null };
  });
}

/**
 * Phrase sous l'encart « Écart avec son ressenti » (téléphone).
 * @param sleepStreak   nuits de suite sous sa zone (sommeil), null si pas d'écart sommeil
 * @param energyStreak  jours de suite sous sa zone (Body Battery), null si pas d'écart énergie
 */
export function gapSentence(first: string, sleepStreak: number | null, energyStreak: number | null): string | null {
  const since = (n: number) => `depuis ${n} jours`;
  if (sleepStreak != null && energyStreak != null) {
    const n = Math.min(sleepStreak, energyStreak);
    return `${first} se dit en forme, mais sa nuit est courte et sa récupération basse${n > 1 ? ` ${since(n)}` : ""}.`;
  }
  if (sleepStreak != null) {
    return `${first} se dit en forme, mais ${sleepStreak > 1 ? `ses nuits sont courtes ${since(sleepStreak)}` : "sa nuit est courte"}.`;
  }
  if (energyStreak != null) {
    return `${first} se dit en forme, mais sa récupération mesurée est basse ${energyStreak > 1 ? since(energyStreak) : "ce matin"}.`;
  }
  return null;
}
