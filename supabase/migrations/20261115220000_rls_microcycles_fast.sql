-- RLS des microcycles et des cycles accélérée, mêmes droits (suite de 20261115193700).
--
-- Constat : microcycles_* appellent cycle_athlete_id(cycle_id) (SECURITY INVOKER) à chaque
-- ligne. Elle lit cycles, mesocycles et macrocycles sous la RLS de l'appelant, et la RLS de
-- cycles rappelle mesocycle_athlete_id (invoker) qui relit mesocycles et macrocycles sous RLS :
-- une cascade de policies par ligne (~89 ms pour un athlète sur 148 microcycles).
--
-- Décision : deux lectures directes en SECURITY DEFINER, utilisées seulement dans les policies.
-- Les fonctions d'origine (cycle_athlete_id, mesocycle_athlete_id) ne changent pas : des RPC
-- s'en servent.
--
-- Pourquoi c'est équivalent. Notons P(a) le droit de voir une ligne de l'athlète a dans cette
-- hiérarchie : a = moi, ou (coach et can_coach_athlete(a)), ou (staff et staff_can(a,
-- 'planification','read')). macrocycles, mesocycles et cycles ont toutes cette règle-là, et
-- P(NULL) n'est jamais vrai. Donc, sous la RLS de l'appelant :
--   * mesocycle_athlete_id(me) = son athlète a si P(a), sinon NULL ;
--   * cycle_athlete_id(cy) = son athlète D si P(D), sinon NULL, sauf un cas « mixte » :
--     cycle rattaché à un mésocycle ET à un athlète différent de celui du macrocycle (0 ligne en
--     prod au 2026-11-15, mais possible) : la valeur dépend alors des deux athlètes.
-- Chaque policy n'utilise cette valeur v que sous la forme R(v), avec R(v) ⇒ P(v) et R(NULL)
-- jamais vrai. Remplacer « D si P(D) sinon NULL » par « D » ne change donc aucun résultat.
-- Les fonctions _fast renvoient l'athlète seulement si l'appelant a un lien avec lui (lui-même,
-- son coach ou co-coach, ou un pro au lien actif), condition plus large que P : elles ne
-- révèlent rien à un tiers et, quand elles renvoient NULL, R(v) serait de toute façon faux.
-- Le cas mixte repasse par l'ancienne fonction, à l'identique.
--
-- Preuve : supabase/tests/rls_microcycles_equivalence.sql (ancienne et nouvelle expression,
-- chaque utilisateur × chaque ligne, plus des cycles fictifs de chaque forme dont le mixte).
-- Retour arrière : supabase/rollback/20261115220000_rls_microcycles_fast.sql

