/**
 * SpecificSessionCard — card du catalogue de séances spécifiques.
 * Badges Sport / Qualité / Format, actions Attribuer · Modifier · Dupliquer · Supprimer.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import SessionPreview from "../energy/SessionPreview";
import type { EnergySessionRow, EnergyGroup } from "@/types/energy";
import type { SpecificSport, PhysicalQuality } from "@/types/specific";
import { isWodBlock } from "@/types/specific";
import { useCreateEnergySession, useVerifyEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { DeleteEnergySessionDialog } from "../energy/DeleteEnergySessionButton";
import { useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";
import { useAuth } from "@/hooks/useAuth";
import { formatSLong } from "@/lib/energy/formatTarget";
import { expandIntervals, computeTotals } from "@/lib/energy";

/** Couleur par défaut d'un sport sans couleur (donnée : reste en style). */
const SPORT_FALLBACK = C.o;

const BADGE = "rounded px-1.5 py-0.5 text-[9px] font-bold";
const FORMAT_TONE = {
  Classique: "bg-agon-succes/[0.125] text-agon-succes",
  Mixte:     "bg-agon-accent/[0.125] text-agon-accent",
  WOD:       "bg-agon-alerte/[0.125] text-agon-alerte",
} as const;

/** Bouton d'action au survol, par teinte (classes écrites en entier). */
const ACTION_TONE = {
  succes: "border-agon-succes/25 bg-agon-succes/[0.071] text-agon-succes",
  accent: "border-agon-accent/25 bg-agon-accent/[0.071] text-agon-accent",
  tx2:    "border-agon-tx2/25 bg-agon-tx2/[0.071] text-agon-tx2",
  erreur: "border-agon-erreur/25 bg-agon-erreur/[0.071] text-agon-erreur",
} as const;

const FIELD = "w-full rounded-[6px] border border-agon-brd bg-agon-s2 px-2.5 py-2 text-[13px] text-agon-tx";
const EMPTY_PREVIEW = "flex h-10 items-center justify-center rounded-[6px] bg-agon-s2";

interface Props {
  session: EnergySessionRow;
  sport?: SpecificSport;
  quality?: PhysicalQuality;
  canEdit: boolean;
  canVerify: boolean;
  canDelete: boolean;
}

