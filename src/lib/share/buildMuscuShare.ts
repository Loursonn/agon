import type { ExerciceParams } from "@/features/coach/components/programmation/types";
import { formatSetsReps, isIsoAt } from "@/lib/formatSetsReps";
import { prescriptionLoad } from "@/lib/todayPreview";
import { loadFromPctRm } from "@shared/domain/performance";
import { nf, shareKicker, type ShareCard, type ShareOptions, type SharePill, type ShareRow, type ShareSection } from "./sessionShare";

/**
 * Carte « Partage de séance » d'une séance de musculation (maquette du
 * 25/11/2026). Avant : une ligne par exercice, « 5 × 3 » et la charge.
 * Après : les séries réellement faites en pastilles (record en or), séries
 * faites / prévues, RPE, records. Jamais de tonnage ni de durée (Hugo, 25/11).
 */

export interface MuscuShareExercise {
  id: string;
  exercise_name: string;
  params: ExerciceParams;
  mode: "classique" | "methode" | "libre";
  libre_text?: string;
}

export interface MuscuShareBloc {
  name: string;
  /** Couleur affichée du bloc (déjà passée par `blocColor`). */
  color: string;
  exercices: MuscuShareExercise[];
}

/** Série saisie (chaînes de l'écran de séance). */
export interface MuscuShareSet {
  kg: string;
  reps: string;
  done: boolean;
  skipped?: boolean;
}

export interface MuscuShareInput {
  done: boolean;
  day: string | null;
  title: string;
  weekNumber?: number | null;
  blocs: MuscuShareBloc[];
  /** Séries saisies par exercice (séance faite). */
  sets?: Record<string, MuscuShareSet[]> | null;
  /** 1RM par exercice, pour afficher les %RM en kg. */
  oneRmByEx?: Record<string, number | null>;
  rpe?: number | null;
  comment?: string | null;
  /** Records battus pendant la séance, par exercice. */
  records?: Record<string, { kg: number | null; reps: number | null }>;
  athleteFirstName: string | null;
  coach: string | null;
  accent: string;
  /** Couleur « faite » (vert) des séries. */
  successColor: string;
}

const WARMUP = /[ée]chauff|warm.?up|activation/i;

