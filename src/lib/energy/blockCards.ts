/**
 * Cartes bloc de l'éditeur de séance d'énergie (planche CoachOrdiAEditeurEnergie).
 *
 * Une carte = un pas de premier niveau de `intervals` (même format en base
 * qu'avant : EnergyInterval / EnergyGroup). Seule la façon de l'éditer change :
 *  - « simple » : un intervalle seul (échauffement, récup, retour au calme…) ;
 *  - « intervals » : un groupe répété d'UN intervalle d'effort, récup entre
 *    facultative (Répétitions / Effort / Cible / Récup entre) ;
 *  - « advanced » : tout le reste (groupes imbriqués, plusieurs pas, départ
 *    fixe, exercices) : gardé tel quel, modifié dans l'éditeur détaillé.
 *
 * Toutes les fonctions sont pures et ne touchent qu'aux champs qu'elles
 * modifient (ids, notes, consignes, matériel conservés).
 */
import type {
  EnergyDuration, EnergyGroup, EnergyInterval, EnergyStep, EnergyTarget, IntervalRole,
} from "@/types/energy";
import { formatTarget } from "./formatTarget";
import { genId } from "./treeUtils";

export type BlockCardKind = "simple" | "intervals" | "advanced";

export function blockCardKind(step: EnergyStep): BlockCardKind {
  if (step.type === "interval") return "simple";
  if (step.type === "group") {
    const [only, ...more] = step.children;
    if (only && more.length === 0 && only.type === "interval" && step.departure_every_s == null) return "intervals";
  }
  return "advanced";
}

export type NewBlock = "warmup" | "intervals" | "recovery" | "cooldown";

export const NEW_BLOCK_LABEL: Record<NewBlock, string> = {
  warmup: "Échauffement",
  intervals: "Intervalles",
  recovery: "Récup",
  cooldown: "Retour au calme",
};

const interval = (role: IntervalRole, duration: EnergyDuration, target: EnergyTarget): EnergyInterval => ({
  type: "interval", id: genId(), role, duration, target,
});

/** Nouveau bloc, au format habituel de la base. */
export function newBlock(kind: NewBlock): EnergyStep {
  switch (kind) {
    case "warmup": return interval("warmup", { kind: "time", value: 15 * 60 }, { kind: "hr_zone", zone: 1 });
    case "recovery": return interval("recovery", { kind: "time", value: 3 * 60 }, { kind: "hr_zone", zone: 1 });
    case "cooldown": return interval("cooldown", { kind: "time", value: 10 * 60 }, { kind: "hr_zone", zone: 1 });
    case "intervals": return {
      type: "group",
      id: genId(),
      role: "work",
      repeat: 6,
      children: [interval("work", { kind: "time", value: 3 * 60 }, { kind: "hr_zone", zone: 3 })],
      rest_between: interval("recovery", { kind: "time", value: 2 * 60 }, { kind: "hr_zone", zone: 1 }),
    };
  }
}

// ── Lecture ─────────────────────────────────────────────────────────────────

const ROLE_TITLE: Record<IntervalRole, string> = {
  warmup: "Échauffement",
  work: "Effort",
  recovery: "Récup",
  rest: "Repos",
  cooldown: "Retour au calme",
  open: "Libre",
};

export function blockTitle(step: EnergyStep): string {
  if (step.type === "exercise") return step.exercise_name || "Exercice";
  if (step.type === "group") return blockCardKind(step) === "intervals" ? "Intervalles" : "Groupe répété";
  return ROLE_TITLE[step.role] ?? "Bloc";
}

