/**
 * AthleteFeedbackPage — "Avis athlètes" : bugs / idées remontés depuis l'app athlète.
 * Accessible : is_certified_coach OU is_admin (comme la Roadmap).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { C } from "@/lib/theme";
import {
  useAppFeedbackList, useUpdateAppFeedbackStatus, useDeleteAppFeedback,
  FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL,
} from "@/features/shared/hooks/useAppFeedback";
import type { AppFeedbackRow, AppFeedbackKind, AppFeedbackStatus } from "@/features/shared/hooks/useAppFeedback";

const KIND_COLOR: Record<AppFeedbackKind, string>     = { bug: C.r, idea: C.ac, other: C.tx3 };
const STATUS_COLOR: Record<AppFeedbackStatus, string> = { new: C.b, in_progress: C.o, done: C.g };
const STATUSES: AppFeedbackStatus[] = ["new", "in_progress", "done"];

type Filter = "all" | AppFeedbackStatus;

function authorName(r: AppFeedbackRow): string {
  const a = r.author;
  if (!a) return "Athlète";
  return [a.first_name, a.last_name].filter(Boolean).join(" ") || a.full_name || "Athlète";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

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
    <div style={{ padding: "24px 20px", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.tx }}>Avis athlètes</div>
      <div style={{ fontSize: 12, color: C.tx3, marginTop: 4, marginBottom: 18 }}>
        Bugs et idées envoyés depuis l'app athlète (Mon profil → Signaler un bug / une idée).
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {(["new", "in_progress", "done", "all"] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 12px", borderRadius: 4, border: "1px solid " + (filter === f ? C.ac : C.brd),
              background: filter === f ? C.acS : "transparent", color: filter === f ? C.ac : C.tx2,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {f === "all" ? "Tous" : FEEDBACK_STATUS_LABEL[f]} · {counts[f]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ color: C.tx3, fontSize: 13 }}>Chargement…</div>
      ) : error ? (
        <div style={{ color: C.r, fontSize: 13 }}>Impossible de charger les retours (table app_feedback absente ou accès refusé).</div>
      ) : rows.length === 0 ? (
        <div style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: 32, textAlign: "center", color: C.tx3, fontSize: 13 }}>
          Aucun retour {filter !== "all" ? "dans cette catégorie" : "pour l'instant"}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(r => (
            <div key={r.id} style={{ background: C.s1, border: "1px solid " + C.brd, borderRadius: 6, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: KIND_COLOR[r.kind], background: KIND_COLOR[r.kind] + "18", padding: "2px 8px", borderRadius: 5 }}>
                  {FEEDBACK_KIND_LABEL[r.kind]}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{authorName(r)}</span>
                <span style={{ fontSize: 11, color: C.tx3 }}>{fmtDate(r.created_at)}</span>
                {r.page && <span style={{ fontSize: 11, color: C.tx3 }}>· {r.page}</span>}
              </div>
              <div style={{ fontSize: 13, color: C.tx2, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 12 }}>{r.content}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {STATUSES.map(s => (
                  <button
                    key={s}
                    disabled={updateStatus.isPending}
                    onClick={() => r.status !== s && updateStatus.mutate({ id: r.id, status: s }, { onError: () => toast.error("Erreur de mise à jour") })}
                    style={{
                      padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      border: "1px solid " + (r.status === s ? STATUS_COLOR[s] : C.brd),
                      background: r.status === s ? STATUS_COLOR[s] + "20" : "transparent",
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
          ))}
        </div>
      )}
    </div>
  );
}
