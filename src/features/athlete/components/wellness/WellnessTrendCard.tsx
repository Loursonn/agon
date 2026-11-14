import { useState } from "react";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { WELLNESS_ITEM_SHORT } from "@shared/domain/wellness";
import { useWellnessHistory } from "@/features/shared/hooks/useWellness";
import { wellnessTrend, TREND_ITEMS, type TrendItem } from "@/lib/wellnessTrend";
import { ALL_BZ } from "@/lib/muscles";
import { cn } from "@/lib/utils";

const LABEL: Record<TrendItem, string> = { ...WELLNESS_ITEM_SHORT, fatigue: "Récupération", doms: "Fraîcheur musc.", envie: "Envie" };
const DOW = ["D", "L", "M", "M", "J", "V", "S"];
const fr1 = (n: number) => String(n).replace(".", ",");
const barClass = (s: number) => (s >= 70 ? "bg-agon-succes" : s >= 50 ? "bg-agon-alerte" : "bg-agon-erreur");
const itemClass = (v: number) => (v >= 3.5 ? "bg-agon-succes" : v >= 2.5 ? "bg-agon-alerte" : "bg-agon-erreur");

/** Carte « Tendance » du wellness sur ordinateur (planche AthOrdiAWellness) : 7 ou 28 jours. */
export function WellnessTrendCard({ athleteId }: { athleteId: string | null | undefined }) {
  const [n, setN] = useState<7 | 28>(7);
  const today = localIsoDay();
  const { data } = useWellnessHistory(athleteId, { from: addDays(today, -27), includeArchived: false });
  const t = wellnessTrend(data ?? {}, today, n);
  const zone = t.topZone ? ALL_BZ.find((z: { id: string; label: string }) => z.id === t.topZone!.id) : null;

  return (
    <div className="flex flex-col gap-3.5 rounded-[14px] border border-agon-brd bg-agon-s1 px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx2">Tendance</span>
        <span role="tablist" className="flex gap-1">
          {([7, 28] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={n === k} onClick={() => setN(k)}
              className={cn("agon-mono cursor-pointer rounded-full border px-[9px] py-[3px] text-[11px]", n === k ? "border-agon-accent bg-agon-accent/[0.14] text-agon-accent" : "border-agon-brd bg-transparent text-agon-tx2")}>
              {k} j
            </button>
          ))}
        </span>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-agon-tx2">Score wellness</span>
          <span className="agon-mono text-[12px] text-agon-tx3">moy. <span className="text-[20px] text-agon-tx">{t.avgScore ?? "—"}</span> / 100</span>
        </div>
        <div className={cn("mt-2.5 flex h-[72px] items-end", n === 7 ? "gap-2" : "gap-0.5")}>
          {t.scores.map((s, i) => (
            <div key={t.days[i]} title={s == null ? "Pas de saisie" : `${s} / 100`} className={cn("flex-1 rounded-[3px]", s == null ? "h-[3px] bg-agon-s2" : barClass(s))} style={s == null ? undefined : { height: `${Math.max(s, 6)}%` }} />
          ))}
        </div>
        {n === 7 && (
          <div className="mt-1.5 flex gap-2">
            {t.days.map((d) => <span key={d} className="agon-mono flex-1 text-center text-[10.5px] text-agon-tx3">{DOW[new Date(d + "T12:00:00").getDay()]}</span>)}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex justify-between">
          <span className="text-[13px] text-agon-tx2">Tes réponses</span>
          <span className="agon-mono text-[10.5px] tracking-[0.1em] text-agon-tx3">MOY. / 5</span>
        </div>
        {TREND_ITEMS.map((k) => {
          const v = t.itemAvgs[k];
          return (
            <div key={k} className="flex items-center gap-2.5 py-[5px]">
              <span className="w-[118px] text-[12.5px] text-agon-tx2">{LABEL[k]}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-[2px] bg-agon-s2">
                {v != null && <span className={cn("block h-full", itemClass(v))} style={{ width: `${(v / 5) * 100}%` }} />}
              </span>
              <span className="agon-mono w-7 text-right text-[13px]">{v == null ? "—" : fr1(v)}</span>
            </div>
          );
        })}
      </div>

      {zone && t.topZone && t.topZone.days >= 2 && (
        <div className="border-t border-agon-brd pt-2.5 text-[12.5px] leading-normal text-agon-tx2">
          <span className="text-agon-tx">{zone.label}</span> notés {t.topZone.days} jours sur {n}.
        </div>
      )}
    </div>
  );
}
