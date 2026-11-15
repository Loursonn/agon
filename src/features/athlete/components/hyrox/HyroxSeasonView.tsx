import { useMemo } from "react";
import { C, alpha } from "@/lib/theme";
import { CARD, DISPLAY, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxReferences } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { pickRef } from "@/api/hyrox";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import { bracketOf, type RefLookup } from "@/lib/hyrox/calc";
import { CATEGORY_LABEL, RACE_FORMAT_LABEL, raceCategory, type RaceFormat } from "@/lib/hyrox/categories";
import { chronoByFormat, fmtPace, ownTotalPct, raceCruise, raceDebrief, stationProfile, type ChronoPoint } from "@/lib/hyrox/raceDebrief";
import { raceGains } from "@/lib/hyrox/raceWatch";
import { fmtClock } from "@/lib/seance";
import { StandingLegend } from "@/features/shared/components/hyrox/RaceDebriefView";
import { standingColor } from "@/features/shared/components/hyrox/raceAnalysisShared";

/**
 * « Ma saison » (athlète, planche validée par Hugo le 15/11/2026) : la
 * dernière course en grand, la progression du chrono (solo et duo sur des
 * courbes séparées), ce qui a bougé depuis la course précédente du même
 * format, le profil des stations et où gagner du temps. Tout est calculé.
 */

const FORMAT_COLOR: Record<RaceFormat, string> = { solo: C.tx, duo: C.b, relais: C.ame };

const H2 = { ...KICKER, margin: 0, color: C.ac, fontWeight: 400 } as const;

