/*
  Chantier H — état transitoire de l'autorisation COROS.

  Deux tables, toutes deux en RLS sans aucune politique : elles ne sont
  touchées que par des Edge Functions en `service_role`. Rien de ce qu'elles
  contiennent n'a de raison d'atteindre un navigateur.

  Pourquoi en base et pas en mémoire dans la fonction : les Edge Functions sont
  sans état et chaque requête peut atterrir sur une autre instance. Le
  `code_verifier` est créé pendant /connect et relu pendant /callback, donc
  dans deux invocations différentes — il doit survivre entre les deux, et
  nulle part ailleurs que côté serveur.
*/

-- ───────────── Clients enregistrés par enregistrement dynamique ─────────────
/*
  COROS accepte l'enregistrement dynamique de client (RFC 7591) sur
  /connect/register, sans liste blanche ni approbation humaine. On s'enregistre
  une fois par hôte régional et on conserve le `client_id` : réenregistrer à
  chaque autorisation créerait un client par connexion chez COROS, ce qui est à
  la fois inutile et impossible à révoquer proprement ensuite.

  Pas de colonne pour un secret : COROS enregistre les clients en
  `token_endpoint_auth_method: "none"`. Il n'y a pas de secret à stocker, et
  prévoir la colonne laisserait croire le contraire.
*/
CREATE TABLE public.provider_oauth_clients (
  provider      public.data_source NOT NULL,
  api_host      text NOT NULL,
  client_id     text NOT NULL,
  -- Scopes obtenus à l'enregistrement. Si COROS en retire un, on veut pouvoir
  -- constater l'écart sans redéployer.
  scope         text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (provider, api_host)
);

ALTER TABLE public.provider_oauth_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_oauth_clients FROM anon, authenticated;

COMMENT ON TABLE public.provider_oauth_clients IS
  'Clients OAuth enregistrés dynamiquement, un par hôte régional. Aucun secret : COROS délivre des clients publics.';

-- ──────────────── Autorisations en cours (PKCE + anti-CSRF) ─────────────────
/*
  Durée de vie courte et volontairement stricte. Une ligne non consommée est
  une autorisation abandonnée — l'athlète a fermé l'onglet — et doit disparaître
  plutôt que rester utilisable.

  `state` est la clé : c'est la valeur renvoyée par COROS dans l'URL de retour,
  et c'est ce qui prouve que le callback répond bien à une demande que nous
  avons émise. Sans elle, n'importe qui pourrait appeler notre callback avec un
  code obtenu ailleurs.
*/
CREATE TABLE public.provider_oauth_states (
  state         text PRIMARY KEY,
  athlete_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider      public.data_source NOT NULL,
  api_host      text NOT NULL,

  -- Le secret PKCE. Il ne doit jamais atteindre le navigateur : c'est lui qui
  -- prouve au serveur de jetons que l'échange du code vient bien de celui qui
  -- a initié l'autorisation. Transmis au client, PKCE ne protège plus de rien.
  code_verifier text NOT NULL,
  redirect_uri  text NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Dix minutes : assez pour s'authentifier chez COROS, trop peu pour qu'une
  -- URL de retour traînant dans un historique reste exploitable.
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '10 minutes',

  CONSTRAINT provider_oauth_states_ttl CHECK (expires_at > created_at)
);

CREATE INDEX provider_oauth_states_expiry_idx
  ON public.provider_oauth_states (expires_at);

ALTER TABLE public.provider_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_oauth_states FROM anon, authenticated;

COMMENT ON TABLE public.provider_oauth_states IS
  'Autorisations OAuth en cours. Contient le code_verifier PKCE, qui ne doit jamais sortir du serveur. Lignes purgées après 10 minutes.';

/*
  Consommation en une seule opération : on lit et on supprime dans la même
  requête. Un code d'autorisation ne doit servir qu'une fois, et lire puis
  supprimer en deux temps laisse une fenêtre où un callback rejoué réussit.
  Le DELETE ... RETURNING ferme la fenêtre au niveau de la base, sans avoir à
  raisonner sur la concurrence entre instances d'Edge Function.
*/
CREATE OR REPLACE FUNCTION public.consume_oauth_state(p_state text)
RETURNS TABLE (
  athlete_id    uuid,
  provider      public.data_source,
  api_host      text,
  code_verifier text,
  redirect_uri  text
)
LANGUAGE sql
SET search_path = public
AS $$
  DELETE FROM public.provider_oauth_states s
   WHERE s.state = p_state
     AND s.expires_at > now()
  RETURNING s.athlete_id, s.provider, s.api_host, s.code_verifier, s.redirect_uri;
$$;

REVOKE ALL ON FUNCTION public.consume_oauth_state(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(text) TO service_role;

COMMENT ON FUNCTION public.consume_oauth_state(text) IS
  'Lit et supprime une autorisation en cours en une opération. Renvoie zéro ligne si le state est inconnu, déjà consommé ou expiré.';

/*
  Purge des autorisations abandonnées. Appelée par le cron quotidien ; la
  fonction reste utile seule, parce qu'une table qui ne se vide que par un cron
  qu'on a oublié de programmer finit par grossir en silence.
*/
CREATE OR REPLACE FUNCTION public.purge_expired_oauth_states()
RETURNS integer
LANGUAGE sql
SET search_path = public
AS $$
  WITH gone AS (
    DELETE FROM public.provider_oauth_states
     WHERE expires_at <= now()
    RETURNING 1
  )
  SELECT count(*)::integer FROM gone;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_oauth_states() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_oauth_states() TO service_role;
