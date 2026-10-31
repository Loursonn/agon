-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : Tests HYROX (bilan d'entrée et retests)
-- 2026-11-01 · Prompt de Hugo du 31/10/2026 · PR 2/6
--
--   1. profiles.hyrox_category (Open / Pro : charges de course)
--   2. Batterie v3 : 21 presets test_definitions (catégorie hyrox), groupés par
--      séance (S1 à S5 + W1 = semaine 1). Les 10 anciens presets HYROX restent,
--      marqués battery = 'hyrox_legacy' (masqués par défaut dans la partie Tests).
--   3. Versions de grilles : hyrox_test_grid_versions, hyrox_test_grids,
--      hyrox_test_params, hyrox_axes_params, hyrox_work_axes_rules.
--      Lecture pour tout utilisateur authentifié, écriture admin seulement.
--   4. hyrox_test_analyses : une analyse = un snapshot figé (entrées brutes,
--      profil, sorties, algo_version, grid_version). Un recalcul crée une
--      nouvelle ligne (recalculated_from), jamais d'écrasement.
--   5. hyrox_test_axes_drafts : proposition d'axes de travail et contexte de
--      l'athlète (cas types, douleur, envie). Coach et admin seulement.
--   6. hyrox_results : rangs et top % Roxzone pour la méthode Roxzone.
--   7. Seed v1 = GRID_SET_V1 (src/lib/hyrox/tests/params.ts), généré par
--      seedSql() : ne pas éditer à la main (un test le vérifie).
--
-- Visibilité : l'athlète ne lit une analyse qu'une fois validée par son coach
-- (validated_at), et ne lit jamais le brouillon d'axes.
-- Staff : hyrox_test_analyses et hyrox_test_axes_drafts sont hors staff en V1,
-- comme les autres tables HYROX (cf. 20261031121000_staff_policies.sql).
-- Les tables de grilles ne sont liées à aucun athlète.
--
-- Rien en production sans l'accord de Hugo.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Catégorie HYROX au profil ─────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hyrox_category text CHECK (hyrox_category IN ('open', 'pro'));

COMMENT ON COLUMN public.profiles.hyrox_category IS
  'Catégorie HYROX de l''athlète (open / pro) : fixe les charges de course des tests (sleds, wall balls).';

-- ── 2. Batterie v3 ───────────────────────────────────────────────────────────

ALTER TABLE public.test_definitions
  ADD COLUMN IF NOT EXISTS battery         text,
  ADD COLUMN IF NOT EXISTS battery_session text,
  ADD COLUMN IF NOT EXISTS battery_order   integer;

COMMENT ON COLUMN public.test_definitions.battery IS
  'Batterie d''appartenance : hyrox_v3 (bilan HYROX actuel), hyrox_legacy (anciens presets HYROX, masqués par défaut). NULL = hors batterie.';
COMMENT ON COLUMN public.test_definitions.battery_session IS
  'Séance de la batterie : S1 à S5 (semaine de bilan), W1 (semaine 1 d''entraînement).';

UPDATE public.test_definitions
   SET battery = 'hyrox_legacy'
 WHERE battery IS NULL
   AND id IN (
     '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2',
     '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c4',
     '00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000c6',
     '00000000-0000-0000-0000-0000000000c7', '00000000-0000-0000-0000-0000000000c8',
     '00000000-0000-0000-0000-0000000000c9', '00000000-0000-0000-0000-0000000000ca');

INSERT INTO public.test_definitions (id, name, category, kind, is_global, fill_mode, battery, battery_session, battery_order, description, protocol)
VALUES
  -- S1 Sauts, 12 min et 1200 m
  ('00000000-0000-0000-0000-0000000000d1', 'Broad jump', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S1', 1,
   'Saut en longueur sans élan : puissance du bas du corps.',
   jsonb_build_object('text', 'Après l''échauffement (qui finit par quelques sauts). Pieds parallèles derrière la ligne, saut à deux pieds, réception stable. Mesure au talon le plus proche de la ligne. 3 essais, garder le meilleur.', 'video', 'De profil, pieds et réception visibles.')),
  ('00000000-0000-0000-0000-0000000000d2', '3 broad jumps enchaînés', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S1', 2,
   '3 sauts enchaînés sans pause : réactivité, comparée à 3 fois le saut unique.',
   jsonb_build_object('text', '3 broad jumps enchaînés, sans temps d''arrêt entre les sauts. Distance totale de la ligne au talon le plus proche après le 3e saut. 2 essais, garder le meilleur.', 'video', 'De profil, les 3 sauts dans le cadre.')),
  ('00000000-0000-0000-0000-0000000000d3', 'Course 12 min', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S1', 3,
   'Distance maximale en 12 min : point long de la vitesse critique.',
   jsonb_build_object('text', 'Échauffement 20 min. 12 min à fond sur parcours plat mesuré (piste idéale). Noter la distance, la FC moyenne et la FC max (ceinture cardio).', 'video', 'Aucune : capture de la montre.')),
  ('00000000-0000-0000-0000-0000000000d4', 'Course 1200 m', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S1', 4,
   '1200 m à fond : VMA et point court de la vitesse critique.',
   jsonb_build_object('text', '30 min après le 12 min (15 min passive puis 15 min active). 1200 m à fond, même parcours. Noter le temps, la FC moyenne et la FC max.', 'video', 'Aucune : capture de la montre.')),
  -- S2 Force du haut du corps et rameur
  ('00000000-0000-0000-0000-0000000000d5', 'Strict press assis', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S2', 1,
   'Développé militaire assis à la barre, 3 à 5 répétitions maximum.',
   jsonb_build_object('text', 'Assis, dos calé. Montée progressive, puis la charge la plus lourde tenue pour 3 à 5 répétitions propres. Noter la charge et les répétitions.', 'video', 'De profil, la dernière série.')),
  ('00000000-0000-0000-0000-0000000000d6', 'Thruster barre', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S2', 2,
   'Thruster à la barre, 3 à 5 répétitions maximum : comparé au press, utilisation des jambes dans la poussée.',
   jsonb_build_object('text', 'Une seule poussée de jambes par répétition. Fin bras et jambes tendus ; une réception jambes fléchies sous la barre ne compte pas. Charge la plus lourde pour 3 à 5 répétitions. Noter la charge et les répétitions.', 'video', 'De profil, la dernière série.')),
  ('00000000-0000-0000-0000-0000000000d7', 'Rameur 2000 m (damper 4)', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S2', 3,
   '2000 m au rameur, damper 4.',
   jsonb_build_object('text', 'Damper 4, toujours. Départ arrêté, 2000 m à fond. Noter le temps affiché.', 'video', 'Photo de l''écran à l''arrivée.')),
  -- S3 Mobilité, 6 min et robustesse
  ('00000000-0000-0000-0000-0000000000d8', 'Knee-to-wall', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S3', 1,
   'Dorsiflexion de cheville en charge, gauche et droite.',
   jsonb_build_object('text', 'À frais, avant le 6 min. Fente face au mur, genou qui touche le mur, talon au sol. Reculer le pied jusqu''à la distance maximale où le genou touche encore sans décoller le talon. Distance gros orteil - mur, à gauche puis à droite. Noter où se situe la gêne (devant la cheville ou dans le mollet).', 'video', 'De profil, chaque côté.')),
  ('00000000-0000-0000-0000-0000000000d9', 'Course 6 min', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S3', 2,
   'Distance maximale en 6 min : point intermédiaire de la vitesse critique.',
   jsonb_build_object('text', 'Échauffement 20 min. 6 min à fond, même parcours que le 12 min. Noter la distance, la FC moyenne et la FC max.', 'video', 'Aucune : capture de la montre.')),
  ('00000000-0000-0000-0000-0000000000da', 'Montées sur pointe 1 jambe', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S3', 3,
   'Endurance du mollet et du tendon d''Achille, gauche et droite.',
   jsonb_build_object('text', '30 min après le 6 min. Sur une marche, une jambe, genou tendu, amplitude complète, un doigt au mur pour l''équilibre. Répétitions jusqu''à l''échec, rythme régulier. Gauche puis droite.', 'video', 'De profil, chaque côté.')),
  ('00000000-0000-0000-0000-0000000000db', 'Pont fessier 1 jambe', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S3', 4,
   'Endurance de la chaîne postérieure, gauche et droite.',
   jsonb_build_object('text', 'Talon sur une box, l''autre jambe en l''air. Bassin jusqu''à l''extension complète de hanche à chaque répétition, jusqu''à l''échec. Gauche puis droite.', 'video', 'De profil, chaque côté.')),
  ('00000000-0000-0000-0000-0000000000dc', 'Assis-debout 1 jambe', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S3', 5,
   'Force et contrôle du genou sur une jambe, gauche et droite.',
   jsonb_build_object('text', 'Box à hauteur de genou. Se lever et s''asseoir sur une jambe, sans élan ni appui de l''autre pied, jusqu''à l''échec. Gauche puis droite.', 'video', 'De face, chaque côté.')),
  ('00000000-0000-0000-0000-0000000000dd', 'Hop 1 jambe', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S3', 6,
   'Saut en longueur sur une jambe, gauche et droite.',
   jsonb_build_object('text', 'Départ et réception sur la même jambe, réception tenue 2 s. 3 essais par côté, garder le meilleur. Gauche puis droite.', 'video', 'De profil, chaque côté.')),
  -- S4 Sleds, SkiErg et suspension
  ('00000000-0000-0000-0000-0000000000de', 'Sled Push : profil charge-vitesse', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S4', 1,
   '3 passages de 12,5 m à 80, 100 et 120 % de la charge de course : vitesse à charge de course, charge max estimée, réserve de force.',
   jsonb_build_object('text', 'Échauffement : quelques poussées légères. Puis 12,5 m le plus vite possible à 80 %, 100 % et 120 % de la charge de course de sa catégorie (sled compris), 2 min de récupération complète entre les passages. Même sled et même sol au retest. Noter la charge et le temps de chaque passage.', 'video', 'De face ou de profil, départ et arrivée visibles (chrono à la vidéo).')),
  ('00000000-0000-0000-0000-0000000000df', 'Sled Pull : profil charge-vitesse', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S4', 2,
   '3 passages de 12,5 m à 80, 100 et 120 % de la charge de course.',
   jsonb_build_object('text', 'Même protocole que le Sled Push : 12,5 m à 80 %, 100 % et 120 % de la charge de course, 2 min de récupération complète. Noter la charge et le temps de chaque passage.', 'video', 'De profil, départ et arrivée visibles.')),
  ('00000000-0000-0000-0000-0000000000e0', 'SkiErg 2000 m (damper 4)', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S4', 3,
   '2000 m au SkiErg, damper 4.',
   jsonb_build_object('text', 'Damper 4, toujours. Départ arrêté, 2000 m à fond. Noter le temps affiché.', 'video', 'Photo de l''écran à l''arrivée.')),
  ('00000000-0000-0000-0000-0000000000e1', 'Dead hang', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S4', 4,
   'Suspension passive à la barre : grip.',
   jsonb_build_object('text', 'En dernier dans la séance. Barre de traction, prise en pronation largeur d''épaules, bras tendus, suspension passive jusqu''au lâcher. Même barre au retest. Noter le temps.', 'video', 'De face, du départ au lâcher.')),
  -- S5 BBJ et wall balls
  ('00000000-0000-0000-0000-0000000000e2', 'Burpee broad jump 80 m', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S5', 1,
   '80 m de BBJ le plus vite possible, au standard de course.',
   jsonb_build_object('text', '80 m au standard de course. Compter les sauts (longueur moyenne). Noter le temps, le nombre de sauts, l''effort ressenti sur 10 et la FC 1 min après.', 'video', 'De profil, tout le test (no-reps).')),
  ('00000000-0000-0000-0000-0000000000e3', 'Wall balls 5 min', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'S5', 2,
   'Maximum de wall balls en 5 min, charge et cible de sa catégorie.',
   jsonb_build_object('text', 'Charge et cible de sa catégorie (Open H 6 kg / 3,00 m, Open F 4 kg / 2,70 m, Pro H 9 kg / 3,00 m, Pro F 6 kg / 2,70 m). Quelques reps filmées de face à l''échauffement, puis 5 min au maximum. Noter les reps de chaque minute, le total, les no-reps, l''effort ressenti sur 10 et la FC 1 min après.', 'video', 'De profil, tout le test (profondeur, cible).')),
  -- W1 Semaine 1 d'entraînement (protocole à valider par Hugo)
  ('00000000-0000-0000-0000-0000000000e4', 'Sled Push 3 × 50 m', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'W1', 1,
   'Semaine 1 d''entraînement : endurance au Sled Push à charge de course.',
   jsonb_build_object('text', '3 × 50 m à charge de course, 2 min de récupération. Chrono de chaque tronçon de 12,5 m (vidéo). Noter les 12 temps, l''effort ressenti sur 10 et la FC 1 min après. Protocole à valider.', 'video', 'Tout le test, repères des 12,5 m visibles.')),
  ('00000000-0000-0000-0000-0000000000e5', 'Sled Pull 3 × 50 m', 'hyrox', 'preset', true, 'self', 'hyrox_v3', 'W1', 2,
   'Semaine 1 d''entraînement : endurance au Sled Pull à charge de course.',
   jsonb_build_object('text', '3 × 50 m à charge de course, 2 min de récupération. Chrono de chaque tronçon de 12,5 m (vidéo). Noter les 12 temps, l''effort ressenti sur 10 et la FC 1 min après. Protocole à valider.', 'video', 'Tout le test, repères des 12,5 m visibles.'))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.test_variables (test_definition_id, key, label, unit, value_type, better_when) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'best_cm', 'Meilleur saut', 'cm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d2', 'distance_cm', 'Distance des 3 sauts', 'cm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d3', 'distance_m', 'Distance', 'm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d3', 'hr_avg', 'FC moyenne', 'bpm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d3', 'hr_max', 'FC max', 'bpm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d4', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000d4', 'hr_avg', 'FC moyenne', 'bpm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d4', 'hr_max', 'FC max', 'bpm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d5', 'load_kg', 'Charge', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d5', 'reps', 'Répétitions (3 à 5)', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d6', 'load_kg', 'Charge', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d6', 'reps', 'Répétitions (3 à 5)', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d7', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000d8', 'left_cm', 'Gauche', 'cm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d8', 'right_cm', 'Droite', 'cm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d9', 'distance_m', 'Distance', 'm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d9', 'hr_avg', 'FC moyenne', 'bpm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000d9', 'hr_max', 'FC max', 'bpm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000da', 'left_reps', 'Gauche', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000da', 'right_reps', 'Droite', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000db', 'left_reps', 'Gauche', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000db', 'right_reps', 'Droite', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000dc', 'left_reps', 'Gauche', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000dc', 'right_reps', 'Droite', 'n', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000dd', 'left_cm', 'Gauche', 'cm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000dd', 'right_cm', 'Droite', 'cm', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000de', 'load_80', 'Charge 80 %', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000de', 'time_80', 'Temps à 80 %', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000de', 'load_100', 'Charge 100 %', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000de', 'time_100', 'Temps à 100 %', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000de', 'load_120', 'Charge 120 %', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000de', 'time_120', 'Temps à 120 %', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000df', 'load_80', 'Charge 80 %', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000df', 'time_80', 'Temps à 80 %', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000df', 'load_100', 'Charge 100 %', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000df', 'time_100', 'Temps à 100 %', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000df', 'load_120', 'Charge 120 %', 'kg', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000df', 'time_120', 'Temps à 120 %', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000e0', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000e1', 'time', 'Temps', 's', 'duration', 'higher'),
  ('00000000-0000-0000-0000-0000000000e2', 'time', 'Temps', 's', 'duration', 'lower'),
  ('00000000-0000-0000-0000-0000000000e2', 'jumps', 'Sauts', 'n', 'number', 'lower'),
  ('00000000-0000-0000-0000-0000000000e2', 'rpe', 'Effort ressenti', '/10', 'number', 'lower'),
  ('00000000-0000-0000-0000-0000000000e2', 'hr_1min', 'FC 1 min après', 'bpm', 'number', 'lower'),
  ('00000000-0000-0000-0000-0000000000e3', 'min_1', 'Minute 1', 'reps', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000e3', 'min_2', 'Minute 2', 'reps', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000e3', 'min_3', 'Minute 3', 'reps', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000e3', 'min_4', 'Minute 4', 'reps', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000e3', 'min_5', 'Minute 5', 'reps', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000e3', 'total', 'Total', 'reps', 'number', 'higher'),
  ('00000000-0000-0000-0000-0000000000e3', 'no_reps', 'No-reps', 'n', 'number', 'lower'),
  ('00000000-0000-0000-0000-0000000000e3', 'rpe', 'Effort ressenti', '/10', 'number', 'lower'),
  ('00000000-0000-0000-0000-0000000000e3', 'hr_1min', 'FC 1 min après', 'bpm', 'number', 'lower')
ON CONFLICT (test_definition_id, key) DO NOTHING;

-- Semaine 1 : 3 répétitions × 4 tronçons de 12,5 m, Push et Pull
INSERT INTO public.test_variables (test_definition_id, key, label, unit, value_type, better_when)
SELECT d.id, format('r%s_t%s', r, t), format('Rép. %s · tronçon %s', r, t), 's', 'duration', 'lower'
  FROM (VALUES ('00000000-0000-0000-0000-0000000000e4'::uuid), ('00000000-0000-0000-0000-0000000000e5'::uuid)) AS d(id),
       generate_series(1, 3) AS r, generate_series(1, 4) AS t
ON CONFLICT (test_definition_id, key) DO NOTHING;

INSERT INTO public.test_variables (test_definition_id, key, label, unit, value_type, better_when)
SELECT d.id, v.key, v.label, v.unit, 'number', 'lower'
  FROM (VALUES ('00000000-0000-0000-0000-0000000000e4'::uuid), ('00000000-0000-0000-0000-0000000000e5'::uuid)) AS d(id),
       (VALUES ('rpe', 'Effort ressenti', '/10'), ('hr_1min', 'FC 1 min après', 'bpm')) AS v(key, label, unit)
ON CONFLICT (test_definition_id, key) DO NOTHING;

-- ── 3. Versions de grilles et paramètres ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_test_grid_versions (
  version    text PRIMARY KEY,
  active     boolean NOT NULL DEFAULT false,
  notes      text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.hyrox_test_grid_versions IS
  'Une version = un jeu complet (grilles, paramètres course, paramètres d''axes, règles). Une seule version active : celle des nouvelles analyses.';
CREATE UNIQUE INDEX IF NOT EXISTS hyrox_test_grid_versions_one_active
  ON public.hyrox_test_grid_versions ((true)) WHERE active;

CREATE TABLE IF NOT EXISTS public.hyrox_test_grids (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version    text NOT NULL REFERENCES public.hyrox_test_grid_versions(version) ON UPDATE CASCADE,
  metric_key text NOT NULL,
  axis       text NOT NULL CHECK (axis IN ('cardio','seuils','ergos','force','endf','puissance','grip','robustesse')),
  sex        text CHECK (sex IN ('H','F')),
  category   text CHECK (category IN ('Open','Pro')),
  thresholds numeric[] NOT NULL CHECK (array_length(thresholds, 1) = 4),
  direction  text NOT NULL CHECK (direction IN ('higher','lower')),
  source     text NOT NULL CHECK (source IN ('publiée','calée chrono','ma méthode','méthode vitesse critique / Riegel')),
  weight     numeric NOT NULL DEFAULT 1 CHECK (weight >= 0),
  active     boolean NOT NULL DEFAULT true,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.hyrox_test_grids IS
  'Grilles de notes 1 à 5 : 4 bornes par mesure. sex / category NULL = tous.';
CREATE UNIQUE INDEX IF NOT EXISTS hyrox_test_grids_unique
  ON public.hyrox_test_grids (version, metric_key, coalesce(sex, '*'), coalesce(category, '*'));

CREATE TABLE IF NOT EXISTS public.hyrox_test_params (
  version    text NOT NULL REFERENCES public.hyrox_test_grid_versions(version) ON UPDATE CASCADE,
  scope      text NOT NULL CHECK (scope IN ('scoring','running')),
  params     jsonb NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (version, scope)
);
COMMENT ON TABLE public.hyrox_test_params IS
  'Paramètres versionnés : scoring (VMA, Cooper, 1RM, plafonds robustesse) et running (coefficients du seuil 1, bornes des zones, FC seuil, profil, % VC).';

CREATE TABLE IF NOT EXISTS public.hyrox_axes_params (
  version    text PRIMARY KEY REFERENCES public.hyrox_test_grid_versions(version) ON UPDATE CASCADE,
  params     jsonb NOT NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.hyrox_axes_params IS
  'Paramètres du plan de bloc : seuils de gain (gros / moyen), décalage par la note, niveaux aux stations, prépa courte, âge, Roxzone.';

CREATE TABLE IF NOT EXISTS public.hyrox_work_axes_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version        text NOT NULL REFERENCES public.hyrox_test_grid_versions(version) ON UPDATE CASCADE,
  rule_key       text NOT NULL,
  step           text NOT NULL CHECK (step IN ('sécurité','course','stations')),
  group_name     text NOT NULL,
  metric_key     text,
  condition      jsonb NOT NULL,
  axis           text NOT NULL,
  means          text NOT NULL,
  rationale      text NOT NULL,
  to_recalibrate boolean NOT NULL DEFAULT false,
  active         boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, rule_key)
);
COMMENT ON TABLE public.hyrox_work_axes_rules IS
  'Règles d''axes de travail validées par Hugo le 31/10/2026. condition : {metric, op, value} ou {all|any: [...]} ; value peut être {H, F}. to_recalibrate = seuil sans source.';

-- RLS : lecture authentifiée, écriture admin.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hyrox_test_grid_versions','hyrox_test_grids','hyrox_test_params','hyrox_axes_params','hyrox_work_axes_rules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))', t || '_delete', t);
  END LOOP;
