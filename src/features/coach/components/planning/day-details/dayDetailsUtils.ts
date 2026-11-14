import { C } from "@/lib/theme";
import type { ProgSession, Bloc, Exercice, ExerciceParams } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams } from "@/lib/sessionOccurrence";
import { formatSetsReps } from "@/lib/formatSetsReps";

export function rpeColor(v: number) { return v <= 4 ? C.g : v <= 7 ? C.o : C.r; }
export function rpeBg(v: number)    { return v <= 4 ? C.gS : v <= 7 ? C.oS : C.rS; }

export type SessionSetLog = { done: boolean; skipped?: boolean; kg?: number | null; reps?: number; rir?: number | null; note?: string };

export type ExoRow = {
  id: string;
  name: string;
  blocName: string;
  mode: string;
  methodeId?: string;
  libreText?: string;
  comment?: string;
  planned: ExerciceParams | null;
  actual: SessionSetLog[];
};

/** Format planned params to readable string */
export function fmtPlanned(p: ExerciceParams): string {
  const parts: string[] = [formatSetsReps(p)];
  if (p.charge.mode === "global" && p.charge.value != null) {
    parts.push(p.charge_unit === "%RM" ? `@${p.charge.value}%` : `@${p.charge.value}kg`);
  }
  if (p.rir.mode === "global" && p.rir.value != null) {
    parts.push(`RIR${p.rir.value}`);
  }
  if (p.tempo.mode === "global" && p.tempo.value) {
    parts.push(`T:${p.tempo.value}`);
  }
  return parts.join(" ");
}

/** Build exercise rows from prog + athlete data */
export function buildExoRows(
  progSession: ProgSession | undefined,
  sessionSets: Record<string, SessionSetLog[]> | null,
  weekNumber: number | undefined,
): ExoRow[] {
  const allExercices = progSession?.blocs?.flatMap((b: Bloc) =>
    b.exercices.map((ex: Exercice) => ({ ...ex, blocName: b.name, blocCategory: b.category }))
  ) ?? [];

  const rows: ExoRow[] = [];
  const seenIds = new Set<string>();

  for (const ex of allExercices) {
    seenIds.add(ex.id);
    const params = resolveExerciceParams(ex.params, weekNumber ?? 1);
    const actual = (sessionSets?.[ex.id] ?? []) as SessionSetLog[];
    rows.push({
      id: ex.id, name: ex.exercise_name, blocName: ex.blocName, mode: ex.mode,
      methodeId: ex.methode_id, libreText: ex.libre_text, comment: ex.comment,
      planned: params, actual: actual.filter(s => s.done),
    });
  }

  if (sessionSets) {
    for (const [exId, rawSets] of Object.entries(sessionSets)) {
      if (seenIds.has(exId)) continue;
      const doneSets = (rawSets as SessionSetLog[]).filter(s => s.done);
      if (doneSets.length === 0) continue;
      rows.push({ id: exId, name: "Exercice ajouté", blocName: "Bonus", mode: "classique", planned: null, actual: doneSets });
    }
  }

  return rows;
}

/** Quick summary for collapsed accordion row */
export function exoQuickSummary(exo: ExoRow, isCompleted: boolean): { text: string; color: string } {
  const hasActual = exo.actual.length > 0;
  if (hasActual) {
    const kgs = exo.actual.map(s => s.kg).filter((v): v is number => v != null);
    const reps = exo.actual.map(s => s.reps).filter((v): v is number => v != null);
    const maxKg = kgs.length ? Math.max(...kgs) : null;
    const avgReps = reps.length ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : null;
    const plannedSets = exo.planned?.nb_series ?? exo.actual.length;
    const parts: string[] = [`${exo.actual.length}/${plannedSets} séries`];
    if (maxKg != null && avgReps != null) parts.push(`${maxKg}kg × ${avgReps}`);
    else if (maxKg != null) parts.push(`${maxKg}kg`);
    else if (avgReps != null) parts.push(`${avgReps} reps`);
    return { text: parts.join(" · "), color: exo.actual.length >= plannedSets ? C.g : C.o };
  }
  if (isCompleted) {
    const p = exo.planned ? ` · Prévu : ${fmtPlanned(exo.planned)}` : "";
    return { text: `Non réalisé${p}`, color: C.r };
  }
  if (exo.planned) return { text: fmtPlanned(exo.planned), color: C.tx3 };
  return { text: "—", color: C.tx3 };
}
