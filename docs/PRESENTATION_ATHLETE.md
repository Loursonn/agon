# Présentation de l'app — vue athlète

Inventaire de tout ce qu'un athlète peut voir et faire dans Agon, et des règles qu'il doit connaître.
Base de travail pour le motion design de présentation. Établi le 2026-11-01 à partir du code de la branche `dev`.

Légende : **[C]** = n'apparaît que si le coach l'a activé ou renseigné.

---

## 1. Navigation

- **Barre du bas, 5 à 6 onglets** : Aujourd'hui · Programme · Tests · HYROX **[C]** · Nutrition · Profil.
- **En-tête** : logo, pastille de sauvegarde « OK / Err », badge « N bless. » si blessure en cours, bouton menu ☰ qui ouvre le tiroir « Mon profil ».
- **Éléments flottants** : minuteur de repos, bouton « Revenir à la séance » quand une séance est ouverte, bandeau « Séance non terminée » le lendemain d'une séance non clôturée.

---

## 2. Créer son compte et se connecter

1. **Deux façons d'arriver** : lien d'invitation envoyé par le coach (rattachement automatique) ou « Créer un compte → Athlète » avec le **code coach à 6 caractères** (ex. HUGO42).
2. **Confirmation par e-mail** avant la première connexion (penser aux spams).
3. **Écran « Avant de commencer »** à la première connexion :
   - accord obligatoire sur le traitement des données de santé et leur partage avec le coach ;
   - accord facultatif IA (Google Gemini) : si refusé, le coach construit les programmes à la main. Modifiable à tout moment dans Profil → Confidentialité.
4. Mot de passe oublié → lien par e-mail. La déconnexion ne ferme que l'appareil courant.
5. **Changer de coach** : tiroir Profil → « Mon coach » → « Quitter mon coach » puis « Rejoindre un coach » avec le nouveau code. L'historique est conservé.

---

## 3. Onglet Aujourd'hui (l'écran du quotidien)

De haut en bas. Le coach peut masquer la plupart des sections.

| Section | Ce que l'athlète voit / fait |
|---|---|
| Bonjour + date | — |
| Citation du jour | Bouton « Aimer », compteur d'athlètes |
| Retour hebdo du coach | Carte « Retour de ton coach — Semaine du … », 4 réactions (👍 💪 🔥 ❤️). Réagir = marque comme lu |
| **Wellness** | Bouton « Logger mon wellness du jour » → puis cercle Readiness /100 + 5 valeurs, lien « Modifier » |
| Nutrition du jour **[C]** | Masquée par défaut. Kcal et macros du jour vs cible, verdict « Dans / Proche / Hors objectif » |
| Test du jour **[C]** | Carte par test planifié, « Remplir → » |
| Jour de compétition | Carte rouge, importance A/B/C, « Remplir mon bilan » dès le jour J |
| Thème du jour **[C]** | Bandeau : intensité (Hard / Moyen / Easy / Récup / Repos) + dominante (Force, Aérobie, Seuil…) |
| **Séance du jour** | Muscu : « Démarrer ▶ ». Énergie : « Voir → ». Fiches attachées avec point « Nouvelle fiche ». Jour vide : « Récupération » |
| Faire une autre séance cette semaine | Liste repliable, permet d'avancer une séance prévue un autre jour |
| **Cette semaine** | Bande 7 jours : points de couleur (muscu / énergie / test / fait), trophée compétition, liseré thème. Tap → fiche du jour |
| Hier | Séance d'hier + wellness /100 |
| Prochaine compétition | J-x, « + Ajouter » (si coach), « Toutes (N) → » |
| Compétition à commenter | Rouge, tant que le bilan n'est pas rempli |
| Mes événements | Indisponibilités (« Grosse journée de travail, week-end absent… »), visibles par le coach sur le planning |
| Tendance de forme | Moyenne 7 j /100, courbe 14 jours, conseils |

