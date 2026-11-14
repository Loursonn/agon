import { DAYS_FR, MONTHS_FR } from "@/features/athlete/components/today/todayConstants";
import type { SessionPreviewItem } from "@/features/shared/hooks/useWeekProgram";
import { formatSetsReps, hasIso } from "@/lib/formatSetsReps";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}
export function todayFr(): string {
  const d = new Date();
  return `${DAYS_FR[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}

/** « 18 NOV. » : jour court d'une date ISO, pour les cartes de l'accueil. */
export function fmtShortDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
/** Prescription courte d'un exercice de ProgSession (« 4 × 8 »). */
export function previewDetail(it: SessionPreviewItem): string {
  if (it.mode === "libre" || !it.params) return it.mode === "libre" ? "Libre" : "";
  return formatSetsReps(it.params) + (hasIso(it.params) ? " · Iso" : "");
}
export function localMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
