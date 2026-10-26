/*
  Chantier G — garde-fou IA par source de données.

  La migration précédente a posé `ai_allowed` sur chaque ligne importée. Cette
  colonne ne protège rien par elle-même : il faut qu'aucun chemin menant à
  Gemini ne puisse lire une ligne interdite. On ne compte pas pour cela sur un
  `WHERE ai_allowed` écrit correctement à chaque fois — on supprime la
  possibilité de l'oublier, en ne donnant au chemin IA qu'une surface de
  lecture qui ne contient pas les lignes interdites.

  Deux pièces :
    1. deux vues filtrées, seule porte d'entrée du constructeur de prompt ;
    2. une fonction qui répond « quelles sources sont utilisables pour l'IA
       pour cet athlète », en combinant la règle contractuelle du fournisseur
       et le consentement personnel de l'athlète.

  Les deux conditions sont nécessaires et aucune ne rachète l'autre : le
  consentement de l'athlète ne nous autorise pas à violer les conditions de
  Garmin, et les conditions de Garmin ne consentent pas à sa place.
*/

-- ─────────────────── Surface de lecture du chemin IA ────────────────────────
/*
  `security_invoker = true` : la vue n'élargit rien. Les politiques RLS des
  tables sous-jacentes continuent de s'appliquer avec les droits de l'appelant,
  la vue ne fait que retirer des lignes. Une vue en security_definer serait un
  contournement de RLS déguisé en commodité.
*/
CREATE VIEW public.ai_provider_activities
WITH (security_invoker = true) AS
  SELECT id, athlete_id, source, external_id, started_at, local_date, sport,
         duration_s, distance_m, elevation_gain_m, avg_hr, max_hr,
         avg_pace_s_per_km, calories, imported_at
    FROM public.provider_activities
   WHERE ai_allowed;

COMMENT ON VIEW public.ai_provider_activities IS
  'Activités utilisables par le chemin IA. Seule source de lecture autorisée pour un prompt : ne pas requêter provider_activities directement depuis un constructeur de prompt. Exclut details et raw — un payload brut de fournisseur peut contenir des champs qu''on n''a pas inventoriés.';

CREATE VIEW public.ai_provider_dailies
WITH (security_invoker = true) AS
  SELECT id, athlete_id, source, day, resting_hr, hrv_ms, sleep_total_min,
         sleep_deep_min, sleep_rem_min, sleep_score, steps, stress_avg,
         body_battery_min, body_battery_max, vo2max, training_load, imported_at
    FROM public.provider_dailies
   WHERE ai_allowed;

COMMENT ON VIEW public.ai_provider_dailies IS
  'Données quotidiennes utilisables par le chemin IA. Mêmes règles que ai_provider_activities.';

/*
  `raw` et `details` sont volontairement absents des deux vues. Ce ne sont pas
  des colonnes de confort : ce sont des charges utiles de fournisseur, dont on
  ne contrôle ni le contenu ni son évolution. Les transmettre à un modèle
  reviendrait à envoyer des champs qu'on n'a jamais inventoriés — y compris,
  dans le cas de COROS, des données de cycle menstruel si l'API décidait de les
  inclure dans une réponse qu'on ne lui a pas demandée. On expose des colonnes
  nommées, pas un sac.
*/

REVOKE ALL ON public.ai_provider_activities FROM anon;
REVOKE ALL ON public.ai_provider_dailies FROM anon;
GRANT SELECT ON public.ai_provider_activities TO authenticated, service_role;
GRANT SELECT ON public.ai_provider_dailies TO authenticated, service_role;

-- ──────────────── Sources utilisables pour l'IA, par athlète ────────────────
/*
  Réponse unique à « que puis-je envoyer au modèle pour cet athlète ».

  Sans consentement `ai_programming`, le résultat est un tableau vide — pas
  « toutes les sources sauf celles interdites ». Le refus de l'IA par l'athlète
  n'est pas un filtre de plus, c'est une porte fermée.

  Pas de SECURITY DEFINER ici, contrairement à `source_consent_granted` : cette
  fonction est appelée par le chemin IA, qui tourne en `service_role` dans une
  Edge Function et contourne donc déjà RLS. Un coach qui l'appellerait
  obtiendrait un tableau vide faute de pouvoir lire le journal de consentement
  de son athlète — ce qui est le bon résultat, puisque le coach n'a pas à
  décider de ce qui part chez Gemini.
*/
CREATE OR REPLACE FUNCTION public.ai_eligible_sources(p_athlete uuid)
RETURNS public.data_source[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = p_athlete
         AND c.purpose = 'ai_programming'
         AND c.granted
    ) THEN '{}'::public.data_source[]
    ELSE COALESCE(
      (SELECT array_agg(p.source ORDER BY p.source)
         FROM public.data_source_policies p
        WHERE p.ai_allowed),
      '{}'::public.data_source[]
    )
  END;
$$;

COMMENT ON FUNCTION public.ai_eligible_sources(uuid) IS
  'Sources de données transmissibles à un service d''IA pour cet athlète : conditions du fournisseur ET consentement ai_programming. Tableau vide si l''athlète a refusé l''IA.';

REVOKE ALL ON FUNCTION public.ai_eligible_sources(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_eligible_sources(uuid) TO authenticated, service_role;
