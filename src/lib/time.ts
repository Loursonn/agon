/**
 * Time formatting utilities for mm:ss / h:mm:ss durations.
 * Shared across HYROX, tests, and energy modules.
 */

/** Parse a time string (h:mm:ss, mm:ss, m:ss, ss) to seconds. Returns null on invalid input. */
export function parseMmSs(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(',', '.');
  const parts = cleaned.split(':').map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 1) {
    return parts[0] >= 0 ? Math.round(parts[0]) : null;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    if (m < 0 || s < 0 || s >= 60) return null;
    return m * 60 + Math.round(s);
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (h < 0 || m < 0 || m >= 60 || s < 0 || s >= 60) return null;
    return h * 3600 + m * 60 + Math.round(s);
  }
  return null;
}

/** Format seconds as m:ss or h:mm:ss. Returns "—" for null. */
export function formatMmSs(s: number | null, opts?: { hours?: boolean }): string {
  if (s == null) return '—';
  const neg = s < 0;
  const abs = Math.abs(Math.round(s));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sec = abs % 60;
  const sign = neg ? '-' : '';

  if (h > 0 || opts?.hours) {
    return `${sign}${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}

/** Format a delta in seconds with sign: +1:41 / −0:12. Uses typographic minus. */
export function formatDelta(s: number): string {
  const sign = s >= 0 ? '+' : '−';
  const abs = Math.abs(Math.round(s));
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}