export default function SpecificSessionCard({ session, sport, quality, canEdit, canVerify, canDelete }: Props) {
  const navigate = useNavigate();
  const { athletes, profile } = useAuth();
  const createMutation = useCreateEnergySession();
  const verifyMutation = useVerifyEnergySession();
  const assignMutation = useAssignEnergySession();

  const [showAssign, setShowAssign] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [assignAthleteId, setAssignAthleteId] = useState("");
  const [assignDate, setAssignDate] = useState(new Date().toISOString().slice(0, 10));
  const [hovered, setHovered] = useState(false);

  const isClassique = session.format === "classique";
  const accent = sport?.color || SPORT_FALLBACK;

  const root: EnergyGroup = {
    type: "group", id: "__root__", role: "open", repeat: 1,
    children: session.intervals ?? [],
  };
  const totals = computeTotals(expandIntervals(root));
  const blocks = session.classique_structure?.blocks ?? [];
  const nWod = blocks.filter(isWodBlock).length;
  const formatLabel = !isClassique
    ? "WOD"
    : nWod === 0
    ? "Classique"
    : nWod === blocks.length
    ? "WOD"
    : "Mixte";

  function handleEdit() {
    if (canEdit) navigate(`/coach/energy-library/${session.id}/edit`);
  }

  async function handleDuplicate() {
    await createMutation.mutateAsync({
      name: `${session.name} (copie)`,
      session_kind: session.session_kind,
      custom_kind: session.custom_kind,
      modality: session.modality ?? null,
      sport_id: session.sport_id ?? null,
      quality_id: session.quality_id ?? null,
      format: session.format ?? "wod",
      classique_structure: session.classique_structure ?? null,
      structure_type: session.structure_type,
      intervals: session.intervals,
      schema: session.schema ?? null,
      notes: session.notes,
      created_by: profile?.id ?? null,
    } as Parameters<typeof createMutation.mutateAsync>[0]);
  }

  const actionBtn = (label: string, tone: keyof typeof ACTION_TONE, onClick: () => void) => (
    <button
      key={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn("cursor-pointer rounded-[6px] border px-[9px] py-1 text-[10px] font-semibold [transition:all_150ms]", ACTION_TONE[tone])}
    >
      {label}
    </button>
  );

  const lit = hovered && canEdit;

  return (
    <div
      onClick={handleEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "flex flex-col overflow-hidden rounded-[6px] border bg-agon-s1 [transition:border-color_150ms,box-shadow_150ms]",
        canEdit ? "cursor-pointer" : "cursor-default",
        !lit && "border-agon-brd",
      )}
      // Couleur du sport = donnée : bordure et halo au survol restent en style.
      style={lit ? { borderColor: accent + "60", boxShadow: `0 0 0 1px ${accent}20` } : undefined}
    >
      <div className="h-[3px] opacity-70" style={{ background: accent }} />

      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">

        {/* Header */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-agon-tx">
              {session.name || "Sans titre"}
            </div>
            <div className="flex flex-wrap gap-1">
              {sport && (
                <span className={BADGE} style={{ background: (sport.color || SPORT_FALLBACK) + "20", color: sport.color || SPORT_FALLBACK }}>
                  {sport.name}
                </span>
              )}
              {quality && (
                <span className={cn(BADGE, "bg-agon-accent/[0.125] text-agon-accent")}>
                  {quality.name}
                </span>
              )}
              {/* Format pill */}
              <span className={cn(BADGE, FORMAT_TONE[formatLabel])}>
                {formatLabel}
              </span>
              {session.is_verified && (
                <span className={cn(BADGE, "bg-agon-succes/[0.125] text-agon-succes")}>
                  ✓ Officiel
                </span>
              )}
            </div>
          </div>

          {canVerify && !session.is_verified && (
            <button
              onClick={(e) => { e.stopPropagation(); verifyMutation.mutate({ id: session.id, verify: true }); }}
              disabled={verifyMutation.isPending}
              className="shrink-0 cursor-pointer rounded-[6px] border border-agon-succes/[0.314] bg-agon-succes/[0.071] px-2 py-1 text-[10px] font-semibold text-agon-succes"
            >
              Vérifier
            </button>
          )}
        </div>

        {/* Preview */}
        {isClassique ? (
          blocks.length > 0 ? (
            <div className="flex flex-col gap-1">
              {blocks.slice(0, 3).map((b) => {
                const wod = isWodBlock(b);
                return (
                  <div key={b.id} className={cn(
                    "flex items-center gap-1.5 rounded-[6px] border-l-2 bg-agon-s2 px-2 py-[5px]",
                    wod ? "border-agon-alerte/[0.502]" : "border-agon-succes/[0.502]",
                  )}>
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold text-agon-tx2">
                      {b.title || "Bloc"}
                    </span>
                    <span className="ml-auto shrink-0 text-[9px] text-agon-tx3">
                      {wod
                        ? `${b.steps.length} étape${b.steps.length > 1 ? "s" : ""}`
                        : `${b.items.length} exo${b.items.length > 1 ? "s" : ""}`}
                    </span>
                  </div>
                );
              })}
              {blocks.length > 3 && (
                <span className="pl-0.5 text-[9px] text-agon-tx3">+ {blocks.length - 3} bloc{blocks.length - 3 > 1 ? "s" : ""}</span>
              )}
            </div>
          ) : (
            <div className={EMPTY_PREVIEW}>
              <span className="text-[10px] text-agon-tx3">Aucun bloc</span>
            </div>
          )
        ) : root.children.length > 0 ? (
          <div className="pointer-events-none">
            <SessionPreview intervals={root} compact />
          </div>
        ) : (
          <div className={EMPTY_PREVIEW}>
            <span className="text-[10px] text-agon-tx3">Aucun intervalle</span>
          </div>
        )}

        {/* Footer : metadata + hover actions */}
        <div className="mt-auto flex min-h-[24px] items-center gap-3 text-[10px] text-agon-tx3">
          {!isClassique && totals.durationS > 0 && <span>{formatSLong(totals.durationS)}</span>}
          {!isClassique && totals.workCount > 0 && <span>{totals.workCount} eff.</span>}
          {isClassique && blocks.length > 0 && (
            <span>
              {blocks.length} bloc{blocks.length > 1 ? "s" : ""} · {blocks.reduce((n, b) => n + (isWodBlock(b) ? b.steps.length : b.items.length), 0)} élts
            </span>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            className={cn("ml-auto flex gap-1 [transition:opacity_150ms]", hovered ? "opacity-100" : "opacity-0")}
          >
            {actionBtn("Attribuer", "succes", () => setShowAssign(true))}
            {canEdit && actionBtn("Modifier", "accent", handleEdit)}
            {actionBtn("Dupliquer", "tx2", handleDuplicate)}
            {canDelete && actionBtn("Supprimer", "erreur", () => setShowConfirmDelete(true))}
          </div>
        </div>
      </div>

      {/* Confirm delete */}
      {showConfirmDelete && (
        <DeleteEnergySessionDialog sessionId={session.id} sessionName={session.name} onClose={() => setShowConfirmDelete(false)} />
      )}

      {/* Assign modal */}
      {showAssign && (
        <div
          onClick={(e) => { e.stopPropagation(); setShowAssign(false); }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-[340px] rounded-[6px] border border-agon-brd bg-agon-s1 p-6">
            <div className="mb-4 text-[15px] font-bold text-agon-tx">
              Attribuer « {session.name} »
            </div>

            <div className="mb-1.5 text-[11px] text-agon-tx3">Athlète</div>
            <select
              value={assignAthleteId}
              onChange={(e) => setAssignAthleteId(e.target.value)}
              className={cn(FIELD, "mb-3")}
            >
              <option value="">Choisir un athlète…</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>

            <div className="mb-1.5 text-[11px] text-agon-tx3">Date</div>
            <input
              type="date"
              value={assignDate}
              onChange={(e) => setAssignDate(e.target.value)}
              className={cn(FIELD, "box-border")}
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowAssign(false)}
                className="cursor-pointer rounded border border-agon-brd bg-transparent px-3.5 py-[7px] text-[13px] text-agon-tx2"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (!assignAthleteId) return;
                  await assignMutation.mutateAsync({
                    energy_session_id: session.id,
                    athlete_id: assignAthleteId,
                    scheduled_date: assignDate,
                    status: "planned",
                  });
                  setShowAssign(false);
                }}
                disabled={!assignAthleteId || assignMutation.isPending}
                className={cn(
                  "cursor-pointer rounded px-3.5 py-[7px] text-[13px] font-semibold text-agon-tx",
                  assignAthleteId ? "bg-agon-succes opacity-100" : "bg-agon-tx3 opacity-50",
                )}
              >
                {assignMutation.isPending ? "…" : "Attribuer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
