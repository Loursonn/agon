import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { CARD, KICKER, LABEL, MONO, buttonStyle } from "@/features/shared/components/seance/seanceUi";
import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { STATION_PICTO, ddmm } from "@/features/shared/components/hyrox/raceAnalysisShared";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { useHyroxReferences, pickRef } from "@/features/shared/hooks/hyrox/useHyroxReferences";
import { useDeleteHyroxRacePlan, useHyroxRacePlans, useSaveHyroxRacePlan } from "@/features/shared/hooks/hyrox/useHyroxRacePlans";
import { competitionKeys, listCompetitions } from "@/api/competitions";
import {
  DIVISION_LABEL, SEGMENT_LABEL, type HyroxDivision, type HyroxRacePlan,
} from "@/features/shared/types/hyrox";
import { bracketOf, type RefLookup } from "@/lib/hyrox/calc";
import { bracketLabel } from "@/lib/hyrox/raceEvolution";
import {
  PLAN_SEGMENTS, parseClock, planFromTarget, planSegments, planTargets, planTotal, type PlanSegment, type PlanSegments,
} from "@/lib/hyrox/racePlan";
import { fmtClock } from "@/lib/seance";
import { localIsoDay } from "@shared/domain/dates";

const SOLO_DIVISIONS: HyroxDivision[] = ["women", "men", "women_pro", "men_pro"];

const segLabel = (k: PlanSegment) => (k === "roxzone_total" ? "Roxzone (total)" : SEGMENT_LABEL[k] ?? k);
const segPicto = (k: PlanSegment) => (k.startsWith("run_") ? "course" : k === "roxzone_total" ? "roxzone" : STATION_PICTO[k] ?? "autre");

/**
 * Onglet « Plan de course » (coach) : un chrono cible par compétition HYROX
 * (ou par course déjà saisie), réparti en 17 objectifs selon la médiane du
 * niveau visé, chacun modifiable. L'analyse de course le lit pour « Vs plan »,
 * la colonne Plan et « sous ton objectif » côté athlète.
 */
