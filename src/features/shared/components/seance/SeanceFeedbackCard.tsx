import { useState } from "react";
import { Pencil } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { CARD, KICKER, MONO, buttonStyle } from "./seanceUi";

interface Props {
  title: string;
  rpe: number | null;
  comment: string | null;
  /** Athlète : « Modifier mon retour » (difficulté ressentie + commentaire). */
  onSave?: (rpe: number | null, comment: string | null) => Promise<unknown>;
  saving?: boolean;
}

const rpeColor = (v: number) => (v >= 8 ? C.r : v >= 6 ? C.o : C.g);

/** Retour de l'athlète sur la séance prévue rattachée (RPE + commentaire). */
export function SeanceFeedbackCard({ title, rpe, comment, onSave, saving = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [draftRpe, setDraftRpe] = useState<number | null>(rpe);
  const [draftComment, setDraftComment] = useState(comment ?? "");

  function open() {
    setDraftRpe(rpe);
    setDraftComment(comment ?? "");
    setEditing(true);
  }
  async function save() {
    if (!onSave) return;
    try {
      await onSave(draftRpe, draftComment.trim() || null);
      setEditing(false);
    } catch { /* toast affiché par la mutation ; le formulaire reste ouvert */ }
  }

  if (editing) {
    return (
      <div style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={KICKER}>{title}</span>
        <span style={{ fontSize: 12.5, color: C.tx2 }}>Difficulté ressentie, de 1 (très facile) à 10 (maximale)</span>
        <div role="radiogroup" aria-label="Difficulté ressentie" style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 4 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => {
            const on = draftRpe === v;
            return (
              <button
                key={v} type="button" role="radio" aria-checked={on}
                onClick={() => setDraftRpe(on ? null : v)}
                style={{
                  ...MONO, height: 34, borderRadius: 6, fontSize: 13, cursor: "pointer",
                  border: `1px solid ${on ? rpeColor(v) : C.brd}`,
                  background: on ? alpha(rpeColor(v), 0.16) : "transparent",
                  color: on ? rpeColor(v) : C.tx2,
                }}
              >
                {v}
              </button>
            );
          })}
        </div>
        <textarea
          value={draftComment}
          onChange={(e) => setDraftComment(e.target.value)}
          placeholder="Un mot sur la séance (facultatif)"
          aria-label="Commentaire sur la séance"
          rows={3}
          style={{
            resize: "vertical", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.brd}`,
            background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" style={buttonStyle()} onClick={() => setEditing(false)} disabled={saving}>Annuler</button>
          <button type="button" style={buttonStyle("primary")} onClick={save} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...CARD, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={KICKER}>{title}</span>
      {rpe !== null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 30, color: rpeColor(rpe) }}>{rpe}</span>
          <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>/ 10 · difficulté ressentie</span>
        </div>
      ) : (
        <span style={{ fontSize: 12.5, color: C.tx3 }}>Pas encore de retour sur cette séance.</span>
      )}
      {comment && <p style={{ margin: 0, fontSize: 13, color: C.tx2, lineHeight: 1.5 }}>« {comment} »</p>}
      {onSave && (
        <div>
          <button type="button" style={buttonStyle()} onClick={open}>
            <Pencil size={14} />{rpe === null && !comment ? "Donner mon retour" : "Modifier mon retour"}
          </button>
        </div>
      )}
    </div>
  );
}
