/**
 * EnergySessionCard — card de la banque de séances énergétiques.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import SessionPreview from "./SessionPreview";
import type { EnergySessionRow, EnergyGroup, SessionKind } from "@/types/energy";
import { useVerifyEnergySession, useCreateEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";
import { useAuth } from "@/hooks/useAuth";
import { formatSLong } from "@/lib/energy/formatTarget";
import { expandIntervals, computeTotals } from "@/lib/energy";
import { makeRootGroup } from "@/lib/energy/treeUtils";
import { DeleteEnergySessionDialog } from "./DeleteEnergySessionButton";

// ── Kind badge colors ─────────────────────────────────────────────────────────

type KindTone = { stripe: string; badge: string; hover: string };

/** Bandeau, pastille et survol par teinte (classes écrites en entier pour Tailwind). */
const TONES = {
  accent: { stripe: "bg-agon-accent", badge: "bg-agon-accent/[0.125] text-agon-accent",
    hover: "hover:border-agon-accent/[0.376] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--agon-accent)_12.5%,transparent)]" },
  info:   { stripe: "bg-agon-info", badge: "bg-agon-info/[0.125] text-agon-info",
    hover: "hover:border-agon-info/[0.376] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--agon-info)_12.5%,transparent)]" },
  alerte: { stripe: "bg-agon-alerte", badge: "bg-agon-alerte/[0.125] text-agon-alerte",
    hover: "hover:border-agon-alerte/[0.376] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--agon-alerte)_12.5%,transparent)]" },
  succes: { stripe: "bg-agon-succes", badge: "bg-agon-succes/[0.125] text-agon-succes",
    hover: "hover:border-agon-succes/[0.376] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--agon-succes)_12.5%,transparent)]" },
  tx3:    { stripe: "bg-agon-tx3", badge: "bg-agon-tx3/[0.125] text-agon-tx3",
    hover: "hover:border-agon-tx3/[0.376] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--agon-tx3)_12.5%,transparent)]" },
} satisfies Record<string, KindTone>;

const KIND_TONE: Record<SessionKind | string, KindTone> = {
  vo2:        TONES.accent,
  tempo:      TONES.info,
  seuil:      TONES.alerte,
  footing:    TONES.succes,
  fartlek:    TONES.alerte,
  autre:      TONES.tx3,
  custom:     TONES.accent,
  specifique: TONES.alerte,
};

const FIELD = "w-full rounded-[6px] border border-agon-brd bg-agon-s2 px-2.5 py-2 text-[13px] text-agon-tx";
const BADGE = "rounded px-1.5 py-0.5 text-[9px] font-bold";

const KIND_LABEL: Record<SessionKind | string, string> = {
  vo2:        "VO₂max",
  tempo:      "Tempo",
  seuil:      "Seuil",
  footing:    "Footing",
  fartlek:    "Fartlek",
  autre:      "Autres",
  custom:     "Custom",
  specifique: "Spécifique",
};

// ── Dot menu ──────────────────────────────────────────────────────────────────

