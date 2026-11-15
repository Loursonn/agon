/**
 * « Noter ma séance » d'énergie (après la séance, côté athlète) : les blocs
 * d'effort à cocher, nommés par leur contenu, et la durée réelle.
 *
 * Les clés des blocs sont celles de `block_logs` en base : id du pas d'effort,
 * suffixé `__r<n>` quand il est répété dans un groupe (même règle que
 * `getWorkIntervals`). Ne pas les changer : l'historique et la vue coach en dépendent.
 */
import type { EnergyStep } from "@/types/energy";
import { stepPhrase, stepTint, type Refs, type Tint } from "./energyRun";

export interface LogBlock {
  /** Clé dans `block_logs`. */
  id: string;
  /** Le bloc lu par son contenu : « 20 min à Z1 », « 400 m à 3:42/km ». */
  phrase: string;
  /** « 2 / 4 » pour une répétition, null sinon. */
  rep: string | null;
  tint: Tint;
}

/** Blocs d'effort de la séance, répétitions dépliées, dans l'ordre. */
export function logBlocks(steps: readonly EnergyStep[], refs?: Refs): LogBlock[] {
  const out: LogBlock[] = [];
  const walk = (list: readonly EnergyStep[], repeat: number) => {
    for (const s of list) {
      if (s.type === "interval" && s.role === "work") {
        const phrase = stepPhrase(s, refs);
        const tint = stepTint(s, refs);
        for (let r = 0; r < repeat; r++) {
          out.push({ id: repeat > 1 ? `${s.id}__r${r}` : s.id, phrase, rep: repeat > 1 ? `${r + 1} / ${repeat}` : null, tint });
        }
      } else if (s.type === "group") {
        walk(s.children, s.repeat * repeat);
      }
    }
  };
  walk(steps, 1);
  return out;
}

/** Durée réelle saisie (« 45 ») ± `delta` minutes, bornée à 1–600. Vide → part de `fallback`. */
export function stepMinutes(raw: string, delta: number, fallback = 0): string {
  const n = parseInt(raw, 10);
  const base = Number.isFinite(n) ? n : fallback;
  return String(Math.min(600, Math.max(1, base + delta)));
}
