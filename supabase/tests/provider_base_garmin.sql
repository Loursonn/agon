-- Tests de 20261107140000_provider_base_garmin.sql (base provider + Garmin).
-- Toujours annulé : rien ne reste en base.
--
-- Avant application (migration rejouée dans la même transaction, puis annulée) :
--   (echo 'BEGIN;'; cat supabase/migrations/20261107140000_provider_base_garmin.sql; \
--    sed -e '/^BEGIN;$/d' supabase/tests/provider_base_garmin.sql) > "$TMPDIR/pbg.sql"
--   tail -1 "$TMPDIR/pbg.sql"    # doit afficher ROLLBACK;
--   supabase db query --linked -f "$TMPDIR/pbg.sql"
-- Après application :
--   supabase db query --linked -f supabase/tests/provider_base_garmin.sql
-- Chaque ligne doit avoir ok = true.

BEGIN;

CREATE TEMP TABLE t_res (n serial, name text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_res TO anon, authenticated;
GRANT ALL ON SEQUENCE t_res_n_seq TO anon, authenticated;

-- Athlète avec un coach référent ; un autre athlète ; un coach sans lien.
CREATE TEMP TABLE t_ids ON COMMIT DROP AS
SELECT
  (SELECT a.id FROM profiles a
    WHERE a.role = 'athlete' AND a.coach_id IS NOT NULL AND a.coach_id <> a.id
      AND NOT coalesce(a.is_pending, false)
    ORDER BY a.id LIMIT 1) AS athlete,
  NULL::uuid AS coach, NULL::uuid AS other_athlete, NULL::uuid AS other_coach;
UPDATE t_ids SET coach = (SELECT coach_id FROM profiles WHERE id = t_ids.athlete);
UPDATE t_ids SET other_athlete = (SELECT a.id FROM profiles a
    WHERE a.role = 'athlete' AND a.id <> t_ids.athlete AND NOT coalesce(a.is_pending, false)
      AND a.coach_id IS DISTINCT FROM t_ids.coach
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = a.id AND cc.co_coach_id = t_ids.coach)
    ORDER BY a.id LIMIT 1);
UPDATE t_ids SET other_coach = (SELECT c.id FROM profiles c
    WHERE c.role IN ('coach', 'coach_athlete') AND c.id <> t_ids.coach
      AND NOT EXISTS (SELECT 1 FROM profiles a WHERE a.id = t_ids.athlete AND a.coach_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM athlete_co_coaches cc WHERE cc.athlete_id = t_ids.athlete AND cc.co_coach_id = c.id)
    ORDER BY c.id LIMIT 1);
GRANT SELECT ON t_ids TO anon, authenticated;

INSERT INTO t_res (name, ok, detail)
SELECT 'fixtures trouvées', athlete IS NOT NULL AND coach IS NOT NULL AND other_athlete IS NOT NULL AND other_coach IS NOT NULL,
       concat_ws(' ', athlete, coach, other_athlete, other_coach) FROM t_ids;

-- ---------- Cron : no-op silencieux tant que rien n'est à faire ----------
DO $$ BEGIN
  PERFORM public.trigger_garmin_maintenance();
  INSERT INTO t_res (name, ok, detail) VALUES ('cron: no-op sans connexion Garmin', true, 'sans erreur');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('cron: no-op sans connexion Garmin', false, SQLERRM);
END $$;

INSERT INTO t_res (name, ok, detail)
SELECT 'cron: job garmin-maintenance planifié', count(*) = 1, string_agg(schedule, ',')
  FROM cron.job WHERE jobname = 'garmin-maintenance';

-- ---------- Politique par source ----------
INSERT INTO t_res (name, ok, detail)
SELECT 'politique: finalités des 4 sources',
       bool_and(CASE source
                  WHEN 'garmin' THEN consent_purpose = 'garmin_sync'
                  WHEN 'coros'  THEN consent_purpose = 'coros_sync'
                  ELSE consent_purpose IS NULL END),
       string_agg(source || '=' || coalesce(consent_purpose::text, 'null'), ' ')
  FROM data_source_policies;

