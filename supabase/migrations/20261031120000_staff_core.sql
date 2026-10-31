/*
  Staff autour des athlètes — socle (V1).

  Spec : docs/STAFF_FEATURE.md.

  Un professionnel (kiné, ostéo, coach adjoint, nutritionniste, préparateur
  mental, médecin) accède aux données d'un athlète selon une grille de droits
  que le coach principal règle librement, lien par lien et domaine par domaine.

  Ce fichier crée uniquement le socle :
    - rôle `staff` + colonne `profession` sur `profiles` ;
    - tables `athlete_staff` (le lien) et `staff_invitations` (le lien à copier) ;
    - fonction `staff_can()` et ses aides ;
    - triggers de garde (seul le coach principal règle les droits) ;
    - RPC d'invitation (lecture publique par jeton, acceptation) ;
    - policies de `athlete_staff`, `staff_invitations` et visibilité des profils.

  Les ouvertures `staff_can(...)` sur les tables de données vivent dans le
  fichier suivant (20261031121000_staff_policies.sql), appliqué à part.

  `is_coach_of` et `can_coach_athlete` ne sont PAS modifiées : l'accès staff
  passe exclusivement par `athlete_staff`, jamais par `profiles.coach_id` ni par
  `profiles.role`.
*/

-- ---------------------------------------------------------------------------
-- 1. profiles : rôle `staff` + métier par défaut
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['coach'::text, 'athlete'::text, 'coach_athlete'::text, 'staff'::text]));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profession text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_profession_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profession_check
  CHECK (profession IS NULL OR profession = ANY (ARRAY[
    'kine','osteo','coach_adjoint','nutritionniste','prepa_mentale','medecin','autre'
  ]));

COMMENT ON COLUMN public.profiles.profession IS
  'Métier par défaut d''un professionnel (pré-rempli à l''invitation). Le métier qui compte pour les droits est celui du lien (athlete_staff.profession).';

-- ---------------------------------------------------------------------------
-- 2. Consentement : finalité dédiée au partage avec le staff
--
-- Ajoutée dès maintenant pour que staff_can() puisse la lire. L'écran de
-- recueil arrive avec le consentement unique (fin de la V1). Tant qu'aucune
-- ligne n'existe, staff_can() refuse medical / nutrition / wellness.
-- (ADD VALUE ne peut pas être utilisée dans la même transaction : les
-- fonctions ci-dessous comparent donc en texte.)
-- ---------------------------------------------------------------------------
ALTER TYPE public.consent_purpose ADD VALUE IF NOT EXISTS 'staff_sharing';

-- ---------------------------------------------------------------------------
-- 3. Domaines, grille par défaut, validation
-- ---------------------------------------------------------------------------

-- Liste des domaines. Ajouter un domaine = modifier ces fonctions, pas la structure.
CREATE OR REPLACE FUNCTION public.staff_domains()
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY['seances','fiches','planification','logs','wellness','medical','nutrition','tests','commentaires'];
$$;

