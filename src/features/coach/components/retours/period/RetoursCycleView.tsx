/**
 * Vue Cycle des Retours : le coach choisit un macrocycle, un mésocycle ou un
 * cycle, et voit l'évolution de l'athlète sur cette période (séances,
 * exercices, course, santé, tests), comparée à la période précédente du même
 * niveau.
 */
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { getCycleTree } from "@/api/cycles";
import { QK } from "@/lib/queryKeys";
import { fetchMonthData } from "@/features/shared/hooks/useMonthlyRetours";
import { weekStats, weeksBetween, type PeriodData } from "@/lib/retoursPeriod";
import { RetoursPeriodSection } from "./RetoursPeriodSection";

type Level = "macro" | "meso" | "cycle";
interface Period { id: string; name: string; start_date: string; end_date: string; objective?: string | null }

const LEVEL_LABEL: Record<Level, string> = { macro: "Macro", meso: "Méso", cycle: "Cycle" };
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
const fmt = (n: number | null, d = 1) => (n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: d }));

/** Premiers jours des mois touchés par [from, to]. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T12:00:00`);
  while (d.toISOString().slice(0, 7) <= to.slice(0, 7)) {
    out.push(d.toISOString().slice(0, 7));
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

function usePeriodData(athleteId: string | undefined, period: Period | null): { data: PeriodData | null; loading: boolean } {
  const months = period ? monthsBetween(period.start_date, period.end_date) : [];
  const qs = useQueries({
    queries: months.map((m) => ({
      queryKey: QK.monthlyRetours(athleteId, m),
      queryFn: () => fetchMonthData(athleteId!, new Date(`${m}-01T12:00:00`)),
      enabled: !!athleteId,
      staleTime: 5 * 60_000,
    })),
  });
  const loading = qs.some((q) => q.isLoading);
  const data = useMemo<PeriodData | null>(() => {
    if (!period || qs.some((q) => !q.data)) return null;
    const merged: PeriodData = { workouts: [], energy_sessions: [], daily_data: {}, test_sessions: [] };
    for (const q of qs) {
      merged.workouts.push(...q.data!.workouts);
      merged.energy_sessions.push(...q.data!.energy_sessions);
      Object.assign(merged.daily_data, q.data!.daily_data);
      merged.test_sessions!.push(...q.data!.test_sessions);
    }
    return merged;
    // qs change à chaque rendu : on suit les données elles-mêmes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period?.id, ...qs.map((q) => q.dataUpdatedAt)]);
  return { data, loading };
}

function totals(period: Period | null, data: PeriodData | null, runSummary: (a: string, b: string) => { km: number; watchKm: number }) {
  if (!period || !data) return null;
  const today = new Date().toISOString().slice(0, 10);
  const end = period.end_date < today ? period.end_date : today;
  const s = weekStats(weeksBetween(period.start_date, end), data, runSummary);
  const done = s.reduce((a, w) => a + w.sessionsDone, 0);
  const total = s.reduce((a, w) => a + w.sessionsTotal, 0);
  const wl = s.map((w) => w.wellness).filter((v): v is number => v != null);
  return {
    assiduite: total ? Math.round((done / total) * 100) : null,
    series: s.reduce((a, w) => a + w.setsDone, 0),
    km: Math.round(s.reduce((a, w) => a + w.km, 0) * 10) / 10,
    wellness: wl.length ? Math.round((wl.reduce((a, b) => a + b, 0) / wl.length) * 10) / 10 : null,
  };
}

export function RetoursCycleView({ athleteId, runSummary }: {
  athleteId: string | undefined;
  runSummary: (start: string, end: string) => { km: number; watchKm: number };
}) {
  const [level, setLevel] = useState<Level>("meso");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const { data: tree, isLoading } = useQuery({
    queryKey: ["retours-cycle-tree", athleteId],
    queryFn: () => getCycleTree(athleteId!, { withMicrocycles: false }),
    enabled: !!athleteId,
  });

  const periods: Period[] = useMemo(() => {
    if (!tree) return [];
    const list = level === "macro" ? tree.macrocycles : level === "meso" ? tree.mesocycles : tree.cycles;
    return [...list].sort((a, b) => a.start_date.localeCompare(b.start_date));
  }, [tree, level]);

  const today = new Date().toISOString().slice(0, 10);
  const current = periods.find((p) => p.id === pickedId)
    ?? periods.find((p) => p.start_date <= today && p.end_date >= today)
    ?? [...periods].reverse().find((p) => p.start_date <= today)
    ?? periods[0] ?? null;
  const previous = current ? [...periods].reverse().find((p) => p.end_date < current.start_date) ?? null : null;

  const cur = usePeriodData(athleteId, current);
  const prev = usePeriodData(athleteId, previous);
  const tc = totals(current, cur.data, runSummary);
  const tp = totals(previous, prev.data, runSummary);

  const delta = (a: number | null | undefined, b: number | null | undefined, unit: string, pts = false) => {
    if (a == null || b == null || !previous) return null;
    if (pts) { const d = a - b; return { text: `${d >= 0 ? "+" : ""}${fmt(d)} ${unit} vs précédent`, color: d >= 0 ? C.g : C.o }; }
    if (b === 0) return null;
    const d = Math.round(((a - b) / b) * 100);
    return { text: `${d >= 0 ? "+" : ""}${d} % vs précédent`, color: d >= 0 ? C.g : C.o };
  };

  return (
    <div className="flex flex-col gap-4" data-testid="retours-cycle">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex rounded-[8px] bg-agon-s2 p-0.5">
          {(["macro", "meso", "cycle"] as Level[]).map((l) => (
            <button key={l} type="button" role="tab" aria-selected={level === l} onClick={() => { setLevel(l); setPickedId(null); }}
              className={cn("cursor-pointer rounded-[6px] border-none px-3.5 py-[5px] text-[12px]", level === l ? "bg-agon-s1 font-semibold text-agon-tx" : "bg-transparent font-medium text-agon-tx3")}>
              {LEVEL_LABEL[l]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-agon-tx3">
          Période
          <select
            value={current?.id ?? ""}
            onChange={(e) => setPickedId(e.target.value)}
            disabled={periods.length === 0}
            className="rounded-[8px] border border-agon-brd-l bg-agon-s1 px-3 py-1.5 font-[inherit] text-[13px] text-agon-tx"
          >
            {periods.length === 0 && <option value="">Aucune période</option>}
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name} ({fmtDate(p.start_date)} → {fmtDate(p.end_date)})</option>)}
          </select>
        </label>
        {previous && <span className="text-[12px] text-agon-tx3">Comparé à : {previous.name}</span>}
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-[13px] text-agon-tx3">Chargement de la périodisation…</div>
      ) : !current ? (
        <div className="rounded-[14px] border border-agon-brd bg-agon-s1 p-5 text-[13px] text-agon-tx2">
          Aucun {LEVEL_LABEL[level].toLowerCase()} dans la périodisation de l'athlète. Crée-le dans le planning pour suivre son évolution ici.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="agon-display text-[24px]">{current.name}</span>
            <span className="text-[12.5px] text-agon-tx3">
              {fmtDate(current.start_date)} → {fmtDate(current.end_date)} · {weeksBetween(current.start_date, current.end_date).length} semaines
              {current.objective ? ` · ${current.objective}` : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {([
              ["Assiduité", tc?.assiduite != null ? `${tc.assiduite} %` : "—", delta(tc?.assiduite, tp?.assiduite, "pts", true)],
              ["Séries réalisées", tc ? fmt(tc.series, 0) : "—", delta(tc?.series, tp?.series, "")],
              ["Course", tc ? `${fmt(tc.km)} km` : "—", delta(tc?.km, tp?.km, "")],
              ["Bien-être moyen", tc?.wellness != null ? `${fmt(tc.wellness)} / 5` : "—", delta(tc?.wellness, tp?.wellness, "", true)],
            ] as const).map(([label, value, d]) => (
              <div key={label} className="flex flex-col gap-1 rounded-[14px] border border-agon-brd bg-agon-s1 p-4">
                <span className="text-[12px] text-agon-tx3">{label}</span>
                <span className="agon-display text-[26px] leading-tight">{value}</span>
                {d && <span className="text-[12px]" style={{ color: d.color }}>{d.text}</span>}
              </div>
            ))}
          </div>

          {cur.loading || !cur.data ? (
            <div className="py-8 text-center text-[13px] text-agon-tx3">Chargement des séances de la période…</div>
          ) : (
            <RetoursPeriodSection
              athleteId={athleteId} from={current.start_date} to={current.end_date}
              data={cur.data} runSummary={runSummary} showEvolution showTests
            />
          )}
        </>
      )}
    </div>
  );
}
