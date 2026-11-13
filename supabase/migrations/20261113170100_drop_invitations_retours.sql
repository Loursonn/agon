-- Décision 6 (docs/PLAN_LEGACY.md) : suppression des liens d'invitation coach et de l'ancien fil « retours ».
-- Préalables faits : liens désactivés (20261113162000), lecteurs retirés de src/ (dev), archive CSV hors repo.
-- IRRÉVERSIBLE : les lignes ne reviennent que depuis l'archive CSV.
-- Les tables actives weekly_retours et staff_invitations ne sont PAS concernées.

BEGIN;

DROP FUNCTION IF EXISTS public.invitation_coach_name(text);
DROP FUNCTION IF EXISTS public.redeem_invitation(text);
DROP FUNCTION IF EXISTS public.invitation_is_valid(text);

DROP TABLE IF EXISTS public.retours_votes;
DROP TABLE IF EXISTS public.retours;
DROP TABLE IF EXISTS public.invitations;

COMMIT;
