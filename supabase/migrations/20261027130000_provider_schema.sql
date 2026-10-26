-- ============================================================================
-- Schéma des services connectés (Garmin, COROS) et des données importées.
--
-- Trois principes, chacun matérialisé par une contrainte plutôt que par une
-- consigne :
--
--   1. Un jeton OAuth n'est jamais stocké en clair, et jamais dans une table
--      qu'une politique RLS pourrait rendre lisible. Il va dans Supabase
--      Vault ; la table ne garde que l'identifiant du secret.
--   2. Ce qui interdit d'envoyer une donnée à une IA dépend de sa provenance,
--      pas du code qui la lit. La règle vit donc en base, par source, et la
--      colonne `ai_allowed` est posée par un trigger — on ne peut pas
--      l'oublier à l'insertion ni la forcer depuis le client.
--   3. Une connexion ne survit pas au retrait du consentement. Le retrait est
--      un INSERT dans `user_consents` ; un trigger y réagit et neutralise la
--      connexion correspondante.
-- ============================================================================

-- ─────────────────────────────── Types ──────────────────────────────────────

-- Provenance d'une donnée d'entraînement.
--   garmin / coros : API du fournisseur
--   file_import    : fichier déposé par l'athlète (archive Strava, FIT, TCX, GPX)
--   manual         : saisie à la main dans Agon
CREATE TYPE public.data_source AS ENUM ('garmin', 'coros', 'file_import', 'manual');

CREATE TYPE public.provider_status AS ENUM (
  'active',
  -- Le fournisseur a refusé le dernier rafraîchissement : l'athlète doit
  -- reconnecter. Distinct de 'revoked', qui est une décision de l'athlète.
  'needs_reauth',
  -- Consentement retiré : la synchronisation doit cesser immédiatement, même
  -- si le jeton reste techniquement valide.
  'consent_withdrawn',
  'revoked'
);

-- ──────────────────────── Politique par source ──────────────────────────────
/*
  Table de référence, et non des `CASE` éparpillés dans le code : quand les
  conditions d'un fournisseur changent, on corrige une ligne et on sait
  exactement ce qui est concerné. Un `CASE` dupliqué dans trois fonctions se
  corrige deux fois sur trois.
*/
CREATE TABLE public.data_source_policies (
  source        public.data_source PRIMARY KEY,
  -- Les conditions du fournisseur autorisent-elles la transmission à un
  -- service d'IA tiers ? Indépendant du consentement de l'athlète : les deux
  -- doivent être réunis, l'un ne rachète pas l'autre.
  ai_allowed    boolean NOT NULL,
  -- Les conditions autorisent-elles l'affichage au coach ? C'est la clause
  -- qui a disqualifié l'API Strava (§2.3 de son API Agreement).
  coach_visible boolean NOT NULL,
  notes         text NOT NULL
);

INSERT INTO public.data_source_policies (source, ai_allowed, coach_visible, notes) VALUES
  ('garmin', true, true,
   'Clause 4.1(b) du Connect Developer Program Agreement : affichage à un tiers permis avec le consentement de l''utilisateur. Les sous-traitants IA doivent être déclarés dans le dossier — Gemini l''est.'),
  ('coros', false, true,
   'ai_allowed à false par précaution : les conditions COROS n''ont pas encore été relues sur ce point précis. La documentation publique ne l''interdit pas, mais une absence d''interdiction dans un README n''est pas une autorisation contractuelle — c''est exactement la confusion qui a fait perdre du temps sur Strava. Repasser à true après vérification, et le noter dans docs/DECISIONS.md.'),
  ('file_import', true, true,
   'Fichier fourni par l''athlète lui-même (export RGPD art. 20, FIT, TCX, GPX). Aucun accord d''API en jeu : l''API Agreement de Strava lie ses utilisateurs d''API, pas la personne qui exporte ses propres données.'),
  ('manual', true, true,
   'Saisie directe dans Agon. Aucune condition tierce.');

ALTER TABLE public.data_source_policies ENABLE ROW LEVEL SECURITY;

-- Lisible par tout utilisateur connecté : l'interface doit pouvoir expliquer
-- pourquoi une donnée n'est pas envoyée à l'IA. Modifiable par personne
-- d'autre que service_role — une politique qu'un client peut réécrire ne
-- protège rien.
CREATE POLICY data_source_policies_read ON public.data_source_policies
  FOR SELECT TO authenticated USING (true);