END $$;

-- ── 4. Analyses ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_test_analyses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind              text NOT NULL CHECK (kind IN ('bilan','retest')),
  date              date NOT NULL,
  -- Résultats de tests d'origine (athlete_test_results). Pas de clé étrangère :
  -- un résultat ressaisi est remplacé, l'analyse garde son snapshot (inputs).
  source_result_ids uuid[] NOT NULL DEFAULT '{}',
  inputs            jsonb NOT NULL,
  profile           jsonb NOT NULL,
  outputs           jsonb NOT NULL,
  algo_version      text NOT NULL,
  grid_version      text NOT NULL REFERENCES public.hyrox_test_grid_versions(version) ON UPDATE CASCADE,
  target_s          integer CHECK (target_s > 0),
  axes_validated    jsonb,
  validated_at      timestamptz,
  validated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recalculated_from uuid REFERENCES public.hyrox_test_analyses(id) ON DELETE SET NULL,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (validated_at IS NULL OR axes_validated IS NOT NULL)
);
COMMENT ON TABLE public.hyrox_test_analyses IS
  'Analyse d''un bilan ou d''un retest HYROX. inputs / profile / outputs / versions figés à la création ; recalculer = nouvelle ligne. Visible par l''athlète seulement après validation du coach.';

CREATE INDEX IF NOT EXISTS idx_hyrox_test_analyses_athlete_date ON public.hyrox_test_analyses (athlete_id, date DESC);

