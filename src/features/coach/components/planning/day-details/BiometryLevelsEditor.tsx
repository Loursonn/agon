import { C } from "@/lib/theme";
import type { CalEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import type { BiometryLevel } from "@/api/tests";
import { useSetBiometryLevels } from "@/features/shared/hooks/tests/useTestFiches";
import { BIOMETRY_LEVEL_OPTIONS } from "@/features/shared/types/measurements";

/**
 * Biométrie planifiée : la classique est toujours demandée, le coach coche
 * les niveaux en plus (avancée, MyJump). Figé une fois la biométrie faite.
 */
export function BiometryLevelsEditor({ event, athleteId }: { event: CalEvent; athleteId: string }) {
  const { mutate, isPending } = useSetBiometryLevels(athleteId);
  const levels = (Array.isArray(event.raw?.biometry_levels) ? event.raw.biometry_levels : []) as BiometryLevel[];
  const locked = event.status === "completed";

  const toggle = (lvl: BiometryLevel) => {
    const next = levels.includes(lvl) ? levels.filter((l) => l !== lvl) : [...levels, lvl];
    mutate({ id: event.id, levels: next });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 12px", marginTop: -4, borderRadius: 10, background: C.s2, border: "1px solid " + C.brdL }}>
      <div style={{ fontSize: 11, color: C.tx3 }}>Classique toujours demandée (poids, taille, tours, photos). En plus :</div>
      {BIOMETRY_LEVEL_OPTIONS.map((o) => (
        <label key={o.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: C.tx, cursor: locked ? "default" : "pointer" }}>
          <input
            type="checkbox"
            checked={levels.includes(o.key)}
            disabled={locked || isPending}
            onChange={() => toggle(o.key)}
            style={{ marginTop: 2 }}
          />
          <span>
            <strong style={{ fontWeight: 600 }}>{o.label}</strong>
            <span style={{ color: C.tx3 }}> · {o.detail}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
