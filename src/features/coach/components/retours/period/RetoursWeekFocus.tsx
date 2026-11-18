/**
 * Vue Semaine des Retours, sous le calendrier : volume de LA semaine consultée.
 * Séries par groupe musculaire (fait / prévu, écart vs semaine d'avant) et
 * course (km, sorties, charge vs moyenne des 4 semaines d'avant).
 */
import { C, alpha } from "@/lib/theme";
import { useMuscleVolume } from "@/features/coach/components/programmation/hooks/useMuscleVolume";
import { formatSets, rollUpToGroups } from "@/lib/muscleVolume";
import { getMC, mL, MTREE } from "@/lib/muscles";
import { addDaysIso } from "@/lib/retoursPeriod";
import type { RunOuting } from "@/lib/watchRunMatching";

const fmtKm = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const CARD = "rounded-[14px] border border-agon-brd bg-agon-s1 p-4";
const KICK = "agon-mono text-[10.5px] uppercase tracking-[0.14em] text-agon-tx3";

export function RetoursWeekFocus({ athleteId, monday, runSummary, outings }: {
  athleteId: string | undefined;
  monday: string;
  runSummary: (start: string, end: string) => { km: number; watchKm: number };
  outings: readonly RunOuting[];
}) {
  const prev = addDaysIso(monday, -7);
  const sunday = addDaysIso(monday, 6);
  const { byWeek, isLoading } = useMuscleVolume(athleteId, prev, sunday);
  const cur = rollUpToGroups(byWeek[monday] ?? {});
  const before = rollUpToGroups(byWeek[prev] ?? {});
  const rows = MTREE.map((g) => g.id).filter((id) => (cur[id]?.planned ?? 0) > 0 || (cur[id]?.done ?? 0) > 0);
  const max = Math.max(1, ...rows.map((id) => Math.max(cur[id]?.planned ?? 0, cur[id]?.done ?? 0)));

  const { km, watchKm } = runSummary(monday, sunday);
  const past = [1, 2, 3, 4].map((i) => runSummary(addDaysIso(monday, -7 * i), addDaysIso(monday, -7 * i + 6)).km);
  const avg4 = past.reduce((a, b) => a + b, 0) / 4;
  const deltaPct = avg4 > 0 ? Math.round(((km - avg4) / avg4) * 100) : null;
  const weekRuns = outings.filter((o) => o.date >= monday && o.date <= sunday);
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short" });

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-testid="retours-week-focus">
      <div className={CARD}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className={KICK}>Séries par muscle · cette semaine</span>
          <span className="text-[11.5px] text-agon-tx3">fait / prévu · écart vs semaine d'avant</span>
        </div>
        {isLoading ? (
          <div className="py-4 text-center text-[12px] text-agon-tx3">Calcul du volume…</div>
        ) : rows.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-agon-tx3">Aucune série prévue cette semaine.</div>
        ) : (
          <div className="grid grid-cols-[110px_minmax(0,1fr)_64px_44px] items-center gap-x-3 gap-y-2 text-[13px]">
            {rows.map((id) => {
              const c = cur[id] ?? { planned: 0, done: 0 };
              const d = c.done - (before[id]?.done ?? 0);
              const color = getMC(id);
              return [
                <span key={`${id}-l`} className="truncate" style={{ color }}>{mL(id)}</span>,
                <div key={`${id}-b`} className="relative h-2.5 rounded-full bg-agon-s2" title={`${formatSets(c.done)} faites sur ${formatSets(c.planned)} prévues`}>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.planned / max) * 100}%`, background: alpha(color, 0.25) }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(c.done / max) * 100}%`, background: color }} />
                </div>,
                <span key={`${id}-v`} className="agon-mono text-right tabular-nums">{formatSets(c.done)} / {formatSets(c.planned)}</span>,
                <span key={`${id}-d`} className="text-right text-[12px] tabular-nums" style={{ color: d > 0 ? C.g : d < 0 ? C.o : C.tx3 }}>
                  {d === 0 ? "=" : `${d > 0 ? "+" : "−"}${formatSets(Math.abs(d))}`}
                </span>,
              ];
            })}
          </div>
        )}
      </div>

      <div className="rounded-[14px] border p-4" style={{ borderColor: alpha(C.b, 0.45), background: alpha(C.b, 0.07) }}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="agon-mono text-[10.5px] uppercase tracking-[0.14em]" style={{ color: C.b }}>Course · cette semaine</span>
          <span className="text-[11.5px] text-agon-tx3">moy. 4 sem. : {fmtKm(avg4)} km</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="agon-display text-[36px] leading-none">{fmtKm(km)}</span>
          <span className="text-[13px] text-agon-tx3">km{watchKm > 0 ? ` · dont ${fmtKm(watchKm)} montre` : ""}</span>
        </div>
        {deltaPct != null && (
          <div className="mt-1 text-[12px]" style={{ color: deltaPct > 30 ? C.r : deltaPct >= 0 ? C.g : C.tx3 }}>
            {deltaPct >= 0 ? "+" : ""}{deltaPct} % vs moyenne des 4 semaines{deltaPct > 30 ? " : hausse forte" : ""}
          </div>
        )}
        <div className="mt-3 flex flex-col">
          {weekRuns.length === 0 ? (
            <span className="text-[12.5px] text-agon-tx3">Aucune sortie cette semaine.</span>
          ) : weekRuns.map((o) => (
            <div key={o.key} className="flex justify-between gap-2 border-t py-1.5 text-[12.5px]" style={{ borderColor: alpha(C.b, 0.3) }}>
              <span className="truncate">{dayLabel(o.date)} · {o.label ?? (o.origin === "activity" ? "Sortie libre (montre)" : "Course")}</span>
              <span className="agon-mono tabular-nums">{fmtKm(o.km)} km</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
