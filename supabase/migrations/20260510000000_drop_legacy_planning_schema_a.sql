-- ============================================================
-- Migration : Suppression Schéma A (seasons + planning_blocks) — NEUTRALISÉE
--
-- Écrite le 2026-05-10 mais jamais appliquée en prod : `seasons`, `planning_blocks`,
-- `competitions.planning_block_id` / `season_id` et `test_sessions.planning_block_id`
-- y existent toujours (vides). Pour que l'historique se rejoue à l'identique de la
-- prod (décision 7, R2), le fichier ne fait plus rien.
--
-- La suppression est reprise par P18 (docs/PLAN_LEGACY.md §2.4), dans une nouvelle
-- migration, après le déploiement sur main d'un client qui ne lit plus `seasons`.
--
-- Contenu d'origine, pour mémoire :
--   ALTER TABLE public.competitions DROP COLUMN IF EXISTS planning_block_id, DROP COLUMN IF EXISTS season_id;
--   ALTER TABLE public.test_sessions DROP COLUMN IF EXISTS planning_block_id;
--   DROP TABLE IF EXISTS public.planning_blocks CASCADE;
--   DROP TABLE IF EXISTS public.seasons CASCADE;
-- ============================================================

SELECT 1;
