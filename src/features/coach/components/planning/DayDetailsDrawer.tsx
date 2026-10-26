import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { X, Trash2, Plus, ChevronLeft, Pencil, ChevronDown, ChevronUp, Check, Minus, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useDeleteCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { competitionDayLabel, type Competition } from "@/types/planning";
import type { WellnessData, AthleteModifications } from "@/features/shared/types/athlete";
import type { NutritionDailyLog } from "@/lib/nutrition";
import { CompetitionFormModal } from "./CompetitionFormModal";
import { CoachSessionOverrideModal } from "./CoachSessionOverrideModal";
import { SessionPreviewModal } from "@/features/coach/components/energy/SessionPreviewModal";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import type { ProgSession, Bloc, Exercice, ExerciceParams } from "@/features/coach/components/programmation/types";
import { resolveExerciceParams } from "@/lib/sessionOccurrence";
import { useSessionOccurrence } from "@/features/shared/hooks/useSessionOccurrence";
import { AthleteChoicesPanel, AthleteMoveBadge } from "./AthleteChoicesPanel";
import { ATHLETE_CHOICE_LABEL } from "@/lib/athleteChoices";
import { formatSetsReps, hasIso, isIsoAt } from "@/lib/formatSetsReps";
import { IsoBadge } from "@/features/shared/components/IsoBadge";
import { DayThemeEditor } from "./DayThemeEditor";

// ── Color helpers ─────────────────────────────────────────────────────────────

function rpeColor(v: number) { return v <= 4 ? C.g : v <= 7 ? C.o : C.r; }
function rpeBg(v: number)    { return v <= 4 ? C.gS : v <= 7 ? C.oS : C.rS; }

const FREE_COLOR  = "#1FF0B0";   // patine (DA)
const TEST_COLOR  = "#A67C52";   // bronze (DA)

const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", autre: "Autre", custom: "Custom",
};

const TYPE_COLOR: Record<CalEvent["type"], string> = {
  workout:       C.ac,       // or — muscu
  test:          TEST_COLOR, // bronze — tests
  competition:   C.r,        // terracotta — compétitions
  energy:        C.b,        // ardoise — énergie
  free_activity: FREE_COLOR, // patine — activités libres
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  planned:     { label: "Planifiée",  color: C.tx3 },
  in_progress: { label: "En cours",   color: C.b   },
  completed:   { label: "Complétée",  color: C.g   },
  missed:      { label: "Manquée",    color: C.r   },
  skipped:     { label: "Sautée",     color: C.o   },
};

// ── WorkoutRecapModal (self-contained popup with accordion) ─────────────────

type SessionSetLog = { done: boolean; skipped?: boolean; kg?: number | null; reps?: number; rir?: number | null; note?: string };

type ExoRow = {
  id: string;
  name: string;
  blocName: string;
  mode: string;
  methodeId?: string;
  libreText?: string;
  comment?: string;
  planned: ExerciceParams | null;
  actual: SessionSetLog[];
};

/** Format planned params to readable string */
function fmtPlanned(p: ExerciceParams): string {
  const parts: string[] = [formatSetsReps(p)];
  if (p.charge.mode === "global" && p.charge.value != null) {
    parts.push(p.charge_unit === "%RM" ? `@${p.charge.value}%` : `@${p.charge.value}kg`);
  }
  if (p.rir.mode === "global" && p.rir.value != null) {
    parts.push(`RIR${p.rir.value}`);
  }
  if (p.tempo.mode === "global" && p.tempo.value) {
    parts.push(`T:${p.tempo.value}`);
  }
  return parts.join(" ");
}

/** Build exercise rows from prog + athlete data */
function buildExoRows(
  progSession: ProgSession | undefined,
  sessionSets: Record<string, SessionSetLog[]> | null,
  weekNumber: number | undefined,
): ExoRow[] {
  const allExercices = progSession?.blocs?.flatMap((b: Bloc) =>
    b.exercices.map((ex: Exercice) => ({ ...ex, blocName: b.name, blocCategory: b.category }))
  ) ?? [];

  const rows: ExoRow[] = [];
  const seenIds = new Set<string>();

  for (const ex of allExercices) {
    seenIds.add(ex.id);
    const params = resolveExerciceParams(ex.params, weekNumber ?? 1);
    const actual = (sessionSets?.[ex.id] ?? []) as SessionSetLog[];
    rows.push({
      id: ex.id, name: ex.exercise_name, blocName: ex.blocName, mode: ex.mode,
      methodeId: ex.methode_id, libreText: ex.libre_text, comment: ex.comment,
      planned: params, actual: actual.filter(s => s.done),
    });
  }

  if (sessionSets) {
    for (const [exId, rawSets] of Object.entries(sessionSets)) {
      if (seenIds.has(exId)) continue;
      const doneSets = (rawSets as SessionSetLog[]).filter(s => s.done);
      if (doneSets.length === 0) continue;
      rows.push({ id: exId, name: "Exercice ajouté", blocName: "Bonus", mode: "classique", planned: null, actual: doneSets });
    }
  }

  return rows;
}

