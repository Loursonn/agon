

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SetState { kg: string; reps: string; rir: string; done: boolean; skipped: boolean; }
export type AllSets = Record<string, SetState[]>;
export interface PadTarget { exId: string; setIdx: number; field: "kg" | "reps" | "rir"; chargeUnit: string; clusterNb?: number; isIso?: boolean; /** Saisie depuis la zone du bas : ne valide pas la série. */ noAuto?: boolean; /** Charge saisie depuis la zone du bas : « OK » ouvre ensuite les reps avec cette valeur. */ thenReps?: string; }
