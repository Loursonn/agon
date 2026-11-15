-- Inscription fermée (Hugo, 15/11/2026) — TEMPS 1, additif.
--
-- Décisions d'Hugo :
--   - un coach ne s'inscrit qu'avec une invitation : lien lié à son e-mail,
--     valable 7 jours, à usage unique, révocable ;
--   - l'invitation est créée par l'admin ou par un coach certifié ;
--   - athlètes et staff aussi verrouillés côté serveur : un athlète ne crée son
--     profil qu'avec un code coach valide (rattachement dans la même
--     transaction), un staff qu'avec une invitation staff valide.
--
-- Ce fichier ajoute la table et les RPC de création de profil ; il ne ferme
-- rien encore : l'app en prod (main) insère toujours son profil directement.
-- Le TEMPS 2 (migration séparée, après déploiement du client qui appelle ces
-- RPC) fera refuser par `guard_profile_privileged_fields` toute création de
-- profil hors de ces RPC (drapeau de transaction `agon.signup`).
-- Tests : supabase/tests/signup_invitations.sql.

CREATE TABLE IF NOT EXISTS public.coach_invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token      text NOT NULL UNIQUE
             DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  email      text NOT NULL CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at    timestamptz,
  used_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz
);

COMMENT ON TABLE public.coach_invitations IS 'Invitations à s''inscrire comme coach (15/11/2026) : lien lié à un e-mail, 7 jours, usage unique, révocable. Écriture par RPC seulement.';

CREATE INDEX IF NOT EXISTS coach_invitations_invited_by_idx ON public.coach_invitations (invited_by, created_at DESC);
CREATE INDEX IF NOT EXISTS coach_invitations_used_by_idx ON public.coach_invitations (used_by) WHERE used_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS coach_invitations_email_idx ON public.coach_invitations (email);

ALTER TABLE public.coach_invitations ENABLE ROW LEVEL SECURITY;

-- Lecture : l'admin voit tout, un coach voit les invitations qu'il a créées.
DROP POLICY IF EXISTS coach_invitations_read ON public.coach_invitations;
CREATE POLICY coach_invitations_read ON public.coach_invitations FOR SELECT TO authenticated
  USING (invited_by = (SELECT auth.uid()) OR (SELECT public.current_user_is_admin()));

REVOKE ALL ON public.coach_invitations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.coach_invitations FROM authenticated;

-- ── Créer / révoquer ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_coach_invitation(p_email text)
RETURNS TABLE (id uuid, token text, email text, expires_at timestamptz)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_me    uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ok    boolean;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;
  SELECT public.current_user_is_admin()
      OR (p.is_certified_coach AND p.role IN ('coach', 'coach_athlete'))
    INTO v_ok FROM public.profiles p WHERE p.id = v_me;
  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'Réservé à l''admin et aux coachs certifiés' USING ERRCODE = '42501';
  END IF;
  IF length(v_email) > 254 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Adresse e-mail invalide' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id = u.id WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'Un compte existe déjà avec cet e-mail' USING ERRCODE = '23505';
  END IF;
  IF (SELECT count(*) FROM public.coach_invitations c
       WHERE c.invited_by = v_me AND c.used_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > now()) >= 20 THEN
    RAISE EXCEPTION 'Trop d''invitations en cours (20) : révoque celles qui ne servent plus' USING ERRCODE = '54000';
  END IF;

  RETURN QUERY
    INSERT INTO public.coach_invitations AS c (email, invited_by)
    VALUES (v_email, v_me)
    RETURNING c.id, c.token, c.email, c.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_coach_invitation(p_id uuid)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;
  UPDATE public.coach_invitations c SET revoked_at = now()
   WHERE c.id = p_id AND c.used_at IS NULL AND c.revoked_at IS NULL
     AND (c.invited_by = v_me OR public.current_user_is_admin());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation introuvable ou déjà utilisée' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- ── Lire une invitation avant inscription (page publique) ────────────────────
-- Ne renvoie rien d'autre que l'e-mail invité, le nom de qui invite et l'état.

