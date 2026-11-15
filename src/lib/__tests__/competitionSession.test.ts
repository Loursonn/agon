import { describe, expect, it } from "vitest";
import {
  competitionSessionFilled,
  competitionSessionSummary,
  competitionSessionToFill,
  dayActivityRoles,
  isCompetitionSession,
  proposedRaceActivity,
  toResultUrl,
} from "../competitionSession";

const warmup = { id: "w", durationS: 1200, startedAt: "2031-05-10T08:30:00Z" };
const race = { id: "r", durationS: 4500, startedAt: "2031-05-10T09:00:00Z" };
const cooldown = { id: "c", durationS: 900, startedAt: "2031-05-10T10:30:00Z" };

describe("compétition = séance à remplir", () => {
  it("compétitions et matchs maintenus seulement", () => {
    expect(isCompetitionSession({ type: "competition", date: "2031-05-10" })).toBe(true);
    expect(isCompetitionSession({ type: "match", date: "2031-05-10" })).toBe(true);
    expect(isCompetitionSession({ type: "stage", date: "2031-05-10" })).toBe(false);
    expect(isCompetitionSession({ type: "competition", date: "2031-05-10", cancelled_at: "2031-05-01T00:00:00Z" })).toBe(false);
    expect(isCompetitionSession({ type: "competition", date: "2031-05-10", cancelled: true })).toBe(false);
  });

  it("remplie dès qu'un bilan, un résultat, un lien ou un RPE est saisi", () => {
    const base = { type: "competition", date: "2031-05-10" };
    expect(competitionSessionFilled(base)).toBe(false);
    expect(competitionSessionFilled({ ...base, athlete_comment: "  " })).toBe(false);
    expect(competitionSessionFilled({ ...base, rpe_score: 8 })).toBe(true);
    expect(competitionSessionFilled({ ...base, result_text: "3-1" })).toBe(true);
    expect(competitionSessionToFill(base, "2031-05-11")).toBe(true);
    expect(competitionSessionToFill(base, "2031-05-10")).toBe(false);
  });

  it("résumé : résultat et RPE", () => {
    expect(competitionSessionSummary({ type: "match", date: "x", result_text: "3-1", rpe_score: 9 })).toBe("3-1 · RPE 9");
    expect(competitionSessionSummary({ type: "match", date: "x" })).toBeNull();
  });

  it("lien : https ajouté, autres protocoles refusés", () => {
    expect(toResultUrl("")).toBeNull();
    expect(toResultUrl(" results.hyrox.com/season-8 ")).toBe("https://results.hyrox.com/season-8");
    expect(toResultUrl("http://example.org/r")).toBe("http://example.org/r");
    expect(toResultUrl("javascript:alert(1)")).toBe("invalid");
    expect(toResultUrl("pas un lien")).toBe("invalid");
    expect(toResultUrl("localhost")).toBe("invalid");
  });
});

describe("activité proposée et échauffement", () => {
  it("sans chrono : la plus longue", () => {
    expect(proposedRaceActivity([warmup, race, cooldown])?.id).toBe("r");
    expect(proposedRaceActivity([{ id: "x", durationS: null, startedAt: null }])).toBeNull();
  });

  it("avec chrono : la plus proche du chrono, sinon la plus longue", () => {
    expect(proposedRaceActivity([warmup, race], 1260)?.id).toBe("w");
    expect(proposedRaceActivity([warmup, race], 4400)?.id).toBe("r");
    // Aucune n'atteint 80 % du chrono : la plus longue quand même.
    expect(proposedRaceActivity([warmup, race], 9000)?.id).toBe("r");
  });

  it("avant la course : échauffement ; après : autre", () => {
    const roles = dayActivityRoles([warmup, race, cooldown], "r");
    expect(roles.get("w")).toBe("echauffement");
    expect(roles.get("r")).toBe("course");
    expect(roles.get("c")).toBe("autre");
    expect(dayActivityRoles([warmup, race], null).get("w")).toBe("autre");
  });
});
