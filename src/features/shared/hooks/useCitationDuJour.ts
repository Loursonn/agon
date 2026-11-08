import { useState, useEffect, useCallback, useRef } from "react";
import { getCitationState, setCitationLiked, subscribeCitationLikes } from "@/api/appContent";
import { useAuth } from "@/hooks/useAuth";
import { citationDuJour } from "@/data/citations";
import { toast } from "sonner";
import type { Citation } from "@/data/citations";

export function useCitationDuJour() {
  const { user } = useAuth();
  const [citation, setCitation] = useState<Citation>(() => citationDuJour());
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const busy = useRef(false);

  const quoteId = citation.id;

  // Recalculate on visibility change (day may have changed)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        const fresh = citationDuJour();
        if (fresh.id !== quoteId) setCitation(fresh);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [quoteId]);

  // Fetch my like + count on mount / quoteId change
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    getCitationState(user.id, quoteId).then(
      (st) => {
        if (cancelled) return;
        setLiked(st.liked);
        setCount(st.count);
      },
      // Lecture ratée : affichage neutre (pas de like, compteur 0), comme avant.
      (e) => {
        console.warn("[citation] lecture des likes impossible", e);
        if (cancelled) return;
        setLiked(false);
        setCount(0);
      },
    );

    return () => { cancelled = true; };
  }, [user, quoteId]);

  // Realtime on citation_stats
  useEffect(() => subscribeCitationLikes(quoteId, setCount), [quoteId]);

  const toggle = useCallback(async () => {
    if (!user || busy.current) return;
    busy.current = true;

    const wasLiked = liked;
    const prevCount = count;

    // Optimistic
    setLiked(!wasLiked);
    setCount(Math.max(0, prevCount + (wasLiked ? -1 : 1)));

    try {
      await setCitationLiked(user.id, quoteId, !wasLiked);
    } catch {
      setLiked(wasLiked);
      setCount(prevCount);
      toast("Reessaie dans un instant.");
    } finally {
      busy.current = false;
    }
  }, [user, liked, count, quoteId]);

  return { citation, liked, count, toggle };
}
