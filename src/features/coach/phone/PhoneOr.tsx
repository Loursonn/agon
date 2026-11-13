import type { ReactNode } from "react";
import { useIsPhone } from "@/hooks/useIsPhone";

/**
 * Écran téléphone ou écran ordinateur d'une même route. Seul l'un des deux
 * est monté : la page ordinateur ne charge rien sur un téléphone.
 */
export default function PhoneOr({ phone, desktop }: { phone: ReactNode; desktop: ReactNode }) {
  return <>{useIsPhone() ? phone : desktop}</>;
}
