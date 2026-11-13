import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { X, Plus, ChevronLeft, Trophy } from "lucide-react";
import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useAuth } from "@/hooks/useAuth";
import { competitionDayLabel, type Competition } from "@/types/planning";
import type { WellnessData } from "@/features/shared/types/athlete";
import type { NutritionDailyLog } from "@/lib/nutrition";
import { CompetitionFormModal } from "./CompetitionFormModal";
import { CoachSessionOverrideModal } from "./CoachSessionOverrideModal";
import { DayThemeEditor } from "./DayThemeEditor";
import { WatchCard } from "@/features/shared/components/planning/WatchCard";
import { usePlannedVsDone } from "@/features/shared/hooks/usePlannedVsDone";
import { watchCardsOfDay } from "@/lib/planningCard";
import { FREE_COLOR, TEST_COLOR } from "./day-details/dayDetailsConstants";
import { WorkoutRecapModal } from "./day-details/WorkoutRecapModal";
import { WorkoutDetailView } from "./day-details/WorkoutDetailView";
import { EventCard } from "./day-details/EventCard";
import { WellnessDayView } from "./day-details/WellnessDayView";
import { NutritionDayView } from "./day-details/NutritionDayView";
import { EnergyDetailView } from "./day-details/EnergyDetailView";
import { FreeActivityDetailView } from "./day-details/FreeActivityDetailView";
import { EnergyEventPreview } from "./day-details/EnergyEventPreview";

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

  // Montre (P34) : une séance rattachée à une activité devient sa carte (jamais deux cartes).
  const watchDate = day ? format(day, "yyyy-MM-dd") : undefined;
  const { data: watchDays } = usePlannedVsDone(open ? athleteId : undefined, watchDate, watchDate);

  if (!open || !day) return null;

  const dateStr = format(day, "yyyy-MM-dd");
  const dayEvents    = events.filter((e) => e.date === dateStr);
  const workouts     = dayEvents.filter((e) => e.type === "workout");
  const tests        = dayEvents.filter((e) => e.type === "test");
  const competitions = dayEvents.filter((e) => e.type === "competition");
  const energyEvents = dayEvents.filter((e) => e.type === "energy");
  const freeEvents   = dayEvents.filter((e) => e.type === "free_activity");
  const lifeEvents   = dayEvents.filter((e) => e.type === "life_event");
  const watchDay     = watchDays?.[0];
  const watchCards   = watchCardsOfDay(watchDay, Date.now());
  const linkedCard   = new Map(watchCards.filter((c) => c.planned).map((c) => [`${c.planned!.kind}:${c.planned!.id}`, c]));
  const freeWatch    = watchCards.filter((c) => !c.planned);
  const seancePath   = (id: string) => `/coach/athletes/${athleteId}/seance/${id}`;
  const eventOrWatch = (e: CalEvent) => {
    const c = linkedCard.get(`${e.type}:${e.id}`);
    return c
      ? <WatchCard key={e.id} card={c} day={watchDay} athleteId={athleteId} seancePath={seancePath} />
      : <EventCard key={e.id} event={e} athleteId={athleteId} coachId={coachId} onSelect={setSelectedEvent} />;
  };

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
                : dayEvents.length + freeWatch.length === 0
                  ? "Aucun événement"
                  : `${dayEvents.length + freeWatch.length} événement${dayEvents.length + freeWatch.length > 1 ? "s" : ""}`}
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

              {dayEvents.length === 0 && freeWatch.length === 0 && (
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
                    {workouts.map(eventOrWatch)}
                  </div>
                </section>
              )}

              {energyEvents.length > 0 && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.o, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Séances énergétiques
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {energyEvents.map(eventOrWatch)}
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

              {freeWatch.length > 0 && (
                <section>
                  <div style={{ fontSize: 10, fontWeight: 700, color: FREE_COLOR, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Montre · séances libres
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {freeWatch.map((c) => (
                      <WatchCard key={c.key} card={c} day={watchDay} athleteId={athleteId} seancePath={seancePath} />
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
                    {tests.map(eventOrWatch)}
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
