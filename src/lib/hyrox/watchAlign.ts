/**
 * Recaler la montre sur une course HYROX (demande d'Hugo, 16/11/2026) : la
 * montre et le chronométrage officiel sont deux appareils, leurs départs ne
 * coïncident pas. Le décalage = seconde de l'enregistrement où la course
 * commence (négatif si la montre a été lancée après le départ).
 *
 * Proposition automatique, du signal le plus sûr au moins sûr :
 * 1. cadence : les 8 runs ont une cadence nettement plus haute que les
 *    stations ; on cherche le décalage qui fait le meilleur contraste ;
 * 2. FC : montée de FC au départ du run 1 (moyenne juste après le départ
 *    moins moyenne juste avant) ;
 * 3. à défaut, la course finit avec l'enregistrement.
 *
 * Pur et testé ; les données de montre ne passent jamais par une IA.
 */
import type { ActivityStream } from "@shared/activityFiles/stream";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { raceTimeline, type RaceSegment } from "./raceWatch";

/** Marge de recherche autour de l'enregistrement (s). */
export const ALIGN_MARGIN_S = 180;
/** Amplitude du curseur manuel autour de la proposition (s). */
export const MANUAL_RANGE_S = 300;

export type AlignMethod = "cadence" | "fc" | "fin";

export interface AutoOffset {
  offsetS: number;
  method: AlignMethod;
}

/** Série ramenée à la seconde, avec sommes cumulées pour des moyennes en O(1). */
class Grid {
  private sum: Float64Array;
  private cnt: Uint32Array;
  readonly len: number;
  constructor(t: number[], col: Array<number | null> | null | undefined) {
    this.len = t.length ? t[t.length - 1] + 1 : 0;
    const v = new Float64Array(this.len);
    const c = new Uint8Array(this.len);
    if (col) {
      for (let i = 0; i < t.length; i++) {
        const x = col[i];
        if (x != null && Number.isFinite(x) && x > 0 && t[i] >= 0 && t[i] < this.len) { v[t[i]] = x; c[t[i]] = 1; }
      }
    }
    this.sum = new Float64Array(this.len + 1);
    this.cnt = new Uint32Array(this.len + 1);
    for (let i = 0; i < this.len; i++) { this.sum[i + 1] = this.sum[i] + v[i]; this.cnt[i + 1] = this.cnt[i] + c[i]; }
  }
  /** Somme et nombre de valeurs sur [from, to[ (bornes ramenées à la série). */
  range(from: number, to: number): [number, number] {
    const a = Math.max(0, Math.min(this.len, Math.floor(from)));
    const b = Math.max(0, Math.min(this.len, Math.floor(to)));
    return b > a ? [this.sum[b] - this.sum[a], this.cnt[b] - this.cnt[a]] : [0, 0];
  }
  mean(from: number, to: number): number | null {
    const [s, n] = this.range(from, to);
    return n > 0 ? s / n : null;
  }
  get filled(): number { return this.cnt[this.len] ?? 0; }
}

function candidates(endS: number, totalS: number): [number, number] {
  return [-ALIGN_MARGIN_S, Math.max(0, endS - totalS) + ALIGN_MARGIN_S];
}

/** Contraste de cadence runs / stations pour un décalage donné. */
function cadenceScore(g: Grid, segs: RaceSegment[], o: number): number | null {
  let rs = 0, rn = 0, ss = 0, sn = 0;
  for (const s of segs) {
    if (s.kind === "roxzone") continue;
    const [sum, n] = g.range(o + s.startS, o + s.endS);
    if (s.kind === "run") { rs += sum; rn += n; } else { ss += sum; sn += n; }
  }
  if (rn < 60 || sn < 60) return null;
  return rs / rn - ss / sn;
}

