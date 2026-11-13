import { C } from "@/lib/theme";
import { Check, Dumbbell } from "lucide-react";
import { CompetitionDayCard, type CompetitionDayCardData } from "@/features/athlete/components/CompetitionDayCard";
import { DAYS_FULL_FR, MONTHS_FR } from "@/features/athlete/components/today/todayConstants";
import type { DayProgram } from "@/features/shared/hooks/useWeekProgram";
import { DayThemeBanner } from "@/features/shared/components/DayThemePill";
import type { DayThemeLike } from "@/lib/dayTheme";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { FreeSession } from "@/features/shared/types/athlete";
import type { RunMatch } from "@/features/shared/hooks/useRunningVolume";
import type { UnifiedCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { haptic, previewDetail } from "@/features/athlete/components/today/todayUtils";
import { localISO } from "@/lib/date";
import { watchRunMeasure, watchRunText } from "@/lib/watchRunLabel";

// ── Day preview bottom sheet ──────────────────────────────────────────────────

export interface DayPreviewSheetProps {
  day: DayProgram | null;
  onClose: () => void;
  onStartSession: (sess: DayProgram["sessions"][number]["session"], workoutLogId?: string) => void;
  freeSessions: FreeSession[];
  energyByDate: Map<string, UnifiedCalendarEvent[]>;
  onEnergyPreview: (ev: UnifiedCalendarEvent) => void;
  onAddActivity: (date: string) => void;
  onEditActivity: (session: FreeSession) => void;
  onTestPress: (id: string) => void;
  competitionsByDate: Map<string, CompetitionDayCardData[]>;
  viewOnly?: boolean;
  dayTheme?: DayThemeLike | null;
  /** Sortie de montre rattachée à chaque séance énergie prévue (par id d'assignation) */
  watchByPlanned?: Map<string, RunMatch>;
}

export function DayPreviewSheet({ day, onClose, onStartSession, freeSessions, energyByDate, onEnergyPreview, onAddActivity, onEditActivity, onTestPress, competitionsByDate, viewOnly, dayTheme, watchByPlanned }: DayPreviewSheetProps) {
  if (!day) return null;
  const date = new Date(day.date + "T12:00:00");
  const dateLabel = `${DAYS_FULL_FR[day.dow]} ${date.getDate()} ${MONTHS_FR[date.getMonth()]}`;
  const todayISO = localISO();
  const isToday = day.date === todayISO;
  const isPast  = day.date < todayISO;
  const isFuture = day.date > todayISO;
  const dayEnergySessions = energyByDate.get(day.date) ?? [];
  const dayComps = competitionsByDate.get(day.date) ?? [];
  const empty   = day.sessions.length === 0 && day.tests.length === 0 && dayEnergySessions.length === 0 && dayComps.length === 0;
  const dayFreeActivities = freeSessions.filter((f) => f.date === day.date && f.sport);

  const ENERGY_KIND_COLOR: Record<string, string> = {
    vo2: "#FFC933", tempo: "#33B5FF", seuil: "#F59E0B",
    footing: "#10B981", fartlek: "#EF4444", specifique: "#F5A623", autre: "#6B7280", custom: "#6B7280",
  };
  const ENERGY_KIND_LABEL: Record<string, string> = {
    vo2: "VO₂", tempo: "Tempo", seuil: "Seuil",
    footing: "Footing", fartlek: "Fartlek", specifique: "Spécifique", autre: "Autre", custom: "Custom",
  };

  return (
    <Drawer open={!!day} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, padding: "0 0 32px" }}>
        <DrawerHeader style={{ padding: "16px 20px 8px" }}>
          <DrawerTitle style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
            {dateLabel}
            {isToday && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: C.coachS, color: C.coach }}>
                Aujourd'hui
              </span>
            )}
          </DrawerTitle>
        </DrawerHeader>

        <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Hors du test `empty` : un jour sans séance peut très bien porter un
              thème (« Repos complet »), et c'est justement là qu'il informe. */}
          <DayThemeBanner theme={dayTheme} />

          {empty ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: C.tx3, fontSize: 13 }}>
              Jour de repos — rien de prévu
            </div>
          ) : (
            <>
              {/* Jour de compétition — en tête du jour */}
              {dayComps.map((c) => (
                <CompetitionDayCard key={c.id} competition={c} viewOnly={viewOnly} />
              ))}

              {/* Sessions */}
              {day.sessions.map(({ session, exercises: legacyExercises, items, isCompleted, workoutLogId }) => {
                // ProgSession d'abord ; l'ancien asp:exos seulement à défaut
                const exercises = items?.length
                  ? items.map((it) => ({ id: it.id, name: it.name, detail: previewDetail(it) }))
                  : legacyExercises.map((ex) => {
                      const w = ex.weeks ? (Object.values(ex.weeks)[0] as { sets?: number; repsRange?: string } | undefined) : undefined;
                      return { id: ex.id, name: ex.name, detail: w?.sets ? `${w.sets}×${w.repsRange ?? ""}` : "" };
                    });
                return (

                <div
                  key={session.id}
                  style={{
                    background: isCompleted ? C.gS : C.coachS,
                    borderRadius: 6, padding: "14px 16px",
                    border: "1px solid " + (isCompleted ? C.g + "40" : C.coach + "40"),
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: exercises.length ? 10 : 0 }}>
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                        background: isCompleted ? C.g + "20" : C.coach + "20",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16,
                      }}
                    >
                      {isCompleted ? <Check size={16} color={C.g} /> : <Dumbbell size={16} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{session.name}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>
                        {session.short} · {exercises.length} exercice{exercises.length !== 1 ? "s" : ""}
                        {isCompleted ? " · Complétée ✓" : isPast ? " · Manquée" : ""}
                      </div>
                    </div>
                  </div>

                  {/* Exercise preview (up to 5) */}
                  {exercises.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: isCompleted || isPast ? 0 : 10 }}>
                      {exercises.slice(0, 5).map((ex) => (
                        <div
                          key={ex.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 10px", borderRadius: 4, background: C.s2,
                          }}
                        >
                          <div style={{ fontSize: 11, color: C.tx, flex: 1 }}>{ex.name}</div>
                          {ex.detail && (
                            <div style={{ fontSize: 10, color: C.tx3 }}>{ex.detail}</div>
                          )}
                        </div>
                      ))}
                      {exercises.length > 5 && (
                        <div style={{ fontSize: 10, color: C.tx3, paddingLeft: 10 }}>
                          +{exercises.length - 5} exercice{exercises.length - 5 !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {!isCompleted && !isPast && !viewOnly && (
                    <button
                      onClick={() => { onStartSession(session, workoutLogId); onClose(); haptic(); }}
                      style={{
                        width: "100%", padding: "11px 0", borderRadius: 4,
                        border: "none", background: C.acV, color: "#0E0C0A",
                        fontSize: 13, fontWeight: 700, cursor: "pointer",
                        fontFamily: "inherit", minHeight: 44,
                      }}
                    >
                      Démarrer ▶
                    </button>
                  )}
                </div>
                );
              })}

              {/* Séances énergie */}
              {dayEnergySessions.map((ev) => {
                const kc = ENERGY_KIND_COLOR[ev.sessionKind ?? ""] ?? "#FFC933";
                const kl = ENERGY_KIND_LABEL[ev.sessionKind ?? ""] ?? ev.sessionKind ?? "Énergie";
                const isDone = ev.status === "completed";
                const watchRun = watchByPlanned?.get(ev.id);
                return (
                  <button
                    key={ev.id}
                    onClick={() => { onEnergyPreview(ev); onClose(); haptic(); }}
                    style={{
                      width: "100%", background: isDone ? C.gS : kc + "12",
                      borderRadius: 6, padding: "14px 16px",
                      border: "1px solid " + (isDone ? C.g + "40" : kc + "40"),
                      display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32 }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 21l3-9 3 2v7M5 16l3-4 3 2M14 8l4 2 3-3"/></svg></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{ev.title}</div>
                      <div style={{ fontSize: 10, marginTop: 2, fontWeight: 600, color: kc }}>
                        {kl} · {isDone ? "Complétée ✓" : watchRun ? watchRunText(watchRun) : isPast ? "Manquée" : "À faire"}
                        {isDone && watchRun && <span style={{ color: C.g }}> · {watchRunMeasure(watchRun)}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.tx3 }}>Voir →</span>
                  </button>
                );
              })}

              {/* Tests */}
              {day.tests.map((t) => {
                const tc = t.type === "musculation" ? "#FFC933"
                  : t.type === "energetique" ? "#FF5A33"
                  : t.type === "specifique" ? "#F5A623"
                  : "#66F03C";
                return (
                  <button
                    key={t.id}
                    onClick={() => { onTestPress(t.id); onClose(); haptic(); }}
                    style={{
                      width: "100%", background: t.completed ? C.gS : tc + "12",
                      borderRadius: 6, padding: "14px 16px",
                      border: "1px solid " + (t.completed ? C.g + "40" : tc + "40"),
                      display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24 }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
                        {t.type === "biometric" ? "biométrie" : t.type} · {t.completed ? "Réalisé ✓" : "À faire"}
                      </div>
                    </div>
                    {t.completed
                      ? <span style={{ fontSize: 18, color: C.g }}>✓</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: tc + "20", color: tc, flexShrink: 0 }}>Remplir →</span>
                    }
                  </button>
                );
              })}
            </>
          )}

          {/* Free activities logged for this day */}
          {dayFreeActivities.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: empty ? 0 : 4 }}>
              {dayFreeActivities.map((f) => {
                const intColor = f.intensity != null
                  ? (f.intensity <= 3 ? C.g : f.intensity <= 6 ? C.o : C.r)
                  : C.tx3;
                return (
                  <button
                    key={f.id}
                    onClick={() => { onEditActivity(f); onClose(); haptic(); }}
                    style={{
                      width: "100%", background: C.gS, borderRadius: 6, padding: "12px 14px",
                      border: "1px solid " + C.g + "40",
                      display: "flex", alignItems: "center", gap: 12,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: 4, background: C.gS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: C.g }}>{f.sportEmoji ?? "AC"}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{f.name}</div>
                      <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
                        {f.duration ? `${f.duration} min` : ""}
                        {f.duration && f.intensity != null ? " · " : ""}
                        {f.intensity != null ? <span style={{ color: intColor }}>Intensité {f.intensity}/10</span> : null}
                        {f.note ? ` · "${f.note}"` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: C.tx3 }}></span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Add free activity button (today + past only) */}
          {!isFuture && (
            <button
              onClick={() => { onAddActivity(day.date); onClose(); haptic(); }}
              style={{
                width: "100%", padding: "11px 0", borderRadius: 4,
                border: "1px dashed " + C.brdL, background: "transparent",
                color: C.tx3, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                marginTop: (empty && dayFreeActivities.length === 0) ? 0 : 4,
              }}
            >
              + Activité libre
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
