import type { CSSProperties, ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import type { IsoDay } from "@shared/domain/dates";

/** Titre numéroté des sections de l'onglet Santé (« 03 — Wellness déclaré »). */
export function SanteKicker({ n, children, style }: { n: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: "var(--agon-font-data)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, ...style }}>
      <span style={{ color: C.ac }}>{String(n).padStart(2, "0")} —</span> {children}
    </div>
  );
}

const weekday = (d: IsoDay) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short" });

/** Barres d'un score 0-100 par jour, valeur au-dessus et jour en dessous ; jour sans valeur = « — ». */
export function DayBars({ pts, color = C.b, h = 44, max = 100 }: { pts: Array<{ day: IsoDay; v: number | null }>; color?: string; h?: number; max?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${pts.length}, minmax(0, 1fr))`, gap: 6, alignItems: "end" }}>
      {pts.map((p, i) => {
        const last = i === pts.length - 1;
        return (
          <div key={p.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0 }}>
            <span style={{ ...MONO, fontSize: 10.5, color: last ? C.tx : C.tx3 }}>{p.v == null ? "—" : Math.round(p.v)}</span>
            <div style={{ height: h, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{ width: "100%", height: p.v == null ? 2 : Math.max(2, (Math.min(p.v, max) / max) * h), borderRadius: 3, background: p.v == null ? C.brd : color, opacity: last ? 1 : 0.55 }} />
            </div>
            <span style={{ fontSize: 10.5, color: C.tx3 }}>{weekday(p.day)}</span>
          </div>
        );
      })}
    </div>
  );
}
