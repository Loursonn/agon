import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, FlaskConical, Gauge, UserRound } from "lucide-react";
import { toast } from "sonner";
import { completeTestSession, getTestSessionForFill, invalidateTests, type TestSessionFill } from "@/api/tests";
import { useAthleteTestResults } from "@/features/shared/hooks/tests/useAthleteTests";
import type { TestDefinitionWithVariables, TestVariable } from "@/features/shared/types/tests";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { localIsoDay } from "@shared/domain/dates";
import {
  TEST_GROUP_COLOR, TEST_GROUP_LABEL, buildTestValueCards, displayUnit, fmtTestDate, formatTestDelta, formatTestValue, testGroupOf,
  type TestValueCard,
} from "@/lib/athleteTestValues";
import { formatNumberFr, joinSeconds, parseNumberFr, recordOutcome, splitSeconds, type RecordOutcome } from "@/lib/testEntry";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { DateBox, FIELD_BOX, fmtLongDay } from "./DateBox";

interface Props {
  testId: string | null;
  athleteId: string;
  coachName?: string | null;
  onClose: () => void;
}

const PINK = TYPE_COLOR.test;
const LABEL: CSSProperties = { ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3, whiteSpace: "nowrap" };
/** Ressenti 1 → 5 : du rouge (très dur) au vert (facile), comme la planche. */
const FEEL_COLOR = ["#FF3B1F", "#FF7A45", "#FF9500", "#B6F03C", "#66F03C"];

/** Saisie en cours d'une valeur : texte (nombre) ou cases h / min / s. */
type Draft = { text: string; h: string; m: string; s: string; scale: number | null };
const emptyDraft: Draft = { text: "", h: "", m: "", s: "", scale: null };

function draftFrom(v: TestVariable, stored: number | null): Draft {
  if (stored == null) return emptyDraft;
  if (v.value_type === "pace" || v.value_type === "duration") return { ...emptyDraft, ...splitSeconds(stored) };
  if (v.value_type === "scale5") return { ...emptyDraft, scale: stored };
  return { ...emptyDraft, text: formatNumberFr(stored) };
}

function draftValue(v: TestVariable, d: Draft): number | null {
  if (v.value_type === "pace") return joinSeconds({ m: d.m, s: d.s });
  if (v.value_type === "duration") return joinSeconds({ h: d.h, m: d.m, s: d.s });
  if (v.value_type === "scale5") return d.scale;
  return parseNumberFr(d.text);
}

function Field({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 8 }}>
        <span style={LABEL}>{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Case chiffre (minutes, secondes…) : saute à la suivante quand elle est pleine. */
function DigitBox({ value, onChange, width, label, maxLen, size, next }: {
  value: string; onChange: (v: string) => void; width: number; label: string; maxLen: number; size: number; next?: RefObject<HTMLInputElement>;
}) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={value}
      placeholder="—"
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, maxLen);
        onChange(v);
        if (v.length === maxLen) next?.current?.focus();
      }}
      style={{ ...MONO, width, fontSize: size, lineHeight: 1, color: C.tx, background: "transparent", border: "none", outline: "none", padding: 0, textAlign: "center" }}
    />
  );
}

