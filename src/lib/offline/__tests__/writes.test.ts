import { describe, it, expect, beforeEach } from "vitest";
import { droppedMessage, logoutWarning, markSentDraft, mergeWriteArgs, resolveWorkoutId, workoutPlanCascade, writeKey, type WriteKind } from "../writes";
import type { WriteOp } from "../writeQueue";
import { ApiError } from "@/api/client";
import { loadDraft, saveDraft, workoutDraftKey } from "@/lib/localDraft";

describe("writeKey", () => {
  it("une clé par séance, par jour, et par type de saisie", () => {
    expect(writeKey("workout.complete", { athleteId: "a", logId: "L1" })).toBe("workout.complete:L1");
    expect(writeKey("workout.rpe", { athleteId: "a", logId: "L1", rpe: 7 })).not.toBe(
      writeKey("workout.complete", { athleteId: "a", logId: "L1" }),
    );
    expect(writeKey("energy.rpe", { athleteId: "a", id: "E1", rpe: 5 })).toBe("energy.rpe:E1");
    expect(writeKey("wellness.day", { athleteId: "a", day: "2026-11-08", form: {} })).toBe("wellness.day:a:2026-11-08");
    expect(writeKey("weight.day", { athleteId: "a", day: "2026-11-08", kg: 70 })).not.toBe(
      writeKey("weight.day", { athleteId: "a", day: "2026-11-09", kg: 70 }),
    );
  });
});

describe("droppedMessage", () => {
  const gone = new ApiError("x", { message: "Séance introuvable", code: "P0002" });
  it("séance retirée par le coach", () => {
    expect(droppedMessage("workout.complete", gone)).toBe("Fin de séance non enregistrée : la séance n'existe plus (ton coach l'a retirée).");
    expect(droppedMessage("energy.complete", gone)).toContain("n'existe plus");
  });
  it("autre refus", () => {
    expect(droppedMessage("wellness.day", new ApiError("x", { message: "non", code: "22023" }))).toBe("Wellness non enregistré : le serveur l'a refusé.");
    expect(droppedMessage("inconnu", null)).toBe("Une saisie non enregistrée : envoi impossible après plusieurs essais.");
  });
});

describe("logoutWarning", () => {
  it("rien en attente : pas de question", () => {
    expect(logoutWarning(0)).toBeNull();
  });
  it("singulier / pluriel", () => {
    expect(logoutWarning(1)).toBe("1 saisie pas encore envoyée sera perdue. Se déconnecter quand même ?");
    expect(logoutWarning(3)).toBe("3 saisies pas encore envoyées seront perdues. Se déconnecter quand même ?");
  });
});

describe("mergeWriteArgs", () => {
  it("2ᵉ validation énergie de la même séance : les champs vides gardent la 1ʳᵉ, blocs fusionnés", () => {
    const first = { athleteId: "a", id: "E1", input: { block_logs: { b1: { done: true } }, actual_duration_min: 40, rpe_score: 7, notes: "dur" } };
    const second = { athleteId: "a", id: "E1", input: { notes: "", block_logs: { b2: { done: true } }, distance_km: 5 } };
    expect(mergeWriteArgs("energy.complete", first, second)).toEqual({
      athleteId: "a", id: "E1",
      input: { block_logs: { b1: { done: true }, b2: { done: true } }, actual_duration_min: 40, rpe_score: 7, notes: "dur", distance_km: 5 },
    });
  });
  it("les autres saisies sont complètes : la plus récente remplace", () => {
    expect(mergeWriteArgs("wellness.day", { form: 1 }, { form: 2 })).toEqual({ form: 2 });
  });
});

describe("séance libre hors ligne (workout.plan)", () => {
  const op = (kind: WriteKind, args: object): WriteOp<WriteKind> => ({
    id: kind, kind, key: writeKey(kind, args as never), args, createdAt: 0, attempts: 0,
  });
  const plan = op("workout.plan", { athleteId: "a", logId: "local", coachId: null, sessionId: "S", sessionName: "Haut", date: "2026-11-08" });
  const entries = op("workout.entries", { athleteId: "a", logId: "local", patch: { sessionSets: {} } });
  const other = op("wellness.day", { athleteId: "a", day: "2026-11-08", form: {} });

  it("une clé par séance créée", () => {
    expect(plan.key).toBe("workout.plan:local");
  });

  it("le serveur avait déjà une séance à cette place : les saisies suivantes vont vers elle", () => {
    const f = workoutPlanCascade(plan, { ok: true, result: { id: "serveur" } })!;
    const moved = f(entries)!;
    expect(moved.args).toEqual({ athleteId: "a", logId: "serveur", patch: { sessionSets: {} }, draftLogId: "local" });
    expect(moved.key).toBe("workout.entries:serveur");
    expect(f(other)).toBe(other);
  });

  it("id du serveur retenu : l'écran resté sur l'id local lit et écrit la bonne séance", () => {
    localStorage.clear();
    expect(resolveWorkoutId("local")).toBe("local");
    workoutPlanCascade(plan, { ok: true, result: { id: "serveur" } });
    expect(resolveWorkoutId("local")).toBe("serveur");
    expect(resolveWorkoutId("autre")).toBe("autre");
    localStorage.clear();
  });

  it("même id côté serveur : rien à réécrire", () => {
    expect(workoutPlanCascade(plan, { ok: true, result: { id: "local" } })).toBeNull();
    expect(workoutPlanCascade(entries, { ok: true, result: null })).toBeNull();
  });

  it("création refusée : ses saisies sont retirées, pas les autres", () => {
    const f = workoutPlanCascade(plan, { ok: false, error: new Error("non") })!;
    expect(f(entries)).toBeNull();
    expect(f(other)).toBe(other);
  });

  it("libellé du refus", () => {
    expect(droppedMessage("workout.plan", new ApiError("x", { message: "non", code: "23502" }))).toBe("Séance ajoutée non enregistrée : le serveur l'a refusée.");
  });
});

describe("markSentDraft (brouillon après envoi par la file)", () => {
  beforeEach(() => localStorage.clear());
  const key = workoutDraftKey("a", "L1");

  it("saisie envoyée = brouillon : marqué synchronisé", () => {
    saveDraft(key, { sessionSets: { e1: [{ done: true, kg: 50 }] } });
    markSentDraft("workout.entries", { athleteId: "a", logId: "L1", patch: { sessionSets: { e1: [{ done: true, kg: 50 }] } } });
    expect(loadDraft(key)?.synced).toBe(true);
  });

  it("brouillon modifié depuis l'envoi : reste à envoyer", () => {
    saveDraft(key, { sessionSets: { e1: [{ done: true, kg: 55 }] } });
    markSentDraft("workout.entries", { athleteId: "a", logId: "L1", patch: { sessionSets: { e1: [{ done: true, kg: 50 }] } } });
    expect(loadDraft(key)?.synced).toBe(false);
  });

  it("séance redirigée vers l'id du serveur : le brouillon de l'écran (id local) est visé", () => {
    const local = workoutDraftKey("a", "local");
    saveDraft(local, { comment: "ok" });
    markSentDraft("workout.complete", { athleteId: "a", logId: "serveur", draftLogId: "local", mods: { comment: "ok" } });
    expect(loadDraft(local)?.synced).toBe(true);
  });

  it("autres saisies : rien", () => {
    saveDraft(key, { comment: "ok" });
    markSentDraft("workout.rpe", { athleteId: "a", logId: "L1", rpe: 7 });
    expect(loadDraft(key)?.synced).toBe(false);
  });
});