/** Quick summary for collapsed accordion row */
function exoQuickSummary(exo: ExoRow, isCompleted: boolean): { text: string; color: string } {
  const hasActual = exo.actual.length > 0;
  if (hasActual) {
    const kgs = exo.actual.map(s => s.kg).filter((v): v is number => v != null);
    const reps = exo.actual.map(s => s.reps).filter((v): v is number => v != null);
    const maxKg = kgs.length ? Math.max(...kgs) : null;
    const avgReps = reps.length ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : null;
    const plannedSets = exo.planned?.nb_series ?? exo.actual.length;
    const parts: string[] = [`${exo.actual.length}/${plannedSets} séries`];
    if (maxKg != null && avgReps != null) parts.push(`${maxKg}kg × ${avgReps}`);
    else if (maxKg != null) parts.push(`${maxKg}kg`);
    else if (avgReps != null) parts.push(`${avgReps} reps`);
    return { text: parts.join(" · "), color: exo.actual.length >= plannedSets ? C.g : C.o };
  }
  if (isCompleted) {
    const p = exo.planned ? ` · Prévu : ${fmtPlanned(exo.planned)}` : "";
    return { text: `Non réalisé${p}`, color: C.r };
  }
  if (exo.planned) return { text: fmtPlanned(exo.planned), color: C.tx3 };
  return { text: "—", color: C.tx3 };
}

