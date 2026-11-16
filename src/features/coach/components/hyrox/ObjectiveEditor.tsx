import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen, Minus, Plus, RotateCcw } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { STATION_PICTO, ddmm } from "@/features/shared/components/hyrox/raceAnalysisShared";
import { useSaveHyroxRacePlan } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { useHyroxSeasonGoals } from "@/features/shared/hooks/hyrox/useHyroxSeasonGoals";
import { useHyroxAnalyses } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { SEGMENT_LABEL, type HyroxRacePlan, type HyroxResult } from "@/features/shared/types/hyrox";
import { raceCategory } from "@/lib/hyrox/categories";
import { OBJECTIVE_GRID_VERSION } from "@/lib/hyrox/objective/gridData";
import { editTarget, objectiveForTotal, objectiveFromRun, runRange } from "@/lib/hyrox/objective/model";
import { proposeRun } from "@/lib/hyrox/objective/proposal";
import { PLAN_SEGMENTS, parseClock, planSegments, planTargets, planTotal, type PlanSegment, type PlanSegments } from "@/lib/hyrox/racePlan";
import { seasonOf } from "@/lib/hyrox/season";
import { fmtClock } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";
import { INPUT, OBJECTIVE_CATEGORIES, categoryLabel, runText } from "./objectiveUi";

const segLabel = (k: PlanSegment) => (k === "roxzone_total" ? "Roxzone (total)" : SEGMENT_LABEL[k] ?? k);
const segPicto = (k: PlanSegment) => (k.startsWith("run_") ? "course" : k === "roxzone_total" ? "roxzone" : STATION_PICTO[k] ?? "autre");
/** Pas du curseur de run moyen (s/km). */
const RUN_STEP = 5;

type Target = { kind: "competition" | "result"; id: string; name: string; date: string } | null;

/**
 * Objectif d'une course (docs/HYROX_OBJECTIF_CONCEPTION.md §2.5-2.6, §8.3) :
 * on choisit le run moyen (proposé : plan, objectif de saison, dernière course
 * ou bilan de tests) ou un chrono visé ; la grille donne les 17 cibles. Chaque
 * cible se modifie ; chrono verrouillé, la différence se répartit sur les
 * cibles non modifiées. « Revenir au modèle » remet les 17 cibles calculées.
 */
