import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, Pencil, Share2, Trash2 } from "lucide-react";
import { useIsPhone } from "@/hooks/useIsPhone";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, KICKER, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { useRaceWatch } from "@/features/shared/hooks/hyrox/useRaceWatch";
import { useHyroxReferences } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { pickRef } from "@/api/hyrox";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { DIVISION_LABEL, type HyroxDivision, type HyroxResult } from "@/features/shared/types/hyrox";
import { POSITION_BRACKET, alerts as raceAlerts, bracketOf, percentile, typology, type RefLookup } from "@/lib/hyrox/calc";
import { useHyroxRacePlans } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { planForRace, planSegments } from "@/lib/hyrox/racePlan";
import { compareAvailable, compareTarget, defaultCompare, type CompareKind, type CompareSources } from "@/lib/hyrox/raceCompare";
import { raceLevers } from "@/lib/hyrox/raceLevers";
import {
  bracketLabel, previousRace, profilePercentiles, raceShortName, recordGap, runPaceEvolution,
} from "@/lib/hyrox/raceEvolution";
import {
  athleteFindings, compromisedFromTimes, crossRaceWithWatch, defaultRaceOffset, raceGains, roxzoneRecovery,
  stationsAtLevel, timeAboveHr,
} from "@/lib/hyrox/raceWatch";
import { fmtClock } from "@/lib/seance";
import { PROFILE_LABEL, ddmm, fmtDuration, fmtGap, type RaceAudience } from "./raceAnalysisShared";
import { RaceComments, TalkToCoach } from "./RaceComments";
import { Stat } from "./raceAnalysisUi";
import RaceCourseTab from "./RaceCourseTab";
import RaceGainsTab from "./RaceGainsTab";
import RaceRunsTab from "./RaceRunsTab";
import RaceShareTab from "./RaceShareTab";
import { CATEGORY_LABEL, raceCategory, type ReferenceCategory } from "@/lib/hyrox/categories";
import { equivalentTotal } from "@/lib/hyrox/categoryEquivalence";
import RaceCategoryCard from "./RaceCategoryCard";

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

const CRUMB_LINK = { background: "none", border: "none", padding: 0, color: C.tx2, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 } as const;

function detectAudience(): RaceAudience {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/coach") ? "coach" : "athlete";
}

