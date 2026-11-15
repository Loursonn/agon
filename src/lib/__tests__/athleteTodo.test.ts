import { beforeEach, describe, expect, it } from "vitest";
import { buildTodoItems, lastTodoShownDay, markTodoShown, shouldShowTodo, type TodoInput } from "../athleteTodo";
import { isOptedIn, withOptIn } from "@/features/shared/hooks/useHomeSections";

const none: TodoInput = {
  wellnessDone: true, unfinished: [], unreadRetours: 0, unseenFiches: 0, uncommentedComps: [], weeklyReview: null,
};

describe("fenêtre « À faire » : contenu", () => {
  it("rien à faire : liste vide", () => {
    expect(buildTodoItems(none)).toEqual([]);
  });

  it("tout à faire, dans l'ordre : wellness, weekly, séance, retour, fiche, compétition", () => {
    const items = buildTodoItems({
      wellnessDone: false,
      unfinished: [{ id: "w1", sessionName: "Force A" }, { id: "w2", sessionName: "Force B" }],
      unreadRetours: 2,
      unseenFiches: 1,
      uncommentedComps: [{ id: "c1", name: "10 km de Nantes" }],
      weeklyReview: { started: true, submitted: false, lastDay: true },
    });
    expect(items.map((i) => i.kind)).toEqual(["wellness", "weekly_review", "unfinished", "retour", "fiche", "competition"]);
    expect(items[1]).toMatchObject({ title: "Termine ta weekly review", detail: "Dernier jour : elle se ferme ce soir." });
    expect(items[2]).toMatchObject({ targetId: "w1", detail: "Force A (+ 1 autre)" });
    expect(items[3].title).toBe("Ton coach t'a fait 2 retours");
    expect(items[4].title).toBe("Une nouvelle fiche à lire");
    expect(items[5]).toMatchObject({ targetId: "c1", detail: "10 km de Nantes" });
  });

  it("weekly review envoyée, ou désactivée (null) : pas de ligne", () => {
    expect(buildTodoItems({ ...none, weeklyReview: { started: true, submitted: true, lastDay: false } })).toEqual([]);
    expect(buildTodoItems({ ...none, weeklyReview: null })).toEqual([]);
  });
});

describe("fenêtre « À faire » : une fois par jour", () => {
  beforeEach(() => localStorage.clear());
  const items = buildTodoItems({ ...none, wellnessDone: false });

  it("première ouverture du jour avec quelque chose à faire : oui ; deuxième : non ; lendemain : oui", () => {
    expect(shouldShowTodo(lastTodoShownDay("u1"), "2026-11-16", items)).toBe(true);
    markTodoShown("u1", "2026-11-16");
    expect(shouldShowTodo(lastTodoShownDay("u1"), "2026-11-16", items)).toBe(false);
    expect(shouldShowTodo(lastTodoShownDay("u1"), "2026-11-17", items)).toBe(true);
  });

  it("rien à faire : jamais", () => {
    expect(shouldShowTodo(null, "2026-11-16", [])).toBe(false);
  });

  it("par compte : un autre athlète sur le même téléphone la voit aussi", () => {
    markTodoShown("u1", "2026-11-16");
    expect(lastTodoShownDay("u2")).toBeNull();
  });
});

describe("weekly review activée par le coach", () => {
  it("désactivée par défaut, y compris pour les réglages existants", () => {
    expect(isOptedIn(null, "weekly_review")).toBe(false);
    expect(isOptedIn(["nutrition"], "weekly_review")).toBe(false);
    // Une section masquée nommée pareil n'active rien.
    expect(isOptedIn(["weekly_review"], "weekly_review")).toBe(false);
  });

  it("cocher puis décocher garde les autres réglages", () => {
    const on = withOptIn(["nutrition"], "weekly_review", true);
    expect(on).toEqual(["nutrition", "+weekly_review"]);
    expect(isOptedIn(on, "weekly_review")).toBe(true);
    expect(withOptIn(on, "weekly_review", true)).toEqual(["nutrition", "+weekly_review"]);
    expect(withOptIn(on, "weekly_review", false)).toEqual(["nutrition"]);
  });
});
