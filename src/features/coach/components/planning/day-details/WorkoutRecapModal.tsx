import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { X } from "lucide-react";
import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { AthleteModifications } from "@/features/shared/types/athlete";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import type { ProgSession, Bloc } from "@/features/coach/components/programmation/types";
import { useSessionOccurrence } from "@/features/shared/hooks/useSessionOccurrence";
import { AthleteChoicesPanel, AthleteMoveBadge } from "../AthleteChoicesPanel";
import { STATUS_LABEL } from "./dayDetailsConstants";
import { rpeColor, rpeBg, buildExoRows } from "./dayDetailsUtils";
import { ExoAccordionRow } from "./ExoAccordionRow";

export function WorkoutRecapModal({ event, athleteId, onClose }: { event: CalEvent; athleteId: string; onClose: () => void }) {
  const mods = (event.raw?.athlete_modifications as AthleteModifications | null) ?? null;
  const sessionSets = mods?.sessionSets ?? null;
  const isCompleted = event.status === "completed";
  const sessionId = event.raw?.session_id as string | undefined;
  // Occurrence de ce jour (n-ième fois que la séance est planifiée)
  const { data: weekNumber } = useSessionOccurrence(athleteId, sessionId, event.date);

  const { data: progSessions = [], isLoading } = useProgrammation(athleteId);
  const progSession = progSessions.find((s: ProgSession) => s.id === sessionId);
  // Modif ponctuelle du coach : c'est la version que l'athlète a eue
  const ovrBlocs = mods?.coachOverride?.blocs as Bloc[] | undefined;
  const sourceSession = progSession && ovrBlocs?.length ? { ...progSession, blocs: ovrBlocs } : progSession;
  const exoRows = buildExoRows(sourceSession, sessionSets, weekNumber);

  // Stats summary
  const totalPlanned = exoRows.filter(e => e.planned).length;
  const totalDone = exoRows.filter(e => e.actual.length > 0).length;
  const totalSets = exoRows.reduce((acc, e) => acc + e.actual.length, 0);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,0.65)" }} />
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 71,
        maxHeight: "92vh",
        background: C.s1, borderRadius: "6px 6px 0 0", border: "1px solid " + C.brd,
        borderBottom: "none",
        display: "flex", flexDirection: "column",
        animation: "slideUp 200ms ease-out",
      }}>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid " + C.brd,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>{event.title}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.tx3 }}>{format(new Date(event.date), "d MMMM yyyy", { locale: fr })}</span>
              {event.status && STATUS_LABEL[event.status] && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                  background: STATUS_LABEL[event.status].color + "20",
                  color: STATUS_LABEL[event.status].color,
                  textTransform: "uppercase",
                }}>
                  {STATUS_LABEL[event.status].label}
                </span>
              )}
              {event.rpe != null && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                  background: rpeBg(event.rpe), color: rpeColor(event.rpe),
                }}>
                  RPE {event.rpe}/10
                </span>
              )}
              <AthleteMoveBadge event={event} />
              {mods?.sessionForme != null && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                  background: mods.sessionForme >= 4 ? C.gS : mods.sessionForme >= 3 ? C.oS : C.rS,
                  color: mods.sessionForme >= 4 ? C.g : mods.sessionForme >= 3 ? C.o : C.r,
                }}>
                  Forme {mods.sessionForme}/5
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL,
            background: "transparent", color: C.tx3, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Quick stats bar */}
        {isCompleted && !isLoading && exoRows.length > 0 && (
          <div style={{
            display: "flex", gap: 1, padding: "0 20px", marginTop: 12,
          }}>
            {[
              { label: "Exercices", value: `${totalDone}/${totalPlanned || exoRows.length}`, color: totalDone >= totalPlanned ? C.g : C.o },
              { label: "Séries", value: String(totalSets), color: C.ac },
              ...(event.rpe != null ? [{ label: "RPE", value: `${event.rpe}/10`, color: rpeColor(event.rpe) }] : []),
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                flex: 1, textAlign: "center", padding: "8px 6px",
                background: C.s2, borderRadius: 4,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Body — accordion list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
          {isLoading ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
          ) : exoRows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: C.tx3, fontSize: 12, background: C.s2, borderRadius: 4 }}>
              Aucun exercice trouvé pour cette séance
            </div>
          ) : (
            <>
              {exoRows.map((exo, idx) => {
                const showBlocHeader = idx === 0 || exo.blocName !== exoRows[idx - 1].blocName;
                return (
                  <div key={exo.id}>
                    {showBlocHeader && (
                      <div style={{
                        fontSize: 10, fontWeight: 700, color: C.ac,
                        textTransform: "uppercase", letterSpacing: "0.5px",
                        marginBottom: 4, marginTop: idx > 0 ? 10 : 2,
                        paddingLeft: 2,
                      }}>
                        {exo.blocName}
                      </div>
                    )}
                    <ExoAccordionRow
                      exo={exo}
                      isCompleted={isCompleted}
                      exerciceComment={mods?.exerciceComments?.[exo.id]}
                    />
                  </div>
                );
              })}

              <div style={{ marginTop: 6 }}>
                <AthleteChoicesPanel
                  event={event}
                  plannedExerciceIds={(sourceSession?.blocs ?? []).flatMap((b) => b.exercices.map((ex) => ex.id))}
                />
              </div>

            </>
          )}
        </div>
      </div>
    </>
  );
}
