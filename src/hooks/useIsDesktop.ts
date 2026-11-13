import { useEffect, useState } from "react";

/** Ordinateur : ≥ 1024 px (préfixe Tailwind `lg:`), mise en page des planches « ordi ». */
export const DESKTOP_QUERY = "(min-width: 1024px)";

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(DESKTOP_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia?.(DESKTOP_QUERY);
    if (!mql) return;
    const on = () => setDesktop(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, []);
  return desktop;
}
