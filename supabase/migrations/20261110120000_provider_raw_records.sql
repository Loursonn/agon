/*
  Stockage intégral de ce que Garmin envoie (décision Hugo, 09/11/2026).

  Objectif : tout garder, tout pouvoir analyser plus tard. On ne décide pas à
  la réception de ce qui servira ; on stocke, et on traite ce qu'on veut.

    1. `provider_raw_records` — une ligne par résumé reçu (tous les types :
       activités, détails, fichiers, Move IQ, journée, sommeil, VFC, stress,
       body battery, VO2max, composition, SpO2, respiration, température,
       tension, nutrition, hydratation, epochs…), JSON complet tel que Garmin
       l'a envoyé. Un résumé mis à jour par Garmin remplace la version
       précédente (même `summary_id`).
    2. Bucket privé `provider-raw` — ce qui est trop lourd pour une ligne :
         <athlete>/<source>/activityDetails/<summaryId>.json.gz  (échantillons
           seconde par seconde : FC, allure, vitesse, cadence, puissance,
           altitude, GPS, température)
         <athlete>/<source>/activityFiles/<summaryId>.fit       (fichier .FIT
           d'origine de la montre)
    3. `provider_raw_objects` — liste des fichiers d'un athlète pour une
       source (et des types donnés), pour les supprimer via l'API Storage.
    4. `provider_forget` — supprime aussi les lignes brutes (déconnexion,
       désinscription Garmin, retrait d'accord).
    5. `list_user_storage_objects` — couvre le nouveau bucket (suppression de
       compte).

  Mêmes garanties que provider_activities / provider_dailies :
    - `ai_allowed` imposé par trigger depuis data_source_policies (garmin =
      false : jamais envoyé à l'IA) ;
    - écriture réservée au service_role (Edge Functions) ;
    - l'athlète lit ses propres lignes (export RGPD) ; pas de lecture coach
      tant qu'aucun écran ne s'en sert.

  Additive : le client de production ne lit ni n'écrit rien de ce qu'elle crée.
  Testé à blanc : supabase/tests/provider_raw_records.sql.
*/

-- ═══════════════ 1. Table ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.provider_raw_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source           public.data_source NOT NULL,
  -- Clé de premier niveau de la notification Garmin (activities, dailies…).
  summary_type     text NOT NULL CHECK (length(summary_type) BETWEEN 1 AND 60),
  -- summaryId Garmin ; à défaut, empreinte du contenu.
  summary_id       text NOT NULL CHECK (length(summary_id) BETWEEN 1 AND 200),
  external_user_id text,
  -- Le résumé tel que reçu, sans les échantillons (rangés dans Storage) ni
  -- l'URL de téléchargement d'un fichier (elle porte un jeton).
  payload          jsonb NOT NULL,
  samples_path     text,
  samples_count    integer CHECK (samples_count IS NULL OR samples_count >= 0),
  file_path        text,
  file_type        text,
  file_bytes       integer CHECK (file_bytes IS NULL OR file_bytes >= 0),
  ai_allowed       boolean NOT NULL DEFAULT false,
  received_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, source, summary_type, summary_id)
);

COMMENT ON TABLE public.provider_raw_records IS
  'Tout ce qu''un fournisseur (Garmin) envoie, résumé par résumé, JSON complet. Échantillons et fichiers .FIT dans le bucket provider-raw. Écriture service_role uniquement.';

CREATE INDEX IF NOT EXISTS provider_raw_records_athlete_type
  ON public.provider_raw_records (athlete_id, source, summary_type, received_at DESC);

DROP TRIGGER IF EXISTS provider_raw_records_ai_policy ON public.provider_raw_records;
CREATE TRIGGER provider_raw_records_ai_policy
  BEFORE INSERT OR UPDATE OF source ON public.provider_raw_records
  FOR EACH ROW EXECUTE FUNCTION public.apply_source_ai_policy();

CREATE OR REPLACE FUNCTION public.provider_raw_records_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.received_at := OLD.received_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_raw_records_touch ON public.provider_raw_records;
CREATE TRIGGER provider_raw_records_touch
  BEFORE UPDATE ON public.provider_raw_records
  FOR EACH ROW EXECUTE FUNCTION public.provider_raw_records_touch();

