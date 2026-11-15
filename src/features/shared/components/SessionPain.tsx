import { sessionPainText } from "@/lib/sessionPain";

/**
 * Douleur de séance déclarée par l'athlète en fin de séance (15/11), vue par le
 * coach et le staff. Rien n'est affiché sans douleur.
 */

/** Pastille courte pour l'en-tête d'une séance : « Douleur genou 6/10 ». */
export function SessionPainChip({ levels }: { levels?: Record<string, number> | null }) {
  const text = sessionPainText(levels);
  if (!text) return null;
  return (
    <span
      title={"Douleur pendant la séance : " + text}
      className="max-w-[180px] flex-none truncate rounded-[6px] border border-agon-rouge/30 bg-agon-rouge/10 px-1.5 py-0.5 text-[10px] font-semibold text-agon-rouge"
    >
      Douleur {text.charAt(0).toLowerCase() + text.slice(1)}
    </span>
  );
}

/** Ligne détaillée : zones, notes et commentaire de l'athlète. */
export function SessionPainDetail({ levels, note }: { levels?: Record<string, number> | null; note?: string | null }) {
  const text = sessionPainText(levels);
  if (!text) return null;
  return (
    <div className="rounded-[8px] border border-agon-rouge/25 bg-agon-rouge/[0.07] px-2.5 py-1.5 text-[11.5px]">
      <span className="font-semibold text-agon-rouge">Douleur pendant la séance : </span>
      <span className="text-agon-tx">{text}</span>
      {note && <div className="mt-0.5 whitespace-pre-wrap italic text-agon-tx2">« {note} »</div>}
    </div>
  );
}
