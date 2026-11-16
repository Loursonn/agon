import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, Pencil, Share2, Trash2 } from "lucide-react";
import { useIsPhone } from "@/hooks/useIsPhone";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, KICKER, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { useLinkRaceWatch, useRaceWatch } from "@/features/shared/hooks/hyrox/useRaceWatch";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
import { DIVISION_LABEL, STATION_KEYS, type HyroxDivision, type HyroxResult } from "@/features/shared/types/hyrox";
import { alerts as raceAlerts } from "@/lib/hyrox/calc";
import { useHyroxRacePlans } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { compareAvailable, compareTarget, defaultCompare, type CompareKind, type CompareSources } from "@/lib/hyrox/raceCompare";
import { previousRace, raceShortName, recordGap, runPaceEvolution } from "@/lib/hyrox/raceEvolution";
import {
  athleteFindings, compromisedFromTimes, crossRaceWithWatch, defaultRaceOffset, raceGains, roxzoneRecovery, timeAboveHr,
} from "@/lib/hyrox/raceWatch";
import { fmtClock } from "@/lib/seance";
import { ddmm, fmtGap, objectiveColor, objectiveText, type RaceAudience } from "./raceAnalysisShared";
import { RaceComments, TalkToCoach } from "./RaceComments";
import { Stat } from "./raceAnalysisUi";
import RaceCourseTab from "./RaceCourseTab";
import RaceStrategyTab from "./RaceStrategyTab";
import RaceRunsTab from "./RaceRunsTab";
import RaceShareTab from "./RaceShareTab";
import { CATEGORY_LABEL, raceCategory } from "@/lib/hyrox/categories";
import RaceDebriefView from "./RaceDebriefView";
import { fmtPace, previousComparable, raceDebrief, raceStrip } from "@/lib/hyrox/raceDebrief";
import { compareCandidates, compareRaces } from "@/lib/hyrox/raceComparison";
import RaceVersus from "./RaceVersus";
import RaceWatchLink from "./RaceWatchLink";
import { autoRaceOffset } from "@/lib/hyrox/watchAlign";
import { fmtNoReps, wallBallNoReps } from "@/lib/hyrox/noReps";
import { objectiveForRace } from "@/lib/hyrox/objective/forRace";
import { STATE_LABEL, objectiveLookup } from "@/lib/hyrox/objective/vsObjective";
import { raceStrategy } from "@/lib/hyrox/objective/strategy";
import { leverHints, leverViews, validatedRules } from "@/lib/hyrox/objective/levers";
import { useHyroxAnalyses } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { pickRef, useHyroxReferences } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import type { RefLookup } from "@/lib/hyrox/calc";
import { raceVerdict } from "@/lib/hyrox/verdict";
import { useAuth } from "@/hooks/useAuth";
import RaceVerdictView from "./RaceVerdictView";

/**
 * Analyse de course HYROX (planches HyroxAnaTel et HyroxAnaCoachOrdi) :
 * résultat officiel contre l'objectif de la course (plan de course, sinon
 * objectif construit sur le run du jour, docs/HYROX_OBJECTIF_CONCEPTION.md §4),
 * croisé avec la montre. Même écran pour l'athlète et le coach ; côté coach,
 * la frise ajoute allure et cadence, la montre passe en 02 et le tableau des
 * 17 segments est déplié. En tête, le verdict (lot 6) : « top X % » de la
 * catégorie, points forts et freins, marge ; la carte à partager est réservée
 * à l'athlète. Toutes les phrases sont des règles calculées (aucune IA).
 */

