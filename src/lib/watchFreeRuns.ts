/**
 * Sorties de montre qui ne correspondent à aucune séance prévue ni à aucune
 * activité libre saisie : on les montre dans la case du jour des Retours comme
 * une activité libre « Course (montre) ». Pur, testable.
 */
import type { FreeActivityDetail } from "@/features/shared/types/retours.types";
import type { RunMatch, RunOuting, WatchActivityInput } from "@/lib/watchRunMatching";

const SPORT_LABEL: Record<string, string> = {
  trail_running: "Trail",
  treadmill_running: "Course sur tapis",
  track_running: "Piste",
};

const fmtKm = (km: number) => km.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

function fmtPace(sPerKm: number | null): string | null {
  if (!sPerKm || !Number.isFinite(sPerKm) || sPerKm <= 0) return null;
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}'${String(s).padStart(2, "0")}/km`;
}

export function watchRunsAsFreeActivities(
  outings: readonly RunOuting[],
  matchByActivity: ReadonlyMap<string, RunMatch>,
  from: string,
  to: string,
): FreeActivityDetail[] {
  return outings
    .filter((o) =>
      o.origin === "activity" && o.activityId != null && o.label == null
      && !matchByActivity.has(o.activityId)
      && o.date >= from && o.date <= to)
    .map((o) => {
      const pace = fmtPace(o.paceSPerKm);
      const device = o.device ?? (o.provider ? o.provider.charAt(0).toUpperCase() + o.provider.slice(1) : null);
      return {
        id: `watch:${o.activityId}`,
        activityId: o.activityId!,
        name: `${(o.sport && SPORT_LABEL[o.sport]) || "Course"} · ${fmtKm(o.km)} km`,
        date: o.date,
        sport: "course",
        sportEmoji: "🏃",
        duration: o.durationS ? Math.round(o.durationS / 60) : undefined,
        note: [pace, device ? `détectée par ${device}` : "détectée par la montre"].filter(Boolean).join(" · "),
      };
    });
}

const OTHER_SPORT: Record<string, { label: string; emoji: string }> = {
  cycling: { label: "Vélo", emoji: "🚴" }, road_biking: { label: "Vélo", emoji: "🚴" }, mountain_biking: { label: "VTT", emoji: "🚵" },
  indoor_cycling: { label: "Home-trainer", emoji: "🚴" }, swimming: { label: "Natation", emoji: "🏊" }, lap_swimming: { label: "Natation", emoji: "🏊" },
  open_water_swimming: { label: "Nage en eau libre", emoji: "🏊" }, walking: { label: "Marche", emoji: "🚶" }, hiking: { label: "Randonnée", emoji: "🥾" },
  rowing: { label: "Rameur", emoji: "🚣" }, indoor_rowing: { label: "Rameur", emoji: "🚣" }, strength_training: { label: "Renforcement", emoji: "🏋️" },
};

/** Activités de montre hors course (vélo, natation…) : affichées comme activité libre, ouvrables en vue séance. */
export function watchOthersAsFreeActivities(others: readonly WatchActivityInput[], from: string, to: string): FreeActivityDetail[] {
  return others
    .filter((a) => a.localDate >= from && a.localDate <= to)
    .map((a) => {
      const sport = (a.sport && OTHER_SPORT[a.sport]) || { label: a.title?.trim() || "Activité", emoji: "⌚" };
      const km = a.distanceM && a.distanceM > 0 ? ` · ${fmtKm(a.distanceM / 1000)} km` : "";
      return {
        id: `watch:${a.id}`,
        activityId: a.id,
        name: `${sport.label}${km}`,
        date: a.localDate,
        sport: a.sport ?? "autre",
        sportEmoji: sport.emoji,
        duration: a.durationS ? Math.round(a.durationS / 60) : undefined,
        note: a.deviceName ? `détectée par ${a.deviceName}` : "détectée par la montre",
      };
    });
}

/**
 * Activités libres saisies par l'athlète : rattache la sortie de montre du même
 * jour qui porte son nom, pour ouvrir la vue séance au clic.
 */
export function linkFreeActivities(
  free: readonly FreeActivityDetail[],
  outings: readonly RunOuting[],
  others: readonly WatchActivityInput[] = [],
): { free: FreeActivityDetail[]; usedOtherIds: Set<string> } {
  const used = new Set<string>();
  const linked = free.map((f) => {
    if (f.activityId) return f;
    const o = outings.find((x) => x.origin === "activity" && x.activityId && x.date === f.date && x.label != null && x.label === f.name?.trim());
    if (o) return { ...f, activityId: o.activityId! };
    // Hors course : la seule activité de montre du jour encore libre (vélo, natation…).
    const other = others.find((a) => a.localDate === f.date && !used.has(a.id));
    if (other) { used.add(other.id); return { ...f, activityId: other.id }; }
    return f;
  });
  return { free: linked, usedOtherIds: used };
}