/** Une valeur du test, au format de sa variable (nombre, allure, durée, échelle 1 à 5). */
function ValueInput({ v, draft, onChange, big, readOnly }: { v: TestVariable; draft: Draft; onChange: (d: Draft) => void; big: boolean; readOnly: boolean }) {
  const secRef = useRef<HTMLInputElement>(null);
  const minRef = useRef<HTMLInputElement>(null);
  const size = big ? 46 : 28;
  const box: CSSProperties = {
    display: "flex", alignItems: "baseline", gap: 6, padding: big ? "12px 16px" : "10px 12px", borderRadius: 14,
    border: `1.5px solid ${PINK}`, background: alpha(PINK, 0.08), pointerEvents: readOnly ? "none" : undefined,
  };
  const unit = <span style={{ ...MONO, fontSize: big ? 14 : 12, color: C.tx3 }}>{displayUnit(v.unit, v.value_type)}</span>;

  if (v.value_type === "scale5") {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = draft.scale === n;
          return (
            <button key={n} type="button" disabled={readOnly} aria-pressed={on} onClick={() => onChange({ ...draft, scale: on ? null : n })}
              style={{ flex: 1, height: 42, borderRadius: 10, ...MONO, fontSize: 16, cursor: "pointer", border: `1px solid ${on ? PINK : alpha(C.tx, 0.18)}`, background: on ? PINK : C.s1, color: on ? C.bg : C.tx }}>
              {n}
            </button>
          );
        })}
      </div>
    );
  }
  if (v.value_type === "pace" || v.value_type === "duration") {
    const showH = v.value_type === "duration" && (draft.h !== "" || Number(draft.m) >= 60);
    return (
      <div style={box}>
        {showH && <>
          <DigitBox label={`${v.label} : heures`} value={draft.h} onChange={(h) => onChange({ ...draft, h })} width={size * 0.8} maxLen={2} size={size} next={minRef} />
          <span style={{ ...MONO, fontSize: size * 0.6, color: C.tx3 }}>h</span>
        </>}
        <input
          ref={minRef}
          aria-label={`${v.label} : minutes`}
          inputMode="numeric"
          value={draft.m}
          placeholder="—"
          onChange={(e) => {
            const m = e.target.value.replace(/\D/g, "").slice(0, 3);
            onChange({ ...draft, m });
            if (m.length >= 2) secRef.current?.focus();
          }}
          style={{ ...MONO, width: Math.max(1.2, draft.m.length || 1) * size * 0.62, fontSize: size, lineHeight: 1, color: C.tx, background: "transparent", border: "none", outline: "none", padding: 0, textAlign: "right" }}
        />
        <span style={{ ...MONO, fontSize: size * 0.8, color: C.tx3 }}>{v.value_type === "pace" ? "’" : ":"}</span>
        <input
          ref={secRef}
          aria-label={`${v.label} : secondes`}
          inputMode="numeric"
          value={draft.s}
          placeholder="—"
          onChange={(e) => onChange({ ...draft, s: e.target.value.replace(/\D/g, "").slice(0, 2) })}
          style={{ ...MONO, width: size * 1.3, fontSize: size, lineHeight: 1, color: C.tx, background: "transparent", border: "none", outline: "none", padding: 0 }}
        />
        <span style={{ flex: 1 }} />
        <span style={{ ...MONO, fontSize: big ? 14 : 12, color: C.tx3 }}>{v.value_type === "pace" ? "/km" : "min:s"}</span>
      </div>
    );
  }
  return (
    <div style={box}>
      <input
        aria-label={v.label}
        inputMode="decimal"
        value={draft.text}
        placeholder="—"
        onChange={(e) => onChange({ ...draft, text: e.target.value.replace(/[^\d.,]/g, "") })}
        style={{ ...MONO, flex: 1, minWidth: 0, fontSize: size, lineHeight: 1, color: C.tx, background: "transparent", border: "none", outline: "none", padding: 0 }}
      />
      {unit}
    </div>
  );
}

function recordText(card: TestValueCard | undefined): ReactNode {
  if (!card) return null;
  const unit = displayUnit(card.unit, card.valueType);
  return (
    <div style={{ fontSize: 12, color: C.tx3, marginTop: 6 }}>
      Ton record : <span style={{ ...MONO, color: C.tx2 }}>{formatTestValue(card.best.value, card.valueType)} {unit}</span> · {fmtTestDate(card.best.date, false)}
    </div>
  );
}

interface Saved {
  variable: TestVariable;
  value: number;
  date: string;
  outcome: RecordOutcome;
  variableId: string;
}

/**
 * « Saisir un résultat de test » (planche Ath1SaisirTest) : page plein écran
 * ouverte depuis « Test du jour » ou le Programme. Valeur(s) au bon format,
 * date du test, ressenti 1 à 5, un mot ; puis confirmation (record ou écart).
 */
