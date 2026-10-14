/**
 * TodayWorkoutFiches — chips compactes des fiches de la séance du jour
 * (séance + blocs, variante de la semaine) et pastille si une fiche n'a
 * jamais été ouverte. À placer dans une carte en position relative.
 */
import { C } from "@/lib/theme";
import { useWorkoutSession } from "@/features/shared/hooks/useWorkoutSession";
import { FicheLinks } from "@/features/shared/components/fiches/FicheLinks";
import { useHasUnseenFiche } from "@/features/shared/hooks/fiches/useHasUnseenFiche";

export function TodayWorkoutFiches({ workoutLogId, athleteId }: { workoutLogId: string; athleteId: string | null | undefined }) {
  const workout = useWorkoutSession(workoutLogId);
  const all = [...workout.sessionFiches, ...workout.blocs.flatMap(b => b.fiches ?? [])];
  const unseen = useHasUnseenFiche(all, workout.weekNumber, athleteId);
  if (all.length === 0) return null;
  return (
    <>
      {unseen && (
        <span
          title="Nouvelle fiche"
          aria-label="Nouvelle fiche"
          style={{ position: "absolute", top: 10, right: 10, zIndex: 2, width: 10, height: 10, borderRadius: "50%", background: C.ac, boxShadow: "0 0 0 3px " + C.s1 }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1, marginBottom: 12 }}>
        <FicheLinks compact attachments={all} week={workout.weekNumber} athleteId={athleteId} />
      </div>
    </>
  );
}
