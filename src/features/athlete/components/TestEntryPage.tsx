import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, FlaskConical, Gauge, UserRound } from "lucide-react";
import { toast } from "sonner";
import { completeTestSession, getTestSessionForFill, invalidateTests, type TestSessionFill } from "@/api/tests";
import { useAthleteTestResults } from "@/features/shared/hooks/tests/useAthleteTests";
import type { TestDefinitionWithVariables, TestVariable } from "@/features/shared/types/tests";
import { cn } from "@/lib/utils";
import { localIsoDay } from "@shared/domain/dates";
import {
  TEST_GROUP_COLOR, TEST_GROUP_LABEL, buildTestValueCards, displayUnit, fmtTestDate, formatTestDelta, formatTestValue, testGroupOf,
  type TestValueCard,
} from "@/lib/athleteTestValues";
import { formatNumberFr, joinSeconds, parseNumberFr, recordOutcome, splitSeconds, type RecordOutcome } from "@/lib/testEntry";
import { DateBox } from "./DateBox";
import { fmtLongDay } from "./dateFormat";

interface Props {
  testId: string | null;
  athleteId: string;
  coachName?: string | null;
  onClose: () => void;
  /**
   * Page du détail d'une valeur après l'enregistrement. Par défaut celle de
   * l'athlète ; `null` (saisie par le coach) : pas de lien, « Retour » seul.
   */
  resultPath?: ((variableId: string) => string) | null;
}

/** Étiquette mono majuscule ; la couleur (tx3 ou tx2) est ajoutée à chaque usage. */
const LABEL = "agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em]";
/** Champ texte (résultat libre, commentaire). */
const TEXTAREA =
  "box-border w-full resize-none rounded-xl border border-agon-tx/[0.18] bg-agon-s1 px-3.5 py-3 text-[15px] text-agon-tx [font-family:inherit] [outline:none]";
/** Case chiffre sans cadre (minutes, secondes, nombre). */
const BARE_INPUT = "agon-mono border-none bg-transparent p-0 leading-none text-agon-tx [outline:none]";
/** Ressenti 1 → 5 : du rouge (très dur) au vert (facile), comme la planche. */
const FEEL_CLASS: Array<{ on: string; off: string }> = [
  { on: "border-agon-rouge bg-agon-rouge text-agon-bg", off: "border-agon-rouge/[0.3] bg-agon-rouge/[0.08] text-agon-rouge" },
  { on: "border-agon-bloc-core bg-agon-bloc-core text-agon-bg", off: "border-agon-bloc-core/[0.3] bg-agon-bloc-core/[0.08] text-agon-bloc-core" },
  { on: "border-agon-alerte bg-agon-alerte text-agon-bg", off: "border-agon-alerte/[0.3] bg-agon-alerte/[0.08] text-agon-alerte" },
  { on: "border-agon-accent bg-agon-accent text-agon-bg", off: "border-agon-accent/[0.3] bg-agon-accent/[0.08] text-agon-accent" },
  { on: "border-agon-succes bg-agon-succes text-agon-bg", off: "border-agon-succes/[0.3] bg-agon-succes/[0.08] text-agon-succes" },
];

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
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={cn(LABEL, "text-agon-tx3")}>{label}</span>
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
      className={cn(BARE_INPUT, "text-center")}
      style={{ width, fontSize: size }}
    />
  );
}