/** Accordion exercise row */
function ExoAccordionRow({ exo, isCompleted, exerciceComment }: {
  exo: ExoRow; isCompleted: boolean; exerciceComment?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasActual = exo.actual.length > 0;
  const summary = exoQuickSummary(exo, isCompleted);
  const statusIcon = hasActual
    ? (exo.actual.length >= (exo.planned?.nb_series ?? exo.actual.length)
      ? <Check size={12} style={{ color: C.g }} />
      : <Minus size={12} style={{ color: C.o }} />)
    : (isCompleted ? <X size={12} style={{ color: C.r }} /> : null);

  return (
    <div style={{
      background: C.s2, borderRadius: 4, border: "1px solid " + C.brd,
      overflow: "hidden", transition: "all 150ms",
    }}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        {/* Status dot */}
        {statusIcon && <span style={{ flexShrink: 0, lineHeight: 0 }}>{statusIcon}</span>}

        {/* Name + badges */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {exo.name}
            {exo.mode === "methode" && exo.methodeId && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: C.coachS, color: C.coach, fontWeight: 600, verticalAlign: "middle" }}>
                Méthode
              </span>
            )}
            {exo.planned && hasIso(exo.planned) && <IsoBadge />}
            {exo.mode === "libre" && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: C.oS, color: C.o, fontWeight: 600, verticalAlign: "middle" }}>
                Libre
              </span>
            )}
            {!exo.planned && hasActual && (
              <span style={{ fontSize: 8, marginLeft: 5, padding: "1px 5px", borderRadius: 4, background: "#F59E0B20", color: "#F59E0B", fontWeight: 600, verticalAlign: "middle" }}>
                {ATHLETE_CHOICE_LABEL}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: summary.color, marginTop: 2 }}>{summary.text}</div>
        </div>

        {/* Chevron */}
        {open ? <ChevronUp size={14} color={C.tx3} /> : <ChevronDown size={14} color={C.tx3} />}
      </button>

      {/* Expanded details */}
      {open && (
        <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid " + C.brd }}>
          {exo.comment && (
            <div style={{ fontSize: 10, color: C.tx3, fontStyle: "italic", paddingTop: 8 }}>
              {exo.comment}
            </div>
          )}
          {exo.mode === "libre" && exo.libreText && (
            <div style={{ fontSize: 10, color: C.tx2, paddingTop: exo.comment ? 0 : 8 }}>
              {exo.libreText}
            </div>
          )}

          {/* Prévu vs Réalisé side-by-side */}
          <div style={{
            display: "grid",
            gridTemplateColumns: hasActual && exo.planned ? "1fr 1fr" : "1fr",
            gap: 8, paddingTop: 6,
          }}>
            {/* Planned */}
            {exo.planned && (
              <div style={{
                padding: "8px 10px", borderRadius: 4,
                background: C.s1, border: "1px dashed " + C.brd,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 6 }}>
                  Prévu
                </div>
                <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.5 }}>
                  {fmtPlanned(exo.planned)}
                </div>
              </div>
            )}

            {/* Actual */}
            {hasActual && (
              <div style={{
                padding: "8px 10px", borderRadius: 4,
                background: C.gS + "30",
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: C.g, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: 6 }}>
                  Réalisé ({exo.actual.length} série{exo.actual.length > 1 ? "s" : ""})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {exo.actual.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.tx2 }}>
                      <span style={{ color: C.tx3, minWidth: 18, fontSize: 10, fontWeight: 600 }}>S{i + 1}</span>
                      {s.kg != null && <span style={{ fontWeight: 700, color: C.tx }}>{s.kg}kg</span>}
                      {s.reps != null && <span>×{s.reps}{isIsoAt(exo.planned, i) ? " s" : ""}</span>}
                      {s.rir != null && <span style={{ color: C.tx3, fontSize: 10 }}>RIR{s.rir}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Not done */}
          {!hasActual && isCompleted && (
            <div style={{ fontSize: 10, color: C.r, fontStyle: "italic", paddingTop: 4 }}>Non réalisé</div>
          )}

          {/* Exercise comment */}
          {exerciceComment && (
            <div style={{ fontSize: 10, color: C.tx2, fontStyle: "italic", padding: "6px 8px", background: C.acS + "30", borderRadius: 6 }}>
              {exerciceComment}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkoutRecapModal({ event, athleteId, onClose }: { event: CalEvent; athleteId: string; onClose: () => void }) {
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

// ── WorkoutDetailView ─────────────────────────────────────────────────────────

function WorkoutDetailView({
  event,
  onAdaptForDay,
  athleteId,
  onOpenRecap,
}: {
  event: CalEvent;
  onAdaptForDay?: () => void;
  athleteId?: string;
  onOpenRecap: () => void;
}) {
  const navigate     = useNavigate();
  const sessionId    = event.raw?.session_id as string | undefined;
  const isProjected  = event.raw?.source === "block_plan";
  const isCompleted  = event.status === "completed";
  const mods = (event.raw?.athlete_modifications as AthleteModifications | null) ?? null;
  const hasOverride  = !!mods?.coachOverride;

  const statusInfo = event.status ? STATUS_LABEL[event.status] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Status badge */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {statusInfo && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: statusInfo.color + "20", color: statusInfo.color,
            textTransform: "uppercase", letterSpacing: "0.4px",
          }}>
            {statusInfo.label}
          </span>
        )}
        {event.rpe != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: rpeBg(event.rpe), color: rpeColor(event.rpe),
          }}>
            RPE {event.rpe}/10
          </span>
        )}
        {isProjected && (
          <span style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 6,
            background: C.s2, color: C.tx3, fontStyle: "italic",
          }}>
            Prévu (programme)
          </span>
        )}
        {hasOverride && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: "#F59E0B20", color: "#F59E0B",
            textTransform: "uppercase", letterSpacing: "0.4px",
          }}>
            Adaptée ce jour
          </span>
        )}
        <AthleteMoveBadge event={event} />
      </div>

      <AthleteChoicesPanel event={event} />

      {/* Edit session programme */}
      {sessionId && athleteId && (
        <button
          onClick={() => navigate(`/coach/athletes/${athleteId}/programmation`)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 4,
            border: "1px solid " + C.coach + "40", background: C.coachS,
            color: C.coach, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Pencil size={13} /> Modifier la séance
        </button>
      )}

      {/* Adapt-for-this-day — real, not-yet-done workouts (projected must be assigned first) */}
      {!isProjected && !isCompleted && onAdaptForDay && (
        <button
          onClick={onAdaptForDay}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 4,
            border: "1px solid " + C.ac + "40", background: C.acS,
            color: C.ac, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          {hasOverride ? "Modifier l'adaptation du jour" : "Adapter pour ce jour"}
        </button>
      )}

      {/* Recap button */}
      <button
        onClick={onOpenRecap}
        style={{
          width: "100%", padding: "12px 14px", borderRadius: 4,
          border: "1px solid " + C.ac + "40", background: C.acS,
          color: C.ac, fontSize: 13, fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        {isCompleted ? "Voir le récap (Prévu vs Réalisé)" : "Voir les exercices prévus"}
      </button>

      {/* Quick athlete feedback summary */}
      {isCompleted && mods?.sessionForme != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.tx3 }}>Forme :</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
            background: mods.sessionForme >= 4 ? C.gS : mods.sessionForme >= 3 ? C.oS : C.rS,
            color: mods.sessionForme >= 4 ? C.g : mods.sessionForme >= 3 ? C.o : C.r,
          }}>
            {mods.sessionForme}/5
          </span>
        </div>
      )}
    </div>
  );
}

// ── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({
  event,
  athleteId,
  coachId,
  onSelect,
}: {
  event: CalEvent;
  athleteId: string;
  coachId: string;
  onSelect: (e: CalEvent) => void;
}) {
  const isEnergy = event.type === "energy";
  const color = event.partial && isEnergy ? "#33B5FF" : TYPE_COLOR[event.type] ?? C.tx3;
  const { mutate: del } = useDeleteCalendarEvent();

  const rawBlockLogs = isEnergy
    ? (event.raw?.block_logs as Record<string, { done: boolean }> | null | undefined) ?? null
    : null;
  const blVals     = rawBlockLogs ? Object.values(rawBlockLogs) : [];
  const doneCount  = blVals.filter((b) => b.done).length;
  const totalCount = blVals.length;

  const statusInfo = event.partial && isEnergy
    ? { label: `Partielle ${doneCount}/${totalCount}`, color: "#33B5FF" }
    : event.status ? STATUS_LABEL[event.status] : null;

  const isClickable = event.type === "workout" || event.type === "energy" || event.type === "free_activity";
  const isDeletable = event.type === "workout" || event.type === "energy" || event.type === "test";

  const typeLabel =
    event.type === "workout"       ? "Séance"
    : event.type === "test"        ? "Test"
    : event.type === "energy"      ? (ENERGY_KIND_LABEL[event.sessionKind ?? ""] ?? "Énergie")
    : event.type === "free_activity" ? (event.sport ?? "Activité libre")
    : "Compétition";

  const emoji =
    event.type === "workout"         ? ""
    : event.type === "energy"        ? ""
    : event.type === "free_activity" ? (event.sportEmoji ? event.sportEmoji + " " : "")
    : event.type === "test"          ? ""
    : "";

  return (
    <div
      onClick={() => { if (isClickable) onSelect(event); }}
      style={{
        background: C.s2,
        borderRadius: 6,
        borderLeft: `3px solid ${color}`,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: isClickable ? "pointer" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 2 }}>
            {emoji}{event.title}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase", color }}>
              {typeLabel}
            </span>
            {statusInfo && (
              <span style={{ fontSize: 10, color: statusInfo.color }}>{statusInfo.label}</span>
            )}
            {event.rpe != null && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                background: rpeBg(event.rpe), color: rpeColor(event.rpe),
              }}>
                RPE {event.rpe}/10
              </span>
            )}
            <AthleteMoveBadge event={event} />
            {event.type === "free_activity" && event.duration != null && (
              <span style={{ fontSize: 9, color: C.tx3 }}>{event.duration} min</span>
            )}
            {isClickable && (
              <span style={{ fontSize: 9, color: C.tx3, marginLeft: "auto" }}>Voir →</span>
            )}
          </div>
        </div>

        {isDeletable && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              del({
                id:          event.id,
                type:        event.type,
                athleteId,
                coachId,
                sessionId:   event.raw?.session_id as string | undefined,
                sessionName: event.title,
                date:        event.date,
                status:      event.status,
              });
            }}
            style={{
              width: 28, height: 28, borderRadius: 4,
              border: "1px solid " + C.r + "30", background: "transparent",
              color: C.r, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, opacity: 0.6,
            }}
            title="Supprimer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── DayDetailsDrawer ──────────────────────────────────────────────────────────

interface DayDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  day: Date | null;
  events: CalEvent[];
  athleteId: string;
  coachId: string;
  onQuickAdd: (day: Date) => void;
  exos?: Record<string, unknown[]>;
  sets?: Record<string, unknown[]>;
  initialSelectedEvent?: CalEvent | null;
  wellnessHistory?: Record<string, WellnessData>;
  nutritionLog?: Record<string, unknown>;
}

// ── WellnessDayView ───────────────────────────────────────────────────────────

