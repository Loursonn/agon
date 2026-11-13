-- Tests de 20261113163000_drop_invitations_retours.sql : plus aucune trace des liens d'invitation coach
-- ni de l'ancien fil « retours » ; weekly_retours et staff_invitations intacts. Toujours annulé.
BEGIN;
SELECT 'D1 table invitations supprimée' AS name, to_regclass('public.invitations') IS NULL AS ok
UNION ALL SELECT 'D2 table retours supprimée', to_regclass('public.retours') IS NULL
UNION ALL SELECT 'D3 table retours_votes supprimée', to_regclass('public.retours_votes') IS NULL
UNION ALL SELECT 'D4 fonctions d''invitation supprimées',
  NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname IN ('invitation_coach_name', 'redeem_invitation', 'invitation_is_valid'))
UNION ALL SELECT 'K1 weekly_retours conservée', to_regclass('public.weekly_retours') IS NOT NULL
UNION ALL SELECT 'K2 staff_invitations conservée', to_regclass('public.staff_invitations') IS NOT NULL;
ROLLBACK;
