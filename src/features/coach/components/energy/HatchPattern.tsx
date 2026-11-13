import { H } from "@/lib/theme";
/**
 * Pattern SVG hachuré réutilisable pour les barres "intensité non définie".
 * À placer dans un <defs> à l'intérieur du SVG parent.
 *
 * Usage :
 *   <defs><HatchPattern id="hatch-gray" /></defs>
 *   <rect fill="url(#hatch-gray)" ... />
 */
export default function HatchPattern({ id = "hatch-gray" }: { id?: string }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={8}
      height={8}
      patternTransform="rotate(45 0 0)"
    >
      <rect width={8} height={8} fill={H.grisFonce} />
      <line x1={0} y1={0} x2={0} y2={8} stroke={H.grisPlomb} strokeWidth={3} />
    </pattern>
  );
}
