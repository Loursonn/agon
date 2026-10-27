-- Les données Garmin n'alimentent plus aucun service d'IA.
--
-- Décision du 27 octobre 2026, prise avant le dépôt du dossier Garmin
-- Connect Developer Program (palier Starter).
--
-- Pourquoi, alors que la clause 4.1(b) ne l'impose pas : le formulaire Garmin
-- exige la liste des tiers qui traitent les données de l'appareil, traitement
-- par IA compris. Agon utilise Gemini pour la rédaction assistée de
-- programmes, pour la barre de chat du coach et pour les insights d'athlète —
-- cela reste déclaré. Mais plutôt que de promettre à Garmin que ses données ne
-- serviront qu'à bon escient, on le rend vrai dans le schéma : le trigger
-- `apply_source_ai_policy` lit cette table et écrase ce que l'appelant aurait
-- pu poser, donc une donnée Garmin ne peut pas être marquée transmissible,
-- même par du code fautif ou un client compromis.
--
-- Une garantie contrôlable vaut mieux qu'un engagement en l'air : c'est aussi
-- ce qui distingue ce dossier de celui qu'on aurait déposé chez Strava.
--
-- Effet de bord assumé : les montres Garmin ne contribueront pas aux
-- suggestions de l'IA, y compris pour un athlète qui a consenti au traitement
-- IA. Le consentement de l'athlète ne peut pas lever une restriction que nous
-- avons prise vis-à-vis du fournisseur — l'inverse serait de lui faire porter
-- une décision qui n'est pas la sienne.

UPDATE public.data_source_policies
   SET ai_allowed = false,
       notes = 'ai_allowed à false par décision du 27/10/2026, et non par obligation : la clause 4.1(b) du Connect Developer Program Agreement autorise l''affichage au coach avec le consentement de l''utilisateur, et n''interdit pas le traitement par IA. Nous nous l''interdisons quand même, pour pouvoir déclarer à Garmin une exclusion vérifiable dans le schéma plutôt qu''une intention. Revenir en arrière suppose de le dire à Garmin, pas seulement de modifier cette ligne.'
 WHERE source = 'garmin';

/*
  Reprise de l'existant.

  Le trigger ne s'applique qu'aux écritures : les lignes déjà en base gardent
  le drapeau posé au moment de leur import. Aucune activité Garmin n'existe
  aujourd'hui — l'intégration n'est pas encore branchée — donc ces deux ordres
  ne devraient toucher aucune ligne. Ils sont écrits quand même : une
  migration qui suppose l'état de la base au lieu de le corriger laisse un
  trou qui ne se voit qu'une fois qu'il est trop tard.
*/
UPDATE public.provider_activities a
   SET ai_allowed = p.ai_allowed
  FROM public.data_source_policies p
 WHERE p.source = a.source
   AND a.source = 'garmin'
   AND a.ai_allowed IS DISTINCT FROM p.ai_allowed;

UPDATE public.provider_dailies d
   SET ai_allowed = p.ai_allowed
  FROM public.data_source_policies p
 WHERE p.source = d.source
   AND d.source = 'garmin'
   AND d.ai_allowed IS DISTINCT FROM p.ai_allowed;
