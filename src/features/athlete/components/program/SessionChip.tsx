import { C } from "@/lib/theme";
import { DOW_SHORT_FR, ENERGY_KIND_LABEL } from "@/features/athlete/components/program/programConstants";
import { ProgramSessionCard } from "@/features/athlete/components/program/ProgramSessionCard";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/peps";
import type { WeekSession } from "@/features/shared/hooks/useActivePlan";
import { haptic, isMissedWeekSession } from "@/features/athlete/components/program/programUtils";

// ── Session chip (within a day) ───────────────────────────────────────────────

export function SessionChip({
  session,
  today,
  onPress,
  onReschedule,
  onStart,
}: {
  session: WeekSession;
  today: string;
  onPress: (s: WeekSession) => void;
  onReschedule?: (s: WeekSession) => void;
  /** Jour même, séance de musculation à faire : démarre directement. */
  onStart?: (s: WeekSession) => void;
}) {
  const isDone   = session.status === "completed";
  const isMissed = isMissedWeekSession(session, today);
  const hyrox    = session.kind === "energy" && session.sessionKind === "specifique";
  const color    = session.kind === "workout" ? TYPE_COLOR.muscu : hyrox ? TYPE_COLOR.hyrox : TYPE_COLOR.energie;
  const typeLabel = session.kind === "workout"
    ? TYPE_LABEL.muscu
    : hyrox ? TYPE_LABEL.hyrox : (ENERGY_KIND_LABEL[session.sessionKind ?? ""] ?? TYPE_LABEL.energie);
  const moved = session.rescheduledByAthlete && session.originalScheduledDate && !isDone
    ? `Déplacée du ${DOW_SHORT_FR[(new Date(session.originalScheduledDate + "T12:00:00").getDay() + 6) % 7].toLowerCase()}.`
    : null;
  const isToday = session.scheduledDate === today;
  const canAct = !isDone && !isMissed;

  return (
    <ProgramSessionCard
      color={color}
      typeLabel={typeLabel}
      title={session.sessionName}
      done={isDone}
      muted={isMissed}
      status={isMissed ? "Manquée" : moved}
      statusColor={isMissed ? C.tx3 : TYPE_COLOR.hyrox}
      highlight={isToday && canAct}
      onPress={() => { haptic(); onPress(session); }}
      onStart={canAct && isToday && session.kind === "workout" && onStart ? () => { haptic(); onStart(session); } : undefined}
      onMenu={(canAct || isMissed) && onReschedule ? () => { haptic(); onReschedule(session); } : undefined}
    />
  );
}
