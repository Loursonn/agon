

// ── Per-step state ────────────────────────────────────────────────────────────

export type StepStatus = "done" | "partial";
export interface StepState { status: StepStatus; comment: string; }
