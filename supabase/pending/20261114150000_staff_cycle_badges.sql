-- Badge « CYCLE · S1 / 5 » de l'accueil staff (planche CoachOrdiBStaffAccueil).
-- EN ATTENTE : rien n'est appliqué tant qu'Hugo n'a pas tranché.
--
-- Constat (test supabase/pending/20261114150000_staff_cycle_badges_test.sql) :
-- le pro qui a « Planification » en lecture lit DÉJÀ `cycles` et `microcycles`
-- (policies staff_cycles_read / staff_microcycles_read). Le badge peut donc
-- s'afficher sans migration, avec deux requêtes par athlète.
--
-- Cette RPC est l'option « une seule requête » : pour tous les athlètes du pro
-- connecté, le nom du cycle en cours (sinon le plus récent), le rang de la
-- semaine du jour et le nombre de semaines. Rien de plus (ni dates, ni
-- objectif, ni séances). Même règle que les policies : staff_can(...,
-- 'planification', 'read'), donc lien actif + accord staff_sharing. Aucune
-- donnée nouvelle n'est ouverte au staff.

CREATE OR REPLACE FUNCTION public.staff_cycle_badges()
RETURNS TABLE (athlete_id uuid, cycle_name text, week_index int, week_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH mine AS (
    SELECT DISTINCT s.athlete_id
      FROM public.athlete_staff s
     WHERE s.staff_id = auth.uid()
       AND s.status = 'active'
       AND public.staff_can(s.athlete_id, 'planification', 'read')
  ),
  cyc AS (
    -- Comme le client (useCurrentCycle) : le cycle qui couvre aujourd'hui, sinon le plus récent.
    SELECT DISTINCT ON (m.athlete_id) m.athlete_id, c.id, c.name
      FROM mine m
      JOIN public.cycles c
        ON COALESCE(c.athlete_id, public.mesocycle_athlete_id(c.mesocycle_id)) = m.athlete_id
     ORDER BY m.athlete_id,
              (current_date BETWEEN c.start_date AND c.end_date) DESC,
              c.start_date DESC
  )
  SELECT cyc.athlete_id,
         cyc.name,
         (SELECT w.rn::int
            FROM (SELECT mc.start_date, mc.end_date, row_number() OVER (ORDER BY mc.start_date) AS rn
                    FROM public.microcycles mc WHERE mc.cycle_id = cyc.id) w
           WHERE current_date BETWEEN w.start_date AND w.end_date
           LIMIT 1),
         (SELECT count(*)::int FROM public.microcycles mc WHERE mc.cycle_id = cyc.id)
    FROM cyc;
$$;

COMMENT ON FUNCTION public.staff_cycle_badges() IS
  'Accueil staff : nom du cycle en cours et « S x / n » de chaque athlète du pro connecté, si staff_can(planification, read). Rien d''autre.';

REVOKE ALL ON FUNCTION public.staff_cycle_badges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_cycle_badges() TO authenticated;
