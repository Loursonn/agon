import { ShareSessionButton, type ShareTarget } from "@/features/athlete/components/share/ShareSessionButton";
import { cn } from "@/lib/utils";
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

/** Teinte d'une carte : texte, carte (fond 0x12 + bordure 0x40), pastille (fond 0x20). */
type Tone = { text: string; card: string; chip: string };
const TONE = {
  accent: { text: "text-agon-accent", card: "border-agon-accent/[0.25] bg-agon-accent/[0.07]", chip: "bg-agon-accent/[0.125] text-agon-accent" },
  info:   { text: "text-agon-info",   card: "border-agon-info/[0.25] bg-agon-info/[0.07]",     chip: "bg-agon-info/[0.125] text-agon-info" },
  alerte: { text: "text-agon-alerte", card: "border-agon-alerte/[0.25] bg-agon-alerte/[0.07]", chip: "bg-agon-alerte/[0.125] text-agon-alerte" },
  succes: { text: "text-agon-succes", card: "border-agon-succes/[0.25] bg-agon-succes/[0.07]", chip: "bg-agon-succes/[0.125] text-agon-succes" },
  erreur: { text: "text-agon-erreur", card: "border-agon-erreur/[0.25] bg-agon-erreur/[0.07]", chip: "bg-agon-erreur/[0.125] text-agon-erreur" },
  tx3:    { text: "text-agon-tx3",    card: "border-agon-tx3/[0.25] bg-agon-tx3/[0.07]",       chip: "bg-agon-tx3/[0.125] text-agon-tx3" },
} satisfies Record<string, Tone>;

const ENERGY_KIND_TONE: Record<string, Tone> = {
  vo2: TONE.accent, tempo: TONE.info, seuil: TONE.alerte,
  footing: TONE.succes, fartlek: TONE.erreur, specifique: TONE.alerte, autre: TONE.tx3, custom: TONE.tx3,
};
const ENERGY_KIND_LABEL: Record<string, string> = {
  vo2: "VO₂", tempo: "Tempo", seuil: "Seuil",
  footing: "Footing", fartlek: "Fartlek", specifique: "Spécifique", autre: "Autre", custom: "Custom",
};

/** Carte « faite » (séance, test, activité libre) : fond succès doux, bordure 0x40. */
const DONE_CARD = "border-agon-succes/[0.25] bg-agon-succes-doux";
const CARD_BTN = "flex w-full cursor-pointer items-center gap-3 rounded-[6px] border text-left font-[inherit]";

export interface DayPreviewSheetProps {
  day: DayProgram | null;
  onClose: () => void;
  onStartSession: (sess: DayProgram["sessions"][number]["session"], workoutLogId?: string) => void;
  freeSessions: FreeSession[];
  energyByDate: Map<string, UnifiedCalendarEvent[]>;
  onEnergyPreview: (ev: UnifiedCalendarEvent) => void;
  /** Partage en story : le tiroir se ferme, la page ouvre le partage. */
  onShare: (t: ShareTarget) => void;
  onAddActivity: (date: string) => void;
  onEditActivity: (session: FreeSession) => void;
  onTestPress: (id: string) => void;
  competitionsByDate: Map<string, CompetitionDayCardData[]>;
  viewOnly?: boolean;
  dayTheme?: DayThemeLike | null;
  /** Sortie de montre rattachée à chaque séance énergie prévue (par id d'assignation) */
  watchByPlanned?: Map<string, RunMatch>;
}

