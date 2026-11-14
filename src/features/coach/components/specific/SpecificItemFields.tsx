/**
 * SpecificItemFields — champs d'un item de bloc Classique :
 * exercice pris dans la banque d'exercices (ExerciceSearch, avec vidéo) ou
 * consigne libre, + prescription libre + repos + notes.
 * Les textes longs passent à la ligne (zones qui s'agrandissent).
 * À placer dans une ligne flex avec flexWrap: "wrap" (les notes prennent toute la largeur).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Youtube } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExerciceSearch } from "../programmation/ExerciceSearch";
import type { ClassiqueItem } from "@/types/specific";

const INPUT = "min-w-0 rounded-[6px] border border-agon-brd bg-agon-s2 px-2 py-1.5 text-[12px] text-agon-tx outline-none";

interface Props {
  item: ClassiqueItem;
  onChange: (patch: Partial<ClassiqueItem>) => void;
}

export default function SpecificItemFields({ item, onChange }: Props) {
  // Nouvel item vide → recherche ouverte directement
  const [searching, setSearching] = useState(!item.name.trim());
  const [showNotes, setShowNotes] = useState(!!item.notes);

  

  return (
    <>
      {/* Exercice (banque) ou consigne libre */}
      <div className="min-w-0 flex-[2]">
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
            className={cn(
              "flex w-full cursor-pointer items-center gap-1.5 rounded-[6px] border px-2 py-1.5 text-left text-[12px]",
              item.exercise_id ? "border-agon-accent/[0.314] bg-agon-accent/[0.051]" : "border-agon-brd bg-agon-s2",
              item.name.trim() ? "text-agon-tx" : "text-agon-tx3",
            )}
          >
            <span className="min-w-0 flex-1 whitespace-pre-wrap leading-[1.4] [overflow-wrap:anywhere]">
              {item.name.trim() || "Exercice / consigne…"}
            </span>
            {item.youtube_id && <Youtube size={12} className="shrink-0 text-agon-erreur" />}
          </button>
        )}
      </div>

      <AutoTextarea
        value={item.prescription ?? ""}
        onChange={(v) => onChange({ prescription: v })}
        placeholder="4x30m, 5×8, 3'…"
        className={cn(INPUT, "flex-[1.2]")}
      />
      <AutoTextarea
        value={item.rest ?? ""}
        onChange={(v) => onChange({ rest: v })}
        placeholder="Repos"
        className={cn(INPUT, "w-[70px] flex-[0_0_70px]")}
      />
      {showNotes ? (
        <AutoTextarea
          value={item.notes ?? ""}
          onChange={(v) => onChange({ notes: v || undefined })}
          placeholder="Consigne de la ligne (optionnel)…"
          className={cn(INPUT, "ml-[22px] basis-full text-agon-tx2")}
        />
      ) : (
        <button
          onClick={() => setShowNotes(true)}
          title="Ajouter une consigne à cette ligne"
          className="cursor-pointer bg-transparent px-0.5 py-0 text-[11px] text-agon-tx3"
        >
          ＋ consigne
        </button>
      )}
    </>
  );
}

/** Zone de texte d'une ligne qui s'agrandit avec son contenu (retour à la ligne visible). */
function AutoTextarea({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
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
      // leading après className : tailwind-merge retire un leading placé avant une taille de texte.
      className={cn("box-border resize-none overflow-hidden", className, "leading-[1.4]")}
    />
  );
}
