-- Un compte « coach_athlete » (coach qui s'entraîne aussi) est un coach : il
-- peut créer une clé pour son assistant IA. La politique d'origine
-- (20261030100000_coach_api.sql) n'acceptait que le rôle « coach ».

DROP POLICY IF EXISTS coach_api_keys_insert_own ON public.coach_api_keys;
CREATE POLICY coach_api_keys_insert_own ON public.coach_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = auth.uid()
    AND revoked_at IS NULL
    AND last_used_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('coach', 'coach_athlete')
    )
  );