export function TestEntryPage({ testId, athleteId, coachName, onClose }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [test, setTest] = useState<TestSessionFill | null>(null);
  const [definition, setDefinition] = useState<TestDefinitionWithVariables | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [feeling, setFeeling] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const { data: results = [] } = useAthleteTestResults(athleteId);
  const cards = useMemo(() => buildTestValueCards(results), [results]);

  useEffect(() => {
    setSaved(null);
    if (!testId) { setTest(null); setDefinition(null); setDrafts({}); setNote(""); setComment(""); setFeeling(null); setDate(""); return; }
    setLoading(true);
    let cancelled = false;
    getTestSessionForFill(testId)
      .then(({ session, definition: def }) => {
        if (cancelled) return;
        setTest(session);
        setDefinition(def);
        setDate(session?.date ?? localIsoDay());
        const structured = (session?.results_structured ?? {}) as { variables?: Record<string, unknown>; comment?: string; feeling?: number };
        const next: Record<string, Draft> = {};
        for (const v of def?.test_variables ?? []) {
          const raw = structured.variables?.[v.key];
          next[v.key] = draftFrom(v, raw == null || Number.isNaN(Number(raw)) ? null : Number(raw));
        }
        setDrafts(next);
        if (!def || def.test_variables.length === 0) setNote(session?.results_note ?? "");
        setComment(structured.comment ?? "");
        setFeeling(typeof structured.feeling === "number" ? structured.feeling : null);
      })
      .catch(() => { if (!cancelled) toast.error("Impossible de charger le test"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [testId]);

  useEffect(() => {
    if (!testId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [testId]);

  if (!testId) return null;

  const vars = definition?.test_variables ?? [];
  const coachFilled = definition?.fill_mode === "coach";
  const hasVariables = !coachFilled && vars.length > 0;
  const readOnly = !!test?.completed;
  const group = testGroupOf(definition ?? undefined);
  const groupColor = TEST_GROUP_COLOR[group];
  const first = vars[0];
  const cardOf = (v: TestVariable) => cards.find((c) => c.variableId === v.id);
  const filled = hasVariables ? vars.some((v) => draftValue(v, drafts[v.key] ?? emptyDraft) != null) : coachFilled || !!note.trim();
  const invalid = hasVariables && vars.some((v) => {
    const d = drafts[v.key] ?? emptyDraft;
    const touched = d.text || d.m || d.s || d.h;
    return !!touched && draftValue(v, d) == null;
  });
  const coach = coachName ?? "ton coach";

  async function submit() {
    if (!test || saving || !filled || invalid) return;
    setSaving(true);
    const structured: Record<string, unknown> = {};
    let resultsNote: string | null = null;
    if (hasVariables) {
      const map: Record<string, number | null> = {};
      const parts: string[] = [];
      for (const v of vars) {
        const n = draftValue(v, drafts[v.key] ?? emptyDraft);
        map[v.key] = n;
        if (n != null) parts.push(`${v.label}: ${formatTestValue(n, v.value_type)} ${displayUnit(v.unit, v.value_type)}`.trim());
      }
      structured.variables = map;
      resultsNote = parts.join(" · ") || null;
    } else {
      resultsNote = note.trim() || null;
    }
    if (comment.trim()) structured.comment = comment.trim();
    if (feeling) structured.feeling = feeling;
    try {
      await completeTestSession(test.id, {
        resultsNote,
        resultsStructured: Object.keys(structured).length > 0 ? structured : null,
        ...(date && date !== test.date ? { date } : {}),
      });
    } catch {
      setSaving(false);
      toast.error("Résultat non enregistré");
      return;
    }
    setSaving(false);
    void invalidateTests(qc, athleteId);
    const main = hasVariables ? vars.find((v) => draftValue(v, drafts[v.key] ?? emptyDraft) != null) : undefined;
    const value = main ? draftValue(main, drafts[main.key] ?? emptyDraft) : null;
    if (main && value != null) {
      const card = cardOf(main);
      setSaved({ variable: main, value, date, variableId: main.id, outcome: recordOutcome(value, card?.history ?? [], main.better_when, date) });
    } else {
      toast.success("Test enregistré");
      onClose();
    }
  }

  const shell = (body: ReactNode, footer: ReactNode) => (
    <div role="dialog" aria-modal="true" aria-label="Saisir un résultat de test" style={{ position: "fixed", inset: 0, zIndex: 200, background: C.bg, color: C.tx, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 150px", display: "flex", flexDirection: "column", gap: 13 }}>
        {body}
      </div>
      {footer && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", background: C.bg, borderTop: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 10 }}>
          {footer}
        </div>
      )}
    </div>
  );

  const header = (center: string, right: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" aria-label="Retour" onClick={onClose} style={{ width: 34, height: 34, boxSizing: "border-box", border: `1px solid ${alpha(C.tx, 0.18)}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", background: "transparent", color: C.tx, cursor: "pointer" }}>
        <ChevronLeft size={18} strokeWidth={1.75} />
      </button>
      <span style={{ flex: 1, textAlign: "center", ...LABEL, color: C.tx2 }}>{center}</span>
      <span style={{ width: 72, flex: "none", textAlign: "right", fontSize: 12.5, color: C.tx2, whiteSpace: "nowrap" }}>{right}</span>
    </div>
  );

  const primaryBtn = (label: string, onClick: () => void, disabled = false) => (
    <button type="button" disabled={disabled} onClick={onClick} style={{ height: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontWeight: 600, fontSize: 15, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1 }}>
      {label}
    </button>
  );

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (saved) {
    const { variable: v, value, outcome } = saved;
    const unit = displayUnit(v.unit, v.value_type);
    const tone = outcome.isRecord ? TYPE_COLOR.fait : C.tx;
    const isVma = /\bvma\b/i.test(`${definition?.name} ${v.label}`) && /km\/?h/i.test(v.unit);
    return shell(
      <>
        {header("Résultat enregistré", "")}
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12 }}>
          <span style={{ width: 84, height: 84, borderRadius: "50%", background: alpha(outcome.isRecord ? TYPE_COLOR.fait : C.tx, 0.14), border: `1.5px solid ${outcome.isRecord ? TYPE_COLOR.fait : alpha(C.tx, 0.3)}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Check size={36} color={outcome.isRecord ? TYPE_COLOR.fait : C.tx} strokeWidth={1.75} />
          </span>
          {outcome.isRecord && outcome.previousBest && (
            <span style={{ display: "inline-flex", alignItems: "center", height: 22, padding: "0 8px", borderRadius: 999, background: TYPE_COLOR.fait, color: C.bg, ...MONO, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>Nouveau record</span>
          )}
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <span style={{ ...MONO, fontSize: 64, lineHeight: 1, color: tone }}>{formatTestValue(value, v.value_type)}</span>
            <span style={{ ...MONO, fontSize: 15, color: C.tx3 }}>{unit}</span>
          </div>
          <div style={{ ...MONO, fontSize: 12.5, color: C.tx2 }}>{definition?.name ?? v.label} · {fmtLongDay(saved.date, true).toLowerCase()}</div>
          {outcome.previousBest && outcome.delta != null && (
            <div style={{ ...MONO, fontSize: 13, color: outcome.isRecord ? TYPE_COLOR.fait : C.tx2 }}>
              {formatTestDelta(outcome.delta, v.value_type)} {v.value_type === "number" ? unit : ""} vs {outcome.isRecord ? "" : "record du "}{fmtTestDate(outcome.previousBest.date, false)}
            </div>
          )}
        </div>
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12, padding: "0 6px" }}>
          <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.tx2, lineHeight: 1.45 }}>
            <UserRound size={16} color={C.tx3} strokeWidth={1.75} style={{ flex: "none", marginTop: 1 }} />
            <span>{coachName ? `${coachName} voit ton résultat.` : "Ton coach voit ton résultat."}</span>
          </div>
          {isVma && (
            <div style={{ display: "flex", gap: 10, fontSize: 13, color: C.tx2, lineHeight: 1.45 }}>
              <Gauge size={16} color={C.tx3} strokeWidth={1.75} style={{ flex: "none", marginTop: 1 }} />
              <span>Tes allures de course sont recalculées sur {formatNumberFr(value)} km/h.</span>
            </div>
          )}
        </div>
      </>,
      <>
        {primaryBtn("Voir le détail du test", () => { onClose(); navigate(`/athlete/test?valeur=${saved.variableId}`); })}
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: C.ac, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Retour à Aujourd’hui</button>
      </>,
    );
  }

  // ── Saisie ────────────────────────────────────────────────────────────────
  const planned = test ? fmtLongDay(test.date, false) : "";
  const unitText = first ? displayUnit(first.unit, first.value_type) : "";
  const betterText = first ? (first.better_when === "lower" ? "plus bas = mieux" : "plus haut = mieux") : "";
  return shell(
    <>
      {header(readOnly ? "Test fait" : "Test prévu", planned)}
      {loading || !test ? (
        <div style={{ fontSize: 13, color: C.tx3, marginTop: 20 }}>Chargement…</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: PINK, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <FlaskConical size={17} color={C.bg} strokeWidth={1.75} />
            </span>
            <h1 style={{ ...DISPLAY, margin: 0, fontSize: 26, fontWeight: 300, lineHeight: 1.1, minWidth: 0 }}>{test.title}</h1>
            {definition && (
              <span style={{ ...MONO, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", color: groupColor, border: `1px solid ${groupColor}`, borderRadius: 999, padding: "3px 9px" }}>{TEST_GROUP_LABEL[group]}</span>
            )}
          </div>
          <div style={{ fontSize: 12.5, color: C.tx2, marginTop: -6 }}>
            Prévu par {coach}{hasVariables && vars.length === 1 && unitText ? ` · ${unitText}` : ""}{hasVariables && vars.length === 1 ? ` · ${betterText}` : ""}
          </div>

          {(definition?.protocol?.text || test.description || definition?.description) && (
            <div style={{ padding: "12px 14px", borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...LABEL, color: C.tx2 }}>Protocole</span>
                {definition?.media_url && <a href={definition.media_url} target="_blank" rel="noreferrer" style={{ color: C.ac, fontSize: 12.5, textDecoration: "none" }}>Détail</a>}
              </div>
              <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {definition?.protocol?.text || test.description || definition?.description}
              </div>
            </div>
          )}

          {coachFilled ? (
            <div style={{ padding: "12px 14px", borderRadius: 14, border: `1px solid ${alpha(C.o, 0.4)}`, background: C.s1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.o, marginBottom: 4 }}>Rempli par ton coach</div>
              <div style={{ fontSize: 12.5, color: C.tx2, lineHeight: 1.5 }}>Fais le test : {coach} notera les valeurs. Valide quand c’est fait.</div>
            </div>
          ) : hasVariables ? (
            vars.length === 1 ? (
              <div>
                <div style={{ marginBottom: 6 }}><span style={LABEL}>Ta valeur · {first.label}</span></div>
                <ValueInput v={first} big readOnly={readOnly} draft={drafts[first.key] ?? emptyDraft} onChange={(d) => setDrafts((cur) => ({ ...cur, [first.key]: d }))} />
                {recordText(cardOf(first))}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: vars.length === 2 ? "1fr 1fr" : "1fr", gap: 10 }}>
                {vars.map((v) => (
                  <div key={v.id}>
                    <div style={{ marginBottom: 6 }}><span style={LABEL}>{v.label}</span></div>
                    <ValueInput v={v} big={false} readOnly={readOnly} draft={drafts[v.key] ?? emptyDraft} onChange={(d) => setDrafts((cur) => ({ ...cur, [v.key]: d }))} />
                    {recordText(cardOf(v))}
                  </div>
                ))}
              </div>
            )
          ) : (
            <Field label="Résultat">
              <textarea value={note} readOnly={readOnly} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ex : 1RM squat = 120 kg"
                style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${alpha(C.tx, 0.18)}`, background: C.s1, color: C.tx, fontSize: 15, fontFamily: "inherit", resize: "none", outline: "none" }} />
            </Field>
          )}
          {invalid && <div style={{ fontSize: 12, color: C.o }}>Vérifie la valeur : les secondes vont de 00 à 59.</div>}

          <Field label="Date du test">
            {readOnly ? <div style={FIELD_BOX}><span style={{ fontSize: 15 }}>{fmtLongDay(date, true)}</span></div>
              : <DateBox label="Date du test" value={date} max={localIsoDay()} onChange={setDate} withYear />}
          </Field>

          <Field label="Ressenti" right={<span style={{ fontSize: 11.5, color: C.tx3 }}>1 = très dur · 5 = facile</span>}>
            <div style={{ display: "flex", gap: 6 }}>
              {FEEL_COLOR.map((c, i) => {
                const n = i + 1;
                const on = feeling === n;
                return (
                  <button key={n} type="button" disabled={readOnly} aria-pressed={on} aria-label={`Ressenti ${n} sur 5`} onClick={() => setFeeling(on ? null : n)}
                    style={{ flex: 1, height: 42, borderRadius: 10, ...MONO, fontSize: 16, cursor: readOnly ? "default" : "pointer", background: on ? c : alpha(c, 0.08), color: on ? C.bg : c, border: `1px solid ${on ? c : alpha(c, 0.3)}` }}>
                    {n}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Commentaire · facultatif">
            <textarea value={comment} readOnly={readOnly} maxLength={1000} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Un mot pour ton coach"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 12, border: `1px solid ${alpha(C.tx, 0.18)}`, background: C.s1, color: C.tx, fontSize: 15, fontFamily: "inherit", resize: "none", outline: "none" }} />
          </Field>
        </>
      )}
    </>,
    !readOnly && test && !loading
      ? primaryBtn(saving ? "Enregistrement…" : coachFilled ? "C’est fait" : "Valider le résultat", () => void submit(), saving || !filled || invalid)
      : null,
  );
}
