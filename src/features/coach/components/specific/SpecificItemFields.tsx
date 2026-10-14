/**
 * SpecificItemFields — champs d'un item de bloc Classique :
 * exercice pris dans la banque d'exercices (ExerciceSearch, avec vidéo) ou
 * consigne libre, + prescription libre + repos + notes.
 * Les textes longs passent à la ligne (zones qui s'agrandissent).
 * À placer dans une ligne flex avec flexWrap: "wrap" (les notes prennent toute la largeur).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Youtube } from "lucide-react";
import { C } from "@/lib/theme";
import { ExerciceSearch } from "../programmation/ExerciceSearch";
import type { ClassiqueItem } from "@/types/specific";

const VIOLET = "#FFC933";

interface Props {
  item: ClassiqueItem;
  onChange: (patch: Partial<ClassiqueItem>) => void;
}

export default function SpecificItemFields({ item, onChange }: Props) {
  // Nouvel item vide → recherche ouverte directement
  const [searching, setSearching] = useState(!item.name.trim());
  const [showNotes, setShowNotes] = useState(!!item.notes);

  const inputStyle: React.CSSProperties = {
    background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 6,
    color: C.tx, fontSize: 12, padding: "6px 8px",
    fontFamily: "inherit", outline: "none", minWidth: 0,
  };

  return (
    <>
      {/* Exercice (banque) ou consigne libre */}
      <div style={{ flex: 2, minWidth: 0 }}>
        {searching ? (
          <ExerciceSearch
            value={item.name}
            showTypeFilter
            onSelect={(ex) => {
              onChange({ name: ex.name, exercise_id: ex.id, youtube_id: ex.youtube_id });
              setSearching(false);
            }}
            onFreeText={(text) => {
              onChange({ name: text, exercise_id: undefined, youtube_id: undefined });
              setSearching(false);
            }}
            onClose={() => setSearching(false)}
          />
        ) : (
          <button
            onClick={() => setSearching(true)}
            title={item.exercise_id ? "Exercice de la banque — cliquer pour changer" : "Consigne libre — cliquer pour changer"}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 6,
              padding: "6px 8px", borderRadius: 6, textAlign: "left",
              border: `1px solid ${item.exercise_id ? VIOLET + "50" : C.brd}`,
              background: item.exercise_id ? VIOLET + "0D" : C.s2,
              color: item.name.trim() ? C.tx : C.tx3,
              fontSize: 12, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.4 }}>
              {item.name.trim() || "Exercice / consigne…"}
            </span>
            {item.youtube_id && <Youtube size={12} color="#EF4444" style={{ flexShrink: 0 }} />}
          </button>
        )}
      </div>

      <AutoTextarea
        value={item.prescription ?? ""}
        onChange={(v) => onChange({ prescription: v })}
        placeholder="4x30m, 5×8, 3'…"
        style={{ ...inputStyle, flex: 1.2 }}
      />
      <AutoTextarea
        value={item.rest ?? ""}
        onChange={(v) => onChange({ rest: v })}
        placeholder="Repos"
        style={{ ...inputStyle, width: 70, flex: "0 0 70px" }}
      />
      {showNotes ? (
        <AutoTextarea
          value={item.notes ?? ""}
          onChange={(v) => onChange({ notes: v || undefined })}
          placeholder="Consigne de la ligne (optionnel)…"
          style={{ ...inputStyle, flexBasis: "100%", marginLeft: 22, color: C.tx2 }}
        />
      ) : (
        <button
          onClick={() => setShowNotes(true)}
          title="Ajouter une consigne à cette ligne"
          style={{ background: "none", border: "none", color: C.tx3, fontSize: 11, cursor: "pointer", padding: "0 2px", fontFamily: "inherit" }}
        >
          ＋ consigne
        </button>
      )}
    </>
  );
}

/** Zone de texte d'une ligne qui s'agrandit avec son contenu (retour à la ligne visible). */
function AutoTextarea({ value, onChange, placeholder, style }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ resize: "none", overflow: "hidden", lineHeight: 1.4, boxSizing: "border-box", ...style }}
    />
  );
}