export default function RacePlanView() {
  const { athleteId } = useAthleteContext();
  const { data: plans = [], isLoading } = useHyroxRacePlans(athleteId);
  const { data: races = [] } = useHyroxResults(athleteId);
  const { data: competitions = [] } = useQuery({
    queryKey: competitionKeys.list(athleteId ?? ""),
    enabled: !!athleteId,
    queryFn: () => listCompetitions(athleteId as string),
  });
  const del = useDeleteHyroxRacePlan(athleteId ?? "");
  const [editing, setEditing] = useState<HyroxRacePlan | "new" | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const linkName = (p: HyroxRacePlan) => {
    const c = competitions.find((x) => x.id === p.competition_id);
    if (c) return `${c.name} · ${ddmm(c.date)}`;
    const r = races.find((x) => x.id === p.result_id);
    return r ? `${r.event_name} · ${ddmm(r.date)}` : "Sans course rattachée";
  };

  if (editing && athleteId) {
    return <PlanEditor athleteId={athleteId} plan={editing === "new" ? null : editing} competitions={competitions} races={races} onDone={() => setEditing(null)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={KICKER}><span style={{ color: C.ac }}>01 —</span> Plans de course</span>
        <button type="button" onClick={() => setEditing("new")} style={buttonStyle("primary")}><Plus size={14} /> Nouveau plan</button>
      </div>
      {isLoading ? (
        <div style={{ fontSize: 12, color: C.tx3 }}>Chargement…</div>
      ) : plans.length === 0 ? (
        <div style={{ ...CARD, padding: 18, fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>
          Aucun plan. Choisis une compétition HYROX et un chrono cible : Agon répartit les 17 objectifs (runs, stations, Roxzone) selon la médiane de ce niveau, tu ajustes ce que tu veux. L'analyse de la course compare ensuite le réalisé au plan.
        </div>
      ) : (
        <div style={{ ...CARD, overflow: "hidden" }}>
          {plans.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderTop: i ? `1px solid ${C.brd}` : "none", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>{linkName(p)} · {DIVISION_LABEL[p.division as HyroxDivision] ?? p.division}</div>
              </div>
              <span style={{ ...MONO, fontSize: 20 }}>{fmtClock(planTotal(planSegments(p.targets)))}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setEditing(p)} style={buttonStyle()}><Pencil size={14} /> Modifier</button>
                {confirm === p.id
                  ? <button type="button" onClick={() => del.mutate(p.id, { onSuccess: () => setConfirm(null) })} style={{ ...buttonStyle(), color: C.r, borderColor: C.r }}>Confirmer</button>
                  : <button type="button" onClick={() => setConfirm(p.id)} style={buttonStyle()} aria-label={`Supprimer ${p.name}`}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Target = { kind: "competition" | "result"; id: string; name: string } | null;

function PlanEditor({ athleteId, plan, competitions, races, onDone }: {
  athleteId: string;
  plan: HyroxRacePlan | null;
  competitions: Array<{ id: string; name: string; date: string; cancelled_at?: string | null }>;
  races: Array<{ id: string; event_name: string; date: string; division: string; total_s: number; competition_id: string | null }>;
  onDone: () => void;
}) {
  const { data: refs = [] } = useHyroxReferences();
  const save = useSaveHyroxRacePlan(athleteId);
  const refLookup: RefLookup = useMemo(() => (d, s, b) => pickRef(refs, d, s, b) ?? undefined, [refs]);
  const today = localIsoDay();
  const upcoming = competitions.filter((c) => !c.cancelled_at && c.date >= today)
    .sort((a, b) => (/hyrox/i.test(b.name) ? 1 : 0) - (/hyrox/i.test(a.name) ? 1 : 0) || (a.date < b.date ? -1 : 1));
  const options: Array<NonNullable<Target>> = [
    ...upcoming.map((c) => ({ kind: "competition" as const, id: c.id, name: `${c.name} · ${ddmm(c.date)}` })),
    ...races.map((r) => ({ kind: "result" as const, id: r.id, name: `Course saisie : ${r.event_name} · ${ddmm(r.date)}` })),
  ];
  const initialTarget: Target = plan
    ? options.find((o) => (plan.result_id ? o.kind === "result" && o.id === plan.result_id : o.kind === "competition" && o.id === plan.competition_id)) ?? null
    : options.find((o) => o.kind === "competition" && /hyrox/i.test(o.name)) ?? null;
  const lastRace = races[0];
  const [target, setTarget] = useState<Target>(initialTarget);
  const [name, setName] = useState(plan?.name ?? "");
  const [division, setDivision] = useState<HyroxDivision>((plan?.division ?? lastRace?.division ?? "women") as HyroxDivision);
  const [segs, setSegs] = useState<PlanSegments | null>(plan ? planSegments(plan.targets) : null);
  const [goalText, setGoalText] = useState(fmtClock(plan ? planTotal(planSegments(plan.targets)) : lastRace?.total_s ?? 4800));
  const [draft, setDraft] = useState<Partial<Record<PlanSegment, string>>>({});
  const goal = parseClock(goalText);

  const spread = () => {
    if (goal == null) return;
    setSegs(planFromTarget(goal, division, refLookup));
    setDraft({});
  };
  const editSeg = (k: PlanSegment, text: string) => {
    setDraft((d) => ({ ...d, [k]: text }));
    const v = parseClock(text);
    if (v != null && segs) setSegs({ ...segs, [k]: v });
  };
  const total = segs ? planTotal(segs) : null;
  const finalName = name.trim() || (target ? `Plan · ${target.name.replace(/^Course saisie : /, "")}` : "Plan de course");
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
    }, { onSuccess: onDone });
  };

  const input = { height: 36, borderRadius: 8, border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, padding: "0 10px", fontSize: 13, fontFamily: "inherit" } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 16, maxWidth: 860 }}>
      <span style={KICKER}><span style={{ color: C.ac }}>01 —</span> {plan ? "Modifier le plan" : "Nouveau plan de course"}</span>
      <div style={{ ...CARD, padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Pour</span>
          <select value={target ? `${target.kind}:${target.id}` : ""} style={input}
            onChange={(e) => setTarget(options.find((o) => `${o.kind}:${o.id}` === e.target.value) ?? null)}>
            <option value="">Sans course rattachée</option>
            {options.map((o) => <option key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id}`}>{o.name}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={finalName} style={input} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Division</span>
          <select value={division} onChange={(e) => setDivision(e.target.value as HyroxDivision)} style={input}>
            {SOLO_DIVISIONS.map((d) => <option key={d} value={d}>{DIVISION_LABEL[d]}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>Chrono cible</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="1:19:30" inputMode="numeric"
              aria-invalid={goal == null} style={{ ...input, ...MONO, flex: 1, minWidth: 0, borderColor: goal == null ? C.r : C.brdL }} />
            <button type="button" onClick={spread} disabled={goal == null} style={buttonStyle("ghost", goal == null)}>Répartir</button>
          </div>
        </label>
      </div>

      {segs ? (
        <div style={{ ...CARD, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={LABEL}>17 objectifs</span>
            <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>Total <span style={{ color: C.tx, fontSize: 18 }}>{fmtClock(total)}</span></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "6px 18px" }}>
            {PLAN_SEGMENTS.map((k) => {
              const text = draft[k] ?? fmtClock(segs[k]);
              const bad = parseClock(text) == null;
              return (
                <label key={k} style={{ display: "grid", gridTemplateColumns: "18px 1fr 76px", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <HyroxPicto station={segPicto(k)} size={15} color={k.startsWith("run_") ? C.tx2 : C.o} />
                  <span>{segLabel(k)}</span>
                  <input value={text} onChange={(e) => editSeg(k, e.target.value)} aria-label={`Objectif ${segLabel(k)}`} aria-invalid={bad}
                    style={{ ...input, ...MONO, height: 32, textAlign: "right", borderColor: bad ? C.r : C.brdL }} />
                </label>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: C.tx3 }}>
            Répartition au prorata de la médiane {DIVISION_LABEL[division]} · {bracketLabel(bracketOf(goal ?? total ?? 4800))} (références HYROX) ; chaque objectif reste modifiable, le total suit.
          </div>
        </div>
      ) : (
        <div style={{ ...CARD, padding: 16, fontSize: 13, color: C.tx2 }}>
          {refs.length ? "Saisis le chrono cible puis « Répartir » pour obtenir les 17 objectifs." : "Références HYROX en cours de chargement…"}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onDone} style={buttonStyle()}>Annuler</button>
        <button type="button" onClick={submit} disabled={!canSave} style={buttonStyle("primary", !canSave)}>Enregistrer le plan</button>
      </div>
    </div>
  );
}
