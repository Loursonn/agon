/**
 * Semaine d'entraînement proposée par l'assistant IA d'un coach.
 *
 * Ce qui est vérifié : une semaine ne fait qu'ajouter (créer, placer, poser
 * un thème), cite seulement des séances qui existent ou qu'elle crée, reste
 * dans le futur proche, et s'applique deux fois sans rien dupliquer.
 */
import { describe, expect, it } from "vitest";
import {
  applyWeekProgOps,
  type DraftOp,
  type ProgSessionShape,
  validateDraft,
  type WeekOp,
} from "../coachApiOps";
import type { EnergySessionShape } from "../coachApiEnergy";

const TODAY = "2026-11-02";

function prog(): ProgSessionShape[] {
  return [{
    id: "s1", name: "Bas du corps", short: "A", day_of_week: 0, recurrence: "weekly", multi_semaine: false,
    blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [] }],
  }];
}

let n = 0;
const ctx = (extra: Record<string, unknown> = {}) => ({
  prog: prog(),
  newId: () => `id-${++n}`,
  today: TODAY,
  energy: new Map([["bank-1", { name: "Footing 40'" }]]),
  library: new Map([["squat", { id: "lib-squat", name: "Squat" }]]),
  ...extra,
});

const week = (ops: unknown[]) => ({ kind: "semaine", title: "Semaine 45", body: "Charge en hausse.", ops });

const vma = {
  op: "create_energy_session",
  ref: "vma",
  name: "VMA 6 × 400",
  session_kind: "vo2",
  intervals: [
    { type: "interval", role: "warmup", duration: { kind: "time", value: 600 }, target: { kind: "hr_zone", zone: 2 } },
    {
      type: "group", repeat: 6, children: [
        { type: "interval", role: "work", duration: { kind: "distance", value: 400 }, target: { kind: "pace_test_pct", test_metric: "VMA", min: 95, max: 100 }, equipment: "course" },
        { type: "interval", role: "recovery", duration: { kind: "time", value: 60 } },
      ],
    },
  ],
};

const force = {
  op: "create_session",
  ref: "force",
  name: "Force haut 2",
  blocs: [{ name: "A", category: "Force", exercices: [{ exercise_name: "squat", params: { nb_series: 5, reps: 3, rir: 2 } }] }],
};

function ok(raw: unknown, c = ctx()) {
  const r = validateDraft(raw, c);
  if (!r.ok) throw new Error(r.error);
  return r.value.ops as WeekOp[];
}

function err(raw: unknown, c = ctx()) {
  const r = validateDraft(raw, c);
  if (r.ok) throw new Error("accepté à tort");
  return r.error;
}