-- Grille par défaut du métier (spec §4). `autre` : rien sauf les commentaires,
-- le coach ouvre ce qu'il veut.
CREATE OR REPLACE FUNCTION public.staff_default_permissions(p_profession text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_profession
    WHEN 'kine' THEN jsonb_build_object(
      'seances','read','fiches','write','planification','read','logs','read','wellness','read',
      'medical','write','nutrition','none','tests','read','commentaires','write')
    WHEN 'osteo' THEN jsonb_build_object(
      'seances','read','fiches','write','planification','read','logs','read','wellness','read',
      'medical','write','nutrition','none','tests','read','commentaires','write')
    WHEN 'coach_adjoint' THEN jsonb_build_object(
      'seances','write','fiches','write','planification','write','logs','read','wellness','read',
      'medical','read','nutrition','read','tests','write','commentaires','write')
    WHEN 'nutritionniste' THEN jsonb_build_object(
      'seances','none','fiches','write','planification','read','logs','read','wellness','read',
      'medical','none','nutrition','write','tests','none','commentaires','write')
    WHEN 'prepa_mentale' THEN jsonb_build_object(
      'seances','none','fiches','write','planification','read','logs','none','wellness','read',
      'medical','none','nutrition','none','tests','none','commentaires','write')
    WHEN 'medecin' THEN jsonb_build_object(
      'seances','read','fiches','read','planification','read','logs','read','wellness','read',
      'medical','write','nutrition','read','tests','read','commentaires','write')
    ELSE jsonb_build_object(
      'seances','none','fiches','none','planification','none','logs','none','wellness','none',
      'medical','none','nutrition','none','tests','none','commentaires','write')
  END;
$$;

-- Normalise une grille : toutes les clés connues présentes, valeur absente = none.
-- Lève une erreur sur une clé inconnue ou une valeur hors none/read/write.
CREATE OR REPLACE FUNCTION public.staff_normalize_permissions(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  k text;
  v text;
  out jsonb := '{}'::jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    p := '{}'::jsonb;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p) LOOP
    IF NOT (k = ANY (public.staff_domains())) THEN
      RAISE EXCEPTION 'Domaine staff inconnu : %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY public.staff_domains() LOOP
    v := COALESCE(p->>k, 'none');
    IF v NOT IN ('none','read','write') THEN
      RAISE EXCEPTION 'Niveau de droit invalide pour % : %', k, v USING ERRCODE = '22023';
    END IF;
    out := out || jsonb_build_object(k, v);
  END LOOP;
  RETURN out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.athlete_staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  profession    text NOT NULL CHECK (profession = ANY (ARRAY[
                  'kine','osteo','coach_adjoint','nutritionniste','prepa_mentale','medecin','autre'])),
  permissions   jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Le pro peut modifier les contenus du coach principal, dans les domaines en write uniquement.
  can_edit_coach_content boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  added_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_by_role text NOT NULL CHECK (added_by_role IN ('coach','athlete')),
  -- Information (pas validation) : null = l'athlète n'a pas encore vu l'ajout
  -- ou le dernier changement de droits. Remis à null à chaque changement.
  athlete_notified_at timestamptz,
  -- Idem côté coach principal (ajout fait par l'athlète).
  coach_notified_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, staff_id),
  CHECK (athlete_id <> staff_id)
);

