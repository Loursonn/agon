/**
 * EnergySessionCard — card de la banque de séances énergétiques.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import SessionPreview from "./SessionPreview";
import type { EnergySessionRow, EnergyGroup, SessionKind } from "@/types/energy";
import { useVerifyEnergySession, useDeleteEnergySession, useCreateEnergySession } from "@/features/shared/hooks/useEnergySessions";
import { useAssignEnergySession } from "@/features/shared/hooks/useEnergyAssignments";
import { useAuth } from "@/hooks/useAuth";
import { formatSLong } from "@/lib/energy/formatTarget";
import { expandIntervals, computeTotals } from "@/lib/energy";
import { makeRootGroup } from "@/lib/energy/treeUtils";

// ── Kind badge colors ─────────────────────────────────────────────────────────

const KIND_COLOR: Record<SessionKind | string, string> = {
  vo2:        "#FFC933",
  tempo:      "#33B5FF",
  seuil:      "#FF9500",
  footing:    "#66F03C",
  fartlek:    "#FF9500",
  autre:      "#7D7468",
  custom:     "#FFC933",
  specifique: "#F5A623",
};

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
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          background: "none", border: `1px solid ${C.brd}`, borderRadius: 6,
          color: C.tx3, fontSize: 14, cursor: "pointer", padding: "2px 7px",
          lineHeight: 1, fontFamily: "inherit",
        }}
      >
        •••
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50,
          background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 4,
          minWidth: 140,
          overflow: "hidden",
        }}>
          {[
            ...(onAssign ? [{ label: "Programmer", action: onAssign, color: C.g }] : []),
            { label: "Dupliquer", action: onDuplicate, color: C.tx },
            { label: "Supprimer", action: onDelete, color: C.r },
          ].map(({ label, action, color }) => (
            <button
              key={label}
              onClick={(e) => { e.stopPropagation(); action(); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 14px", background: "none", border: "none",
                color, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
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
  const deleteMutation  = useDeleteEnergySession();
  const createMutation  = useCreateEnergySession();
  const assignMutation  = useAssignEnergySession();
  const [showAssign, setShowAssign] = useState(false);
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
  const kindColor = KIND_COLOR[session.session_kind] ?? C.tx3;
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
      style={{
        background: C.s1,
        border: `1px solid ${C.brd}`,
        borderRadius: 6,
        overflow: "hidden",
        cursor: canEdit ? "pointer" : "default",
        transition: "border-color 150ms, box-shadow 150ms",
        display: "flex",
        flexDirection: "column",
      }}
      onMouseEnter={(e) => {
        if (canEdit) {
          (e.currentTarget as HTMLElement).style.borderColor = kindColor + "60";
          (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${kindColor}20`;
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = C.brd;
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      {/* Top bar — kind color accent */}
      <div style={{ height: 3, background: kindColor, opacity: 0.7 }} />

      <div style={{ padding: "10px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>

        {/* Header row */}
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
              {/* Kind badge */}
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: kindColor + "20", color: kindColor,
              }}>
                {kindLabel}
              </span>
              {/* Verified badge */}
              {session.is_verified && (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: C.g + "20", color: C.g,
                }}>
                  ✓ Vérifiée
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            {canVerify && !session.is_verified && (
              <button
                onClick={() => verifyMutation.mutate({ id: session.id, verify: true })}
                disabled={verifyMutation.isPending}
                style={{
                  padding: "4px 8px", borderRadius: 6,
                  border: `1px solid ${C.g}50`, background: C.g + "12",
                  color: C.g, fontSize: 10, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Vérifier
              </button>
            )}
            {canDelete && (
              <DotMenu
                onAssign={() => setShowAssign(true)}
                onDuplicate={handleDuplicate}
                onDelete={() => deleteMutation.mutate(session.id)}
              />
            )}
          </div>
        </div>

        {/* Mini preview */}
        {root.children.length > 0 ? (
          <div style={{ pointerEvents: "none" }}>
            <SessionPreview intervals={root} compact />
          </div>
        ) : (
          <div style={{ height: 40, background: C.s2, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 10, color: C.tx3 }}>Aucun intervalle</span>
          </div>
        )}

        {/* Metadata footer */}
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: C.tx3, marginTop: 2 }}>
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

      {/* Assign modal */}
      {showAssign && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ background: C.s1, borderRadius: 6, padding: 24, width: 340, border: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 16 }}>
              Programmer « {session.name} »
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
                {assignMutation.isPending ? "…" : "Programmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