/** « 8 min », « 1 min 30 s », « 200 m », « 1,5 km », « 20 kcal », « au tour ». */
export function formatDuration(d: EnergyDuration | undefined): string {
  if (!d) return "—";
  const v = d.value ?? 0;
  switch (d.kind) {
    case "time": {
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      if (!m) return `${s} s`;
      return s ? `${m} min ${String(s).padStart(2, "0")} s` : `${m} min`;
    }
    case "distance":
      return v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km` : `${v} m`;
    case "calories": return `${v} kcal`;
    case "lap_button": return "au tour";
  }
}

function targetPhrase(t: EnergyTarget): string {
  const s = formatTarget(t);
  if (!s || t.kind === "none") return "";
  if (t.kind === "hr_zone") return `zone ${t.zone}`;
  if (t.kind === "pace") return `à ${s.replace("/km", " /km")}`;
  if (t.kind === "hr_bpm") return `FC ${s}`;
  return s;
}

/** Ligne de résumé de la carte : « 3 × 8 min à 4'15–4'25 /km · récup 2 min ». */
export function blockSummary(step: EnergyStep): string {
  if (step.type === "exercise") return step.exercise_name;
  if (step.type === "interval") {
    return [formatDuration(step.duration), targetPhrase(step.target)].filter(Boolean).join(" · ");
  }
  if (blockCardKind(step) === "intervals") {
    const work = step.children[0] as EnergyInterval;
    const head = [`${step.repeat} × ${formatDuration(work.duration)}`, targetPhrase(work.target)].filter(Boolean).join(" ");
    const rest = step.rest_between ? `récup ${formatDuration(step.rest_between.duration)}` : null;
    return [head, rest].filter(Boolean).join(" · ");
  }
  const n = countSteps(step);
  return `${step.repeat} × ${n} pas${step.departure_every_s ? ` · départ toutes les ${formatDuration({ kind: "time", value: step.departure_every_s })}` : ""}`;
}

function countSteps(g: EnergyGroup): number {
  return g.children.reduce((n, c) => n + (c.type === "group" ? countSteps(c) : 1), 0);
}

/** Zone affichée sur la carte (Z1…Z5) quand la cible principale est une zone. */
export function blockZone(step: EnergyStep): number | null {
  const main = step.type === "group" ? (blockCardKind(step) === "intervals" ? step.children[0] : null) : step;
  if (!main || main.type !== "interval" || main.target.kind !== "hr_zone") return null;
  return main.target.zone;
}

// ── Écriture ────────────────────────────────────────────────────────────────

/** Intervalle d'effort du bloc (le bloc lui-même s'il est simple). */
export function mainInterval(step: EnergyStep): EnergyInterval | null {
  if (step.type === "interval") return step;
  if (step.type === "group" && blockCardKind(step) === "intervals") return step.children[0] as EnergyInterval;
  return null;
}

/** Remplace l'intervalle d'effort (bloc simple ou intervalles), le reste intact. */
export function patchMain(step: EnergyStep, patch: Partial<Pick<EnergyInterval, "duration" | "target">>): EnergyStep {
  if (step.type === "interval") return { ...step, ...patch };
  if (step.type === "group" && blockCardKind(step) === "intervals") {
    const work = step.children[0] as EnergyInterval;
    return { ...step, children: [{ ...work, ...patch }] };
  }
  return step;
}

export function setRepeat(step: EnergyStep, repeat: number): EnergyStep {
  if (step.type !== "group") return step;
  return { ...step, repeat: Math.max(1, Math.min(99, Math.round(repeat) || 1)) };
}

/** Récup entre les répétitions : null la retire. */
export function setRest(step: EnergyStep, patch: Partial<Pick<EnergyInterval, "duration" | "target" | "notes">> | null): EnergyStep {
  if (step.type !== "group") return step;
  if (patch === null) {
    const { rest_between: _omit, ...rest } = step;
    return rest;
  }
  const cur = step.rest_between ?? interval("recovery", { kind: "time", value: 60 }, { kind: "hr_zone", zone: 1 });
  return { ...step, rest_between: { ...cur, ...patch } };
}

// ── Cibles proposées par la carte ───────────────────────────────────────────

export type CardTarget = "pace" | "hr" | "zone" | "watts";

export const CARD_TARGET_LABEL: Record<CardTarget, string> = { pace: "Allure", hr: "FC", zone: "Zone", watts: "Watts" };

export function cardTargetOf(t: EnergyTarget): CardTarget | null {
  switch (t.kind) {
    case "pace": return "pace";
    case "hr_bpm": return "hr";
    case "hr_zone": return "zone";
    case "power": return "watts";
    default: return null;
  }
}

/** Cible par défaut quand on change de type dans la carte. */
export function defaultTarget(kind: CardTarget, role: IntervalRole): EnergyTarget {
  const easy = role === "warmup" || role === "cooldown" || role === "recovery" || role === "rest";
  switch (kind) {
    case "pace": return easy
      ? { kind: "pace", min_s_per_unit: 360, max_s_per_unit: 390, unit: "min_per_km" }
      : { kind: "pace", min_s_per_unit: 255, max_s_per_unit: 265, unit: "min_per_km" };
    case "hr": return easy ? { kind: "hr_bpm", min: 120, max: 145 } : { kind: "hr_bpm", min: 165, max: 175 };
    case "zone": return { kind: "hr_zone", zone: easy ? 1 : 3 };
    case "watts": return easy ? { kind: "power", min: 120, max: 160 } : { kind: "power", min: 250, max: 280 };
  }
}

/** « 4'15 » → 255 ; « 4:15 », « 4 » acceptés. Null si illisible. */
export function parsePace(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})(?:\s*['’:]\s*(\d{1,2}))?$/);
  if (!m) return null;
  const sec = m[2] ? Number(m[2]) : 0;
  if (sec >= 60) return null;
  return Number(m[1]) * 60 + sec;
}

export function fmtPace(sPerKm: number): string {
  const r = Math.round(sPerKm);
  return `${Math.floor(r / 60)}'${String(r % 60).padStart(2, "0")}`;
}

/** « 8 min 00 s », « 8:00 », « 8 » (minutes), « 90 s » → secondes. */
export function parseClock(s: string): number | null {
  const t = s.trim().toLowerCase();
  let m = t.match(/^(\d+)\s*(?:min|')\s*(?:(\d{1,2})\s*(?:s|")?)?$/);
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d+)\s*s$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+)$/);
  if (m) return Number(m[1]) * 60;
  return null;
}

/** « 200 m », « 1,5 km », « 400 » (mètres) → mètres. */
export function parseDistance(s: string): number | null {
  const t = s.trim().toLowerCase().replace(",", ".");
  let m = t.match(/^(\d+(?:\.\d+)?)\s*km$/);
  if (m) return Math.round(Number(m[1]) * 1000);
  m = t.match(/^(\d+(?:\.\d+)?)\s*m?$/);
  if (m) return Math.round(Number(m[1]));
  return null;
}
