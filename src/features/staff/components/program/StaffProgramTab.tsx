/**
 * Onglet Programme du pro : le planning de l'athlète en lecture seule.
 *  - Semaine (par défaut) : 7 colonnes sur ordinateur, un jour par carte sur
 *    mobile ; chaque séance écrite en entier.
 *  - Mois : calendrier compact façon planning coach ; un clic ouvre la semaine.
 * Si le pro a les fiches en écriture, il pose des fiches sur les jours.
 */
import { useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { errorMessage } from "@/lib/errors";
import { useFicheViewer } from "@/features/shared/hooks/fiches/useFicheViewer";
import { FicheViewerHost } from "@/features/shared/components/fiches/FicheViewerHost";
import { useUnscheduleDoc, type ScheduledDoc } from "@/features/shared/hooks/fiches/useDocSchedule";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import type { MyStaffAthlete } from "../../hooks/useMyStaffLinks";
import { useStaffProgram } from "../../hooks/useStaffProgram";
import { canWrite } from "../../lib/staffPermissions";
import { StaffDayCard } from "./StaffDayCard";
import { ScheduleFicheDialog } from "./ScheduleFicheDialog";

type View = "week" | "month";
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function EnergyPreview({ id, athleteId, onClose }: { id: string; athleteId: string; onClose: () => void }) {
  const { data } = useEnergySession(id);
  if (!data) return null;
  return <SessionPreviewModal session={data} athleteId={athleteId} onClose={onClose} />;
}

export function StaffProgramTab({ link }: { link: MyStaffAthlete }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const viewer = useFicheViewer();
  const unschedule = useUnscheduleDoc(link.athleteId);
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [addingOn, setAddingOn] = useState<Date | null>(null);
  const [energyId, setEnergyId] = useState<string | null>(null);

  const { start, end, days } = useMemo(() => {
    const s = view === "week" ? startOfWeek(anchor, { weekStartsOn: 1 }) : startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
    const e = view === "week" ? endOfWeek(anchor, { weekStartsOn: 1 }) : endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
    const list: Date[] = [];
    for (let d = s; d <= e; d = addDays(d, 1)) list.push(d);
    return { start: s, end: e, days: list };
  }, [view, anchor]);

  const range = useMemo(() => ({ start: iso(start), end: iso(end) }), [start, end]);
  const { isLoading, eventsByDate, sessionsById, occurrences, scheduleByDate } = useStaffProgram(link.athleteId, range);

  const writable = canWrite(link.permissions, "fiches") && !!link.coachId;
  const today = new Date();
  const canRemove = (f: ScheduledDoc) =>
    canWrite(link.permissions, "fiches") && (f.added_by === user?.id || (link.canEditCoachContent && f.added_by === link.coachId));
  const authorLabel = (f: ScheduledDoc) =>
    f.added_by === user?.id ? "toi" : f.added_by && f.added_by === link.coachId ? (link.coachName ?? "le coach") : "un autre pro";

  function remove(f: ScheduledDoc) {
    unschedule.mutate(f.id, {
      onSuccess: () => toast.success("Fiche retirée de ce jour"),
      onError: (e) => toast.error(errorMessage(e, "Impossible de retirer la fiche")),
    });
  }

  const step = (dir: 1 | -1) => setAnchor((a) => (view === "week" ? addWeeks(a, dir) : addMonths(a, dir)));
  const title = view === "week"
    ? `${format(start, "d MMM", { locale: fr })} → ${format(end, "d MMM yyyy", { locale: fr })}`
    : format(anchor, "MMMM yyyy", { locale: fr });

  const seg = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px", border: "none", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 12,
    background: on ? C.s1 : "transparent", color: on ? C.tx : C.tx3, fontWeight: on ? 700 : 500,
  });
  const navBtn: React.CSSProperties = {
    padding: "6px 11px", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2,
    fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  };

  const dayCard = (d: Date) => (
    <StaffDayCard
      key={iso(d)}
      date={d}
      iso={iso(d)}
      isToday={isSameDay(d, today)}
      athleteId={link.athleteId}
      events={eventsByDate.get(iso(d)) ?? []}
      fiches={scheduleByDate.get(iso(d)) ?? []}
      sessionsById={sessionsById}
      occurrences={occurrences}
      canAddFiche={writable}
      canRemoveFiche={canRemove}
      authorLabel={authorLabel}
      onAddFiche={() => setAddingOn(d)}
      onRemoveFiche={remove}
      onOpenFiche={viewer.open}
      onOpenEnergy={setEnergyId}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, background: C.s2, borderRadius: 4, padding: 3 }}>
          <button style={seg(view === "week")} onClick={() => setView("week")}>Semaine</button>
          <button style={seg(view === "month")} onClick={() => setView("month")}>Mois</button>
        </div>
        <button style={navBtn} onClick={() => step(-1)} aria-label="Précédent">‹</button>
        <button style={navBtn} onClick={() => setAnchor(new Date())}>Aujourd'hui</button>
        <button style={navBtn} onClick={() => step(1)} aria-label="Suivant">›</button>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.tx, textTransform: "capitalize", flex: 1, minWidth: 160 }}>{title}</div>
        {isLoading && <span style={{ fontSize: 11, color: C.tx3 }}>Chargement…</span>}
      </div>

      {view === "week" ? (
        isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{days.map(dayCard)}</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(180px, 1fr))", gap: 8, alignItems: "stretch" }}>
              {days.map(dayCard)}
            </div>
          </div>
        )
      ) : (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginBottom: 4 }}>
            {DOW.map((d) => <div key={d} style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textAlign: "center", textTransform: "uppercase" }}>{isMobile ? d[0] : d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
            {days.map((d) => {
              const evs = eventsByDate.get(iso(d)) ?? [];
              const fis = scheduleByDate.get(iso(d)) ?? [];
              const inMonth = isSameMonth(d, anchor);
              const isToday = isSameDay(d, today);
              return (
                <button key={iso(d)} onClick={() => { setAnchor(d); setView("week"); }}
                  title="Voir la semaine"
                  style={{
                    minHeight: isMobile ? 54 : 118, textAlign: "left", display: "flex", flexDirection: "column", gap: 3,
                    padding: isMobile ? 4 : 6, borderRadius: 4, cursor: "pointer", fontFamily: "inherit", overflow: "hidden",
                    background: inMonth ? C.s1 : "transparent", border: "1px solid " + (isToday ? C.ac + "80" : C.brd), opacity: inMonth ? 1 : 0.45,
                  }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: isToday ? C.ac : C.tx2 }}>{d.getDate()}</span>
                  {isMobile ? (
                    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                      {evs.map((e) => <span key={e.id} style={{ width: 6, height: 6, borderRadius: "50%", background: e.type === "workout" ? C.ac : e.type === "energy" ? C.b : e.type === "competition" ? C.r : C.tx3 }} />)}
                      {fis.length > 0 && <span style={{ fontSize: 8 }}>📄</span>}
                    </div>
                  ) : (
                    <>
                      {evs.slice(0, 4).map((e) => (
                        <span key={e.id} style={{
                          fontSize: 10.5, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          borderLeft: "2px solid " + (e.type === "workout" ? C.ac : e.type === "energy" ? C.b : e.type === "competition" ? C.r : C.tx3),
                          paddingLeft: 4, opacity: e.status === "completed" ? 0.75 : 1,
                        }}>
                          {e.status === "completed" ? "✓ " : ""}{e.title}
                        </span>
                      ))}
                      {evs.length > 4 && <span style={{ fontSize: 10, color: C.tx3 }}>+{evs.length - 4} autres</span>}
                      {fis.map((f) => (
                        <span key={f.id} style={{ fontSize: 10.5, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📄 {f.doc?.title ?? "Fiche"}</span>
                      ))}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {addingOn && user && link.coachId && (
        <ScheduleFicheDialog
          athleteId={link.athleteId}
          athleteName={link.athleteFirstName ?? link.athleteName}
          coachId={link.coachId}
          staffId={user.id}
          initialDate={addingOn}
          onClose={() => setAddingOn(null)}
        />
      )}
      {energyId && <EnergyPreview id={energyId} athleteId={link.athleteId} onClose={() => setEnergyId(null)} />}
      <FicheViewerHost athleteId={link.athleteId} viewOnly />
    </div>
  );
}