/** Meilleur score ; à égalité sur un plateau, le milieu du plateau. */
function argmax(lo: number, hi: number, score: (o: number) => number | null): { o: number; score: number } | null {
  let bestScore = -Infinity;
  let from: number | null = null;
  let to: number | null = null;
  for (let o = lo; o <= hi; o++) {
    const sc = score(o);
    if (sc == null) continue;
    if (sc > bestScore + 1e-9) { bestScore = sc; from = o; to = o; }
    else if (Math.abs(sc - bestScore) <= 1e-9 && to === o - 1) to = o;
  }
  return from == null || to == null ? null : { o: Math.round((from + to) / 2), score: bestScore };
}

/** Proposition de décalage ; `null` sans série ou si la course ne se découpe pas. */
export function autoRaceOffset(stream: ActivityStream | null, race: HyroxResult): AutoOffset | null {
  if (!stream || stream.t.length < 2) return null;
  const tl = raceTimeline(race);
  if (!tl) return null;
  const endS = stream.t[stream.t.length - 1];
  const [lo, hi] = candidates(endS, race.total_s);

  const cad = new Grid(stream.t, stream.cadence as Array<number | null> | null);
  if (cad.filled > race.total_s * 0.5) {
    const best = argmax(lo, hi, (o) => cadenceScore(cad, tl.segments, o));
    // Contraste franc (au moins 20 pas/min) : sinon le signal ne tranche pas.
    if (best && best.score >= 20) return { offsetS: best.o, method: "cadence" };
  }

  const hr = new Grid(stream.t, stream.hr as Array<number | null> | null);
  if (hr.filled > race.total_s * 0.5) {
    const best = argmax(Math.max(lo, 30), Math.min(hi, endS - 60), (o) => {
      const after = hr.mean(o, o + 90);
      const before = hr.mean(o - 90, o);
      return after == null || before == null ? null : after - before;
    });
    if (best && best.score >= 8) return { offsetS: best.o, method: "fc" };
  }

  return { offsetS: endS - race.total_s > 120 ? Math.round(endS - race.total_s) : 0, method: "fin" };
}

export const ALIGN_METHOD_LABEL: Record<AlignMethod, string> = {
  cadence: "calé sur la cadence (runs contre stations)",
  fc: "calé sur la montée de FC au départ",
  fin: "course supposée finir avec l'enregistrement",
};

export interface SegmentHrDynamics {
  key: string;
  kind: RaceSegment["kind"];
  label: string;
  /** FC moyenne des 15 premières et des 15 dernières secondes du segment. */
  startHr: number | null;
  endHr: number | null;
  /** endHr − startHr : remontée en station (positif), récupération en Roxzone (négatif). */
  deltaHr: number | null;
}

/** Évolution de la FC dans chaque segment, une fois la montre recalée. */
export function segmentHrDynamics(stream: ActivityStream | null, race: HyroxResult, offsetS: number): SegmentHrDynamics[] {
  const tl = raceTimeline(race);
  if (!tl || !stream) return [];
  const hr = new Grid(stream.t, stream.hr as Array<number | null> | null);
  return tl.segments.map((s) => {
    const a = offsetS + s.startS;
    const b = offsetS + s.endS;
    const w = Math.min(15, (b - a) / 3);
    const start = hr.mean(a, a + w);
    const end = hr.mean(b - w, b);
    return {
      key: s.key,
      kind: s.kind,
      label: s.label,
      startHr: start == null ? null : Math.round(start),
      endHr: end == null ? null : Math.round(end),
      deltaHr: start == null || end == null ? null : Math.round(end - start),
    };
  });
}

/** « 4:05 », « −0:12 » : position d'un instant dans l'enregistrement. */
export function fmtOffset(s: number): string {
  const r = Math.round(Math.abs(s));
  const h = Math.floor(r / 3600);
  const m = Math.floor((r % 3600) / 60);
  const ss = String(r % 60).padStart(2, "0");
  const body = h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
  return s < 0 ? `−${body}` : body;
}
