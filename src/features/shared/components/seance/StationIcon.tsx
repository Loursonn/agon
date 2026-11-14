import { HyroxPicto } from "@/features/shared/components/HyroxPicto";
import { hyroxStationOf } from "@/features/shared/components/hyroxStation";

/**
 * Picto et couleur d'un exercice HYROX, d'après le nom du tour. Dessins du
 * canvas (« À valider · pictos HYROX », validé le 12/11).
 */
export function StationIcon({ name, size = 16 }: { name: string | null | undefined; size?: number }) {
  return <HyroxPicto station={hyroxStationOf(name)} size={size} />;
}
