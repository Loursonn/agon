/**
 * SpecificSessionCard — card du catalogue de séances spécifiques.
 * Badges Sport / Qualité / Format, actions Attribuer · Modifier · Dupliquer · Supprimer.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import SessionPreview from "../energy/SessionPreview";
import type { EnergySessionRow, EnergyGroup } from "@/types/energy";
import type { SpecificSport, PhysicalQuality } from "@/types/specific";
import { isWodBlock } from "@/types/specific";
import { useDeleteEnergySession, useCreateEnergySession, useVerifyEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";
import { useAuth } from "@/hooks/useAuth";
import { formatSLong } from "@/lib/energy/formatTarget";
import { expandIntervals, computeTotals } from "@/lib/energy";

const ORANGE = "#F5A623";

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
  const deleteMutation = useDeleteEnergySession();
  const createMutation = useCreateEnergySession();
  const verifyMutation = useVerifyEnergySession();
  const assignMutation = useAssignEnergySession();

  const [showAssign, setShowAssign] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [assignAthleteId, setAssignAthleteId] = useState("");
  const [assignDate, setAssignDate] = useState(new Date().toISOString().slice(0, 10));
  const [hovered, setHovered] = useState(false);

  const isClassique = session.format === "classique";
  const accent = sport?.color || ORANGE;

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

  const actionBtn = (label: string, color: string, onClick: () => void) => (
    <button
      key={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: "4px 9px", borderRadius: 6, border: `1px solid ${color}40`,
        background: color + "12", color, fontSize: 10, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit", transition: "all 150ms",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      onClick={handleEdit}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: C.s1,
        border: `1px solid ${hovered && canEdit ? accent + "60" : C.brd}`,
        borderRadius: 6,
        overflow: "hidden",
        cursor: canEdit ? "pointer" : "default",
        transition: "border-color 150ms, box-shadow 150ms",
        boxShadow: hovered && canEdit ? `0 0 0 1px ${accent}20` : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ height: 3, background: accent, opacity: 0.7 }} />

      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: C.tx,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              marginBottom: 4,
            }}>
              {session.name || "Sans titre"}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {sport && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: (sport.color || ORANGE) + "20", color: sport.color || ORANGE,
                }}>
                  {sport.name}
                </span>
              )}
              {quality && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: "#FFC93320", color: "#FFC933",
                }}>
                  {quality.name}
                </span>
              )}
              {/* Format pill */}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: formatLabel === "Classique" ? "#66F03C20" : formatLabel === "Mixte" ? "#FFC93320" : ORANGE + "20",
                color: formatLabel === "Classique" ? "#66F03C" : formatLabel === "Mixte" ? "#FFC933" : ORANGE,
              }}>
                {formatLabel}
              </span>
              {session.is_verified && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: C.g + "20", color: C.g,
                }}>
                  ✓ Officiel
                </span>
              )}
            </div>
          </div>

          {canVerify && !session.is_verified && (
            <button
              onClick={(e) => { e.stopPropagation(); verifyMutation.mutate({ id: session.id, verify: true }); }}
              disabled={verifyMutation.isPending}
              style={{
                padding: "4px 8px", borderRadius: 6, flexShrink: 0,
                border: `1px solid ${C.g}50`, background: C.g + "12",
                color: C.g, fontSize: 10, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Vérifier
            </button>
          )}
        </div>

        {/* Preview */}
        {isClassique ? (
          blocks.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {blocks.slice(0, 3).map((b) => {
                const wod = isWodBlock(b);
                return (
                  <div key={b.id} style={{
                    background: C.s2, borderRadius: 6, padding: "5px 8px",
                    display: "flex", alignItems: "center", gap: 6,
                    borderLeft: `2px solid ${wod ? ORANGE : "#66F03C"}80`,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {b.title || "Bloc"}
                    </span>
                    <span style={{ fontSize: 9, color: C.tx3, flexShrink: 0, marginLeft: "auto" }}>
                      {wod
                        ? `${b.steps.length} étape${b.steps.length > 1 ? "s" : ""}`
                        : `${b.items.length} exo${b.items.length > 1 ? "s" : ""}`}
                    </span>
                  </div>
                );
              })}
              {blocks.length > 3 && (
                <span style={{ fontSize: 9, color: C.tx3, paddingLeft: 2 }}>+ {blocks.length - 3} bloc{blocks.length - 3 > 1 ? "s" : ""}</span>
              )}
            </div>
          ) : (
            <div style={{ height: 40, background: C.s2, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, color: C.tx3 }}>Aucun bloc</span>
            </div>
          )
        ) : root.children.length > 0 ? (
          <div style={{ pointerEvents: "none" }}>
            <SessionPreview intervals={root} compact />
          </div>
        ) : (
          <div style={{ height: 40, background: C.s2, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, color: C.tx3 }}>Aucun intervalle</span>
          </div>
        )}

        {/* Footer : metadata + hover actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10, color: C.tx3, marginTop: "auto", minHeight: 24 }}>
          {!isClassique && totals.durationS > 0 && <span>{formatSLong(totals.durationS)}</span>}
          {!isClassique && totals.workCount > 0 && <span>{totals.workCount} eff.</span>}
          {isClassique && blocks.length > 0 && (
            <span>
              {blocks.length} bloc{blocks.length > 1 ? "s" : ""} · {blocks.reduce((n, b) => n + (isWodBlock(b) ? b.steps.length : b.items.length), 0)} élts
            </span>
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              marginLeft: "auto", display: "flex", gap: 4,
              opacity: hovered ? 1 : 0, transition: "opacity 150ms",
            }}
          >
            {actionBtn("Attribuer", C.g, () => setShowAssign(true))}
            {canEdit && actionBtn("Modifier", "#FFC933", handleEdit)}
            {actionBtn("Dupliquer", C.tx2, handleDuplicate)}
            {canDelete && actionBtn("Supprimer", C.r, () => setShowConfirmDelete(true))}
          </div>
        </div>
      </div>

      {/* Confirm delete */}
      {showConfirmDelete && (
        <div
          onClick={(e) => { e.stopPropagation(); setShowConfirmDelete(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.s1, borderRadius: 6, padding: 24, width: 340, border: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>Supprimer la séance ?</div>
            <div style={{ fontSize: 12, color: C.tx3, marginBottom: 18 }}>
              « {session.name} » sera définitivement supprimée.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowConfirmDelete(false)}
                style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Annuler
              </button>
              <button
                onClick={() => { deleteMutation.mutate(session.id); setShowConfirmDelete(false); }}
                style={{ padding: "7px 14px", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {showAssign && (
        <div
          onClick={(e) => { e.stopPropagation(); setShowAssign(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.s1, borderRadius: 6, padding: 24, width: 340, border: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 }}>
              Attribuer « {session.name} »
            </div>

            <div style={{ fontSize: 11, color: C.tx3, marginBottom: 6 }}>Athlète</div>
            <select
              value={assignAthleteId}
              onChange={(e) => setAssignAthleteId(e.target.value)}
              style={{
                width: "100%", background: C.s2, border: `1px solid ${C.brd}`,
                borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 10px", fontFamily: "inherit", marginBottom: 12,
              }}
            >
              <option value="">Choisir un athlète…</option>
              {athletes.map((a) => (
                <option key={a.id} value={a.id}>{a.full_name}</option>
              ))}
            </select>

            <div style={{ fontSize: 11, color: C.tx3, marginBottom: 6 }}>Date</div>
            <input
              type="date"
              value={assignDate}
              onChange={(e) => setAssignDate(e.target.value)}
              style={{
                width: "100%", background: C.s2, border: `1px solid ${C.brd}`,
                borderRadius: 6, color: C.tx, fontSize: 13, padding: "8px 10px", fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAssign(false)}
                style={{ padding: "7px 14px", borderRadius: 4, border: `1px solid ${C.brd}`, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
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
                style={{
                  padding: "7px 14px", borderRadius: 4, border: "none",
                  background: assignAthleteId ? C.g : C.tx3, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  opacity: assignAthleteId ? 1 : 0.5,
                }}
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
