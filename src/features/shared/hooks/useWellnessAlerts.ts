/**
 * Alertes wellness du coach : les athlètes dont la dernière saisie s'écarte de
 * leur propre habitude (cf. `src/lib/wellnessBaseline.ts`).
 *
 * Remplace l'ancien `useOverloadedAthletes`, qui testait `fatigue > 7` sur une
 * échelle de 1 à 5 (condition morte) et `sommeil < 5` (vrai presque tous les
 * jours). Ici, le seuil est propre à chaque athlète.
 */
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { localISO } from "@/lib/date";
import { assessWellness, daysBetween, type WellnessAssessment } from "@/lib/wellnessBaseline";
import type { WellnessHistory } from "@shared/domain/wellness";
import { useWellnessHistories } from "./useWellness";

export interface WellnessAlert {
  athleteId: string;
  athleteName: string;
  assessment: WellnessAssessment;
}

/** Réponse « blessé/malade » de la dernière saisie (aujourd'hui ou hier). */
export interface WellnessInjuryAlert {
  athleteId: string;
  athleteName: string;
  /** Jour ISO de la saisie. */
  day: string;
  note: string;
}

/** Rouge avant orange, puis l'écart le plus marqué en premier. */
function severity(a: WellnessAlert): number {
  const rank = a.assessment.level === "alerte" ? 0 : 1;
  const worst = a.assessment.deviations[0]?.z ?? 0;
  return rank * 1000 + worst;
}

/** Dernière saisie récente (aujourd'hui ou hier) avec un commentaire « blessé/malade ». */
export function recentInjuryNote(h: WellnessHistory, today: string): { day: string; note: string } | null {
  const days = Object.keys(h).sort();
  const last = days[days.length - 1];
  if (!last) return null;
  const age = daysBetween(last, today);
  const note = h[last].injuryNote;
  return note && age >= 0 && age <= 1 ? { day: last, note } : null;
}

/**
 * Athlètes en vigilance ou en alerte, les plus critiques d'abord, et athlètes
 * qui se déclarent blessés/malades dans leur dernière saisie (`injuries`).
 * Une seule requête pour tous les athlètes (`asp:wh` + archive), lue par le
 * domaine wellness : les clés compactes réelles sont enfin vues.
 */
export function useWellnessAlerts() {
  const { athletes } = useAuth();
  const today = localISO(new Date());
  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);
  const query = useWellnessHistories(athleteIds);

  const { alerts, injuries } = useMemo(() => {
    const alerts: WellnessAlert[] = [];
    const injuries: WellnessInjuryAlert[] = [];
    for (const a of athletes) {
      const h = query.data?.[a.id];
      if (!h) continue;
      const athleteName = a.full_name ?? "Athlète";
      const assessment = assessWellness(h, today);
      if (assessment.level !== "none") alerts.push({ athleteId: a.id, athleteName, assessment });
      const inj = recentInjuryNote(h, today);
      if (inj) injuries.push({ athleteId: a.id, athleteName, ...inj });
    }
    alerts.sort((x, y) => severity(x) - severity(y));
    return { alerts, injuries };
  }, [query.data, athletes, today]);

  return { alerts, injuries, isLoading: query.isLoading };
}