const num = (s: string | null | undefined): number | null => {
  if (s == null) return null;
  const v = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

/** « 120×3 », « 30 s », « 3 reps » ; charges masquées → reps seules. */
export function setLabel(s: MuscuShareSet, iso: boolean, showLoads: boolean): string | null {
  const kg = num(s.kg);
  const reps = num(s.reps);
  const r = reps == null ? null : iso ? `${nf(reps, 0)} s` : nf(reps, 1);
  if (showLoads && kg != null && kg > 0) return r ? `${nf(kg, 2)}×${r}` : `${nf(kg, 2)} kg`;
  if (r) return iso ? r : `${r} reps`;
  return null;
}

/** Résumé quand la place manque : « 5 séries · 120 → 125 kg × 3 ». */
export function setsSummary(done: MuscuShareSet[], iso: boolean, showLoads: boolean): string {
  const n = done.length;
  const head = `${n} série${n > 1 ? "s" : ""}`;
  const kgs = done.map((s) => num(s.kg)).filter((v): v is number => v != null && v > 0);
  const reps = done.map((s) => num(s.reps)).filter((v): v is number => v != null);
  const repTxt = reps.length
    ? (Math.min(...reps) === Math.max(...reps) ? nf(reps[0], 1) : `${nf(Math.min(...reps), 1)}-${nf(Math.max(...reps), 1)}`) + (iso ? " s" : "")
    : null;
  if (showLoads && kgs.length) {
    const lo = Math.min(...kgs);
    const hi = Math.max(...kgs);
    const load = lo === hi ? `${nf(lo, 2)} kg` : `${nf(lo, 2)} → ${nf(hi, 2)} kg`;
    return [head, repTxt ? `${load} × ${repTxt}` : load].join(" · ");
  }
  return repTxt ? `${head} · ${repTxt}${iso ? "" : " reps"}` : head;
}

/** Charge prévue lisible : « 120 kg », « 96 kg » (75 % du 1RM connu), « 75 % », « RIR 2 ». */
function plannedLoad(p: ExerciceParams, oneRm: number | null | undefined, showLoads: boolean): string | null {
  const label = prescriptionLoad(p);
  if (!label) return null;
  if (label.startsWith("RIR")) return label;
  if (!showLoads) {
    // Charges masquées : le RIR visé reste une info utile, la charge non.
    const rir = p.rir?.mode === "global" ? p.rir.value : null;
    return rir != null ? `RIR ${nf(rir, 1)}` : null;
  }
  if (p.charge_unit === "%RM" && p.charge.mode === "global" && p.charge.value != null) {
    const kg = loadFromPctRm(oneRm ?? p.manual_rm, p.charge.value);
    if (kg != null) return `${nf(kg, 1)} kg`;
  }
  return label;
}

function tempoOf(p: ExerciceParams): string | null {
  const t = p.tempo?.mode === "global" ? p.tempo.value : null;
  return t ? `tempo ${t}` : null;
}

function letterOf(blocIndex: number, exIndex: number, count: number): string {
  const L = blocIndex < 26 ? String.fromCharCode(65 + blocIndex) : "·";
  return count > 1 ? `${L}${exIndex + 1}` : L;
}

export function buildMuscuShare(input: MuscuShareInput, opts: ShareOptions): ShareCard {
  const warm = input.blocs.filter((b) => WARMUP.test(b.name));
  const main = input.blocs.filter((b) => !WARMUP.test(b.name) && b.exercices.length > 0);
  const sections: ShareSection[] = [];

  if (warm.length) {
    const names = warm.flatMap((b) => b.exercices.map((e) => (e.mode === "libre" ? e.libre_text || e.exercise_name : e.exercise_name))).filter(Boolean);
    if (names.length) sections.push({ type: "note", label: "Échauf.", text: names.join(" · ") });
  }

  let totalSets = 0;
  let doneSets = 0;
  let recordCount = 0;
  const rows: ShareRow[] = [];
  main.forEach((bloc, bi) => {
    bloc.exercices.forEach((ex, ei) => {
      const p = ex.params;
      const libre = ex.mode === "libre";
      const name = (libre ? ex.libre_text || ex.exercise_name : ex.exercise_name)?.trim() || "Exercice";
      const badge = { text: letterOf(bi, ei, bloc.exercices.length), color: bloc.color, shape: "chip" as const };
      const iso = !!p && isIsoAt(p, 0);
      if (!input.done) {
        rows.push({
          badge,
          title: name,
          sub: libre ? null : tempoOf(p),
          right: libre ? null : formatSetsReps(p),
          rightSub: libre ? null : plannedLoad(p, input.oneRmByEx?.[ex.id], opts.showLoads),
          rightSubColor: bloc.color,
        });
        totalSets += libre ? 0 : p?.nb_series ?? 0;
        return;
      }
      const all = input.sets?.[ex.id] ?? [];
      const done = all.filter((s) => s.done && !s.skipped);
      totalSets += libre ? 0 : all.length || (p?.nb_series ?? 0);
      doneSets += libre ? 0 : done.length;
      const rec = input.records?.[ex.id];
      if (rec) recordCount += 1;
      const recKg = rec?.kg ?? null;
      const pills: SharePill[] = done
        .map((s): SharePill | null => {
          const t = setLabel(s, iso, opts.showLoads);
          if (!t) return null;
          const strong = recKg != null && num(s.kg) === recKg && (rec?.reps == null || num(s.reps) === rec.reps);
          return { text: t, strong };
        })
        .filter((x): x is SharePill => !!x);
      // Une seule pastille or par record (la première qui correspond).
      let gold = false;
      for (const pl of pills) { if (pl.strong && !gold) gold = true; else pl.strong = false; }
      rows.push({
        badge,
        title: name,
        tag: rec ? "Record" : null,
        pills: pills.length ? pills : undefined,
        pillsSummary: pills.length ? setsSummary(done, iso, opts.showLoads) : undefined,
        sub: libre ? null : pills.length === 0 ? "Pas faite" : null,
        dim: !libre && done.length === 0,
      });
    });
  });

  const exCount = main.reduce((a, b) => a + b.exercices.length, 0);
  sections.push({
    type: "rows",
    label: input.done ? null : "Corps de séance",
    right: input.done ? null : `${exCount} exercice${exCount > 1 ? "s" : ""}${totalSets ? ` · ${totalSets} séries` : ""}`,
    rows,
  });

  const stats: ShareCard["stats"] = input.done
    ? [
        ...(totalSets > 0 ? [{ value: String(doneSets), unit: `/${totalSets}`, label: "Séries", color: input.successColor }] : []),
        ...(input.rpe != null ? [{ value: nf(input.rpe, 1), unit: "/10", label: "RPE", color: input.accent }] : []),
        ...(recordCount > 0 ? [{ value: String(recordCount), unit: null, label: recordCount > 1 ? "Records" : "Record", color: input.accent }] : []),
      ]
    : [];

  return {
    kind: "muscu",
    done: input.done,
    accent: input.accent,
    kicker: shareKicker("Musculation", input.done, input.day),
    who: opts.showName && input.athleteFirstName ? `Séance de ${input.athleteFirstName}` : null,
    title: input.title?.trim() || "Séance de musculation",
    meta: [input.weekNumber ? `Semaine ${input.weekNumber}` : null, input.done ? `${exCount} exercice${exCount > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || null,
    stats,
    sections,
    quote: input.done ? input.comment?.trim() || null : null,
    coach: opts.showCoach ? input.coach : null,
    footerRight: input.done ? (recordCount > 0 ? `${recordCount} record${recordCount > 1 ? "s" : ""}` : null) : "Ma séance du jour",
  };
}

/** Record (calculé) tel que lu dans `exercise_pr_logs`. */
export interface SessionRecordLog {
  exercise_ref: string;
  source: string;
  date: string;
  source_kg?: number | null;
  source_reps?: number | null;
}

/**
 * Records battus pendant CETTE séance : record calculé, même référence
 * d'exercice, daté d'un des jours possibles de la séance (prévue / validée),
 * et correspondant à une série réellement faite. Sans série correspondante,
 * rien (pas de faux record sur la carte).
 */
export function sessionRecords(
  logs: readonly SessionRecordLog[] | null | undefined,
  refByEx: Record<string, string | null | undefined>,
  sets: Record<string, readonly MuscuShareSet[] | undefined> | null | undefined,
  days: ReadonlyArray<string | null | undefined>,
): Record<string, { kg: number | null; reps: number | null }> {
  const out: Record<string, { kg: number | null; reps: number | null }> = {};
  const daySet = new Set(days.filter((d): d is string => !!d).map((d) => d.slice(0, 10)));
  if (!logs?.length || daySet.size === 0) return out;
  for (const [exId, ref] of Object.entries(refByEx)) {
    if (!ref) continue;
    const done = (sets?.[exId] ?? []).filter((s) => s.done && !s.skipped);
    if (!done.length) continue;
    const hits = logs.filter((l) => l.source === "computed" && l.exercise_ref === ref && daySet.has(l.date.slice(0, 10)));
    for (const l of hits) {
      const match = done.some((s) => (l.source_kg == null || num(s.kg) === l.source_kg) && (l.source_reps == null || num(s.reps) === l.source_reps));
      if (match) { out[exId] = { kg: l.source_kg ?? null, reps: l.source_reps ?? null }; break; }
    }
  }
  return out;
}