export default function RaceAnalysis({ race, onBack, audience: forced, onEdit, onDelete }: {
  race: HyroxResult;
  onBack: () => void;
  audience?: RaceAudience;
  /** Coach : modifier / supprimer la course (actions de l'ancienne fiche course). */
  onEdit?: (r: HyroxResult) => void;
  onDelete?: (r: HyroxResult) => void;
}) {
  const audience = forced ?? detectAudience();
  const coach = audience === "coach";
  const [tab, setTab] = useState<TabKey>("course");
  const phone = useIsPhone();
  const watch = useRaceWatch(race);
  const { data: refs = [] } = useHyroxReferences();
  const { data: allRaces = [] } = useHyroxResults(race.athlete_id);
  const { data: coaches } = useAthleteCoaches(race.athlete_id);
  const { data: plans = [] } = useHyroxRacePlans(race.athlete_id);
  const [compareChoice, setCompareChoice] = useState<CompareKind | null>(null);
  const [categoryChoice, setCategoryChoice] = useState<ReferenceCategory | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detail = watch.detail;
  const stream = detail?.stream ?? null;
  const offset = useMemo(() => defaultRaceOffset(stream, race.total_s), [stream, race.total_s]);
  const sv = detail?.bounds?.kind === "three" ? detail.bounds.bounds : null;
  const sv1 = sv?.[0] ?? null;
  const sv2 = sv?.[1] ?? null;
  const attribution = stream ? detail?.attribution ?? null : null;

  const analysis = useMemo(() => crossRaceWithWatch(race, stream, offset), [race, stream, offset]);
  const ownCategory = raceCategory(race);
  // Catégorie de comparaison : la sienne par défaut ; une autre via le sélecteur.
  const refDiv = categoryChoice ?? ownCategory;
  const refLookup: RefLookup = useMemo(() => (d, s, b) => pickRef(refs, d, s, b) ?? undefined, [refs]);
  // Niveau (tranche de chrono) : celui du chrono équivalent dans la catégorie choisie.
  const levelTotal = refDiv === ownCategory ? race.total_s : equivalentTotal(race.total_s, ownCategory, refDiv, refLookup)?.timeS ?? race.total_s;
  const bracket = bracketOf(levelTotal);
  /** Médiane du niveau : gain possible, écarts, habituel des runs. */
  const refOf = useMemo(() => (seg: string) => pickRef(refs, refDiv, seg, bracket), [refs, refDiv, bracket]);
  /** Position (top x %) : toute la catégorie. */
  const posOf = useMemo(() => (seg: string) => pickRef(refs, refDiv, seg, POSITION_BRACKET), [refs, refDiv]);
  const median = useMemo(() => (seg: string) => refOf(seg)?.p50_s ?? null, [refOf]);
  const gains = useMemo(() => (refs.length ? raceGains(race, median) : null), [race, median, refs.length]);
  const atLevel = useMemo(() => (gains ? stationsAtLevel(race, median, gains) : []), [race, median, gains]);
  const evolution = useMemo(() => runPaceEvolution(allRaces), [allRaces]);
  const above = analysis ? timeAboveHr(analysis, stream, sv2, offset) : null;
  const findings = analysis ? athleteFindings({ analysis, above, gains, sv2, levelP50: refs.length ? median : null }) : [];
  const recov = analysis ? roxzoneRecovery(analysis, stream, offset) : null;

  const totalRef = posOf("total");
  const totalPct = totalRef ? percentile(race.total_s, totalRef) : null;
  const pp = profilePercentiles(race, refLookup);
  const profile = typology(pp.run, pp.stations);
  const best = allRaces
    .filter((r) => r.is_official && r.division === race.division && r.status === race.status)
    .reduce<number | null>((m, r) => (m == null || r.total_s < m ? r.total_s : m), null);
  const isRecord = race.is_official && best != null && race.total_s <= best;
  const gap = isRecord ? null : recordGap(race, allRaces);
  const prev = previousRace(race, allRaces);
  const previous = prev ? { name: raceShortName(prev), compromised: compromisedFromTimes(prev, refs.length ? median : null) } : null;
  const plan = useMemo(() => planForRace(race, plans), [race, plans]);
  const planSegs = useMemo(() => (plan ? planSegments(plan.targets) : null), [plan]);
  const planTotalS = plan ? Object.values(planSegs ?? {}).reduce((n, x) => n + x, 0) || plan.target_total_s : null;
  const vsPlan = planTotalS != null ? race.total_s - planTotalS : null;
  const compareSrc: CompareSources = useMemo(() => ({ previous: prev, plan: planSegs, median }), [prev, planSegs, median]);
  const compareKind: CompareKind = compareChoice && compareAvailable(compareChoice, compareSrc) ? compareChoice : defaultCompare(compareSrc);
  const target = useMemo(() => compareTarget(compareKind, compareSrc), [compareKind, compareSrc]);
  const planOf = useMemo(() => compareTarget("plan", compareSrc), [compareSrc]);
  const levers = useMemo(
    () => (coach && refs.length ? raceLevers({ race, refs: refLookup, analysis: stream ? analysis : null, roxzoneRecoveryBpm: recov?.avgDrop ?? null, levelP50: median }) : []),
    [coach, refs.length, race, refLookup, stream, analysis, recov?.avgDrop, median],
  );
  const division = CATEGORY_LABEL[refDiv] ?? DIVISION_LABEL[race.division as HyroxDivision] ?? race.division;
  const bracketText = bracketLabel(bracket);
  const dateLabel = new Date(race.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const timeSource = race.is_official ? "résultat officiel" : "temps saisis";

  const crumb = (
    <nav aria-label="Fil d'Ariane" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <button type="button" onClick={onBack} style={{ ...buttonStyle(), padding: "0 10px" }} aria-label="Retour à la course"><ArrowLeft size={14} /></button>
      <span style={{ fontSize: 12.5, color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <button type="button" onClick={onBack} style={CRUMB_LINK}>HYROX</button> › <button type="button" onClick={onBack} style={CRUMB_LINK}>Courses</button> › <span style={{ color: C.tx }}>{race.event_name} · {ddmm(race.date)} · Analyse</span>
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
          {(isRecord || gap || vsPlan != null) && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {isRecord
                ? <span style={{ ...PPILL, background: C.g, color: C.ink }}>Record</span>
                : gap && vsPlan == null && <span style={{ fontSize: 12.5, color: C.tx2 }}>+{fmtGap(gap.gapS)} vs record ({raceShortName(gap.record)})</span>}
              {vsPlan != null && (
                <span style={{ fontSize: 12.5, color: vsPlan <= 0 ? C.g : C.o }}>
                  {Math.round(vsPlan) === 0 ? "Pile sur ton objectif" : `${fmtDuration(vsPlan)} ${vsPlan < 0 ? "sous" : "au-dessus de"} ton objectif`}
                </span>
              )}
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
            <div style={{ fontSize: 12, color: C.tx2 }}>{division}</div>
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
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          {onEdit && <button type="button" onClick={() => onEdit(race)} style={buttonStyle()}><Pencil size={14} /> Modifier</button>}
          {onDelete && (confirmDelete
            ? <>
                <button type="button" onClick={() => setConfirmDelete(false)} style={buttonStyle()}>Annuler</button>
                <button type="button" onClick={() => onDelete(race)} style={{ ...buttonStyle(), color: C.r, borderColor: C.r }}><Trash2 size={14} /> Confirmer la suppression</button>
              </>
            : <button type="button" onClick={() => setConfirmDelete(true)} style={buttonStyle()} aria-label="Supprimer la course"><Trash2 size={14} /></button>)}
          <button type="button" onClick={() => setTab(tab === "partager" ? "course" : "partager")}
            style={buttonStyle()} aria-pressed={tab === "partager"}>
            <Share2 size={14} /> Partager
          </button>
        </div>
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
          : totalPct != null && <Stat bare label="Position" value={`Top ${totalPct} %`} sub={division} />}
        {vsPlan != null && planTotalS != null && (
          <Stat bare label="Vs plan de course" value={Math.round(vsPlan) === 0 ? "0" : `${vsPlan > 0 ? "+" : "−"}${fmtGap(vsPlan)}`}
            color={vsPlan > 0 ? C.o : C.g} sub={`plan ${fmtClock(planTotalS)}`} />
        )}
        {profile && <Stat bare label="Profil" value={PROFILE_LABEL[profile]} sub={profileSub} />}
      </div>
      {refs.length > 0 && (
        <RaceCategoryCard totalS={race.total_s} own={ownCategory} value={refDiv} onChange={(c) => setCategoryChoice(c === ownCategory ? null : c)} refs={refLookup} />
      )}
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
          refOf={refOf} posOf={posOf} levelP50={refs.length ? median : null} totalS={race.total_s} totalRef={totalRef} timeSource={timeSource} division={division} bracketText={bracketText}
          compare={{
            kind: compareKind, onChange: setCompareChoice, target, plan: planSegs ? planOf : null, alerts: raceAlerts(race),
            options: ([["previous", prev ? `Course précédente · ${raceShortName(prev)}` : "Course précédente"], ["plan", "Plan de course"], ["median", `Médiane ${division} ${bracketText}`]] as const)
              .map(([key, label]) => ({ key, label, available: compareAvailable(key, compareSrc) })),
          }}
          levers={levers} athleteId={race.athlete_id} atLevel={atLevel.length} />
      )}
      {tab === "runs" && (
        <RaceRunsTab analysis={analysis} median={median} levelP50={refs.length ? median : null} attribution={attribution} timeSource={timeSource} evolution={evolution} raceId={race.id} />
      )}
      {tab === "gains" && (
        <RaceGainsTab gains={gains} atLevel={atLevel} division={division} bracketText={bracketText} timeSource={timeSource} startLabel={raceShortName(race)} />
      )}
      {tab === "gains" && phone && refs.length > 0 && (
        <RaceCategoryCard totalS={race.total_s} own={ownCategory} value={refDiv} onChange={(c) => setCategoryChoice(c === ownCategory ? null : c)} refs={refLookup} />
      )}
      {tab === "gains" && !coach && <TalkToCoach race={race} coachFirstName={coaches?.referent?.full_name?.split(" ")[0] ?? null} />}
      {tab !== "partager" && <RaceComments race={race} />}
      {tab === "partager" && (
        <RaceShareTab race={race} analysis={analysis} division={division} isRecord={isRecord}
          coachName={coaches?.referent?.full_name ?? null} attribution={attribution}
          hr={stream?.hr ? stream.t.flatMap((t, i) => (t >= offset && t <= offset + race.total_s && i % 10 === 0 ? [stream.hr![i]] : [])) : null} />
      )}
    </div>
  );
}