export function DayPreviewSheet({ day, onClose, onStartSession, freeSessions, energyByDate, onEnergyPreview, onShare, onAddActivity, onEditActivity, onTestPress, competitionsByDate, viewOnly, dayTheme, watchByPlanned }: DayPreviewSheetProps) {
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

  return (
    <Drawer open={!!day} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="border-t-agon-brd bg-agon-s1 pb-8">
        <DrawerHeader className="px-5 pb-2 pt-4">
          <DrawerTitle className="text-[16px] font-bold leading-none text-agon-tx">
            {dateLabel}
            {isToday && (
              <span className="ml-2 rounded-[6px] bg-agon-coach-doux px-2 py-0.5 text-[10px] font-bold text-agon-coach">
                Aujourd'hui
              </span>
            )}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-2.5 px-5">
          {/* Hors du test `empty` : un jour sans séance peut très bien porter un
              thème (« Repos complet »), et c'est justement là qu'il informe. */}
          <DayThemeBanner theme={dayTheme} />

          {empty ? (
            <div className="py-6 text-center text-[13px] text-agon-tx3">
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
                  className={cn("rounded-[6px] border px-4 py-3.5", isCompleted ? DONE_CARD : "border-agon-coach/[0.25] bg-agon-coach-doux")}
                >
                  <div className={cn("flex items-center gap-2.5", exercises.length ? "mb-2.5" : "mb-0")}>
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-[4px] text-[16px]",
                        isCompleted ? "bg-agon-succes/[0.125]" : "bg-agon-coach/[0.125]",
                      )}
                    >
                      {isCompleted ? <Check size={16} className="text-agon-succes" /> : <Dumbbell size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-agon-tx">{session.name}</div>
                      <div className="mt-px text-[10px] text-agon-tx3">
                        {session.short} · {exercises.length} exercice{exercises.length !== 1 ? "s" : ""}
                        {isCompleted ? " · Complétée ✓" : isPast ? " · Manquée" : ""}
                      </div>
                    </div>
                    {workoutLogId && <ShareSessionButton target={{ kind: "workout", id: workoutLogId }} onOpen={(t) => { onClose(); onShare(t); }} />}
                  </div>

                  {/* Exercise preview (up to 5) */}
                  {exercises.length > 0 && (
                    <div className={cn("flex flex-col gap-1", isCompleted || isPast ? "mb-0" : "mb-2.5")}>
                      {exercises.slice(0, 5).map((ex) => (
                        <div
                          key={ex.id}
                          className="flex items-center gap-2 rounded-[4px] bg-agon-s2 px-2.5 py-1.5"
                        >
                          <div className="flex-1 text-[11px] text-agon-tx">{ex.name}</div>
                          {ex.detail && (
                            <div className="text-[10px] text-agon-tx3">{ex.detail}</div>
                          )}
                        </div>
                      ))}
                      {exercises.length > 5 && (
                        <div className="pl-2.5 text-[10px] text-agon-tx3">
                          +{exercises.length - 5} exercice{exercises.length - 5 !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  )}

                  {!isCompleted && !isPast && !viewOnly && (
                    <button
                      onClick={() => { onStartSession(session, workoutLogId); onClose(); haptic(); }}
                      className="min-h-[44px] w-full cursor-pointer rounded-[4px] border-none bg-agon-accent py-[11px] font-[inherit] text-[13px] font-bold text-agon-ink"
                    >
                      Démarrer ▶
                    </button>
                  )}
                </div>
                );
              })}

              {/* Séances énergie */}
              {dayEnergySessions.map((ev) => {
                const kt = ENERGY_KIND_TONE[ev.sessionKind ?? ""] ?? TONE.accent;
                const kl = ENERGY_KIND_LABEL[ev.sessionKind ?? ""] ?? ev.sessionKind ?? "Énergie";
                const isDone = ev.status === "completed";
                const watchRun = watchByPlanned?.get(ev.id);
                return (
                  <div key={ev.id} className="relative">
                  <button
                    onClick={() => { onEnergyPreview(ev); onClose(); haptic(); }}
                    className={cn(CARD_BTN, "py-3.5 pl-4 pr-14", isDone ? DONE_CARD : kt.card)}
                  >
                    <div className="flex size-8 items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM7 21l3-9 3 2v7M5 16l3-4 3 2M14 8l4 2 3-3"/></svg></div>
                    <div className="flex-1">
                      <div className="text-[14px] font-bold text-agon-tx">{ev.title}</div>
                      <div className={cn("mt-0.5 text-[10px] font-semibold", kt.text)}>
                        {kl} · {isDone ? "Complétée ✓" : watchRun ? watchRunText(watchRun) : isPast ? "Manquée" : "À faire"}
                        {isDone && watchRun && <span className="text-agon-succes"> · {watchRunMeasure(watchRun)}</span>}
                      </div>
                    </div>
                    <span className="text-[11px] text-agon-tx3">Voir →</span>
                  </button>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    <ShareSessionButton target={{ kind: "energy", id: ev.id }} onOpen={(t) => { onClose(); onShare(t); }} />
                  </span>
                  </div>
                );
              })}

              {/* Tests */}
              {day.tests.map((t) => {
                const tt = t.type === "musculation" ? TONE.accent
                  : t.type === "energetique" ? TONE.erreur
                  : t.type === "specifique" ? TONE.alerte
                  : TONE.succes;
                return (
                  <button
                    key={t.id}
                    onClick={() => { onTestPress(t.id); onClose(); haptic(); }}
                    className={cn(CARD_BTN, "px-4 py-3.5", t.completed ? DONE_CARD : tt.card)}
                  >
                    <div className="flex size-6 items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg></div>
                    <div className="flex-1">
                      <div className="text-[14px] font-bold text-agon-tx">{t.title}</div>
                      <div className="mt-0.5 text-[10px] text-agon-tx3">
                        {t.type === "biometric" ? "biométrie" : t.type} · {t.completed ? "Réalisé ✓" : "À faire"}
                      </div>
                    </div>
                    {t.completed
                      ? <span className="text-[18px] text-agon-succes">✓</span>
                      : <span className={cn("shrink-0 rounded-[6px] px-2 py-[3px] text-[10px] font-bold", tt.chip)}>Remplir →</span>
                    }
                  </button>
                );
              })}
            </>
          )}

          {/* Free activities logged for this day */}
          {dayFreeActivities.length > 0 && (
            <div className={cn("flex flex-col gap-2", empty ? "mt-0" : "mt-1")}>
              {dayFreeActivities.map((f) => {
                const intColor = f.intensity != null
                  ? (f.intensity <= 3 ? "text-agon-succes" : f.intensity <= 6 ? "text-agon-alerte" : "text-agon-erreur")
                  : "text-agon-tx3";
                return (
                  <button
                    key={f.id}
                    onClick={() => { onEditActivity(f); onClose(); haptic(); }}
                    className={cn(CARD_BTN, "px-3.5 py-3", DONE_CARD)}
                  >
                    <div className="flex size-7 items-center justify-center rounded-[4px] bg-agon-succes-doux text-[11px] font-extrabold text-agon-succes">{f.sportEmoji ?? "AC"}</div>
                    <div className="flex-1">
                      <div className="text-[13px] font-bold text-agon-tx">{f.name}</div>
                      <div className="mt-0.5 text-[10px] text-agon-tx3">
                        {f.duration ? `${f.duration} min` : ""}
                        {f.duration && f.intensity != null ? " · " : ""}
                        {f.intensity != null ? <span className={intColor}>Intensité {f.intensity}/10</span> : null}
                        {f.note ? ` · "${f.note}"` : ""}
                      </div>
                    </div>
                    <span className="text-[11px] text-agon-tx3"></span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Add free activity button (today + past only) */}
          {!isFuture && (
            <button
              onClick={() => { onAddActivity(day.date); onClose(); haptic(); }}
              className={cn(
                "w-full cursor-pointer rounded-[4px] border border-dashed border-agon-brd-l bg-transparent py-[11px] font-[inherit] text-[13px] font-semibold text-agon-tx3",
                empty && dayFreeActivities.length === 0 ? "mt-0" : "mt-1",
              )}
            >
              + Activité libre
            </button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