DROP TRIGGER IF EXISTS trg_hyrox_test_analyses_updated_at ON public.hyrox_test_analyses;
CREATE TRIGGER trg_hyrox_test_analyses_updated_at
  BEFORE UPDATE ON public.hyrox_test_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Snapshot figé : seuls la validation, le chrono visé et les axes validés bougent.
CREATE OR REPLACE FUNCTION public.hyrox_test_analyses_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.athlete_id        IS DISTINCT FROM OLD.athlete_id
  OR NEW.kind              IS DISTINCT FROM OLD.kind
  OR NEW.date              IS DISTINCT FROM OLD.date
  OR NEW.source_result_ids IS DISTINCT FROM OLD.source_result_ids
  OR NEW.inputs            IS DISTINCT FROM OLD.inputs
  OR NEW.profile           IS DISTINCT FROM OLD.profile
  OR NEW.outputs           IS DISTINCT FROM OLD.outputs
  OR NEW.algo_version      IS DISTINCT FROM OLD.algo_version
  OR NEW.grid_version      IS DISTINCT FROM OLD.grid_version
  OR NEW.recalculated_from IS DISTINCT FROM OLD.recalculated_from THEN
    RAISE EXCEPTION 'hyrox_test_analyses : analyse figée, recalculer crée une nouvelle analyse';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hyrox_test_analyses_freeze ON public.hyrox_test_analyses;
