import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useCreateLifeEvent } from "@/hooks/useLifeEvents";

interface Props {
  athleteId: string;
  onClose: () => void;
}

export function LifeEventFormModal({ athleteId, onClose }: Props) {
  const { mutate: create, isPending } = useCreateLifeEvent();

  const [title, setTitle] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dateStart) return;

    create(
      {
        athlete_id: athleteId,
        date_start: dateStart,
        date_end: dateEnd || dateStart,
        title: title.trim(),
      },
      {
        onSuccess: () => { toast.success("Événement ajouté"); onClose(); },
        onError: () => toast.error("Erreur lors de l'ajout"),
      },
    );
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
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)" }}
      />

      <div
        style={{
          position: "fixed", top: "50%", left: "50%", zIndex: 201,
          transform: "translate(-50%, -50%)",
          width: 420, maxWidth: "95vw", maxHeight: "90vh",
          background: C.s1, borderRadius: 6,
          border: "1px solid " + C.brdL,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Nouvel événement</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>Visible par ton coach sur le planning</div>
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
          <div>
            <label style={labelStyle}>Titre *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex: Grosse journée de travail, Week-end absent…"
              required
              style={inputStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date début *</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => {
                  setDateStart(e.target.value);
                  if (!dateEnd || dateEnd < e.target.value) setDateEnd(e.target.value);
                }}
                required
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date fin</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                min={dateStart}
                style={{ ...inputStyle, colorScheme: "dark" }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || !title.trim() || !dateStart}
            style={{
              marginTop: 4, padding: "13px 0", borderRadius: 6, border: "none",
              background: title.trim() && dateStart ? C.ac : C.s2,
              color: title.trim() && dateStart ? "#fff" : C.tx3,
              fontSize: 14, fontWeight: 700, cursor: title.trim() && dateStart ? "pointer" : "default",
              fontFamily: "inherit", minHeight: 44,
              boxShadow: title.trim() && dateStart ? "0 4px 16px rgba(244,114,182,0.3)" : "none",
            }}
          >
            {isPending ? "Ajout en cours…" : "Ajouter"}
          </button>
        </form>
      </div>
    </>
  );
}
