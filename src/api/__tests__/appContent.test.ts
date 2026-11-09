import { describe, it, expect, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { fakeDb, type Row } from "@shared/__tests__/fakeDb";
import { setDbForTests } from "@/api/client";
import {
  appContentKeys, appendUserFeedback, getCitationState, getCoachFeedbacks, getHomeHiddenSections, invalidateRoadmap,
  listAppUpdateReads, listMyRoadmapVotes, listRecentActivity, listUserFeedback, markAppUpdatesSeen, roadmapVoteCounts,
  sendAppFeedback, setCitationLiked, setHomeHiddenSections, subscribeCitationLikes, toggleRoadmapVote,
} from "@/api/appContent";

function setup(tables: Record<string, Row[]> = {}, failOn?: { table: string; op: string }) {
  const fake = fakeDb(tables, failOn);
  let handler: ((p: { new: unknown }) => void) | null = null;
  const removed: string[] = [];
  const channel = (name: string) => {
    const ch = {
      name,
      on: (_e: string, _f: unknown, cb: (p: { new: unknown }) => void) => ((handler = cb), ch),
      subscribe: () => ch,
    };
    return ch;
  };
  const removeChannel = async (ch: { name: string }) => { removed.push(ch.name); };
  setDbForTests({ ...fake.db, channel, removeChannel });
  return { tables: fake.tables, emit: (p: { new: unknown }) => handler?.(p), removed };
}

describe("api/appContent", () => {
  afterEach(() => setDbForTests(null));

  it("nouveautés : lues par id ; marquer vu n'en double aucune", async () => {
    const { tables } = setup({ app_update_reads: [{ user_id: "c", update_id: "n1", seen_at: "2026-11-01" }] });
    expect(await listAppUpdateReads("c")).toEqual({ n1: "2026-11-01" });
    await markAppUpdatesSeen("c", ["n1", "n2"]);
    await markAppUpdatesSeen("c", []);
    expect(tables.app_update_reads.map((r) => r.update_id)).toEqual(["n1", "n2"]);
  });

  it("roadmap : vote / retrait, compteurs agrégés", async () => {
    setup({ roadmap_votes: [{ id: "v0", item_id: "i1", user_id: "x" }] });
    await toggleRoadmapVote("c", "i1", false);
    await toggleRoadmapVote("c", "i2", false);
    expect(await roadmapVoteCounts()).toEqual({ i1: 2, i2: 1 });
    await toggleRoadmapVote("c", "i1", true);
    expect(await listMyRoadmapVotes("c")).toEqual(["i2"]);
  });

  it("invalidateRoadmap : un vote rafraîchit aussi les compteurs", async () => {
    const qc = new QueryClient();
    const keys = [appContentKeys.roadmapVotes("c"), appContentKeys.roadmapVoteCounts, appContentKeys.roadmapItems, appContentKeys.appFeedbackList];
    for (const k of keys) qc.setQueryData(k, 1);
    await invalidateRoadmap(qc);
    expect(keys.map((k) => qc.getQueryState(k)?.isInvalidated)).toEqual([true, true, true, false]);
  });

  it("citation : état, like / unlike, suivi temps réel arrêtable", async () => {
    const s = setup({ citation_likes: [], citation_stats: [{ quote_id: 7, likes: 4 }] });
    expect(await getCitationState("u", 7)).toEqual({ liked: false, count: 4 });
    await setCitationLiked("u", 7, true);
    expect((await getCitationState("u", 7)).liked).toBe(true);
    await setCitationLiked("u", 7, false);
    expect(s.tables.citation_likes).toHaveLength(0);
    expect(await getCitationState("u", 99)).toEqual({ liked: false, count: 0 });

    const seen: number[] = [];
    const stop = subscribeCitationLikes(7, (n) => seen.push(n));
    s.emit({ new: { likes: 5 } });
    s.emit({ new: {} });
    stop();
    expect(seen).toEqual([5]);
    expect(s.removed).toEqual(["citation-stats-7"]);
  });

  it("retour sur l'app : envoi ; refus → lève", async () => {
    const { tables } = setup({ app_feedback: [] });
    await sendAppFeedback({ authorId: "a", kind: "bug", content: "Écran blanc", userAgent: "UA" });
    expect(tables.app_feedback[0]).toMatchObject({ author_id: "a", kind: "bug", page: null, user_agent: "UA" });
    setup({}, { table: "app_feedback", op: "insert" });
    await expect(sendAppFeedback({ authorId: "a", kind: "bug", content: "x" })).rejects.toThrow(/Retour non envoyé/);
  });

  it("avis app_data : ajout sur la liste relue en base ; lecture ratée → rien n'est écrasé", async () => {
    const { tables } = setup({ app_data: [
      { athlete_id: "a", key: "app:user_feedback", value: { entries: [{ id: "1", date: "d", rating: 4 }] } },
      { athlete_id: "a", key: "asp:coach_feedback", value: { 3: { note: "ok" } } },
    ] });
    expect(await getCoachFeedbacks("a")).toEqual({ 3: { note: "ok" } });
    expect(await getCoachFeedbacks("b")).toEqual({});
    const list = await appendUserFeedback("a", { id: "2", date: "d", rating: 5 });
    expect(list.map((e) => e.id)).toEqual(["1", "2"]);
    expect(await listUserFeedback("a")).toHaveLength(2);
    expect(tables.app_data).toHaveLength(2);

    const s2 = setup({ app_data: [{ athlete_id: "a", key: "app:user_feedback", value: { entries: [{ id: "1" }] } }] }, { table: "app_data", op: "select" });
    await expect(appendUserFeedback("a", { id: "2", date: "d", rating: 5 })).rejects.toThrow();
    expect((s2.tables.app_data[0].value as { entries: unknown[] }).entries).toHaveLength(1);
  });

  it("sections de l'accueil : null si jamais réglées, puis la liste du coach", async () => {
    setup({ profiles: [{ id: "a", home_hidden_sections: null }] });
    expect(await getHomeHiddenSections("a")).toBeNull();
    await setHomeHiddenSections("a", ["trend"]);
    expect(await getHomeHiddenSections("a")).toEqual(["trend"]);
  });

  it("activité récente : séances validées (workout_logs) et wellness, une par athlète et par type", async () => {
    setup({
      workout_logs: [
        { athlete_id: "a", status: "completed", completed_at: "2026-11-08T08:00:00Z" },
        { athlete_id: "a", status: "completed", completed_at: "2026-11-07T08:00:00Z" },
        { athlete_id: "b", status: "planned", completed_at: null },
        { athlete_id: "b", status: "completed", completed_at: "2026-11-06T08:00:00Z" },
        { athlete_id: "z", status: "completed", completed_at: "2026-11-08T09:00:00Z" },
      ],
      wellness_entries: [
        { athlete_id: "b", day: "2026-11-07", archived: false, updated_at: "2026-11-08T07:00:00Z" },
        { athlete_id: "b", day: "2026-11-06", archived: false, updated_at: "2026-11-07T07:00:00Z" },
        // archivage d'un bloc : pas une saisie
        { athlete_id: "a", day: "2026-09-01", archived: true, updated_at: "2026-11-08T10:00:00Z" },
        // athlète hors liste
        { athlete_id: "z", day: "2026-11-07", archived: false, updated_at: "2026-11-08T11:00:00Z" },
      ],
    });
    const rows = await listRecentActivity(["a", "b"], 10);
    expect(rows.map((r) => [r.athleteId, r.type])).toEqual([["a", "session"], ["b", "wellness"], ["b", "session"]]);
    expect(await listRecentActivity([], 10)).toEqual([]);
    expect(await listRecentActivity(["a", "b"], 1)).toHaveLength(1);
  });
});
