/**
 * Hook pour calculer les kilomètres parcourus par semaine, ventilés par sport.
 *
 * Sources :
 *  - Free sessions (activités libres avec distance_km)
 *  - Energy session assignments (séances assignées avec total_distance_m)
 */
import { useMemo } from "react";
import type { FreeSession } from "../types/athlete";
import type { EnergySessionAssignmentRow } from "@/types/energy";
import { useEnergyAssignments } from "./useEnergyAssignments";

export interface SportDistance {
  sport: string;
  label: string;
  km: number;
  color: string;
}

export interface WeeklyDistances {
  /** Total km toutes disciplines confondues */
  total: number;
  /** Ventilation par sport, triée par km décroissant */
  bySport: SportDistance[];
}

const SPORT_META: Record<string, { label: string; color: string }> = {
  course:   { label: "Course",   color: "#FF5A33" },
  velo:     { label: "Vélo",     color: "#33B5FF" },
  natation: { label: "Natation", color: "#1FF0B0" },
  marche:   { label: "Marche",   color: "#66F03C" },
  ski:      { label: "Ski",      color: "#F060C0" },
  autre:    { label: "Autre",    color: "#7D7468" },
};

/** Mapping session_kind → sport pour les energy sessions */
function energySessionSport(modality: string | null | undefined, _sessionKind: string | null | undefined): string {
  if (modality) {
    const m = modality.toLowerCase();
    if (m.includes("vélo") || m.includes("velo") || m.includes("cycl")) return "velo";
    if (m.includes("nat") || m.includes("swim")) return "natation";
    if (m.includes("march")) return "marche";
    if (m.includes("ski")) return "ski";
    if (m.includes("aviron") || m.includes("row")) return "autre";
  }
  // Par défaut les energy sessions (vo2, tempo, footing, seuil, fartlek) = course
  return "course";
}

function weekRange(): { monday: string; sunday: string } {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  const mon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sun = new Date(d);
  sun.setDate(d.getDate() + 6);
  const sunISO = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, "0")}-${String(sun.getDate()).padStart(2, "0")}`;
  return { monday: mon, sunday: sunISO };
}

export function useWeeklyDistances(
  athleteId: string | null | undefined,
  freeSessions: FreeSession[],
): WeeklyDistances {
  const { monday, sunday } = useMemo(weekRange, []);

  const { data: energyAssignments = [] } = useEnergyAssignments(
    athleteId,
    { from: monday, to: sunday },
  );

  return useMemo(() => {
    const acc: Record<string, number> = {};

    // 1. Free sessions de la semaine avec distance
    for (const fs of freeSessions) {
      if (!fs.date || fs.date < monday || fs.date > sunday) continue;
      if (!fs.distance_km || fs.distance_km <= 0) continue;
      const sport = fs.sport ?? "autre";
      acc[sport] = (acc[sport] ?? 0) + fs.distance_km;
    }

    // 2. Energy assignments completed de la semaine avec distance
    for (const ea of energyAssignments) {
      if (ea.status !== "completed") continue;
      const es = ea.energy_sessions;
      if (!es?.total_distance_m || es.total_distance_m <= 0) continue;
      const sport = energySessionSport(es.modality, es.session_kind);
      const km = es.total_distance_m / 1000;
      acc[sport] = (acc[sport] ?? 0) + km;
    }

    const bySport: SportDistance[] = Object.entries(acc)
      .map(([sport, km]) => ({
        sport,
        label: SPORT_META[sport]?.label ?? sport,
        km: Math.round(km * 10) / 10,
        color: SPORT_META[sport]?.color ?? "#7D7468",
      }))
      .sort((a, b) => b.km - a.km);

    const total = Math.round(bySport.reduce((s, d) => s + d.km, 0) * 10) / 10;

    return { total, bySport };
  }, [freeSessions, energyAssignments, monday, sunday]);
}