**Fiche du jour** (tap sur un jour de « Cette semaine ») : séances avec statut (Planifiée / Complétée ✓ / Manquée), exercices résumés, « Démarrer ▶ », « + Activité libre » (aujourd'hui ou passé seulement).

---

## 4. Le wellness quotidien (à faire le matin, à jeun)

Questionnaire plein écran, 1 par jour, remplaçable via « Modifier ».

1. **5 questions notées 1 à 5** (5 = toujours le meilleur) : Récupération, Qualité du sommeil, Sérénité / mental, Niveau d'énergie, Fraîcheur musculaire.
2. **Courbatures** (si fraîcheur ≤ 3) : placer des points sur la silhouette avant / arrière, intensité 1-10.
3. **« Es-tu blessé/malade ? »** : Oui → description obligatoire. ⚠ Ce n'est qu'une note : pour une vraie blessure, passer par « Déclarer une gêne ou une blessure » (Profil).
4. **Sommeil** : heure de coucher / réveil, durée vs objectif (8 h par défaut), réveil nocturne.
5. **Poids à jeun** (−0,5 / +0,5, « Pas de pesée » pour passer).
6. **Bilan** : score /100 avec recommandation (Optimal → Séance pleine charge … Surmenage → Repos), alertes. « Sauvegarder ».

Le score alimente la readiness du jour, la tendance 14 jours, la moyenne 7 jours et ce que voit le coach.

---

## 5. Onglet Programme

### Vue « Séances »
- **Plan actif** : nom du mésocycle, « Semaine X sur Y », barre de progression, Complétion %, Fréquence, Séances / sem, phase et objectif. « Cycles précédents » dessous.
- **Navigation semaine par semaine** (‹ ›, « revenir à aujourd'hui »).
- **Carte par jour** : séances avec statut (Planifiée / Complétée ✓ / Manquée / Déplacée), tests, activités libres, thème du jour, compétition.
- **Actions sur une séance** :
  - tap → aperçu (blocs, exercices, séries × reps, RIR, tempo, supersets) → « Démarrer la séance ▶ » ;
  - « ⋯ » → **« Déplacer la séance »** vers un autre jour (cette semaine ou la suivante), raison facultative. Changer de semaine notifie le coach ;
  - « + Activité libre » : sport, durée, distance, intensité /10, note. Enregistrée directement comme faite ;
  - « Compétition » : ajouter une compétition sur ce jour (si coach).

### Vue « Fiches » (documents du coach)
- **Mes fiches** : attribuées, personnelles ou liées aux séances, groupées par catégorie, badge NOUVEAU.
- **Banque** : fiches en libre-service du coach, recherche + filtres.
- **Mes ajouts** : captures, photos, PDF envoyés au coach (« 📷 Photo », « + Ajouter »).
- **Viewer plein écran** : note du coach, PDF/image zoomable, « Ouvrir / Télécharger », **fil de commentaires avec image** vers le coach. Ouvrir une fiche la marque « vue ».

---

## 6. Faire une séance de musculation (écran clé de la vidéo)

1. **En-tête** : nom, chrono qui tourne, barre de progression des séries, fiches de la séance, bandeau « Retour vidéo demandé » si le coach veut une vidéo.
2. **Blocs A, B, C…** avec consignes, badge de timing (« Repos 1min 30s », « Départ /1min » ou libre).
3. **Carte exercice** : prescription (« 4×8 @ 80kg · RIR 2 · T 3010 », « @ PDC », « @ 75%RM »), bouton vidéo démo, commentaire du coach, badges Iso / Superset / Cluster.
4. **Tableau des séries** : # · Charge · Reps (ou Durée en iso) · **Préc.** (dernière fois, ex. « 82,5×6 ») · RIR · ✓.
   - Les cases sont **pré-remplies** avec la prescription ou la dernière performance.
   - Tap sur Charge / Reps / RIR → pavé de saisie (−2,5 / +1,25… ; RIR de 0 Échec à 5+). « Valider » coche la série.
   - **La coche a 3 états** : ✓ faite → ✕ passée → vide.
   - « + Série bonus », « Commentaire » par exercice, case « Vidéo envoyée ».
5. **Minuteur de repos** : part automatiquement à chaque série validée (vibration à la fin, « Suiv. : exercice suivant », « Tap pour ignorer »). En superset, il part quand le tour est complet. Mode « Départ » : chrono qui se relance tout seul.
6. **Sauvegarde automatique** après chaque saisie. Après 10 min sans activité : rappel « Séance en pause ? ».
7. **« Terminer la séance »** (bouton fixe, vert quand tout est validé) → fenêtre : séries ok / passées, **État de forme 1-5**, commentaire de séance, « J'ai couru pendant la séance » (km) → « Terminer ✓ ».
8. **RPE 1-10** (« Effort global perçu ? ») → « Valider » ou « Passer ».
9. Séance complétée = lecture seule, « ↩ Annuler la complétion » possible.

**Règle n°1 à faire passer : clôturer la séance.** Sans « Terminer la séance », les saisies sont sauvées mais la séance reste « planifiée » : pas d'historique, pas de stats, le coach ne la voit pas comme faite. Le lendemain, un bandeau « Séance non terminée → Clôturer » le rappelle.

---

## 7. Séances énergétiques et spécifiques

### Énergétique (course, vélo, rameur…)
- **Aperçu** : type (VO₂ / Tempo / Seuil / Footing / Fartlek…), durée, graphique des intervalles avec zones, déroulé (Effort / Récup / Repos), cibles, **équivalences d'allure** (km/h, min/km, 400 m, % VMA si VMA connue), matériel, notes, fiches, schéma.
- **Boutons** : « Faire la séance ▶ » (aujourd'hui), « Faire la séance aujourd'hui » (la déplace), « Annuler la séance » (si déjà validée).
- **Exécution bloc par bloc** : ✓ « Bloc fait » ou ~ « Bloc non terminé » (commentaire obligatoire), puis « Terminer la séance ✓ ».

### Spécifique (WOD / MetCon) — depuis Aujourd'hui
- Frise des étapes (échauffement, effort, récup, tours), démos vidéo, « Démarrer la séance ».
- Pendant : étape i/n, compte à rebours automatique, « Tour 3 / 8 », « Étape suivante ✓ » / « Passer », écran qui reste allumé.
- Fin : activité, distance courue, **RPE 1-10**, « Séance respectée ? Oui ✓ / Adaptée », commentaire.

---

## 8. Onglet Tests

- **Mensurations / Photos** : poids du jour, 10 mesures (bras, épaules, poitrine, taille, hanche, cuisses, mollets), 5 photos (face, côté, dos, jambes face/dos), historique modifiable. Brouillon gardé sur l'appareil.
- **Mes valeurs** : meilleure valeur par variable (VMA, 1RM…) avec date.
- **Historique** : tous les tests avec leurs résultats et notes.
- **Remplir un test programmé** (depuis Aujourd'hui / Programme) : description + protocole du coach, saisie par variable (allure m:ss, durée, nombre, note /5) ou texte libre, commentaire, « Marquer comme réalisé ✓ ». Certains tests sont **notés par le coach** : envoyer la vidéo hors app puis « VALIDÉ ✓ — envoyer au coach ». Une fois validé, plus modifiable.

---

## 9. Onglet HYROX **[C]**

Visible seulement si le coach a activé le suivi HYROX.

- **Courses** : Record, nombre de courses, dernier chrono. « Ajouter une course » avec **« Coller les résultats (results.hyrox.com) »** qui remplit les 16 segments automatiquement (tuto vidéo intégré). « Comparer (2) » entre deux courses.
- **Fiche d'une course** : répartition Course / Stations / Roxzone, détail par segment avec percentile vs référence, lecture automatique (parti trop vite, chute run 1→2, seconde moitié plus lente…), profil Runner / Hybride / Powerhouse, top 3 priorités d'amélioration, commentaires athlète et coach.
- **Stations** : 8 stations + Roxzone, record, Top N %, évolution, priorités.
- **Runs** : graphique des 8 runs vs référence, fade, drop, Roxzone.
- **Radar** : 10 axes, classement global vs athlètes de la même tranche, superposition du record.

---

## 10. Onglet Nutrition **[C]**

Affiche « Pas encore de plan nutritionnel » tant que le coach n'a pas défini de stratégie.

- **Objectif** : Maintenance / Sèche / Prise de masse, fenêtre de déficit ou surplus (%), poids cible, zone kcal du jour (BMR + activité), répartition des macros cibles.
- **Série en cours** : jours consécutifs dans l'objectif, frise 14 jours (vert / orange / rouge / gris), courbe de poids 30 jours.
- **Mon suivi du jour** : calories actives (montre) si le coach l'a activé, glucides / lipides / protéines en grammes avec barres vs cible. Total kcal calculé automatiquement. « Enregistrer ma journée » (seule la journée du jour est modifiable).
- **Verdict immédiat** : « Objectif atteint ! », « Proche de l'objectif », « Hors objectif ».

---

## 11. Profil (onglet + tiroir ☰)

### Onglet Profil
- **Identité** : date de naissance, âge, taille, genre, « Modifier mon profil » (avec pesée du jour).
- **Poids** : dernière pesée, poids cible, 3 dernières pesées.
- **Antécédents médicaux** : blessures / opérations / pathologies avec statut En cours / Guéri, diagnostic, traitement, pièces jointes (radio, IRM, PDF), « + Ajouter un antécédent ». Allergies et traitements en cours.
- **Volume de course à pied** : cette semaine, 7 jours glissants, semaine dernière, barres sur 8 semaines.
- **Données Strava** : tuto vidéo d'export + adresse du coach à copier.
- Déconnexion.

### Tiroir « Mon profil » (☰ en haut à droite)
- **En-tête** : forme du jour, séances, assiduité %, série de semaines réussies.
- **Blessures actives** + **« Déclarer une gêne ou une blessure »** (10 secondes : quoi, où, douleur 0-10, « Et l'entraînement ? » normal / adapté / arrêt partiel / total). Transmis au coach immédiatement.
- **Mes tendances** (7 j / 30 j / 3 mois) : score de santé, sommeil, poids, assiduité, fatigue, stress, avec mini-courbes. Vues détaillées : évolution du poids, tunnel de sommeil 14 jours, objectifs du bloc.
- **Ce qu'on retient** : 3 constats automatiques (badge « IA » si générés par le serveur).
- **Mes derniers progrès** : 5 derniers records avec gain en kg.
- **Retours du coach** : historique des retours hebdo.
- **Mes fiches** (raccourci) et **Objectifs**.
- **Réserver mon point hebdo** **[C]** : calendrier Calendly du coach intégré, invitation Meet par mail.
- **Mon coach** : rejoindre / quitter.
- **Données sportives** : VMA, vitesse critique, 1RM, temps, puissance, FC max / repos. Chaque ajout part « EN ATTENTE » de validation du coach, puis « REF ACTIVE » (la VMA active alimente le % VMA des séances).
- **Signaler un bug / une idée** : arrive directement à l'équipe.
- **Sorties enregistrées** : chaque sortie montre (durée, distance, allure, D+, FC, kcal) avec la provenance de chaque chiffre.
- **Montres & services connectés** :
  - **COROS** : « Connecter mon compte COROS » (région + accord), synchronisation automatique chaque nuit, « Synchroniser maintenant », déconnexion en un clic ;
  - **Garmin** : en attente de validation Garmin, grisé ;
  - **Importer mes fichiers** : archive Strava / Garmin ou fichiers .fit / .tcx / .gpx (Polar, Suunto, Apple Watch…), lus sur l'appareil, sans doublon.
- **Confidentialité & données** : accords (IA, COROS, Garmin) retirables en un clic, « Télécharger toutes mes données (JSON) », suppression du compte (taper SUPPRIMER).

---

## 12. Les 12 règles que l'athlète doit retenir

1. **Le matin, à jeun : wellness + poids.** 1 minute, c'est ce qui permet au coach d'adapter la séance.
2. **Aujourd'hui = la seule page à ouvrir au quotidien.** Tout ce qui est à faire y remonte.
3. **Une séance muscu se démarre, se remplit série par série, et SE CLÔTURE** avec « Terminer la séance ». Sinon elle ne compte pas.
4. **Les cases sont pré-remplies** (prescription ou dernière fois). Il ne corrige que ce qui a changé, puis coche.
5. **La coche a 3 états** : faite ✓, passée ✕, vide. Une série non faite se passe, elle ne se laisse pas vide.
6. **Le RIR est important** : c'est ce que le coach lit pour ajuster les charges.
7. **Le minuteur de repos part tout seul.** Il peut l'ignorer d'un tap.
8. **Séance impossible ce jour-là → « Déplacer la séance »** plutôt que la laisser « Manquée ». Changer de semaine prévient le coach.
9. **Activité hors programme → « + Activité libre »** (sport, durée, intensité). Le volume de course en tient compte.
10. **Gêne ou blessure → « Déclarer une gêne ou une blessure »** dans le profil, pas seulement dans le wellness. Le coach le voit immédiatement.
11. **Indisponibilités et compétitions → « Mes événements » et « Prochaine compétition »** pour que le coach planifie autour. Bilan de compétition à remplir le jour J.
12. **Les fiches NOUVEAU sont à lire**, et chaque fiche a un fil de commentaires pour poser une question au coach.

Et pour aller plus loin : connecter sa montre COROS ou importer ses fichiers, remplir les tests le jour prévu, envoyer ses vidéos quand « Retour vidéo demandé » apparaît, saisir sa nutrition si un plan est défini.

---

## 13. Ordre de scènes suggéré pour le motion design

1. Accueil + barre d'onglets (10 s) — « Tout est là, dans 6 onglets ».
2. Inscription avec le code coach + écran de consentement (10 s).
3. Le matin : wellness en 5 taps + pesée → score de readiness (20 s).
4. Aujourd'hui : séance du jour, bande « Cette semaine », retour du coach (15 s).
5. Séance muscu : démarrer → pré-remplissage → tap charge/reps/RIR → coche → minuteur → Terminer la séance → RPE (40 s, le cœur de la vidéo).
6. Le bandeau « Séance non terminée » : pourquoi clôturer (10 s).
7. Programme : la semaine, déplacer une séance, activité libre (15 s).
8. Séance énergétique : intervalles, équivalences d'allure, bloc par bloc (15 s).
9. Fiches : NOUVEAU, viewer, commentaire au coach (10 s).
10. Profil : déclarer une gêne, tendances, montre COROS / import, point hebdo (20 s).
11. Modules conditionnels en un plan : Tests, HYROX, Nutrition (10 s).
12. Rappel des 5 réflexes : wellness le matin, démarrer, remplir, clôturer, prévenir le coach (10 s).

---

## 14. À vérifier ou corriger avant de filmer

Relevé pendant l'inventaire, à traiter avant les captures d'écran.

- ✅ Corrigé — **Lien « Retour du coach » cassé** (carte de l'ancien système, Aujourd'hui + tiroir) : mène à une page 404.
- ✅ Corrigé — **Conseils de « Tendance de forme » inversés** : écrits pour une échelle 1-10 alors que le wellness est en 1-5 (5 = mieux). Les messages fatigue / stress / courbatures ne s'affichent jamais, « Bonne récupération » s'affiche quand la récupération est mauvaise.
- ✅ Corrigé — **Carte « Hier »** : affiche la première séance prévue avec une coche verte même si rien n'a été fait.
- **Trois échelles différentes** pour le même score wellness (Excellent/Bon/Moyen/Faible, Optimal/Bon/Modéré/Fatigue/Surmenage, Excellente/Bonne/Correcte/À surveiller). À unifier pour la vidéo.
- **Lien d'invitation** : pas de case CGU, contrairement à l'inscription par code.
- **Vouvoiement** résiduel sur l'écran HYROX désactivé, « Ajoutez votre première course » et l'écran d'invitation.
- ✅ Corrigé — **Suppression sans confirmation** : événements (« Mes événements ») et activité libre en modification.
- **Surcharge progressive** : aucun affichage côté athlète (« ↑ S{n}+x kg » désactivé dans le code). Ne pas promettre de recalcul automatique dans la vidéo.
- **Code mort** : page Dashboard athlète, HabitTracker (habitudes), ProfileView, formulaire « Donne ton avis » (étoiles vides). Ne pas les montrer.
- **Séance spécifique** : accessible uniquement depuis Aujourd'hui, pas depuis Programme.
