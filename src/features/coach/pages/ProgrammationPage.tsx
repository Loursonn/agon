import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { Skeleton } from "@/ui/Skeleton";
import { useAuth } from "@/hooks/useAuth";

import { NewBlockModal } from "@/components/coach/CoachComponents";
import type { Session, ExosMap } from "@/features/shared/types/athlete";
import BlockHistoryViewer from "@/features/coach/components/BlockHistoryViewer";
import { useCreateCycleFromBloc } from "@/features/shared/hooks/useCreateCycleFromBloc";
import { ProgrammationView } from "@/features/coach/components/programmation/ProgrammationView";
import { useAthleteCycles, useRescheduleSessionDay } from "@/features/coach/components/programmation/hooks/useProgramCycles";
import { AddMuscuSessionDialog } from "@/features/coach/components/programmation/AddMuscuSessionDialog";
import { CycleBanner, type CycleLite } from "@/features/coach/components/programmation/CycleBanner";
import { EnergySessionsPanel } from "@/features/coach/components/programmation/EnergySessionsPanel";
import { SpecificSessionsPanel } from "@/features/coach/components/programmation/SpecificSessionsPanel";
import { SessionTrashDialog } from "@/features/coach/components/programmation/SessionTrashDialog";
import { ConfirmTrashDialog } from "@/features/coach/components/programmation/ConfirmTrashDialog";
import { DayPickerSheet } from "@/features/coach/components/programmation/DayPickerSheet";

const SUB_TABS = [
  { k: "muscu", l: "Musculation", color: C.ac },
  { k: "energie", l: "Énergétique", color: C.b },
  { k: "specifique", l: "Spécifique", color: C.o },
];

