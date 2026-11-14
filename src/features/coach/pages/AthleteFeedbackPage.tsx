/**
 * AthleteFeedbackPage — "Avis athlètes" : bugs / idées remontés depuis l'app athlète.
 * Accessible : is_certified_coach OU is_admin (comme la Roadmap).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { initials } from "@/lib/initials";
import { feedbackPageLabel } from "@/lib/feedbackPage";
import {
  useAppFeedbackList, useUpdateAppFeedbackStatus, useDeleteAppFeedback,
  FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL,
} from "@/features/shared/hooks/useAppFeedback";
import type { AppFeedbackRow, AppFeedbackKind, AppFeedbackStatus } from "@/features/shared/hooks/useAppFeedback";

const KIND_COLOR: Record<AppFeedbackKind, string>     = { bug: C.rouge, idea: C.ac, other: C.tx3 };
const STATUS_COLOR: Record<AppFeedbackStatus, string> = { new: C.b, in_progress: C.o, done: C.g };
const STATUSES: AppFeedbackStatus[] = ["new", "in_progress", "done"];

type Filter = "all" | AppFeedbackStatus;

function authorName(r: AppFeedbackRow): string {
  const a = r.author;
  if (!a) return "Athlète";
  return [a.first_name, a.last_name].filter(Boolean).join(" ") || a.full_name || "Athlète";
}

/** « 12 nov. · 08:41 » */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

const FILTER_LABEL: Record<Filter, string> = { new: "Nouveaux", in_progress: "En cours", done: "Faits", all: "Tous" };

export default function AthleteFeedbackPage() {
  const { data = [], isLoading, error } = useAppFeedbackList();
  const updateStatus = useUpdateAppFeedbackStatus();
  const remove       = useDeleteAppFeedback();
  const [filter, setFilter] = useState<Filter>("new");

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: data.length, new: 0, in_progress: 0, done: 0 };
    data.forEach(r => { c[r.status]++; });
    return c;
  }, [data]);

  const rows = filter === "all" ? data : data.filter(r => r.status === filter);

  return (
    <div style={{ padding: "24px 20px 48px", maxWidth: 920, margin: "0 auto", boxSizing: "border-box", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ ...DISPLAY, fontWeight: 500, fontSize: 30, lineHeight: 1.1, letterSpacing: "0.06em", color: C.tx, margin: 0 }}>Avis athlètes</h1>
          {!isLoading && !error && (
            <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ac }}>
              {data.length} retour{data.length > 1 ? "s" : ""} · {counts.new} nouveau{counts.new > 1 ? "x" : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", padding: 3, border: "1px solid " + C.brd, borderRadius: 10, gap: 2 }}>
          {(["new", "in_progress", "done", "all"] as Filter[]).map(f => {
            const on = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  height: 30, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 8, border: "none",
                  background: on ? C.s2 : "transparent", color: on ? C.tx : C.tx3,
                  fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                }}
              >
                {FILTER_LABEL[f]}
                <span style={{ ...MONO, marginLeft: 6, color: on ? C.tx2 : C.tx3 }}>{counts[f]}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.tx3, marginTop: 12, marginBottom: 24 }}>
        Bugs et idées envoyés depuis l'app athlète (Mon profil → Signaler un bug / une idée). Visible par l'admin et les coachs certifiés.
      </div>

      {isLoading ? (
        <div style={{ color: C.tx3, fontSize: 13 }}>Chargement…</div>
      ) : error ? (
        <div style={{ color: C.r, fontSize: 13 }}>Impossible de charger les retours (table app_feedback absente ou accès refusé).</div>
      ) : rows.length === 0 ? (
        <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 14, padding: 32, textAlign: "center", color: C.tx3, fontSize: 13 }}>
          Aucun retour {filter !== "all" ? "dans cette catégorie" : "pour l'instant"}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map(r => (
            <div key={r.id} style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 14, padding: "16px 20px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div aria-hidden style={{ ...MONO, width: 36, height: 36, boxSizing: "border-box", borderRadius: "50%", border: "1px solid " + C.ac, color: C.ac, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {initials(authorName(r))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ ...MONO, display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap", color: C.ink, background: KIND_COLOR[r.kind], padding: "4px 9px", borderRadius: 999 }}>
                  {FEEDBACK_KIND_LABEL[r.kind]}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{authorName(r)}</span>
                <span style={{ ...MONO, fontSize: 11.5, color: C.tx3 }}>{fmtDate(r.created_at)}</span>
                {r.page && <span style={{ fontSize: 12, color: C.tx3 }}>· {feedbackPageLabel(r.page)}</span>}
              </div>
              <div style={{ fontSize: 14, color: C.tx2, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 10 }}>{r.content}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {STATUSES.map(s => (
                  <button
                    key={s}
                    disabled={updateStatus.isPending}
                    onClick={() => r.status !== s && updateStatus.mutate({ id: r.id, status: s }, { onError: () => toast.error("Erreur de mise à jour") })}
                    style={{
                      height: 28, display: "flex", alignItems: "center", padding: "0 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                      border: "1px solid " + (r.status === s ? alpha(STATUS_COLOR[s], 0.4) : C.brd),
                      background: r.status === s ? alpha(STATUS_COLOR[s], 0.14) : "transparent",
                      color: r.status === s ? STATUS_COLOR[s] : C.tx3,
                    }}
                  >
                    {FEEDBACK_STATUS_LABEL[s]}
                  </button>
                ))}
                <button
                  aria-label="Supprimer"
                  onClick={() => { if (confirm("Supprimer ce retour ?")) remove.mutate(r.id, { onError: () => toast.error("Erreur de suppression") }); }}
                  style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.tx3, cursor: "pointer", padding: 4 }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