function WellnessDayView({ wellness }: { wellness: WellnessData }) {
  const score = Math.round(((wellness.fatigue ?? 3) + (wellness.sommeil ?? 3) + (wellness.stress ?? 3) + (wellness.energie ?? 3) + (wellness.doms ?? 3)) / 25 * 100);
  const color = score >= 80 ? "#66F03C" : score >= 65 ? "#7BC67E" : score >= 50 ? C.o : score >= 35 ? "#F07030" : C.r;
  const label = score >= 80 ? "Optimal" : score >= 65 ? "Bon" : score >= 50 ? "Modéré" : score >= 35 ? "Fatigué" : "Surmenage";
  const metrics = [
    { k: "Récup.", v: wellness.fatigue }, { k: "Sommeil", v: wellness.sommeil },
    { k: "Sérén.", v: wellness.stress }, { k: "Énergie", v: wellness.energie }, { k: "Fraîch.", v: wellness.doms },
  ].filter((m): m is { k: string; v: number } => m.v != null);
  return (
    <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: metrics.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color }}>{score}</span>
        <span style={{ fontSize: 9, color: C.tx3 }}>/100</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: color + "20", color }}>{label}</span>
        {wellness.poids != null && <span style={{ fontSize: 10, color: C.tx3, marginLeft: "auto" }}>{wellness.poids} kg</span>}
      </div>
      {metrics.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px" }}>
          {metrics.map(({ k, v }) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 9, color: C.tx3 }}>{k}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.tx }}>{v}/5</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── NutritionDayView ──────────────────────────────────────────────────────────

function NutritionDayView({ nutrition }: { nutrition: NutritionDailyLog }) {
  const { total_calories_consumed: kcal, active_calories: active, glucides_consumed: glucides, lipides_consumed: lipides, proteines_consumed: proteines } = nutrition;
  const hasMacros = glucides != null || lipides != null || proteines != null;
  return (
    <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px" }}>
      {kcal != null && (
        <div style={{ fontSize: 16, fontWeight: 800, color: C.tx, marginBottom: hasMacros ? 6 : 0 }}>
          {kcal} <span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}>kcal</span>
          {active != null && <span style={{ fontSize: 10, color: C.tx3, fontWeight: 400, marginLeft: 8 }}>(dépense : {active} kcal)</span>}
        </div>
      )}
      {hasMacros && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 12px" }}>
          {proteines != null && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.tx3 }}>Prot.</span><span style={{ fontSize: 10, fontWeight: 700, color: "#33B5FF" }}>{proteines}g</span></div>}
          {glucides != null && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.tx3 }}>Gluc.</span><span style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B" }}>{glucides}g</span></div>}
          {lipides != null && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ fontSize: 9, color: C.tx3 }}>Lip.</span><span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444" }}>{lipides}g</span></div>}
        </div>
      )}
    </div>
  );
}

// ── EnergyDetailView (inline in drawer) ──────────────────────────────────────

