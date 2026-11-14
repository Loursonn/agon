import { cn } from "@/lib/utils";
import type { Light, LightResult } from "@shared/domain/wellnessLight";

const LABEL: Record<Light, string> = { green: "Feu vert", orange: "Feu orange", red: "Feu rouge" };

/** Couleurs de marque du feu : pastille, texte, cadre (bord 40 %, fond 10 %). */
const TONE: Record<Light, { dot: string; text: string; box: string }> = {
  green: { dot: "bg-agon-succes", text: "text-agon-succes", box: "border-agon-succes/[0.4] bg-agon-succes/[0.1]" },
  orange: { dot: "bg-agon-alerte", text: "text-agon-alerte", box: "border-agon-alerte/[0.4] bg-agon-alerte/[0.1]" },
  red: { dot: "bg-agon-erreur", text: "text-agon-erreur", box: "border-agon-erreur/[0.4] bg-agon-erreur/[0.1]" },
};

/**
 * Feu du matin calculé (`_shared/domain/wellnessLight.ts`) : pastille, libellé,
 * phrase du signal principal. Sans donnée : « — ».
 * `detail` : liste aussi les autres signaux (vue coach).
 */
export function WellnessLightBadge({
  result,
  loading = false,
  detail = false,
}: {
  result: LightResult | null | undefined;
  loading?: boolean;
  detail?: boolean;
}) {
  if (loading) return null;
  if (!result) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-agon-tx3" aria-label="Feu du matin : pas de donnée">
        <span aria-hidden className="size-2.5 rounded-full border border-agon-brd-l" />
        Feu du matin —
      </div>
    );
  }
  const tone = TONE[result.light];
  const others = [...result.orange, ...result.redSigns]
    .map((s) => s.text)
    .filter((t, i, all) => t !== result.sentence && all.indexOf(t) === i);
  return (
    <div
      role="status"
      className={cn("flex flex-col gap-1 rounded-[10px] border px-3 py-2", tone.box)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={cn("size-2.5 flex-none rounded-full", tone.dot)} />
        <span className={cn("whitespace-nowrap text-[13px] font-semibold", tone.text)}>{LABEL[result.light]}</span>
        <span className="min-w-0 text-[13px] text-agon-tx2">{result.sentence}</span>
      </div>
      {detail && others.length > 0 && (
        <div className="pl-[18px] text-[12px] text-agon-tx3">{others.join(" · ")}</div>
      )}
      {detail && (
        <div className="pl-[18px] text-[11px] text-agon-tx3">
          {result.brand ? `Mesures ${result.brand === "garmin" ? "Garmin" : result.brand === "coros" ? "COROS" : result.brand}` : "Sans montre : douleur, envie et fatigue seulement"}
          {result.hrv.dayIndex != null && result.hrv.dayIndex < 14 ? ` · alerte VFC active au 14e jour (J${result.hrv.dayIndex})` : ""}
        </div>
      )}
    </div>
  );
}
