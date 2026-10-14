import { C } from "@/lib/theme";

// ── RIR ──────────────────────────────────────────────────────────────────────

export const RIR_OPTS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5];
export const rL = (v: number) => (v >= 5.5 ? "5+" : String(v));
export const rC = (r: number | string) => {
  const n = typeof r === "number" ? r : parseFloat(r as string) || 0;
  return n <= 0 ? C.r : n <= 1 ? C.o : n <= 2.5 ? C.ac : C.g;
};

// ── Calc helpers ─────────────────────────────────────────────────────────────

export const parseReps = (r: unknown): number => {
  const m = String(r || "").match(/(\d+)/);
  return m ? +m[1] : 0;
};

/**
 * Parse repsRange en tableau de reps par série.
 * "8-10" → [9,9,...] (mid-point, pour estimation 1RM)
 * "8"    → [8,8,...]
 * "3,2,1" → [3,2,1] (séparateur , = série distincte)
 * AMRAP  → [99,...]
 */
export const parseRepsArr = (repsRange: unknown, sets: number): number[] => {
  const s = String(repsRange || "").trim();
  if (!s || s.toUpperCase() === "AMRAP") return Array.from({ length: sets }, () => s.toUpperCase() === "AMRAP" ? 99 : 0);
  if (s.includes(",")) {
    const parts = s.split(",").map((p) => parseReps(p.trim()));
    return Array.from({ length: sets }, (_, i) => parts[i] ?? parts[parts.length - 1] ?? 0);
  }
  return Array.from({ length: sets }, () => parseReps(s));
};

export const e1rm = (kg: number, reps: number) =>
  reps === 1 ? kg : Math.round(kg * (1 + reps / 30));

export const roundHalf = (v: number) => Math.round(v * 2) / 2;

// ── Exercise name normalization ───────────────────────────────────────────────

export const normalizeExName = (n: string) => {
  let s = (n || "").trim();
  s = s.replace(/\s*\([^)]*\)\s*/g, "").trim();
  s = s.replace(/\s+(tempo|pause|isométrique|isometrique|iso|lent|explosif|excentrique|concentrique)\s*$/i, "").trim();
  return s;
};

export const normForMatch = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export const fuzzyExMatch = (a: string, b: string): boolean => {
  const na = normForMatch(a), nb = normForMatch(b);
  if (na === nb) return true;
  const wa = na.split(" ").filter(Boolean), wb = nb.split(" ").filter(Boolean);
  const [sh, lg] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return sh.length > 0 && sh.every((sw) => lg.some((lw) => lw.startsWith(sw) || sw.startsWith(lw)));
};

// ── Methods ───────────────────────────────────────────────────────────────────

export const DEF_METHODS = {
  myoreps:     { label: "Myoreps",   c: "#FFC933", e: "MR" },
  dropset:     { label: "Dropset",   c: "#F5A623", e: "DS" },
  restpause:   { label: "Restpause", c: "#FF5A33", e: "RP" },
  cluster:     { label: "Cluster",   c: "#F060C0", e: "CL" },
  amrap:       { label: "AMRAP",     c: "#33B5FF", e: "AM" },
  isometrique: { label: "IsoMax",    c: "#9194A0", e: "ISO" },
} as const;

export const BLOC_METHODS = [
  { v: "",             l: "Standard" },
  { v: "emom",         l: "EMOM"    },
  { v: "amrap",        l: "AMRAP"   },
  { v: "circuit",      l: "Circuit" },
  { v: "tabata",       l: "Tabata"  },
  { v: "cluster_bloc", l: "Cluster" },
];

export const EVENT_TYPES = [
  { v: "competition", l: "Compétition", e: "CP", c: "#F5A623" },
  { v: "match",       l: "Match",        e: "MT", c: "#FF5A33" },
  { v: "stage",       l: "Stage",        e: "ST", c: "#FFC933" },
  { v: "off",         l: "Récup/Off",    e: "OF", c: "#66F03C" },
  { v: "autre",       l: "Autre",        e: "AU", c: "#9194A0" },
];

