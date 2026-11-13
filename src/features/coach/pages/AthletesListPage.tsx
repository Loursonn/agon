import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, KICK, MONO, SectionHead } from "@/features/shared/components/ordi/OrdiUi";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, Plus, Users, X } from "lucide-react";
import ClaimLinkButton from "@/features/coach/components/ClaimLinkButton";
import { useRemoveCoCoach, useUnlinkAthlete } from "@/features/shared/hooks/useCoCoach";

export default function AthletesListPage() {
  const { profile, athletes, user, loading, canCoachSelf, selfCoCoached, removeSelfAsAthlete, becomeSelfCoach, hiddenAthletes, setAthleteHidden, refreshAthletes, createPendingAthlete, removePendingAthlete } = useAuth();
  const navigate = useNavigate();
  const removeCoCoach = useRemoveCoCoach();
  const unlinkAthlete = useUnlinkAthlete();
  const isCoachAthlete = profile?.role === "coach" || profile?.role === "coach_athlete";
  // Coach-athlète : sa ligne perso dépend de coach_id (self = son propre athlète)
  const isHybrid = profile?.role === "coach_athlete";
  const showSelfRow = canCoachSelf;
  const canAddSelf = isHybrid && !profile?.coach_id;
  // Le coach-athlète auto-coaché remonte aussi dans athletes : on évite le doublon
  const otherAthletes = athletes.filter((a) => a.id !== user?.id);
  const hiddenOthers = hiddenAthletes.filter((a) => a.id !== user?.id);

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const [showHidden, setShowHidden] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreateAthlete(e: React.FormEvent) {
    e.preventDefault();
    if (creating || !newFirst.trim() || !newLast.trim()) return;
    setCreating(true);
    try {
      const id = await createPendingAthlete(newFirst.trim(), newLast.trim());
      toast.success("Athlète créé");
      setAddOpen(false);
      setNewFirst("");
      setNewLast("");
      navigate(`/coach/athletes/${id}/planning`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleHidden(athleteId: string, hidden: boolean) {
    try {
      await setAthleteHidden(athleteId, hidden);
      toast.success(hidden ? "Athlète masqué" : "Athlète réaffiché");
    } catch {
      toast.error("Erreur lors du changement de visibilité");
    }
  }

  function renderAthleteRow(a: (typeof athletes)[number], hidden: boolean) {
    // Planche CoachAthletes : carte 68 px, liseré or (orange si en attente), pastille 2 coachs / co-coach.
    const pending = !!a.is_pending;
    const tone = pending ? C.o : C.ac;
    const tag = a.co_coached_by_me ? { label: "Co-coach", color: C.pat } : a.co_coach_id ? { label: "2 coachs", color: C.b } : null;
    const line = [a.age ? `${a.age} ans` : null, a.height_cm ? `${a.height_cm} cm` : null].filter(Boolean).join(" · ");
    return (
      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, opacity: hidden ? 0.6 : 1 }}>
        <button
          onClick={() => navigate(`/coach/athletes/${a.id}/planning`)}
          style={{
            position: "relative", overflow: "hidden", flex: 1, minWidth: 0, height: 68, boxSizing: "border-box",
            display: "flex", alignItems: "center", gap: 14, padding: "0 16px 0 18px", borderRadius: 14,
            border: `1px solid ${pending ? alpha(C.o, 0.45) : C.brd}`,
            background: pending
              ? `radial-gradient(60% 200% at 0% 50%, ${alpha(C.o, 0.22)}, transparent 60%), linear-gradient(${alpha(C.o, 0.12)}, ${alpha(C.o, 0.12)}), ${C.s1}`
              : `linear-gradient(90deg, ${alpha(C.ac, 0.07)}, ${alpha(C.ac, 0)} 45%), ${C.s1}`,
            cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: C.tx,
          }}
        >
          <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: tone }} />
          <span style={{
            width: 40, height: 40, boxSizing: "border-box", borderRadius: "50%", flex: "none",
            display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${tone}`,
            background: pending ? `radial-gradient(circle at 30% 25%, ${alpha(C.o, 0.4)}, ${alpha(C.o, 0.1)} 70%)` : "transparent",
            color: C.tx, fontWeight: 500, ...MONO, fontSize: 13,
          }}>
            {a.full_name.charAt(0).toUpperCase()}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 500, lineHeight: "20px", whiteSpace: "nowrap" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{a.full_name}</span>
              {tag && (
                <span
                  title={a.co_coached_by_me ? "Tu es co-coach de cet athlète" : "Cet athlète a un co-coach"}
                  style={{ ...MONO, fontSize: 10.5, fontWeight: 500, lineHeight: "14px", letterSpacing: "0.10em", textTransform: "uppercase", flex: "none", color: "#0E0C0A", background: tag.color, borderRadius: 999, padding: "2px 9px" }}
                >
                  {tag.label}
                </span>
              )}
            </span>
            {pending ? (
              <span style={{ display: "block", marginTop: 3, lineHeight: "16px" }}>
                <span style={{ ...MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", color: "#0E0C0A", background: C.o, borderRadius: 999, padding: "1px 8px" }}>
                  En attente de première connexion
                </span>
              </span>
            ) : (
              <span style={{ display: "block", ...MONO, fontSize: 11.5, lineHeight: "16px", color: C.tx2, marginTop: 3, whiteSpace: "nowrap" }}>
                {line || "Profil non renseigné"}
              </span>
            )}
          </span>
          <ChevronRight size={18} color={C.tx3} />
        </button>

        {!a.co_coached_by_me && pending ? <ClaimLinkButton athleteId={a.id} pending color={C.o} /> : <span style={{ width: 32, flex: "none" }} />}

        <button
          onClick={() => handleToggleHidden(a.id, !hidden)}
          title={hidden ? "Réafficher" : "Masquer"}
          aria-label={hidden ? `Réafficher ${a.full_name}` : `Masquer ${a.full_name}`}
          style={squareBtn(C.brdL, C.s1, C.tx3)}
        >
          {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>

        <button
          onClick={() => setConfirmRemove(a.id)}
          title="Retirer"
          aria-label={`Retirer ${a.full_name}`}
          style={squareBtn(alpha(C.r, 0.55), alpha(C.r, 0.12), C.r)}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  async function handleRemoveAthlete(athleteId: string) {
    if (removing) return;
    setRemoving(true);
    try {
      if (athleteId === user?.id) {
        if (selfCoCoached) {
          // Co-coach de soi-même : on retire juste ce rôle, le coach référent reste
          await removeCoCoach.mutateAsync({ athleteId });
          await refreshAthletes();
          toast.success("Tu ne co-coaches plus ton entraînement");
          return;
        }
        await removeSelfAsAthlete();
        toast.success("Tu ne fais plus partie de tes athlètes");
        return;
      }
      const target = [...athletes, ...hiddenAthletes].find((x) => x.id === athleteId);
      if (target?.is_pending) {
        await removePendingAthlete(athleteId);
        toast.success("Athlète supprimé");
        return;
      }
      if (target?.co_coached_by_me) {
        // Co-coach : il quitte le co-coaching, le coach référent garde l'athlète
        await removeCoCoach.mutateAsync({ athleteId });
        await refreshAthletes();
        toast.success("Tu ne co-coaches plus cet athlète");
        return;
      }
      // Avant : l'erreur de la RPC était ignorée → « Athlète retiré » même en cas d'échec.
      await unlinkAthlete.mutateAsync({ athleteId });
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
    <div style={{ padding: "40px 24px 60px", maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 style={{ margin: 0, ...DISPLAY, fontWeight: 500, fontSize: 30, lineHeight: 1.1, letterSpacing: "0.06em", textTransform: "uppercase", color: C.tx }}>Athlètes</h1>
          <span style={{ ...KICK }}>
            <span style={{ color: C.ac }}>{otherAthletes.length}</span> athlète{otherAthletes.length > 1 ? "s" : ""} liés à ton compte
          </span>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          title="Ajouter un athlète"
          aria-label="Ajouter un athlète"
          style={{
            width: 44, height: 44, boxSizing: "border-box", borderRadius: 11, flexShrink: 0, border: "none",
            background: C.ac, boxShadow: `0 6px 22px ${alpha(C.ac, 0.35)}`, color: "#0E0C0A", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Code coach */}
      <div style={{
        position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        padding: "20px 22px 20px 25px", borderRadius: 14, border: `1px solid ${alpha(C.ac, 0.45)}`,
        background: `linear-gradient(90deg, ${alpha(C.ac, 0.14)}, ${alpha(C.ac, 0.03)}), ${C.s1}`,
      }}>
        <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.ac }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...KICK, color: C.tx2 }}>Code coach</span>
          <span style={{ ...MONO, fontSize: 32, lineHeight: 1.1, letterSpacing: "0.24em", color: C.ac, textShadow: `0 0 24px ${alpha(C.ac, 0.35)}` }}>
            {profile?.coach_code || "------"}
          </span>
        </div>
        <button
          onClick={handleCopyCode}
          style={{
            height: 34, boxSizing: "border-box", display: "inline-flex", alignItems: "center", gap: 8, padding: "0 14px",
            borderRadius: 10, border: `1px solid ${alpha(C.ac, 0.55)}`, background: alpha(C.bg, 0.55),
            color: C.ac, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          <Copy size={14} /> Copier
        </button>
      </div>

      <SectionHead n={1} title="Mes athlètes" />

      {/* Athlete list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: -8 }}>
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
                  padding: "14px 18px", borderRadius: 14,
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
                  height: 68, boxSizing: "border-box", padding: "0 16px 0 18px", borderRadius: 14,
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
                    <div style={{ fontSize: 11, color: C.ac }}>
                      {selfCoCoached ? "Mon programme personnel · en duo avec mon coach" : "Mon programme personnel"}
                    </div>
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

            {otherAthletes.map((a) => renderAthleteRow(a, false))}

            {otherAthletes.length === 0 && hiddenOthers.length > 0 && (
              <div style={{ fontSize: 12, color: C.tx3, padding: "4px 2px" }}>
                Tous tes athlètes sont masqués.
              </div>
            )}

            {hiddenOthers.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => setShowHidden((v) => !v)}
                  aria-expanded={showHidden}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "none", border: "none", padding: "4px 2px",
                    color: C.tx3, ...MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  <ChevronDown
                    size={14}
                    style={{ transform: showHidden ? "none" : "rotate(-90deg)", transition: "transform 150ms" }}
                  />
                  Masqués ({hiddenOthers.length})
                </button>
                {showHidden && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {hiddenOthers.map((a) => renderAthleteRow(a, true))}
                  </div>
                )}
              </div>
            )}

            {otherAthletes.length === 0 && hiddenOthers.length === 0 && !isCoachAthlete && (
              <EmptyState
                icon={Users}
                title="Aucun athlète pour l'instant"
                description="Partage ton code coach pour que tes athlètes te rejoignent."
              />
            )}
          </>
        )}
      </div>

      {/* Ajout d'un athlète avant sa première connexion */}
      {addOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
          onClick={() => !creating && setAddOpen(false)}
        >
          <form
            onSubmit={handleCreateAthlete}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.s1, borderRadius: 6, padding: 24,
              maxWidth: 340, width: "100%", border: "1px solid " + C.brd,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 6 }}>Ajouter un athlète</div>
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 16 }}>
              Sa page est créée tout de suite : tu peux le programmer avant sa première connexion.
              Un lien à lui envoyer apparaîtra à côté de son nom.
            </div>
            {[
              { label: "Prénom", value: newFirst, set: setNewFirst, auto: true },
              { label: "Nom", value: newLast, set: setNewLast, auto: false },
            ].map((f) => (
              <label key={f.label} style={{ display: "block", marginBottom: 12 }}>
                <span style={{ display: "block", fontSize: 12, color: C.tx2, marginBottom: 4 }}>{f.label}</span>
                <input
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  autoFocus={f.auto}
                  required
                  maxLength={100}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 4,
                    border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
                    fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
              </label>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={creating}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 4,
                  border: "1px solid " + C.brdL, background: "transparent",
                  color: C.tx2, fontSize: 13, fontWeight: 600,
                  cursor: creating ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating || !newFirst.trim() || !newLast.trim()}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 4,
                  border: "none", background: C.coach, color: "#000",
                  fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                  cursor: creating ? "default" : "pointer",
                  opacity: creating || !newFirst.trim() || !newLast.trim() ? 0.5 : 1,
                }}
              >
                {creating ? "Création…" : "Créer"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm remove modal */}
      {confirmRemove && (() => {
        const isSelf = confirmRemove === user?.id;
        const a = isSelf ? profile : [...athletes, ...hiddenAthletes].find((x) => x.id === confirmRemove);
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
                  ? selfCoCoached
                    ? "Tu ne seras plus co-coach de ton entraînement : ton coach référent continue seul. Tu pourras te rajouter depuis ton profil."
                    : "Tu ne seras plus ton propre coach. Ton historique est conservé, tu pourras te rajouter à tout moment."
                  : (a as { co_coached_by_me?: boolean } | null | undefined)?.co_coached_by_me
                    ? <>Tu ne co-coacheras plus <strong style={{ color: C.tx }}>{a?.full_name}</strong>. Son coach référent garde tout son suivi.</>
                    : <><strong style={{ color: C.tx }}>{a?.full_name}</strong> sera dissocié de ton compte{(a as { co_coach_id?: string | null } | null | undefined)?.co_coach_id ? ", et son co-coach perdra aussi l'accès" : ""}.</>}
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

function squareBtn(border: string, background: string, color: string): React.CSSProperties {
  return {
    width: 32, height: 32, boxSizing: "border-box", borderRadius: 8, flexShrink: 0,
    border: `1px solid ${border}`, background, color, cursor: "pointer", fontFamily: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
}
