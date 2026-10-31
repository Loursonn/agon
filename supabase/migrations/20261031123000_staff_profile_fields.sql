/*
  Staff V1 — profil de l'athlète vu par un professionnel, filtré par domaine.

  Avant : la policy profiles_select_staff_athletes ouvrait la ligne `profiles`
  entière de l'athlète au pro lié (poids, masse grasse, métabolisme, date de
  naissance, code coach…), quels que soient ses droits.

  Après : plus aucune lecture directe de `profiles` de l'athlète par le pro.
  Il passe par la RPC staff_athlete_profiles(), qui ne renvoie que :
    - toujours : nom, prénom, coach principal (id + nom) ;
    - sexe, âge, date de naissance : si tests, nutrition ou médical en lecture ;
    - taille, poids, masse grasse, métabolisme de base : si nutrition en lecture ;
    - suivi des habitudes activé : si bien-être en lecture ;
    - profil Hyrox : si séances en lecture.
  staff_can() applique déjà le consentement : medical, nutrition et wellness
  restent fermés tant que l'athlète n'a pas donné l'accord `staff_sharing`.
  Jamais renvoyés : coach_code, is_admin, booking_url, réglages internes.

  Le profil du coach principal reste lisible par la policy existante
  profiles_select_coaches (tous les coachs sont visibles des comptes
  connectés) : inchangé ici.
*/
BEGIN;

DROP POLICY IF EXISTS profiles_select_staff_athletes ON public.profiles;

CREATE OR REPLACE FUNCTION public.staff_athlete_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  first_name text,
  last_name text,
  coach_id uuid,
  coach_name text,
  gender text,
  age integer,
  birth_date date,
  height_cm integer,
  weight_kg numeric,
  body_fat_pct numeric,
  base_metabolism integer,
  habit_tracker_enabled boolean,
  is_hyrox_athlete boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH linked AS (
    SELECT p.*,
           public.staff_can(p.id, 'nutrition', 'read') AS can_nutrition,
           public.staff_can(p.id, 'tests', 'read')
             OR public.staff_can(p.id, 'nutrition', 'read')
             OR public.staff_can(p.id, 'medical', 'read') AS can_identity,
           public.staff_can(p.id, 'wellness', 'read') AS can_wellness,
           public.staff_can(p.id, 'seances', 'read') AS can_seances
      FROM public.profiles p
     WHERE EXISTS (
       SELECT 1 FROM public.athlete_staff s
        WHERE s.athlete_id = p.id
          AND s.staff_id = auth.uid()
          AND s.status = 'active'
     )
  )
  SELECT l.id, l.full_name, l.first_name, l.last_name, l.coach_id,
         c.full_name,
         CASE WHEN l.can_identity  THEN l.gender END,
         CASE WHEN l.can_identity  THEN l.age END,
         CASE WHEN l.can_identity  THEN l.birth_date END,
         CASE WHEN l.can_nutrition THEN l.height_cm END,
         CASE WHEN l.can_nutrition THEN l.weight_kg END,
         CASE WHEN l.can_nutrition THEN l.body_fat_pct END,
         CASE WHEN l.can_nutrition THEN l.base_metabolism END,
         CASE WHEN l.can_wellness  THEN l.habit_tracker_enabled END,
         CASE WHEN l.can_seances   THEN l.is_hyrox_athlete END
    FROM linked l
    LEFT JOIN public.profiles c ON c.id = l.coach_id;
$$;

REVOKE ALL ON FUNCTION public.staff_athlete_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_athlete_profiles() TO authenticated;

COMMIT;
