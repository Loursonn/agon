import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LIGHT_LABEL, REVIEW_CARD_CLASS } from "./reviewStyle";
import { WELLNESS_ITEM_SHORT, WELLNESS_ITEMS } from "@shared/domain/wellness";
import type { Light } from "@shared/domain/wellnessLight";
import {
  FEEL_KEYS,
  FEEL_LABEL,
  KEPT_LABEL,
  STUCK_LABEL,
  formatDuration,
  formatNumber,
  type KeptStatus,
  type ReviewAnswers,
  type WeekSummary,
} from "@/lib/weekly-review";

/**
 * Morceaux d'affichage de la weekly review, communs à l'athlète (après envoi),
 * au coach et au staff (lecture). Une mesure absente s'affiche « — ».
 */


/** Feux en couleurs de marque, comme LIGHT_COLOR (./reviewStyle), en classes. */
const LIGHT_BG: Record<Light, string> = { green: "bg-agon-succes", orange: "bg-agon-alerte", red: "bg-agon-erreur" };
const KEPT_TEXT: Record<KeptStatus, string> = { kept: "text-agon-succes", partly: "text-agon-alerte", missed: "text-agon-erreur" };

export function ReviewSection({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx2">
        <span className="text-agon-accent">{n} —</span> {title}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-nowrap text-[11.5px] text-agon-tx3">{label}</div>
      <div className={cn("agon-mono mt-0.5 text-[18px]", value === "—" ? "text-agon-tx3" : "text-agon-tx")}>{value}</div>
    </div>
  );
}

/** Bloc 1 : bilan automatique de la semaine. */
export function ReviewSummaryCard({ summary }: { summary: WeekSummary | null | undefined }) {
  if (!summary) return <div className={cn(REVIEW_CARD_CLASS, "text-[13px] text-agon-tx3")}>Bilan en cours de calcul…</div>;
  const w = summary.wellness;
  return (
    <div className={cn(REVIEW_CARD_CLASS, "flex flex-col gap-3")}>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
        <Stat label="Séances" value={summary.sessions.planned > 0 || summary.sessions.done > 0 ? `${summary.sessions.done} / ${summary.sessions.planned}` : "—"} />
        <Stat label="RPE moyen" value={formatNumber(summary.rpeAvg)} />
        <Stat label="Durée" value={formatDuration(summary.durationMin)} />
        {summary.runKm === undefined ? (
          <Stat label="Distance" value={formatNumber(summary.distanceKm, "km")} />
        ) : (
          <Stat label="Course à pied" value={formatNumber(summary.runKm, "km")} />
        )}
        {summary.bikeKm != null && <Stat label="Vélo" value={formatNumber(summary.bikeKm, "km")} />}
      </div>
      {summary.hardest && (
        <div className="border-t border-agon-brd pt-2.5 text-[13px]">
          <div className="text-agon-tx2">Séance la plus dure : <span className="text-agon-tx">{summary.hardest.label}</span> · RPE {summary.hardest.rpe}</div>
          {summary.hardest.comment && <div className="mt-1 italic text-agon-tx3">« {summary.hardest.comment} »</div>}
        </div>
      )}
      <div className="border-t border-agon-brd pt-2.5">
        <div className="mb-2 text-[13px] text-agon-tx2">
          Voici comment tu t'es senti{w.days > 0 ? ` (${w.days} jour${w.days > 1 ? "s" : ""} de wellness)` : ""}
        </div>
        <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
          {WELLNESS_ITEMS.map((k) => <Stat key={k} label={WELLNESS_ITEM_SHORT[k]} value={w.items[k] != null ? `${formatNumber(w.items[k])}/5` : "—"} />)}
          <Stat label="Envie" value={w.envie != null ? `${formatNumber(w.envie)}/5` : "—"} />
        </div>
        {(w.painMax != null || w.sickDays > 0) && (
          <div className="mt-2 text-[12.5px] text-agon-tx2">
            {w.painMax != null && <>Douleur max : {w.painMax}/10. </>}
            {w.sickDays > 0 && <>Malade {w.sickDays} jour{w.sickDays > 1 ? "s" : ""}.</>}
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-[13.5px]">
      <div className="text-[11.5px] text-agon-tx3">{label}</div>
      <div className="mt-0.5 whitespace-pre-wrap text-agon-tx">{children}</div>
    </div>
  );
}

const dash = (s: string | undefined | null) => (s && s.trim() ? s : "—");

/** Réponses envoyées (blocs 2 à 7), en lecture. */
export function ReviewAnswersView({ answers, light }: { answers: ReviewAnswers; light: Light | null }) {
  const kept = answers.kept ?? [];
  return (
    <div className="flex flex-col gap-3.5">
      <ReviewSection n="02" title="Ressenti">
        <div className={cn(REVIEW_CARD_CLASS, "grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5")}>
          {FEEL_KEYS.map((k) => <Stat key={k} label={FEEL_LABEL[k]} value={answers.feel?.[k] != null ? `${answers.feel[k]}/5` : "—"} />)}
        </div>
      </ReviewSection>

      {kept.length > 0 && (
        <ReviewSection n="03" title="Engagements de la semaine">
          <div className={cn(REVIEW_CARD_CLASS, "flex flex-col gap-2")}>
            {kept.map((c, i) => (
              <div key={i} className="text-[13.5px]">
                <span className="text-agon-tx">{c.text}</span>
                {" · "}
                <span className={c.status ? KEPT_TEXT[c.status] : "text-agon-tx3"}>{c.status ? KEPT_LABEL[c.status] : "—"}</span>
                {c.why && <div className="text-[12.5px] text-agon-tx3">{c.why}</div>}
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      <ReviewSection n="04" title="La semaine">
        <div className={cn(REVIEW_CARD_CLASS, "flex flex-col gap-2.5")}>
          <Line label="Ce qui a marché">{dash(answers.worked)}</Line>
          <Line label={`Ce qui a coincé${answers.stuckCause ? ` (${STUCK_LABEL[answers.stuckCause]})` : ""}`}>{dash(answers.stuck)}</Line>
          <Line label="Ce que je change">{dash(answers.change)}</Line>
        </div>
      </ReviewSection>

      <ReviewSection n="05" title="Engagements pour la semaine suivante">
        <div className={cn(REVIEW_CARD_CLASS, "flex flex-col gap-1.5")}>
          {(answers.next ?? []).length === 0 ? <span className="text-agon-tx3">—</span>
            : (answers.next ?? []).map((t, i) => <div key={i} className="text-[13.5px]">{i + 1}. {t}</div>)}
        </div>
      </ReviewSection>

      {answers.pain && (
        <ReviewSection n="06" title="Douleur">
          <div className={cn(REVIEW_CARD_CLASS, "flex items-center gap-2 text-[13.5px]")}>
            {light && <span className={cn("h-2.5 w-2.5 flex-none rounded-full", LIGHT_BG[light])} title={`Feu ${LIGHT_LABEL[light]}`} />}
            <span>{dash(answers.pain.zone)}{answers.pain.kind ? ` · ${answers.pain.kind}` : ""} · {answers.pain.level != null ? `${answers.pain.level}/10` : "—"}</span>
          </div>
        </ReviewSection>
      )}

      {answers.coachNote && (
        <ReviewSection n="07" title="Mot au coach">
          <div className={cn(REVIEW_CARD_CLASS, "whitespace-pre-wrap text-[13.5px]")}>{answers.coachNote}</div>
        </ReviewSection>
      )}
    </div>
  );
}
