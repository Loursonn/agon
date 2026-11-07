import { useState } from "react";
import { toast } from "sonner";
import { usePerformanceReviews, useReviewMeasurement } from "@/features/shared/hooks/useReferences";
import type { PerformanceReview } from "@/api/references";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  coachId: string;
  athleteId?: string;
  C: Record<string, string>;
}

// ── Composant ─────────────────────────────────────────────────────────────────

/**
 * Mesures envoyées par l'athlète, à valider (elles deviennent la référence
 * active) ou rejeter. Validation = une RPC atomique ; références, séances
 * énergie et accueil coach sont invalidés tout de suite.
 */
export default function CoachPerfNotification({ coachId, athleteId, C }: Props) {
  // Pour un athlète donné : toutes ses alertes (la RLS les ouvre à ses deux
  // coachs, référent et co-coach). Sinon : celles adressées à ce coach.
  const { data, isLoading: loading, isError } = usePerformanceReviews(athleteId ? { athleteId } : { coachId });
  const review = useReviewMeasurement();
  const [processing, setProcessing] = useState<string | null>(null);
  const notifications = (data ?? []).map((n) => ({
    ...n,
    athlete_name: n.athleteName ?? undefined,
    metric_name: n.metricName ?? undefined,
    value: n.value ?? undefined,
    unit: n.unit ?? undefined,
    date: n.date ?? undefined,
    test_title: n.testTitle ?? undefined,
  }));

  const decide = async (notif: PerformanceReview, approve: boolean) => {
    setProcessing(notif.id);
    try {
      await review.mutateAsync({ notificationId: notif.id, logId: notif.performanceLogId, athleteId: notif.athleteId, approve });
      toast.success(approve ? "Performance validée — référence active" : "Performance rejetée");
    } catch {
      toast.error(approve ? "Validation non enregistrée — vérifie ta connexion" : "Rejet non enregistré — vérifie ta connexion");
    } finally {
      setProcessing(null);
    }
  };
  const handleApprove = (notif: PerformanceReview) => decide(notif, true);
  const handleReject = (notif: PerformanceReview) => decide(notif, false);

  const pending = notifications.filter(n => n.status === "pending");
  const resolved = notifications.filter(n => n.status !== "pending");

  return (
    <div>
      {/* Compteur badge */}
      {pending.length > 0 && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 4, background: "rgba(245,166,35,0.12)", border: "1px solid rgba(245,166,35,0.3)", marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#F5A623" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#F5A623" }}>{pending.length} performance{pending.length > 1 ? "s" : ""} à valider</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: C.tx3, fontSize: 12 }}>Chargement…</div>
      ) : isError ? (
        <div style={{ background: C.s1, borderRadius: 6, padding: "20px", border: "1px solid " + C.brd, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.tx3 }}>Validations non chargées — vérifie ta connexion</div>
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ background: C.s1, borderRadius: 6, padding: "20px", border: "1px solid " + C.brd, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.tx3 }}>Aucune notification de performance</div>
        </div>
      ) : (
        <>
          {/* Notifications en attente */}
          {pending.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                En attente de validation
              </div>
              {pending.map(notif => (
                <div key={notif.id} style={{ background: C.s1, borderRadius: 6, padding: "14px 16px", border: "1px solid rgba(245,166,35,0.3)", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{notif.athlete_name || "Athlète"}</div>
                      <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                        {notif.date} {notif.test_title ? "· Test : " + notif.test_title : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#F5A623" }}>{notif.value}</div>
                      <div style={{ fontSize: 10, color: C.tx3 }}>{notif.unit}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: C.tx2, marginBottom: 12, padding: "8px 12px", borderRadius: 4, background: C.s2 }}>
                    <strong>{notif.metric_name}</strong> = {notif.value} {notif.unit}
                  </div>
                  <div style={{ fontSize: 11, color: C.tx3, marginBottom: 10 }}>
                    Valider activera cette valeur comme <strong style={{ color: C.g }}>référence active</strong> pour le calcul des intensités.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleReject(notif)}
                      disabled={processing === notif.id}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 4, border: "1px solid rgba(239,75,75,0.3)", background: "rgba(239,75,75,0.08)", color: "#FF5A33", fontSize: 12, fontWeight: 700, cursor: processing === notif.id ? "default" : "pointer", fontFamily: "inherit" }}
                    >
                      {processing === notif.id ? "…" : "Rejeter"}
                    </button>
                    <button
                      onClick={() => handleApprove(notif)}
                      disabled={processing === notif.id}
                      style={{ flex: 2, padding: "10px 0", borderRadius: 4, border: "none", background: processing === notif.id ? C.s2 : C.g, color: processing === notif.id ? C.tx3 : "#fff", fontSize: 12, fontWeight: 700, cursor: processing === notif.id ? "default" : "pointer", fontFamily: "inherit" }}
                    >
                      {processing === notif.id ? "…" : "✓ Valider et activer comme référence"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Historique */}
          {resolved.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
                Historique
              </div>
              {resolved.slice(0, 5).map(notif => (
                <div key={notif.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s1, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: notif.status === "approved" ? C.g : "#FF5A33", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{notif.athlete_name} — {notif.metric_name}</div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>{notif.date} · {notif.value} {notif.unit}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: notif.status === "approved" ? C.g + "20" : "rgba(239,75,75,0.12)", color: notif.status === "approved" ? C.g : "#FF5A33" }}>
                    {notif.status === "approved" ? "Validé" : "Rejeté"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
