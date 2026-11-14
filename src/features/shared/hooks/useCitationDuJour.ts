import { useState, useEffect } from "react";
import { citationDuJour } from "@/data/citations";
import type { Citation } from "@/data/citations";

/**
 * Citation du jour, recalculée quand l'app revient au premier plan (le jour a
 * pu changer). Aucun accès à la base : les « J'aime » ont été retirés le
 * 14/11/2026 (décision d'Hugo).
 */
export function useCitationDuJour() {
  const [citation, setCitation] = useState<Citation>(() => citationDuJour());

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      const fresh = citationDuJour();
      setCitation((cur) => (fresh.id !== cur.id ? fresh : cur));
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  return { citation };
}