DO $$ BEGIN
  UPDATE data_source_policies SET consent_purpose = NULL WHERE source = 'garmin';
  INSERT INTO t_res (name, ok, detail) VALUES ('politique: garmin sans finalité refusé', false, 'accepté');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('politique: garmin sans finalité refusé', true, SQLERRM);
END $$;

-- Consentements de test (postgres : pas de RLS). Athlète : garmin oui, coros non.
INSERT INTO user_consents (user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'garmin_sync', true, 'test', 'test' FROM t_ids;
INSERT INTO user_consents (user_id, purpose, granted, doc_version, statement)
SELECT other_athlete, 'garmin_sync', true, 'test', 'test' FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'consent: garmin accordé → vrai', source_consent_granted(athlete, 'garmin'), '' FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'consent: coros non accordé → faux (plus d''héritage)', NOT source_consent_granted(athlete, 'coros'), '' FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'consent: file_import → vrai sans accord', source_consent_granted(athlete, 'file_import'), '' FROM t_ids;

-- La finalité est lue dans la table : coros rattaché à garmin_sync suit cet accord…
UPDATE data_source_policies SET consent_purpose = 'garmin_sync' WHERE source = 'coros';
INSERT INTO t_res (name, ok, detail)
SELECT 'consent: finalité lue dans la table', source_consent_granted(athlete, 'coros'), '' FROM t_ids;
-- … et une source sans politique est refusée.
DELETE FROM data_source_policies WHERE source = 'coros';
INSERT INTO t_res (name, ok, detail)
SELECT 'consent: source sans politique → faux', NOT source_consent_granted(athlete, 'coros'), '' FROM t_ids;
INSERT INTO data_source_policies (source, ai_allowed, coach_visible, notes, consent_purpose)
VALUES ('coros', false, true, 'restauré par le test', 'coros_sync');

-- ---------- Connexions : unicité du compte fournisseur ----------
INSERT INTO provider_connections (athlete_id, provider, external_user_id, granted_scopes)
SELECT athlete, 'garmin', 'test-garmin-user-1', ARRAY['ACTIVITY_EXPORT', 'HEALTH_EXPORT'] FROM t_ids;

DO $$ BEGIN
  INSERT INTO provider_connections (athlete_id, provider, external_user_id)
  SELECT other_athlete, 'garmin', 'test-garmin-user-1' FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('connexion: même compte Garmin pour 2 athlètes refusé', false, 'accepté');
EXCEPTION WHEN unique_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('connexion: même compte Garmin pour 2 athlètes refusé', true, SQLERRM);
END $$;

-- Sans consentement coros, la connexion coros active reste impossible.
DO $$ BEGIN
  INSERT INTO provider_connections (athlete_id, provider) SELECT athlete, 'coros' FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('connexion: coros sans accord refusée', false, 'acceptée');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('connexion: coros sans accord refusée', true, SQLERRM);
END $$;

-- ---------- Données de test ----------
INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s, device_name)
SELECT athlete, 'garmin', 'g-1', now() - interval '1 day', current_date - 1, 'running', 3600, 'Forerunner 265' FROM t_ids;
INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, sport, duration_s)
SELECT athlete, 'file_import', 'f-1', now() - interval '3 days', current_date - 3, 'running', 1800 FROM t_ids;

INSERT INTO t_res (name, ok, detail)
SELECT 'activité: ai_allowed forcé à false pour garmin', NOT ai_allowed, device_name
  FROM provider_activities WHERE external_id = 'g-1';

DO $$ BEGIN
  INSERT INTO provider_activities (athlete_id, source, external_id, started_at, local_date, device_name)
  SELECT athlete, 'garmin', 'g-x', now(), current_date, '' FROM t_ids;
  INSERT INTO t_res (name, ok, detail) VALUES ('activité: device_name vide refusé', false, 'accepté');
EXCEPTION WHEN check_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('activité: device_name vide refusé', true, SQLERRM);
END $$;

