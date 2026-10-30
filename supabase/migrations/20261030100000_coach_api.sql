-- API coach pour assistant IA personnel (Claude).
--
-- Un coach génère une clé `agon_…` et la confie à son assistant IA. Avec
-- elle, l'assistant lit les données des athlètes qui l'ont accepté et dépose
-- des propositions — axes de travail, ou brouillons de programme, de planning
-- et d'objectifs. Il n'écrit jamais dans `app_data` : le front charge chaque
-- clé entière et la réécrit entière à chaque modification, donc une écriture
-- serveur faite pendant qu'un onglet est ouvert serait écrasée à la
-- sauvegarde suivante. La proposition attend dans `coach_api_drafts`, et
-- c'est le clic « Appliquer » du coach qui passe par la sauvegarde normale.
--
-- Additive uniquement : aucune table existante n'est modifiée.

-- ─────────────────────────────── Clés ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  -- Début de la clé (« agon_ab12cd34 »), pour que le coach reconnaisse
  -- laquelle révoquer. Trop court pour reconstituer quoi que ce soit.
  key_prefix    text NOT NULL CHECK (char_length(key_prefix) <= 16),
  -- SHA-256 hexadécimal. La clé elle-même n'est jamais stockée : elle est
  -- montrée une fois, au coach, à la création.
  key_hash      text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

COMMENT ON TABLE public.coach_api_keys IS
  'Clés API personnelles des coachs, pour leur assistant IA. Seul le hash SHA-256 est stocké. Jamais supprimées : une clé révoquée reste, pour relier le journal d''accès à quelque chose.';

CREATE INDEX IF NOT EXISTS coach_api_keys_coach_idx ON public.coach_api_keys (coach_id);

ALTER TABLE public.coach_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_api_keys_select_own ON public.coach_api_keys;
CREATE POLICY coach_api_keys_select_own ON public.coach_api_keys
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

-- Seul un coach peut créer une clé : l'API sert à lire les données de ses
-- athlètes, un athlète n'en a pas.
DROP POLICY IF EXISTS coach_api_keys_insert_own ON public.coach_api_keys;
CREATE POLICY coach_api_keys_insert_own ON public.coach_api_keys
  FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = auth.uid()
    AND revoked_at IS NULL
    AND last_used_at IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'coach')
  );

-- Mise à jour réservée à la révocation : le droit de colonne ci-dessous
-- empêche de réécrire le hash ou de rattacher la clé à quelqu'un d'autre.
DROP POLICY IF EXISTS coach_api_keys_revoke_own ON public.coach_api_keys;
CREATE POLICY coach_api_keys_revoke_own ON public.coach_api_keys
  FOR UPDATE TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

REVOKE ALL ON public.coach_api_keys FROM anon;
REVOKE UPDATE, DELETE ON public.coach_api_keys FROM authenticated;
GRANT SELECT, INSERT ON public.coach_api_keys TO authenticated;
GRANT UPDATE (revoked_at) ON public.coach_api_keys TO authenticated;

-- ──────────────────────────── Propositions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_api_drafts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_id           uuid REFERENCES public.coach_api_keys(id) ON DELETE SET NULL,
  -- axe : texte seul, que le coach lit et retient ou écarte.
  -- programme / planning / objectifs : opérations à appliquer sur
  -- asp:prog ou asp:goals, validées côté serveur puis rejouées côté app.
  kind             text NOT NULL CHECK (kind IN ('axe', 'programme', 'planning', 'objectifs')),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body             text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  ops              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ops) = 'array'),
  -- updated_at de la clé app_data visée au moment de la proposition. Si elle
  -- a bougé depuis, le coach est prévenu avant d'appliquer.
  base_updated_at  timestamptz,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz
);

COMMENT ON TABLE public.coach_api_drafts IS
  'Propositions déposées par l''assistant IA d''un coach. Rien n''atteint l''athlète tant que le coach n''a pas appliqué. L''athlète ne les voit pas.';

CREATE INDEX IF NOT EXISTS coach_api_drafts_pending_idx
  ON public.coach_api_drafts (coach_id, athlete_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.coach_api_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_api_drafts_select_own ON public.coach_api_drafts;
CREATE POLICY coach_api_drafts_select_own ON public.coach_api_drafts
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

-- Le coach décide (appliquer / écarter). Il ne crée pas de proposition par
-- ce chemin : seule l'Edge Function, en service_role, en insère.
DROP POLICY IF EXISTS coach_api_drafts_decide_own ON public.coach_api_drafts;
CREATE POLICY coach_api_drafts_decide_own ON public.coach_api_drafts
  FOR UPDATE TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

REVOKE ALL ON public.coach_api_drafts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.coach_api_drafts FROM authenticated;
GRANT SELECT ON public.coach_api_drafts TO authenticated;
GRANT UPDATE (status, decided_at) ON public.coach_api_drafts TO authenticated;

-- ──────────────────────────── Journal d'accès ───────────────────────────────
/*
  Chaque lecture de données d'un athlète par l'API est tracée. C'est ce qui
  permet de répondre au droit d'accès (art. 15.1.c : les destinataires auxquels
  ses données ont été communiquées) avec des faits plutôt qu'une supposition.
*/
CREATE TABLE IF NOT EXISTS public.coach_api_access_log (
  id          bigserial PRIMARY KEY,
  key_id      uuid REFERENCES public.coach_api_keys(id) ON DELETE SET NULL,
  coach_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  route       text NOT NULL CHECK (char_length(route) <= 80),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_api_access_log_athlete_idx
  ON public.coach_api_access_log (athlete_id, created_at DESC);

ALTER TABLE public.coach_api_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_api_access_log_select_own ON public.coach_api_access_log;
CREATE POLICY coach_api_access_log_select_own ON public.coach_api_access_log
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

REVOKE ALL ON public.coach_api_access_log FROM anon, authenticated;
GRANT SELECT ON public.coach_api_access_log TO authenticated;

-- ──────────────────────────── Limite de débit ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.coach_api_rate (
  key_id        uuid NOT NULL REFERENCES public.coach_api_keys(id) ON DELETE CASCADE,
  window_start  timestamptz NOT NULL,
  hits          integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);

ALTER TABLE public.coach_api_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_api_rate FROM anon, authenticated;

/*
  Compte une requête dans la minute en cours et renvoie le total.

  En base plutôt qu'en mémoire : une Edge Function tourne sur plusieurs
  instances, un compteur en mémoire serait par instance, donc une limite qui
  n'en est pas une. L'upsert est atomique, deux requêtes simultanées ne
  peuvent pas lire le même total.
*/
CREATE OR REPLACE FUNCTION public.coach_api_hit(p_key uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hits integer;
BEGIN
  DELETE FROM public.coach_api_rate
   WHERE key_id = p_key AND window_start < date_trunc('minute', now());

  INSERT INTO public.coach_api_rate (key_id, window_start, hits)
  VALUES (p_key, date_trunc('minute', now()), 1)
  ON CONFLICT (key_id, window_start)
  DO UPDATE SET hits = public.coach_api_rate.hits + 1
  RETURNING hits INTO v_hits;

  RETURN v_hits;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_api_hit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coach_api_hit(uuid) TO service_role;
