-- Journal anonyme des suppressions de compte.
--
-- Tension à résoudre : l'article 7.1 du RGPD demande de pouvoir démontrer que
-- le consentement a été recueilli, et l'article 17 impose d'effacer les données
-- de la personne qui le demande. Les deux se heurtent, parce que la preuve du
-- consentement contient par construction un identifiant de la personne.
--
-- Arbitrage retenu : l'effacement l'emporte. Quand un compte est supprimé, son
-- journal `user_consents` part avec lui (cascade depuis auth.users), et on ne
-- conserve ici qu'une ligne SANS aucun identifiant : date, rôle, version des
-- documents en vigueur. Cela permet de prouver qu'un mécanisme de consentement
-- fonctionnait à une date donnée, sans conserver de donnée personnelle — donc
-- sans vider l'effacement de son sens.
--
-- Cette table ne doit jamais recevoir d'email, d'uuid ni de nom. L'absence de
-- colonne pour les accueillir est délibérée.

CREATE TABLE IF NOT EXISTS public.account_deletions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at     timestamptz NOT NULL DEFAULT now(),
  -- Rôle au moment de la suppression, pour la seule statistique d'usage.
  role           text,
  -- Version des documents légaux acceptée par le compte, si elle existait.
  consent_version text,
  -- L'utilisateur avait-il accordé le consentement socle ?
  had_core_consent boolean,
  -- Déclenchée par l'utilisateur lui-même, ou par l'éditeur (abus, fin de
  -- service). Utile pour distinguer les deux cas en cas de contestation.
  initiated_by   text NOT NULL DEFAULT 'user'
    CHECK (initiated_by IN ('user', 'admin'))
);

COMMENT ON TABLE public.account_deletions IS
  'Journal anonyme des suppressions. Aucun identifiant de personne : ni email, ni uuid, ni nom. Ne jamais en ajouter.';

ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

-- Aucune politique pour `authenticated` : la table n'est ni lisible ni
-- écrivable depuis le client. Seul le service_role y accède, depuis l'Edge
-- Function de suppression.
