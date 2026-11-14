import { C } from "@/lib/theme";

/** Halo des en-têtes de maquette : couleur en haut à droite, couleur en bas à gauche. */
export function headerGlow(topRight?: string, bottomLeft?: string): string {
  const layers: string[] = [];
  if (topRight) layers.push(`radial-gradient(90% 120% at 100% 0%, ${topRight}4D, rgba(14,12,10,0) 60%)`);
  if (bottomLeft) layers.push(`radial-gradient(70% 90% at 0% 100%, ${bottomLeft}2E, rgba(14,12,10,0) 60%)`);
  layers.push(C.bg);
  return layers.join(", ");
}