CREATE INDEX IF NOT EXISTS athlete_staff_staff_idx   ON public.athlete_staff (staff_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS athlete_staff_athlete_idx ON public.athlete_staff (athlete_id);

COMMENT ON TABLE public.athlete_staff IS
  'Lien pro ↔ athlète. Créé uniquement par accept_staff_invitation(). Jamais supprimé physiquement (révocation = status revoked), sauf effacement du compte (cascade).';

CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- V1 : lien à copier, pas d'email. Colonne gardée pour un envoi futur.
  email           text,
  profession      text NOT NULL CHECK (profession = ANY (ARRAY[
                    'kine','osteo','coach_adjoint','nutritionniste','prepa_mentale','medecin','autre'])),
  permissions     jsonb NOT NULL DEFAULT '{}'::jsonb,
  can_edit_coach_content boolean NOT NULL DEFAULT false,
  invited_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invited_by_role text NOT NULL CHECK (invited_by_role IN ('coach','athlete')),
  token           text NOT NULL UNIQUE
                  DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  used_at         timestamptz,
  used_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_invitations_athlete_idx ON public.staff_invitations (athlete_id);

ALTER TABLE public.athlete_staff     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Fonctions d'accès
-- ---------------------------------------------------------------------------

-- Consentement unique de l'athlète au partage avec son staff (spec §6).
-- Ne répond qu'à l'athlète, son coach principal ou un pro lié.
CREATE OR REPLACE FUNCTION public.staff_sharing_consented(athlete_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
      auth.uid() = athlete_uuid
      OR public.is_coach_of(athlete_uuid)
      OR EXISTS (SELECT 1 FROM public.athlete_staff s
                  WHERE s.athlete_id = athlete_uuid AND s.staff_id = auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = athlete_uuid
         AND c.purpose::text = 'staff_sharing'
         AND c.granted
    );
$$;

-- Fonction centrale (spec §5.1). Les domaines de santé exigent en plus le
-- consentement unique de l'athlète.
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
    AND (
      domain NOT IN ('medical','nutrition','wellness')
      OR EXISTS (
        SELECT 1 FROM public.current_consents c
         WHERE c.user_id = athlete_uuid
           AND c.purpose::text = 'staff_sharing'
           AND c.granted
      )
    );
$$;

-- Le pro peut-il modifier/supprimer ce contenu ? (spec §5.3, tables relationnelles)
-- Oui s'il a le domaine en write ET (il en est l'auteur, OU l'auteur est le
-- coach principal et le lien porte can_edit_coach_content). Jamais le contenu
-- d'un autre pro ni celui de l'athlète.
CREATE OR REPLACE FUNCTION public.staff_can_edit(athlete_uuid uuid, domain text, author uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.staff_can(athlete_uuid, domain, 'write')
    AND (
      author = auth.uid()
      OR EXISTS (
        SELECT 1
          FROM public.athlete_staff s
          JOIN public.profiles p ON p.id = s.athlete_id
         WHERE s.athlete_id = athlete_uuid
           AND s.staff_id = auth.uid()
           AND s.status = 'active'
           AND s.can_edit_coach_content
           AND p.coach_id IS NOT NULL
           AND author = p.coach_id
      )
    );
$$;

-- Vrai si l'utilisateur courant a au moins un lien actif vers cet athlète
-- (lecture du profil de l'athlète).
CREATE OR REPLACE FUNCTION public.staff_is_linked(athlete_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_staff s
     WHERE s.athlete_id = athlete_uuid
       AND s.staff_id = auth.uid()
       AND s.status = 'active'
  );
$$;

-- Vrai si ce profil est un pro du staff d'un athlète que l'utilisateur courant
-- est (athlète) ou coache (coach principal). Sert à afficher nom et métier.
CREATE OR REPLACE FUNCTION public.staff_profile_visible(staff_uuid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.athlete_staff s
     WHERE s.staff_id = staff_uuid
       AND (s.athlete_id = auth.uid() OR public.is_coach_of(s.athlete_id))
  );
$$;

-- Domaine staff d'une clé app_data (spec §5.3, mesure 1). NULL = jamais
-- ouverte au staff (banques du coach, réglages internes).
CREATE OR REPLACE FUNCTION public.staff_app_data_domain(p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE split_part(p_key, '::', 1)
    WHEN 'asp:prog'            THEN 'seances'
    WHEN 'asp:exos'            THEN 'seances'
    WHEN 'asp:exMeta'          THEN 'seances'
    WHEN 'asp:sessions'        THEN 'seances'
    WHEN 'asp:blockConfig'     THEN 'seances'
    WHEN 'asp:blockHistory'    THEN 'seances'
    WHEN 'asp:weekschedule'    THEN 'seances'
    WHEN 'asp:visibility'      THEN 'seances'
    WHEN 'asp:custmethods'     THEN 'seances'
    WHEN 'asp:goals'           THEN 'seances'
    WHEN 'asp:seances-type'    THEN 'seances'
    WHEN 'asp:percycle_migrated' THEN 'seances'
    WHEN 'asp:sets'            THEN 'logs'
    WHEN 'asp:completed'       THEN 'logs'
    WHEN 'asp:sessionlogs'     THEN 'logs'
    WHEN 'asp:freesess'        THEN 'logs'
    WHEN 'asp:anotes'          THEN 'logs'
    WHEN 'asp:prs'             THEN 'logs'
    WHEN 'asp:wellness'        THEN 'wellness'
    WHEN 'asp:wh'              THEN 'wellness'
    WHEN 'asp:nutrition_strategy' THEN 'nutrition'
    WHEN 'asp:nutrition_log'   THEN 'nutrition'
    WHEN 'asp:wlog'            THEN 'nutrition'
    WHEN 'asp:wmile'           THEN 'nutrition'
    WHEN 'asp:bw'              THEN 'nutrition'
    WHEN 'asp:injuries'        THEN 'medical'
    WHEN 'asp:coach_feedback'  THEN 'commentaires'
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Triggers de garde sur athlete_staff
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.athlete_staff_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Seule accept_staff_invitation() crée un lien (pas de policy INSERT ; ceci
  -- protège aussi contre un appel direct par un rôle privilégié par erreur).
  IF current_setting('agon.staff_accept', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Un lien staff se crée uniquement en acceptant une invitation'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.added_by_role = 'athlete' THEN
    NEW.permissions := public.staff_default_permissions(NEW.profession);
    NEW.can_edit_coach_content := false;
  END IF;
  NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
  NEW.status := 'active';
  NEW.revoked_at := NULL;
  NEW.revoked_by := NULL;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.athlete_staff_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_coach boolean;
  v_rights_changed boolean;
BEGIN
  -- Réactivation par une nouvelle invitation acceptée : la RPC fixe tout.
  IF current_setting('agon.staff_accept', true) = 'on' THEN
    NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.athlete_id <> OLD.athlete_id
     OR NEW.staff_id <> OLD.staff_id
     OR NEW.added_by IS DISTINCT FROM OLD.added_by
     OR NEW.added_by_role <> OLD.added_by_role
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Ces champs du lien staff ne sont pas modifiables' USING ERRCODE = '42501';
  END IF;

  v_is_coach := public.is_coach_of(OLD.athlete_id);
  v_rights_changed := NEW.permissions IS DISTINCT FROM OLD.permissions
                   OR NEW.can_edit_coach_content <> OLD.can_edit_coach_content
                   OR NEW.profession <> OLD.profession;

  -- Seul le coach principal règle les droits (spec §5.2).
  IF v_rights_changed AND NOT v_is_coach THEN
    RAISE EXCEPTION 'Seul le coach principal peut modifier les droits d''un professionnel'
      USING ERRCODE = '42501';
  END IF;

  -- Révocation : coach principal, athlète, ou le pro lui-même. Pas de
  -- réactivation directe : il faut une nouvelle invitation.
  IF NEW.status <> OLD.status THEN
    IF NEW.status = 'active' THEN
      RAISE EXCEPTION 'Pour rétablir un accès, envoie une nouvelle invitation' USING ERRCODE = '42501';
    END IF;
    IF NOT (v_is_coach OR v_uid = OLD.athlete_id OR v_uid = OLD.staff_id) THEN
      RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = '42501';
    END IF;
    NEW.revoked_at := now();
    NEW.revoked_by := v_uid;
  ELSE
    NEW.revoked_at := OLD.revoked_at;
    NEW.revoked_by := OLD.revoked_by;
  END IF;

  -- Accusés de lecture : chacun ne marque que le sien.
  IF NEW.athlete_notified_at IS DISTINCT FROM OLD.athlete_notified_at
     AND v_uid IS DISTINCT FROM OLD.athlete_id THEN
    NEW.athlete_notified_at := OLD.athlete_notified_at;
  END IF;
  IF NEW.coach_notified_at IS DISTINCT FROM OLD.coach_notified_at AND NOT v_is_coach THEN
    NEW.coach_notified_at := OLD.coach_notified_at;
  END IF;

  IF v_rights_changed THEN
    NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
    -- L'athlète est informé de chaque changement (spec §6) — sauf s'il est
    -- son propre coach.
    IF v_uid IS DISTINCT FROM OLD.athlete_id THEN
      NEW.athlete_notified_at := NULL;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS athlete_staff_before_insert ON public.athlete_staff;
CREATE TRIGGER athlete_staff_before_insert
  BEFORE INSERT ON public.athlete_staff
  FOR EACH ROW EXECUTE FUNCTION public.athlete_staff_before_insert();

DROP TRIGGER IF EXISTS athlete_staff_before_update ON public.athlete_staff;
CREATE TRIGGER athlete_staff_before_update
  BEFORE UPDATE ON public.athlete_staff
  FOR EACH ROW EXECUTE FUNCTION public.athlete_staff_before_update();

-- ---------------------------------------------------------------------------
-- 7. Trigger sur staff_invitations : qui invite, avec quelle grille
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_invitations_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.invited_by := auth.uid();
  NEW.used_at := NULL;
  NEW.used_by := NULL;
  NEW.created_at := now();
  IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '30 days' THEN
    NEW.expires_at := now() + interval '14 days';
  END IF;

  IF public.is_coach_of(NEW.athlete_id) THEN
    -- Coach principal (y compris un athlète autocoaché) : grille libre.
    NEW.invited_by_role := 'coach';
    NEW.permissions := public.staff_normalize_permissions(NEW.permissions);
  ELSIF NEW.athlete_id = auth.uid() THEN
    -- Athlète : grille par défaut du métier, le coach ajustera (spec §1).
    NEW.invited_by_role := 'athlete';
    NEW.permissions := public.staff_default_permissions(NEW.profession);
    NEW.can_edit_coach_content := false;
  ELSE
    RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_invitations_before_insert ON public.staff_invitations;
CREATE TRIGGER staff_invitations_before_insert
  BEFORE INSERT ON public.staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.staff_invitations_before_insert();

-- ---------------------------------------------------------------------------
-- 8. RPC d'invitation
-- ---------------------------------------------------------------------------

-- Lecture d'une invitation par son jeton, avant connexion (page d'acceptation).
CREATE OR REPLACE FUNCTION public.get_staff_invitation(p_token text)
RETURNS TABLE (
  athlete_name    text,
  coach_name      text,
  inviter_name    text,
  invited_by_role text,
  profession      text,
  status          text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.full_name,
         c.full_name,
         i_by.full_name,
         i.invited_by_role,
         i.profession,
         CASE
           WHEN i.used_at IS NOT NULL THEN 'used'
           WHEN i.expires_at < now()  THEN 'expired'
           ELSE 'valid'
         END
    FROM public.staff_invitations i
    JOIN public.profiles a ON a.id = i.athlete_id
    LEFT JOIN public.profiles c ON c.id = a.coach_id
    LEFT JOIN public.profiles i_by ON i_by.id = i.invited_by
   WHERE i.token = p_token;
$$;

-- Acceptation par le compte connecté (nouveau compte staff, ou coach existant
-- en double casquette). Crée ou réactive le lien.
CREATE OR REPLACE FUNCTION public.accept_staff_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_inv   public.staff_invitations%ROWTYPE;
  v_coach uuid;
  v_id    uuid;
  v_perm  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.staff_invitations WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cette invitation a déjà été utilisée' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'Cette invitation a expiré' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Profil introuvable' USING ERRCODE = 'P0002';
  END IF;
  IF v_uid = v_inv.athlete_id THEN
    RAISE EXCEPTION 'Tu ne peux pas rejoindre ton propre staff' USING ERRCODE = '22023';
  END IF;

  SELECT coach_id INTO v_coach FROM public.profiles WHERE id = v_inv.athlete_id;
  IF v_coach = v_uid THEN
    RAISE EXCEPTION 'Tu es déjà le coach principal de cet athlète' USING ERRCODE = '22023';
  END IF;
  -- Invitation d'un coach qui n'est plus le coach principal : caduque.
  IF v_inv.invited_by_role = 'coach' AND v_coach IS DISTINCT FROM v_inv.invited_by THEN
    RAISE EXCEPTION 'Cette invitation n''est plus valable' USING ERRCODE = '22023';
  END IF;

  v_perm := CASE WHEN v_inv.invited_by_role = 'athlete'
                 THEN public.staff_default_permissions(v_inv.profession)
                 ELSE v_inv.permissions END;

  PERFORM set_config('agon.staff_accept', 'on', true);

  INSERT INTO public.athlete_staff AS s (
    athlete_id, staff_id, profession, permissions, can_edit_coach_content,
    added_by, added_by_role, athlete_notified_at, coach_notified_at
  ) VALUES (
    v_inv.athlete_id, v_uid, v_inv.profession, v_perm,
    CASE WHEN v_inv.invited_by_role = 'athlete' THEN false ELSE v_inv.can_edit_coach_content END,
    v_inv.invited_by, v_inv.invited_by_role,
    CASE WHEN v_inv.invited_by = v_inv.athlete_id THEN now() ELSE NULL END,
    CASE WHEN v_inv.invited_by_role = 'coach' THEN now() ELSE NULL END
  )
  ON CONFLICT (athlete_id, staff_id) DO UPDATE SET
    profession             = EXCLUDED.profession,
    permissions            = EXCLUDED.permissions,
    can_edit_coach_content = EXCLUDED.can_edit_coach_content,
    status                 = 'active',
    added_by               = EXCLUDED.added_by,
    added_by_role          = EXCLUDED.added_by_role,
    athlete_notified_at    = EXCLUDED.athlete_notified_at,
    coach_notified_at      = EXCLUDED.coach_notified_at,
    revoked_at             = NULL,
    revoked_by             = NULL
  RETURNING s.id INTO v_id;

  PERFORM set_config('agon.staff_accept', 'off', true);

  UPDATE public.staff_invitations SET used_at = now(), used_by = v_uid WHERE id = v_inv.id;

  -- Métier par défaut du compte, s'il n'en a pas encore.
  UPDATE public.profiles SET profession = v_inv.profession
   WHERE id = v_uid AND profession IS NULL;

  RETURN v_id;
END;
$$;

-- Raccourci « appliquer à tous mes athlètes suivis par ce pro » (spec §7.3).
-- Copie la grille d'un lien sur chaque lien actif du même pro vers un athlète
-- du coach appelant. Le réglage reste par lien.
CREATE OR REPLACE FUNCTION public.staff_apply_to_all(p_link_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_src public.athlete_staff%ROWTYPE;
  v_n   integer;
BEGIN
  SELECT * INTO v_src FROM public.athlete_staff WHERE id = p_link_id;
  IF NOT FOUND OR NOT public.is_coach_of(v_src.athlete_id) THEN
    RAISE EXCEPTION 'Action non autorisée' USING ERRCODE = '42501';
  END IF;
  -- SECURITY INVOKER : la RLS et le trigger de garde s'appliquent ligne par ligne.
  UPDATE public.athlete_staff s
     SET permissions = v_src.permissions,
         can_edit_coach_content = v_src.can_edit_coach_content
   WHERE s.staff_id = v_src.staff_id
     AND s.id <> v_src.id
     AND s.status = 'active'
     AND public.is_coach_of(s.athlete_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.get_staff_invitation(text)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staff_invitation(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_staff_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation(text) TO authenticated;
REVOKE ALL ON FUNCTION public.staff_apply_to_all(uuid)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_apply_to_all(uuid)   TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Policies
-- ---------------------------------------------------------------------------

-- athlete_staff : lecture par le pro, l'athlète, le coach principal.
DROP POLICY IF EXISTS athlete_staff_select ON public.athlete_staff;
CREATE POLICY athlete_staff_select ON public.athlete_staff
  FOR SELECT TO authenticated
  USING (staff_id = auth.uid() OR athlete_id = auth.uid() OR public.is_coach_of(athlete_id));

-- Mise à jour : mêmes personnes ; le trigger décide quelles colonnes chacun touche.
DROP POLICY IF EXISTS athlete_staff_update ON public.athlete_staff;
CREATE POLICY athlete_staff_update ON public.athlete_staff
  FOR UPDATE TO authenticated
  USING (staff_id = auth.uid() OR athlete_id = auth.uid() OR public.is_coach_of(athlete_id))
  WITH CHECK (staff_id = auth.uid() OR athlete_id = auth.uid() OR public.is_coach_of(athlete_id));
-- Pas d'INSERT (RPC uniquement), pas de DELETE (historique conservé).

-- staff_invitations
DROP POLICY IF EXISTS staff_invitations_select ON public.staff_invitations;
CREATE POLICY staff_invitations_select ON public.staff_invitations
  FOR SELECT TO authenticated
  USING (invited_by = auth.uid() OR athlete_id = auth.uid() OR public.is_coach_of(athlete_id));

DROP POLICY IF EXISTS staff_invitations_insert ON public.staff_invitations;
CREATE POLICY staff_invitations_insert ON public.staff_invitations
  FOR INSERT TO authenticated
  WITH CHECK (invited_by = auth.uid() AND (public.is_coach_of(athlete_id) OR athlete_id = auth.uid()));

-- Annuler une invitation en attente.
DROP POLICY IF EXISTS staff_invitations_delete ON public.staff_invitations;
CREATE POLICY staff_invitations_delete ON public.staff_invitations
  FOR DELETE TO authenticated
  USING (used_at IS NULL AND (invited_by = auth.uid() OR public.is_coach_of(athlete_id)));

-- profiles : le pro voit les athlètes auxquels il est lié ; l'athlète et le
-- coach principal voient les pros du staff. (Les profils coach sont déjà
-- lisibles via profiles_select_coaches.)
DROP POLICY IF EXISTS profiles_select_staff_athletes ON public.profiles;
CREATE POLICY profiles_select_staff_athletes ON public.profiles
  FOR SELECT TO authenticated
  USING (public.staff_is_linked(id));

DROP POLICY IF EXISTS profiles_select_staff_members ON public.profiles;
CREATE POLICY profiles_select_staff_members ON public.profiles
  FOR SELECT TO authenticated
  USING (public.staff_profile_visible(id));
