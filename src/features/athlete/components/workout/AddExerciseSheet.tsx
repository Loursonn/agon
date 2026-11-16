import { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { useExerciseSearch } from "@/features/shared/hooks/useExerciseLibrary";

const DEBOUNCE_MS = 250;

/**
 * Fenêtre « Ajouter un exercice » pendant la séance : l'athlète tape quelques
 * lettres, la banque d'exercices propose ; s'il ne trouve pas, il garde le nom
 * tapé tel quel (choix d'Hugo, 16/11/2026). L'exercice n'existe que dans cette
 * séance réalisée.
 */
export function AddExerciseSheet({
  onPick,
  onClose,
}: {
  onPick: (p: { name: string; exerciseId: string | null }) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(text), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [text]);
  const { results, isFetching } = useExerciseSearch(term, "");

  const typed = text.trim();
  const exact = results.some((r) => r.name.trim().toLowerCase() === typed.toLowerCase());

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }} />
      <div
        role="dialog"
        aria-label="Ajouter un exercice"
        style={{
          position: "fixed", left: 0, right: 0, top: 48, bottom: 0, zIndex: 41, background: C.s1,
          borderTop: "1px solid " + C.brdL, borderRadius: "20px 20px 0 0",
          padding: "18px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)", maxWidth: 480, margin: "0 auto",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 11, color: C.tx3, letterSpacing: "0.14em", textTransform: "uppercase" }}>Hors programme</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 16, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
          >×</button>
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: C.tx, marginTop: 8 }}>Ajouter un exercice</div>
        <div style={{ fontSize: 13, color: C.tx2, marginTop: 4, lineHeight: 1.4 }}>
          Il s'ajoute à cette séance seulement ; ton coach le verra dans ta séance réalisée.
        </div>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && typed) onPick({ name: typed, exerciseId: null }); }}
          placeholder="Rechercher ou taper un nom…"
          aria-label="Nom de l'exercice"
          maxLength={80}
          style={{
            marginTop: 14, height: 48, borderRadius: 12, border: "1px solid " + C.brdL, background: C.s2,
            color: C.tx, fontSize: 16, padding: "0 14px", fontFamily: "inherit", outline: "none",
          }}
        />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick({ name: r.name, exerciseId: r.id })}
              style={{
                display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "10px 14px",
                borderRadius: 12, border: "1px solid " + C.brd, background: C.s2, color: C.tx,
                fontSize: 15, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
              {r.youtube_id && <span style={{ ...MONO, fontSize: 10, color: C.tx3, letterSpacing: "0.1em" }}>VIDÉO</span>}
            </button>
          ))}
          {typed && !exact && (
            <button
              type="button"
              onClick={() => onPick({ name: typed, exerciseId: null })}
              style={{
                minHeight: 48, padding: "10px 14px", borderRadius: 12, border: "1px dashed " + C.brdL,
                background: "transparent", color: C.tx, fontSize: 15, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Ajouter « {typed} »
              <span style={{ display: "block", fontSize: 12, color: C.tx3, marginTop: 2 }}>Nom libre, hors banque d'exercices</span>
            </button>
          )}
          {!typed && (
            <div style={{ fontSize: 13, color: C.tx3, textAlign: "center", padding: "18px 0" }}>
              Tape le début du nom : la banque d'exercices te propose.
            </div>
          )}
          {typed && isFetching && results.length === 0 && (
            <div style={{ fontSize: 13, color: C.tx3, textAlign: "center", padding: "8px 0" }}>Recherche…</div>
          )}
        </div>
      </div>
    </>
  );
}
