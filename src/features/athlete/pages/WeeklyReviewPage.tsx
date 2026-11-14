import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

/** Équivalent en classes de REVIEW_CARD (weekly-review/reviewStyle.ts). */
const REVIEW_CARD = "rounded-xl border border-agon-brd bg-agon-s1 px-3.5 py-3";
const FIELD = "box-border w-full resize-y rounded-[10px] border border-agon-brd bg-agon-s2 px-3 py-2.5 font-[inherit] text-[14px] text-agon-tx";

function Choice<K extends string>({ value, options, onChange }: { value: K | null | undefined; options: Record<K, string>; onChange: (k: K) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(options) as K[]).map((k) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          className={cn("h-[34px] cursor-pointer rounded-[17px] border px-3 text-[13px]", value === k ? "border-agon-accent bg-agon-accent-doux text-agon-tx" : "border-agon-brd bg-transparent text-agon-tx2")}>
          {options[k]}
        </button>
      ))}
    </div>
  );
}

function Scale({ value, min, max, onChange, label }: { value: number | null | undefined; min: number; max: number; onChange: (v: number) => void; label: string }) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {values.map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-[38px] min-w-0 flex-1 cursor-pointer rounded-[9px] border text-[14px]", value === v ? "border-agon-accent bg-agon-accent text-agon-bg" : "border-agon-brd bg-agon-s2 text-agon-tx2")}>
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
    <div className="mx-auto max-w-[520px]">
      {header}
      <div className="flex flex-col gap-4 px-4 pb-12 pt-4">
        {week && <div className="text-[13px] text-agon-tx2">{weekLabel(week)}</div>}
        {body}
      </div>
    </div>
  );

  if (!week) {
    return wrap(
      <div className={cn(REVIEW_CARD, "text-[14px] text-agon-tx2")}>
        Ta weekly review s'ouvre dimanche matin et se remplit jusqu'au lundi soir.
      </div>,
    );
  }
  if (isLoading) return wrap(<div className="text-[13px] text-agon-tx3">Chargement…</div>);

  if (submitted && review) {
    return wrap(
      <>
        <ReviewSection n="01" title="Ta semaine">
          <ReviewSummaryCard summary={review.auto} />
        </ReviewSection>
        <ReviewAnswersView answers={review.answers} light={review.light} />
        <ReviewSection n="—" title="Réponse du coach">
          <div className={cn(REVIEW_CARD, "whitespace-pre-wrap text-[14px]", retour?.comment ? "text-agon-tx" : "text-agon-tx3")}>
            {retour?.comment || "Ton coach te répond le lundi."}
          </div>
        </ReviewSection>
      </>,
    );
  }

  if (!open) {
    return wrap(
      <div className={cn(REVIEW_CARD, "text-[14px] text-agon-tx2")}>
        {today > addDays(week, 7) ? "Cette weekly review n'a pas été faite." : "Cette weekly review s'ouvre le dimanche."}
      </div>,
    );
  }

  const a = answers ?? {};
  const kept = a.kept ?? [];
  const next = [...(a.next ?? []), "", "", ""].slice(0, REVIEW_PARAMS.engagements);
  const isMissing = (key: string) => showMissing && missing.some((m) => m.key === key || m.key.startsWith(`${key}.`));
  const mark = (key: string): string => (isMissing(key) ? "rounded-[10px] outline outline-1 outline-offset-4 outline-agon-erreur" : "");

  return wrap(
    <>
      <ReviewSection n="01" title="Ta semaine">
        <ReviewSummaryCard summary={summary} />
      </ReviewSection>

      <ReviewSection n="02" title="Ton ressenti, de 1 à 5">
        <div className={cn(REVIEW_CARD, "flex flex-col gap-3.5")}>
          {FEEL_KEYS.map((k) => (
            <div key={k} className={mark(`feel.${k}`) || undefined}>
              <div className="mb-1.5 flex justify-between text-[13.5px]">
                <span>{FEEL_LABEL[k]}</span>
                <span className="text-[11.5px] text-agon-tx3">1 {FEEL_HINT[k][0]} · 5 {FEEL_HINT[k][1]}</span>
              </div>
              <Scale label={FEEL_LABEL[k]} min={1} max={5} value={a.feel?.[k]}
                onChange={(v) => update((x) => ({ ...x, feel: { ...(x.feel ?? {}), [k]: v } }))} />
            </div>
          ))}
        </div>
      </ReviewSection>

      {kept.length > 0 && (
        <ReviewSection n="03" title="Tes engagements de la semaine">
          <div className={cn(REVIEW_CARD, "flex flex-col gap-3.5")}>
            {kept.map((c, i) => (
              <div key={i} className={cn("flex flex-col gap-1.5", mark(`kept.${i}`))}>
                <div className="text-[13.5px]">{c.text}</div>
                <Choice<KeptStatus> value={c.status} options={KEPT_LABEL}
                  onChange={(s) => update((x) => ({ ...x, kept: (x.kept ?? []).map((k, j) => (j === i ? { ...k, status: s } : k)) }))} />
                {c.status && c.status !== "kept" && (
                  <input className={FIELD} maxLength={REVIEW_PARAMS.maxText} placeholder="Pourquoi ?" value={c.why ?? ""}
                    onChange={(e) => update((x) => ({ ...x, kept: (x.kept ?? []).map((k, j) => (j === i ? { ...k, why: e.target.value } : k)) }))} />
                )}
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      <ReviewSection n="04" title="3 questions">
        <div className={cn(REVIEW_CARD, "flex flex-col gap-3")}>
          <label className={cn("flex flex-col gap-1.5 text-[13.5px]", mark("worked"))}>
            Ce qui a marché
            <textarea className={FIELD} rows={2} maxLength={REVIEW_PARAMS.maxText} value={a.worked ?? ""}
              onChange={(e) => update((x) => ({ ...x, worked: e.target.value }))} />
          </label>
          <div className={cn("flex flex-col gap-1.5 text-[13.5px]", mark("stuck"))}>
            <label htmlFor="wr-stuck">Ce qui a coincé</label>
            <Choice<StuckCause> value={a.stuckCause} options={STUCK_LABEL} onChange={(s) => update((x) => ({ ...x, stuckCause: s }))} />
            <textarea id="wr-stuck" className={FIELD} rows={2} maxLength={REVIEW_PARAMS.maxText} value={a.stuck ?? ""}
              onChange={(e) => update((x) => ({ ...x, stuck: e.target.value }))} />
          </div>
          <label className={cn("flex flex-col gap-1.5 text-[13.5px]", mark("change"))}>
            Ce que je change
            <textarea className={FIELD} rows={2} maxLength={REVIEW_PARAMS.maxText} value={a.change ?? ""}
              onChange={(e) => update((x) => ({ ...x, change: e.target.value }))} />
          </label>
        </div>
      </ReviewSection>

      <ReviewSection n="05" title="3 engagements pour la semaine prochaine">
        <div className={cn(REVIEW_CARD, "flex flex-col gap-2", mark("next"))}>
          {next.map((t, i) => (
            <input key={i} className={FIELD} maxLength={REVIEW_PARAMS.maxText} placeholder={`Engagement ${i + 1}`} value={t}
              onChange={(e) => update((x) => {
                const n = [...(x.next ?? []), "", "", ""].slice(0, REVIEW_PARAMS.engagements);
                n[i] = e.target.value;
                return { ...x, next: n };
              })} />
          ))}
          <div className="text-[12px] text-agon-tx3">Ils reviendront dans ta review de la semaine prochaine.</div>
        </div>
      </ReviewSection>

      {needPain && (
        <ReviewSection n="06" title="Ta douleur">
          <div className={cn(REVIEW_CARD, "flex flex-col gap-2.5", mark("pain"))}>
            <div className="text-[12.5px] text-agon-tx2">Ton feu est {light === "red" ? "rouge" : "orange"} : dis-nous où tu as mal.</div>
            <input className={FIELD} maxLength={120} placeholder="Zone (genou droit, bas du dos…)" value={a.pain?.zone ?? ""}
              onChange={(e) => update((x) => ({ ...x, pain: { ...(x.pain ?? {}), zone: e.target.value } }))} />
            <Choice value={a.pain?.kind} options={{ douleur: "Douleur", blessure: "Blessure" }}
              onChange={(k) => update((x) => ({ ...x, pain: { ...(x.pain ?? {}), kind: k } }))} />
            <div className="text-[13px]">Niveau, de 0 à 10</div>
            <Scale label="Niveau de douleur" min={0} max={10} value={a.pain?.level}
              onChange={(v) => update((x) => ({ ...x, pain: { ...(x.pain ?? {}), level: v } }))} />
          </div>
        </ReviewSection>
      )}

      <ReviewSection n={needPain ? "07" : "06"} title="Un mot pour ton coach (facultatif)">
        <textarea className={FIELD} rows={3} maxLength={REVIEW_PARAMS.maxText} value={a.coachNote ?? ""}
          onChange={(e) => update((x) => ({ ...x, coachNote: e.target.value }))} />
      </ReviewSection>

      {showMissing && missing.length > 0 && (
        <div role="alert" className="text-[13px] text-agon-erreur">
          Il manque : {missing.map((m) => m.label).join(", ")}.
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => { flush(); navigate("/athlete"); }}
          className="h-[46px] flex-1 cursor-pointer rounded-xl border border-agon-brd bg-transparent text-[14px] text-agon-tx2">
          Finir plus tard
        </button>
        <button type="button" onClick={submit} disabled={save.isPending || !summary}
          className={cn("h-[46px] flex-[2] cursor-pointer rounded-xl border-none bg-agon-accent text-[15px] font-semibold text-agon-bg", (save.isPending || !summary) && "opacity-60")}>
          {save.isPending ? "Envoi…" : "Envoyer à mon coach"}
        </button>
      </div>
      <div className="text-center text-[12px] text-agon-tx3">
        Brouillon enregistré à chaque réponse. Ouverte jusqu'au lundi soir.
      </div>
    </>,
  );
}
