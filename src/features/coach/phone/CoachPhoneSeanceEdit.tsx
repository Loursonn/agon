import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR, blocColor } from "@/lib/peps";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { useUpdateProgrammation } from "@/features/coach/components/programmation/hooks/useUpdateProgrammation";
import { ExerciceSearch } from "@/features/coach/components/programmation/ExerciceSearch";
import {
  defaultExerciceParams, type Bloc, type Exercice, type ExerciceParams, type ParamValue, type ProgSession,
} from "@/features/coach/components/programmation/types";
import { useCoachSessionOverride } from "@/features/shared/hooks/useCoachSessionOverride";
import type { SessionSetLog } from "@/features/shared/types/athlete";
import { formatExercice } from "@/features/staff/lib/formatPrescription";
import { isWeekRecord } from "@/lib/sessionOccurrence";
import { CARD, KICKER, MONO, PhoneButton, PhonePage, fmtDec, rowLine, shortDate } from "./phoneUi";
import { useCurrentCycle } from "./CoachPhoneAthleteHeader";
import { applyFromOccurrence, flattenBlocs, useSessionOccurrence } from "./useSessionOccurrence";

type Mode = "this" | "next";
type Focus = { bi: number; ei: number };

const isFlat = (p: Exercice["params"] | null | undefined): p is ExerciceParams => !!p && !isWeekRecord(p);
const globalOf = <T,>(pv: ParamValue<T> | undefined): T | undefined => (pv && pv.mode === "global" ? pv.value : undefined);
const parseMmSs = (s: string): { m: number; s: number } | null => {
  const m = s.trim().match(/^(\d{1,2})(?:[:'’](\d{1,2}))?$/);
  if (!m) return null;
  return { m: Number(m[1]), s: Number(m[2] ?? 0) };
};

function Stepper({ label, value, onMinus, onPlus, disabled }: {
  label: string; value: string; onMinus: () => void; onPlus: () => void; disabled?: boolean;
}) {
  const btn: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 9, border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx,
    fontSize: 18, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1, flex: "none",
  };
  return (
    <div style={{ padding: "8px 10px", borderRadius: 12, background: C.bg, border: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 11.5, color: C.tx3 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button type="button" aria-label={`${label} moins`} disabled={disabled} onClick={onMinus} style={btn}>−</button>
        <span style={{ ...MONO, fontSize: 16, flex: 1, textAlign: "center", whiteSpace: "nowrap" }}>{value}</span>
        <button type="button" aria-label={`${label} plus`} disabled={disabled} onClick={onPlus} style={btn}>+</button>
      </div>
    </div>
  );
}

/**
 * « Modifier une séance » sur téléphone (planche CoachPhoneSeanceEdit).
 * Deux portées : « Cette séance » (adaptation du seul jour, posée sur le
 * workout_log, les autres semaines intactes) ou « Cette séance et les
 * suivantes » (programme de l'athlète à partir de cette occurrence, le passé
 * intact). Steppers séries / reps / charge / RIR, tempo, repos, rappel du
 * réalisé précédent, remplacer, + exercice, + bloc.
 */
export default function CoachPhoneSeanceEdit({ sessionId, date }: { sessionId: string; date: string | null }) {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const { athleteProfile } = useAthleteContext();
  const first = (athleteProfile?.first_name || athleteProfile?.full_name?.split(" ")[0] || "L’athlète").trim();
  const { data: prog, isLoading: loadingProg } = useProgrammation(athleteId);
  const session = prog?.find((s) => s.id === sessionId) ?? null;
  const occ = useSessionOccurrence(athleteId, sessionId, date);
  const { log, occurrence, override } = occ;
  const day = log?.scheduledDate ?? date;
  const { weeks, weekIndex } = useCurrentCycle(athleteId, day ?? undefined);
  const saveProg = useUpdateProgrammation(athleteId);
  const saveOverride = useCoachSessionOverride();

  const [mode, setMode] = useState<Mode>("this");
  const [draft, setDraft] = useState<Bloc[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [focus, setFocus] = useState<Focus>({ bi: 0, ei: 0 });
  const [search, setSearch] = useState<null | { kind: "replace" } | { kind: "add"; bi: number }>(null);
  const [newBlocs, setNewBlocs] = useState<Set<string>>(new Set());

  // Point de départ : l'adaptation du jour (portée « cette séance »), sinon
  // le programme résolu pour cette occurrence.
  const ready = !!session && !occ.isLoading;
  useEffect(() => {
    if (!ready || dirty) return;
    const m: Mode = log ? mode : "next";
    if (m !== mode) setMode(m);
    setDraft(m === "this" && override ? structuredClone(override.blocs as Bloc[]) : flattenBlocs(session!.blocs, occurrence));
  }, [ready, mode, log, override, occurrence, session, dirty]);

  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(`/coach/athletes/${athleteId}/programmation`, { replace: true });
  }

  function update(fn: (blocs: Bloc[]) => Bloc[]) {
    setDraft((d) => (d ? fn(structuredClone(d)) : d));
    setDirty(true);
  }
  function patchParams(fn: (p: ExerciceParams) => void) {
    update((blocs) => {
      const ex = blocs[focus.bi]?.exercices[focus.ei];
      if (ex && isFlat(ex.params)) fn(ex.params);
      return blocs;
    });
  }

  const cur = draft?.[focus.bi]?.exercices[focus.ei] ?? null;
  const curBloc = draft?.[focus.bi] ?? null;
  const p = cur && isFlat(cur.params) && cur.mode !== "libre" ? cur.params : null;

  // Réalisé de l'occurrence précédente pour l'exercice affiché.
  const prevLine = useMemo(() => {
    if (!cur) return null;
    const prevLog = occ.getLogForWeek(occurrence - 1);
    const sets = (prevLog?.athleteModifications?.sessionSets?.[cur.id] ?? []) as SessionSetLog[];
    const done = sets.filter((s) => s.done && !s.skipped);
    if (!done.length) return null;
    const best = done.reduce((a, b) => ((b.kg ?? -1) > (a.kg ?? -1) ? b : a));
    const rirs = done.map((s) => s.rir).filter((r): r is number => r != null);
    const rir = rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null;
    const charge = p && p.charge_unit === "kg" ? globalOf(p.charge) : undefined;
    const delta = best.kg != null && charge != null ? charge - best.kg : null;
    return [
      best.kg != null ? `${fmtDec(best.kg, 1)} kg × ${best.reps ?? "—"}` : `${done.length} séries`,
      rir != null ? `RIR ${fmtDec(rir, 1)}` : null,
      delta ? `${delta > 0 ? "+" : "−"}${fmtDec(Math.abs(delta), 1)} kg` : null,
    ].filter(Boolean).join(" · ");
  }, [cur, occ, occurrence, p]);

  if (loadingProg || occ.isLoading) return <PhonePage style={{ paddingTop: 18 }}><div style={{ color: C.tx3, fontSize: 13 }}>Chargement…</div></PhonePage>;
  if (!session) {
    return (
      <PhonePage gap={12} style={{ paddingTop: 18 }}>
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Cette séance n’est plus dans son programme.</div>
        <PhoneButton onClick={goBack}>Retour</PhoneButton>
      </PhonePage>
    );
  }

  // ── Valeurs affichées ──────────────────────────────────────────────────────
  const reps = p ? globalOf(p.reps) : undefined;
  const repsMax = p ? globalOf(p.reps_max) : undefined;
  const charge = p ? globalOf(p.charge) : undefined;
  const rir = p ? globalOf(p.rir) : undefined;
  const tempo = p ? globalOf(p.tempo) ?? "" : "";
  const perSet = !!p && [p.reps, p.charge, p.rir].some((v) => v?.mode === "par_serie");
  const unit = p?.charge_unit === "%RM" ? "%" : "kg";
  const repos = curBloc && curBloc.timing_mode === "repos"
    ? `${curBloc.timing_repos_min ?? 0}:${String(curBloc.timing_repos_sec ?? 0).padStart(2, "0")}` : "";

  function step<K extends "reps" | "charge" | "rir">(key: K, delta: number, start: number, min: number, max = Infinity) {
    patchParams((pp) => {
      const pv = pp[key] as ParamValue<number | null>;
      if (pv.mode !== "global") return;
      const v = pv.value == null ? start : Math.min(max, Math.max(min, Math.round((pv.value + delta) * 10) / 10));
      (pp as unknown as Record<K, ParamValue<number | null>>)[key] = { mode: "global", value: v };
      if (key === "reps" && pp.reps_max?.mode === "global" && pp.reps_max.value != null) {
        pp.reps_max = { mode: "global", value: Math.max(v + 1, pp.reps_max.value + delta) };
      }
    });
  }

  function pickExercise(x: { id: string; name: string }) {
    if (!search) return;
    if (search.kind === "replace") {
      update((blocs) => {
        const ex = blocs[focus.bi]?.exercices[focus.ei];
        if (ex) { ex.exercise_id = x.id; ex.exercise_name = x.name; delete ex.muscles; }
        return blocs;
      });
    } else {
      const bi = search.bi;
      const id = crypto.randomUUID();
      update((blocs) => {
        const b = blocs[bi];
        if (b) b.exercices.push({
          id, exercise_id: x.id, exercise_name: x.name, mode: "classique",
          sort_order: b.exercices.length, params: defaultExerciceParams(3),
        });
        return blocs;
      });
      setFocus({ bi, ei: draft?.[bi]?.exercices.length ?? 0 });
    }
    setSearch(null);
  }

  function addBloc() {
    const id = crypto.randomUUID();
    const bi = draft?.length ?? 0;
    update((blocs) => [...blocs, {
      id, name: `Bloc ${blocs.length + 1}`, series_mode: "libre", timing_mode: "libre", exercices: [], sort_order: blocs.length,
    }]);
    setNewBlocs((s) => new Set(s).add(id));
    setSearch({ kind: "add", bi });
  }

  function removeCurrent() {
    update((blocs) => {
      blocs[focus.bi]?.exercices.splice(focus.ei, 1);
      return blocs;
    });
    setFocus({ bi: 0, ei: 0 });
  }

  function save() {
    if (!draft || !session || !prog) return;
    const blocs = draft
      .filter((b) => b.exercices.length > 0 || !newBlocs.has(b.id))
      .map((b, i) => ({ ...b, sort_order: i, exercices: b.exercices.map((ex, j) => ({ ...ex, sort_order: j })) }));
    const done = () => { toast.success(`${first} voit la séance à jour tout de suite.`); goBack(); };
    if (mode === "this" && log) {
      saveOverride.mutate({
        workoutLogId: log.id, athleteId,
        override: { blocs, ...(override?.note ? { note: override.note } : {}), ...(override?.fiches?.length ? { fiches: override.fiches } : {}) },
      }, { onSuccess: done });
      return;
    }
    const next = applyFromOccurrence(session, blocs, occurrence);
    saveProg.mutate({ base: prog, next: prog.map((s) => (s.id === session.id ? next : s)) }, { onSuccess: done });
  }

  const pending = saveProg.isPending || saveOverride.isPending;
  const seg = (m: Mode, label: string, disabled = false) => (
    <button type="button" aria-pressed={mode === m} disabled={disabled} onClick={() => { if (m !== mode) { setDirty(false); setMode(m); } }} style={{
      flex: 1, height: 36, borderRadius: 9, border: "none", fontFamily: "inherit", fontSize: 13, cursor: disabled ? "default" : "pointer",
      background: mode === m ? C.s2 : "transparent", color: mode === m ? C.tx : C.tx3, fontWeight: mode === m ? 500 : 400, opacity: disabled ? 0.4 : 1,
    }}>{label}</button>
  );
  const others = (draft ?? []).flatMap((b, bi) => b.exercices.map((ex, ei) => ({ ex, bi, ei }))).filter((x) => !(x.bi === focus.bi && x.ei === focus.ei));
  const col = curBloc ? blocColor(curBloc.color, focus.bi) : C.ac;
  const input: React.CSSProperties = {
    height: 38, padding: "0 10px", borderRadius: 9, border: `1px solid ${C.brdL}`, background: C.bg, color: C.tx,
    ...MONO, fontSize: 16, width: "100%", boxSizing: "border-box",
  };

  return (
    <PhonePage gap={12} style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, color: C.tx2 }}>{athleteProfile?.full_name ?? first}{day ? ` · ${shortDate(day).toLowerCase()}` : ""}</span>
        <button type="button" onClick={goBack} style={{ background: "none", border: "none", color: C.ac, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", padding: 4 }}>Annuler</button>
      </div>
      <div>
        <div style={{ ...KICKER, color: TYPE_COLOR.muscu }}>Musculation{weekIndex ? ` · S${weekIndex} / ${weeks.length}` : ""} · séance n° {occurrence}</div>
        <div style={{ fontSize: 19, fontWeight: 500, marginTop: 2 }}>{session.name}</div>
      </div>

      <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 11, background: C.s1, border: `1px solid ${C.brd}` }}>
        {seg("this", "Cette séance", !log)}
        {seg("next", "Celle-ci et les suivantes")}
      </div>
      <div style={{ fontSize: 11.5, color: C.tx3, marginTop: -6 }}>
        {mode === "this"
          ? "Adaptation de ce jour seulement : les autres semaines ne changent pas."
          : !log && date
            ? "Séance pas encore créée dans son planning : la modification vaut pour son programme à partir de cette séance."
            : `Son programme change à partir de la séance n° ${occurrence} ; les séances passées restent telles quelles.`}
      </div>

      {search && (
        <div style={{ ...CARD, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...KICKER, color: C.tx2 }}>{search.kind === "replace" ? "Remplacer par" : "Ajouter un exercice"}</span>
          <ExerciceSearch value="" onSelect={pickExercise} onClose={() => setSearch(null)} />
          <button type="button" onClick={() => setSearch(null)} style={{ alignSelf: "flex-end", background: "none", border: "none", color: C.tx3, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>Fermer</button>
        </div>
      )}

      {draft && draft.every((b) => b.exercices.length === 0) && !search && (
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx2 }}>Séance vide : ajoute un premier exercice.</div>
      )}

      {cur && curBloc && (
        <div style={{ ...CARD, padding: 14, display: "flex", flexDirection: "column", gap: 10, borderColor: alpha(col, 0.45) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ ...KICKER, color: col }}>{curBloc.category ?? curBloc.name} · {focus.ei + 1}</span>
            <button type="button" onClick={() => setSearch({ kind: "replace" })} style={{ background: "none", border: "none", color: C.ac, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Remplacer</button>
          </div>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{cur.exercise_name}</div>
          {p ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                <Stepper label="Séries" value={String(p.nb_series)} onMinus={() => patchParams((pp) => { pp.nb_series = Math.max(1, pp.nb_series - 1); })} onPlus={() => patchParams((pp) => { pp.nb_series += 1; })} />
                <Stepper label="Reps" value={reps == null ? "—" : repsMax != null ? `${reps}–${repsMax}` : String(reps)} disabled={p.reps.mode !== "global"} onMinus={() => step("reps", -1, 8, 1)} onPlus={() => step("reps", 1, 8, 1)} />
                <Stepper
                  label={p.charge_unit === "PDC" ? "Charge" : `Charge ± 2,5`}
                  value={p.charge_unit === "PDC" ? "PDC" : charge == null ? "—" : `${fmtDec(charge, 1)} ${unit}`}
                  disabled={p.charge_unit === "PDC" || p.charge.mode !== "global"}
                  onMinus={() => step("charge", -2.5, p.charge_unit === "%RM" ? 70 : 20, 0)}
                  onPlus={() => step("charge", 2.5, p.charge_unit === "%RM" ? 70 : 20, 0)}
                />
                <Stepper label="RIR" value={rir == null ? "—" : fmtDec(rir, 1)} disabled={p.rir.mode !== "global"} onMinus={() => step("rir", -1, 2, 0, 5)} onPlus={() => step("rir", 1, 2, 0, 5)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: 11.5, color: C.tx3, display: "flex", flexDirection: "column", gap: 4 }}>
                  Tempo
                  <input value={tempo} placeholder="3-1-X-0" disabled={p.tempo.mode !== "global"} onChange={(e) => { const v = e.target.value; patchParams((pp) => { pp.tempo = { mode: "global", value: v }; }); }} style={input} />
                </label>
                <label style={{ fontSize: 11.5, color: C.tx3, display: "flex", flexDirection: "column", gap: 4 }}>
                  Repos du bloc
                  <input
                    defaultValue={repos} placeholder="2:00" inputMode="numeric" key={`${curBloc.id}-${repos}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const t = v ? parseMmSs(v) : null;
                      if (v && !t) { toast.error("Repos : écris par exemple 2:00"); return; }
                      update((blocs) => {
                        const b = blocs[focus.bi];
                        if (!b) return blocs;
                        if (!t) { if (b.timing_mode === "repos") b.timing_mode = "libre"; return blocs; }
                        b.timing_mode = "repos"; b.timing_repos_min = t.m; b.timing_repos_sec = t.s;
                        return blocs;
                      });
                    }}
                    style={input}
                  />
                </label>
              </div>
              {perSet && <div style={{ fontSize: 11.5, color: C.tx3 }}>Valeurs différentes selon la série : à modifier sur ordinateur.</div>}
            </>
          ) : (
            <div style={{ fontSize: 12.5, color: C.tx2 }}>
              {cur.mode === "libre" ? cur.libre_text || "Consigne libre" : "Méthode : à modifier sur ordinateur."}
            </div>
          )}
          {prevLine && <div style={{ ...MONO, fontSize: 11.5, color: C.tx2 }}>Précédent : {prevLine}</div>}
          <button type="button" onClick={removeCurrent} style={{ alignSelf: "flex-start", background: "none", border: "none", color: C.r, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer", padding: 0 }}>Retirer l’exercice</button>
        </div>
      )}

      {others.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...KICKER, color: C.tx3 }}>Le reste de la séance</span>
          <div style={{ ...CARD, padding: "2px 14px" }}>
            {others.map(({ ex, bi, ei }, i) => {
              const line = formatExercice(ex, occurrence);
              return (
                <button key={ex.id} type="button" onClick={() => { setFocus({ bi, ei }); setSearch(null); }} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0", background: "none", border: "none",
                  boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
                }}>
                  <span aria-hidden style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: blocColor(draft?.[bi]?.color, bi) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5 }}>{line.name}</div>
                    {line.detail && <div style={{ ...MONO, fontSize: 11.5, color: C.tx2 }}>{line.detail}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <PhoneButton onClick={() => setSearch({ kind: "add", bi: draft?.length ? Math.min(focus.bi, draft.length - 1) : 0 })} disabled={!draft?.length}>+ Exercice</PhoneButton>
        <PhoneButton onClick={addBloc} disabled={!draft}>+ Bloc</PhoneButton>
      </div>
      <PhoneButton primary onClick={save} disabled={!draft || !dirty || pending}>{pending ? "Enregistrement…" : "Enregistrer"}</PhoneButton>
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>{first} voit la séance à jour tout de suite.</div>
    </PhonePage>
  );
}