/** Une valeur du test, au format de sa variable (nombre, allure, durée, échelle 1 à 5). */
function ValueInput({ v, draft, onChange, big, readOnly }: { v: TestVariable; draft: Draft; onChange: (d: Draft) => void; big: boolean; readOnly: boolean }) {
  const secRef = useRef<HTMLInputElement>(null);
  const minRef = useRef<HTMLInputElement>(null);
  const size = big ? 46 : 28;
  const box = cn(
    "flex items-baseline gap-1.5 rounded-[14px] border-[1.5px] border-agon-type-test bg-agon-type-test/[0.08]",
    big ? "px-4 py-3" : "px-3 py-2.5",
    readOnly && "pointer-events-none",
  );
  const unitClass = cn("agon-mono text-agon-tx3", big ? "text-[14px]" : "text-[12px]");
  const unit = <span className={unitClass}>{displayUnit(v.unit, v.value_type)}</span>;

  if (v.value_type === "scale5") {
    return (
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = draft.scale === n;
          return (
            <button key={n} type="button" disabled={readOnly} aria-pressed={on} onClick={() => onChange({ ...draft, scale: on ? null : n })}
              className={cn(
                "agon-mono h-[42px] flex-1 cursor-pointer rounded-[10px] border text-[16px]",
                on ? "border-agon-type-test bg-agon-type-test text-agon-bg" : "border-agon-tx/[0.18] bg-agon-s1 text-agon-tx",
              )}>
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
      <div className={box}>
        {showH && <>
          <DigitBox label={`${v.label} : heures`} value={draft.h} onChange={(h) => onChange({ ...draft, h })} width={size * 0.8} maxLen={2} size={size} next={minRef} />
          <span className="agon-mono text-agon-tx3" style={{ fontSize: size * 0.6 }}>h</span>
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
          className={cn(BARE_INPUT, "text-right")}
          style={{ width: Math.max(1.2, draft.m.length || 1) * size * 0.62, fontSize: size }}
        />
        <span className="agon-mono text-agon-tx3" style={{ fontSize: size * 0.8 }}>{v.value_type === "pace" ? "’" : ":"}</span>
        <input
          ref={secRef}
          aria-label={`${v.label} : secondes`}
          inputMode="numeric"
          value={draft.s}
          placeholder="—"
          onChange={(e) => onChange({ ...draft, s: e.target.value.replace(/\D/g, "").slice(0, 2) })}
          className={BARE_INPUT}
          style={{ width: size * 1.3, fontSize: size }}
        />
        <span className="flex-1" />
        <span className={unitClass}>{v.value_type === "pace" ? "/km" : "min:s"}</span>
      </div>
    );
  }
  return (
    <div className={box}>
      <input
        aria-label={v.label}
        inputMode="decimal"
        value={draft.text}
        placeholder="—"
        onChange={(e) => onChange({ ...draft, text: e.target.value.replace(/[^\d.,]/g, "") })}
        className={cn(BARE_INPUT, "min-w-0 flex-1")}
        style={{ fontSize: size }}
      />
      {unit}
    </div>
  );
}

function recordText(card: TestValueCard | undefined): ReactNode {
  if (!card) return null;
  const unit = displayUnit(card.unit, card.valueType);
  return (
    <div className="mt-1.5 text-[12px] text-agon-tx3">
      Ton record : <span className="agon-mono text-agon-tx2">{formatTestValue(card.best.value, card.valueType)} {unit}</span> · {fmtTestDate(card.best.date, false)}
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
export function TestEntryPage({ testId, athleteId, coachName, onClose, resultPath = (id) => `/athlete/test?valeur=${id}` }: Props) {
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
    <div role="dialog" aria-modal="true" aria-label="Saisir un résultat de test" className="fixed inset-0 z-[200] flex flex-col bg-agon-bg text-agon-tx">
      <div className="flex flex-1 flex-col gap-[13px] overflow-y-auto px-5 pb-[150px] pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        {body}
      </div>
      {footer && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 border-t border-agon-brd bg-agon-bg px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3">
          {footer}
        </div>
      )}
    </div>
  );

  const header = (center: string, right: string) => (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Retour" onClick={onClose} className="box-border flex h-[34px] w-[34px] flex-none cursor-pointer items-center justify-center rounded-[10px] border border-agon-tx/[0.18] bg-transparent text-agon-tx">
        <ChevronLeft size={18} strokeWidth={1.75} />
      </button>
      <span className={cn(LABEL, "flex-1 text-center text-agon-tx2")}>{center}</span>
      <span className="w-[72px] flex-none whitespace-nowrap text-right text-[12.5px] text-agon-tx2">{right}</span>
    </div>
  );

  const primaryBtn = (label: string, onClick: () => void, disabled = false) => (
    <button type="button" disabled={disabled} onClick={onClick}
      className={cn(
        "h-[52px] rounded-xl border-none bg-agon-accent text-[15px] font-semibold text-agon-bg [font-family:inherit]",
        disabled ? "cursor-default opacity-[0.45]" : "cursor-pointer opacity-100",
      )}>
      {label}
    </button>
  );

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (saved) {
    const { variable: v, value, outcome } = saved;
    const unit = displayUnit(v.unit, v.value_type);
    const tone = outcome.isRecord ? "text-agon-type-fait" : "text-agon-tx";
    const isVma = /\bvma\b/i.test(`${definition?.name} ${v.label}`) && /km\/?h/i.test(v.unit);
    return shell(
      <>
        {header("Résultat enregistré", "")}
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <span className={cn(
            "flex h-[84px] w-[84px] items-center justify-center rounded-full border-[1.5px]",
            outcome.isRecord ? "border-agon-type-fait bg-agon-type-fait/[0.14]" : "border-agon-tx/[0.3] bg-agon-tx/[0.14]",
          )}>
            <Check size={36} className={tone} strokeWidth={1.75} />
          </span>
          {outcome.isRecord && outcome.previousBest && (
            <span className="agon-mono inline-flex h-[22px] items-center rounded-full bg-agon-type-fait px-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-agon-bg">Nouveau record</span>
          )}
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={cn("agon-mono text-[64px] leading-none", tone)}>{formatTestValue(value, v.value_type)}</span>
            <span className="agon-mono text-[15px] text-agon-tx3">{unit}</span>
          </div>
          <div className="agon-mono text-[12.5px] text-agon-tx2">{definition?.name ?? v.label} · {fmtLongDay(saved.date, true).toLowerCase()}</div>
          {outcome.previousBest && outcome.delta != null && (
            <div className={cn("agon-mono text-[13px]", outcome.isRecord ? "text-agon-type-fait" : "text-agon-tx2")}>
              {formatTestDelta(outcome.delta, v.value_type)} {v.value_type === "number" ? unit : ""} vs {outcome.isRecord ? "" : "record du "}{fmtTestDate(outcome.previousBest.date, false)}
            </div>
          )}
        </div>
        <div className="mt-7 flex flex-col gap-3 px-1.5">
          <div className="flex gap-2.5 text-[13px] leading-[1.45] text-agon-tx2">
            <UserRound size={16} className="mt-px flex-none text-agon-tx3" strokeWidth={1.75} />
            <span>{coachName ? `${coachName} voit ton résultat.` : "Ton coach voit ton résultat."}</span>
          </div>
          {isVma && (
            <div className="flex gap-2.5 text-[13px] leading-[1.45] text-agon-tx2">
              <Gauge size={16} className="mt-px flex-none text-agon-tx3" strokeWidth={1.75} />
              <span>Tes allures de course sont recalculées sur {formatNumberFr(value)} km/h.</span>
            </div>
          )}
        </div>
      </>,
      <>
        {resultPath
          ? primaryBtn("Voir le détail du test", () => { onClose(); navigate(resultPath(saved.variableId)); })
          : primaryBtn("Retour aux tests", onClose)}
        {resultPath && <button type="button" onClick={onClose} className="cursor-pointer border-none bg-transparent text-[13px] text-agon-accent [font-family:inherit]">Retour à Aujourd’hui</button>}
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
        <div className="mt-5 text-[13px] text-agon-tx3">Chargement…</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-agon-type-test">
              <FlaskConical size={17} className="text-agon-bg" strokeWidth={1.75} />
            </span>
            <h1 className="agon-display m-0 min-w-0 text-[26px] leading-[1.1]">{test.title}</h1>
            {definition && (
              <span className="agon-mono whitespace-nowrap rounded-full border px-[9px] py-[3px] text-[11px] font-medium" style={{ color: groupColor, borderColor: groupColor }}>{TEST_GROUP_LABEL[group]}</span>
            )}
          </div>
          <div className="-mt-1.5 text-[12.5px] text-agon-tx2">
            Prévu par {coach}{hasVariables && vars.length === 1 && unitText ? ` · ${unitText}` : ""}{hasVariables && vars.length === 1 ? ` · ${betterText}` : ""}
          </div>

          {(definition?.protocol?.text || test.description || definition?.description) && (
            <div className="rounded-[14px] border border-agon-brd bg-agon-s1 px-3.5 py-3">
              <div className="flex items-center justify-between">
                <span className={cn(LABEL, "text-agon-tx2")}>Protocole</span>
                {definition?.media_url && <a href={definition.media_url} target="_blank" rel="noreferrer" className="text-[12.5px] text-agon-accent no-underline">Détail</a>}
              </div>
              <div className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-normal text-agon-tx2">
                {definition?.protocol?.text || test.description || definition?.description}
              </div>
            </div>
          )}

          {coachFilled ? (
            <div className="rounded-[14px] border border-agon-alerte/[0.4] bg-agon-s1 px-3.5 py-3">
              <div className="mb-1 text-[13px] font-semibold text-agon-alerte">Rempli par ton coach</div>
              <div className="text-[12.5px] leading-normal text-agon-tx2">Fais le test : {coach} notera les valeurs. Valide quand c’est fait.</div>
            </div>
          ) : hasVariables ? (
            vars.length === 1 ? (
              <div>
                <div className="mb-1.5"><span className={cn(LABEL, "text-agon-tx3")}>Ta valeur · {first.label}</span></div>
                <ValueInput v={first} big readOnly={readOnly} draft={drafts[first.key] ?? emptyDraft} onChange={(d) => setDrafts((cur) => ({ ...cur, [first.key]: d }))} />
                {recordText(cardOf(first))}
              </div>
            ) : (
              <div className={cn("grid gap-2.5", vars.length === 2 ? "grid-cols-[1fr_1fr]" : "grid-cols-[1fr]")}>
                {vars.map((v) => (
                  <div key={v.id}>
                    <div className="mb-1.5"><span className={cn(LABEL, "text-agon-tx3")}>{v.label}</span></div>
                    <ValueInput v={v} big={false} readOnly={readOnly} draft={drafts[v.key] ?? emptyDraft} onChange={(d) => setDrafts((cur) => ({ ...cur, [v.key]: d }))} />
                    {recordText(cardOf(v))}
                  </div>
                ))}
              </div>
            )
          ) : (
            <Field label="Résultat">
              <textarea value={note} readOnly={readOnly} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Ex : 1RM squat = 120 kg"
                className={TEXTAREA} />
            </Field>
          )}
          {invalid && <div className="text-[12px] text-agon-alerte">Vérifie la valeur : les secondes vont de 00 à 59.</div>}

          <Field label="Date du test">
            {readOnly ? <div className="relative box-border flex h-12 items-center gap-2.5 rounded-xl border border-agon-tx/[0.18] bg-agon-s1 px-3.5"><span className="text-[15px]">{fmtLongDay(date, true)}</span></div>
              : <DateBox label="Date du test" value={date} max={localIsoDay()} onChange={setDate} withYear />}
          </Field>

          <Field label="Ressenti" right={<span className="text-[11.5px] text-agon-tx3">1 = très dur · 5 = facile</span>}>
            <div className="flex gap-1.5">
              {FEEL_CLASS.map((c, i) => {
                const n = i + 1;
                const on = feeling === n;
                return (
                  <button key={n} type="button" disabled={readOnly} aria-pressed={on} aria-label={`Ressenti ${n} sur 5`} onClick={() => setFeeling(on ? null : n)}
                    className={cn(
                      "agon-mono h-[42px] flex-1 rounded-[10px] border text-[16px]",
                      readOnly ? "cursor-default" : "cursor-pointer",
                      on ? c.on : c.off,
                    )}>
                    {n}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Commentaire · facultatif">
            <textarea value={comment} readOnly={readOnly} maxLength={1000} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Un mot pour ton coach"
                className={TEXTAREA} />
          </Field>
        </>
      )}
    </>,
    !readOnly && test && !loading
      ? primaryBtn(saving ? "Enregistrement…" : coachFilled ? "C’est fait" : "Valider le résultat", () => void submit(), saving || !filled || invalid)
      : null,
  );
}
