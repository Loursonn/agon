import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { zoneColor } from "@/lib/seance";
import type { Tint } from "@/lib/energy/energyRun";

/** Couleur d'une teinte de séance d'énergie : zone (5 zones), récup en bleu Énergie, libre en sable. */
export function tintColor(t: Tint): string {
  if (t.kind === "zone") return zoneColor(t.zone, 5);
  if (t.kind === "recup") return TYPE_COLOR.energie;
  return C.sable;
}

/** « Effort · Z3 », « Récup », « Échauffement ». */
export function tintLabel(word: string, t: Tint): string {
  return t.kind === "zone" ? `${word} · Z${t.zone}` : word;
}

/** Carte d'un type (peps) : fond 12 %, contour 45 %. */
export function tintCard(color: string) {
  return { background: alpha(color, 0.12), border: `1px solid ${alpha(color, 0.45)}` };
}