const TABS = [
  { key: "debrief", label: "Débrief" },
  { key: "course", label: "Course" },
  { key: "runs", label: "Runs" },
  { key: "strategie", label: "Stratégie" },
  { key: "comparer", label: "Comparer" },
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
  const phone = useIsPhone();
  // Téléphone : le débrief d'abord ; ordinateur : le débrief est au-dessus des onglets.
  const [tab, setTab] = useState<TabKey>(phone ? "debrief" : "course");
  // Montre : activité choisie et décalage réglés à la main, pas encore enregistrés.
  const [chosenActivity, setChosenActivity] = useState<string | null>(null);
  const [draftOffset, setDraftOffset] = useState<number | null>(null);
  const watch = useRaceWatch(race, chosenActivity);
  const linkWatch = useLinkRaceWatch(race);
  const { data: allRaces = [] } = useHyroxResults(race.athlete_id);
  const { data: coaches } = useAthleteCoaches(race.athlete_id);
  const { data: plans = [] } = useHyroxRacePlans(race.athlete_id);
  const coachAnalyses = useHyroxAnalyses(coach ? race.athlete_id : undefined);
  const { data: refRows = [] } = useHyroxReferences();
  const { profile } = useAuth();
  const [compareChoice, setCompareChoice] = useState<CompareKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [versusId, setVersusId] = useState<string | null>(null);

  const detail = watch.detail;
  const stream = detail?.stream ?? null;
  const autoOffset = useMemo(() => autoRaceOffset(stream, race), [stream, race]);
  // Décalage enregistré : seulement pour l'activité à laquelle il a été réglé.
  const savedOffset = race.watch_activity_id != null && watch.activityId === race.watch_activity_id ? race.watch_offset_s ?? null : null;
  const baseOffset = savedOffset ?? autoOffset?.offsetS ?? defaultRaceOffset(stream, race.total_s);
  const offset = draftOffset ?? baseOffset;
  const activityChanged = chosenActivity != null && chosenActivity !== race.watch_activity_id;
  const offsetEdited = draftOffset != null && draftOffset !== baseOffset;
  const saveWatch = () => {
    if (!watch.activityId || !stream) return;
    linkWatch.mutate({ activityId: watch.activityId, offsetS: offset }, { onSuccess: () => { setChosenActivity(null); setDraftOffset(null); } });
  };
  const unlinkWatch = () => linkWatch.mutate({ activityId: null, offsetS: null }, { onSuccess: () => { setChosenActivity(null); setDraftOffset(null); } });
  const sv = detail?.bounds?.kind === "three" ? detail.bounds.bounds : null;
  const sv1 = sv?.[0] ?? null;
  const sv2 = sv?.[1] ?? null;
  const attribution = stream ? detail?.attribution ?? null : null;

  const analysis = useMemo(() => crossRaceWithWatch(race, stream, offset), [race, stream, offset]);
  const ownCategory = raceCategory(race);
  // Objectif de la course : le plan s'il existe, sinon le run du jour.
  const ov = useMemo(() => objectiveForRace(race, plans), [race, plans]);
  const objSegs = ov?.objective.segments ?? null;
  const vsObj = ov?.vs ?? null;
  const objOf = useMemo(() => (objSegs ? objectiveLookup(objSegs) : () => null), [objSegs]);
  const objLevel = objSegs ? objOf : null;
  const objText = objectiveText(ov?.objective ?? null);
  // Constat Roxzone de l'athlète : écarts bruts à l'objectif.
  const gains = useMemo(() => (objSegs ? raceGains(race, objOf) : null), [race, objOf, objSegs]);
  const onObjective = (vsObj?.segments ?? []).filter((x) => (STATION_KEYS as readonly string[]).includes(x.key) && (x.state === "on" || x.state === "ahead")).length;
  const evolution = useMemo(() => runPaceEvolution(allRaces), [allRaces]);
  const above = analysis ? timeAboveHr(analysis, stream, sv2, offset) : null;
  const findings = analysis ? athleteFindings({ analysis, above, gains, sv2, levelP50: objLevel }) : [];
  const recov = analysis ? roxzoneRecovery(analysis, stream, offset) : null;
  // « Et avec une meilleure stratégie ? » : leviers contre l'objectif, proposition, axe du bilan (coach), indice montre.
  const strategy = useMemo(() => (objSegs ? raceStrategy(race, objSegs) : null), [race, objSegs]);
  const rules = useMemo(() => (coach ? validatedRules(coachAnalyses.data ?? [], race.date) : []), [coach, coachAnalyses.data, race.date]);
  const levers = useMemo(() => {
    if (!strategy) return [];
    const hints = leverHints({ strategy, analysis: stream ? analysis : null, stream, sv2, offset, roxzoneRecoveryBpm: recov?.avgDrop ?? null });
    return leverViews(strategy, rules, hints);
  }, [strategy, rules, stream, analysis, sv2, offset, recov?.avgDrop]);

  const refs: RefLookup = useMemo(() => (d, s, b) => pickRef(refRows, d, s, b) ?? undefined, [refRows]);
  const verdict = useMemo(
    () => raceVerdict({ race, refs, objective: vsObj?.total ?? null, strategy }),
    [race, refs, vsObj, strategy],
  );
  const verdictShown = !!(verdict.level || verdict.objective || verdict.margin);
  // Carte à partager : l'athlète seulement (Q3 du lot 6), avec son nom s'il regarde sa propre course.
  const canShare = !coach;
  const athleteName = profile?.id === race.athlete_id ? profile?.full_name ?? null : null;
  const openShare = () => setTab("partager");

  const best = allRaces
    .filter((r) => r.is_official && r.division === race.division && r.status === race.status)
    .reduce<number | null>((m, r) => (m == null || r.total_s < m ? r.total_s : m), null);
  const isRecord = race.is_official && best != null && race.total_s <= best;
  const gap = isRecord ? null : recordGap(race, allRaces);
  const prev = previousRace(race, allRaces);
  const previous = useMemo(() => {
    if (!prev) return null;
    const po = objectiveForRace(prev, plans);
    return { name: raceShortName(prev), compromised: compromisedFromTimes(prev, po ? objectiveLookup(po.objective.segments) : null) };
  }, [prev, plans]);
  const strip = useMemo(() => raceStrip(race, vsObj), [race, vsObj]);
  const debrief = useMemo(
    () => raceDebrief({ race, races: allRaces, objective: objSegs, vs: vsObj, isRecord }),
    [race, allRaces, objSegs, vsObj, isRecord],
  );
  const noReps = wallBallNoReps(race);
  const noRepsText = noReps ? `Wall balls ${race.wall_balls_s ? fmtClock(race.wall_balls_s) : "—"} · ${fmtNoReps(noReps)}` : null;
  const debriefView = (layout: "phone" | "desktop") => (
    <RaceDebriefView debrief={debrief} strip={strip} levers={levers} possibleS={strategy && levers.length ? strategy.possibleS : null}
      layout={layout} coach={coach} previousName={debrief.previous ? raceShortName(debrief.previous) : null} noReps={noRepsText} />
  );
  // « Comparer » : n'importe quelle autre course, par défaut la précédente du même format.
  const candidates = useMemo(() => compareCandidates(race, allRaces), [race, allRaces]);
  const versus = candidates.find((r) => r.id === versusId) ?? previousComparable(race, allRaces) ?? candidates[0] ?? null;
  const comparison = useMemo(() => (versus ? compareRaces(versus, race) : null), [versus, race]);
  const compareSrc: CompareSources = useMemo(() => ({ previous: prev, objective: objSegs }), [prev, objSegs]);
  const compareKind: CompareKind = compareChoice && compareAvailable(compareChoice, compareSrc) ? compareChoice : defaultCompare(compareSrc);
  const target = useMemo(() => compareTarget(compareKind, compareSrc), [compareKind, compareSrc]);

  const division = CATEGORY_LABEL[ownCategory] ?? DIVISION_LABEL[race.division as HyroxDivision] ?? race.division;
  const dateLabel = new Date(race.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  const timeSource = race.is_official ? "résultat officiel" : "temps saisis";
  const total = vsObj?.total ?? null;
  const totalColor = total ? (total.state === "on" ? C.tx2 : objectiveColor(total.state)) : C.tx2;
  const totalValue = total ? (total.deltaS === 0 ? "0" : `${total.deltaS > 0 ? "+" : "−"}${fmtGap(total.deltaS)}`) : null;
  const objSub = ov ? `${fmtClock(ov.objective.totalS)}${ov.objective.runAvgS != null ? ` · run ${fmtPace(ov.objective.runAvgS)}` : ""}${ov.objective.source === "run_du_jour" ? " · run du jour" : ""}` : "";
  // La place est dans le verdict quand il est affiché.
  const rank = !verdictShown && race.rank_overall != null && race.participants_overall ? { r: race.rank_overall, n: race.participants_overall } : null;

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

  const PPILL = { ...PILL, fontSize: 10.5, padding: "3px 8px" };
  const phoneHead = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button type="button" onClick={onBack} aria-label="Retour à la course"
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, color: C.tx2, fontSize: 13, cursor: "pointer", textAlign: "left" }}>
          <ChevronLeft size={16} /> HYROX · Courses
        </button>
        {canShare && (
        <button type="button" onClick={() => setTab(tab === "partager" ? "debrief" : "partager")} aria-pressed={tab === "partager"} aria-label="Partager ma course"
          style={{ width: 44, height: 44, flex: "none", borderRadius: 10, border: `1px solid ${tab === "partager" ? C.ac : C.brdL}`, background: tab === "partager" ? alpha(C.ac, 0.16) : "transparent", color: tab === "partager" ? C.ac : C.tx, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Share2 size={15} />
        </button>
        )}
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
          {(isRecord || gap || total) && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {isRecord
                ? <span style={{ ...PPILL, background: C.g, color: C.ink }}>Record</span>
                : gap && !total && <span style={{ fontSize: 12.5, color: C.tx2 }}>+{fmtGap(gap.gapS)} vs record ({raceShortName(gap.record)})</span>}
              {total && ov && (
                <span style={{ fontSize: 12.5, color: totalColor }}>
                  {total.state === "on" ? `Dans l'objectif (${fmtClock(total.targetS)})` : `${fmtGap(total.deltaS)} ${total.deltaS < 0 ? "sous" : "au-dessus de"} l'objectif (${fmtClock(total.targetS)})`}
                </span>
              )}
            </div>
          )}
        </div>
        {rank && (
          <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 3, paddingBottom: 2, flex: "none" }}>
            <span style={{ ...KICKER, fontSize: 11, color: C.tx3 }}>Rang</span>
            <div style={{ ...MONO, fontSize: 18, color: C.tx }}>{rank.r}<span style={{ color: C.tx3, fontSize: 13 }}> / {rank.n}</span></div>
            <div style={{ fontSize: 12, color: C.tx2 }}>Top {Math.max(1, Math.round((rank.r / rank.n) * 100))} %</div>
          </div>
        )}
      </div>
    </div>
  );
  const phoneTabs = (
    <div role="tablist" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, border: `1px solid ${C.brd}` }}>
      {TABS.map((t) => {
        const on = tab === t.key;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
            style={{
              ...MONO, flex: 1, minWidth: 0, height: 34, borderRadius: 8, border: "none", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase",
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
          {canShare && (
          <button type="button" onClick={() => setTab(tab === "partager" ? "course" : "partager")}
            style={tab === "partager" ? buttonStyle() : buttonStyle("primary")} aria-pressed={tab === "partager"}>
            <Share2 size={14} /> {tab === "partager" ? "Revenir à l'analyse" : "Partager ma course"}
          </button>
          )}
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
        {total && (
          <Stat bare label={`Vs objectif · ${STATE_LABEL[total.state]}`} value={totalValue ?? "—"} color={totalColor} sub={objSub} />
        )}
        {rank && <Stat bare label="Rang" value={String(rank.r)} unit={`/ ${rank.n}`} sub={`Top ${Math.max(1, Math.round((rank.r / rank.n) * 100))} %`} />}
      </div>
      {verdictShown && tab !== "partager" && <RaceVerdictView verdict={verdict} totalS={race.total_s} phone={false} />}
      {tab !== "partager" && debriefView("desktop")}
      </>}

      {phone && verdictShown && tab !== "partager" && (
        <RaceVerdictView verdict={verdict} totalS={race.total_s} phone onShare={canShare ? openShare : undefined} />
      )}
      {phone ? phoneTabs : (
      <div style={{ display: "flex", gap: 18, borderBottom: `1px solid ${C.brd}` }} role="tablist">
        {TABS.filter((t) => t.key !== "debrief").map((t) => {
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

      {tab === "debrief" && phone && debriefView("phone")}
      {tab === "debrief" && phone && !coach && <TalkToCoach race={race} coachFirstName={coaches?.referent?.full_name?.split(" ")[0] ?? null} />}
      {tab === "course" && (
        <RaceWatchLink race={race} candidates={watch.candidates} activityId={watch.activityId} linked={watch.linked} stream={stream}
          loading={watch.loading} auto={autoOffset} offset={offset} edited={offsetEdited || activityChanged}
          canSave={!!stream && (!watch.linked || offsetEdited || activityChanged)}
          onOffset={(s) => setDraftOffset(Math.round(s))}
          onPickActivity={(id) => { setChosenActivity(id === race.watch_activity_id ? null : id); setDraftOffset(null); }}
          onSave={saveWatch} onUnlink={unlinkWatch} saving={linkWatch.isPending} phone={phone} />
      )}
      {(tab === "course" || (tab === "debrief" && !phone)) && (
        <RaceCourseTab audience={audience} analysis={analysis} stream={stream} watchLoading={watch.loading} offset={offset}
          sv1={sv1} sv2={sv2} attribution={attribution} findings={findings} above={above} recov={recov} previous={previous}
          objective={objOf} vs={vsObj} levelP50={objLevel} totalS={race.total_s} timeSource={timeSource} objectiveText={objText}
          compare={{
            kind: compareKind, onChange: setCompareChoice, target, alerts: raceAlerts(race),
            options: ([["objective", ov?.objective.source === "plan" ? "Objectif · plan de course" : "Objectif · run du jour"], ["previous", prev ? `Course précédente · ${raceShortName(prev)}` : "Course précédente"]] as const)
              .map(([key, label]) => ({ key, label, available: compareAvailable(key, compareSrc) })),
          }}
          levers={coach && strategy ? levers : undefined} athleteId={race.athlete_id} onObjective={onObjective} />
      )}
      {tab === "runs" && (
        <RaceRunsTab analysis={analysis} objective={objOf} levelP50={objLevel} attribution={attribution} timeSource={timeSource} evolution={evolution} raceId={race.id} />
      )}
      {tab === "strategie" && (
        <RaceStrategyTab strategy={strategy} levers={levers} coach={coach} onObjective={onObjective} objectiveText={objText}
          timeSource={timeSource} startLabel={raceShortName(race)} watchLinked={!!stream} />
      )}
      {tab === "strategie" && !coach && <TalkToCoach race={race} coachFirstName={coaches?.referent?.full_name?.split(" ")[0] ?? null} />}
      {tab === "comparer" && (
        candidates.length === 0 || !comparison || !versus
          ? <div style={{ fontSize: 13, color: C.tx3 }}>Aucune autre course terminée à comparer pour l'instant.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, color: C.tx2 }}>
                Comparer à
                <select value={versus.id} onChange={(e) => setVersusId(e.target.value)} aria-label="Course à comparer"
                  style={{ height: 40, padding: "0 10px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, fontFamily: "inherit", fontSize: 13, flex: phone ? 1 : "none", minWidth: 0 }}>
                  {candidates.map((r) => (
                    <option key={r.id} value={r.id}>{r.event_name} · {ddmm(r.date)}.{r.date.slice(2, 4)} · {CATEGORY_LABEL[raceCategory(r)]} · {fmtClock(r.total_s)}</option>
                  ))}
                </select>
              </label>
              <RaceVersus cmp={comparison} phone={phone} currentId={race.id} />
            </div>
      )}
      {tab !== "partager" && tab !== "comparer" && <RaceComments race={race} />}
      {tab === "partager" && canShare && <RaceShareTab race={race} verdict={verdict} athleteName={athleteName} />}
    </div>
  );
}
