import { ACCENT, ACCENT_ALT } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C } from "@/lib/theme";
import { hexToRgba } from "@/features/athlete/components/workout-detail/workoutDetailUtils";

// ── InlineRestStrip ────────────────────────────────────────────────────────────

export interface InlineRestStripProps {
  myKey: string;
  seconds: number;
  label: string;
  activeKey: string | null;
  left: number | null;
  total: number;
  onStart: () => void;
  onStop: () => void;
  canEdit: boolean;
}

export function InlineRestStrip({ myKey, seconds, label, activeKey, left, total, onStart, onStop, canEdit }: InlineRestStripProps) {
  if (!canEdit || seconds <= 0) return null;
  const isActive = activeKey === myKey && left !== null;

  function fmt(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`;
  }

  if (isActive) {
    const pct = Math.max(0, 1 - left! / total);
    const urgent = left! <= 10;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0 2px" }}>
        <span style={{ fontSize: 9, color: urgent ? ACCENT_ALT : ACCENT, flexShrink: 0 }}></span>
        <div style={{ flex: 1, height: 3, background: C.brd, borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: urgent ? ACCENT_ALT : ACCENT,
            borderRadius: 2,
            transition: "width 1s linear",
          }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: urgent ? ACCENT_ALT : ACCENT, minWidth: 28, textAlign: "right" as const }}>
          {fmt(left!)}
        </span>
        <button
          onClick={onStop}
          style={{
            padding: "2px 6px", borderRadius: 4, border: "none",
            background: hexToRgba(ACCENT_ALT, 0.15), color: ACCENT_ALT,
            fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
          }}
        >✕</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0 1px", opacity: 0.45 }}>
      <div style={{ flex: 1, height: 1, background: C.brdL }} />
      <span style={{ fontSize: 9, color: C.tx3, whiteSpace: "nowrap" as const }}>
        {fmt(seconds)} {label}
      </span>
      <button
        onClick={onStart}
        style={{
          width: 18, height: 18, borderRadius: 4, border: `1px solid ${C.brdL}`,
          background: "transparent", color: C.tx3,
          fontSize: 9, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
        }}
      >▶</button>
      <div style={{ flex: 1, height: 1, background: C.brdL }} />
    </div>
  );
}
