import { describe, it, expect } from "vitest";
import {
  computeOccurrences,
  pickWeekValue,
  resolveExerciceParams,
  resolveVideoRequest,
  setVideoRequest,
  toMultiWeekSession,
} from "@/lib/sessionOccurrence";
import { defaultExerciceParams } from "@/features/coach/components/programmation/types";
import type { Exercice, ProgSession } from "@/features/coach/components/programmation/types";

const p = (nb_series: number) => defaultExerciceParams(nb_series);

describe("pickWeekValue", () => {
  const rec = { "1": "a", "3": "c" };
  it("valeur propre de l'occurrence", () => {
    expect(pickWeekValue(rec, 3)).toBe("c");
  });
  it("reprend la dernière occurrence définie avant", () => {
    expect(pickWeekValue(rec, 2)).toBe("a");
    expect(pickWeekValue(rec, 9)).toBe("c");
  });
  it("avant la première définie → la première", () => {
    expect(pickWeekValue({ "4": "d" }, 1)).toBe("d");
  });
  it("record vide → undefined", () => {
    expect(pickWeekValue({}, 1)).toBeUndefined();
  });
});

describe("resolveExerciceParams", () => {
  it("params plats identiques à chaque occurrence", () => {
    const flat = p(3);
    expect(resolveExerciceParams(flat, 1)).toBe(flat);
    expect(resolveExerciceParams(flat, 12)).toBe(flat);
  });
  it("params par occurrence avec reprise", () => {
    const rec = { "1": p(3), "2": p(5) };
    expect(resolveExerciceParams(rec, 1)?.nb_series).toBe(3);
    expect(resolveExerciceParams(rec, 2)?.nb_series).toBe(5);
    expect(resolveExerciceParams(rec, 7)?.nb_series).toBe(5);
  });
});

describe("toMultiWeekSession", () => {
  const session: ProgSession = {
    id: "s1", name: "Full body", short: "FB", recurrence: "weekly", multi_semaine: false,
    blocs: [{ id: "b1", name: "A", sort_order: 0, exercices: [
      { id: "e1", exercise_id: "x", exercise_name: "Squat", mode: "classique", sort_order: 0, params: p(4) },
    ] }] as ProgSession["blocs"],
  };

  it("convertit sans changer le contenu de chaque occurrence", () => {
    const multi = toMultiWeekSession(session);
    expect(multi.multi_semaine).toBe(true);
    const ex = multi.blocs[0].exercices[0];
    expect(resolveExerciceParams(ex.params, 1)?.nb_series).toBe(4);
    expect(resolveExerciceParams(ex.params, 5)?.nb_series).toBe(4);
  });

  it("ne touche pas une séance déjà par occurrence", () => {
    const multi = toMultiWeekSession(session);
    expect(toMultiWeekSession(multi)).toBe(multi);
  });
});

describe("computeOccurrences", () => {
  it("rang chronologique par séance", () => {
    const occ = computeOccurrences([
      { id: "c", session_id: "A", scheduled_date: "2026-10-15" },
      { id: "a", session_id: "A", scheduled_date: "2026-10-01" },
      { id: "x", session_id: "B", scheduled_date: "2026-10-02" },
      { id: "b", session_id: "A", scheduled_date: "2026-10-08" },
    ]);
    expect(occ.get("a")).toBe(1);
    expect(occ.get("b")).toBe(2);
    expect(occ.get("c")).toBe(3);
    expect(occ.get("x")).toBe(1);
  });
});

describe("resolveVideoRequest", () => {
  const ex: Exercice = { id: "e1", exercise_id: "x", exercise_name: "Squat", mode: "classique", sort_order: 0, params: p(4) };

  it("aucune demande par défaut", () => {
    expect(resolveVideoRequest(ex, 1)).toBeNull();
  });
  it("demandée dès la séance n°3, reprise ensuite, décochée à la n°5", () => {
    let e = setVideoRequest(ex, 3, { requested: true, note: "profil" });
    e = setVideoRequest(e, 5, { requested: false });
    expect(resolveVideoRequest(e, 2)).toBeNull();
    expect(resolveVideoRequest(e, 3)?.note).toBe("profil");
    expect(resolveVideoRequest(e, 4)?.requested).toBe(true);
    expect(resolveVideoRequest(e, 6)).toBeNull();
  });
});
