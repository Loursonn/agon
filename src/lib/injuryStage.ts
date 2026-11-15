/**
 * Étape de résolution d'une blessure (Hugo, 15/11/2026) : Blessé →
 * Réhabilitation → Réhab presque finie → Réathlétisation → Guéri.
 *
 * Pur : lit l'étape d'une blessure (repli sur le statut pour une ligne lue
 * avant la migration) et son historique daté (`injury_stage_history`).
 */
import {
  RECOVERY_STAGES,
  type InjuryStageEvent,
  type MedicalEntryStatus,
  type RecoveryStage,
} from "@/features/shared/types/medical";

/** Étape actuelle ; sans étape enregistrée, déduite du statut. */
export function stageOf(e: { status: MedicalEntryStatus; recovery_stage?: RecoveryStage | null }): RecoveryStage {
  if (e.recovery_stage && RECOVERY_STAGES.includes(e.recovery_stage)) return e.recovery_stage;
  return e.status === "gueri" ? "gueri" : "blesse";
}

/** Rang 0-4 dans la guérison. */
export const stageIndex = (s: RecoveryStage): number => RECOVERY_STAGES.indexOf(s);

const DAY_MS = 86_400_000;

/** Jour local "YYYY-MM-DD" d'un horodatage. */
function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface StagePassage {
  stage: RecoveryStage;
  /** Jour où l'étape a été atteinte, "YYYY-MM-DD". */
  day: string;
  /** Jours passés dans l'étape (jusqu'à la suivante, ou jusqu'à `today` pour l'actuelle). */
  days: number;
}

/**
 * Historique d'une blessure, du plus ancien au plus récent. Une étape notée
 * deux fois de suite n'en fait qu'une.
 */
export function stagePassages(events: readonly InjuryStageEvent[], entryId: string, today: Date = new Date()): StagePassage[] {
  const own = events
    .filter((e) => e.entry_id === entryId && RECOVERY_STAGES.includes(e.stage))
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  const kept: InjuryStageEvent[] = [];
  for (const e of own) if (kept[kept.length - 1]?.stage !== e.stage) kept.push(e);
  return kept.map((e, i) => {
    const start = new Date(localDay(e.changed_at) + "T00:00:00");
    const next = kept[i + 1];
    const end = next ? new Date(localDay(next.changed_at) + "T00:00:00") : new Date(localDay(today.toISOString()) + "T00:00:00");
    return { stage: e.stage, day: localDay(e.changed_at), days: Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS)) };
  });
}

/** « 3 j », « 2 sem », « aujourd'hui ». */
export function fmtStageDuration(days: number): string {
  if (days <= 0) return "aujourd'hui";
  if (days < 14) return `${days} j`;
  return `${Math.round(days / 7)} sem`;
}

/** "2026-11-08" → "08/11". */
export const fmtStageDay = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