function DotMenu({ onDuplicate, onDelete, onAssign }: { onDuplicate: () => void; onDelete: () => void; onAssign?: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="cursor-pointer rounded-[6px] border border-agon-brd bg-transparent px-[7px] py-0.5 text-[14px] leading-none text-agon-tx3"
      >
        •••
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[140px] overflow-hidden rounded border border-agon-brd bg-agon-s1">
          {[
            ...(onAssign ? [{ label: "Programmer", action: onAssign, tone: "text-agon-succes" }] : []),
            { label: "Dupliquer", action: onDuplicate, tone: "text-agon-tx" },
            { label: "Supprimer", action: onDelete, tone: "text-agon-erreur" },
          ].map(({ label, action, tone }) => (
            <button
              key={label}
              onClick={(e) => { e.stopPropagation(); action(); setOpen(false); }}
              className={cn("block w-full cursor-pointer bg-transparent px-3.5 py-[9px] text-left text-[12px] hover:bg-white/[0.04]", tone)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface Props {
  session: EnergySessionRow;
  canEdit: boolean;
  canVerify: boolean;
  canDelete: boolean;
}

export default function EnergySessionCard({ session, canEdit, canVerify, canDelete }: Props) {
  const navigate = useNavigate();
  const { athletes } = useAuth();
  const verifyMutation  = useVerifyEnergySession();
  const createMutation  = useCreateEnergySession();
  const assignMutation  = useAssignEnergySession();
  const [showAssign, setShowAssign] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [assignAthleteId, setAssignAthleteId] = useState("");
  const [assignDate, setAssignDate] = useState(new Date().toISOString().slice(0, 10));

  // Build root group for preview
  const root: EnergyGroup = {
    type: "group",
    id: "__root__",
    role: "open",
    repeat: 1,
    children: session.intervals ?? [],
  };

  const flat   = expandIntervals(root);
  const totals = computeTotals(flat);
  const tone = KIND_TONE[session.session_kind] ?? TONES.tx3;
  const kindLabel = session.session_kind === "specifique"
    ? (KIND_LABEL[session.custom_kind ?? ""] ?? session.custom_kind ?? "Spécifique")
    : session.session_kind === "custom" && session.custom_kind
    ? session.custom_kind
    : KIND_LABEL[session.session_kind] ?? session.session_kind;

  function handleClick() {
    if (canEdit) {
      navigate(`/coach/energy-library/${session.id}/edit`);
    }
    // TODO: readonly view when not editor
  }

  async function handleDuplicate() {
    const newRoot = makeRootGroup();
    await createMutation.mutateAsync({
      name: `${session.name} (copie)`,
      session_kind: session.session_kind,
      custom_kind: session.custom_kind,
      structure_type: session.structure_type,
      intervals: session.intervals,
      notes: session.notes,
    });
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex flex-col overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1 [transition:border-color_150ms,box-shadow_150ms]",
        canEdit ? cn("cursor-pointer", tone.hover) : "cursor-default",
      )}
    >
      {/* Top bar — kind color accent */}
      <div className={cn("h-[3px] opacity-70", tone.stripe)} />

      <div className="flex flex-1 flex-col gap-1.5 px-3 py-2.5">

        {/* Header row */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-agon-tx">
              {session.name || "Sans titre"}
            </div>
            <div className="flex flex-wrap gap-1">
              {/* Kind badge */}
              <span className={cn(BADGE, tone.badge)}>
                {kindLabel}
              </span>
              {/* Verified badge */}
              {session.is_verified && (
                <span className={cn(BADGE, "bg-agon-succes/[0.125] text-agon-succes")}>
                  ✓ Vérifiée
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {canVerify && !session.is_verified && (
              <button
                onClick={() => verifyMutation.mutate({ id: session.id, verify: true })}
                disabled={verifyMutation.isPending}
                className="cursor-pointer rounded-[6px] border border-agon-succes/[0.314] bg-agon-succes/[0.071] px-2 py-1 text-[10px] font-semibold text-agon-succes"
              >
                Vérifier
              </button>
            )}
            {canDelete && (
              <DotMenu
                onAssign={() => setShowAssign(true)}
                onDuplicate={handleDuplicate}
                onDelete={() => setShowConfirmDelete(true)}
              />
            )}
          </div>
        </div>

        {/* Mini preview */}
        {root.children.length > 0 ? (
          <div className="pointer-events-none">
            <SessionPreview intervals={root} compact />
          </div>
        ) : (
          <div className="flex h-10 items-center justify-center rounded-[6px] bg-agon-s2">
            <span className="text-[10px] text-agon-tx3">Aucun intervalle</span>
          </div>
        )}

        {/* Metadata footer */}
        <div className="mt-0.5 flex gap-3 text-[10px] text-agon-tx3">
          {totals.durationS > 0 && (
            <span>{formatSLong(totals.durationS)}</span>
          )}
          {totals.workCount > 0 && (
            <span>{totals.workCount} eff.</span>
          )}
          {totals.distanceM > 0 && (
            <span>{(totals.distanceM / 1000).toFixed(1)} km</span>
          )}
        </div>
      </div>

      {showConfirmDelete && (
        <DeleteEnergySessionDialog sessionId={session.id} sessionName={session.name} onClose={() => setShowConfirmDelete(false)} />
      )}

      {/* Assign modal */}
      {showAssign && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
        >
          <div className="w-[340px] rounded-[6px] border border-agon-brd bg-agon-s1 p-6">
            <div className="mb-4 text-[15px] font-bold text-agon-tx">
              Programmer « {session.name} »
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
                {assignMutation.isPending ? "…" : "Programmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
