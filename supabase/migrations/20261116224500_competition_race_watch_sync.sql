/*
  Compétition HYROX ↔ analyse de course : une seule sortie de montre
  (demande d'Hugo, 16/11/2026 : « linker une compétition HYROX à une sortie
  Garmin pour avoir la courbe FC », depuis la compétition du planning).

  Deux endroits choisissent l'activité de la montre de la course :
  - la compétition (rapprochement `activity_plan_links`, type `competition`,
    lien confirmé par l'athlète ou le coach) ;
  - l'analyse de course HYROX (`hyrox_results.watch_activity_id` + recalage
    `watch_offset_s`).
  Ils restent alignés, sans double saisie. Le dernier choix gagne (choix
  d'Hugo) : choisir une autre sortie depuis la compétition remet le recalage
  en automatique ; dans l'autre sens le recalage choisi est gardé.

  1. lien compétition confirmé → courses HYROX de la compétition ;
     lien défait (refusé, supprimé) → la course revient à la proposition ;
  2. course HYROX liée à une sortie → lien confirmé de sa compétition
     (remplace l'ancien) ; course déliée → lien confirmé retiré, la
     proposition automatique reprend ;
  3. premier alignement des données existantes.

  Les propositions automatiques (`auto`) ne touchent pas la course : l'analyse
  les lit déjà en repli (useRaceWatch).

  Additive (deux triggers). Tests : supabase/tests/competition_race_watch_sync.sql.
*/

-- ═══════════════ 1. Compétition → course HYROX ══════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_competition_link_to_race()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Lien confirmé (créé, confirmé ou déplacé) : la course suit, recalage automatique.
  IF TG_OP <> 'DELETE' AND NEW.planned_kind = 'competition' AND NEW.status = 'confirmed'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'confirmed' OR OLD.activity_id IS DISTINCT FROM NEW.activity_id) THEN
    UPDATE public.hyrox_results
       SET watch_activity_id = NEW.activity_id, watch_offset_s = NULL
     WHERE competition_id = NEW.planned_id
       AND athlete_id = NEW.athlete_id
       AND watch_activity_id IS DISTINCT FROM NEW.activity_id;
  END IF;

  -- Lien confirmé défait (refusé, supprimé, déplacé) : la course qui pointait
  -- sur cette activité revient à la proposition d'office.
  IF TG_OP <> 'INSERT' AND OLD.planned_kind = 'competition' AND OLD.status = 'confirmed'
     AND (TG_OP = 'DELETE' OR NEW.status <> 'confirmed' OR NEW.activity_id IS DISTINCT FROM OLD.activity_id) THEN
    UPDATE public.hyrox_results
       SET watch_activity_id = NULL, watch_offset_s = NULL
     WHERE competition_id = OLD.planned_id
       AND watch_activity_id = OLD.activity_id
       AND NOT EXISTS (SELECT 1 FROM public.activity_plan_links l
                        WHERE l.planned_kind = 'competition' AND l.planned_id = OLD.planned_id
                          AND l.activity_id = OLD.activity_id AND l.status = 'confirmed');
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_competition_link_to_race() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS activity_plan_links_race_watch ON public.activity_plan_links;
CREATE TRIGGER activity_plan_links_race_watch
  AFTER INSERT OR DELETE OR UPDATE OF status, activity_id ON public.activity_plan_links
  FOR EACH ROW EXECUTE FUNCTION public.tg_competition_link_to_race();

-- ═══════════════ 2. Course HYROX → compétition ══════════════════════════════

/* Aligne le lien de la compétition sur la sortie choisie pour la course. */
CREATE OR REPLACE FUNCTION public._sync_competition_link_from_race(p_competition uuid, p_activity uuid, p_previous uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_comp record;
  v_act record;
BEGIN
  SELECT id, athlete_id, date INTO v_comp FROM public.competitions WHERE id = p_competition;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_activity IS NULL THEN
    -- Course déliée : son lien confirmé tombe, la proposition automatique reprend.
    IF p_previous IS NOT NULL THEN
      DELETE FROM public.activity_plan_links
       WHERE planned_kind = 'competition' AND planned_id = p_competition
         AND activity_id = p_previous AND status = 'confirmed';
      PERFORM public.auto_link_day(v_comp.athlete_id, v_comp.date);
    END IF;
    RETURN;
  END IF;

  SELECT id, athlete_id, source, local_date INTO v_act FROM public.provider_activities WHERE id = p_activity;
  IF NOT FOUND OR v_act.athlete_id <> v_comp.athlete_id THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.activity_plan_links
              WHERE planned_kind = 'competition' AND planned_id = p_competition
                AND activity_id = p_activity AND status = 'confirmed') THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_act.athlete_id::text || v_act.local_date::text, 41));
  -- Le dernier choix gagne : l'ancien lien confirmé de la compétition, et celui
  -- de l'activité vers une autre séance, sont refusés (le couple n'est plus reproposé).
  UPDATE public.activity_plan_links
     SET status = 'rejected', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now()
   WHERE status = 'confirmed'
     AND ((planned_kind = 'competition' AND planned_id = p_competition)
       OR activity_id = p_activity);
  DELETE FROM public.activity_plan_links
   WHERE status = 'auto'
     AND (activity_id = p_activity OR (planned_kind = 'competition' AND planned_id = p_competition));
  INSERT INTO public.activity_plan_links (athlete_id, activity_id, source, planned_kind, planned_id, local_date,
                                          status, confirmed_by, confirmed_at)
  VALUES (v_act.athlete_id, p_activity, v_act.source, 'competition', p_competition, v_act.local_date,
          'confirmed', auth.uid(), now())
  ON CONFLICT (activity_id, planned_kind, planned_id) DO UPDATE
    SET status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now();
  PERFORM public.auto_link_day(v_act.athlete_id, v_act.local_date);
  IF v_act.local_date <> v_comp.date THEN
    PERFORM public.auto_link_day(v_comp.athlete_id, v_comp.date);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._sync_competition_link_from_race(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_race_watch_to_competition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.competition_id IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.watch_activity_id IS NOT DISTINCT FROM OLD.watch_activity_id THEN RETURN NULL; END IF;
  IF TG_OP = 'INSERT' AND NEW.watch_activity_id IS NULL THEN RETURN NULL; END IF;
  PERFORM public._sync_competition_link_from_race(
    NEW.competition_id, NEW.watch_activity_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.watch_activity_id END);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_race_watch_to_competition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hyrox_results_race_watch ON public.hyrox_results;
CREATE TRIGGER hyrox_results_race_watch
  AFTER INSERT OR UPDATE OF watch_activity_id ON public.hyrox_results
  FOR EACH ROW EXECUTE FUNCTION public.tg_race_watch_to_competition();

-- ═══════════════ 3. Premier alignement ══════════════════════════════════════

-- Courses déjà liées à une sortie : la compétition suit (recalage gardé).
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT h.competition_id, h.watch_activity_id FROM public.hyrox_results h
            WHERE h.competition_id IS NOT NULL AND h.watch_activity_id IS NOT NULL LOOP
    PERFORM public._sync_competition_link_from_race(r.competition_id, r.watch_activity_id, NULL);
  END LOOP;
END $$;

-- Compétitions liées à la main dont la course n'a pas de sortie : la course suit.
UPDATE public.hyrox_results h
   SET watch_activity_id = l.activity_id, watch_offset_s = NULL
  FROM public.activity_plan_links l
 WHERE l.planned_kind = 'competition' AND l.status = 'confirmed'
   AND l.planned_id = h.competition_id AND l.athlete_id = h.athlete_id
   AND h.watch_activity_id IS NULL;