export const MDEF = {
  dropset:     { drops: 3,    pct: 20 },
  myoreps:     { activation: 12, minisets: 4, reps_mini: 5, pause: 5 },
  restpause:   { rounds: 3,   pause: 15 },
  cluster:     { clusters: 3, reps: [2, 2, 2], pause: 10 },
  amrap:       { type: "failure", duration: 30 },
  isometrique: { hold_sec: 30, positions: 2 },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const clusterReps = (p: any) =>
  p.reps || Array.from({ length: p.clusters || 3 }, () => p.reps_per_cluster || 2);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fmtMR = (method: string, mp: any, sets: number, repsRange: string) => {
  if (!method || method === "excentrique" || method === "superset") return `${sets}x${repsRange || "?"}`;
  if (method === "cluster")   return `${sets}×(${clusterReps(mp || {}).join("+")})`;
  if (method === "dropset")   return `${sets}x${repsRange || "?"} DS×${mp?.drops || 2} -${mp?.pct || 20}%`;
  if (method === "myoreps")   return `${sets} | ${mp?.activation || 12}+${mp?.minisets || 4}×${mp?.reps_mini || 5}`;
  if (method === "restpause") return `${sets}x${repsRange || "?"} RP×${mp?.rounds || 3}`;
  if (method === "amrap")     return `${sets} AMRAP`;
  if (method === "isometrique") return `${sets}×${mp?.positions || 2}×${mp?.hold_sec || 30}s`;
  return `${sets}x${repsRange || "?"}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const generateRows = (planned: any, method: string, mp: any) => {
  const sets = planned?.sets || 3;
  const globalKg = planned?.kg || 0;
  const setKgs: number[] | undefined = planned?.setKgs;  // charges par série (priorité sur kg global)
  const kgForSet = (i: number) => setKgs?.[i] ?? globalKg;
  const repsArr = parseRepsArr(planned?.repsRange, sets);
  const reps = repsArr[0] || 0;
  const rir = planned?.rir;
  const p = mp || MDEF[method as keyof typeof MDEF] || {};

  // ── Méthode bibliothèque scope='set' — sous-séries ────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const att: any = planned?.method_attachment;
  if (att?.scope === "set" && att?.config?.sub_sets) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfg: any = att.config;
    const ss = cfg.sub_sets;
    const subCount: number =
      ss.count?.type === "fixed" ? (ss.count.value ?? 3) :
      ss.count?.type === "range" ? (ss.count.min ?? 2) : 3;
    const restSec: number = ss.rest_intra?.type === "fixed" ? (ss.rest_intra.seconds ?? 0) : 0;
    const rows: object[] = [];
    for (let s = 0; s < sets; s++) {
      const baseKg = kgForSet(s);
      for (let sub = 0; sub < subCount; sub++) {
        // reps par sous-série
        let subReps = 0;
        const rc = ss.reps;
        if (rc?.type === "fixed") subReps = rc.value ?? 5;
        else if (rc?.type === "custom" && rc.pattern?.length)
          subReps = rc.pattern[sub] ?? rc.pattern[rc.pattern.length - 1] ?? 5;
        else if (rc?.type === "amrap") subReps = 0;
        else if (rc?.type === "decreasing" && rc.value) subReps = Math.max(1, rc.value - sub);
        else if (rc?.type === "increasing" && rc.value) subReps = rc.value + sub;
        else subReps = (repsArr[s] ?? reps) || 5;
        // charge par sous-série
        let subKg = baseKg;
        const lc = cfg.load;
        if (lc?.type === "custom" && lc.values?.length) {
          const v = lc.values[sub] ?? lc.values[lc.values.length - 1] ?? 0;
          subKg = lc.values_unit === "pct" ? Math.round(baseKg * v / 100 * 2) / 2 : v;
        } else if (lc?.type === "decreasing_pct" && lc.pct_change) {
          subKg = Math.round(baseKg * Math.pow(1 - lc.pct_change / 100, sub) * 2) / 2;
        } else if (lc?.type === "increasing_pct" && lc.pct_change) {
          subKg = Math.round(baseKg * Math.pow(1 + lc.pct_change / 100, sub) * 2) / 2;
        }
        rows.push({
          type: "sub_set", setIdx: s + 1, subIdx: sub + 1, totalSubs: subCount,
          kg: subKg, reps: subReps, isAmrap: rc?.type === "amrap",
          done: false, pauseSec: sub < subCount - 1 ? restSec : 0,
          isLastInSet: sub === subCount - 1,
        });
      }
    }
    return rows;
  }

  if (!method) return Array.from({ length: sets }, (_, i) => ({ type: "set", kg: kgForSet(i), reps: repsArr[i] ?? reps, rir, done: false }));
  if (method === "dropset") {
    const rows: object[] = [];
    for (let s = 0; s < sets; s++) {
      const kg = kgForSet(s);
      rows.push({ type: "set", setIdx: s+1, kg, reps: repsArr[s] ?? reps, rir, done: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (let d = 0; d < ((p as any).drops || 2); d++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dkg = (p as any).dropWeights?.[d] ?? Math.round(kg * Math.pow(1 - ((p as any).pct || 20) / 100, d+1) / 2.5) * 2.5;
        rows.push({ type: "drop", setIdx: s+1, dropIdx: d+1, kg: dkg, reps: repsArr[s] ?? reps, done: false });
      }
    }
    return rows;
  }
  if (method === "myoreps") {
    const kg = kgForSet(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: object[] = [{ type: "activation", kg, reps: (p as any).activation || 12, rir, done: false }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (let m = 0; m < ((p as any).minisets || 4); m++)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.push({ type: "mini", idx: m+1, kg, reps: (p as any).reps_mini || 5, done: false, pauseSec: (p as any).pause || 5 });
    return rows;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (method === "restpause") return Array.from({ length: (p as any).rounds || 3 }, (_, i) => ({ type: "round", idx: i+1, kg: kgForSet(i), reps: repsArr[i] ?? reps, rir, done: false, pauseSec: (p as any).pause || 15 }));
  if (method === "cluster") {
    const rows: object[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nCl = (p as any).clusters || 3, ps = (p as any).pause || 10, ra = clusterReps(p);
    for (let s = 0; s < sets; s++)
      for (let c = 0; c < nCl; c++)
        rows.push({ type: "cluster", setIdx: s+1, clusterIdx: c+1, totalClusters: nCl, kg: kgForSet(s), reps: ra[c] || 2, rir, done: false, pauseSec: ps, isLast: c === nCl-1 });
    return rows;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (method === "amrap") return [{ type: "amrap", kg: kgForSet(0), reps: 0, done: false, timed: (p as any).type === "timed", duration: (p as any).duration || 30 }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (method === "isometrique") return Array.from({ length: (p as any).positions || 2 }, (_, i) => ({ type: "iso", idx: i+1, holdSec: (p as any).hold_sec || 30, done: false }));
  return Array.from({ length: sets }, (_, i) => ({ type: "set", kg: kgForSet(i), reps: repsArr[i] ?? reps, rir, done: false }));
};

// ── Exercise tier lookup (used for PR grouping in stats) ─────────────────────

export const EX_TIER: Record<string, number> = {
  "Dev. couche barre":1,"Back squat":1,"Traction lestee":1,
  "Dips lestes":2,"Dev. incline halt.":2,"Hack squat":2,"Belt squat":2,
  "Bulgarian split sq.":2,"DB press assis":2,"Chest-supp. row":2,
  "Rowing cable assis":2,"Elev. lat. cable":3,"Elev. lat. halt.":3,
  "Leg extension":3,"Leg curl machine":3,"Cable crossover":3,
  "Dev. machine incl.":3,"Pallof press":3,
};

export const DEF_TIER_CONFIG: Record<number, { sets: number; repsMin: number; repsMax: number; rir: number }> = {
  1: { sets: 4, repsMin: 4, repsMax: 6,  rir: 1 },
  2: { sets: 3, repsMin: 6, repsMax: 10, rir: 2 },
  3: { sets: 3, repsMin: 10, repsMax: 15, rir: 2 },
};

export const BLOC_TO_TIER: Record<string, number> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getExTier(name: string, ex?: any): number {
  if (ex?.tier) return Number(ex.tier);
  return EX_TIER[name] ?? 3;
}

export const DEF_BLOCK_CONFIG = {
  totalWeeks: 6, deloadWeek: 6, progressionPct: 2.5,
  progressionType: "linear", deloadPct: 40,
  startDate: null as string | null,
};

export const DEF_SESSIONS: never[] = [];
