/**
 * Retours sur plusieurs semaines (vue Mois sous le calendrier, vue Cycle) :
 * comparatif semaine par semaine, séries par groupe et course, santé, et pour
 * un cycle l'évolution des exercices clés et les tests passés.
 */
import { useMemo, type ReactNode } from "react";
import { C, alpha } from "@/lib/theme";
import { useMuscleVolume } from "@/features/coach/components/programmation/hooks/useMuscleVolume";
import { rollUpToGroups } from "@/lib/muscleVolume";
import { getMC, mL, MTREE } from "@/lib/muscles";
import { addDaysIso, exerciseTrends, testsInPeriod, weekStats, weeksBetween, type PeriodData, type WeekStats } from "@/lib/retoursPeriod";

const CARD = "rounded-[14px] border border-agon-brd bg-agon-s1 p-4";
const KICK = "agon-mono text-[10.5px] uppercase tracking-[0.14em] text-agon-tx3";
const fmt = (n: number | null, d = 1) => (n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: d }));
const short = (monday: string) => new Date(`${monday}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

function Card({ title, right, children, tone }: { title: string; right?: ReactNode; children: ReactNode; tone?: string }) {
  return (
    <div className={tone ? "rounded-[14px] border p-4" : CARD} style={tone ? { borderColor: alpha(tone, 0.45), background: alpha(tone, 0.07) } : undefined}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className={KICK} style={tone ? { color: tone } : undefined}>{title}</span>
        {right && <span className="text-[11.5px] text-agon-tx3">{right}</span>}
      </div>
      {children}
    </div>
  );
}

/** Fond d'une cellule : plus la valeur est haute dans sa ligne, plus la teinte est forte. */
function heat(v: number | null, max: number, color: string) {
  if (v == null || max <= 0) return undefined;
  return { background: alpha(color, 0.08 + 0.32 * Math.min(1, v / max)) };
}

function Spark({ values, color, invert = false }: { values: (number | null)[]; color: string; invert?: boolean }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p) => p.v != null) as { v: number; i: number }[];
  if (pts.length < 2) return <div className="h-[44px] text-[11.5px] text-agon-tx3">pas assez de données</div>;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const span = hi - lo || 1;
  const n = Math.max(1, values.length - 1);
  const d = pts.map((p) => `${(p.i / n) * 196 + 2},${invert ? 6 + ((p.v - lo) / span) * 32 : 38 - ((p.v - lo) / span) * 32}`).join(" ");
  return (
    <svg aria-hidden="true" viewBox="0 0 200 44" className="h-[44px] w-full" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function RetoursPeriodSection({ athleteId, from, to, data, runSummary, showEvolution = false, showTests = false }: {
  athleteId: string | undefined;
  from: string;
  to: string;
  data: PeriodData;
  runSummary: (start: string, end: string) => { km: number; watchKm: number };
  showEvolution?: boolean;
  showTests?: boolean;
}) {
  const weeks = useMemo(() => weeksBetween(from, to), [from, to]);
  const stats = useMemo(() => weekStats(weeks, data, runSummary), [weeks, data, runSummary]);
  const { byWeek } = useMuscleVolume(athleteId, weeks[0], addDaysIso(weeks[weeks.length - 1], 6));
  const today = new Date().toISOString().slice(0, 10);
  const isFuture = (m: string) => m > today;

  // Groupes musculaires les plus travaillés sur la période (6 au plus).
  const groups = useMemo(() => {
    const perWeek = weeks.map((w) => rollUpToGroups(byWeek[w] ?? {}));
    const total = (id: string) => perWeek.reduce((s, g) => s + (g[id]?.done ?? 0), 0);
    const ids = MTREE.map((g) => g.id).filter((id) => total(id) > 0).sort((a, b) => total(b) - total(a)).slice(0, 6);
    return { ids, perWeek, max: Math.max(1, ...perWeek.flatMap((g) => ids.map((id) => g[id]?.done ?? 0))) };
  }, [weeks, byWeek]);

  const rows: { label: string; color: string; cell: (s: WeekStats) => string; value: (s: WeekStats) => number | null }[] = [
    { label: "Séances faites", color: C.g, cell: (s) => `${s.sessionsDone}/${s.sessionsTotal}`, value: (s) => (s.sessionsTotal ? s.sessionsDone / s.sessionsTotal : null) },
    { label: "Séries réalisées", color: C.ac, cell: (s) => `${s.setsDone}${s.setsPlanned ? ` / ${s.setsPlanned}` : ""}`, value: (s) => s.setsDone },
    { label: "Course (km)", color: C.b, cell: (s) => fmt(s.km), value: (s) => s.km },
    { label: "Charge (UA)", color: C.ac, cell: (s) => (s.load ? s.load.toLocaleString("fr-FR") : "—"), value: (s) => s.load || null },
    { label: "RPE moyen", color: C.o, cell: (s) => fmt(s.rpeAvg), value: (s) => s.rpeAvg },
    { label: "Bien-être", color: C.g, cell: (s) => fmt(s.wellness), value: (s) => s.wellness },
  ];

  const kmMax = Math.max(1, ...stats.map((s) => s.km));
  const pastStats = stats.filter((s) => !isFuture(s.monday));
  const kmAvg = pastStats.length ? pastStats.reduce((a, s) => a + s.km, 0) / pastStats.length : 0;
  const trends = showEvolution ? exerciseTrends(weeks, data.workouts) : [];
  const tests = showTests ? testsInPeriod(data.test_sessions, from, to) : [];
  const trendText = (vals: (number | null)[], good: "up" | "down") => {
    const v = vals.filter((x): x is number => x != null);
    if (v.length < 2) return { text: "—", color: C.tx3 };
    const d = v[v.length - 1] - v[0];
    const better = good === "up" ? d > 0 : d < 0;
    return { text: `${fmt(v[0])} → ${fmt(v[v.length - 1])}`, color: Math.abs(d) < 0.15 ? C.tx3 : better ? C.g : C.o };
  };

  return (
    <div className="flex flex-col gap-3" data-testid="retours-period">
      {/* Comparatif */}
      <Card title="Semaine par semaine">
        <div className="overflow-x-auto">
          <div className="grid min-w-[560px] items-center gap-1.5 text-[13px]" style={{ gridTemplateColumns: `150px repeat(${weeks.length}, minmax(64px, 1fr))` }}>
            <span />
            {weeks.map((w) => <span key={w} className="text-center text-[11.5px] text-agon-tx3">{short(w)}</span>)}
            {rows.map((r) => {
              const vals = stats.map(r.value);
              const max = Math.max(0, ...vals.filter((v): v is number => v != null));
              return [
                <span key={`${r.label}-l`} className="text-[12.5px] text-agon-tx2">{r.label}</span>,
                ...stats.map((s, i) => (
                  <span key={`${r.label}-${s.monday}`} className="agon-mono rounded-[8px] px-1 py-2 text-center tabular-nums" style={isFuture(s.monday) ? { color: C.tx3 } : heat(vals[i], max, r.color)}>
                    {isFuture(s.monday) ? "·" : r.cell(s)}
                  </span>
                )),
              ];
            })}
          </div>
        </div>
      </Card>

      {/* Séries par groupe + course */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Séries réalisées par groupe" right="une barre par semaine">
          {groups.ids.length === 0 ? (
            <div className="py-4 text-center text-[12px] text-agon-tx3">Aucune série réalisée sur la période.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {groups.ids.map((id) => (
                <div key={id} className="grid grid-cols-[84px_minmax(0,1fr)] items-end gap-3">
                  <span className="truncate text-[12.5px]" style={{ color: getMC(id) }}>{mL(id)}</span>
                  <div className="flex h-[34px] items-end gap-1">
                    {groups.perWeek.map((g, i) => {
                      const v = g[id]?.done ?? 0;
                      return (
                        <div key={weeks[i]} title={`Semaine du ${short(weeks[i])} : ${v} séries`} className="flex-1 rounded-t-[3px]"
                          style={{ height: `${Math.max(4, (v / groups.max) * 34)}px`, background: v ? alpha(getMC(id), 0.35 + 0.65 * ((i + 1) / groups.perWeek.length)) : C.s2 }} />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Course par semaine" right={`moyenne ${fmt(kmAvg)} km`} tone={C.b}>
          <div className="flex h-[150px] items-end gap-2">
            {stats.map((s) => (
              <div key={s.monday} className="flex flex-1 flex-col items-center gap-1">
                <span className="agon-mono text-[11.5px] tabular-nums">{isFuture(s.monday) ? "" : fmt(s.km)}</span>
                <div className="w-full rounded-t-[6px]" title={`${fmt(s.km)} km · dont ${fmt(s.watchKm)} montre`}
                  style={{ height: `${Math.max(3, (s.km / kmMax) * 110)}px`, background: isFuture(s.monday) ? C.s2 : alpha(C.b, s.km >= kmAvg ? 0.9 : 0.5) }} />
                <span className="text-[11px] text-agon-tx3">{short(s.monday)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Évolution des exercices (cycle) */}
      {showEvolution && (
        <Card title="Évolution des exercices clés" right="1RM estimé à partir de la meilleure série">
          {trends.length === 0 ? (
            <div className="py-2 text-[12.5px] text-agon-tx3">Pas assez de séances chargées sur la période pour suivre un exercice.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {trends.map((t) => (
                <div key={t.name} className="flex flex-col gap-1.5 rounded-[12px] bg-agon-s2 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-semibold">{t.name}</span>
                    <span className="text-[12.5px]" style={{ color: t.deltaPct > 0 ? C.g : t.deltaPct < 0 ? C.o : C.tx3 }}>
                      {t.deltaPct > 0 ? "+" : ""}{fmt(t.deltaPct)} %
                    </span>
                  </div>
                  <Spark values={t.points.map((p) => p.e1rm)} color={C.ac} />
                  <span className="text-[11.5px] text-agon-tx3">1RM est. {fmt(t.first)} → {fmt(t.last)} kg</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Santé + tests */}
      <div className={showTests ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}>
        <Card title="Santé · tendance">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {([
              ["Bien-être", stats.map((s) => s.wellness), "up", C.g, false],
              ["Sommeil", stats.map((s) => s.sommeil), "up", C.b, false],
              ["Fatigue", stats.map((s) => s.fatigue), "up", C.o, false],
              ["Douleur max", stats.map((s) => s.pain), "down", C.r, true],
            ] as const).map(([label, vals, good, color, invert]) => {
              const t = trendText([...vals], good);
              return (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-[12px] text-agon-tx3">{label}</span>
                  <Spark values={[...vals]} color={color} invert={invert} />
                  <span className="text-[12px]" style={{ color: t.color }}>{t.text}</span>
                </div>
              );
            })}
          </div>
        </Card>
        {showTests && (
          <Card title="Tests de la période">
            {tests.length === 0 ? (
              <div className="text-[12.5px] text-agon-tx3">Aucun test passé sur la période.</div>
            ) : tests.map((t) => (
              <div key={t.id} className="flex justify-between gap-2 border-t border-agon-brd py-2 text-[13px]">
                <span className="truncate">{t.title}</span>
                <span className="text-agon-tx3">{short(t.date)}{t.results_note ? ` · ${t.results_note}` : ""}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
