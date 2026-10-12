import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Read and toggle `is_hyrox_athlete` on a profile.
 * Pattern follows useHabits (flag on profiles + optimistic rollback).
 */
export function useHyroxFlag(athleteId: string | undefined) {
  const { user, profile } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!athleteId) return;
    supabase
      .from("profiles")
      .select("is_hyrox_athlete")
      .eq("id", athleteId)
      .single()
      .then(({ data }) => {
        if (data) setEnabled(!!(data as { is_hyrox_athlete?: boolean }).is_hyrox_athlete);
      });
  }, [athleteId]);

  const toggle = async () => {
    if (!athleteId) return;
    setToggling(true);
    const next = !enabled;
    setEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({ is_hyrox_athlete: next } as Record<string, unknown>)
      .eq("id", athleteId);
    if (error) {
      setEnabled(!next);
      toast.error("Impossible de modifier le flag HYROX");
      console.error("hyrox flag toggle:", error);
    }
    // Refresh athletes list so ContextBar / AthleteLayout see the change
    if (user && !error) {
      const isOwn = athleteId === user.id;
      if (isOwn || profile?.role === "coach" || profile?.role === "coach_athlete") {
        // Re-fetch profile data so selectedAthlete picks up the flag
        const { data: freshProfile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", athleteId)
          .single();
        if (freshProfile) {
          // Dispatch a custom event for ContextBar/AthleteLayout to react
          window.dispatchEvent(new CustomEvent("hyrox-flag-changed", { detail: { athleteId, enabled: next } }));
        }
      }
    }
    setToggling(false);
  };

  return { enabled, toggling, toggle };
}
