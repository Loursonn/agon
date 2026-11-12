/*
  P41 lot F (Q8 validée par Hugo) : stations HYROX dans la banque d'exercices.

  La banque contient déjà Sled Push, Wallball Shot, Burpees Broad Jump,
  Rameur, Farmers carry et Sandbag Lunges (exercices publics). On n'ajoute
  que ce qui manque pour couvrir les 8 stations + la course : SkiErg, Sled
  Pull, Course. Identifiants fixes : rejouable, et supprimables d'un coup si
  Hugo préfère d'autres intitulés.

  Additive : 3 lignes publiques, créées par le système (created_by NULL),
  non vérifiées, comme le reste de la banque.
*/
INSERT INTO public.exercises (id, name, ex_type, equipment, is_public, is_verified, instructions)
VALUES
  ('4a7e0000-0000-4000-8000-000000000001', 'SkiErg', 'muscu', 'SkiErg', true, false,
   'Station HYROX 1 : 1 000 m de SkiErg.'),
  ('4a7e0000-0000-4000-8000-000000000002', 'Sled Pull', 'muscu', 'Traîneau', true, false,
   'Station HYROX 3 : 50 m de traîneau tiré à la corde.'),
  ('4a7e0000-0000-4000-8000-000000000003', 'Course', 'muscu', NULL, true, false,
   'Course entre les stations HYROX (1 km en compétition).')
ON CONFLICT (id) DO NOTHING;