export default function ObjectiveEditor({ athleteId, plan, competitions, races, onDone }: {
  athleteId: string;
  plan: HyroxRacePlan | null;
  competitions: Array<{ id: string; name: string; date: string; cancelled_at?: string | null }>;
  races: HyroxResult[];
  onDone: () => void;
}) {
  const save = useSaveHyroxRacePlan(athleteId);
  const { data: goals, isSuccess: goalsReady } = useHyroxSeasonGoals(athleteId);
  const { data: analyses, isSuccess: testsReady } = useHyroxAnalyses(athleteId);
  const today = localIsoDay();
  const upcoming = competitions.filter((c) => !c.cancelled_at && c.date >= today)
    .sort((a, b) => (/hyrox/i.test(b.name) ? 1 : 0) - (/hyrox/i.test(a.name) ? 1 : 0) || (a.date < b.date ? -1 : 1));
  const options: Array<NonNullable<Target>> = [
    ...upcoming.map((c) => ({ kind: "competition" as const, id: c.id, name: `${c.name} · ${ddmm(c.date)}`, date: c.date })),
    ...races.map((r) => ({ kind: "result" as const, id: r.id, name: `Course saisie : ${r.event_name} · ${ddmm(r.date)}`, date: r.date })),
  ];
  const initialTarget: Target = plan
    ? options.find((o) => (plan.result_id ? o.kind === "result" && o.id === plan.result_id : o.kind === "competition" && o.id === plan.competition_id)) ?? null
    : options.find((o) => o.kind === "competition" && /hyrox/i.test(o.name)) ?? null;
  const lastRace = races.find((r) => r.status === "finished");
  const [target, setTarget] = useState<Target>(initialTarget);
  const [name, setName] = useState(plan?.name ?? "");
  const [division, setDivision] = useState<string>(plan?.division ?? (lastRace ? raceCategory(lastRace) : "women"));
  const planSegs = plan ? planSegments(plan.targets) : null;
  const [runS, setRunS] = useState<number | null>(
    plan ? plan.run_avg_s ?? (planSegs ? objectiveForTotal(plan.division, planTotal(planSegs))?.runAvgS ?? null : null) : null,
  );
  const [runDraft, setRunDraft] = useState<string | null>(null);
  const [totalDraft, setTotalDraft] = useState("");
  const [segs, setSegs] = useState<PlanSegments | null>(planSegs);
  const [estimate, setEstimate] = useState(false);
  const [locked, setLocked] = useState(plan?.locked_total ?? true);
  const [frozen, setFrozen] = useState<ReadonlySet<PlanSegment>>(new Set());
  const [draft, setDraft] = useState<Partial<Record<PlanSegment, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const day = target?.date ?? today;
  const season = seasonOf(day);
  const seasonGoal = goals?.find((g) => g.season === season?.key && g.division === division) ?? null;
  const proposal = useMemo(
    () => proposeRun({ category: division, plan, seasonGoal, races, analyses: analyses ?? [], day }),
    [division, plan, seasonGoal, races, analyses, day],
  );

  const build = (run: number, div: string) => {
    const o = objectiveFromRun(div, run);
    if (!o) {
      const r = runRange(div);
      setError(r ? `Run moyen entre ${runText(r.min)} et ${runText(r.max)} /km pour ${categoryLabel(div)}.` : "Division hors du modèle.");
      return;
    }
    setError(null);
    setRunS(run);
    setRunDraft(null);
    setSegs(o.segments);
    setEstimate(o.estimate);
    setFrozen(new Set());
    setDraft({});
  };

  // Nouvel objectif : construit sur la proposition dès que les données sont là.
  const started = useRef(!!plan);
  useEffect(() => {
    if (started.current || !goalsReady || !testsReady) return;
    started.current = true;
    if (proposal) build(Math.round(proposal.runAvgS), division);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalsReady, testsReady, proposal]);

  const fromTotal = () => {
    const t = parseClock(totalDraft);
    const o = t != null ? objectiveForTotal(division, t) : null;
    if (!o) { setError("Chrono hors du modèle pour cette division."); return; }
    build(o.runAvgS, division);
    setSegs(o.segments);
    setTotalDraft("");
  };
  const commitSeg = (k: PlanSegment) => {
    const text = draft[k];
    if (text == null || !segs) return;
    const v = parseClock(text);
    setDraft((d) => { const n = { ...d }; delete n[k]; return n; });
    if (v == null || v === segs[k]) return;
    setSegs(editTarget(segs, k, v, { locked, frozen }));
    setFrozen(new Set([...frozen, k]));
  };

  const total = segs ? planTotal(segs) : null;
  const finalName = name.trim() || (target ? `Objectif · ${target.name.replace(/^Course saisie : /, "")}` : "Objectif de course");
  const canSave = !!segs && total != null && total > 0 && !save.isPending;
  const submit = () => {
    if (!segs || total == null) return;
    save.mutate({
      id: plan?.id,
      athlete_id: athleteId,
      competition_id: target?.kind === "competition" ? target.id : target?.kind === "result" ? races.find((r) => r.id === target.id)?.competition_id ?? null : null,
      result_id: target?.kind === "result" ? target.id : null,
      name: finalName,
      division,
      profile: plan?.profile ?? "hybrid",
      target_total_s: total,
      targets: planTargets(segs),
      notes: plan?.notes ?? null,
      run_avg_s: runS != null ? Math.round(runS) : null,
      model_version: runS != null ? OBJECTIVE_GRID_VERSION : plan?.model_version ?? null,
      locked_total: locked,
    }, { onSuccess: onDone });
  };

  const runShown = runDraft ?? (runS != null ? runText(runS) : "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16, maxWidth: 900 }}>
      <span style={KICKER}><span style={{ color: C.ac }}>02 —</span> {plan ? "Modifier l'objectif" : "Nouvel objectif de course"}</span>
      <div style={{ ...CARD, padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Pour</span>
          <select value={target ? `${target.kind}:${target.id}` : ""} style={INPUT}
            onChange={(e) => setTarget(options.find((o) => `${o.kind}:${o.id}` === e.target.value) ?? null)}>
            <option value="">Sans course rattachée</option>
            {options.map((o) => <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.name}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={finalName} style={INPUT} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Division</span>
          <select value={division} style={INPUT}
            onChange={(e) => { setDivision(e.target.value); if (runS != null) build(runS, e.target.value); }}>
            {OBJECTIVE_CATEGORIES.map((d) => <option key={d} value={d}>{categoryLabel(d)}</option>)}
          </select>
        </label>
      </div>

      <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={LABEL}>Run moyen (/km, hors Roxzone)</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button type="button" aria-label={`Run moyen −${RUN_STEP} s`} disabled={runS == null} onClick={() => runS != null && build(runS - RUN_STEP, division)} style={buttonStyle("ghost", runS == null)}><Minus size={14} /></button>
              <input value={runShown} onChange={(e) => setRunDraft(e.target.value)} placeholder="4:59" inputMode="numeric" aria-label="Run moyen"
                onBlur={() => { const v = runDraft != null ? parseClock(runDraft) : null; if (v != null) build(v, division); else setRunDraft(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                style={{ ...INPUT, ...MONO, width: 84, fontSize: 18, height: 42, textAlign: "center" }} />
              <button type="button" aria-label={`Run moyen +${RUN_STEP} s`} disabled={runS == null} onClick={() => runS != null && build(runS + RUN_STEP, division)} style={buttonStyle("ghost", runS == null)}><Plus size={14} /></button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={LABEL}>ou chrono visé</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={totalDraft} onChange={(e) => setTotalDraft(e.target.value)} placeholder="1:19:30" inputMode="numeric" aria-label="Chrono visé"
                onKeyDown={(e) => { if (e.key === "Enter") fromTotal(); }} style={{ ...INPUT, ...MONO, width: 110 }} />
              <button type="button" onClick={fromTotal} disabled={parseClock(totalDraft) == null} style={buttonStyle("ghost", parseClock(totalDraft) == null)}>Calculer</button>
            </div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <span style={LABEL}>Chrono de l'objectif</span>
            <div style={{ ...MONO, fontSize: 28, lineHeight: 1.1 }}>{total != null ? fmtClock(total) : "—"}</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: error ? C.r : C.tx2, lineHeight: 1.5 }}>
          {error ?? (proposal
            ? `Proposé : ${runText(proposal.runAvgS)} /km (${proposal.label}).`
            : plan && plan.run_avg_s == null ? "Objectif construit par chrono avant le modèle : run moyen équivalent." : "Aucune course ni bilan de tests pour proposer un run moyen : saisis-le.")}
          {estimate && !error ? " Estimé : run moyen hors des données mesurées (ou Pro en duo)." : ""}
        </div>
      </div>

      {segs ? (
        <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={LABEL}>17 cibles</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setLocked(!locked)} aria-pressed={locked} style={buttonStyle()}>
                {locked ? <Lock size={13} /> : <LockOpen size={13} />} {locked ? "Chrono verrouillé" : "Chrono libre"}
              </button>
              <button type="button" onClick={() => runS != null && build(runS, division)} disabled={runS == null} style={buttonStyle("ghost", runS == null)}>
                <RotateCcw size={13} /> Revenir au modèle
              </button>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "6px 18px" }}>
            {PLAN_SEGMENTS.map((k) => {
              const text = draft[k] ?? fmtClock(segs[k]);
              const bad = parseClock(text) == null;
              const edited = frozen.has(k);
              return (
                <label key={k} style={{ display: "grid", gridTemplateColumns: "18px 1fr 80px", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <HyroxPicto station={segPicto(k)} size={15} color={k.startsWith("run_") ? C.tx2 : C.o} />
                  <span>{segLabel(k)}{edited && <span style={{ color: C.ac }}> ·</span>}</span>
                  <input value={text} aria-label={`Cible ${segLabel(k)}`} aria-invalid={bad}
                    onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                    onBlur={() => commitSeg(k)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    style={{ ...INPUT, ...MONO, height: 32, textAlign: "right", borderColor: bad ? C.r : edited ? alpha(C.ac, 0.6) : C.brdL }} />
                </label>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: C.tx3, lineHeight: 1.5 }}>
            Modèle {OBJECTIVE_GRID_VERSION} : stations, Roxzone et forme des runs chez les athlètes de ce run moyen ({categoryLabel(division)}).
            {locked ? " Chrono verrouillé : une cible modifiée (·) est compensée sur les autres, au prorata." : " Chrono libre : une cible modifiée change le chrono."}
          </div>
        </div>
      ) : (
        <div style={{ ...CARD, padding: 16, fontSize: 13, color: C.tx2 }}>Saisis un run moyen ou un chrono visé pour obtenir les 17 cibles.</div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onDone} style={buttonStyle()}>Annuler</button>
        <button type="button" onClick={submit} disabled={!canSave} style={buttonStyle("primary", !canSave)}>Enregistrer l'objectif</button>
      </div>
    </div>
  );
}
