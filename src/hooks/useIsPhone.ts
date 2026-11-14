import { useSyncExternalStore } from "react";

/**
 * Téléphone : largeur < 768 px (même seuil que `useIsMobile` et le préfixe
 * Tailwind `md:`). Lu dès le premier rendu (pas de `false` puis `true`) : une
 * page ordinateur n'est jamais montée, même un instant, sur un téléphone.
 */
export const PHONE_QUERY = "(max-width: 767px)";

function subscribe(cb: () => void) {
  const mql = typeof window !== "undefined" ? window.matchMedia?.(PHONE_QUERY) : undefined;
  if (!mql) return () => {};
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

const snapshot = () => typeof window !== "undefined" && !!window.matchMedia?.(PHONE_QUERY).matches;

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
