import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, Share2 } from "lucide-react";
import { useIsPhone } from "@/hooks/useIsPhone";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, KICKER, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { useRaceWatch } from "@/features/shared/hooks/hyrox/useRaceWatch";
import { useHyroxReferences } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { pickRef } from "@/api/hyrox";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { DIVISION_LABEL, REFERENCE_DIVISION, type HyroxDivision, type HyroxResult } from "@/features/shared/types/hyrox";
import { bracketOf, percentile, typology, type RefLookup } from "@/lib/hyrox/calc";
import {
  bracketLabel, previousRace, profilePercentiles, raceShortName, recordGap, runPaceEvolution,
} from "@/lib/hyrox/raceEvolution";
import {
  athleteFindings, compromisedFromTimes, crossRaceWithWatch, defaultRaceOffset, raceGains, roxzoneRecovery,
  stationsAtLevel, timeAboveHr,
} from "@/lib/hyrox/raceWatch";
import { fmtClock } from "@/lib/seance";
import { PROFILE_LABEL, ddmm, fmtGap, type RaceAudience } from "./raceAnalysisShared";
import { Stat } from "./raceAnalysisUi";
import RaceCourseTab from "./RaceCourseTab";
import RaceGainsTab from "./RaceGainsTab";
import RaceRunsTab from "./RaceRunsTab";
import RaceShareTab from "./RaceShareTab";

/**
 * Analyse de course HYROX (planches HyroxAnaTel et HyroxAnaCoachOrdi) :
 * résultat officiel croisé avec la montre. Même écran pour l'athlète et le
 * coach ; côté coach, la frise ajoute allure et cadence, la montre passe en 02
 * et le tableau des 17 segments est déplié. Toutes les phrases sont des
 * règles calculées (aucune IA).
 */

const TABS = [
  { key: "course", label: "Course" },
  { key: "runs", label: "Runs" },
  { key: "gains", label: "Gains" },
] as const;
type TabKey = typeof TABS[number]["key"] | "partager";

/** Coach si l'écran est ouvert sous /coach (le composant sert aux deux espaces). */
const PILL = { ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const, borderRadius: 999, padding: "4px 9px" };

function detectAudience(): RaceAudience {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/coach") ? "coach" : "athlete";
}

