import { ProgramSessionCard } from "@/features/athlete/components/program/ProgramSessionCard";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/peps";
import type { TestBrief } from "@/features/shared/hooks/useActivePlan";
import { haptic } from "@/features/athlete/components/program/programUtils";

// ── Test chip ─────────────────────────────────────────────────────────────────

export function TestChip({ test, onPress }: { test: TestBrief; onPress: (id: string) => void }) {
  return (
    <ProgramSessionCard
      color={TYPE_COLOR.test}
      typeLabel={test.type === "biometric" ? "Biométrie" : TYPE_LABEL.test}
      title={test.title}
      done={test.completed}
      onPress={() => { haptic(); onPress(test.id); }}
    />
  );
}