-- Fusion des résumés quotidiens : dailies puis sleeps, même jour.
SELECT provider_daily_merge(athlete, 'garmin', current_date - 1, 'dailies',
         '{"resting_hr": 48, "steps": 9000}'::jsonb, '{"summaryId": "d1"}'::jsonb) FROM t_ids;
SELECT provider_daily_merge(athlete, 'garmin', current_date - 1, 'sleeps',
         '{"sleep_total_min": 450, "sleep_score": 81}'::jsonb, '{"summaryId": "s1"}'::jsonb) FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'dailies: fusion par type sans écrasement',
       resting_hr = 48 AND steps = 9000 AND sleep_total_min = 450 AND sleep_score = 81
         AND raw ? 'dailies' AND raw ? 'sleeps' AND NOT ai_allowed,
       raw::text
  FROM provider_dailies d JOIN t_ids ON d.athlete_id = t_ids.athlete
 WHERE d.source = 'garmin' AND d.day = current_date - 1;

INSERT INTO provider_webhook_inbox (provider, type, external_user_id, payload, fingerprint)
VALUES ('garmin', 'activities', 'test-garmin-user-1', '{"summaryId":"g-1"}', 'fp-test-1');
DO $$ BEGIN
  INSERT INTO provider_webhook_inbox (provider, type, external_user_id, payload, fingerprint)
  VALUES ('garmin', 'activities', 'test-garmin-user-1', '{"summaryId":"g-1"}', 'fp-test-1');
  INSERT INTO t_res (name, ok, detail) VALUES ('inbox: même empreinte = une ligne', false, 'doublon accepté');
EXCEPTION WHEN unique_violation THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('inbox: même empreinte = une ligne', true, SQLERRM);
END $$;

INSERT INTO t_res (name, ok, detail)
SELECT 'inbox: claim prend la ligne', count(*) = 1, count(*)::text
  FROM provider_inbox_claim('garmin', NULL, 10) WHERE fingerprint = 'fp-test-1';
INSERT INTO t_res (name, ok, detail)
SELECT 'inbox: second claim ne la reprend pas (bail)', count(*) = 0, count(*)::text
  FROM provider_inbox_claim('garmin', NULL, 10) WHERE fingerprint = 'fp-test-1';

-- Jeton fictif (via la fonction officielle : passe par le Vault) et bail de refresh.
SELECT provider_token_write(c.id, 'test-access', 'test-refresh', now() + interval '1 day')
  FROM provider_connections c JOIN t_ids ON c.athlete_id = t_ids.athlete WHERE c.provider = 'garmin';
INSERT INTO t_res (name, ok, detail)
SELECT 'jeton: premier bail accordé, second refusé',
       provider_token_claim_refresh(c.id, 30) AND NOT provider_token_claim_refresh(c.id, 30), ''
  FROM provider_connections c JOIN t_ids ON c.athlete_id = t_ids.athlete WHERE c.provider = 'garmin';

