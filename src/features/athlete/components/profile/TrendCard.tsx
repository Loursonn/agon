import { LineChart, Line, YAxis, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type { TrendPoint } from "@/lib/athleteTrends";

interface Props {
  label: string;
  value: string;
  unit?: string;
  /** Écart vs période précédente (affiché avec flèche) */
  delta?: number | null;
  deltaUnit?: string;
  /** true = hausse positive, false = baisse positive, null = neutre */
  goodWhenUp?: boolean | null;
  sub?: string;
  series?: TrendPoint[];
  color: string;
  /** 0–100 : barre de progression à la place de la courbe */
  progress?: number | null;
  onClick?: () => void;
}

export function TrendCard({ label, value, unit, delta, deltaUnit = "", goodWhenUp = true, sub, series, color, progress, onClick }: Props) {
  const hasDelta = delta !== null && delta !== undefined && delta !== 0;
  const good = !hasDelta || goodWhenUp === null ? null : (delta! > 0) === goodWhenUp;
  const deltaClass = good === null ? "text-agon-tx3" : good ? "text-agon-succes" : "text-agon-erreur";
  const points = (series ?? []).filter(p => p.value !== null).length;
  const empty = value === "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-[6px] border border-agon-brd bg-agon-s1 px-3 pb-2.5 pt-3 text-left",
        onClick ? "cursor-pointer" : "cursor-default",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-agon-tx3">{label}</div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span
          className={cn("text-[22px] font-extrabold leading-[1.1] tracking-[-0.5px]", empty && "text-agon-tx3")}
          style={empty ? undefined : { color }}
        >
          {value}
        </span>
        {unit && !empty && <span className="text-[10px] text-agon-tx3">{unit}</span>}
        {hasDelta && (
          <span className={cn("text-[10px] font-bold", deltaClass)}>
            {delta! > 0 ? "▲" : "▼"} {Math.abs(delta!)}{deltaUnit}
          </span>
        )}
      </div>
      {sub && <div className="truncate text-[10px] text-agon-tx3">{sub}</div>}
      {progress !== undefined && progress !== null ? (
        <div className="mt-1.5 h-[5px] overflow-hidden rounded-[3px] bg-agon-s2">
          <div className="h-full rounded-[3px]" style={{ width: Math.min(100, Math.max(0, progress)) + "%", background: color }} />
        </div>
      ) : points >= 2 ? (
        <div className="mt-0.5 h-[30px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Line dataKey="value" stroke={color} strokeWidth={1.75} dot={false} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[30px] items-center text-[10px] text-agon-tx3">Pas assez de données</div>
      )}
    </button>
  );
}
