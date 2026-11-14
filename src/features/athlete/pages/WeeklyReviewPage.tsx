import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { C, H } from "@/lib/theme";
import { localIsoDay, addDays, isIsoDay } from "@shared/domain/dates";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { useWellnessLight } from "@/features/shared/hooks/useWellnessLight";
import { useWeeklyCoachRetour } from "@/features/shared/hooks/useWeeklyCoachRetour";
import {
  usePreviousWeeklyReview,
  useSaveWeeklyReview,
  useWeekSummary,
  useWeeklyReview,
} from "@/features/shared/hooks/useWeeklyReview";
import { ReviewAnswersView, ReviewSection, ReviewSummaryCard } from "@/features/shared/components/weekly-review/ReviewParts";
import { REVIEW_CARD } from "@/features/shared/components/weekly-review/reviewStyle";
import {
  FEEL_HINT,
  FEEL_KEYS,
  FEEL_LABEL,
  KEPT_LABEL,
  REVIEW_PARAMS,
  STUCK_LABEL,
  cleanAnswers,
  initialAnswers,
  isReviewOpen,
  missingFields,
  openReviewWeek,
  painRequired,
  type KeptStatus,
  type ReviewAnswers,
  type StuckCause,
} from "@/lib/weekly-review";

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const weekLabel = (w: string) => `Semaine du ${fmtDay(w)} au ${fmtDay(addDays(w, 6))}`;

