import { MONTHS_FR } from "@/features/athlete/components/program/programConstants";
import type { WeekDay, WeekSession } from "@/features/shared/hooks/useActivePlan";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function haptic() { if (navigator.vibrate) navigator.vibrate(10); }
export function fmtShort(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
}
// ── Helpers ───────────────────────────────────────────────────────────────────

export function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
// ── Reschedule drawer ─────────────────────────────────────────────────────────

/** Séance ratée : manquée, ou prévue un jour passé (le cron ne l'a pas encore marquée). */
export function isMissedWeekSession(s: WeekSession, today: string): boolean {
  return s.status === "missed" || (s.status === "planned" && s.scheduledDate < today);
}
export function localMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function weekLabel(offset: number): string {
  if (offset === 0)  return "Cette semaine";
  if (offset === 1)  return "Semaine prochaine";
  if (offset === -1) return "Semaine dernière";
  return offset > 0 ? `Dans ${offset} semaines` : `Il y a ${-offset} semaines`;
}

export function weekRangeLabel(days: WeekDay[]): string {
  if (!days.length) return "";
  return `${fmtShort(days[0].date)} → ${fmtShort(days[days.length - 1].date)}`;
}
