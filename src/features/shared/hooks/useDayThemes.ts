/**
 * Accès au « thème du jour » (`day_themes`).
 *
 * Le coach écrit, l'athlète lit : la RLS le garantit, les hooks ne font que
 * suivre. Deux lectures selon l'écran — une fenêtre de dates pour les vues
 * calendrier, un seul jour pour le drawer et le bandeau athlète — et deux
 * écritures, upsert et suppression.
 *
 * Toute écriture invalide le préfixe `['day-themes', athleteId]` au complet :
 * la pastille du calendrier, le bandeau du jour et le drawer lisent la même
 * ligne, ils doivent se contredire zéro seconde.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import {
  normalizeDayThemeLabel,
  safeThemeColor,
  isDayThemeDominante,
  isDayThemeIntensity,
  type DayThemeDominante,
  type DayThemeIntensity,
} from "@/lib/dayTheme";

export interface DayTheme {
  id: string;
  athlete_id: string;
  coach_id: string;
  /** Date ISO `yyyy-MM-dd`. */
  date: string;
  label: string;
  intensity: DayThemeIntensity | null;
  dominante: DayThemeDominante | null;
  color: string;
  note: string;
  /**
   * Nature du thème, calculée par Postgres (colonne générée) : jamais écrite
   * par le client, sinon l'insert échoue.
   */
  kind: "intensite" | "dominante" | "libre" | null;
  created_at: string;
  updated_at: string;
}

/** Thèmes d'une fenêtre de dates, indexables par `indexDayThemesByDate`. */
export function useDayThemesRange(
  athleteId: string | undefined,
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery<DayTheme[]>({
    queryKey: QK.dayThemesRange(athleteId ?? "", from ?? "", to ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_themes")
        .select("*")
        .eq("athlete_id", athleteId!)
        .gte("date", from!)
        .lte("date", to!)
        .order("date");
      if (error) throw error;
      return (data ?? []) as DayTheme[];
    },
    enabled: !!athleteId && !!from && !!to,
    staleTime: 60_000,
  });
}

/** Thème d'une date précise, ou `null` si le coach n'a rien posé. */
export function useDayTheme(athleteId: string | undefined, date: string | undefined) {
  return useQuery<DayTheme | null>({
    queryKey: QK.dayTheme(athleteId ?? "", date ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_themes")
        .select("*")
        .eq("athlete_id", athleteId!)
        .eq("date", date!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DayTheme | null;
    },
    enabled: !!athleteId && !!date,
    staleTime: 60_000,
  });
}

export interface UpsertDayThemeInput {
  athleteId: string;
  coachId: string;
  date: string;
  label?: string;
  intensity?: string | null;
  dominante?: string | null;
  color?: string | null;
  note?: string;
}

/**
 * Écrit (ou réécrit) le thème d'un jour.
 *
 * Les valeurs passent par les normaliseurs de `dayTheme.ts` avant l'envoi :
 * les CHECK en base sont une ceinture, pas le premier filet. Un code
 * d'intensité inconnu devient `null` plutôt que de faire échouer l'insert.
 */
export function useUpsertDayTheme() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpsertDayThemeInput) => {
      const row = {
        athlete_id: input.athleteId,
        coach_id: input.coachId,
        date: input.date,
        label: normalizeDayThemeLabel(input.label),
        intensity: isDayThemeIntensity(input.intensity) ? input.intensity : null,
        dominante: isDayThemeDominante(input.dominante) ? input.dominante : null,
        color: safeThemeColor(input.color),
        note: (input.note ?? "").trim().slice(0, 500),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from("day_themes")
        .upsert(row as never, { onConflict: "athlete_id,date" })
        .select()
        .single();
      if (error) throw error;
      return data as DayTheme;
    },
    onSuccess: (data) => {
      qc.setQueryData(QK.dayTheme(data.athlete_id, data.date), data);
      qc.invalidateQueries({ queryKey: QK.dayThemes(data.athlete_id) });
      // Le thème qu'on vient de poser doit apparaître dans les raccourcis
      // « récents » du coach, y compris pour ses autres athlètes.
      qc.invalidateQueries({ queryKey: ["day-themes", "recent"] });
    },
  });
}

/**
 * Les derniers thèmes posés par le coach, tous athlètes confondus.
 *
 * Sert à proposer en un clic ce qu'il écrit déjà toutes les semaines. On tire
 * large (`FETCH`) puis on déduplique côté client : la base ne sait pas que
 * « Seuil bleu » posé lundi et mercredi sont le même raccourci.
 */
const RECENT_FETCH = 60;

export function useRecentDayThemes(coachId: string | undefined) {
  return useQuery<DayTheme[]>({
    queryKey: QK.dayThemesRecent(coachId ?? ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_themes")
        .select("*")
        .eq("coach_id", coachId!)
        .order("updated_at", { ascending: false })
        .limit(RECENT_FETCH);
      if (error) throw error;
      return (data ?? []) as DayTheme[];
    },
    enabled: !!coachId,
    staleTime: 5 * 60_000,
  });
}

/** Retire le thème d'un jour. Le jour redevient muet, sans pastille. */
export function useDeleteDayTheme() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ athleteId, date }: { athleteId: string; date: string }) => {
      const { error } = await supabase
        .from("day_themes")
        .delete()
        .eq("athlete_id", athleteId)
        .eq("date", date);
      if (error) throw error;
    },
    onSuccess: (_d, { athleteId, date }) => {
      qc.setQueryData(QK.dayTheme(athleteId, date), null);
      qc.invalidateQueries({ queryKey: QK.dayThemes(athleteId) });
    },
  });
}