const FIELD: CSSProperties = {
  width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.brd}`, background: C.s2, color: C.tx,
  padding: "10px 12px", fontSize: 14, fontFamily: "inherit", resize: "vertical",
};

function Choice<K extends string>({ value, options, onChange }: { value: K | null | undefined; options: Record<K, string>; onChange: (k: K) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {(Object.keys(options) as K[]).map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          style={{
            height: 34, padding: "0 12px", borderRadius: 17, fontSize: 13, cursor: "pointer",
            border: `1px solid ${value === k ? C.ac : C.brd}`, background: value === k ? C.acS : "transparent", color: value === k ? C.tx : C.tx2,
          }}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}

function Scale({ value, min, max, onChange, label }: { value: number | null | undefined; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div role="radiogroup" aria-label={label} style={{ display: "flex", gap: 4 }}>
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          style={{
            flex: 1, minWidth: 0, height: 38, borderRadius: 9, fontSize: 14, cursor: "pointer",
            border: `1px solid ${value === v ? C.ac : C.brd}`, background: value === v ? C.ac : C.s2, color: value === v ? C.bg : C.tx2,
          }}>
          {v}
        </button>
      ))}
    </div>
  );
}

/**
 * Weekly review de l'athlète (P22). Ouverte du dimanche au lundi soir.
 * Brouillon enregistré en base à chaque champ (repris après fermeture), bilan
 * automatique figé à l'envoi. `?week=YYYY-MM-DD` : relire une review passée.
 */
export default function WeeklyReviewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { athleteId } = useAthleteContext();
  const today = localIsoDay();
  const asked = params.get("week");
  const week = asked && isIsoDay(asked) ? asked : openReviewWeek(today);

  const { data: review, isLoading } = useWeeklyReview(athleteId, week);
  const { data: previous } = usePreviousWeeklyReview(athleteId, week);
  const submitted = review?.status === "submitted";
  const open = week ? isReviewOpen(week, today) : false;
  const { data: summary } = useWeekSummary(athleteId, week, !submitted);
  const { data: lightRes } = useWellnessLight(athleteId, today);
  const { data: retour } = useWeeklyCoachRetour(athleteId ?? undefined, submitted ? week ?? undefined : undefined);
  const save = useSaveWeeklyReview(athleteId, week);

  const light = submitted ? review?.light ?? null : lightRes?.light ?? null;
  const needPain = painRequired(light);

  const [answers, setAnswers] = useState<ReviewAnswers | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const pending = useRef<ReviewAnswers | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Réponses de départ : le brouillon, sinon les engagements de la semaine d'avant.
  useEffect(() => {
    if (answers || isLoading || !week || submitted) return;
    setAnswers(initialAnswers(review?.answers, previous?.answers));
  }, [answers, isLoading, week, submitted, review, previous]);

  // Valeurs lues au moment d'enregistrer : `flush` reste stable d'un rendu à l'autre.
  const live = useRef({ save, writable: open && !submitted });
  live.current = { save, writable: open && !submitted };
  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const a = pending.current;
    pending.current = null;
    if (a && live.current.writable) {
      live.current.save.mutate({ answers: a }, { onError: (e) => toast.error((e as Error).message) });
    }
  }, []);

  // Enregistre en partant (fermeture, onglet caché).
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); flush(); };
  }, [flush]);

  const update = (patch: (a: ReviewAnswers) => ReviewAnswers) => {
    setAnswers((cur) => {
      const next = patch(cur ?? {});
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 800);
      return next;
    });
  };

  const missing = useMemo(() => (answers ? missingFields(answers, { painRequired: needPain }) : []), [answers, needPain]);

  const submit = () => {
    if (!answers || !summary) return;
    if (missing.length > 0) { setShowMissing(true); return; }
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    pending.current = null;
    save.mutate(
      { answers: cleanAnswers(answers, { painRequired: needPain }), submit: { auto: summary, light } },
      {
        onSuccess: () => toast.success("Review envoyée à ton coach"),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const header = <AthletePageHeader title="Ta weekly review" titleSize={22} />;
  const wrap = (body: ReactNode) => (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      {header}
      <div style={{ padding: "16px 16px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
        {week && <div style={{ fontSize: 13, color: C.tx2 }}>{weekLabel(week)}</div>}
        {body}
      </div>
    </div>
  );

  if (!week) {
    return wrap(
      <div style={{ ...REVIEW_CARD, fontSize: 14, color: C.tx2 }}>
        Ta weekly review s'ouvre dimanche matin et se remplit jusqu'au lundi soir.
      </div>,
    );
  }
  if (isLoading) return wrap(<div style={{ color: C.tx3, fontSize: 13 }}>Chargement…</div>);

  if (submitted && review) {
    return wrap(
      <>
        <ReviewSection n="01" title="Ta semaine">
          <ReviewSummaryCard summary={review.auto} />
        </ReviewSection>
        <ReviewAnswersView answers={review.answers} light={review.light} />
        <ReviewSection n="—" title="Réponse du coach">
          <div style={{ ...REVIEW_CARD, fontSize: 14, whiteSpace: "pre-wrap", color: retour?.comment ? C.tx : C.tx3 }}>
            {retour?.comment || "Ton coach te répond le lundi."}
          </div>
        </ReviewSection>
      </>,
    );
  }

  if (!open) {
    return wrap(
      <div style={{ ...REVIEW_CARD, fontSize: 14, color: C.tx2 }}>
        {today > addDays(week, 7) ? "Cette weekly review n'a pas été faite." : "Cette weekly review s'ouvre le dimanche."}
      </div>,
    );
  }

  const a = answers ?? {};
  const kept = a.kept ?? [];
  const next = [...(a.next ?? []), "", "", ""].slice(0, REVIEW_PARAMS.engagements);
  const isMissing = (key: string) => showMissing && missing.some((m) => m.key === key || m.key.startsWith(`${key}.`));
  const mark = (key: string): CSSProperties => (isMissing(key) ? { outline: `1px solid ${C.r}`, outlineOffset: 4, borderRadius: 10 } : {});

  return wrap(
    <>
      <ReviewSection n="01" title="Ta semaine">
        <ReviewSummaryCard summary={summary} />
      </ReviewSection>

      <ReviewSection n="02" title="Ton ressenti, de 1 à 5">
        <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 14 }}>
          {FEEL_KEYS.map((k) => (
            <div key={k} style={mark(`feel.${k}`)}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
                <span>{FEEL_LABEL[k]}</span>
                <span style={{ fontSize: 11.5, color: C.tx3 }}>1 {FEEL_HINT[k][0]} · 5 {FEEL_HINT[k][1]}</span>
              </div>
              <Scale label={FEEL_LABEL[k]} min={1} max={5} value={a.feel?.[k]}
                onChange={(v) => update((x) => ({ ...x, feel: { ...(x.feel ?? {}), [k]: v } }))} />
            </div>
          ))}
        </div>
      </ReviewSection>

      {kept.length > 0 && (
        <ReviewSection n="03" title="Tes engagements de la semaine">
          <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 14 }}>
            {kept.map((c, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, ...mark(`kept.${i}`) }}>
                <div style={{ fontSize: 13.5 }}>{c.text}</div>
                <Choice<KeptStatus> value={c.status} options={KEPT_LABEL}
                  onChange={(s) => update((x) => ({ ...x, kept: (x.kept ?? []).map((k, j) => (j === i ? { ...k, status: s } : k)) }))} />
                {c.status && c.status !== "kept" && (
                  <input style={FIELD} maxLength={REVIEW_PARAMS.maxText} placeholder="Pourquoi ?" value={c.why ?? ""}
                    onChange={(e) => update((x) => ({ ...x, kept: (x.kept ?? []).map((k, j) => (j === i ? { ...k, why: e.target.value } : k)) }))} />
                )}
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      <ReviewSection n="04" title="3 questions">
        <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, ...mark("worked") }}>
            Ce qui a marché
            <textarea style={FIELD} rows={2} maxLength={REVIEW_PARAMS.maxText} value={a.worked ?? ""}
              onChange={(e) => update((x) => ({ ...x, worked: e.target.value }))} />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, ...mark("stuck") }}>
            <label htmlFor="wr-stuck">Ce qui a coincé</label>
            <Choice<StuckCause> value={a.stuckCause} options={STUCK_LABEL} onChange={(s) => update((x) => ({ ...x, stuckCause: s }))} />
            <textarea id="wr-stuck" style={FIELD} rows={2} maxLength={REVIEW_PARAMS.maxText} value={a.stuck ?? ""}
              onChange={(e) => update((x) => ({ ...x, stuck: e.target.value }))} />
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, ...mark("change") }}>
            Ce que je change
            <textarea style={FIELD} rows={2} maxLength={REVIEW_PARAMS.maxText} value={a.change ?? ""}
              onChange={(e) => update((x) => ({ ...x, change: e.target.value }))} />
          </label>
        </div>
      </ReviewSection>

      <ReviewSection n="05" title="3 engagements pour la semaine prochaine">
        <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 8, ...mark("next") }}>
          {next.map((t, i) => (
            <input key={i} style={FIELD} maxLength={REVIEW_PARAMS.maxText} placeholder={`Engagement ${i + 1}`} value={t}
              onChange={(e) => update((x) => {
                const n = [...(x.next ?? []), "", "", ""].slice(0, REVIEW_PARAMS.engagements);
                n[i] = e.target.value;
                return { ...x, next: n };
              })} />
          ))}
          <div style={{ fontSize: 12, color: C.tx3 }}>Ils reviendront dans ta review de la semaine prochaine.</div>
        </div>
      </ReviewSection>

      {needPain && (
        <ReviewSection n="06" title="Ta douleur">
          <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 10, ...mark("pain") }}>
            <div style={{ fontSize: 12.5, color: C.tx2 }}>Ton feu est {light === "red" ? "rouge" : "orange"} : dis-nous où tu as mal.</div>
            <input style={FIELD} maxLength={120} placeholder="Zone (genou droit, bas du dos…)" value={a.pain?.zone ?? ""}
              onChange={(e) => update((x) => ({ ...x, pain: { ...(x.pain ?? {}), zone: e.target.value } }))} />
            <Choice value={a.pain?.kind} options={{ douleur: "Douleur", blessure: "Blessure" }}
              onChange={(k) => update((x) => ({ ...x, pain: { ...(x.pain ?? {}), kind: k } }))} />
            <div style={{ fontSize: 13 }}>Niveau, de 0 à 10</div>
            <Scale label="Niveau de douleur" min={0} max={10} value={a.pain?.level}
              onChange={(v) => update((x) => ({ ...x, pain: { ...(x.pain ?? {}), level: v } }))} />
          </div>
        </ReviewSection>
      )}

      <ReviewSection n={needPain ? "07" : "06"} title="Un mot pour ton coach (facultatif)">
        <textarea style={FIELD} rows={3} maxLength={REVIEW_PARAMS.maxText} value={a.coachNote ?? ""}
          onChange={(e) => update((x) => ({ ...x, coachNote: e.target.value }))} />
      </ReviewSection>

      {showMissing && missing.length > 0 && (
        <div role="alert" style={{ fontSize: 13, color: C.r }}>
          Il manque : {missing.map((m) => m.label).join(", ")}.
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => { flush(); navigate("/athlete"); }}
          style={{ flex: 1, height: 46, borderRadius: 12, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 14, cursor: "pointer" }}>
          Finir plus tard
        </button>
        <button type="button" onClick={submit} disabled={save.isPending || !summary}
          style={{ flex: 2, height: 46, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: save.isPending || !summary ? 0.6 : 1 }}>
          {save.isPending ? "Envoi…" : "Envoyer à mon coach"}
        </button>
      </div>
      <div style={{ fontSize: 12, color: C.tx3, textAlign: "center" }}>
        Brouillon enregistré à chaque réponse. Ouverte jusqu'au lundi soir.
      </div>
    </>,
  );
}
