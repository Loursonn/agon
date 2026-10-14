/**
 * SessionEndForm — post-session feedback form.
 * RPE (1-10), respected (oui/adaptée), free text comment.
 */
import { useState } from "react";

interface Props {
  onSubmit: (data: { rpe: number; respected: boolean; comment: string }) => void;
  isPending?: boolean;
}

export default function SessionEndForm({ onSubmit, isPending }: Props) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [respected, setRespected] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");

  function handleSubmit() {
    onSubmit({
      rpe: rpe ?? 5,
      respected: respected ?? true,
      comment: comment.trim(),
    });
  }

  return (
    <div style={{
      background: "var(--card, #0E0C0A)", border: "1px solid var(--border, #2E2D33)",
      borderRadius: 6, padding: 18,
    }}>
      {/* RPE */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#8B8A92", fontWeight: 600, marginBottom: 8 }}>
          RPE global (1-10)
        </label>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
            <button
              key={v}
              onClick={() => setRpe(v)}
              style={{
                flex: 1, minWidth: 30,
                background: rpe === v ? "rgba(229,72,77,0.15)" : "var(--card2, #26252A)",
                border: `1px solid ${rpe === v ? "#E5484D" : "var(--border, #2E2D33)"}`,
                color: rpe === v ? "#E5484D" : "#8B8A92",
                borderRadius: 4, padding: "9px 0", fontWeight: 700,
                cursor: "pointer", fontSize: 13, fontFamily: "inherit",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Respected */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#8B8A92", fontWeight: 600, marginBottom: 8 }}>
          Séance respectée ?
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={() => setRespected(true)}
            style={{
              background: respected === true ? "rgba(34,201,147,0.1)" : "var(--card2, #26252A)",
              border: `1px solid ${respected === true ? "#66F03C" : "var(--border, #2E2D33)"}`,
              color: respected === true ? "#66F03C" : "#8B8A92",
              borderRadius: 4, padding: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Oui ✓
          </button>
          <button
            onClick={() => setRespected(false)}
            style={{
              background: respected === false ? "rgba(245,166,35,0.1)" : "var(--card2, #26252A)",
              border: `1px solid ${respected === false ? "#F5A623" : "var(--border, #2E2D33)"}`,
              color: respected === false ? "#F5A623" : "#8B8A92",
              borderRadius: 4, padding: 10, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Adaptée
          </button>
        </div>
      </div>

      {/* Comment */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, color: "#8B8A92", fontWeight: 600, marginBottom: 8 }}>
          Ressenti / commentaire
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Dernier tour dur, cardio ok…"
          style={{
            width: "100%", background: "var(--card2, #26252A)",
            border: "1px solid var(--border, #2E2D33)",
            borderRadius: 4, color: "#F2F1F5", padding: "10px 12px",
            fontSize: 14, fontFamily: "inherit", outline: "none",
            boxSizing: "border-box", resize: "vertical",
          }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        style={{
          width: "100%", background: "#66F03C", color: "#04150e",
          border: "none", borderRadius: 6, padding: 13,
          fontSize: 15, fontWeight: 700, cursor: "pointer",
          fontFamily: "inherit", opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Enregistrement…" : "Terminer la séance"}
      </button>
    </div>
  );
}