function EnergyDetailView({ event, onOpenPreview, athleteId }: { event: CalEvent; onOpenPreview: () => void; athleteId?: string }) {
  const navigate = useNavigate();
  const blockLogs = event.raw?.block_logs as Record<string, { done: boolean; note?: string }> | null | undefined;
  const blEntries = blockLogs ? Object.entries(blockLogs) : [];
  const doneCount  = blEntries.filter(([, b]) => b.done).length;
  const totalCount = blEntries.length;

  const statusInfo = event.partial
    ? { label: `Partielle ${doneCount}/${totalCount}`, color: "#33B5FF" }
    : event.status ? STATUS_LABEL[event.status] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Badges */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {statusInfo && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: statusInfo.color + "20", color: statusInfo.color,
            textTransform: "uppercase", letterSpacing: "0.4px",
          }}>
            {statusInfo.label}
          </span>
        )}
        {event.sessionKind && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: C.oS, color: C.o,
          }}>
            {ENERGY_KIND_LABEL[event.sessionKind] ?? event.sessionKind}
          </span>
        )}
        {event.rpe != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
            background: rpeBg(event.rpe), color: rpeColor(event.rpe),
          }}>
            RPE {event.rpe}/10
          </span>
        )}
      </div>

      {/* Block completion */}
      {blEntries.length > 0 && (
        <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid " + C.brd, fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            Blocs
          </div>
          <div style={{ padding: "6px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
            {blEntries.map(([key, b], i) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                  background: b.done ? C.g : C.s2,
                  border: "1px solid " + (b.done ? C.g : C.brd),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, color: "#fff",
                }}>
                  {b.done ? "✓" : ""}
                </span>
                <span style={{ color: b.done ? C.tx : C.tx3 }}>Bloc {i + 1}</span>
                {b.note && <span style={{ fontSize: 9, color: C.tx3, fontStyle: "italic" }}>{b.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {event.raw?.notes && (
        <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px", fontSize: 12, color: C.tx2, fontStyle: "italic" }}>
          {String(event.raw.notes)}
        </div>
      )}

      {/* Link to full session programme */}
      <button
        onClick={onOpenPreview}
        style={{
          padding: "10px 14px", borderRadius: 4, border: "1px solid " + C.o + "40",
          background: C.oS, color: C.o, fontSize: 12, fontWeight: 600,
          cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
        }}
      >
        Voir le programme de la séance →
      </button>

      {/* Edit energy session */}
      {event.energySessionId && (
        <button
          onClick={() => {
            const base = athleteId
              ? `/coach/athletes/${athleteId}/energy/${event.energySessionId}/edit`
              : `/coach/energy-library/${event.energySessionId}/edit`;
            navigate(base);
          }}
          style={{
            padding: "10px 14px", borderRadius: 4, border: "1px solid " + C.coach + "40",
            background: C.coachS, color: C.coach, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
        >
          <Pencil size={13} /> Modifier la séance
        </button>
      )}
    </div>
  );
}

// ── FreeActivityDetailView (inline in drawer) ─────────────────────────────────

function FreeActivityDetailView({ event }: { event: CalEvent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Sport */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 32 }}>{event.sportEmoji ?? "course"}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>{event.sport ?? "Activité libre"}</div>
          <div style={{ fontSize: 11, color: FREE_COLOR, fontWeight: 600 }}>Activité libre</div>
        </div>
      </div>

      {/* Metrics */}
      {(event.duration != null || event.intensity != null) && (
        <div style={{ display: "flex", gap: 10 }}>
          {event.duration != null && (
            <div style={{ background: C.s2, borderRadius: 4, padding: "10px 14px", flex: 1, border: "1px solid " + C.brd }}>
              <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>Durée</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.tx }}>{event.duration} <span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}>min</span></div>
            </div>
          )}
          {event.intensity != null && (
            <div style={{ background: C.s2, borderRadius: 4, padding: "10px 14px", flex: 1, border: "1px solid " + C.brd }}>
              <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 3 }}>RPE</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: FREE_COLOR }}>{event.intensity}<span style={{ fontSize: 11, fontWeight: 400, color: C.tx3 }}>/10</span></div>
            </div>
          )}
        </div>
      )}

      {/* Note */}
      {event.raw?.note && (
        <div style={{ background: C.s2, borderRadius: 4, border: "1px solid " + C.brd, padding: "10px 12px", fontSize: 12, color: C.tx2, fontStyle: "italic" }}>
          {String(event.raw.note)}
        </div>
      )}
    </div>
  );
}

/** Fetches full EnergySessionRow when an energy event is selected. */
function EnergyEventPreview({ event, athleteId, onClose }: { event: CalEvent; athleteId: string; onClose: () => void }) {
  const sessionId = event.energySessionId ?? (event.raw?.energy_session_id as string | undefined);
  const { data: session, isLoading } = useEnergySession(sessionId);

  if (isLoading) {
    return (
      <>
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.65)" }} />
        <div style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 61,
          transform: "translate(-50%, -50%)",
          width: 780, maxWidth: "96vw",
          background: C.s1, borderRadius: 6, border: "1px solid " + C.brd,
          padding: "40px", textAlign: "center", color: C.tx3, fontSize: 13,
        }}>
          Chargement…
        </div>
      </>
    );
  }
  if (!session) return null;
  return <SessionPreviewModal session={session} athleteId={athleteId} onClose={onClose} />;
}