export default function RaceAnalysis({ race, onBack, audience: forced }: { race: HyroxResult; onBack: () => void; audience?: RaceAudience }) {
  const audience = forced ?? detectAudience();
  const coach = audience === "coach";
  const [tab, setTab] = useState<TabKey>("course");
  const phone = useIsPhone();
  const watch = useRaceWatch(race);
  const { data: refs = [] } = useHyroxReferences();
  const { data: allRaces = [] } = useHyroxResults(race.athlete_id);
  const { data: coaches } = useAthleteCoaches(race.athlete_id);

  const detail = watch.detail;
  const stream = detail?.stream ?? null;
  const offset = useMemo(() => defaultRaceOffset(stream, race.total_s), [stream, race.total_s]);
  const sv = detail?.bounds?.kind === "three" ? detail.bounds.bounds : null;
  const sv1 = sv?.[0] ?? null;
  const sv2 = sv?.[1] ?? null;
  const attribution = stream ? detail?.attribution ?? null : null;

  const analysis = useMemo(() => crossRaceWithWatch(race, stream, offset), [race, stream, offset]);
  const refDiv = REFERENCE_DIVISION(race.division as HyroxDivision);
  const bracket = bracketOf(race.total_s);
  const refOf = useMemo(() => (seg: string) => pickRef(refs, refDiv, seg, bracket), [refs, refDiv, bracket]);
  const median = useMemo(() => (seg: string) => refOf(seg)?.p50_s ?? null, [refOf]);
  const refLookup: RefLookup = useMemo(() => (d, s, b) => pickRef(refs, d, s, b) ?? undefined, [refs]);
  const gains = useMemo(() => (refs.length ? raceGains(race, median) : null), [race, median, refs.length]);
  const atLevel = useMemo(() => (gains ? stationsAtLevel(race, median, gains) : []), [race, median, gains]);
  const evolution = useMemo(() => runPaceEvolution(allRaces), [allRaces]);
  const above = analysis ? timeAboveHr(analysis, stream, sv2, offset) : null;
  const findings = analysis ? athleteFindings({ analysis, above, gains, sv2 }) : [];
  const recov = analysis ? roxzoneRecovery(analysis, stream, offset) : null;

  const totalRef = refOf("total");
  const totalPct = totalRef ? percentile(race.total_s, totalRef) : null;
  const pp = profilePercentiles(race, refLookup);
  const profile = typology(pp.run, pp.stations);
  const best = allRaces
    .filter((r) => r.is_official && r.division === race.division && r.status === race.status)
    .reduce<number | null>((m, r) => (m == null || r.total_s < m ? r.total_s : m), null);
  const isRecord = race.is_official && best != null && race.total_s <= best;
  const gap = isRecord ? null : recordGap(race, allRaces);
  const prev = previousRace(race, allRaces);
  const previous = prev ? { name: raceShortName(prev), compromised: compromisedFromTimes(prev) } : null;
  const division = DIVISION_LABEL[race.division as HyroxDivision] ?? race.division;
  const bracketText = bracketLabel(bracket);
  const dateLabel = new Date(race.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const timeSource = race.is_official ? "résultat officiel" : "temps saisis";

  const crumb = (
    <nav aria-label="Fil d'Ariane" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <button type="button" onClick={onBack} style={{ ...buttonStyle(), padding: "0 10px" }} aria-label="Retour à la course"><ArrowLeft size={14} /></button>
      <span style={{ ...KICKER, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        HYROX › Courses › <span style={{ color: C.tx }}>{race.event_name} · {ddmm(race.date)}</span> › Analyse
      </span>
    </nav>
  );

  if (!analysis) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {crumb}
        <div style={{ fontSize: 13, color: C.tx3 }}>Il manque des temps de run ou de station : l'analyse a besoin des 16 temps de la course.</div>
      </div>
    );
  }

  const profileSub = coach
    ? (pp.run != null && pp.stations != null ? `course top ${pp.run} % · stations top ${pp.stations} %` : undefined)
    : profile === "hybrid" ? "course et stations au même niveau" : undefined;

  const PPILL = { ...PILL, fontSize: 10.5, padding: "3px 8px" };
  const phoneHead = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={onBack} aria-label="Retour à la course"
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, color: C.tx2, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
          <ChevronLeft size={16} /> HYROX · Courses
        </button>
        <button type="button" onClick={() => setTab(tab === "partager" ? "course" : "partager")} aria-pressed={tab === "partager"} aria-label="Partager"
          style={{ width: 36, height: 36, flex: "none", borderRadius: 10, border: `1px solid ${tab === "partager" ? C.ac : C.brdL}`, background: tab === "partager" ? alpha(C.ac, 0.16) : "transparent", color: tab === "partager" ? C.ac : C.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Share2 size={15} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span style={{ ...PPILL, background: race.is_official ? C.rouge : C.o, color: C.ink }}>{race.is_official ? "Compétition" : "Simulation"}</span>
        <span style={{ ...PPILL, fontWeight: 400, color: C.tx2, border: `1px solid ${C.brdL}`, padding: "2px 7px" }}>{division}</span>
      </div>
      <div style={{ ...DISPLAY, fontWeight: 300, fontSize: 24, lineHeight: 1.1, letterSpacing: "0.05em", color: C.tx }}>{race.event_name}</div>
      <div style={{ fontSize: 12.5, color: C.tx2, marginTop: -4 }}>{dateLabel}</div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 2 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...MONO, fontSize: 50, lineHeight: 1, letterSpacing: "-0.02em", color: C.tx }}>{fmtClock(race.total_s)}</div>
          {(isRecord || gap) && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {isRecord
                ? <span style={{ ...PPILL, background: C.g, color: C.ink }}>Record</span>
                : gap && <span style={{ fontSize: 12.5, color: C.tx2 }}>+{fmtGap(gap.gapS)} vs record ({raceShortName(gap.record)})</span>}
            </div>
          )}
        </div>
        {race.rank_overall != null && race.participants_overall ? (
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 3, paddingBottom: 2, flex: "none" }}>
            <span style={{ ...KICKER, fontSize: 11, color: C.tx3 }}>Rang</span>
            <div style={{ ...MONO, fontSize: 18, color: C.tx }}>{race.rank_overall}<span style={{ color: C.tx3, fontSize: 13 }}> / {race.participants_overall}</span></div>
            <div style={{ fontSize: 12, color: C.tx2 }}>Top {Math.max(1, Math.round((race.rank_overall / race.participants_overall) * 100))} %</div>
          </div>
        ) : totalPct != null && (
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 3, paddingBottom: 2, flex: "none" }}>
            <span style={{ ...KICKER, fontSize: 11, color: C.tx3 }}>Position</span>
            <div style={{ ...MONO, fontSize: 18, color: C.tx }}>Top {totalPct} %</div>
            <div style={{ fontSize: 12, color: C.tx2 }}>{division} · {bracketText}</div>
          </div>
        )}
      </div>
      {profile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.tx3, flexWrap: "wrap" }}>
          <span style={{ ...PPILL, fontWeight: 400, color: C.ac, border: `1px solid ${alpha(C.ac, 0.45)}`, padding: "2px 7px" }}>Profil {PROFILE_LABEL[profile].toLowerCase()}</span>
          {profileSub && <span>{profileSub}</span>}
        </div>
      )}
    </div>
  );
  const phoneTabs = (
    <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, border: `1px solid ${C.brd}` }}>
      {TABS.map((t) => {
        const on = tab === t.key;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
            style={{
              ...MONO, flex: 1, height: 34, borderRadius: 8, border: "none", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              background: on ? alpha(C.ac, 0.16) : "transparent", color: on ? C.ac : C.tx2, cursor: "pointer",
            }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: phone ? 14 : 16 }}>
      {phone ? phoneHead : <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {crumb}
        <button type="button" onClick={() => setTab(tab === "partager" ? "course" : "partager")}
          style={buttonStyle(tab === "partager" ? "primary" : "ghost")} aria-pressed={tab === "partager"}>
          <Share2 size={14} /> Partager
        </button>
      </div>

      <div style={{
        position: "relative", overflow: "hidden", borderRadius: 16, padding: "20px 24px 20px 27px",
        background: alpha(C.o, 0.12), border: `1px solid ${alpha(C.o, 0.42)}`,
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.o }} />
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...PILL, background: race.is_official ? C.rouge : C.o, color: C.ink }}>{race.is_official ? "Compétition" : "Simulation"}</span>
            <span style={{ ...PILL, color: C.tx2, border: `1px solid ${C.brdL}`, padding: "3px 8px" }}>{division}</span>
            <span style={{ ...MONO, fontSize: 11.5, color: C.tx2 }}>{dateLabel}</span>
          </div>
          <div style={{ ...DISPLAY, fontWeight: 400, fontSize: 30, lineHeight: 1.1, letterSpacing: "0.06em", color: C.tx, marginTop: 10 }}>{race.event_name}</div>
        </div>
        <Stat bare label="Chrono" value={fmtClock(race.total_s)}
          sub={isRecord ? "Record" : gap ? `+${fmtGap(gap.gapS)} vs record (${raceShortName(gap.record)})` : undefined} />
        {race.rank_overall != null && race.participants_overall
          ? <Stat bare label="Rang" value={String(race.rank_overall)} unit={`/ ${race.participants_overall}`} sub={`Top ${Math.max(1, Math.round((race.rank_overall / race.participants_overall) * 100))} %`} />
          : totalPct != null && <Stat bare label="Position" value={`Top ${totalPct} %`} sub={`${division} · ${bracketText}`} />}
        {profile && <Stat bare label="Profil" value={PROFILE_LABEL[profile]} sub={profileSub} />}
      </div>
      </>}

      {phone ? phoneTabs : (
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C.brd}` }} role="tablist">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
              style={{
                ...MONO, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", background: "none", border: "none",
                borderBottom: `2px solid ${on ? C.ac : "transparent"}`, color: on ? C.tx : C.tx3,
                padding: "8px 0", marginBottom: -1, cursor: "pointer",
              }}>
              {t.label}
            </button>
          );
        })}
      </div>
      )}

      {tab === "course" && (
        <RaceCourseTab audience={audience} analysis={analysis} stream={stream} watchLoading={watch.loading} offset={offset}
          sv1={sv1} sv2={sv2} attribution={attribution} findings={findings} above={above} recov={recov} previous={previous}
          refOf={refOf} totalS={race.total_s} totalRef={totalRef} timeSource={timeSource} division={division} bracketText={bracketText} />
      )}
      {tab === "runs" && (
        <RaceRunsTab analysis={analysis} median={median} attribution={attribution} timeSource={timeSource} evolution={evolution} raceId={race.id} />
      )}
      {tab === "gains" && (
        <RaceGainsTab gains={gains} atLevel={atLevel} division={division} bracketText={bracketText} timeSource={timeSource} startLabel={raceShortName(race)} />
      )}
      {tab === "partager" && (
        <RaceShareTab race={race} analysis={analysis} division={division} isRecord={isRecord}
          coachName={coaches?.referent?.full_name ?? null} attribution={attribution}
          hr={stream?.hr ? stream.t.flatMap((t, i) => (t >= offset && t <= offset + race.total_s && i % 10 === 0 ? [stream.hr![i]] : [])) : null} />
      )}
    </div>
  );
}
