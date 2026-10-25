/**
 * Ligne d'équivalences d'allure, affichée sous une cible de vitesse.
 *
 *   « 23 km/h · 2'37/km · 400 m en 1'03 · tour de piste 1'03 · 105 % VMA »
 *
 * L'unité choisie par le coach passe en tête et en gras. Rien ne s'affiche si
 * la cible n'exprime pas une allure.
 */
import type { EnergyTarget } from "@/types/energy";
import { targetPaceEquivalents } from "@/lib/energy/paceEquivalents";

interface Props {
  target: EnergyTarget | null | undefined;
  /** Distance de la répétition en mètres, pour l'équivalence « 400 m en 1'03 ». */
  repDistanceM?: number | null;
  /** VMA de l'athlète en km/h — sans elle, pas de « % VMA ». */
  vma?: number | null;
  /** Masque l'unité déjà affichée par la cible elle-même. */
  omitPrimary?: boolean;
  align?: "left" | "center";
  fontSize?: number;
}

export function PaceEquivalents({
  target, repDistanceM, vma, omitPrimary, align = "left", fontSize = 11,
}: Props) {
  const all = targetPaceEquivalents(target, { repDistanceM, vma });
  const parts = omitPrimary ? all.filter((p) => !p.primary) : all;
  if (parts.length === 0) return null;

  return (
    <div
      style={{
        fontSize, lineHeight: 1.4, color: "#8B8A92",
        textAlign: align, width: "100%",
      }}
    >
      {parts.map((p, i) => (
        <span key={p.unit}>
          {i > 0 && <span style={{ opacity: 0.5 }}> · </span>}
          <span style={{ fontWeight: p.primary ? 700 : 400 }}>{p.text}</span>
        </span>
      ))}
    </div>
  );
}