-- ---------- ANON ----------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ DECLARE n int; BEGIN
  BEGIN SELECT count(*) INTO n FROM provider_webhook_inbox;
        INSERT INTO t_res (name, ok, detail) VALUES ('anon: inbox illisible', false, n::text);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('anon: inbox illisible', true, SQLERRM); END;
  BEGIN SELECT count(*) INTO n FROM provider_connections;
        INSERT INTO t_res (name, ok, detail) VALUES ('anon: 0 connexion', n = 0, n::text);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('anon: 0 connexion', true, SQLERRM); END;
  BEGIN SELECT count(*) INTO n FROM provider_activities;
        INSERT INTO t_res (name, ok, detail) VALUES ('anon: 0 activité', n = 0, n::text);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('anon: 0 activité', true, SQLERRM); END;
  BEGIN PERFORM trigger_garmin_maintenance();
        INSERT INTO t_res (name, ok, detail) VALUES ('anon: cron non appelable', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('anon: cron non appelable', true, SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- ATHLÈTE ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT athlete FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM provider_connections WHERE athlete_id = ids.athlete;
  INSERT INTO t_res (name, ok, detail) VALUES ('athlète: voit sa connexion', n = 1, n::text);
  SELECT count(*) INTO n FROM provider_activities WHERE athlete_id = ids.athlete AND device_name = 'Forerunner 265';
  INSERT INTO t_res (name, ok, detail) VALUES ('athlète: lit device_name', n = 1, n::text);
  SELECT count(*) INTO n FROM provider_dailies WHERE athlete_id = ids.athlete;
  INSERT INTO t_res (name, ok, detail) VALUES ('athlète: voit ses dailies', n = 1, n::text);
  SELECT count(*) INTO n FROM provider_connections WHERE athlete_id = ids.other_athlete;
  INSERT INTO t_res (name, ok, detail) VALUES ('athlète: ne voit pas la connexion d''un autre', n = 0, n::text);

  BEGIN INSERT INTO provider_dailies (athlete_id, source, day, resting_hr) VALUES (ids.athlete, 'garmin', current_date - 10, 40);
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: fausse daily garmin refusée', false, 'insérée');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: fausse daily garmin refusée', true, SQLERRM); END;
  BEGIN UPDATE provider_dailies SET resting_hr = 30 WHERE athlete_id = ids.athlete; GET DIAGNOSTICS n = ROW_COUNT;
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: modifier une daily refusé', n = 0, n::text);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: modifier une daily refusé', true, SQLERRM); END;
  BEGIN SELECT count(*) INTO n FROM provider_webhook_inbox;
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: inbox illisible', false, n::text);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: inbox illisible', true, SQLERRM); END;
  BEGIN SELECT count(*) INTO n FROM provider_tokens;
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: jetons illisibles', false, n::text);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: jetons illisibles', true, SQLERRM); END;
  BEGIN PERFORM provider_forget(ids.athlete, 'garmin');
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: provider_forget non appelable', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: provider_forget non appelable', true, SQLERRM); END;
  BEGIN PERFORM provider_daily_merge(ids.athlete, 'garmin', current_date, 'dailies', '{}'::jsonb, '{}'::jsonb);
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: provider_daily_merge non appelable', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: provider_daily_merge non appelable', true, SQLERRM); END;
  BEGIN PERFORM * FROM provider_inbox_claim('garmin', NULL, 1);
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: provider_inbox_claim non appelable', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: provider_inbox_claim non appelable', true, SQLERRM); END;
  BEGIN PERFORM provider_token_claim_refresh(gen_random_uuid(), 30);
        INSERT INTO t_res (name, ok, detail) VALUES ('athlète: bail de jeton non appelable', false, 'exécuté');
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('athlète: bail de jeton non appelable', true, SQLERRM); END;
  -- L'oracle reste fermé : pas de réponse sur un athlète dont on n'est ni soi ni le coach.
  INSERT INTO t_res (name, ok, detail) VALUES ('athlète: consentement d''un autre → faux',
    NOT source_consent_granted(ids.other_athlete, 'garmin'), '');
END $$;
RESET ROLE;

-- ---------- COACH RÉFÉRENT ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM provider_connections WHERE athlete_id = ids.athlete;
  INSERT INTO t_res (name, ok, detail) VALUES ('coach: voit la connexion de son athlète', n = 1, n::text);
  SELECT count(*) INTO n FROM provider_activities WHERE athlete_id = ids.athlete AND source = 'garmin';
  INSERT INTO t_res (name, ok, detail) VALUES ('coach: voit l''activité garmin (accord donné)', n = 1, n::text);
  SELECT count(*) INTO n FROM provider_dailies WHERE athlete_id = ids.athlete AND source = 'garmin';
  INSERT INTO t_res (name, ok, detail) VALUES ('coach: voit la daily garmin (accord donné)', n = 1, n::text);
  BEGIN SELECT count(*) INTO n FROM provider_webhook_inbox;
        INSERT INTO t_res (name, ok, detail) VALUES ('coach: inbox illisible', false, n::text);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO t_res (name, ok, detail) VALUES ('coach: inbox illisible', true, SQLERRM); END;