export function DayDetailsDrawer({
  open,
  onClose,
  day,
  events,
  athleteId,
  coachId,
  onQuickAdd,
  exos,
  sets,
  initialSelectedEvent,
  wellnessHistory,
  nutritionLog,
}: DayDetailsDrawerProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(initialSelectedEvent ?? null);
  const [editingComp,   setEditingComp]   = useState<Competition | null>(null);
  const [creatingComp,  setCreatingComp]  = useState(false);
  const [overrideLogId, setOverrideLogId] = useState<string | null>(null);
  const [energyPreview, setEnergyPreview] = useState<CalEvent | null>(null);
  const { user } = useAuth();
  // Track when user wants to open the full energy session modal from detail view
  const [energyFullPreview, setEnergyFullPreview] = useState<CalEvent | null>(null);
  const [workoutRecapEvent, setWorkoutRecapEvent] = useState<CalEvent | null>(null);

  useEffect(() => {
    setSelectedEvent(initialSelectedEvent ?? null);
    setEnergyPreview(null);
    setEnergyFullPreview(null);
    setWorkoutRecapEvent(null);
  }, [day, initialSelectedEvent]);

  if (!open || !day) return null;

  const dateStr = format(day, "yyyy-MM-dd");
  const dayEvents    = events.filter((e) => e.date === dateStr);
  const workouts     = dayEvents.filter((e) => e.type === "workout");
  const tests        = dayEvents.filter((e) => e.type === "test");
  const competitions = dayEvents.filter((e) => e.type === "competition");
  const energyEvents = dayEvents.filter((e) => e.type === "energy");
  const freeEvents   = dayEvents.filter((e) => e.type === "free_activity");
  const lifeEvents   = dayEvents.filter((e) => e.type === "life_event");

  const wKey = dateStr.replace(/-/g, "");
  const wellnessDay = (wellnessHistory?.[wKey] ?? wellnessHistory?.[dateStr]) ?? null;
  const nutritionDay = (nutritionLog?.[dateStr] ?? nutritionLog?.[wKey] ?? null) as NutritionDailyLog | null;

  const handleClose = () => {
    setSelectedEvent(null);
    setEnergyPreview(null);
    setEnergyFullPreview(null);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.5)" }}
      />

      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50,
        width: 380, maxWidth: "90vw",
        background: C.s1,
        borderLeft: "1px solid " + C.brd,
        display: "flex", flexDirection: "column",
        animation: "slideIn 200ms ease-out",
      }}>
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid " + C.brd,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          {selectedEvent && (
            <button
              onClick={() => setSelectedEvent(null)}
              style={{
                width: 32, height: 32, borderRadius: 4,
                border: "1px solid " + C.brdL, background: "transparent",
                color: C.tx3, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>
              {selectedEvent ? selectedEvent.title : format(day, "d MMMM yyyy", { locale: fr })}
            </div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
              {selectedEvent
                ? format(day, "d MMMM yyyy", { locale: fr })
                : dayEvents.length === 0
                  ? "Aucun événement"
                  : `${dayEvents.length} événement${dayEvents.length > 1 ? "s" : ""}`}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 32, height: 32, borderRadius: 4,
              border: "1px solid " + C.brdL, background: "transparent",
              color: C.tx3, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          {selectedEvent ? (
            selectedEvent.type === "energy" ? (
              <EnergyDetailView event={selectedEvent} onOpenPreview={() => setEnergyFullPreview(selectedEvent)} athleteId={athleteId} />
            ) : selectedEvent.type === "free_activity" ? (
              <FreeActivityDetailView event={selectedEvent} />
            ) : (
              <WorkoutDetailView
                event={selectedEvent}
                onAdaptForDay={() => setOverrideLogId(selectedEvent.id)}
                athleteId={athleteId}
                onOpenRecap={() => setWorkoutRecapEvent(selectedEvent)}
              />
            )
          ) : (
            <>
              {/* Jour de compétition — en tête du jour, cliquable pour modifier */}
              {competitions.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEditingComp(e.raw as unknown as Competition)}
                  style={{
                    width: "100%", borderRadius: 6, overflow: "hidden",
                    border: "1px solid " + C.r + "60", background: C.rS,
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                    padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Trophy size={20} color={C.r} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.r, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {competitionDayLabel(e.raw?.type as string | undefined)}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.tx }}>{e.title}</div>
                      {e.raw?.location && (
                        <div style={{ fontSize: 11, color: C.tx3, marginTop: 1 }}>{String(e.raw.location)}</div>
                      )}
                    </div>
                    {e.raw?.priority && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                        background: C.r + "20", color: C.r, flexShrink: 0,
                      }}>
                        Importance {String(e.raw.priority)}
                      </span>
                    )}
                  </div>
                  {e.raw?.athlete_comment ? (
                    <div style={{ background: C.s1, borderRadius: 4, padding: "8px 10px" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.ac, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Retour de l'athlète</div>
                      <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{String(e.raw.athlete_comment)}</div>
                    </div>
                  ) : dateStr <= format(new Date(), "yyyy-MM-dd") && (
                    <div style={{ fontSize: 11, color: C.tx3, fontStyle: "italic" }}>Pas encore de retour de l'athlète</div>
                  )}
                </button>
              ))}

              {/* Événements de vie (renseignés par l'athlète) */}
              {lifeEvents.map((e) => {
                const ds = String(e.raw?.date_start ?? e.date);
                const de = String(e.raw?.date_end ?? ds);
                const fmt = (d: string) => format(new Date(d + "T12:00:00"), "d MMM", { locale: fr });
                return (
                  <div
                    key={e.id}
                    style={{
                      borderRadius: 6, border: "1px solid " + C.brdL, background: C.s2,
                      borderLeft: "3px solid " + C.tx3, padding: "10px 14px",
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Événement de l'athlète
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginTop: 1 }}>{e.title}</div>
                    <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                      {ds === de ? fmt(ds) : `Du ${fmt(ds)} au ${fmt(de)}`}
                    </div>
                  </div>
                );
              })}

              {dayEvents.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: C.tx3, fontSize: 13 }}>
                  Journée libre
                </div>
              )}

              {/* Thème du jour — l'intention du coach, avant le détail des séances */}
              <DayThemeEditor athleteId={athleteId} coachId={coachId} date={dateStr} />

              {workouts.length > 0 && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Séances muscu
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {workouts.map((e) => (
                      <EventCard key={e.id} event={e} athleteId={athleteId} coachId={coachId} onSelect={setSelectedEvent} />
                    ))}
                  </div>
                </section>
              )}

              {energyEvents.length > 0 && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.o, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Séances énergétiques
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {energyEvents.map((e) => (
                      <EventCard key={e.id} event={e} athleteId={athleteId} coachId={coachId} onSelect={setSelectedEvent} />
                    ))}
                  </div>
                </section>
              )}

              {freeEvents.length > 0 && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: FREE_COLOR, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Activités libres
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {freeEvents.map((e) => (
                      <EventCard key={e.id} event={e} athleteId={athleteId} coachId={coachId} onSelect={setSelectedEvent} />
                    ))}
                  </div>
                </section>
              )}

              {tests.length > 0 && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: TEST_COLOR, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Tests
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tests.map((e) => (
                      <EventCard key={e.id} event={e} athleteId={athleteId} coachId={coachId} onSelect={setSelectedEvent} />
                    ))}
                  </div>
                </section>
              )}

              {wellnessDay && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#66F03C", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Bien-être</div>
                  <WellnessDayView wellness={wellnessDay} />
                </section>
              )}

              {nutritionDay && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Nutrition</div>
                  <NutritionDayView nutrition={nutritionDay} />
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!selectedEvent && (
          <div style={{ padding: "16px 20px", borderTop: "1px solid " + C.brd, flexShrink: 0 }}>
            <button
              onClick={() => { handleClose(); onQuickAdd(day); }}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 6,
                border: "1px solid " + C.ac + "40", background: C.acS,
                color: C.ac, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <Plus size={15} />
              Ajouter séance / test
            </button>
            {competitions.length === 0 && (
              <button
                onClick={() => setCreatingComp(true)}
                style={{
                  width: "100%", marginTop: 8, padding: "10px 0", borderRadius: 6,
                  border: "1px solid " + C.r + "40", background: C.rS,
                  color: C.r, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Trophy size={14} />
                Ajouter une compétition ce jour
              </button>
            )}
          </div>
        )}
      </div>

      {/* Ajout d'une compétition sur ce jour */}
      {creatingComp && (
        <CompetitionFormModal
          athleteId={athleteId}
          coachId={user?.id ?? coachId}
          initialDate={dateStr}
          onClose={() => setCreatingComp(false)}
        />
      )}

      {/* Competition edit modal */}
      {editingComp && (
        <CompetitionFormModal
          athleteId={editingComp.athlete_id ?? athleteId}
          coachId={editingComp.coach_id ?? user?.id ?? ""}
          existing={editingComp}
          onClose={() => setEditingComp(null)}
        />
      )}

      {/* Energy session full preview modal (from detail view → "Voir programme") */}
      {(energyPreview || energyFullPreview) && (
        <EnergyEventPreview
          event={(energyFullPreview ?? energyPreview)!}
          athleteId={athleteId}
          onClose={() => { setEnergyPreview(null); setEnergyFullPreview(null); }}
        />
      )}

      {/* Workout recap modal (Prévu vs Réalisé) */}
      {workoutRecapEvent && (
        <WorkoutRecapModal
          event={workoutRecapEvent}
          athleteId={athleteId}
          onClose={() => setWorkoutRecapEvent(null)}
        />
      )}

      {/* Coach per-day session adaptation modal */}
      {overrideLogId && (
        <CoachSessionOverrideModal
          workoutLogId={overrideLogId}
          athleteId={athleteId}
          onClose={() => setOverrideLogId(null)}
        />
      )}
    </>
  );
}
