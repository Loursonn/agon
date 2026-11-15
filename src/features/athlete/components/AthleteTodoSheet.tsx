/**
 * Fenêtre « À faire » (src/lib/athleteTodo.ts) : à la première ouverture de
 * l'app du jour, s'il reste quelque chose à faire. Fermée, elle ne revient que
 * le lendemain. Montée dans AthleteLayout.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { localIsoDay, addDays } from "@shared/domain/dates";
import { activeCompetitions } from "@shared/domain/competitions";
import { openReviewWeek } from "@/lib/weekly-review";
import { buildTodoItems, lastTodoShownDay, markTodoShown, shouldShowTodo, type TodoItem } from "@/lib/athleteTodo";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useUnfinishedWorkouts } from "@/features/shared/hooks/useUnfinishedWorkouts";
import { useAthleteRetours } from "@/features/shared/hooks/useWeeklyCoachRetour";
import { useAthleteDocs } from "@/features/shared/hooks/fiches/useDocs";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useHomeHiddenSections } from "@/features/shared/hooks/useHomeSections";
import { useWeeklyReview } from "@/features/shared/hooks/useWeeklyReview";

interface Props {
  uid: string | null | undefined;
  /** Une autre fenêtre est ouverte (premier lancement, wellness…) ou on est en séance : attendre. */
  blocked: boolean;
}

export function AthleteTodoSheet({ uid, blocked }: Props) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const { athleteId, wellness, loaded, setShowWellness } = useAthleteContext();
  const today = localIsoDay();

  const unfinished = useUnfinishedWorkouts(athleteId);
  const retours = useAthleteRetours(athleteId ?? undefined);
  const docs = useAthleteDocs(athleteId);
  const comps = useCompetitions(athleteId ?? "");
  const home = useHomeHiddenSections(athleteId);
  const weeklyOn = home.isEnabled("weekly_review");
  const reviewWeek = weeklyOn ? openReviewWeek(today) : null;
  const review = useWeeklyReview(athleteId, reviewWeek);

  // Tout est lu (ou en erreur : la ligne manque, la fenêtre s'ouvre quand même).
  const settled = (q: { isPending: boolean; fetchStatus: string }) => !q.isPending || q.fetchStatus === "idle";
  const ready = !!athleteId && loaded && !home.isLoading
    && settled(unfinished) && settled(retours) && settled(docs) && settled(comps) && (!reviewWeek || settled(review));

  const items = useMemo<TodoItem[]>(() => {
    if (!ready) return [];
    return buildTodoItems({
      wellnessDone: !!wellness,
      unfinished: (unfinished.data ?? []).map((w) => ({ id: w.id, sessionName: w.sessionName })),
      unreadRetours: (retours.data ?? []).filter((r) => !r.athlete_reaction).length,
      unseenFiches: (docs.data?.assigned ?? []).filter((a) => !a.seenAt).length,
      uncommentedComps: activeCompetitions(comps.data ?? [])
        .filter((c) => c.date < today && !c.athlete_comment)
        .map((c) => ({ id: c.id, name: c.name })),
      weeklyReview: reviewWeek
        ? { started: !!review.data, submitted: review.data?.status === "submitted", lastDay: today === addDays(reviewWeek, 7) }
        : null,
    });
  }, [ready, wellness, unfinished.data, retours.data, docs.data, comps.data, review.data, reviewWeek, today]);

  const [open, setOpen] = useState(false);
  // Décidé une seule fois, quand tout est lu et qu'aucune autre fenêtre n'est ouverte.
  useEffect(() => {
    if (open || blocked || !ready || !uid) return;
    if (!shouldShowTodo(lastTodoShownDay(uid), today, items)) return;
    markTodoShown(uid, today);
    setOpen(true);
  }, [open, blocked, ready, uid, today, items]);

  if (!open) return null;
  const close = () => setOpen(false);
  const act = (item: TodoItem) => {
    close();
    switch (item.kind) {
      case "wellness": setShowWellness(true); break;
      case "weekly_review": navigate("/athlete/review"); break;
      case "unfinished": navigate(`/athlete/program/workout/${item.targetId}?finish=1`); break;
      case "fiche": navigate("/athlete/program?vue=fiches"); break;
      // Retour du coach et compétition à raconter : sur l'accueil.
      case "retour": case "competition": navigate("/athlete"); break;
    }
  };

  const titleCls = "text-[20px] font-semibold text-agon-tx";
  const content = (
    <div className="flex flex-col gap-3 px-5 pb-[34px] pt-3">
      {isDesktop ? <div id="todo-title" className={titleCls}>À faire aujourd'hui</div> : <DrawerTitle className={titleCls}>À faire aujourd'hui</DrawerTitle>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((item) => (
          <li key={item.kind}>
            <button
              type="button"
              onClick={() => act(item)}
              className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-[14px] border border-agon-brd bg-agon-s2 px-4 py-3 text-left font-[inherit] text-agon-tx"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{item.title}</span>
                {item.detail && <span className="mt-0.5 block text-[12.5px] text-agon-tx2">{item.detail}</span>}
              </span>
              <ChevronRight size={18} className="flex-none text-agon-tx3" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={close} className="min-h-11 cursor-pointer rounded-[12px] border-none bg-transparent text-[14px] text-agon-tx2">
        Plus tard
      </button>
    </div>
  );

  if (isDesktop) {
    return (
      <>
        <div aria-hidden onClick={close} className="fixed inset-0 z-[300] bg-black/40" />
        <div role="dialog" aria-modal="true" aria-labelledby="todo-title" className="fixed left-1/2 top-1/2 z-[301] w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-agon-brd-l bg-agon-s1">
          {content}
        </div>
      </>
    );
  }
  return (
    <Drawer open onOpenChange={(v) => !v && close()}>
      <DrawerContent aria-describedby={undefined} className="rounded-t-[24px] border-t-agon-brd-l bg-agon-s1 p-0">
        {content}
      </DrawerContent>
    </Drawer>
  );
}
