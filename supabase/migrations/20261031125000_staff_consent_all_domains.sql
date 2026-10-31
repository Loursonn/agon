/*
  Staff V1 — sans l'accord `staff_sharing`, un pro ne voit rien de l'athlète.

  Avant : staff_can() n'exigeait le consentement que pour medical, nutrition
  et wellness. Sans accord, le pro voyait quand même programme, séances,
  planning, tests, fiches et commentaires.

  Problème : la politique de confidentialité classe aussi les données
  d'entraînement parmi les données de santé (art. 9 RGPD). Les partager à un
  tiers sans accord explicite n'a pas de base légale.

  Après : tous les domaines exigent l'accord `staff_sharing` de l'athlète
  (dernière décision = accordé). Il est facultatif et retirable : un retrait
  coupe immédiatement tout accès du staff.

  Seule la fonction centrale change : toutes les ouvertures staff (tables,
  Storage, profil filtré, fiches, planning) passent par elle. Restent visibles
  sans accord, car ce ne sont pas des données de l'athlète : son nom et celui
  de son coach (pour que le pro sache qui il attend), la banque de fiches du
  coach, l'existence du lien.

  Rollback : rejouer la définition de staff_can() de
  20261031120000_staff_core.sql.
*/
BEGIN;

CREATE OR REPLACE FUNCTION public.staff_can(athlete_uuid uuid, domain text, level text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT athlete_uuid IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.athlete_staff s
       WHERE s.athlete_id = athlete_uuid
         AND s.staff_id   = auth.uid()
         AND s.status     = 'active'
         AND CASE level
               WHEN 'read'  THEN s.permissions->>domain IN ('read','write')
               WHEN 'write' THEN s.permissions->>domain = 'write'
               ELSE false
             END
    )
    AND EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = athlete_uuid
         AND c.purpose::text = 'staff_sharing'
         AND c.granted
    );
$$;

COMMENT ON FUNCTION public.staff_can(uuid, text, text) IS
  'Le pro courant a-t-il ce niveau sur ce domaine pour cet athlète ? Exige un lien actif ET l''accord staff_sharing de l''athlète, pour tous les domaines.';

COMMIT;
