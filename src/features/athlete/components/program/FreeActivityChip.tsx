import type { FreeSession } from "@/features/shared/types/athlete";
import { ProgramSessionCard } from "@/features/athlete/components/program/ProgramSessionCard";
import { SPORTS } from "@/features/athlete/components/freeActivitySports";
import { TYPE_COLOR, TYPE_LABEL } from "@/lib/peps";
import { haptic } from "@/features/athlete/components/program/programUtils";

export function FreeActivityChip({ activity, onPress }: { activity: FreeSession; onPress: (f: FreeSession) => void }) {
  const sportMeta = SPORTS.find(s => s.key === activity.sport);
  const detail = [
    activity.duration ? `${activity.duration} min` : null,
    activity.distance_km ? `${String(activity.distance_km).replace(".", ",")} km` : null,
  ].filter(Boolean).join(" · ");
  return (
    <ProgramSessionCard
      color={TYPE_COLOR.libre}
      typeLabel={sportMeta?.label ?? activity.sport ?? TYPE_LABEL.libre}
      title={activity.name}
      done
      status={detail || undefined}
      onPress={() => { haptic(); onPress(activity); }}
    />
  );
}
