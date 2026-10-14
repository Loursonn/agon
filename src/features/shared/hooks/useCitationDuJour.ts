import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
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

    (async () => {
      const [likeRes, statsRes] = await Promise.all([
        supabase
          .from("citation_likes")
          .select("quote_id")
          .eq("user_id", user.id)
          .eq("quote_id", quoteId)
          .maybeSingle(),
        supabase
          .from("citation_stats")
          .select("likes")
          .eq("quote_id", quoteId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setLiked(!!likeRes.data);
      setCount(statsRes.data?.likes ?? 0);
    })();

    return () => { cancelled = true; };
  }, [user, quoteId]);

  // Realtime on citation_stats
  useEffect(() => {
    const channel = supabase
      .channel(`citation-stats-${quoteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "citation_stats",
          filter: `quote_id=eq.${quoteId}`,
        },
        (payload) => {
          const newLikes = (payload.new as { likes?: number })?.likes;
          if (typeof newLikes === "number") setCount(newLikes);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [quoteId]);

  const toggle = useCallback(async () => {
    if (!user || busy.current) return;
    busy.current = true;

    const wasLiked = liked;
    const prevCount = count;

    // Optimistic
    setLiked(!wasLiked);
    setCount(Math.max(0, prevCount + (wasLiked ? -1 : 1)));

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from("citation_likes")
          .delete()
          .eq("user_id", user.id)
          .eq("quote_id", quoteId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("citation_likes")
          .insert({ user_id: user.id, quote_id: quoteId });
        if (error) throw error;
      }
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
