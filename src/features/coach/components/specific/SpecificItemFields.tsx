/**
 * SpecificItemFields — champs d'un item de bloc Classique :
 * exercice pris dans la banque d'exercices (ExerciceSearch, avec vidéo) ou
 * consigne libre, + prescription libre + repos.
 */
import { useState } from "react";
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
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.name.trim() || "Exercice / consigne…"}
            </span>
            {item.youtube_id && <Youtube size={12} color="#EF4444" style={{ flexShrink: 0 }} />}
          </button>
        )}
      </div>

      <input
        value={item.prescription ?? ""}
        onChange={(e) => onChange({ prescription: e.target.value })}
        placeholder="4x30m, 5×8, 3'…"
        style={{ ...inputStyle, flex: 1.2 }}
      />
      <input
        value={item.rest ?? ""}
        onChange={(e) => onChange({ rest: e.target.value })}
        placeholder="Repos"
        style={{ ...inputStyle, width: 70 }}
      />
    </>
  );
}
