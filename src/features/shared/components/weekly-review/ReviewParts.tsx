import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { LIGHT_COLOR, LIGHT_LABEL, REVIEW_CARD } from "./reviewStyle";
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


const KEPT_COLOR: Record<KeptStatus, string> = { kept: LIGHT_COLOR.green, partly: LIGHT_COLOR.orange, missed: LIGHT_COLOR.red };

export function ReviewSection({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2 }}>
        <span style={{ color: C.ac }}>{n} —</span> {title}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, color: C.tx3, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ ...MONO, fontSize: 18, color: value === "—" ? C.tx3 : C.tx, marginTop: 2 }}>{value}</div>
    </div>
  );
}

/** Bloc 1 : bilan automatique de la semaine. */
export function ReviewSummaryCard({ summary }: { summary: WeekSummary | null | undefined }) {
  if (!summary) return <div style={{ ...REVIEW_CARD, color: C.tx3, fontSize: 13 }}>Bilan en cours de calcul…</div>;
  const w = summary.wellness;
  return (
    <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <Stat label="Séances" value={summary.sessions.planned > 0 || summary.sessions.done > 0 ? `${summary.sessions.done} / ${summary.sessions.planned}` : "—"} />
        <Stat label="RPE moyen" value={formatNumber(summary.rpeAvg)} />
        <Stat label="Durée" value={formatDuration(summary.durationMin)} />
        <Stat label="Distance" value={formatNumber(summary.distanceKm, "km")} />
      </div>
      {summary.hardest && (
        <div style={{ fontSize: 13, borderTop: `1px solid ${C.brd}`, paddingTop: 10 }}>
          <div style={{ color: C.tx2 }}>Séance la plus dure : <span style={{ color: C.tx }}>{summary.hardest.label}</span> · RPE {summary.hardest.rpe}</div>
          {summary.hardest.comment && <div style={{ color: C.tx3, marginTop: 4, fontStyle: "italic" }}>« {summary.hardest.comment} »</div>}
        </div>
      )}
      <div style={{ borderTop: `1px solid ${C.brd}`, paddingTop: 10 }}>
        <div style={{ fontSize: 13, color: C.tx2, marginBottom: 8 }}>
          Voici comment tu t'es senti{w.days > 0 ? ` (${w.days} jour${w.days > 1 ? "s" : ""} de wellness)` : ""}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {WELLNESS_ITEMS.map((k) => <Stat key={k} label={WELLNESS_ITEM_SHORT[k]} value={w.items[k] != null ? `${formatNumber(w.items[k])}/5` : "—"} />)}
          <Stat label="Envie" value={w.envie != null ? `${formatNumber(w.envie)}/5` : "—"} />
        </div>
        {(w.painMax != null || w.sickDays > 0) && (
          <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 8 }}>
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
    <div style={{ fontSize: 13.5 }}>
      <div style={{ fontSize: 11.5, color: C.tx3 }}>{label}</div>
      <div style={{ color: C.tx, marginTop: 2, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

const dash = (s: string | undefined | null) => (s && s.trim() ? s : "—");

/** Réponses envoyées (blocs 2 à 7), en lecture. */
export function ReviewAnswersView({ answers, light }: { answers: ReviewAnswers; light: Light | null }) {
  const kept = answers.kept ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ReviewSection n="02" title="Ressenti">
        <div style={{ ...REVIEW_CARD, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          {FEEL_KEYS.map((k) => <Stat key={k} label={FEEL_LABEL[k]} value={answers.feel?.[k] != null ? `${answers.feel[k]}/5` : "—"} />)}
        </div>
      </ReviewSection>

      {kept.length > 0 && (
        <ReviewSection n="03" title="Engagements de la semaine">
          <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 8 }}>
            {kept.map((c, i) => (
              <div key={i} style={{ fontSize: 13.5 }}>
                <span style={{ color: C.tx }}>{c.text}</span>
                {" · "}
                <span style={{ color: c.status ? KEPT_COLOR[c.status] : C.tx3 }}>{c.status ? KEPT_LABEL[c.status] : "—"}</span>
                {c.why && <div style={{ color: C.tx3, fontSize: 12.5 }}>{c.why}</div>}
              </div>
            ))}
          </div>
        </ReviewSection>
      )}

      <ReviewSection n="04" title="La semaine">
        <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 10 }}>
          <Line label="Ce qui a marché">{dash(answers.worked)}</Line>
          <Line label={`Ce qui a coincé${answers.stuckCause ? ` (${STUCK_LABEL[answers.stuckCause]})` : ""}`}>{dash(answers.stuck)}</Line>
          <Line label="Ce que je change">{dash(answers.change)}</Line>
        </div>
      </ReviewSection>

      <ReviewSection n="05" title="Engagements pour la semaine suivante">
        <div style={{ ...REVIEW_CARD, display: "flex", flexDirection: "column", gap: 6 }}>
          {(answers.next ?? []).length === 0 ? <span style={{ color: C.tx3 }}>—</span>
            : (answers.next ?? []).map((t, i) => <div key={i} style={{ fontSize: 13.5 }}>{i + 1}. {t}</div>)}
        </div>
      </ReviewSection>

      {answers.pain && (
        <ReviewSection n="06" title="Douleur">
          <div style={{ ...REVIEW_CARD, fontSize: 13.5, display: "flex", gap: 8, alignItems: "center" }}>
            {light && <span style={{ width: 10, height: 10, borderRadius: "50%", background: LIGHT_COLOR[light], flex: "none" }} title={`Feu ${LIGHT_LABEL[light]}`} />}
            <span>{dash(answers.pain.zone)}{answers.pain.kind ? ` · ${answers.pain.kind}` : ""} · {answers.pain.level != null ? `${answers.pain.level}/10` : "—"}</span>
          </div>
        </ReviewSection>
      )}

      {answers.coachNote && (
        <ReviewSection n="07" title="Mot au coach">
          <div style={{ ...REVIEW_CARD, fontSize: 13.5, whiteSpace: "pre-wrap" }}>{answers.coachNote}</div>
        </ReviewSection>
      )}
    </div>
  );
}