function SeasonChart({ series }: { series: Record<RaceFormat, ChronoPoint[]> }) {
  const all = (Object.values(series) as ChronoPoint[][]).flat().sort((a, b) => a.date.localeCompare(b.date));
  if (all.length < 2) return null;
  const W = 340;
  const H = 170;
  const PX = 26;
  const PT = 24;
  const PB = 30;
  const lo = Math.min(...all.map((p) => p.totalS));
  const hi = Math.max(...all.map((p) => p.totalS));
  const x = (id: string) => PX + (all.findIndex((p) => p.id === id) / (all.length - 1)) * (W - 2 * PX);
  const y = (s: number) => PT + ((s - lo) / Math.max(1, hi - lo)) * (H - PT - PB); // plus rapide = plus haut
  const formats = (Object.keys(series) as RaceFormat[]).filter((f) => series[f].length > 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
      aria-label={formats.map((f) => `${RACE_FORMAT_LABEL[f]} : ${series[f].map((p) => `${p.name} ${fmtClock(p.totalS)}`).join(", ")}`).join(". ")}>
      {[PT, (PT + H - PB) / 2, H - PB].map((v) => <line key={v} x1={0} x2={W} y1={v} y2={v} stroke={C.brd} />)}
      {formats.map((f) => series[f].length > 1 && (
        <polyline key={f} fill="none" stroke={FORMAT_COLOR[f]} strokeWidth={2} points={series[f].map((p) => `${x(p.id)},${y(p.totalS)}`).join(" ")} />
      ))}
      {all.map((p, i) => {
        const f = formats.find((k) => series[k].some((q) => q.id === p.id))!;
        const last = i === all.length - 1;
        return (
          <g key={p.id}>
            <circle cx={x(p.id)} cy={y(p.totalS)} r={last ? 6 : 4} fill={last ? C.ac : C.bg} stroke={FORMAT_COLOR[f]} strokeWidth={last ? 0 : 2} />
            <text x={x(p.id)} y={y(p.totalS) - 10} fontSize={10.5} textAnchor="middle" fill={f === "solo" ? C.tx2 : FORMAT_COLOR[f]} style={MONO}>{fmtClock(p.totalS)}</text>
            <text x={x(p.id)} y={H - 8} fontSize={10} textAnchor="middle" fill={C.tx3} style={MONO}>{p.name.slice(0, 10)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function HyroxSeasonView({ onOpenRace }: { onOpenRace: (id: string) => void }) {
  const { athleteId } = useAthleteContext();
  const { data: races = [], isLoading } = useHyroxResults(athleteId);
  const { data: refs = [] } = useHyroxReferences();
  const refLookup: RefLookup = useMemo(() => (d, s, b) => pickRef(refs, d, s, b) ?? undefined, [refs]);

  const finished = useMemo(() => races.filter((r) => r.status === "finished" && r.total_s > 0).sort((a, b) => b.date.localeCompare(a.date)), [races]);
  const last: HyroxResult | null = finished[0] ?? null;
  const series = useMemo(() => chronoByFormat(finished), [finished]);

  const view = useMemo(() => {
    if (!last) return null;
    const cat = raceCategory(last);
    const has = refs.length > 0;
    const bracket = bracketOf(last.total_s);
    const median = (seg: string) => pickRef(refs, cat, seg, bracket)?.p50_s ?? null;
    const posOf = (seg: string) => pickRef(refs, cat, seg, "all");
    const best = finished.filter((r) => r.is_official && raceCategory(r) === cat).reduce<number | null>((m, r) => (m == null || r.total_s < m ? r.total_s : m), null);
    const isRecord = last.is_official && best != null && last.total_s <= best;
    const debrief = raceDebrief({ race: last, races: finished, posOf, median: has ? median : null, refs: has ? refLookup : null, isRecord });
    const gains = has ? raceGains(last, median) : null;
    return { cat, isRecord, debrief, gains, profile: has ? stationProfile(last, refLookup) : [], pct: has ? ownTotalPct(last, refLookup) : null };
  }, [last, refs, refLookup, finished]);

  if (isLoading) return <div style={{ padding: 20, textAlign: "center", color: C.tx3, fontSize: 12 }}>Chargement…</div>;
  if (!last || !view) {
    return (
      <div style={{ ...CARD, padding: 20, fontSize: 13.5, color: C.tx2, lineHeight: 1.55 }}>
        Pas encore de course HYROX. Ajoute ta première course dans l'onglet Courses : ta saison se construira ici.
      </div>
    );
  }
  const { debrief, gains } = view;
  const prev = debrief.previous;
  const chronoRow = debrief.since.find((r) => r.key === "chrono");
  const cruise = raceCruise(last);
  const dateLabel = new Date(last.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const formats = (Object.keys(series) as RaceFormat[]).filter((f) => series[f].length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section aria-label="Dernière course" style={{ ...CARD, borderColor: C.brdL, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={LABEL}>Dernière course · {dateLabel}</span>
          {view.isRecord && <span style={{ ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", padding: "4px 8px", borderRadius: 999, background: C.g, color: C.ink }}>RECORD PERSO</span>}
        </div>
        <div style={{ ...DISPLAY, fontSize: 20, fontWeight: 400, letterSpacing: "0.06em" }}>{last.event_name}</div>
        <div style={{ ...MONO, fontSize: 54, fontWeight: 500, lineHeight: 1 }}>{fmtClock(last.total_s)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, borderTop: `1px solid ${C.brd}`, paddingTop: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={LABEL}>{last.rank_overall != null ? "Rang" : "Catégorie"}</span>
            <span style={{ ...MONO, fontSize: 16 }}>
              {last.rank_overall != null && last.participants_overall
                ? <>{last.rank_overall}<span style={{ color: C.tx3, fontSize: 12 }}> / {last.participants_overall}</span></>
                : CATEGORY_LABEL[view.cat]}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={LABEL}>Position</span>
            <span style={{ ...MONO, fontSize: 16 }}>{view.pct != null ? <>top {view.pct}<span style={{ color: C.tx3, fontSize: 12 }}> %</span></> : "—"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={LABEL}>{prev ? `vs ${prev.event_name.replace(/^hyrox\s+/i, "")}` : "Croisière"}</span>
            <span style={{ ...MONO, fontSize: 16, color: chronoRow ? (chronoRow.better ? C.g : chronoRow.better === false ? C.o : C.tx2) : C.tx }}>
              {chronoRow ? chronoRow.delta : cruise != null ? <>{fmtPace(cruise)}<span style={{ color: C.tx3, fontSize: 12 }}> /km</span></> : "—"}
            </span>
          </div>
        </div>
        {debrief.headline && <p style={{ margin: 0, fontSize: 14, color: C.tx2, lineHeight: 1.5 }}>{debrief.headline}</p>}
      </section>

      {finished.length > 1 && (
        <section aria-label="Progression du chrono" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <h2 style={H2}>01 — Ta progression</h2>
            {formats.length > 1 && (
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.tx2 }}>
                {formats.map((f) => <span key={f} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: FORMAT_COLOR[f] }} />{RACE_FORMAT_LABEL[f]}</span>)}
              </div>
            )}
          </div>
          <div style={{ ...CARD, padding: "14px 12px 10px" }}>
            <SeasonChart series={series} />
            {formats.length > 1 && <p style={{ margin: "8px 4px 0", fontSize: 12, color: C.tx3, lineHeight: 1.45 }}>Solo et duo sur des courbes séparées : leurs chronos ne se comparent pas.</p>}
          </div>
        </section>
      )}

      {prev && debrief.since.length > 0 && (
        <section aria-label="Depuis la course précédente" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={H2}>02 — Depuis {prev.event_name.replace(/^hyrox\s+/i, "")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {debrief.since.map((r) => (
              <div key={r.key} style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={LABEL}>{r.label}</span>
                <span style={{ ...MONO, fontSize: 22, color: r.better == null ? C.tx2 : r.better ? C.g : C.o }}>{r.delta}</span>
                <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{r.from} → {r.to}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {view.profile.length > 0 && (
        <section aria-label="Ton profil" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <h2 style={H2}>03 — Ton profil</h2>
            <span style={{ fontSize: 12, color: C.tx3 }}>vs toute la catégorie {CATEGORY_LABEL[view.cat]}</span>
          </div>
          <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {view.profile.map((s) => (
              <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13 }}>
                  <span>{s.label}</span>
                  <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>{fmtClock(s.timeS)}</span>
                    <span style={{ ...MONO, fontSize: 13, color: s.standing === "norme" ? C.tx2 : standingColor(s.standing) }}>top {s.pct} %</span>
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: C.s2, overflow: "hidden" }}>
                  <div style={{ height: 6, borderRadius: 999, width: `${100 - s.pct}%`, background: standingColor(s.standing) }} />
                </div>
              </div>
            ))}
            <StandingLegend />
          </div>
        </section>
      )}

      {gains && gains.items.length > 0 && (
        <section aria-label="Où gagner du temps" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={H2}>04 — Ce qui te fera gagner du temps</h2>
          {gains.items.slice(0, 3).map((g) => (
            <div key={g.key} style={{ display: "flex", alignItems: "center", gap: 14, borderRadius: 14, padding: 14, background: alpha(C.o, 0.08), border: `1px solid ${alpha(C.o, 0.3)}` }}>
              <span style={{ ...MONO, fontSize: 20, color: C.o, minWidth: 64 }}>−{Math.round(g.gainS)} s</span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{g.label}</span>
                <span style={{ fontSize: 12, color: C.tx2, lineHeight: 1.4 }}>
                  {g.key === "runs" ? "Au-dessus de la médiane de ton niveau." : `${fmtClock(g.athleteS)}, la médiane de ton niveau est à ${fmtClock(g.medianS)}.`}
                </span>
              </span>
            </div>
          ))}
        </section>
      )}

      <button type="button" onClick={() => onOpenRace(last.id)}
        style={{ height: 52, borderRadius: 10, border: "none", background: C.ac, color: C.ink, fontFamily: "inherit", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
        Voir le débrief de {last.event_name.replace(/^hyrox\s+/i, "")}
      </button>
    </div>
  );
}
