/**
 * Ouverture du viewer de fiche par query param `?fiche=<docId>`.
 * Même pathname → la page d'origine (séance…) n'est pas démontée ; la
 * fermeture fait `navigate(-1)` pour revenir exactement où on était.
 */
import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

export const FICHE_PARAM = "fiche";

export function useFicheViewer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const openDocId = params.get(FICHE_PARAM);

  const open = useCallback((docId: string) => {
    const next = new URLSearchParams(location.search);
    next.set(FICHE_PARAM, docId);
    navigate({ pathname: location.pathname, search: next.toString() }, { state: { ficheOpened: true } });
  }, [location.pathname, location.search, navigate]);

  const close = useCallback(() => {
    if ((location.state as { ficheOpened?: boolean } | null)?.ficheOpened) {
      navigate(-1);
      return;
    }
    // Deep-link direct : on retire seulement le paramètre
    const next = new URLSearchParams(location.search);
    next.delete(FICHE_PARAM);
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true });
  }, [location.pathname, location.search, location.state, navigate]);

  /** Change de variante sans empiler l'historique */
  const swap = useCallback((docId: string) => {
    const next = new URLSearchParams(location.search);
    next.set(FICHE_PARAM, docId);
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true, state: location.state });
  }, [location.pathname, location.search, location.state, navigate]);

  return { openDocId, open, close, swap };
}
