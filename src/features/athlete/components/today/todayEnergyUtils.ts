import type { BlockLogs, EnergyInterval, EnergyStep } from "@/types/energy";
import { C } from "@/lib/theme";
import type { RunDistanceValue } from "@/features/shared/components/runDistance";

// ── Energy preview overlay ────────────────────────────────────────────────────

export function getWorkIntervals(steps: EnergyStep[], parentRepeat = 1): EnergyInterval[] {
  const out: EnergyInterval[] = [];
  for (const step of steps) {
    if (step.type === "interval" && step.role === "work") {
      for (let r = 0; r < parentRepeat; r++)
        out.push({ ...step, id: parentRepeat > 1 ? `${step.id}__r${r}` : step.id });
    } else if (step.type === "group") {
      out.push(...getWorkIntervals(step.children, step.repeat * parentRepeat));
    }
  }
  return out;
}

export function fmtIv(iv: EnergyInterval): string {
  const d = iv.duration;
  if (d.kind === "distance" && d.value != null)
    return d.value >= 1000 ? `${(d.value / 1000).toFixed(1)} km` : `${d.value} m`;
  if (d.kind === "time" && d.value != null) {
    const m = Math.floor(d.value / 60), s = d.value % 60;
    return s > 0 ? `${m}min ${s}s` : `${m} min`;
  }
  return iv.notes || "Bloc effort";
}
export function rpeColor(v: number) { return v <= 4 ? C.g : v <= 7 ? C.o : C.r; }
export function rpeBg(v: number)    { return v <= 4 ? C.gS : v <= 7 ? C.oS : C.rS; }
export interface EnergyDraft {
  phase: "preview" | "log" | "rpe";
  localBlocks: BlockLogs;
  globalNote: string;
  actualDuration: string;
  runDist: RunDistanceValue;
}
