import { useMemo } from "react";
import type { AllSets } from "@/features/athlete/components/workout-detail/workoutDetailTypes";
import type { WorkoutBlocData } from "@/features/shared/hooks/useWorkoutSession";
import { SessionShareSheet, type ShareVariant } from "@/features/shared/components/share/SessionShareSheet";
import { buildMuscuShare, sessionRecords, type SessionRecordLog } from "@/lib/share/buildMuscuShare";
import { blocColor, TYPE_COLOR } from "@/lib/peps";
import { C } from "@/lib/theme";
import { localIsoDay } from "@shared/domain/dates";

/**
 * Partage d'une séance de musculation : version prévue (toujours) et faite
 * (si la séance est validée). Records : ceux calculés à la validation.
 */
export function MuscuShareSheet({
  title, day, weekNumber, blocs, sets, completed, rpe, comment, oneRmByEx, recordRefByEx, prLogs, celebrate, onClose,
}: {
  title: string;
  day: string | null;
  weekNumber: number | null;
  blocs: WorkoutBlocData[];
  sets: AllSets;
  completed: boolean;
  rpe: number | null;
  comment: string | null;
  oneRmByEx: Record<string, number | null>;
  recordRefByEx: Record<string, string | null>;
  prLogs: readonly SessionRecordLog[] | undefined;
  celebrate?: boolean;
  onClose: () => void;
}) {
  const variants = useMemo<ShareVariant[]>(() => {
    const shareBlocs = blocs.map((b, i) => ({
      name: b.name ?? "",
      color: blocColor(b.color, i),
      exercices: b.exercices.map((e) => ({ id: e.id, exercise_name: e.exercise_name, params: e.params, mode: e.mode, libre_text: e.libre_text })),
    }));
    // Records datés du jour de validation : jour prévu, ou aujourd'hui juste après.
    const records = completed ? sessionRecords(prLogs, recordRefByEx, sets, [day, celebrate ? localIsoDay() : null]) : {};
    const base = {
      day, title, weekNumber, blocs: shareBlocs, oneRmByEx, accent: TYPE_COLOR.muscu, successColor: C.g,
    };
    const out: ShareVariant[] = [{
      key: "planned",
      build: (opts, people) => buildMuscuShare({ ...base, done: false, ...people }, opts),
    }];
    if (completed) {
      out.push({
        key: "done",
        build: (opts, people) => buildMuscuShare({ ...base, done: true, sets, rpe, comment, records, ...people }, opts),
      });
    }
    return out;
  }, [blocs, sets, completed, rpe, comment, oneRmByEx, recordRefByEx, prLogs, day, title, weekNumber, celebrate]);

  return (
    <SessionShareSheet variants={variants} initial={completed ? "done" : "planned"} day={day} hasLoads celebrate={celebrate} onClose={onClose} />
  );
}
