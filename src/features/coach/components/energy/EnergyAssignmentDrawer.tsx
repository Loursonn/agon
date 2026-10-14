import { useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { C } from "@/lib/theme";
import type { EnergySessionAssignmentRow, AssignmentStatus } from "@/types/energy";
import type { EnergyGroup } from "@/types/energy";
import SessionPreview from "@/features/coach/components/energy/SessionPreview";
import {
  useUpdateEnergyAssignment,
  useAssignEnergySession,
  useUnassignEnergySession,
} from "@/features/shared/hooks/useEnergyAssignments";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  assignment: EnergySessionAssignmentRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  athleteId: string;
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  planned:     "Planifié",
  in_progress: "En cours",
  completed:   "Terminé",
  missed:      "Manqué",
  skipped:     "Ignoré",
};

const STATUS_COLOR: Record<AssignmentStatus, string> = {
  planned:     C.tx3,
  in_progress: C.o,
  completed:   C.g,
  missed:      C.r,
  skipped:     C.tx3,
};

const STATUS_BG: Record<AssignmentStatus, string> = {
  planned:     "rgba(231,211,168,0.15)",
  in_progress: "rgba(251,146,60,0.1)",
  completed:   "rgba(34,201,147,0.1)",
  missed:      "rgba(239,75,75,0.1)",
  skipped:     "rgba(231,211,168,0.15)",
};

function StatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        color: STATUS_COLOR[status],
        background: STATUS_BG[status],
        border: `1px solid ${STATUS_COLOR[status]}40`,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: C.tx3,
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionBtn({
  children,
  onClick,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "10px 14px",
        borderRadius: 4,
        border: `1px solid ${danger ? C.r + "50" : C.brdL}`,
        background: danger ? "rgba(239,75,75,0.08)" : C.s2,
        color: danger ? C.r : C.tx,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        fontFamily: "inherit",
        textAlign: "left",
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ── EnergyAssignmentDrawer ────────────────────────────────────────────────────

export function EnergyAssignmentDrawer({ assignment, open, onOpenChange, athleteId }: Props) {
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [duplicateDate, setDuplicateDate] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);

  const updateMut = useUpdateEnergyAssignment();
  const assignMut = useAssignEnergySession();
  const unassignMut = useUnassignEnergySession();

  if (!assignment) return null;

  const session = assignment.energy_sessions;
  const root: EnergyGroup = {
    type: "group",
    id: "__root__",
    role: "open",
    repeat: 1,
    children: session?.intervals ?? [],
  };

  const formattedDate = (() => {
    try {
      return format(parseISO(assignment.scheduled_date), "EEEE d MMMM yyyy", { locale: fr });
    } catch {
      return assignment.scheduled_date;
    }
  })();

  function handleReschedule() {
    if (!rescheduleDate || !assignment) return;
    updateMut.mutate(
      { id: assignment.id, athleteId, scheduled_date: rescheduleDate },
      {
        onSuccess: () => {
          setShowReschedule(false);
          setRescheduleDate("");
        },
      }
    );
  }

  function handleDuplicate() {
    if (!duplicateDate || !assignment) return;
    assignMut.mutate(
      {
        energy_session_id: assignment.energy_session_id,
        athlete_id: athleteId,
        scheduled_date: duplicateDate,
        status: "planned",
      },
      {
        onSuccess: () => {
          setShowDuplicate(false);
          setDuplicateDate("");
        },
      }
    );
  }

  function handleDelete() {
    if (!assignment) return;
    unassignMut.mutate(
      { id: assignment.id, athleteId },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{
          background: C.s1,
          borderLeft: `1px solid ${C.brd}`,
          padding: 0,
          width: 360,
          maxWidth: "100vw",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* Header */}
        <SheetHeader
          style={{
            padding: "20px 20px 16px",
            borderBottom: `1px solid ${C.brd}`,
          }}
        >
          <SheetTitle style={{ color: C.tx, fontSize: 16, fontWeight: 700 }}>
            {session?.name ?? "Séance énergie"}
          </SheetTitle>
          {session && (
            <div style={{ color: C.tx3, fontSize: 12, marginTop: 2 }}>
              {session.session_kind?.toUpperCase()}
              {session.total_duration_s
                ? ` · ${Math.round(session.total_duration_s / 60)} min`
                : ""}
            </div>
          )}
        </SheetHeader>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* Preview */}
          {session && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Aperçu</SectionLabel>
              <div
                style={{
                  background: C.s2,
                  borderRadius: 4,
                  padding: 12,
                  border: `1px solid ${C.brd}`,
                }}
              >
                <SessionPreview intervals={root} compact />
              </div>
            </div>
          )}

          {/* Metadata */}
          <div style={{ marginBottom: 20 }}>
            <SectionLabel>Informations</SectionLabel>
            <div
              style={{
                background: C.s2,
                borderRadius: 4,
                border: `1px solid ${C.brd}`,
                overflow: "hidden",
              }}
            >
              <MetaRow label="Date" value={formattedDate} />
              <MetaRow
                label="Statut"
                value={<StatusBadge status={assignment.status} />}
                last
              />
            </div>
          </div>

          {/* Notes */}
          {assignment.notes && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Notes</SectionLabel>
              <div
                style={{
                  background: C.s2,
                  borderRadius: 4,
                  padding: "10px 14px",
                  border: `1px solid ${C.brd}`,
                  color: C.tx2,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {assignment.notes}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel>Actions</SectionLabel>

            {/* Reschedule */}
            <ActionBtn onClick={() => setShowReschedule((v) => !v)}>
              Changer la date
            </ActionBtn>
            {showReschedule && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 0",
                }}
              >
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  style={{
                    flex: 1,
                    background: C.s2,
                    border: `1px solid ${C.brdL}`,
                    borderRadius: 4,
                    color: C.tx,
                    padding: "8px 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    colorScheme: "dark",
                  }}
                />
                <button
                  onClick={handleReschedule}
                  disabled={!rescheduleDate || updateMut.isPending}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 4,
                    background: C.ac,
                    color: "#fff",
                    border: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: !rescheduleDate || updateMut.isPending ? "not-allowed" : "pointer",
                    opacity: !rescheduleDate || updateMut.isPending ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  OK
                </button>
              </div>
            )}

            {/* Duplicate */}
            <ActionBtn onClick={() => setShowDuplicate((v) => !v)}>
              Dupliquer
            </ActionBtn>
            {showDuplicate && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 0" }}>
                <input
                  type="date"
                  value={duplicateDate}
                  onChange={(e) => setDuplicateDate(e.target.value)}
                  style={{
                    flex: 1,
                    background: C.s2,
                    border: `1px solid ${C.brdL}`,
                    borderRadius: 4,
                    color: C.tx,
                    padding: "8px 10px",
                    fontSize: 13,
                    fontFamily: "inherit",
                    colorScheme: "dark",
                  }}
                />
                <button
                  onClick={handleDuplicate}
                  disabled={!duplicateDate || assignMut.isPending}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 4,
                    background: C.ac,
                    color: "#fff",
                    border: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: !duplicateDate || assignMut.isPending ? "not-allowed" : "pointer",
                    opacity: !duplicateDate || assignMut.isPending ? 0.5 : 1,
                    fontFamily: "inherit",
                  }}
                >
                  OK
                </button>
              </div>
            )}

            {/* Delete */}
            <ActionBtn danger onClick={handleDelete} disabled={unassignMut.isPending}>
              Supprimer
            </ActionBtn>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── MetaRow ───────────────────────────────────────────────────────────────────

function MetaRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: last ? "none" : `1px solid ${C.brd}`,
      }}
    >
      <span style={{ fontSize: 13, color: C.tx3 }}>{label}</span>
      <span style={{ fontSize: 13, color: C.tx }}>{value}</span>
    </div>
  );
}

export default EnergyAssignmentDrawer;