CREATE TRIGGER trg_hyrox_test_analyses_freeze
  BEFORE UPDATE ON public.hyrox_test_analyses
  FOR EACH ROW EXECUTE FUNCTION public.hyrox_test_analyses_freeze();

ALTER TABLE public.hyrox_test_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hta_select" ON public.hyrox_test_analyses;
CREATE POLICY "hta_select" ON public.hyrox_test_analyses FOR SELECT
  USING ((athlete_id = auth.uid() AND validated_at IS NOT NULL)
    OR public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hta_insert" ON public.hyrox_test_analyses;
CREATE POLICY "hta_insert" ON public.hyrox_test_analyses FOR INSERT
  WITH CHECK (public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hta_update" ON public.hyrox_test_analyses;
CREATE POLICY "hta_update" ON public.hyrox_test_analyses FOR UPDATE
  USING (public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

DROP POLICY IF EXISTS "hta_delete" ON public.hyrox_test_analyses;
CREATE POLICY "hta_delete" ON public.hyrox_test_analyses FOR DELETE
  USING (public.is_coach_of(athlete_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin));

-- ── 5. Brouillon d'axes de travail (coach seulement) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.hyrox_test_axes_drafts (
  analysis_id uuid PRIMARY KEY REFERENCES public.hyrox_test_analyses(id) ON DELETE CASCADE,
  context     jsonb NOT NULL DEFAULT '{}'::jsonb,
  axes_plan   jsonb,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.hyrox_test_axes_drafts IS
  'Proposition du moteur et contexte de l''athlète (compétition, cas types, douleur, envie, Roxzone). Jamais visible par l''athlète : il ne voit que hyrox_test_analyses.axes_validated.';

DROP TRIGGER IF EXISTS trg_hyrox_test_axes_drafts_updated_at ON public.hyrox_test_axes_drafts;
CREATE TRIGGER trg_hyrox_test_axes_drafts_updated_at
  BEFORE UPDATE ON public.hyrox_test_axes_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.hyrox_test_axes_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "htad_all" ON public.hyrox_test_axes_drafts;
CREATE POLICY "htad_all" ON public.hyrox_test_axes_drafts FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.hyrox_test_analyses a
     WHERE a.id = hyrox_test_axes_drafts.analysis_id
       AND (public.is_coach_of(a.athlete_id)
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.hyrox_test_analyses a
     WHERE a.id = hyrox_test_axes_drafts.analysis_id
       AND (public.is_coach_of(a.athlete_id)
         OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin))));

-- ── 6. Roxzone sur les courses (méthode validée par Hugo le 31/10/2026) ──────
-- Les courses vivent déjà dans hyrox_results (8 runs, 8 stations, Roxzone, rang
-- et participants) : on y ajoute ce qui manque plutôt qu'une table parallèle.

ALTER TABLE public.hyrox_results
  ADD COLUMN IF NOT EXISTS top_pct_overall numeric(5,2) CHECK (top_pct_overall BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS roxzone_rank    integer CHECK (roxzone_rank > 0),
  ADD COLUMN IF NOT EXISTS roxzone_top_pct numeric(5,2) CHECK (roxzone_top_pct BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS roxzone_cause   text CHECK (roxzone_cause IN ('marche','orga','site'));

COMMENT ON COLUMN public.hyrox_results.top_pct_overall IS 'Top % au classement final de cette course (sinon déduit de rank_overall / participants_overall).';
COMMENT ON COLUMN public.hyrox_results.roxzone_top_pct IS 'Top % en Roxzone dans la même course. Perte réelle si ≥ 15 points sous le top % final et Roxzone > 110 % du run moyen (runs 2-7).';
COMMENT ON COLUMN public.hyrox_results.roxzone_cause IS 'Cause d''une perte en Roxzone : marche (après les stations), orga (transitions), site (grand site).';

-- ── 7. Seed v1 ───────────────────────────────────────────────────────────────
-- BEGIN SEED v1 (généré par seedSql(gridSetToRows(GRID_SET_V1)), ne pas éditer)
INSERT INTO public.hyrox_test_grid_versions (version, active, notes) VALUES ('v1', true, 'Seed v1 : grilles, poids et règles du radar bilan YOXX du 31/10/2026.')
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.hyrox_test_grids (version, metric_key, axis, sex, category, thresholds, direction, source, weight, active, notes) VALUES
  ('v1', 'vma', 'cardio', 'H', NULL, ARRAY[11.8, 13.6, 16.1, 18.5]::numeric[], 'higher', 'calée chrono', 0.7, true, NULL),
  ('v1', 'vma', 'cardio', 'F', NULL, ARRAY[11.6, 13.4, 16, 18.3]::numeric[], 'higher', 'calée chrono', 0.7, true, NULL),
  ('v1', 'cooper', 'cardio', 'H', NULL, ARRAY[2170, 2500, 2960, 3400]::numeric[], 'higher', 'calée chrono', 0.3, true, NULL),
  ('v1', 'cooper', 'cardio', 'F', NULL, ARRAY[2130, 2470, 2940, 3370]::numeric[], 'higher', 'calée chrono', 0.3, true, NULL),
  ('v1', 'cs', 'seuils', 'H', NULL, ARRAY[10.4, 12, 14.2, 16.3]::numeric[], 'higher', 'calée chrono', 0.6, true, NULL),
  ('v1', 'cs', 'seuils', 'F', NULL, ARRAY[10.2, 11.8, 14.1, 16.1]::numeric[], 'higher', 'calée chrono', 0.6, true, NULL),
  ('v1', 'cs_vma', 'seuils', NULL, NULL, ARRAY[0.82, 0.85, 0.88, 0.91]::numeric[], 'higher', 'ma méthode', 0.4, true, NULL),
  ('v1', 'row_2000', 'ergos', 'H', NULL, ARRAY[500, 480, 455, 430]::numeric[], 'lower', 'ma méthode', 0.5, true, NULL),
  ('v1', 'row_2000', 'ergos', 'F', NULL, ARRAY[580, 555, 525, 495]::numeric[], 'lower', 'ma méthode', 0.5, true, NULL),
  ('v1', 'ski_2000', 'ergos', 'H', NULL, ARRAY[560, 520, 480, 450]::numeric[], 'lower', 'ma méthode', 0.5, true, NULL),
  ('v1', 'ski_2000', 'ergos', 'F', NULL, ARRAY[645, 600, 555, 520]::numeric[], 'lower', 'ma méthode', 0.5, true, NULL),
  ('v1', 'press_rel', 'force', 'H', NULL, ARRAY[0.5, 0.6, 0.75, 0.9]::numeric[], 'higher', 'ma méthode', 0.5, true, NULL),
  ('v1', 'press_rel', 'force', 'F', NULL, ARRAY[0.3, 0.4, 0.5, 0.65]::numeric[], 'higher', 'ma méthode', 0.5, true, NULL),
  ('v1', 'thruster_rel', 'force', 'H', NULL, ARRAY[0.7, 0.85, 1, 1.15]::numeric[], 'higher', 'ma méthode', 0.5, true, NULL),
  ('v1', 'thruster_rel', 'force', 'F', NULL, ARRAY[0.5, 0.63, 0.75, 0.9]::numeric[], 'higher', 'ma méthode', 0.5, true, NULL),
  ('v1', 'wall_balls', 'endf', NULL, NULL, ARRAY[60, 80, 100, 120]::numeric[], 'higher', 'ma méthode', 0.35, true, NULL),
  ('v1', 'sled_push_reserve', 'endf', NULL, NULL, ARRAY[0.855, 0.755, 0.655, 0.555]::numeric[], 'lower', 'ma méthode', 0.175, true, 'À recaler : L0 surestime la charge max réelle.'),
  ('v1', 'sled_pull_reserve', 'endf', NULL, NULL, ARRAY[0.855, 0.755, 0.655, 0.555]::numeric[], 'lower', 'ma méthode', 0.175, true, 'À recaler : L0 surestime la charge max réelle.'),
  ('v1', 'bbj_80', 'endf', 'H', NULL, ARRAY[330, 270, 225, 180]::numeric[], 'lower', 'ma méthode', 0.3, true, NULL),
  ('v1', 'bbj_80', 'endf', 'F', NULL, ARRAY[375, 315, 265, 220]::numeric[], 'lower', 'ma méthode', 0.3, true, NULL),
  ('v1', 'broad_jump', 'puissance', 'H', NULL, ARRAY[190, 215, 240, 265]::numeric[], 'higher', 'ma méthode', 0.5, true, NULL),
  ('v1', 'broad_jump', 'puissance', 'F', NULL, ARRAY[145, 165, 185, 205]::numeric[], 'higher', 'ma méthode', 0.5, true, NULL),
  ('v1', 'triple_ratio', 'puissance', NULL, NULL, ARRAY[0.8, 0.85, 0.9, 0.95]::numeric[], 'higher', 'ma méthode', 0.25, true, NULL),
  ('v1', 'hop_height', 'puissance', 'H', NULL, ARRAY[0.7, 0.8, 0.9, 1]::numeric[], 'higher', 'ma méthode', 0.25, true, NULL),
  ('v1', 'hop_height', 'puissance', 'F', NULL, ARRAY[0.55, 0.65, 0.75, 0.85]::numeric[], 'higher', 'ma méthode', 0.25, true, NULL),
  ('v1', 'dead_hang', 'grip', 'H', NULL, ARRAY[30, 60, 90, 120]::numeric[], 'higher', 'ma méthode', 1, true, NULL),
  ('v1', 'dead_hang', 'grip', 'F', NULL, ARRAY[20, 45, 75, 105]::numeric[], 'higher', 'ma méthode', 1, true, NULL),
  ('v1', 'calf_raise', 'robustesse', 'H', NULL, ARRAY[18, 23, 30, 38]::numeric[], 'higher', 'publiée', 1, true, NULL),
  ('v1', 'calf_raise', 'robustesse', 'F', NULL, ARRAY[15, 20, 27, 35]::numeric[], 'higher', 'publiée', 1, true, NULL),
  ('v1', 'knee_to_wall', 'robustesse', NULL, NULL, ARRAY[6, 8, 11, 13]::numeric[], 'higher', 'publiée', 1, true, NULL),
  ('v1', 'bridge', 'robustesse', NULL, NULL, ARRAY[15, 20, 28, 35]::numeric[], 'higher', 'publiée', 1, true, NULL),
  ('v1', 'sit_to_stand', 'robustesse', NULL, NULL, ARRAY[5, 10, 15, 25]::numeric[], 'higher', 'ma méthode', 1, true, NULL)
ON CONFLICT DO NOTHING;

INSERT INTO public.hyrox_test_params (version, scope, params) VALUES
  ('v1', 'scoring', '{"vma_from_1200_factor":0.906,"cooper_age_adjust":{"from_age":40,"base_age":30,"per_decade_m":100},"one_rm":{"num":36,"den":37,"max_reps":6},"robustness_caps":{"asymmetry_below":0.85,"asymmetry_cap":2.5,"ktw_below_cm":8,"ktw_cap":2.5,"note1_cap":2,"ktw_diff_flag_cm":2},"thruster_press_expected":[1.3,1.6],"thruster_press_flags":[1.2,1.7]}'::jsonb),
  ('v1', 'running', '{"s1_factor":{"below_090":0.82,"from_090_to_093":0.84,"above_093":0.85},"s1_e_bounds":[0.9,0.93],"zone_shift":0.03,"zone_shift_from_e":0.9,"zone_bounds":{"z1_low":0.6,"z1_z2":0.7,"z3_z4":0.88,"z4_z5":0.96,"z5_z6":1.05},"chr_factor":0.98,"hr_zone_bounds":[0.85,0.9,0.95,1],"hr_z1_max":0.85,"profile_e":0.85,"profile_vmax_kmh":27,"profile_vmax_intermittent_kmh":28,"e_reading_cut":0.9,"min_abs_e_minus_1":0.01,"pct_vc_table":[1.3,1.25,1.2,1.15,1.1,1.05,1,0.95,0.9,0.85,0.8]}'::jsonb)
ON CONFLICT (version, scope) DO NOTHING;

INSERT INTO public.hyrox_axes_params (version, params) VALUES
  ('v1', '{"gain_big":0.075,"gain_medium":0.033,"note_up":2,"note_down":4,"target_margin_s":60,"shift_s":600,"stations_strong":3.75,"stations_weak":2.25,"standard_dprime_m":150,"short_prep_weeks":8,"older_age":45,"rox_points":15,"rox_ratio":1.1}'::jsonb)
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.hyrox_work_axes_rules (version, rule_key, step, group_name, metric_key, condition, axis, means, rationale, to_recalibrate, active, sort_order) VALUES
  ('v1', 'sec_asym', 'sécurité', 'robustesse', 'lsi.min', '{"metric":"lsi.min","op":"<","value":0.85}'::jsonb, 'Robustesse', 'Unilatéral côté faible', 'Asymétrie sur 1 jambe sous 85 %.', false, true, 1),
  ('v1', 'sec_calf', 'sécurité', 'robustesse', 'note.calf_raise', '{"metric":"note.calf_raise","op":"<=","value":2}'::jsonb, 'Robustesse', 'Mollet et tendon d''Achille', 'Montées sur pointe sous le repère publié (23 H / 20 F).', false, true, 2),
  ('v1', 'sec_ktw', 'sécurité', 'robustesse', 'val.knee_to_wall', '{"metric":"val.knee_to_wall","op":"<","value":8}'::jsonb, 'Robustesse', 'Mobilité de cheville selon le suspect', 'Knee-to-wall côté faible sous 8 cm.', false, true, 3),
  ('v1', 'sec_bridge', 'sécurité', 'robustesse', 'note.bridge', '{"metric":"note.bridge","op":"<=","value":2}'::jsonb, 'Robustesse', 'Chaîne postérieure, le maillon faible', 'Pont 1 jambe note 2 ou moins.', false, true, 4),
  ('v1', 'sec_sts', 'sécurité', 'robustesse', 'note.sit_to_stand', '{"metric":"note.sit_to_stand","op":"<=","value":2}'::jsonb, 'Robustesse', 'Quadriceps et contrôle du genou, le maillon faible', 'Assis-debout 1 jambe note 2 ou moins.', false, true, 5),
  ('v1', 'run_seuils', 'course', 'course', 'e', '{"metric":"e","op":"<","value":0.9}'::jsonb, 'Seuils', 'Zone 2 longue près de la VC (ex. 6 × 1000 m à 95-98 % de la VC)', 'Facteur d''endurance sous 0,90 : la vitesse se perd vite avec la durée.', false, true, 6),
  ('v1', 'run_vitesse', 'course', 'course', 'e', '{"metric":"e","op":">=","value":0.9}'::jsonb, 'Vitesse', 'Zone 3 courte (ex. 10 × 400 m à 102-105 % de la VC)', 'Facteur d''endurance de 0,90 ou plus : profil endurant, il manque de la vitesse.', false, true, 7),
  ('v1', 'run_vo2', 'course', 'course', 'note.vma', '{"metric":"note.vma","op":"<=","value":2}'::jsonb, 'Système cardio-respiratoire', 'VO2 toute l''année', 'VMA note 2 ou moins.', false, true, 8),
  ('v1', 'sled_push_force', 'stations', 'sleds', 'note.sled_push_reserve', '{"metric":"note.sled_push_reserve","op":"<=","value":2}'::jsonb, 'Force spécifique', 'Force au Sled Push', 'La charge de course dépasse 75 % de la charge max estimée.', false, true, 9),
  ('v1', 'sled_pull_force', 'stations', 'sleds', 'note.sled_pull_reserve', '{"metric":"note.sled_pull_reserve","op":"<=","value":2}'::jsonb, 'Force spécifique', 'Force au Sled Pull', 'La charge de course dépasse 75 % de la charge max estimée.', false, true, 10),
  ('v1', 'sled_push_endf', 'stations', 'sleds', 'week1.sled_push_drop', '{"all":[{"metric":"week1.sled_push_drop","op":"<","value":0.85},{"metric":"note.sled_push_reserve","op":">=","value":3}]}'::jsonb, 'Endurance de force', 'Endurance de force au Sled Push', 'Chute en semaine 1 (dernier tronçon sous 85 % du premier) malgré une bonne réserve.', true, true, 11),
  ('v1', 'sled_pull_endf', 'stations', 'sleds', 'week1.sled_pull_drop', '{"all":[{"metric":"week1.sled_pull_drop","op":"<","value":0.85},{"metric":"note.sled_pull_reserve","op":">=","value":3}]}'::jsonb, 'Endurance de force', 'Endurance de force au Sled Pull', 'Chute en semaine 1 (dernier tronçon sous 85 % du premier) malgré une bonne réserve.', true, true, 12),
  ('v1', 'sled_pull_gap', 'stations', 'sleds', 'note.sled_pull_reserve', '{"metric":"note.sled_pull_reserve","op":"<=_metric_minus","other":"note.sled_push_reserve","value":2}'::jsonb, 'Force du haut du corps', 'Dos, bras et grip', 'Sled Pull 2 notes sous le Sled Push.', true, true, 13),
  ('v1', 'wb_tech', 'stations', 'wall balls', 'val.wb_no_reps', '{"all":[{"metric":"val.wb_no_reps","op":">","value":0},{"metric":"note.wall_balls","op":"<=","value":2}]}'::jsonb, 'Technique', 'Technique des wall balls (cible, squat complet)', 'No-reps et note 2 ou moins.', false, true, 14),
  ('v1', 'wb_endf', 'stations', 'wall balls', 'val.wb_last_first', '{"metric":"val.wb_last_first","op":"<","value":0.75}'::jsonb, 'Endurance de force', 'Endurance de force aux wall balls', 'Dernière minute sous 75 % de la première.', true, true, 15),
  ('v1', 'bbj_endf', 'stations', 'BBJ', 'val.bbj_80', '{"all":[{"metric":"val.bbj_80","op":">","value":{"H":270,"F":315}},{"metric":"note.broad_jump","op":">=","value":3}]}'::jsonb, 'Endurance de force', 'Endurance de force des jambes', 'BBJ lent (plus de 4:30 H / 5:15 F) avec un broad jump correct.', false, true, 16),
  ('v1', 'bj_force', 'stations', 'puissance', 'note.broad_jump', '{"metric":"note.broad_jump","op":"<=","value":2}'::jsonb, 'Force', 'Force, puis puissance', 'Broad jump note 2 ou moins.', false, true, 17),
  ('v1', 'triple_react', 'stations', 'puissance', 'val.triple_ratio', '{"metric":"val.triple_ratio","op":"<","value":0.85}'::jsonb, 'Puissance', 'Réactivité (enchaînement des sauts)', 'Triple sous 85 % de 3 sauts uniques.', false, true, 18),
  ('v1', 'ergo_tech', 'stations', 'ergos', 'note.row_2000', '{"all":[{"any":[{"metric":"note.row_2000","op":"<=","value":2},{"metric":"note.ski_2000","op":"<=","value":2}]},{"metric":"note.cs","op":">=","value":3}]}'::jsonb, 'Technique', 'Technique d''ergo', 'Ergo note 2 ou moins avec une bonne VC.', false, true, 19),
  ('v1', 'ergo_run_first', 'stations', 'ergos', 'note.row_2000', '{"all":[{"any":[{"metric":"note.row_2000","op":"<=","value":2},{"metric":"note.ski_2000","op":"<=","value":2}]},{"metric":"note.cs","op":"<=","value":2}]}'::jsonb, 'Système cardio-respiratoire', 'La course d''abord', 'Ergo et VC bas tous les deux.', false, true, 20),
  ('v1', 'press_std', 'stations', 'force', 'val.press_rel', '{"metric":"val.press_rel","op":"<","value":{"H":0.6,"F":0.4}}'::jsonb, 'Force', 'Force jusqu''au standard, pas au-delà', 'Press sous 0,6 × poids (H) / 0,4 (F).', false, true, 21),
  ('v1', 'ratio_legs', 'stations', 'force', 'val.thruster_press', '{"metric":"val.thruster_press","op":"<","value":1.2}'::jsonb, 'Force', 'Jambes au thruster', 'Thruster / press sous 1,2 : jambes peu utilisées.', false, true, 22),
  ('v1', 'ratio_shoulders', 'stations', 'force', 'val.thruster_press', '{"metric":"val.thruster_press","op":">","value":1.7}'::jsonb, 'Force', 'Épaules', 'Thruster / press au-dessus de 1,7 : épaules limitantes.', false, true, 23),
  ('v1', 'grip', 'stations', 'grip', 'val.dead_hang', '{"metric":"val.dead_hang","op":"<","value":{"H":60,"F":45}}'::jsonb, 'Grip', 'Grip', 'Dead hang sous 60 s (H) / 45 s (F).', false, true, 24)
ON CONFLICT (version, rule_key) DO NOTHING;
-- END SEED v1

COMMIT;
