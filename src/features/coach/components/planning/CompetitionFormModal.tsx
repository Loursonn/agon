import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useCreateCompetition, useUpdateCompetition } from "@/hooks/useCompetitions";
import { COMPETITION_META, type CompetitionType, type CompetitionPriority, type Competition } from "@/types/planning";

const PRIORITIES: { value: CompetitionPriority; label: string }[] = [
  { value: "A", label: "A — Internationale" },
  { value: "B", label: "B — Nationale"      },
  { value: "C", label: "C — Régionale"      },
];

const TYPES = Object.entries(COMPETITION_META).map(([key, meta]) => ({
  value: key as CompetitionType,
  label: meta.label,
  emoji: meta.emoji,
}));

interface Props {
  athleteId: string;
  coachId: string;
  existing?: Competition | null;
  onClose: () => void;
}

export function CompetitionFormModal({ athleteId, coachId, existing, onClose }: Props) {
  const isEdit = !!existing;
  const { mutate: create, isPending: creating } = useCreateCompetition();
  const { mutate: update, isPending: updating } = useUpdateCompetition();
  const isPending = creating || updating;

  const [name,     setName]     = useState(existing?.name     ?? "");
  const [date,     setDate]     = useState(existing?.date     ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [priority, setPriority] = useState<CompetitionPriority>(existing?.priority ?? "A");
  const [type,     setType]     = useState<CompetitionType>(existing?.type ?? "competition");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !date) return;

    if (isEdit && existing) {
      update(
        {
          id: existing.id,
          updates: { name: name.trim(), type, date, location: location.trim() || null, priority },
        },
        {
          onSuccess: () => { toast.success("Compétition modifiée"); onClose(); },
          onError:   () => toast.error("Erreur lors de la modification"),
        },
      );
    } else {
      create(
        {
          coach_id:   coachId,
          athlete_id: athleteId,
          name:       name.trim(),
          type,
          date,
          location:   location.trim() || null,
          notes:      null,
          priority,
        },
        {
          onSuccess: () => { toast.success("Compétition ajoutée"); onClose(); },
          onError:   () => toast.error("Erreur lors de l'ajout"),
        },
      );
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: C.s2, border: "1px solid " + C.brdL,
    borderRadius: 4, color: C.tx, fontSize: 13,
    fontFamily: "inherit", outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: C.tx3,
    textTransform: "uppercase", letterSpacing: "0.3px",
    display: "block", marginBottom: 5,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)" }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 201,
          transform: "translate(-50%, -50%)",
          width: 460, maxWidth: "95vw", maxHeight: "90vh",
          background: C.s1, borderRadius: 6,
          border: "1px solid " + C.brdL,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{isEdit ? "Modifier la compétition" : "Nouvelle compétition"}</div>
            </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {/* Name */}
          <div>
            <label style={labelStyle}>Nom *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Championnat régional"
              required
              style={inputStyle}
            />
          </div>

          {/* Date */}
          <div>
            <label style={labelStyle}>Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{ ...inputStyle, colorScheme: "dark" }}
            />
          </div>

          {/* Type */}
          <div>
            <label style={labelStyle}>Type</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  style={{
                    padding: "7px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                    fontSize: 12, fontWeight: type === t.value ? 700 : 400,
                    border: "1px solid " + (type === t.value ? C.coach + "60" : C.brdL),
                    background: type === t.value ? C.coachS : C.s2,
                    color: type === t.value ? C.coach : C.tx2,
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <label style={labelStyle}>Priorité</label>
            <div style={{ display: "flex", gap: 8 }}>
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  style={{
                    flex: 1, padding: "9px 0", borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                    fontSize: 12, fontWeight: priority === p.value ? 700 : 400,
                    border: "1px solid " + (priority === p.value ? "#F5A62360" : C.brdL),
                    background: priority === p.value ? "#F5A62318" : C.s2,
                    color: priority === p.value ? "#F5A623" : C.tx2,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label style={labelStyle}>Lieu</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Ville, salle…"
              style={inputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !name.trim() || !date}
            style={{
              marginTop: 4, padding: "13px 0", borderRadius: 6, border: "none",
              background: name.trim() && date ? C.coach : C.s2,
              color: name.trim() && date ? "#fff" : C.tx3,
              fontSize: 14, fontWeight: 700, cursor: name.trim() && date ? "pointer" : "default",
              fontFamily: "inherit", minHeight: 44,
              boxShadow: name.trim() && date ? "0 4px 16px rgba(244,114,182,0.3)" : "none",
            }}
          >
            {isPending ? (isEdit ? "Modification…" : "Ajout en cours…") : (isEdit ? "Enregistrer les modifications" : "Ajouter la compétition")}
          </button>
        </form>
      </div>
    </>
  );
}
