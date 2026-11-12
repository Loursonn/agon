import type { BetterWhen } from "@/features/shared/types/tests";
import { isBetter, type TestPoint } from "@/lib/athleteTestValues";

/**
 * Saisie d'un résultat de test (planche Ath1SaisirTest) : les 4 formats de
 * valeur (nombre, allure, durée, échelle 1 à 5) et la comparaison au record.
 */

/** « 64,6 » ou « 64.6 » → 64.6 ; vide ou illisible → null. */
export function parseNumberFr(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** 64.6 → « 64,6 ». */
export function formatNumberFr(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "" : String(Math.round(v * 1000) / 1000).replace(".", ",");
}

/** Secondes → cases « h », « min », « s » (h vide sous une heure). */
export function splitSeconds(secs: number | null | undefined): { h: string; m: string; s: string } {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return { h: "", m: "", s: "" };
  const t = Math.round(secs);
  const h = Math.floor(t / 3600);
  return { h: h > 0 ? String(h) : "", m: String(Math.floor((t % 3600) / 60)), s: String(t % 60).padStart(2, "0") };
}

/** Cases → secondes. Toutes vides → null ; secondes ≥ 60 refusées. */
export function joinSeconds(parts: { h?: string; m: string; s: string }): number | null {
  const raw = [parts.h ?? "", parts.m, parts.s].map((x) => x.trim());
  if (raw.every((x) => x === "")) return null;
  const [h, m, s] = raw.map((x) => (x === "" ? 0 : Number(x)));
  if (![h, m, s].every((x) => Number.isInteger(x) && x >= 0) || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

export interface RecordOutcome {
  /** La valeur bat le meilleur résultat précédent (ou c'est le premier). */
  isRecord: boolean;
  /** Meilleur résultat avant cette saisie (null si aucun). */
  previousBest: TestPoint | null;
  /** Valeur − meilleur précédent (null s'il n'y en avait pas). */
  delta: number | null;
}

/**
 * Compare une nouvelle valeur aux résultats déjà enregistrés. Le résultat du
 * même jour (celui qu'on remplace) n'entre pas dans la comparaison.
 */
export function recordOutcome(value: number, history: readonly TestPoint[], betterWhen: BetterWhen, day: string): RecordOutcome {
  const others = history.filter((p) => p.date !== day);
  if (others.length === 0) return { isRecord: true, previousBest: null, delta: null };
  const best = others.reduce((b, p) => (isBetter(p.value, b.value, betterWhen) ? p : b), others[0]);
  return { isRecord: isBetter(value, best.value, betterWhen), previousBest: best, delta: value - best.value };
}

/** Le résultat a été saisi il y a moins de 24 h. */
export function isFreshResult(createdAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && now - t >= 0 && now - t < 86_400_000;
}
