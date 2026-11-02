/**
 * `set_exercise_video` : vidéo de démo d'un exercice de la banque, posée par
 * l'assistant, appliquée puis annulée comme le reste.
 */
import { describe, expect, it } from "vitest";
import { applyDraft, parseUndo, undoSteps } from "../coachApiApply";
import { parseYoutubeId, type ProgSessionShape, validateDraft, type VideoBank, videoKey } from "../coachApiOps";
import { fakeDb, type Row } from "./fakeDb";

const A = "athlete-1";
const COACH = "coach-1";
const ID = "dQw4w9WgXcQ";
const OTHER = "abcdefghijk";

const prog: ProgSessionShape[] = [{
  id: "s1", name: "Bas du corps", short: "A", day_of_week: 0, recurrence: "weekly", multi_semaine: false,
  blocs: [{ id: "b1", name: "Force", sort_order: 0, exercices: [
    { id: "e1", exercise_id: "x-squat", exercise_name: "Squat", mode: "classique", sort_order: 0,
      params: { nb_series: 4, reps: { mode: "global", value: 8 }, charge_unit: "kg" } },
  ] }],
}] as ProgSessionShape[];

function bank(canEdit = true, extra: VideoBank["byName"] = new Map()): VideoBank {
  const byName = new Map(extra);
  byName.set(videoKey("Squat"), [{ id: "x-squat", name: "Squat", youtube_id: null }]);
  byName.set(videoKey("Fente"), [{ id: "x-fente", name: "Fente", youtube_id: OTHER }]);
  return { canEdit, byName };
}

function validate(ops: unknown[], videos: VideoBank = bank()) {
  return validateDraft({ kind: "programme", title: "Vidéos", ops }, { prog, newId: () => "n", videos });
}

describe("parseYoutubeId", () => {
  it.each([
    [ID, ID],
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`https://m.youtube.com/watch?v=${ID}&t=42s`, ID],
    [`youtube.com/watch?feature=share&v=${ID}`, ID],
    [`https://youtu.be/${ID}?si=xyz`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://www.youtube.com/embed/${ID}`, ID],
    [`https://www.youtube-nocookie.com/embed/${ID}`, ID],
    [`  ${ID}  `, ID],
  ])("%s", (input, out) => expect(parseYoutubeId(input)).toBe(out));

  it.each(["", "abc", "https://vimeo.com/123456789", `https://evil.com/watch?v=${ID}`, "https://www.youtube.com/watch?v=short", "javascript:alert(1)"])(
    "refuse %s",
    (input) => expect(parseYoutubeId(input)).toBeNull(),
  );
});

describe("validation", () => {
  it("nom exact, casse ignorée → id et nom de la banque", () => {
    const r = validate([{ op: "set_exercise_video", exercise_name: "  sQuAt ", youtube: `https://youtu.be/${ID}` }]);
    expect(r).toEqual({ ok: true, value: expect.objectContaining({
      ops: [{ op: "set_exercise_video", exercise_id: "x-squat", exercise_name: "Squat", youtube_id: ID }],
    }) });
  });

  it("exercice introuvable ou ambigu", () => {
    expect(validate([{ op: "set_exercise_video", exercise_name: "Squat bulgare", youtube: ID }]))
      .toEqual({ ok: false, error: expect.stringContaining("aucun exercice de la banque") });
    const twice = new Map([[videoKey("Tirage"), [
      { id: "t1", name: "Tirage", youtube_id: null }, { id: "t2", name: "tirage", youtube_id: null },
    ]]]);
    expect(validate([{ op: "set_exercise_video", exercise_name: "Tirage", youtube: ID }], bank(true, twice)))
      .toEqual({ ok: false, error: expect.stringContaining("2 exercices de la banque") });
  });

  it("réservé aux coachs certifiés / admins", () => {
    expect(validate([{ op: "set_exercise_video", exercise_name: "Squat", youtube: ID }], bank(false)))
      .toEqual({ ok: false, error: expect.stringContaining("coachs certifiés") });
  });

  it("vidéo déjà en place : refus sans remplacer, avec l'ID actuel", () => {
    expect(validate([{ op: "set_exercise_video", exercise_name: "Fente", youtube: ID }]))
      .toEqual({ ok: false, error: expect.stringContaining(OTHER) });
    expect(validate([{ op: "set_exercise_video", exercise_name: "Fente", youtube: ID, remplacer: true }]).ok).toBe(true);
    // Même vidéo : accepté (rien ne changera)
    expect(validate([{ op: "set_exercise_video", exercise_name: "Fente", youtube: OTHER }]).ok).toBe(true);
  });

  it("URL non YouTube, champ inconnu, doublon", () => {
    expect(validate([{ op: "set_exercise_video", exercise_name: "Squat", youtube: "https://vimeo.com/1" }]).ok).toBe(false);
    expect(validate([{ op: "set_exercise_video", exercise_name: "Squat", youtube: ID, url: "x" }]).ok).toBe(false);
    expect(validate([
      { op: "set_exercise_video", exercise_name: "Squat", youtube: ID },
      { op: "set_exercise_video", exercise_name: "squat", youtube: OTHER },
    ])).toEqual({ ok: false, error: expect.stringContaining("déjà donnée") });
  });
});

