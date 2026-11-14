import { useEffect, useState } from "react";

/** Écran large (≥ 1024 px, le `lg` de Tailwind) : mises en page ordinateur. */
export function useIsWide(minWidth = 1024): boolean {
  const query = `(min-width: ${minWidth}px)`;
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return wide;
}