-- ───────────────────────── Connexions aux fournisseurs ──────────────────────

CREATE TABLE public.provider_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider          public.data_source NOT NULL,
  status            public.provider_status NOT NULL DEFAULT 'active',

  -- Identifiant de l'utilisateur chez le fournisseur. Sert à rattacher un
  -- webhook entrant au bon athlète : Garmin ne connaît pas nos UUID.
  external_user_id  text,

  /*
    Hôte régional du fournisseur, à conserver connexion par connexion.
    COROS route par région du compte : interroger `mcp.coros.com` renvoie des
    métadonnées dont l'`issuer` est l'hôte régional, ce que les clients OAuth
    rejettent pour « origin mismatch ». Et la région est celle du compte de
    l'athlète, pas la nôtre : un athlète inscrit aux États-Unis n'est pas sur
    `mcpeu`. Le redeviner à chaque appel produirait des 401 inexplicables.
  */
  api_host          text,

  -- Scopes réellement accordés, tels que renvoyés par le fournisseur. Pas
  -- ceux demandés : l'utilisateur peut en refuser une partie.
  granted_scopes    text[] NOT NULL DEFAULT '{}',

  connected_at      timestamptz NOT NULL DEFAULT now(),
  last_sync_at      timestamptz,
  -- Borne haute des données déjà récupérées, pour reprendre sans tout relire.
  synced_through    date,
  last_error        text,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Une seule connexion par fournisseur et par athlète. Deux connexions
  -- Garmin actives pour un même athlète produiraient des doublons d'activités
  -- et deux jeux de jetons à révoquer, dont un qu'on oublierait.
  CONSTRAINT provider_connections_unique UNIQUE (athlete_id, provider),

  -- 'manual' n'est pas un service connecté : il n'y a rien à authentifier.
  CONSTRAINT provider_connections_real_provider
    CHECK (provider IN ('garmin', 'coros'))
);

CREATE INDEX provider_connections_athlete_idx
  ON public.provider_connections (athlete_id);
-- Le cron de synchronisation ne balaie que les connexions actives.
CREATE INDEX provider_connections_sync_idx
  ON public.provider_connections (status, last_sync_at)
  WHERE status = 'active';
-- Résolution d'un webhook entrant vers un athlète.
CREATE INDEX provider_connections_external_idx
  ON public.provider_connections (provider, external_user_id)
  WHERE external_user_id IS NOT NULL;

CREATE TRIGGER provider_connections_touch
  BEFORE UPDATE ON public.provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;

-- L'athlète gère ses propres connexions.
CREATE POLICY provider_connections_own ON public.provider_connections
  FOR ALL TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

/*
  Le coach voit l'état de la connexion, en lecture seule.
  Pourquoi il doit le voir : sans cela, un athlète dont le jeton a expiré
  apparaît simplement comme n'ayant plus d'activité, et le coach conclut au
  désengagement au lieu de lui demander de reconnecter sa montre.
  Pourquoi en lecture seule : connecter ou déconnecter une montre est un acte
  de consentement, qui n'appartient qu'à l'athlète.
*/
CREATE POLICY provider_connections_coach_read ON public.provider_connections
  FOR SELECT TO authenticated
  USING (public.is_coach_of(athlete_id));

COMMENT ON TABLE public.provider_connections IS
  'Métadonnées de connexion à un service tiers. Ne contient aucun jeton : voir provider_tokens.';

