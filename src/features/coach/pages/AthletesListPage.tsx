import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { SectionHead } from "@/features/shared/components/ordi/OrdiUi";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { ChevronDown, ChevronRight, Copy, Eye, EyeOff, Plus, Users, X } from "lucide-react";
import ClaimLinkButton from "@/features/coach/components/ClaimLinkButton";
import { useRemoveCoCoach, useUnlinkAthlete } from "@/features/shared/hooks/useCoCoach";

const KICK = "agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-tx2";
const ELLIPSIS = "overflow-hidden text-ellipsis";
const PILL = "agon-mono rounded-full text-[11px] font-medium uppercase tracking-[0.08em] text-agon-ink";
const SQUARE = "flex size-8 flex-none cursor-pointer items-center justify-center rounded-[8px] border";
const OVERLAY = "fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-6";
const DIALOG = "w-full max-w-[340px] rounded-[6px] border border-agon-brd bg-agon-s1 p-6";
const CANCEL = "flex-1 rounded-[4px] border border-agon-brd-l bg-transparent py-3 text-[13px] font-semibold text-agon-tx2";

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
    const tag = a.co_coached_by_me ? { label: "Co-coach", bg: "bg-agon-patine" } : a.co_coach_id ? { label: "2 coachs", bg: "bg-agon-info" } : null;
    const line = [a.age ? `${a.age} ans` : null, a.height_cm ? `${a.height_cm} cm` : null].filter(Boolean).join(" · ");
    return (
      <div key={a.id} className={cn("flex items-center gap-2", hidden && "opacity-60")}>
        <button
          onClick={() => navigate(`/coach/athletes/${a.id}/planning`)}
          className={cn(
            "relative flex h-[68px] min-w-0 flex-1 cursor-pointer items-center gap-3.5 overflow-hidden rounded-[14px] border py-0 pl-[18px] pr-4 text-left text-agon-tx",
            pending ? "border-agon-alerte/45 bg-agon-alerte/[0.12]" : "border-agon-brd bg-agon-accent/[0.12]",
          )}
        >
          <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", pending ? "bg-agon-alerte" : "bg-agon-accent")} />
          <span
            className={cn(
              "agon-mono flex size-10 flex-none items-center justify-center rounded-full border-[1.5px] text-[13px] font-medium text-agon-tx",
              pending ? "border-agon-alerte bg-agon-alerte/[0.24]" : "border-agon-accent bg-transparent",
            )}
          >
            {a.full_name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 whitespace-nowrap text-[15px] font-medium leading-5">
              <span className={ELLIPSIS}>{a.full_name}</span>
              {tag && (
                <span
                  title={a.co_coached_by_me ? "Tu es co-coach de cet athlète" : "Cet athlète a un co-coach"}
                  className={cn(PILL, "flex-none px-[9px] py-0.5 leading-[14px]", tag.bg)}
                >
                  {tag.label}
                </span>
              )}
            </span>
            {pending ? (
              <span className="mt-[3px] block leading-4">
                <span className={cn(PILL, "whitespace-nowrap bg-agon-alerte px-2 py-px")}>En attente de première connexion</span>
              </span>
            ) : (
              <span className="agon-mono mt-[3px] block whitespace-nowrap text-[11.5px] leading-4 text-agon-tx2">
                {line || "Profil non renseigné"}
              </span>
            )}
          </span>
          <ChevronRight size={18} className="text-agon-tx3" />
        </button>

        {!a.co_coached_by_me && pending ? <ClaimLinkButton athleteId={a.id} pending color={C.o} /> : <span className="w-8 flex-none" />}

        <button
          onClick={() => handleToggleHidden(a.id, !hidden)}
          title={hidden ? "Réafficher" : "Masquer"}
          aria-label={hidden ? `Réafficher ${a.full_name}` : `Masquer ${a.full_name}`}
          className={cn(SQUARE, "border-agon-brd-l bg-agon-s1 text-agon-tx3")}
        >
          {hidden ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>

        <button
          onClick={() => setConfirmRemove(a.id)}
          title="Retirer"
          aria-label={`Retirer ${a.full_name}`}
          className={cn(SQUARE, "border-agon-erreur/55 bg-agon-erreur/[0.12] text-agon-erreur")}
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
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 pb-[60px] pt-6 md:px-6 md:pt-10">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="agon-display m-0 text-[30px] font-medium uppercase leading-[1.1] tracking-[0.06em] text-agon-tx">Athlètes</h1>
          <span className={KICK}>
            <span className="text-agon-accent">{otherAthletes.length}</span> athlète{otherAthletes.length > 1 ? "s" : ""} liés à ton compte
          </span>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          title="Ajouter un athlète"
          aria-label="Ajouter un athlète"
          className="flex size-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-[11px] border-0 bg-agon-accent text-agon-ink"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Code coach */}
      <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[14px] border border-agon-accent/45 bg-agon-accent/[0.12] py-5 pl-[25px] pr-[22px] sm:flex-nowrap">
        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-agon-accent" />
        <div className="flex flex-col gap-1.5">
          <span className={KICK}>Code coach</span>
          <span className="agon-mono text-[26px] leading-[1.1] tracking-[0.24em] text-agon-accent sm:text-[32px]">
            {profile?.coach_code || "------"}
          </span>
        </div>
        <button
          onClick={handleCopyCode}
          className="inline-flex h-[34px] cursor-pointer items-center gap-2 whitespace-nowrap rounded-[10px] border border-agon-accent/55 bg-agon-bg/55 px-3.5 text-[12px] text-agon-accent"
        >
          <Copy size={14} /> Copier
        </button>
      </div>

      <SectionHead n={1} title="Mes athlètes" />

      {/* Athlete list */}
      <div className="-mt-2 flex flex-col gap-2">
        {loading ? (
          <>
            <Skeleton className="h-16 rounded-[6px] bg-agon-s1" />
            <Skeleton className="h-16 rounded-[6px] bg-agon-s1" />
          </>
        ) : (
          <>
            {canAddSelf && (
              <button
                onClick={handleAddSelf}
                className="cursor-pointer rounded-[14px] border border-agon-brd-l bg-transparent px-[18px] py-3.5 text-left text-[13px] font-semibold text-agon-accent"
              >
                + M'ajouter comme athlète
              </button>
            )}

            {showSelfRow && user && profile && (
              <div className="flex h-[68px] items-center gap-3 rounded-[14px] border border-agon-accent/25 bg-agon-accent-doux py-0 pl-[18px] pr-4">
                <button
                  onClick={() => navigate(`/coach/athletes/${user.id}/planning`)}
                  className="flex flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left"
                >
                  <div className="flex size-[38px] flex-shrink-0 items-center justify-center rounded-full bg-agon-accent/[0.145] text-[15px] font-bold text-agon-accent">
                    {profile.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-agon-tx">{profile.full_name}</div>
                    <div className="text-[11px] text-agon-accent">
                      {selfCoCoached ? "Mon programme personnel · en duo avec mon coach" : "Mon programme personnel"}
                    </div>
                  </div>
                </button>
                {isHybrid && (
                  <button
                    onClick={() => setConfirmRemove(user.id)}
                    title="Me retirer de mes athlètes"
                    className="flex size-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-[4px] border border-agon-erreur/25 bg-agon-erreur/[0.08] text-[16px] text-agon-erreur"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {otherAthletes.map((a) => renderAthleteRow(a, false))}

            {otherAthletes.length === 0 && hiddenOthers.length > 0 && (
              <div className="px-0.5 py-1 text-[12px] text-agon-tx3">Tous tes athlètes sont masqués.</div>
            )}

            {hiddenOthers.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setShowHidden((v) => !v)}
                  aria-expanded={showHidden}
                  className="agon-mono flex cursor-pointer items-center gap-2 border-0 bg-transparent px-0.5 py-1 text-[11px] uppercase tracking-[0.12em] text-agon-tx3"
                >
                  <ChevronDown size={14} className={cn("transition-transform duration-150", !showHidden && "-rotate-90")} />
                  Masqués ({hiddenOthers.length})
                </button>
                {showHidden && (
                  <div className="mt-2 flex flex-col gap-2">
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
        <div className={OVERLAY} onClick={() => !creating && setAddOpen(false)}>
          <form onSubmit={handleCreateAthlete} onClick={(e) => e.stopPropagation()} className={DIALOG}>
            <div className="mb-1.5 text-[15px] font-bold text-agon-tx">Ajouter un athlète</div>
            <div className="mb-4 text-[12px] text-agon-tx3">
              Sa page est créée tout de suite : tu peux le programmer avant sa première connexion.
              Un lien à lui envoyer apparaîtra à côté de son nom.
            </div>
            {[
              { label: "Prénom", value: newFirst, set: setNewFirst, auto: true },
              { label: "Nom", value: newLast, set: setNewLast, auto: false },
            ].map((f) => (
              <label key={f.label} className="mb-3 block">
                <span className="mb-1 block text-[12px] text-agon-tx2">{f.label}</span>
                <input
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  autoFocus={f.auto}
                  required
                  maxLength={100}
                  className="w-full rounded-[4px] border border-agon-brd-l bg-agon-s2 px-3 py-2.5 text-[14px] text-agon-tx outline-none"
                />
              </label>
            ))}
            <div className="mt-2 flex gap-2.5">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                disabled={creating}
                className={cn(CANCEL, creating ? "cursor-default" : "cursor-pointer")}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating || !newFirst.trim() || !newLast.trim()}
                className={cn(
                  "flex-1 rounded-[4px] border-0 bg-agon-coach py-3 text-[13px] font-bold text-agon-ink",
                  creating ? "cursor-default" : "cursor-pointer",
                  (creating || !newFirst.trim() || !newLast.trim()) && "opacity-50",
                )}
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
          <div className={OVERLAY} onClick={() => !removing && setConfirmRemove(null)}>
            <div className={DIALOG} onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 text-[15px] font-bold text-agon-tx">
                {isSelf ? "Te retirer de tes athlètes ?" : "Retirer l'athlète ?"}
              </div>
              <div className="mb-5 text-[13px] text-agon-tx3">
                {isSelf
                  ? selfCoCoached
                    ? "Tu ne seras plus co-coach de ton entraînement : ton coach référent continue seul. Tu pourras te rajouter depuis ton profil."
                    : "Tu ne seras plus ton propre coach. Ton historique est conservé, tu pourras te rajouter à tout moment."
                  : (a as { co_coached_by_me?: boolean } | null | undefined)?.co_coached_by_me
                    ? <>Tu ne co-coacheras plus <strong className="text-agon-tx">{a?.full_name}</strong>. Son coach référent garde tout son suivi.</>
                    : <><strong className="text-agon-tx">{a?.full_name}</strong> sera dissocié de ton compte{(a as { co_coach_id?: string | null } | null | undefined)?.co_coach_id ? ", et son co-coach perdra aussi l'accès" : ""}.</>}
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setConfirmRemove(null)}
                  disabled={removing}
                  className={cn(CANCEL, removing ? "cursor-default" : "cursor-pointer")}
                >
                  Annuler
                </button>
                <button
                  onClick={() => handleRemoveAthlete(confirmRemove)}
                  disabled={removing}
                  className={cn(
                    "flex-1 rounded-[4px] border-0 py-3 text-[13px] font-bold",
                    removing ? "cursor-default bg-agon-s2 text-agon-tx3" : "cursor-pointer bg-agon-erreur text-agon-tx",
                  )}
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
