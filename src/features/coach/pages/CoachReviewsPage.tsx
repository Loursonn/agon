import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { C } from "@/lib/theme";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { useAuth } from "@/hooks/useAuth";
import { useCoachWeekReviews } from "@/features/shared/hooks/useWeeklyReview";
import { LIGHT_COLOR, LIGHT_LABEL } from "@/features/shared/components/weekly-review/reviewStyle";
import { REVIEW_STATE_LABEL, lastReviewWeek, reviewState, type ReviewState } from "@/lib/weekly-review";

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

const STATE_COLOR: Record<ReviewState, string> = {
  received: LIGHT_COLOR.green, draft: LIGHT_COLOR.orange, waiting: LIGHT_COLOR.orange, missed: LIGHT_COLOR.red, upcoming: "",
};
const STATE_ORDER: Record<ReviewState, number> = { received: 0, waiting: 1, draft: 1, missed: 2, upcoming: 3 };

/**
 * « Reviews de la semaine » (P23) : une ligne par athlète du coach (référent ou
 * co-coach), reçue / en attente / non faite, pour tout lire le lundi.
 */
export default function CoachReviewsPage() {
  const navigate = useNavigate();
  const { athletes } = useAuth();
  const today = localIsoDay();
  const [week, setWeek] = useState(() => lastReviewWeek(today));
  const ids = useMemo(() => athletes.map((a) => a.id), [athletes]);
  const { data: reviews = [], isLoading, error } = useCoachWeekReviews(ids, week);

  const rows = useMemo(() => {
    const byAthlete = new Map(reviews.map((r) => [r.athleteId, r]));
    return athletes
      .map((a) => {
        const r = byAthlete.get(a.id) ?? null;
        return { athlete: a, review: r, state: reviewState(week, today, r) };
      })
      .sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state] || (x.athlete.full_name ?? "").localeCompare(y.athlete.full_name ?? ""));
  }, [athletes, reviews, week, today]);
  const received = rows.filter((r) => r.state === "received").length;

  const nav = (d: number) => setWeek((w) => addDays(w, 7 * d));
  const btn = { width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.brd}`, background: C.s1, color: C.tx2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" } as const;
  const th = { textAlign: "left" as const, padding: "8px 10px", fontSize: 11.5, color: C.tx3, fontWeight: 500, whiteSpace: "nowrap" as const };
  const td = { padding: "10px", fontSize: 13.5, borderTop: `1px solid ${C.brd}`, whiteSpace: "nowrap" as const };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, margin: 0 }}>Reviews de la semaine</h1>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
        <button type="button" style={btn} onClick={() => nav(-1)} aria-label="Semaine précédente"><ChevronLeft size={16} /></button>
        <div style={{ fontSize: 14, minWidth: 200, textAlign: "center" }}>Semaine du {fmtDay(week)} au {fmtDay(addDays(week, 6))}</div>
        <button type="button" style={btn} onClick={() => nav(1)} disabled={week >= lastReviewWeek(today)} aria-label="Semaine suivante"><ChevronRight size={16} /></button>
        <span style={{ fontSize: 13, color: C.tx2, marginLeft: 8 }}>{received} / {rows.length} reçue{received > 1 ? "s" : ""}</span>
      </div>

      {error ? (
        <div style={{ marginTop: 20, color: C.r, fontSize: 13 }}>Reviews indisponibles : {(error as Error).message}</div>
      ) : isLoading ? (
        <div style={{ marginTop: 20, color: C.tx3, fontSize: 13 }}>Chargement…</div>
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 20, color: C.tx3, fontSize: 13 }}>Aucun athlète.</div>
      ) : (
        <div style={{ marginTop: 18, borderRadius: 12, border: `1px solid ${C.brd}`, background: C.s1, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Athlète</th><th style={th}>Review</th><th style={th}>Feu</th><th style={th}>Note</th>
                <th style={th}>Séances</th><th style={th}>Douleur</th><th style={th}>Mot au coach</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ athlete, review, state }) => (
                <tr key={athlete.id} onClick={() => navigate(`/coach/athletes/${athlete.id}/review?week=${week}`)} style={{ cursor: "pointer" }}>
                  <td style={td}>{athlete.full_name ?? "—"}</td>
                  <td style={td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {STATE_COLOR[state] && <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATE_COLOR[state] }} />}
                      {REVIEW_STATE_LABEL[state === "draft" ? "waiting" : state]}
                    </span>
                  </td>
                  <td style={td}>
                    {review?.light
                      ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: LIGHT_COLOR[review.light] }} />{LIGHT_LABEL[review.light]}</span>
                      : "—"}
                  </td>
                  <td style={td}>{review?.answers.feel?.note != null ? `${review.answers.feel.note}/5` : "—"}</td>
                  <td style={td}>{review?.auto ? `${review.auto.sessions.done} / ${review.auto.sessions.planned}` : "—"}</td>
                  <td style={td}>{review?.answers.pain?.level != null ? `${review.answers.pain.zone ?? ""} ${review.answers.pain.level}/10`.trim() : "—"}</td>
                  <td style={{ ...td, whiteSpace: "normal", maxWidth: 280, color: C.tx2 }}>{review?.answers.coachNote ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