ALTER TABLE public.provider_raw_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.provider_raw_records FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.provider_raw_records TO authenticated;
GRANT ALL ON public.provider_raw_records TO service_role;

DROP POLICY IF EXISTS provider_raw_records_own_read ON public.provider_raw_records;
CREATE POLICY provider_raw_records_own_read ON public.provider_raw_records
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

-- ═══════════════ 2. Bucket privé ═════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('provider-raw', 'provider-raw', false, 104857600)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

-- L'athlète peut lire ses propres fichiers (export, accès à ses données).
-- Aucune écriture côté client : seul le service_role dépose et supprime.
DROP POLICY IF EXISTS provider_raw_own_read ON storage.objects;
CREATE POLICY provider_raw_own_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'provider-raw' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ═══════════════ 3. Liste des fichiers d'un athlète ══════════════════════════

CREATE OR REPLACE FUNCTION public.provider_raw_objects(
  p_athlete  uuid,
  p_provider public.data_source,
  p_types    text[] DEFAULT NULL
)
RETURNS TABLE (object_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT o.name
    FROM storage.objects o
   WHERE o.bucket_id = 'provider-raw'
     AND o.name LIKE p_athlete::text || '/' || p_provider::text || '/%'
     AND (p_types IS NULL OR split_part(o.name, '/', 3) = ANY (p_types));
$$;

REVOKE ALL ON FUNCTION public.provider_raw_objects(uuid, public.data_source, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_raw_objects(uuid, public.data_source, text[]) TO service_role;

-- ═══════════════ 4. provider_forget : lignes brutes comprises ════════════════

CREATE OR REPLACE FUNCTION public.provider_forget(
  p_athlete  uuid,
  p_provider public.data_source
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_external text;
  n_act int; n_day int; n_raw int; n_inbox int := 0; n_conn int;
BEGIN
  IF p_provider NOT IN ('garmin', 'coros') THEN
    RAISE EXCEPTION 'provider_forget : % n''est pas un fournisseur connecté', p_provider;
  END IF;

  SELECT external_user_id INTO v_external
    FROM public.provider_connections
   WHERE athlete_id = p_athlete AND provider = p_provider;

  DELETE FROM public.provider_activities WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_act = ROW_COUNT;
  DELETE FROM public.provider_dailies WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_day = ROW_COUNT;
  DELETE FROM public.provider_raw_records WHERE athlete_id = p_athlete AND source = p_provider;
  GET DIAGNOSTICS n_raw = ROW_COUNT;
  IF v_external IS NOT NULL THEN
    DELETE FROM public.provider_webhook_inbox WHERE provider = p_provider AND external_user_id = v_external;
    GET DIAGNOSTICS n_inbox = ROW_COUNT;
  END IF;
  DELETE FROM public.provider_connections WHERE athlete_id = p_athlete AND provider = p_provider;
  GET DIAGNOSTICS n_conn = ROW_COUNT;

  RETURN jsonb_build_object('activities', n_act, 'dailies', n_day, 'raw', n_raw,
                            'inbox', n_inbox, 'connection', n_conn);
END;
$$;

REVOKE ALL ON FUNCTION public.provider_forget(uuid, public.data_source) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_forget(uuid, public.data_source) TO service_role;

-- ═══════════════ 5. Suppression de compte : nouveau bucket couvert ═══════════

CREATE OR REPLACE FUNCTION public.list_user_storage_objects(target_user uuid)
RETURNS TABLE(bucket_id text, object_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $function$
  -- Pièces jointes médicales, fichiers de test, données brutes des montres :
  -- chemin préfixé par l'uuid de l'athlète, convention en place dans l'application.
  SELECT o.bucket_id, o.name
  FROM storage.objects o
  WHERE o.bucket_id IN ('medical', 'test-files', 'garmin-screenshots', 'test-media', 'avatars', 'provider-raw')
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
$function$;

REVOKE ALL ON FUNCTION public.list_user_storage_objects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_storage_objects(uuid) TO service_role;
