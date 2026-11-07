-- =============================================================================
-- Sécurité — partie 1 : nouvelles fonctions (additif, sans risque pour le client actuel)
-- Audit du 2026-11-07 (docs/AUDIT_REFONTE_2026-11.md §1).
--
-- Remplace les lectures directes de `profiles` / `invitations` faites AVANT
-- l'inscription (rôle anon) et les changements de coach_id faits côté client.
-- La partie 2 (20261107110000_security_lockdown.sql) ferme ensuite les accès
-- directs : elle ne doit être appliquée qu'une fois le client qui appelle ces
-- fonctions déployé en production.
-- =============================================================================

-- Un code coach existe-t-il ? (inscription athlète avant création du compte,
-- contrôle d'unicité à l'inscription coach). Ne renvoie aucune donnée.
CREATE OR REPLACE FUNCTION public.coach_code_exists(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE coach_code = upper(trim(p_code))
       AND role IN ('coach', 'coach_athlete')
  );
$$;

REVOKE ALL ON FUNCTION public.coach_code_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_code_exists(text) TO anon, authenticated, service_role;

-- Rattache l'utilisateur connecté au coach qui porte ce code.
-- Seul chemin autorisé (avec les edge functions) pour poser un coach_id
-- différent de NULL / soi-même : la partie 2 bloque le reste.
CREATE OR REPLACE FUNCTION public.link_to_coach_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_coach uuid;
  v_rows  int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_coach
    FROM public.profiles
   WHERE coach_code = upper(trim(p_code))
     AND role IN ('coach', 'coach_athlete');

  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'Code coach invalide' USING ERRCODE = 'P0002';
  END IF;
  IF v_coach = v_me THEN
    RAISE EXCEPTION 'Tu ne peux pas entrer ton propre code coach' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('agon.coach_link', 'on', true);
  UPDATE public.profiles SET coach_id = v_coach WHERE id = v_me;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('agon.coach_link', 'off', true);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_coach;
END;
$$;

REVOKE ALL ON FUNCTION public.link_to_coach_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_to_coach_by_code(text) TO authenticated, service_role;

-- Lien d'invitation (ancien parcours /invite/:token) : valide et non utilisé ?
CREATE OR REPLACE FUNCTION public.invitation_is_valid(p_token text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invitations
     WHERE token = p_token AND used_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.invitation_is_valid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_is_valid(text) TO anon, authenticated, service_role;

-- Utilise l'invitation : rattache l'athlète connecté (sans coach) au coach
-- qui l'a créée et marque l'invitation comme utilisée.
CREATE OR REPLACE FUNCTION public.redeem_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_coach uuid;
  v_rows  int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non connecté' USING ERRCODE = '42501';
  END IF;

  SELECT coach_id INTO v_coach
    FROM public.invitations
   WHERE token = p_token AND used_at IS NULL
   FOR UPDATE;

  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'Lien d''invitation invalide ou déjà utilisé' USING ERRCODE = 'P0002';
  END IF;
  IF v_coach = v_me THEN
    RAISE EXCEPTION 'Invitation invalide' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('agon.coach_link', 'on', true);
  UPDATE public.profiles SET coach_id = v_coach WHERE id = v_me AND coach_id IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM set_config('agon.coach_link', 'off', true);

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Profil introuvable ou déjà rattaché à un coach' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.invitations SET used_at = now() WHERE token = p_token;
  RETURN v_coach;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Droit à l'effacement : le bucket `docs` était oublié
-- Chemins : `<coach>/banque/…`, `<coach>/athletes/<athlete>/…` (+ images de
-- commentaires). Les lignes docs / doc_comments partent en cascade : leurs
-- fichiers deviendraient orphelins. On ne se base pas sur `owner` pour `docs`
-- (un staff dépose dans le dossier du coach ; ses fiches restent à l'athlète).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_user_storage_objects(target_user uuid)
RETURNS TABLE(bucket_id text, object_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  -- Pièces jointes médicales et fichiers de test : chemin préfixé par l'uuid
  -- de l'athlète, convention en place dans l'application.
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id IN ('medical', 'test-files', 'garmin-screenshots', 'test-media', 'avatars')
    AND (
      o.name LIKE target_user::text || '/%'
      OR o.owner = target_user
    )
  UNION
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'docs'
    AND (
      o.name LIKE target_user::text || '/%'
      OR o.name LIKE '%/athletes/' || target_user::text || '/%'
      OR o.name IN (SELECT c.image_path FROM public.doc_comments c
                     WHERE c.author_id = target_user AND c.image_path IS NOT NULL)
    );
$$;

REVOKE ALL ON FUNCTION public.list_user_storage_objects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_storage_objects(uuid) TO service_role;