-- ──────────────────────────────── Jetons ────────────────────────────────────
/*
  Table distincte, RLS activée et AUCUNE politique : donc inaccessible à
  `authenticated`, quelle que soit la requête. Seul `service_role` y accède,
  depuis une Edge Function.

  Pourquoi pas des colonnes sur `provider_connections` : cette table est
  lisible par l'athlète et par son coach. Un `select *` depuis le client — le
  réflexe le plus courant — renverrait alors les jetons. On peut restreindre
  les colonnes avec des GRANT, mais c'est une protection qu'une migration
  distraite peut défaire sans bruit. Une table sans politique, non.

  Et même là, pas de jeton en clair : on ne garde que l'identifiant du secret
  dans Supabase Vault. Une fuite du contenu de cette table ne donnerait que
  des UUID.
*/
CREATE TABLE public.provider_tokens (
  connection_id        uuid PRIMARY KEY
                         REFERENCES public.provider_connections(id) ON DELETE CASCADE,
  access_secret_id     uuid NOT NULL,
  refresh_secret_id    uuid,
  access_expires_at    timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_tokens ENABLE ROW LEVEL SECURITY;
-- Aucune politique, volontairement. Ne pas en ajouter.

REVOKE ALL ON TABLE public.provider_tokens FROM anon, authenticated;

COMMENT ON TABLE public.provider_tokens IS
  'Références Vault des jetons OAuth. RLS active sans aucune politique : service_role uniquement. Ne jamais ajouter de politique ni de colonne contenant un jeton en clair.';

-- ───────────────── Accès aux jetons : interface étroite ─────────────────────
/*
  PostgREST n'expose pas le schéma `vault`, donc une Edge Function ne peut pas
  l'interroger directement même avec la clé service_role. Ces deux fonctions
  SECURITY DEFINER constituent la seule porte d'entrée : une pour écrire, une
  pour lire. Elles sont retirées à `authenticated` et accordées à
  `service_role` seul.

  Avantage secondaire : l'accès aux jetons passe par deux symboles nommés,
  faciles à chercher dans le code et à surveiller, au lieu d'être noyé dans des
  requêtes génériques.
*/
CREATE OR REPLACE FUNCTION public.provider_token_write(
  p_connection_id uuid,
  p_access_token  text,
  p_refresh_token text DEFAULT NULL,
  p_expires_at    timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing  public.provider_tokens;
  v_access_id uuid;
  v_refresh_id uuid;
BEGIN
  SELECT * INTO v_existing FROM public.provider_tokens
   WHERE connection_id = p_connection_id;

  IF v_existing.connection_id IS NULL THEN
    v_access_id := vault.create_secret(
      p_access_token,
      'provider_access_' || p_connection_id::text,
      'Jeton d''accès OAuth — Agon'
    );
    IF p_refresh_token IS NOT NULL THEN
      v_refresh_id := vault.create_secret(
        p_refresh_token,
        'provider_refresh_' || p_connection_id::text,
        'Jeton de rafraîchissement OAuth — Agon'
      );
    END IF;

    INSERT INTO public.provider_tokens
      (connection_id, access_secret_id, refresh_secret_id, access_expires_at)
    VALUES (p_connection_id, v_access_id, v_refresh_id, p_expires_at);
  ELSE
    -- Mise à jour du secret existant plutôt que création d'un nouveau : sinon
    -- chaque rafraîchissement laisserait un secret orphelin dans le Vault,
    -- et au bout de quelques mois on ne saurait plus lesquels sont vivants.
    PERFORM vault.update_secret(v_existing.access_secret_id, p_access_token);

    IF p_refresh_token IS NOT NULL THEN
      IF v_existing.refresh_secret_id IS NULL THEN
        v_refresh_id := vault.create_secret(
          p_refresh_token,
          'provider_refresh_' || p_connection_id::text,
          'Jeton de rafraîchissement OAuth — Agon'
        );
      ELSE
        PERFORM vault.update_secret(v_existing.refresh_secret_id, p_refresh_token);
        v_refresh_id := v_existing.refresh_secret_id;
      END IF;
    ELSE
      -- Un rafraîchissement qui ne renvoie pas de nouveau refresh_token veut
      -- dire que l'ancien reste valable : on ne l'efface pas.
      v_refresh_id := v_existing.refresh_secret_id;
    END IF;

    UPDATE public.provider_tokens
       SET refresh_secret_id = v_refresh_id,
           access_expires_at = p_expires_at,
           updated_at        = now()
     WHERE connection_id = p_connection_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_token_read(p_connection_id uuid)
RETURNS TABLE (
  access_token  text,
  refresh_token text,
  expires_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
STABLE
AS $$
  SELECT
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = t.access_secret_id),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = t.refresh_secret_id),
    t.access_expires_at
  FROM public.provider_tokens t
  WHERE t.connection_id = p_connection_id;
$$;

/*
  Suppression des secrets quand la connexion disparaît. Sans ce trigger, le
  ON DELETE CASCADE effacerait la ligne de `provider_tokens` et laisserait les
  secrets dans le Vault indéfiniment : des jetons d'accès conservés après que
  l'athlète a demandé la déconnexion, ce qui est précisément ce qu'on promet de
  ne pas faire.
*/
CREATE OR REPLACE FUNCTION public.provider_tokens_drop_secrets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = OLD.access_secret_id;
  IF OLD.refresh_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.refresh_secret_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER provider_tokens_drop_secrets
  AFTER DELETE ON public.provider_tokens
  FOR EACH ROW EXECUTE FUNCTION public.provider_tokens_drop_secrets();

REVOKE ALL ON FUNCTION public.provider_token_write(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.provider_token_read(uuid) FROM PUBLIC, anon, authenticated;
-- Fonction de trigger, donc inappelable directement, mais SECURITY DEFINER sur
-- le Vault : on ne laisse pas un droit d'exécution traîner sur cette base-là.
REVOKE ALL ON FUNCTION public.provider_tokens_drop_secrets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_token_write(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.provider_token_read(uuid) TO service_role;

-- ──────────────────────────────── Activités ─────────────────────────────────

CREATE TABLE public.provider_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source          public.data_source NOT NULL,
  -- Identifiant de l'activité chez le fournisseur. Clé de déduplication : un
  -- webhook Garmin peut être rejoué, et un athlète peut réimporter le même
  -- fichier.
  external_id     text NOT NULL,

  started_at      timestamptz NOT NULL,
  -- Jour local de l'activité, pour l'aligner sur la séance programmée. Une
  -- sortie à 23 h le lundi appartient au lundi, pas au mardi UTC.
  local_date      date NOT NULL,
  sport           text,
  duration_s      integer,
  distance_m      numeric(10, 2),
  elevation_gain_m numeric(8, 2),
  avg_hr          smallint,
  max_hr          smallint,
  avg_pace_s_per_km numeric(8, 2),
  calories        integer,

  -- Séries temporelles et tours, trop variables d'un fournisseur à l'autre
  -- pour être mis en colonnes.
  details         jsonb,
  -- Charge utile brute, conservée telle quelle : quand un chiffre affiché
  -- paraît faux, c'est la seule façon de savoir si l'erreur vient du
  -- fournisseur ou de notre normalisation.
  raw             jsonb,

  -- Posée par trigger depuis data_source_policies. Jamais par le client.
  ai_allowed      boolean NOT NULL DEFAULT false,

  imported_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT provider_activities_unique UNIQUE (athlete_id, source, external_id),
  CONSTRAINT provider_activities_hr_sane
    CHECK (avg_hr IS NULL OR (avg_hr BETWEEN 20 AND 250)),
  CONSTRAINT provider_activities_duration_sane
    CHECK (duration_s IS NULL OR duration_s > 0)
);

CREATE INDEX provider_activities_athlete_date_idx
  ON public.provider_activities (athlete_id, local_date DESC);

-- ──────────────────────── Données quotidiennes (santé) ──────────────────────

CREATE TABLE public.provider_dailies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source            public.data_source NOT NULL,
  day               date NOT NULL,

  resting_hr        smallint,
  hrv_ms            numeric(6, 2),
  sleep_total_min   integer,
  sleep_deep_min    integer,
  sleep_rem_min     integer,
  sleep_score       smallint,
  steps             integer,
  stress_avg        smallint,
  body_battery_min  smallint,
  body_battery_max  smallint,
  vo2max            numeric(4, 1),
  training_load     numeric(8, 2),

  raw               jsonb,
  ai_allowed        boolean NOT NULL DEFAULT false,
  imported_at       timestamptz NOT NULL DEFAULT now(),

  -- Un seul enregistrement par jour et par source. Le fournisseur réémet
  -- souvent la même journée corrigée : on remplace, on n'empile pas.
  CONSTRAINT provider_dailies_unique UNIQUE (athlete_id, source, day),
  CONSTRAINT provider_dailies_rhr_sane
    CHECK (resting_hr IS NULL OR (resting_hr BETWEEN 20 AND 150)),
  CONSTRAINT provider_dailies_sleep_sane
    CHECK (sleep_total_min IS NULL OR (sleep_total_min BETWEEN 0 AND 1440))
);

CREATE INDEX provider_dailies_athlete_day_idx
  ON public.provider_dailies (athlete_id, day DESC);

-- ─────────────── ai_allowed : posé en base, pas par le code ─────────────────
/*
  La question « cette donnée peut-elle partir chez Gemini ? » ne doit pas
  dépendre du soin apporté par chaque fonction d'import. Le trigger lit la
  politique de la source et écrase ce que l'appelant aurait pu mettre.

  Conséquence voulue : une source ajoutée sans ligne dans
  `data_source_policies` fait échouer l'insertion. Une source inconnue est
  traitée comme interdite, pas comme permise par défaut.
*/
CREATE OR REPLACE FUNCTION public.apply_source_ai_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  SELECT ai_allowed INTO v_allowed
    FROM public.data_source_policies WHERE source = NEW.source;

  IF v_allowed IS NULL THEN
    RAISE EXCEPTION
      'Source % absente de data_source_policies : ajouter sa politique avant d''importer ses données', NEW.source;
  END IF;

  NEW.ai_allowed := v_allowed;
  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_activities_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.provider_activities
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

CREATE TRIGGER provider_dailies_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.provider_dailies
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

/*
  `ai_allowed` est figé à l'insertion : changer une ligne de
  `data_source_policies` ne rétroagit pas sur les données déjà importées. C'est
  volontaire dans le sens restrictif — une source qui devient interdite doit
  l'être tout de suite, donc le point d'usage (chantier G) lit la politique en
  direct ET la colonne, et refuse si l'un des deux refuse.

  Dans le sens permissif, en revanche, il faut rattraper explicitement :

    UPDATE public.provider_activities a SET ai_allowed = p.ai_allowed
      FROM public.data_source_policies p
     WHERE p.source = a.source AND a.ai_allowed <> p.ai_allowed;

  (idem sur provider_dailies). À exécuter après avoir repassé `coros` à true.
*/

-- ───────────── Consentement requis par source, et son retrait ───────────────
/*
  Défini avant les politiques qui l'appellent : Postgres résout la fonction au
  moment du CREATE POLICY, pas à l'exécution de la requête.

  `file_import` et `manual` ne demandent pas de consentement supplémentaire :
  la donnée vient de l'athlète lui-même, dans une application dont il a déjà
  accepté la finalité. Exiger un accord distinct pour un fichier qu'il vient
  de déposer serait une case de plus sans contenu, et une case vide de sens
  dévalue toutes les autres.

  SECURITY DEFINER, et ce n'est pas un détail. `current_consents` est une vue
  en `security_invoker=true` au-dessus de `user_consents`, dont la seule
  politique de lecture est `user_id = auth.uid()`. Évaluée avec les droits de
  l'appelant, la fonction renvoie donc systématiquement false pour un coach —
  qui n'a pas le droit de lire le journal de consentement de son athlète. Les
  politiques `*_coach_read` seraient alors toujours fausses et le coach ne
  verrait jamais aucune donnée de montre : la fonctionnalité serait morte, pas
  juste restreinte.

  Mais une fonction qui contourne RLS devient un oracle : n'importe quel compte
  connecté pourrait sonder un UUID pour savoir s'il a connecté une montre.
  D'où le garde-fou explicite — on ne répond que sur soi-même, sur un athlète
  dont on est le coach, ou en appel serveur.

  « Appel serveur » se teste par `auth.uid() IS NULL` et non par
  `auth.role() = 'service_role'` : `auth.role()` est NULL sous pg_cron, sous
  psql et pendant une migration, ce qui ferait échouer le trigger
  `require_sync_consent` dans ces contextes — un piège qui n'apparaîtrait qu'au
  premier passage du cron. Et un jeton `authenticated` porte toujours un `sub`,
  donc l'absence d'uid ne peut pas venir d'un utilisateur connecté. `anon`, qui
  a lui aussi un uid nul, est écarté par le GRANT plus bas, pas par le corps.
*/
CREATE OR REPLACE FUNCTION public.source_consent_granted(
  p_athlete uuid,
  p_source  public.data_source
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_source IN ('file_import', 'manual') THEN true
    WHEN NOT (
      auth.uid() IS NULL
      OR auth.uid() = p_athlete
      OR public.is_coach_of(p_athlete)
    ) THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.current_consents c
       WHERE c.user_id = p_athlete
         AND c.granted
         AND c.purpose = (CASE p_source
                            WHEN 'garmin' THEN 'garmin_sync'
                            ELSE 'coros_sync'
                          END)::public.consent_purpose
    )
  END;
$$;

-- Lisible par les utilisateurs connectés : les politiques RLS qui l'appellent
-- s'exécutent avec leurs droits. `anon` n'a rien à y faire.
REVOKE ALL ON FUNCTION public.source_consent_granted(uuid, public.data_source) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.source_consent_granted(uuid, public.data_source) TO authenticated, service_role;

-- ────────────────────────── RLS données importées ───────────────────────────

ALTER TABLE public.provider_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_dailies ENABLE ROW LEVEL SECURITY;

CREATE POLICY provider_activities_own ON public.provider_activities
  FOR ALL TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

CREATE POLICY provider_dailies_own ON public.provider_dailies
  FOR ALL TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

/*
  Visibilité coach soumise à deux conditions cumulatives :
    - les conditions du fournisseur l'autorisent (`coach_visible`) ;
    - l'athlète a consenti à la synchronisation de cette montre.

  Le consentement est relu à chaque requête plutôt que figé à l'import. Un
  athlète qui retire son accord ce matin doit disparaître du tableau de bord ce
  matin, sans qu'il faille se souvenir d'effacer quoi que ce soit — et sans
  qu'un oubli dans le code applicatif puisse laisser la donnée visible.
*/
CREATE POLICY provider_activities_coach_read ON public.provider_activities
  FOR SELECT TO authenticated
  USING (
    public.is_coach_of(athlete_id)
    AND EXISTS (
      SELECT 1 FROM public.data_source_policies p
       WHERE p.source = provider_activities.source AND p.coach_visible
    )
    AND public.source_consent_granted(athlete_id, source)
  );

CREATE POLICY provider_dailies_coach_read ON public.provider_dailies
  FOR SELECT TO authenticated
  USING (
    public.is_coach_of(athlete_id)
    AND EXISTS (
      SELECT 1 FROM public.data_source_policies p
       WHERE p.source = provider_dailies.source AND p.coach_visible
    )
    AND public.source_consent_granted(athlete_id, source)
  );

-- ──────────────────── Retrait du consentement : arrêt du sync ───────────────
/*
  Retrait d'un consentement montre : la connexion passe en
  'consent_withdrawn', donc le cron l'ignore immédiatement.

  Ce trigger ne supprime pas les jetons et ne les révoque pas : révoquer exige
  un appel HTTP au fournisseur, qui n'a rien à faire dans une transaction SQL —
  si Garmin répond en trois secondes, l'écriture du retrait attend trois
  secondes, et si Garmin ne répond pas, le retrait échoue. Inacceptable : le
  retrait doit toujours aboutir. L'Edge Function `provider-disconnect` fait la
  révocation ensuite, et son échec éventuel ne remet pas en cause l'arrêt de la
  synchronisation.
*/
CREATE OR REPLACE FUNCTION public.halt_sync_on_consent_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.granted THEN RETURN NEW; END IF;

  UPDATE public.provider_connections
     SET status = 'consent_withdrawn'
   WHERE athlete_id = NEW.user_id
     AND status = 'active'
     AND provider = CASE NEW.purpose
                      WHEN 'garmin_sync' THEN 'garmin'::public.data_source
                      WHEN 'coros_sync'  THEN 'coros'::public.data_source
                      ELSE NULL
                    END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_consents_halt_sync
  AFTER INSERT ON public.user_consents
  FOR EACH ROW EXECUTE FUNCTION public.halt_sync_on_consent_withdrawal();

/*
  Une connexion ne peut pas naître sans consentement. L'engagement pris auprès
  de Garmin — « the athlete grants explicit consent to the sync » — doit être
  vrai même si un futur chemin de code oublie de le vérifier.
*/
CREATE OR REPLACE FUNCTION public.require_sync_consent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active'
     AND NOT public.source_consent_granted(NEW.athlete_id, NEW.provider) THEN
    RAISE EXCEPTION
      'Connexion % impossible : consentement de synchronisation absent pour cet athlète', NEW.provider;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER provider_connections_require_consent
  BEFORE INSERT OR UPDATE OF status, athlete_id, provider
  ON public.provider_connections
  FOR EACH ROW EXECUTE FUNCTION public.require_sync_consent();
