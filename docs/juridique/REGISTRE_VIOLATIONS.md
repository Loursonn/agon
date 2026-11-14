# Violations de données : procédure et registre (art. 33 et 34 RGPD)

Rédigé le 2026-11-13 (revue juridique par Claude, à la place d'un juriste ; pas un avis
d'avocat). Le registre est **obligatoire pour toute violation**, même non notifiée (art. 33.5).
Ne jamais y écrire de nom d'athlète, de chemin de fichier complet ni de donnée de santé.

## Procédure

1. **Contenir** : fermer l'accès (bucket privé, clé révoquée, policy corrigée), sans effacer
   les traces utiles (journaux).
2. **Noter l'heure de découverte** : le délai de 72 h de l'art. 33.1 court à partir de là.
3. **Évaluer le risque** pour les personnes : nature des données (santé, photos, GPS = grave),
   nombre de personnes, mineurs, facilité d'identification, vraisemblance d'un accès réel
   (journaux Supabase : Logs → API / Storage / Auth ; la rétention dépend de l'offre).
4. **Décider** :
   - risque **improbable** : registre seulement, avec la justification ;
   - **risque** : notification à la CNIL sous 72 h sur https://notifications.cnil.fr (une
     notification initiale incomplète est permise, à compléter ensuite, art. 33.4) ;
   - **risque élevé** : en plus, informer les personnes sans tarder (art. 34), en termes
     simples : ce qui s'est passé, les données, les conséquences possibles, ce qui a été fait,
     qui contacter.
5. **Inscrire** au registre ci-dessous, et une entrée dans `docs/DECISIONS.md`.
6. Un prestataire (Supabase, Vercel, Google) qui signale une violation : même procédure, le
   délai court à partir de son signalement.

## Registre

### V1 — Bucket `test-media` accessible sans authentification

| Rubrique | Contenu |
|---|---|
| Période | 2026-08-25 (migration `20260825000000_coach_upload_test_media.sql`) → 2026-11-13 (bucket privé, migrations `20261113190000` et `20261113190100`) |
| Découverte | 2026-11-13, en lisant la configuration des buckets de la prod (audit, faille S6) |
| Nature | Confidentialité : fichiers téléchargeables sans compte par quiconque connaissait leur adresse exacte |
| Données | 12 photos du corps (face, côté, dos, jambes) déposées avec les mensurations ; 6 illustrations de séances de coachs (sans donnée personnelle) |
| Personnes | 3 athlètes (12 photos, comptage par dossier le 13/11) |
| Vraisemblance d'un accès | Négligeable : aucune règle ne permettait de lister le bucket ; l'adresse contient l'UUID aléatoire de l'athlète et un horodatage ; l'app n'a jamais produit d'URL publique pour ces photos (URL signées) ; aucune adresse publiée à notre connaissance. Journaux d'accès : non consultés à la date de rédaction (action H5) |
| Gravité potentielle | Maximale (photos du corps, données de santé) |
| Évaluation | Risque **improbable** au sens de l'art. 33.1 (vraisemblance négligeable) |
| Décision | Pas de notification à la CNIL ; information des athlètes concernés recommandée (non obligatoire) ; à revoir si un journal montre un accès anonyme à ces fichiers |
| Mesures | Bucket privé, lecture par URL signée de 10 min, règles propriétaire / coach, test `supabase/tests/test_media_storage.sql` ; à venir : test CI refusant tout bucket public hors liste blanche (AIPD A2) |
| Responsable de la décision | Hugo TANGUY, le 13/11/2026 : pas de notification CNIL ; les 3 athlètes sont prévenus par Hugo (message ci-dessous) ; information faite, confirmée par Hugo le 14/11/2026. Journaux Storage : rétention d'un jour sur l'offre gratuite, la période exposée n'est plus consultable |

Texte proposé pour informer un athlète concerné (à envoyer par Hugo ou le coach) :

> Bonjour, en vérifiant la sécurité d'Agon, nous avons découvert qu'entre fin août et le
> 13 novembre, les photos que tu as déposées avec tes mensurations étaient stockées dans un
> espace mal réglé : elles étaient lisibles par quelqu'un qui aurait connu leur adresse exacte.
> Cette adresse est une longue suite de caractères aléatoires, elle n'a jamais été publiée et
> l'application ne l'a jamais affichée : nous n'avons aucun signe que quelqu'un les ait vues.
> Le réglage est corrigé : seuls toi et ton coach y avez accès. Tu peux supprimer ces photos à
> tout moment dans ton profil. Pour toute question : prep.hugoo@gmail.com.
