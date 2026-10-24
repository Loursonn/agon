import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { AthleteModifications } from "@/features/shared/types/athlete";
import {
  ATHLETE_CHOICE_LABEL,
  athleteMoveTitle,
  formatChoiceSets,
  summarizeAthleteChoices,
} from "@/lib/athleteChoices";

const AMBER = "#F59E0B";

/** Petit tag « Choix de l'athlète ». */
export function AthleteChoiceTag({ label = ATHLETE_CHOICE_LABEL }: { label?: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
      background: AMBER + "20", color: AMBER, letterSpacing: "0.3px",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

/** Badge déplacement / ajout athlète (rien si la séance n'a pas été touchée). */
export function AthleteMoveBadge({ event }: { event: CalEvent }) {
  if (event.type !== "workout" || !event.rescheduledByAthlete) return null;
  return <AthleteChoiceTag label={athleteMoveTitle(event.date, event.originalScheduledDate)} />;
}

/**
 * Tout ce que l'athlète a choisi sur cette séance : exercices ajoutés, séries
 * bonus, séries sautées, commentaires. Masqué s'il n'y a rien.
 */
export function AthleteChoicesPanel({ event, plannedExerciceIds }: {
  event: CalEvent;
  plannedExerciceIds?: Iterable<string>;
}) {
  const mods = (event.raw?.athlete_modifications as AthleteModifications | null) ?? null;
  const choices = summarizeAthleteChoices({
    mods,
    plannedExerciceIds,
    scheduledDate: event.date,
    originalScheduledDate: event.originalScheduledDate,
    rescheduledByAthlete: event.rescheduledByAthlete,
  });
  if (!choices.any) return null;

  return (
    <div style={{
      background: AMBER + "0D", border: "1px solid " + AMBER + "40", borderRadius: 4,
      padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <AthleteChoiceTag />
      </div>
      {choices.moved && (
        <div style={{ fontSize: 11, color: C.tx2 }}>{athleteMoveTitle(choices.moved.to, choices.moved.from)}</div>
      )}
      {choices.exercises.map((ex) => (
        <div key={ex.key} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11 }}>
          <span style={{ fontWeight: 700, color: C.tx }}>{ex.name}</span>
          <span style={{ color: C.tx3, fontSize: 10 }}>
            {ex.kind === "bonus" ? "séries en plus" : "ajouté"} · {formatChoiceSets(ex.sets)}
          </span>
        </div>
      ))}
      {choices.skippedSets > 0 && (
        <div style={{ fontSize: 11, color: C.tx2 }}>
          {choices.skippedSets} série{choices.skippedSets > 1 ? "s" : ""} sautée{choices.skippedSets > 1 ? "s" : ""}
        </div>
      )}
      {choices.exerciceComments > 0 && (
        <div style={{ fontSize: 11, color: C.tx2 }}>
          {choices.exerciceComments} commentaire{choices.exerciceComments > 1 ? "s" : ""} sur les exercices
        </div>
      )}
      {choices.sessionComment && (
        <div style={{ fontSize: 11, color: C.tx2, fontStyle: "italic" }}>« {choices.sessionComment} »</div>
      )}
    </div>
  );
}
