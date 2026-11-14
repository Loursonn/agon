import { useState } from "react";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEM_SHORT } from "@shared/domain/wellness";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { wellnessTrend, TREND_ITEMS, type TrendItem } from "@/lib/wellnessTrend";
import { ALL_BZ } from "@/lib/muscles";
import { C, alpha } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";

const LABEL: Record<TrendItem, string> = { ...WELLNESS_ITEM_SHORT, fatigue: "Récupération", doms: "Fraîcheur musc.", envie: "Envie" };
const DOW = ["D", "L", "M", "M", "J", "V", "S"];
const KICK = { ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: C.tx2 };
const fr1 = (n: number) => String(n).replace(".", ",");
const barColor = (s: number) => (s >= 70 ? C.g : s >= 50 ? C.o : C.r);

/** Carte « Tendance » du wellness sur ordinateur (planche AthOrdiAWellness) : 7 ou 28 jours. */
export function WellnessTrendCard({ athleteId }: { athleteId: string | null | undefined }) {
  const [n, setN] = useState<7 | 28>(7);
  const today = localIsoDay();
  const { data } = useWellnessHistory(athleteId, { from: addDays(today, -27), includeArchived: false });
  const t = wellnessTrend(data ?? {}, today, n);
  const zone = t.topZone ? ALL_BZ.find((z: { id: string; label: string }) => z.id === t.topZone!.id) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "14px 16px", borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={KICK}>Tendance</span>
        <span role="tablist" style={{ display: "flex", gap: 4 }}>
          {([7, 28] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={n === k} onClick={() => setN(k)}
              style={{ ...MONO, fontSize: 11, padding: "3px 9px", borderRadius: 999, cursor: "pointer", border: `1px solid ${n === k ? C.ac : C.brd}`, background: n === k ? alpha(C.ac, 0.14) : "transparent", color: n === k ? C.ac : C.tx2 }}>
              {k} j
            </button>
          ))}
        </span>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: C.tx2 }}>Score wellness</span>
          <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>moy. <span style={{ fontSize: 20, color: C.tx }}>{t.avgScore ?? "—"}</span> / 100</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: n === 7 ? 8 : 2, height: 72, marginTop: 10 }}>
          {t.scores.map((s, i) => (
            <div key={t.days[i]} title={s == null ? "Pas de saisie" : `${s} / 100`} style={{ flex: 1, height: s == null ? 3 : `${Math.max(s, 6)}%`, borderRadius: 3, background: s == null ? C.s2 : barColor(s) }} />
          ))}
        </div>
        {n === 7 && (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {t.days.map((d) => <span key={d} style={{ flex: 1, textAlign: "center", ...MONO, fontSize: 10.5, color: C.tx3 }}>{DOW[new Date(d + "T12:00:00").getDay()]}</span>)}
          </div>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: C.tx2 }}>Tes réponses</span>
          <span style={{ ...MONO, fontSize: 10.5, color: C.tx3, letterSpacing: "0.1em" }}>MOY. / 5</span>
        </div>
        {TREND_ITEMS.map((k) => {
          const v = t.itemAvgs[k];
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
              <span style={{ width: 118, fontSize: 12.5, color: C.tx2 }}>{LABEL[k]}</span>
              <span style={{ flex: 1, height: 4, borderRadius: 2, background: C.s2, overflow: "hidden" }}>
                {v != null && <span style={{ display: "block", width: `${(v / 5) * 100}%`, height: "100%", background: v >= 3.5 ? C.g : v >= 2.5 ? C.o : C.r }} />}
              </span>
              <span style={{ ...MONO, fontSize: 13, width: 28, textAlign: "right" }}>{v == null ? "—" : fr1(v)}</span>
            </div>
          );
        })}
      </div>

      {zone && t.topZone && t.topZone.days >= 2 && (
        <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.5, paddingTop: 10, borderTop: `1px solid ${C.brd}` }}>
          <span style={{ color: C.tx }}>{zone.label}</span> notés {t.topZone.days} jours sur {n}.
        </div>
      )}
    </div>
  );
}