describe("application et annulation", () => {
  function setup(profile: Row = { id: COACH, is_admin: false, is_certified_coach: true }) {
    return fakeDb({
      app_data: [{ athlete_id: A, key: "asp:prog", value: prog }],
      profiles: [profile],
      exercises: [
        { id: "x-squat", name: "Squat", youtube_id: null },
        { id: "x-fente", name: "Fente", youtube_id: OTHER },
      ],
    });
  }
  const ops = () => {
    const r = validate([
      { op: "set_exercise_video", exercise_name: "Squat", youtube: ID },
      { op: "set_exercise_video", exercise_name: "Fente", youtube: `https://youtu.be/${ID}`, remplacer: true },
    ]);
    if (!r.ok) throw new Error(r.error);
    return r.value.ops;
  };

  it("pose les vidéos sans toucher au programme, puis les retire", async () => {
    const { db, tables } = setup();
    const progBefore = structuredClone(tables.app_data);
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: ops() });
    expect(tables.exercises.map((e) => e.youtube_id)).toEqual([ID, ID]);
    expect(tables.app_data).toEqual(progBefore);
    expect(res.undo).toEqual([
      { t: "exercise_video", exercise_id: "x-squat", before: null, after: ID },
      { t: "exercise_video", exercise_id: "x-fente", before: OTHER, after: ID },
    ]);
    await undoSteps(db, A, COACH, parseUndo(JSON.parse(JSON.stringify(res.undo))));
    expect(tables.exercises.map((e) => e.youtube_id)).toEqual([null, OTHER]);
  });

  it("même vidéo : rien n'est écrit ni journalisé", async () => {
    const { db } = setup();
    const r = validate([{ op: "set_exercise_video", exercise_name: "Fente", youtube: OTHER }]);
    if (!r.ok) throw new Error(r.error);
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: r.value.ops });
    expect(res.undo).toEqual([]);
  });

  it("l'annulation laisse une vidéo changée depuis", async () => {
    const { db, tables } = setup();
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: ops() });
    tables.exercises[0].youtube_id = "zzzzzzzzzzz";
    await undoSteps(db, A, COACH, res.undo);
    expect(tables.exercises.map((e) => e.youtube_id)).toEqual(["zzzzzzzzzzz", OTHER]);
  });

  it("droits revérifiés à l'application", async () => {
    const { db, tables } = setup({ id: COACH, is_admin: false, is_certified_coach: false });
    await expect(applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: ops() }))
      .rejects.toThrow("coachs certifiés");
    expect(tables.exercises.map((e) => e.youtube_id)).toEqual([null, OTHER]);
  });

  it("vidéo posée entre le dépôt et l'application : refus, tout est défait", async () => {
    const { db, tables } = setup();
    const r = validate([
      { op: "set_exercise_video", exercise_name: "Fente", youtube: ID, remplacer: true },
      { op: "set_exercise_video", exercise_name: "Squat", youtube: ID },
    ]);
    if (!r.ok) throw new Error(r.error);
    tables.exercises[0].youtube_id = OTHER;
    await expect(applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: r.value.ops }))
      .rejects.toThrow(OTHER);
    expect(tables.exercises.map((e) => e.youtube_id)).toEqual([OTHER, OTHER]);
  });

  it("mêlée à des modifications du programme : les deux s'appliquent", async () => {
    const { db, tables } = setup();
    const r = validate([
      { op: "update_exercice", session_id: "s1", exercice_id: "e1", comment: "Descends lentement" },
      { op: "set_exercise_video", exercise_name: "Squat", youtube: ID },
    ]);
    if (!r.ok) throw new Error(r.error);
    const res = await applyDraft({ db, athleteId: A, coachId: COACH, kind: "programme", ops: r.value.ops });
    const p = tables.app_data[0].value as ProgSessionShape[];
    expect(p[0].blocs[0].exercices[0].comment).toBe("Descends lentement");
    expect(tables.exercises[0].youtube_id).toBe(ID);
    await undoSteps(db, A, COACH, res.undo);
    expect((tables.app_data[0].value as ProgSessionShape[])[0].blocs[0].exercices[0].comment).toBeUndefined();
    expect(tables.exercises[0].youtube_id).toBeNull();
  });
});
