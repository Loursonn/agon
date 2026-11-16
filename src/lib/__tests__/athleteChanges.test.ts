import { describe, expect, it } from "vitest";
import {
  athleteChanges, describeChange, markChangesSeen, readSeenChanges, recentChanges, toAthleteChange, unseenChanges,
  type AthleteChangeInput,
} from "../athleteChanges";

const base = (over: Partial<AthleteChangeInput>): AthleteChangeInput => ({
  id: "w", sessionName: "Force A", scheduledDate: "2026-11-12", recordedOriginalDate: null,
  rescheduledByAthlete: false, coachAlert: false, athleteModifications: null, updatedAt: null, ...over,
});

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("toAthleteChange", () => {
  it("une simple saisie n'est pas une modification", () => {
    expect(toAthleteChange(base({ athleteModifications: { sessionSets: { e: [{ kg: 80 }] } } as never }))).toBeNull();
  });
  it("séance déplacée par l'athlète : date d'origine gardée", () => {
    expect(toAthleteChange(base({ rescheduledByAthlete: true, recordedOriginalDate: "2026-11-10" }))).toMatchObject({
      moved: true, movedFrom: "2026-11-10", key: "w@2026-11-12",
    });
  });
  it("déplacée sans date d'origine connue : modification quand même", () => {
    expect(toAthleteChange(base({ rescheduledByAthlete: true }))).toMatchObject({ moved: true, movedFrom: null });
  });
  it("remise à sa date d'origine : plus rien à signaler", () => {
    expect(toAthleteChange(base({ rescheduledByAthlete: true, recordedOriginalDate: "2026-11-12" }))).toBeNull();
  });
  it("exercice ajouté pendant la séance : une modification", () => {
    const c = toAthleteChange(base({ athleteModifications: { addedExercises: [{ id: "ajout-1", name: "Curl" }] } }));
    expect(c).toMatchObject({ addedSets: 0, addedExercises: 1 });
  });
  it("séries et exercices ajoutés (ancien format)", () => {
    const c = toAthleteChange(base({ athleteModifications: { bonusSets: [{ sets: [1, 2] }, { sets: [3] }], customExercises: [{}] } }));
    expect(c).toMatchObject({ moved: false, addedSets: 3, addedExercises: 1 });
  });
});

describe("liste, fenêtre et déjà vues", () => {
  const logs = [
    base({ id: "vieux", scheduledDate: "2026-09-01", rescheduledByAthlete: true }),
    base({ id: "recent", scheduledDate: "2026-11-10", rescheduledByAthlete: true, recordedOriginalDate: "2026-11-09" }),
    base({ id: "avenir", scheduledDate: "2026-11-20", rescheduledByAthlete: true, recordedOriginalDate: "2026-11-18" }),
    base({ id: "saisie", scheduledDate: "2026-11-14", athleteModifications: { sessionComment: "ok" } as never }),
  ];

  it("trie, garde les 4 dernières semaines et l'à-venir, sans les saisies", () => {
    const recent = recentChanges(athleteChanges(logs), "2026-11-15");
    expect(recent.map((c) => c.id)).toEqual(["avenir", "recent"]);
  });

  it("une modif vue ne compte plus ; un nouveau déplacement de la même séance revient", () => {
    const s = memStore();
    const recent = recentChanges(athleteChanges(logs), "2026-11-15");
    const seen = markChangesSeen("coach", "a", recent.map((c) => c.key), s);
    expect(unseenChanges(recent, seen)).toEqual([]);
    expect(readSeenChanges("coach", "a", s)).toEqual(seen);
    expect(readSeenChanges("autre-coach", "a", s).size).toBe(0);

    const movedAgain = athleteChanges([{ ...logs[1], scheduledDate: "2026-11-11" }]);
    expect(unseenChanges(movedAgain, seen).map((c) => c.id)).toEqual(["recent"]);
  });

  it("stockage illisible : rien n'est considéré comme vu", () => {
    const s = { getItem: () => "{pas du json", setItem: () => {} };
    expect(readSeenChanges("coach", "a", s).size).toBe(0);
  });
});

describe("describeChange", () => {
  const fmt = (d: string) => d.slice(5);
  it("phrase courte", () => {
    expect(describeChange(toAthleteChange(base({ rescheduledByAthlete: true, recordedOriginalDate: "2026-11-10" }))!, fmt))
      .toBe("déplacée du 11-10 au 11-12");
    expect(describeChange(toAthleteChange(base({ rescheduledByAthlete: true, athleteModifications: { bonusSets: [{ sets: [1] }] } }))!, fmt))
      .toBe("déplacée au 11-12 · +1 série bonus");
  });
});
