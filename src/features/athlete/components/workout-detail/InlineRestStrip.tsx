import { ACCENT } from "@/features/athlete/components/workout-detail/workoutDetailConstants";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

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
  /** « série 3 · 70 kg × 6 » : affiché « Ensuite : … » dans la carte de récup. */
  next?: string | null;
  /** −15 s / +15 s sur la récup en cours. */
  onAdjust?: (deltaSec: number) => void;
}

export function InlineRestStrip({ myKey, seconds, label, activeKey, left, total, onStart, onStop, canEdit, next, onAdjust }: InlineRestStripProps) {
  if (!canEdit || seconds <= 0) return null;
  const isActive = activeKey === myKey && left !== null;

  function fmt(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${s}s`;
  }

  if (isActive) {
    // Planche SeanceEnCours (écrans 03-04) : carte « Récup » entre la série validée et la suivante
    const pct = total > 0 ? Math.max(0, Math.min(1, left! / total)) : 0;
    const tone = left! <= 10 ? ACCENT : C.b;
    const small = {
      height: 34, padding: "0 10px", borderRadius: 10, border: `1px solid ${alpha(C.b, 0.45)}`,
      background: "transparent", color: C.tx, ...MONO, fontSize: 12, cursor: "pointer", flex: "none" as const,
    };
    return (
      <div role="timer" aria-label={`Récup : ${fmt(left!)}`} style={{
        margin: "8px 0", padding: "10px 12px 12px", borderRadius: 14,
        background: alpha(C.b, 0.12), border: `1px solid ${alpha(C.b, 0.45)}`,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", padding: "3px 8px", borderRadius: 999, background: C.b, color: C.ink }}>RÉCUP</span>
          {next && (
            <span style={{ fontSize: 12, color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Ensuite : <span style={{ color: C.tx }}>{next}</span>
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 34, lineHeight: 1, color: tone, flex: 1 }}>{fmt(left!)}</span>
          {onAdjust && <button type="button" onClick={() => onAdjust(-15)} style={small}>−15 s</button>}
          {onAdjust && <button type="button" onClick={() => onAdjust(15)} style={small}>+15 s</button>}
          <button type="button" onClick={onStop} style={{ ...small, border: 0, background: C.tx, color: C.ink, fontFamily: "inherit", fontWeight: 600, fontSize: 13 }}>Passer</button>
        </div>
        <div style={{ height: 3, borderRadius: 2, background: alpha(C.b, 0.2), overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct * 100}%`, background: tone, transition: "width 1s linear" }} />
        </div>
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