export default function ProgrammationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    athleteId, loaded, viewOnly,
    exos, setExos, sessions, setSessions, blockConfig, setBlockConfig,
    currentWeek, tw, dw,
    showNewBlock, setShowNewBlock, showBlockHistory, setShowBlockHistory,
    blockHistory, setBlockHistory,
    archiveAndNewBlock, updateSessionDay,
    openCycleId, setOpenCycleId,
  } = useAthleteContext();

  const [subTab, setSubTab] = useState("muscu");
  const [showAddMuscu, setShowAddMuscu] = useState(false);
  const [dayPicker, setDayPicker] = useState<{ sessId: string; sessName: string; currentDay: number } | null>(null);
  const [trashedSessions, setTrashedSessions] = useState<Array<{ session: Session; exos: unknown[] }>>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ sessId: string; sessName: string } | null>(null);
  // Tous les cycles de l'athlète (passés, en cours, futurs), triés par date.
  const { data: cyclesList = [], isLoading: cycleLoading } = useAthleteCycles(athleteId);
  const rescheduleDay = useRescheduleSessionDay(athleteId);

  const createCycle = useCreateCycleFromBloc();

  // NOTE: la transformation bloc → cycle ne se fait plus automatiquement.
  // La création de cycle passe désormais explicitement par l'assistant de la frise
  // (CreateCycleAssistant) ou par le bouton « Créer le cycle » du bandeau.
  // L'auto-création silencieuse programmait des séances sans choix de l'utilisateur.

  const todayISO = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

  // Cycle par défaut = celui qui couvre AUJOURD'HUI ; sinon le plus récent.
  const coveringToday = cyclesList.find((c) => c.start_date <= todayISO && todayISO <= c.end_date) ?? null;
  const mostRecent = cyclesList.length ? cyclesList[cyclesList.length - 1] : null;
  const defaultCycle = coveringToday ?? mostRecent;
  // Cycle affiché = cycle ouvert (sélecteur) sinon défaut.
  const activeCycle = cyclesList.find((c) => c.id === openCycleId) ?? defaultCycle ?? null;

  const weeksOf = (s: string, e: string) =>
    Math.max(1, Math.ceil((new Date(e + "T12:00:00").getTime() - new Date(s + "T12:00:00").getTime()) / (7 * 86_400_000)));

  // Ouvre un cycle : charge son contenu (exos/séances) + cale le bloc legacy dessus.
  const selectCycle = useCallback((c: CycleLite) => {
    setOpenCycleId(c.id);
    setBlockConfig((prev) => ({
      ...prev,
      cycleId: c.id,
      blockName: c.name,
      startDate: c.start_date,
      totalWeeks: weeksOf(c.start_date, c.end_date),
      deloadWeek: prev.cycleId === c.id ? prev.deloadWeek : 0,
    }));
  }, [setOpenCycleId, setBlockConfig]);

  // Au chargement / changement de cycle : aligne openCycleId + blockConfig sur le
  // cycle par défaut (couvrant aujourd'hui) si rien n'est encore ouvert/aligné.
  useEffect(() => {
    if (!cyclesList.length) return;
    const target = cyclesList.find((c) => c.id === openCycleId) ?? defaultCycle;
    if (!target) return;
    if (openCycleId !== target.id) setOpenCycleId(target.id);
    if (blockConfig?.cycleId !== target.id) selectCycle(target);
  }, [cyclesList, openCycleId, blockConfig?.cycleId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rescheduleWorkoutLogs(sessId: string, newDay: number) {
    if (!athleteId) return;
    let res: Awaited<ReturnType<typeof rescheduleDay.mutateAsync>>;
    try {
      res = await rescheduleDay.mutateAsync({ sessionId: sessId, newDay });
    } catch {
      toast.error("Calendrier non mis à jour : les séances à venir n'ont pas été déplacées");
      return;
    }
    if (!res) return;
    const { failed, keptByAthlete } = res;
    const kept = keptByAthlete > 0
      ? ` · ${keptByAthlete} séance${keptByAthlete > 1 ? "s" : ""} déplacée${keptByAthlete > 1 ? "s" : ""} par l'athlète conservée${keptByAthlete > 1 ? "s" : ""}`
      : "";
    if (failed > 0) toast.error(`${failed} séance${failed > 1 ? "s" : ""} non déplacée${failed > 1 ? "s" : ""} (conflit de date)${kept}`);
    else toast.success(`Jour modifié — calendrier mis à jour${kept}`, { duration: keptByAthlete > 0 ? 6000 : 4000 });
  }

  function restoreSession(sessionId: string) {
    const item = trashedSessions.find((t) => t.session.id === sessionId);
    if (!item) return;
    setSessions((prev) => [...prev, item.session]);
    setExos((prev) => ({ ...(prev as ExosMap), [sessionId]: item.exos }) as ExosMap);
    setTrashedSessions((prev) => prev.filter((t) => t.session.id !== sessionId));
    toast.success(`"${item.session.name || item.session.short}" restaurée`);
  }

  function trashSession() {
    if (!confirmDelete) return;
    const { sessId, sessName } = confirmDelete;
    const sessObj = sessions.find((s) => s.id === sessId);
    if (sessObj) {
      const sessExos = (exos as Record<string, unknown[]>)[sessId] || [];
      setTrashedSessions((prev) => [...prev, { session: sessObj, exos: sessExos }]);
      setSessions((prev) => prev.filter((s) => s.id !== sessId));
      setExos((prev) => { const next = { ...(prev as ExosMap) }; delete next[sessId]; return next; });
      toast.success(`"${sessName}" déplacée dans la corbeille`);
    }
    setConfirmDelete(null);
  }

  if (!loaded) {
    return (
      <div className="px-agon-lg py-agon-lg md:px-6">
        <Skeleton className="mb-agon-md h-20 rounded-lg bg-agon-s1" />
        <Skeleton className="h-[300px] rounded-lg bg-agon-s1" />
      </div>
    );
  }

  const energyBase = athleteId ? `/coach/athletes/${athleteId}/energy` : "/coach/energy-library";

  return (
    <div className="px-agon-lg pb-16 pt-agon-lg md:px-6">
      <CycleBanner
        loading={cycleLoading || createCycle.isPending}
        activeCycle={activeCycle}
        cyclesList={cyclesList}
        todayISO={todayISO}
        currentWeek={currentWeek}
        totalWeeks={tw}
        deloadWeek={dw}
        legacyName={blockConfig?.blockName}
        legacyStartDate={blockConfig?.startDate}
        viewOnly={viewOnly}
        canCreateCycle={!!blockConfig?.startDate && sessions.length > 0}
        onSelect={selectCycle}
        onCreateCycle={() => {
          if (user && blockConfig && sessions.length > 0) {
            createCycle.mutate({ blockConfig, sessions, athleteId, coachId: user.id });
          }
        }}
      />

      {/* Onglets de la planche CoachProgrammation : carré de couleur par type, soulignement or */}
      <div role="tablist" style={{ display: "flex", borderBottom: `1px solid ${C.brd}`, marginBottom: 16, overflowX: "auto" }}>
        {SUB_TABS.map((t) => {
          const on = subTab === t.k;
          return (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSubTab(t.k)}
              style={{
                height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: on ? 500 : 400, whiteSpace: "nowrap",
                color: on ? C.tx : C.tx2,
                boxShadow: on ? `inset 0 -3px 0 ${C.ac}` : "none",
                background: on ? `linear-gradient(0deg, ${alpha(C.ac, 0.12)}, transparent 70%)` : "transparent",
              }}
            >
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, flex: "none", background: t.color }} />
              {t.l}
            </button>
          );
        })}
      </div>

      {subTab === "muscu" && (
        <ProgrammationView
          athleteId={athleteId}
          cycleId={activeCycle?.id}
          rangeStart={activeCycle?.start_date}
          rangeEnd={activeCycle?.end_date}
        />
      )}

      {subTab === "energie" && (
        <EnergySessionsPanel
          coachId={user?.id ?? ""}
          athleteId={athleteId ?? undefined}
          onNew={() => navigate(`${energyBase}/new`)}
          onImportText={() => navigate(`${energyBase}/new?import=texte`)}
          onEdit={(sessionId: string) => navigate(`${energyBase}/${sessionId}/edit`)}
        />
      )}

      {subTab === "specifique" && (
        <SpecificSessionsPanel
          coachId={user?.id ?? ""}
          athleteId={athleteId ?? undefined}
          onNew={() => navigate(`${energyBase}/new?kind=specifique`)}
          onImportText={() => navigate(`${energyBase}/new?kind=specifique&import=texte`)}
          onEdit={(sessionId: string) => navigate(`${energyBase}/${sessionId}/edit`)}
        />
      )}

      {showAddMuscu && (
        <AddMuscuSessionDialog
          onAdd={(name, short, dayOfWeek, recurrence) => {
            const newSess = { id: crypto.randomUUID(), name, short, day_of_week: dayOfWeek, recurrence };
            setSessions((prev) => [...prev, newSess]);
            toast.success(`Séance "${name}" créée`);
          }}
          onClose={() => setShowAddMuscu(false)}
        />
      )}

      {showTrash && (
        <SessionTrashDialog
          sessions={trashedSessions.map((t) => t.session)}
          onRestore={restoreSession}
          onDeleteForever={(sessionId) => {
            setTrashedSessions((prev) => prev.filter((t) => t.session.id !== sessionId));
            toast.success("Supprimée définitivement");
          }}
          onClose={() => setShowTrash(false)}
        />
      )}

      {confirmDelete && (
        <ConfirmTrashDialog sessionName={confirmDelete.sessName} onConfirm={trashSession} onClose={() => setConfirmDelete(null)} />
      )}

      {showNewBlock && (
        <NewBlockModal
          onStart={archiveAndNewBlock}
          onClose={() => setShowNewBlock(false)}
          onResume={() => setShowNewBlock(false)}
          hasCurrentData={sessions.length > 0 && Object.values(exos).flat().length > 0}
          blockHistory={blockHistory}
          onDelete={(idx) => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}
      {showBlockHistory && (
        <BlockHistoryViewer
          blockHistory={blockHistory}
          onClose={() => setShowBlockHistory(false)}
          onDelete={(idx) => setBlockHistory(blockHistory.filter((_, i) => i !== idx))}
        />
      )}

      {dayPicker && (
        <DayPickerSheet
          sessionName={dayPicker.sessName}
          currentDay={dayPicker.currentDay}
          onClose={() => setDayPicker(null)}
          onPick={async (idx) => {
            const prev = dayPicker;
            setDayPicker(null);
            updateSessionDay(prev.sessId, idx);
            await rescheduleWorkoutLogs(prev.sessId, idx);
          }}
        />
      )}
    </div>
  );
}
