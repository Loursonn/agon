import { useState } from "react";
import { C } from "@/lib/theme";
import { MONO, DISPLAY } from "@/features/shared/components/seance/seanceUi";
import type { ReadinessScore } from "@/features/shared/hooks/useReadinessScore";
import type { WellnessData } from "@/features/shared/types/athlete";

/** Les 5 items du matin, dans l'ordre de la saisie. `inv` : plus haut = moins bien. */
const ITEMS: Array<{ key: string; label: string; inv: boolean }> = [
  { key: "sommeil", label: "Sommeil", inv: false },
  { key: "energie", label: "Énergie", inv: false },
  { key: "fatigue", label: "Fatigue", inv: true },
  { key: "stress", label: "Stress", inv: true },
  { key: "doms", label: "DOMS", inv: true },
];

/** Couleur d'un item 1-5 : vert si bon, orange moyen, rouge mauvais (sens inversé pour fatigue, stress, DOMS). */
function itemColor(v: number, inv: boolean): string {
  const good = inv ? 6 - v : v;
  return good >= 4 ? C.g : good === 3 ? C.o : C.r;
}

function Ring({ score, color }: { score: number; color: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden style={{ flex: "none" }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="rgba(231,211,168,0.12)" strokeWidth={6} />
      <circle
        cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${(circ * score) / 100} ${circ}`} transform="rotate(-90 32 32)"
      />
      <text x={32} y={37.5} textAnchor="middle" fill={C.tx} style={{ ...MONO, fontSize: 16 }}>{score}</text>
    </svg>
  );
}

/**
 * Wellness du jour, replié (maquette « Aujourd'hui » du 12/11) : anneau,
 * palier, conseil ; « Voir le détail » déplie les 5 items du matin.
 */
export function TodayWellnessCard({
  readiness,
  advice,
  wellness,
  onLog,
}: {
  readiness: ReadinessScore | null;
  advice: string | null;
  wellness: WellnessData | null;
  onLog?: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (!readiness) {
    return (
      <button
        type="button"
        onClick={onLog}
        disabled={!onLog}
        style={{
          width: "100%", minHeight: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg,
          fontFamily: "inherit", fontWeight: 600, fontSize: 15, cursor: onLog ? "pointer" : "default",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
      >
        Remplir mon wellness du matin
      </button>
    );
  }

  const { score, color, label } = readiness;
  const values = ITEMS.map((it) => {
    const v = Number((wellness as Record<string, unknown> | null)?.[it.key]);
    return { ...it, v: Number.isFinite(v) && v > 0 ? v : null };
  });
  const doms = values.find((x) => x.key === "doms")?.v ?? null;

  return (
    <div style={{ borderRadius: 14, border: `1px solid ${color}66`, background: `${color}1A`, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px" }}>
        <Ring score={score} color={color} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ ...DISPLAY, fontWeight: 500, fontSize: 14, color }}>{label}</span>
            <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{score} / 100</span>
          </div>
          {advice && <div style={{ fontSize: 13, color: C.tx2 }}>{advice}</div>}
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none",
          borderTop: `1px solid ${color}33`, padding: "10px 14px", color: C.ac, fontSize: 13, fontFamily: "inherit", cursor: "pointer",
        }}
      >
        {open ? "Masquer le détail" : "Voir le détail"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
          <path d={open ? "M6 15L12 9L18 15" : "M6 9L12 15L18 9"} />
        </svg>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", gap: 4 }} aria-hidden>
          {values.map((x) => (
            <span key={x.key} style={{ width: 6, height: 6, borderRadius: "50%", background: x.v == null ? C.brdL : itemColor(x.v, x.inv) }} />
          ))}
        </span>
        <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>DOMS {doms ?? "—"}/5</span>
      </button>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, padding: "4px 14px 14px" }}>
          {values.map((x) => (
            <div key={x.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 2px", borderRadius: 10, background: C.s1, border: `1px solid ${C.brd}` }}>
              <span style={{ ...MONO, fontSize: 16, color: x.v == null ? C.tx3 : itemColor(x.v, x.inv) }}>{x.v ?? "—"}</span>
              <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx3 }}>{x.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