CREATE OR REPLACE FUNCTION public.get_coach_invitation(p_token text)
RETURNS TABLE (email text, inviter_name text, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT c.email,
         p.full_name,
         CASE WHEN c.used_at IS NOT NULL THEN 'utilisee'
              WHEN c.revoked_at IS NOT NULL THEN 'revoquee'
              WHEN c.expires_at <= now() THEN 'expiree'
              ELSE 'valide' END
    FROM public.coach_invitations c
    LEFT JOIN public.profiles p ON p.id = c.invited_by
   WHERE c.token = p_token AND length(coalesce(p_token, '')) >= 32;
$$;

-- ── Créer son profil ─────────────────────────────────────────────────────────
-- Appelées juste après la création du compte d'authentification. Chacune pose
-- le drapeau de transaction `agon.signup` autour de l'insertion : au temps 2,
-- c'est la seule façon de créer un profil (hors service_role).

CREATE OR REPLACE FUNCTION public._signup_name(p_full_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE
  v text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
BEGIN
  IF length(v) < 2 OR length(v) > 80 THEN
    RAISE EXCEPTION 'Indique ton nom (2 à 80 caractères)' USING ERRCODE = '22023';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public._signup_guard() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_me) THEN
    RAISE EXCEPTION 'Ce compte a déjà un profil' USING ERRCODE = '23505';
  END IF;
  RETURN v_me;
END;
$$;

CREATE OR REPLACE FUNCTION public._new_coach_code() RETURNS text
    LANGUAGE plpgsql VOLATILE
    SET search_path TO 'public'
    AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v text;
BEGIN
  LOOP
    v := '';
    FOR i IN 1..6 LOOP
      v := v || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE coach_code = v);
  END LOOP;
  RETURN v;
END;
$$;

-- Coach (ou coach qui s'entraîne aussi) : invitation valide, au même e-mail.
CREATE OR REPLACE FUNCTION public.register_coach(
  p_token text, p_full_name text, p_birth_date date, p_coach_athlete boolean DEFAULT false
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me    uuid := public._signup_guard();
  v_name  text := public._signup_name(p_full_name);
  v_inv   public.coach_invitations%ROWTYPE;
  v_email text;
  v_code  text := public._new_coach_code();
BEGIN
  SELECT * INTO v_inv FROM public.coach_invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR length(coalesce(p_token, '')) < 32 THEN
    RAISE EXCEPTION 'L''inscription coach se fait sur invitation' USING ERRCODE = '42501';
  END IF;
  IF v_inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette invitation a déjà été utilisée' USING ERRCODE = '22023';
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette invitation a été révoquée' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Cette invitation a expiré : demande-en une nouvelle' USING ERRCODE = '22023';
  END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_me;
  IF v_email IS DISTINCT FROM v_inv.email THEN
    RAISE EXCEPTION 'Cette invitation est liée à une autre adresse e-mail' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('agon.signup', 'on', true);
  INSERT INTO public.profiles (id, role, full_name, birth_date, coach_code, coach_id)
  VALUES (v_me, CASE WHEN p_coach_athlete THEN 'coach_athlete' ELSE 'coach' END, v_name, p_birth_date, v_code,
          CASE WHEN p_coach_athlete THEN v_me END);
  PERFORM set_config('agon.signup', 'off', true);

  UPDATE public.coach_invitations SET used_at = now(), used_by = v_me WHERE id = v_inv.id;
  RETURN v_code;
END;
$$;

-- Athlète : code coach valide, rattaché dans la même transaction.
CREATE OR REPLACE FUNCTION public.register_athlete(
  p_coach_code text, p_full_name text, p_birth_date date
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me    uuid := public._signup_guard();
  v_name  text := public._signup_name(p_full_name);
  v_coach uuid;
BEGIN
  SELECT id INTO v_coach FROM public.profiles
   WHERE coach_code = upper(btrim(coalesce(p_coach_code, ''))) AND role IN ('coach', 'coach_athlete');
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'Code coach invalide — vérifie auprès de ton coach' USING ERRCODE = 'P0002';
  END IF;

  PERFORM set_config('agon.signup', 'on', true);
  PERFORM set_config('agon.coach_link', 'on', true);
  INSERT INTO public.profiles (id, role, full_name, birth_date, coach_id)
  VALUES (v_me, 'athlete', v_name, p_birth_date, v_coach);
  PERFORM set_config('agon.coach_link', 'off', true);
  PERFORM set_config('agon.signup', 'off', true);
  RETURN v_coach;
END;
$$;

-- Staff : invitation staff valide (l'acceptation reste accept_staff_invitation).
CREATE OR REPLACE FUNCTION public.register_staff(
  p_token text, p_full_name text, p_birth_date date, p_profession text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me   uuid := public._signup_guard();
  v_name text := public._signup_name(p_full_name);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff_invitations
                  WHERE token = p_token AND used_at IS NULL AND expires_at > now()) THEN
    RAISE EXCEPTION 'Invitation staff introuvable ou expirée' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('agon.signup', 'on', true);
  INSERT INTO public.profiles (id, role, full_name, birth_date, profession)
  VALUES (v_me, 'staff', v_name, p_birth_date, p_profession);
  PERFORM set_config('agon.signup', 'off', true);
  RETURN v_me;
END;
$$;

REVOKE ALL ON FUNCTION public.create_coach_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_coach_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_coach_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_coach(text, text, date, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_athlete(text, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_staff(text, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._signup_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._signup_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._new_coach_code() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_coach_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_coach_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_coach_invitation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_coach(text, text, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_athlete(text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_staff(text, text, date, text) TO authenticated;
