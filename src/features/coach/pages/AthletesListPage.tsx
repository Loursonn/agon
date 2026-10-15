import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { C } from "@/lib/theme";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { Users } from "lucide-react";

export default function AthletesListPage() {
  const { profile, athletes, user, loading, removeSelfAsAthlete, becomeSelfCoach } = useAuth();
  const navigate = useNavigate();
  const isCoachAthlete = profile?.role === "coach" || profile?.role === "coach_athlete";
  // Coach-athlète : sa ligne perso dépend de coach_id (self = son propre athlète)
  const isHybrid = profile?.role === "coach_athlete";
  const isSelfCoached = !!user && profile?.coach_id === user.id;
  const showSelfRow = isCoachAthlete && (!isHybrid || isSelfCoached);
  const canAddSelf = isHybrid && !profile?.coach_id;
  // Le coach-athlète auto-coaché remonte aussi dans athletes : on évite le doublon
  const otherAthletes = athletes.filter((a) => a.id !== user?.id);

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function handleRemoveAthlete(athleteId: string) {
    if (removing) return;
    setRemoving(true);
    try {
      if (athleteId === user?.id) {
        await removeSelfAsAthlete();
        toast.success("Tu ne fais plus partie de tes athlètes");
        return;
      }
      await supabase.rpc("unlink_athlete", { athlete_id: athleteId });
      toast.success("Athlète retiré");
      window.location.reload();
    } catch {
      toast.error("Erreur lors du retrait");
    } finally {
      setRemoving(false);
      setConfirmRemove(null);
    }
  }

  async function handleAddSelf() {
    try {
      await becomeSelfCoach();
      toast.success("Tu fais partie de tes athlètes");
    } catch {
      toast.error("Erreur");
    }
  }

  async function handleCopyCode() {
    if (!profile?.coach_code) return;
    await navigator.clipboard.writeText(profile.coach_code);
    toast.success("Code copié !");
  }

  return (
    <div style={{ padding: "24px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>Athlètes</div>
          <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>
            {otherAthletes.length} athlète{otherAthletes.length > 1 ? "s" : ""} liés à ton compte
          </div>
        </div>
      </div>

      {/* Code coach */}
      <div
        style={{
          background: C.s1, borderRadius: 6, padding: "14px 16px",
          border: "1px solid " + C.brd, marginBottom: 20,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
            Code coach
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.coach, letterSpacing: "0.2em" }}>
            {profile?.coach_code || "------"}
          </div>
        </div>
        <button
          onClick={handleCopyCode}
          style={{
            padding: "6px 14px", borderRadius: 4,
            border: "1px solid " + C.coach + "50", background: C.coachS,
            color: C.coach, fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Copier
        </button>
      </div>

      {/* Athlete list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <>
            <Skeleton style={{ height: 64, borderRadius: 6, background: C.s1 }} />
            <Skeleton style={{ height: 64, borderRadius: 6, background: C.s1 }} />
          </>
        ) : (
          <>
            {canAddSelf && (
              <button
                onClick={handleAddSelf}
                style={{
                  padding: "12px 16px", borderRadius: 6,
                  border: "1px dashed " + C.ac + "60", background: "transparent",
                  color: C.ac, fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
              >
                + M'ajouter comme athlète
              </button>
            )}

            {showSelfRow && user && profile && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderRadius: 6,
                  border: "1px solid " + C.ac + "40", background: C.acS,
                }}
              >
                <button
                  onClick={() => navigate(`/coach/athletes/${user.id}/planning`)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", gap: 12,
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "inherit", textAlign: "left", padding: 0,
                  }}
                >
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: C.ac + "25",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 700, color: C.ac, flexShrink: 0,
                    }}
                  >
                    {profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>
                      {profile.full_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.ac }}>Mon programme personnel</div>
                  </div>
                </button>
                {isHybrid && (
                  <button
                    onClick={() => setConfirmRemove(user.id)}
                    title="Me retirer de mes athlètes"
                    style={{
                      width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                      border: "1px solid " + C.r + "40", background: "rgba(239,75,75,0.08)",
                      color: C.r, fontSize: 16, cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {otherAthletes.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <button
                  onClick={() => navigate(`/coach/athletes/${a.id}/planning`)}
                  style={{
                    flex: 1, display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 6,
                    border: "1px solid " + C.brdL, background: C.s1,
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    transition: "border-color 150ms",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = C.coach + "60")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = C.brdL)}
                >
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: C.coach + "25", border: "1px solid " + C.coach + "40",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 700, color: C.coach, flexShrink: 0,
                    }}
                  >
                    {a.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{a.full_name}</div>
                    <div style={{ fontSize: 11, color: C.tx3 }}>
                      {[a.age ? `${a.age} ans` : null, a.height_cm ? `${a.height_cm} cm` : null]
                        .filter(Boolean).join(" · ") || "Profil non renseigné"}
                    </div>
                  </div>
                  <span style={{ fontSize: 16, color: C.tx3 }}>›</span>
                </button>

                <button
                  onClick={() => setConfirmRemove(a.id)}
                  title="Retirer"
                  style={{
                    width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                    border: "1px solid " + C.r + "40", background: "rgba(239,75,75,0.08)",
                    color: C.r, fontSize: 16, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 150ms",
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            {otherAthletes.length === 0 && !isCoachAthlete && (
              <EmptyState
                icon={Users}
                title="Aucun athlète pour l'instant"
                description="Partage ton code coach pour que tes athlètes te rejoignent."
              />
            )}
          </>
        )}
      </div>

      {/* Confirm remove modal */}
      {confirmRemove && (() => {
        const isSelf = confirmRemove === user?.id;
        const a = isSelf ? profile : athletes.find((x) => x.id === confirmRemove);
        return (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 300,
              background: "rgba(0,0,0,0.7)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
            }}
            onClick={() => !removing && setConfirmRemove(null)}
          >
            <div
              style={{
                background: C.s1, borderRadius: 6, padding: 24,
                maxWidth: 340, width: "100%", border: "1px solid " + C.brd,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
                {isSelf ? "Te retirer de tes athlètes ?" : "Retirer l'athlète ?"}
              </div>
              <div style={{ fontSize: 13, color: C.tx3, marginBottom: 20 }}>
                {isSelf
                  ? "Tu ne seras plus ton propre coach. Ton historique est conservé, tu pourras te rajouter à tout moment."
                  : <><strong style={{ color: C.tx }}>{a?.full_name}</strong> sera dissocié de ton compte.</>}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setConfirmRemove(null)}
                  disabled={removing}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 4,
                    border: "1px solid " + C.brdL, background: "transparent",
                    color: C.tx2, fontSize: 13, fontWeight: 600,
                    cursor: removing ? "default" : "pointer", fontFamily: "inherit",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleRemoveAthlete(confirmRemove)}
                  disabled={removing}
                  style={{
                    flex: 1, padding: "12px 0", borderRadius: 4,
                    border: "none", background: removing ? C.s2 : C.r,
                    color: removing ? C.tx3 : "#fff", fontSize: 13, fontWeight: 700,
                    cursor: removing ? "default" : "pointer", fontFamily: "inherit",
                  }}
                >
                  {removing ? "Retrait…" : "Retirer"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
