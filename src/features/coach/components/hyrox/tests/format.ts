/** Formats, styles et constantes partagés par la partie Tests HYROX. */
import type { CSSProperties } from "react";
import { C } from "@/lib/theme";
import { fmtTime, fr, type GridRow, type HyroxTestAnalysisRow } from "@/lib/hyrox/tests";

export const NOTE_LABELS = ["à construire", "en dessous", "moyen Open", "haut d'Open", "niveau Pro"] as const;
export const NOTE_COLORS = [C.r, C.o, C.y, C.g, C.b] as const;

export const noteColor = (n: number | null | undefined) => (n == null ? C.tx3 : NOTE_COLORS[Math.max(1, Math.min(5, Math.round(n))) - 1]);

export const inputStyle: CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2,
  color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

export const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 700, color: C.tx2, marginBottom: 4, display: "block" };

// ── Formats ──────────────────────────────────────────────────────────────────

const TIME_METRICS = new Set(["row_2000", "ski_2000", "bbj_80"]);
const PCT_METRICS = new Set(["cs_vma", "triple_ratio", "sled_push_reserve", "sled_pull_reserve"]);
const RATIO_METRICS = new Set(["press_rel", "thruster_rel", "hop_height"]);
const UNITS: Record<string, string> = {
  vma: " km/h", cs: " km/h", cooper: " m", wall_balls: " reps", broad_jump: " cm", dead_hang: " s",
  calf_raise: " reps", knee_to_wall: " cm", bridge: " reps", sit_to_stand: " reps",
};

export function fmtThreshold(key: string, x: number): string {
  if (TIME_METRICS.has(key)) return fmtTime(x);
  if (PCT_METRICS.has(key)) return `${Math.round(x * 100)} %`;
  if (RATIO_METRICS.has(key)) return fr(x, 2);
  return `${fr(x, Number.isInteger(x) ? 0 : 1)}${UNITS[key] ?? ""}`;
}

/** Les 5 niveaux d'une grille, en clair, du meilleur au moins bon. */
export function gridLevels(key: string, row: GridRow): { note: number; label: string; range: string }[] {
  const t = row.thresholds;
  const f = (x: number) => fmtThreshold(key, x);
  const hi = row.direction === "higher";
  const ranges = hi
    ? [`< ${f(t[0])}`, `${f(t[0])} à ${f(t[1])}`, `${f(t[1])} à ${f(t[2])}`, `${f(t[2])} à ${f(t[3])}`, `≥ ${f(t[3])}`]
    : [`≥ ${f(t[0])}`, `${f(t[1])} à ${f(t[0])}`, `${f(t[2])} à ${f(t[1])}`, `${f(t[3])} à ${f(t[2])}`, `< ${f(t[3])}`];
  return ranges.map((range, i) => ({ note: i + 1, label: NOTE_LABELS[i], range })).reverse();
}

/**
 * Chrono HYROX saisi -> secondes : « 1:20:00 », « 1:20 » (h:mm, moins de 4 h),
 * « 80:00 » (mm:ss) ou « 80 » (minutes).
 */
export function parseChrono(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  if (s.includes(":")) {
    const p = s.split(":").map(Number);
    if (p.some(x => !Number.isFinite(x))) return null;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] < 4 ? p[0] * 3600 + p[1] * 60 : p[0] * 60 + p[1];
    return null;
  }
  const m = Number(s);
  return Number.isFinite(m) && m > 0 ? Math.round(m * 60) : null;
}

/** Saisie d'une variable de test : « 7,5 », « 4:30 », « 1:02:15 ». */
export function parseEntry(raw: string, valueType: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  if ((valueType === "duration" || valueType === "pace") && s.includes(":")) {
    const p = s.split(":").map(Number);
    if (p.some(x => !Number.isFinite(x))) return null;
    return p.reduce((acc, x) => acc * 60 + x, 0);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function displayEntry(x: number, valueType: string): string {
  if ((valueType === "duration" || valueType === "pace") && x >= 60) return fmtTime(x);
  return String(x).replace(".", ",");
}

export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Mots à éviter dans ce que lit l'athlète (règles de vocabulaire YOXX). */
export function vocabularyWarnings(text: string): string[] {
  const w: string[] = [];
  if (/\bmoteur\b/i.test(text)) w.push("« moteur » : écrire « système cardio-respiratoire ».");
  if (/\btenue\b/i.test(text)) w.push("« tenue » : écrire « seuils ».");
  if (/\ble HYROX\b/.test(text)) w.push("« le HYROX » : écrire « l'HYROX ».");
  if (/\bune HYROX\b/i.test(text)) w.push("« une HYROX » : écrire « un HYROX ».");
  if (/\bVO2\b|\bVC\b|\bD′|\bZ[1-6]\b/.test(text)) w.push("Jargon coach (VC, VO2, D′, Z1-Z6) : l'athlète voit 3 zones et des mots simples.");
  return w;
}

export const kindLabel = (k: string) => (k === "bilan" ? "Bilan d'entrée" : "Retest");

/** L'analyse précédente dans le temps (bilan vs retest). Liste triée de la plus récente à la plus ancienne. */
export function previousOf(list: HyroxTestAnalysisRow[], a: HyroxTestAnalysisRow) {
  return list.find(x => x.id !== a.id && x.date < a.date) ?? null;
}