describe("semaine — validation", () => {
  it("accepte une semaine complète et résout les ref vers les ids créés", () => {
    const ops = ok(week([
      force,
      vma,
      { op: "place_session", date: "2026-11-03", ref: "force" },
      { op: "place_session", date: "2026-11-05", session_id: "s1" },
      { op: "place_energy_session", date: "2026-11-04", ref: "vma" },
      { op: "place_energy_session", date: "2026-11-06", energy_session_id: "bank-1" },
      { op: "set_day_theme", date: "2026-11-03", intensity: "hard", dominante: "force", label: "Jambes lourdes" },
    ]));
    const created = ops[0] as Extract<WeekOp, { op: "create_session" }>;
    const energy = ops[1] as Extract<WeekOp, { op: "create_energy_session" }>;
    expect(ops[2]).toEqual({ op: "place_session", date: "2026-11-03", session_id: created.session.id });
    expect(ops[4]).toEqual({ op: "place_energy_session", date: "2026-11-04", energy_session_id: energy.energy.id, name: "VMA 6 × 400" });
    expect(ops[5]).toMatchObject({ energy_session_id: "bank-1", name: "Footing 40'" });
    // Couleur déduite de l'intensité, comme le raccourci du calendrier.
    expect(ops[6]).toMatchObject({ color: "#ef4444", note: "" });
  });

  it("crée une séance ponctuelle, sans jour fixe, reliée à la bibliothèque", () => {
    const [op] = ok(week([force]));
    const s = (op as Extract<WeekOp, { op: "create_session" }>).session;
    expect(s).toMatchObject({ name: "Force haut 2", short: "FH2", recurrence: "once", multi_semaine: false });
    expect(s.day_of_week).toBeUndefined();
    expect(s.blocs[0]).toMatchObject({ category: "Force", series_mode: "libre", timing_mode: "libre", sort_order: 0 });
    expect(s.blocs[0].exercices[0]).toMatchObject({ exercise_id: "lib-squat", exercise_name: "Squat", sort_order: 0 });
  });

  it("donne des ids à chaque étape énergétique et déduit la structure", () => {
    const [op] = ok(week([vma]));
    const e = (op as Extract<WeekOp, { op: "create_energy_session" }>).energy as EnergySessionShape;
    expect(e.structure_type).toBe("fractionne");
    expect(e.intervals[1]).toMatchObject({ type: "group", role: "work", repeat: 6 });
    const ids = [e.id, ...e.intervals.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
    // Pas de cible = cible « none », comme dans l'éditeur.
    const group = e.intervals[1] as Extract<EnergySessionShape["intervals"][number], { type: "group" }>;
    expect(group.children[1]).toMatchObject({ target: { kind: "none" } });
  });

  it("refuse une date passée ou trop lointaine", () => {
    expect(err(week([{ op: "place_session", date: "2026-11-01", session_id: "s1" }]))).toContain("date passée");
    expect(err(week([{ op: "place_session", date: "2027-02-01", session_id: "s1" }]))).toContain("56 jours");
    expect(err(week([{ op: "place_session", date: "03/11/2026", session_id: "s1" }]))).toContain("AAAA-MM-JJ");
  });

  it("refuse une séance inconnue, une ref non créée, une séance énergétique hors banque", () => {
    expect(err(week([{ op: "place_session", date: TODAY, session_id: "nope" }]))).toContain("introuvable");
    expect(err(week([{ op: "place_session", date: TODAY, ref: "force" }]))).toContain("create_session avant");
    expect(err(week([{ op: "place_energy_session", date: TODAY, energy_session_id: "autre-athlete" }]))).toContain("introuvable");
  });

  it("refuse deux thèmes le même jour, un thème vide, une ref réutilisée", () => {
    expect(err(week([
      { op: "set_day_theme", date: TODAY, label: "A" },
      { op: "set_day_theme", date: TODAY, label: "B" },
    ]))).toContain("un seul thème");
    expect(err(week([{ op: "set_day_theme", date: TODAY, note: "rien d'autre" }]))).toContain("label, intensity ou dominante");
    expect(err(week([force, force]))).toContain("déjà utilisée");
  });

  it("refuse les valeurs hors liste, en nommant le champ", () => {
    expect(err(week([{ op: "set_day_theme", date: TODAY, dominante: "cardio" }]))).toContain("ops[0].dominante");
    const bad = structuredClone(vma);
    (bad.intervals[1].children![0] as { target: unknown }).target = { kind: "pace_test_pct", test_metric: "VO2", min: 95, max: 100 };
    expect(err(week([bad]))).toContain("ops[0].intervals[1].children[0].target.test_metric");
  });

  it("refuse toute opération de suppression ou de modification", () => {
    expect(err(week([{ op: "remove_exercice", session_id: "s1", exercice_id: "e1" }]))).toContain("ops[0].op");
  });
});

describe("semaine — application au programme", () => {
  it("ajoute les séances créées, une seule fois même appliquée deux fois", () => {
    const ops = ok(week([force, { op: "place_session", date: TODAY, ref: "force" }])) as DraftOp[];
    const once = applyWeekProgOps(prog(), ops);
    expect(once).toHaveLength(2);
    expect(applyWeekProgOps(once, ops)).toBe(once);
  });

  it("ne touche pas au programme si la semaine ne crée rien", () => {
    const p = prog();
    expect(applyWeekProgOps(p, ok(week([{ op: "place_session", date: TODAY, session_id: "s1" }])))).toBe(p);
  });
});