-- ── Lectures directes ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rls_linked_to(p_athlete uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_athlete IS NOT NULL AND (
    p_athlete = auth.uid()
    OR public.is_coach_of(p_athlete)
    OR EXISTS (SELECT 1 FROM public.athlete_staff s
                WHERE s.athlete_id = p_athlete AND s.staff_id = auth.uid() AND s.status = 'active')
  );
$$;

COMMENT ON FUNCTION public.rls_linked_to(uuid) IS
  'Pour les policies : l''appelant est-il cet athlète, son coach (référent ou co-coach) ou un pro au lien actif ? Plus large que tout droit de lecture ; sert de garde aux fonctions _fast.';

CREATE OR REPLACE FUNCTION public.mesocycle_athlete_id_fast(p_mesocycle_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ma.athlete_id
    FROM public.mesocycles me
    JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
   WHERE me.id = p_mesocycle_id
     AND public.rls_linked_to(ma.athlete_id);
$$;

COMMENT ON FUNCTION public.mesocycle_athlete_id_fast(uuid) IS
  'Pour les policies de cycles : athlète du mésocycle sans relancer la RLS, seulement si l''appelant a un lien avec lui. Remplace mesocycle_athlete_id dans les policies (même résultat, voir 20261115220000).';

CREATE OR REPLACE FUNCTION public.cycle_athlete_id_fast(p_cycle_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.athlete
    FROM (SELECT CASE WHEN cy.mesocycle_id IS NULL THEN cy.athlete_id ELSE ma.athlete_id END AS athlete,
                 (cy.mesocycle_id IS NOT NULL AND cy.athlete_id IS NOT NULL
                  AND cy.athlete_id IS DISTINCT FROM ma.athlete_id) AS mixed
            FROM public.cycles cy
            LEFT JOIN public.mesocycles  me ON me.id = cy.mesocycle_id
            LEFT JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
           WHERE cy.id = p_cycle_id) o
   WHERE NOT o.mixed AND public.rls_linked_to(o.athlete);
$$;

COMMENT ON FUNCTION public.cycle_athlete_id_fast(uuid) IS
  'Pour les policies de microcycles : athlète du cycle sans relancer la RLS, seulement si l''appelant a un lien avec lui et si le cycle n''est pas mixte. Voir cycle_is_mixed et 20261115220000.';

CREATE OR REPLACE FUNCTION public.cycle_is_mixed(p_cycle_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.cycles cy
      JOIN public.mesocycles  me ON me.id = cy.mesocycle_id
      JOIN public.macrocycles ma ON ma.id = me.macrocycle_id
     WHERE cy.id = p_cycle_id
       AND cy.athlete_id IS NOT NULL
       AND cy.athlete_id IS DISTINCT FROM ma.athlete_id
       AND public.rls_linked_to(ma.athlete_id)
  );
$$;

COMMENT ON FUNCTION public.cycle_is_mixed(uuid) IS
  'Pour les policies de microcycles : cycle rattaché à un mésocycle et à un autre athlète que celui du macrocycle (et l''appelant a un lien avec ce dernier). Ce cas repasse par cycle_athlete_id, à l''identique.';

REVOKE ALL ON FUNCTION public.rls_linked_to(uuid)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mesocycle_athlete_id_fast(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cycle_athlete_id_fast(uuid)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cycle_is_mixed(uuid)            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_linked_to(uuid)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mesocycle_athlete_id_fast(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cycle_athlete_id_fast(uuid)     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cycle_is_mixed(uuid)            TO anon, authenticated, service_role;

-- ── Policies de cycles : COALESCE(athlete_id, mesocycle_athlete_id(…)) → … _fast(…) ──────

ALTER POLICY "cycles_select" ON public.cycles
  USING (((COALESCE(athlete_id, public.mesocycle_athlete_id_fast(mesocycle_id)) = (SELECT auth.uid()))
          OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id_fast(mesocycle_id))))));

ALTER POLICY "cycles_insert" ON public.cycles
  WITH CHECK (((athlete_id = (SELECT auth.uid()))
               OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id_fast(mesocycle_id))))));

ALTER POLICY "cycles_update" ON public.cycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id_fast(mesocycle_id)))))
  WITH CHECK (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id_fast(mesocycle_id)))));

ALTER POLICY "cycles_delete" ON public.cycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(athlete_id, public.mesocycle_athlete_id_fast(mesocycle_id)))));

ALTER POLICY "staff_cycles_read" ON public.cycles
  USING (((SELECT public.i_am_staff()) AND public.staff_can(COALESCE(athlete_id, public.mesocycle_athlete_id_fast(mesocycle_id)), 'planification'::text, 'read'::text)));

-- ── Policies de microcycles : cycle_athlete_id(cycle_id) → _fast, le cas mixte à l'identique ─

ALTER POLICY "microcycles_select" ON public.microcycles
  USING (((COALESCE(public.cycle_athlete_id_fast(cycle_id), CASE WHEN public.cycle_is_mixed(cycle_id) THEN public.cycle_athlete_id(cycle_id) END) = (SELECT auth.uid()))
          OR ((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(public.cycle_athlete_id_fast(cycle_id), CASE WHEN public.cycle_is_mixed(cycle_id) THEN public.cycle_athlete_id(cycle_id) END)))));

ALTER POLICY "microcycles_insert" ON public.microcycles
  WITH CHECK (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(public.cycle_athlete_id_fast(cycle_id), CASE WHEN public.cycle_is_mixed(cycle_id) THEN public.cycle_athlete_id(cycle_id) END))));

ALTER POLICY "microcycles_update" ON public.microcycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(public.cycle_athlete_id_fast(cycle_id), CASE WHEN public.cycle_is_mixed(cycle_id) THEN public.cycle_athlete_id(cycle_id) END))))
  WITH CHECK (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(public.cycle_athlete_id_fast(cycle_id), CASE WHEN public.cycle_is_mixed(cycle_id) THEN public.cycle_athlete_id(cycle_id) END))));

ALTER POLICY "microcycles_delete" ON public.microcycles
  USING (((SELECT public.i_am_coach()) AND public.can_coach_athlete(COALESCE(public.cycle_athlete_id_fast(cycle_id), CASE WHEN public.cycle_is_mixed(cycle_id) THEN public.cycle_athlete_id(cycle_id) END))));

ALTER POLICY "staff_microcycles_read" ON public.microcycles
  USING (((SELECT public.i_am_staff()) AND public.staff_can(COALESCE(public.cycle_athlete_id_fast(cycle_id), CASE WHEN public.cycle_is_mixed(cycle_id) THEN public.cycle_athlete_id(cycle_id) END), 'planification'::text, 'read'::text)));
