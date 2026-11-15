import { useState } from "react";
import { PainZoneMap } from "@/features/athlete/components/wellness/PainZoneMap";
import { type SessionPainAnswer, sessionPainIncomplete } from "@/lib/sessionPain";

const YES_NO = "h-10 w-[72px] cursor-pointer rounded-[12px] text-[14px] font-medium";

/**
 * « Une douleur pendant la séance ? » (fin de séance muscu, énergie, HYROX).
 * Non par défaut (rien d'écrit) ; Oui ouvre la carte douleur du wellness et un
 * commentaire facultatif, et devient une blessure déclarée (ou le suivi de
 * celle déjà en cours sur la zone). Ne bloque jamais la validation.
 */
export function SessionPainQuestion({
  value,
  onChange,
}: {
  value: SessionPainAnswer;
  onChange: (next: SessionPainAnswer) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const yes = value.has === true;

  return (
    <div className="flex flex-col gap-agon-md text-left">
      <div className="flex items-center gap-agon-md rounded-[14px] border border-agon-brd bg-agon-s1 px-[14px] py-agon-md">
        <div className="min-w-0 flex-1">
          <div className="text-agon-base font-medium text-agon-tx">Une douleur pendant la séance ?</div>
          <div className="mt-[2px] text-[11.5px] text-agon-tx3">Autre que la fatigue ou les courbatures</div>
        </div>
        <div className="flex flex-none gap-2">
          <button
            type="button"
            aria-pressed={yes}
            onClick={() => onChange({ ...value, has: true })}
            className={YES_NO + (yes ? " border-none bg-agon-rouge text-agon-ink" : " border border-agon-rouge/45 bg-agon-rouge/[0.08] text-agon-rouge")}
          >
            Oui
          </button>
          <button
            type="button"
            aria-pressed={value.has === false}
            onClick={() => { setSelected(null); onChange({ has: false, levels: {}, note: "" }); }}
            className={YES_NO + (value.has === false ? " border-none bg-agon-vert text-agon-ink" : " border border-agon-brd-l bg-transparent text-agon-tx2")}
          >
            Non
          </button>
        </div>
      </div>

      {yes && (
        <>
          <PainZoneMap
            levels={value.levels}
            onChange={(levels) => onChange({ ...value, levels })}
            selected={selected}
            onSelect={setSelected}
          />
          {sessionPainIncomplete(value) && (
            <div className="text-[11.5px] text-agon-tx3">Note chaque zone touchée de 0 à 10 : une zone sans note n'est pas enregistrée.</div>
          )}
          <textarea
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            maxLength={500}
            rows={2}
            placeholder="Un commentaire ? (facultatif : à quel moment, sur quel exercice…)"
            aria-label="Commentaire sur la douleur"
            className="w-full resize-none rounded-[12px] border border-agon-brd bg-agon-s1 px-[12px] py-[10px] font-[inherit] text-agon-sm text-agon-tx outline-none placeholder:text-agon-tx3"
          />
          <div className="text-[11.5px] text-agon-tx3">
            Ton coach la verra dans tes blessures en cours (une douleur déjà déclarée sur la même zone est mise à jour). Tu la clôtures depuis ton profil quand c'est passé.
          </div>
        </>
      )}
    </div>
  );
}