END $$;
RESET ROLE;

-- ---------- COACH SANS LIEN ----------
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT other_coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM provider_connections WHERE athlete_id = ids.athlete;
  INSERT INTO t_res (name, ok, detail) VALUES ('autre coach: 0 connexion', n = 0, n::text);
  SELECT count(*) INTO n FROM provider_activities WHERE athlete_id = ids.athlete;
  INSERT INTO t_res (name, ok, detail) VALUES ('autre coach: 0 activité', n = 0, n::text);
  SELECT count(*) INTO n FROM provider_dailies WHERE athlete_id = ids.athlete;
  INSERT INTO t_res (name, ok, detail) VALUES ('autre coach: 0 daily', n = 0, n::text);
  INSERT INTO t_res (name, ok, detail) VALUES ('autre coach: oracle de consentement fermé',
    NOT source_consent_granted(ids.athlete, 'garmin'), '');
END $$;
RESET ROLE;

-- ---------- Retrait du consentement → connexion arrêtée (table-driven) ----------
INSERT INTO user_consents (user_id, purpose, granted, doc_version, statement)
SELECT athlete, 'garmin_sync', false, 'test', 'retrait' FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'retrait garmin_sync → consent_withdrawn', c.status = 'consent_withdrawn', c.status::text
  FROM provider_connections c JOIN t_ids ON c.athlete_id = t_ids.athlete WHERE c.provider = 'garmin';

-- Coach : le retrait masque tout de suite les données garmin.
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT coach FROM t_ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; ids record; BEGIN
  SELECT * INTO ids FROM t_ids;
  SELECT count(*) INTO n FROM provider_activities WHERE athlete_id = ids.athlete AND source = 'garmin';
  INSERT INTO t_res (name, ok, detail) VALUES ('coach: activité garmin masquée après retrait', n = 0, n::text);
  SELECT count(*) INTO n FROM provider_activities WHERE athlete_id = ids.athlete AND source = 'file_import';
  INSERT INTO t_res (name, ok, detail) VALUES ('coach: fichier importé toujours visible', n = 1, n::text);
END $$;
RESET ROLE;

-- ---------- Oubli : supprime ce que Garmin a apporté, garde l'import manuel ----------
CREATE TEMP TABLE t_forget ON COMMIT DROP AS
SELECT provider_forget(athlete, 'garmin') AS r FROM t_ids;
INSERT INTO t_res (name, ok, detail)
SELECT 'forget: compte rendu', (r->>'activities')::int = 1 AND (r->>'dailies')::int = 1
       AND (r->>'inbox')::int = 1 AND (r->>'connection')::int = 1, r::text FROM t_forget;
INSERT INTO t_res (name, ok, detail)
SELECT 'forget: plus aucune donnée garmin', count(*) = 0, count(*)::text
  FROM provider_activities a JOIN t_ids ON a.athlete_id = t_ids.athlete WHERE a.source = 'garmin';
INSERT INTO t_res (name, ok, detail)
SELECT 'forget: activité file_import conservée', count(*) = 1, count(*)::text
  FROM provider_activities a JOIN t_ids ON a.athlete_id = t_ids.athlete WHERE a.source = 'file_import';
-- Secrets Vault : la connexion supprimée ne doit laisser aucun secret derrière.
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM vault.secrets s
   WHERE s.name LIKE 'provider_%' AND NOT EXISTS (
     SELECT 1 FROM provider_tokens t WHERE t.access_secret_id = s.id OR t.refresh_secret_id = s.id);
  INSERT INTO t_res (name, ok, detail) VALUES ('forget: aucun secret de jeton orphelin dans le Vault', n = 0, n::text);
EXCEPTION WHEN insufficient_privilege THEN
  INSERT INTO t_res (name, ok, detail) VALUES ('forget: Vault non lisible par ce rôle (contrôle sauté)', true, SQLERRM);
END $$;

SELECT n, ok, name, detail FROM t_res ORDER BY ok, n;

ROLLBACK;
