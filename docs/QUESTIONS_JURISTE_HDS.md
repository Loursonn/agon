# Questions pour un juriste : données de santé, hébergement (HDS) et documents légaux

Préparé le 2026-11-13 pour Hugo, avant l'avis demandé dans la roadmap (C-securite, décision D7).
Rien ici n'est un avis juridique : ce sont des faits vérifiés dans le code et la base, puis des
questions ouvertes. Toute phrase du type « il semble que » est une hypothèse à faire confirmer.

## 1. Le contexte, en faits vérifiables

- **Éditeur** : Hugo Tanguy, entrepreneur individuel (EI), SIREN 940 221 187, franchise de TVA.
  Une quinzaine d'utilisateurs réels aujourd'hui ; ouverture aux stores visée en janvier-février 2027.
- **Utilisateurs** : des coachs de préparation physique (sur ordinateur) et leurs athlètes (sur
  téléphone), amateurs ou compétiteurs, à partir de 15 ans (de 15 à 18 ans avec l'accord d'un
  représentant légal). Un athlète peut aussi être suivi par un « staff » qu'il accepte : kiné,
  ostéopathe, nutritionniste, préparateur mental, **médecin**, coach adjoint.
- **Données traitées** (détail : politique de confidentialité, version 2026-11-13, et
  `docs/stores/DONNEES_COLLECTEES.md`) :
  - entraînement : séances, charges, tests, courses HYROX, compétitions ;
  - bien-être du matin : sommeil, énergie, courbatures, douleur de 0 à 10, malade oui/non ;
  - bilan hebdomadaire ;
  - poids, masse grasse, mensurations, **photos du corps** ;
  - blessures déclarées ;
  - **entrées de suivi médical** que peut écrire un professionnel du staff (kiné, médecin…) ;
  - données des montres Garmin et COROS : fréquence cardiaque, VFC, SpO2, sommeil, stress… Pour
    Garmin, une copie intégrale des données reçues est aussi gardée.
- **Indicateurs calculés** : charge d'entraînement, et un « feu du matin » vert / orange / rouge
  qui signale un risque de surcharge. Les CGU les présentent comme des repères, pas un diagnostic.
- **Base légale actuelle** : consentement explicite (art. 9.2.a RGPD), recueilli à part, versionné
  et horodaté (`user_consents`). Il y a aussi des accords séparés et facultatifs pour l'IA, le
  staff, Garmin et COROS.
- **Prestataires** :
  - Supabase : base, authentification, fichiers. Région « West EU (Ireland) » d'après
    `supabase backups list`. La politique disait « eu-central-1 » jusqu'au 13/11 ; c'est corrigé.
  - Vercel : distribution de l'application web, aux États-Unis.
  - Google Gemini API : synthèses par IA, avec l'accord IA.
  - L'assistant Claude (Anthropic) personnel du coach, qui lit les données via une clé générée
    dans Agon, avec l'accord IA de l'athlète.
- **Sauvegardes** : sauvegardes physiques Supabase (WAL-G) ; restauration à un instant donné
  (PITR) non activée. La politique annonce 30 jours au plus. La durée réelle selon l'offre
  souscrite reste à vérifier dans le tableau de bord.
- **Paiement** : aucun aujourd'hui. Il n'existe pas de CGV.

## 2. Hébergement de données de santé (HDS)

1. Les données d'Agon sont-elles des « données de santé à caractère personnel recueillies à
   l'occasion d'activités de prévention, de diagnostic, de soins ou de suivi social et
   médico-social » au sens de l'article L.1111-8 du Code de la santé publique ? On distinguera :
   - **a.** les données de pur entraînement (charges, séances, temps HYROX) ;
   - **b.** le bien-être, la douleur, la maladie, la VFC, les mesures des montres ;
   - **c.** les entrées écrites par un professionnel de santé du staff (kiné, médecin) dans le
     suivi médical.
2. Si seule la catégorie **c** relève de l'obligation HDS, suffit-il de l'isoler chez un hébergeur
   certifié HDS ? Ou bien la présence d'un professionnel de santé fait-elle basculer tout le
   dossier de l'athlète ?
3. Le fait que le professionnel de santé soit **invité par le coach**, et non mandaté par une
   structure de soins, change-t-il l'analyse ?
4. Si une certification HDS est nécessaire, quelles options réalistes pour une EI ?
   - un hébergeur certifié HDS (par exemple une offre Supabase ou Postgres managée chez un
     hébergeur certifié) ;
   - ou interdire le domaine « suivi médical » au staff de santé ;
   - autre ?
   Quel calendrier, et quel risque à continuer en attendant ?
5. Supabase en Irlande (sur un cloud tiers) sans certification HDS : est-ce acceptable pour les
   catégories **a** et **b** ?
6. Vercel (États-Unis) ne sert que le code de l'application : les données passent du navigateur
   directement à Supabase. Vercel doit-il quand même figurer comme sous-traitant de données de
   santé ? Quel encadrement du transfert faut-il ?

## 3. RGPD : données de santé

7. Le consentement explicite est-il la bonne base légale pour tout l'article 9 ? Faut-il une base
   distincte pour ce que le coach saisit lui-même (programmes, notes) ?
8. Faut-il une **analyse d'impact (AIPD)** ? Données de santé, mineurs de 15 à 18 ans, montres
   connectées et indicateur de surcharge automatisé semblent cocher plusieurs critères de la liste
   CNIL. Si oui, quel niveau de détail pour une EI ?
9. Le feu du matin (vert / orange / rouge) est-il une « décision fondée exclusivement sur un
   traitement automatisé » (art. 22) ? Il n'a aucun effet automatique : c'est le coach qui décide.
   Quelles mentions faut-il ?
10. Le feu ou la charge pourraient-ils faire d'Agon un **dispositif médical** (règlement UE
    2017/745) s'ils sont présentés comme détectant une surcharge ? Quelles formulations éviter ?
11. **Mineurs de 15 à 18 ans** : l'accord du représentant légal est demandé dans les CGU mais pas
    vérifié techniquement. Est-ce suffisant ? Faut-il autre chose pour des données de santé ?
12. **Copie intégrale des données Garmin**, gardée « pour pouvoir tout analyser plus tard »,
    y compris des types non affichés (nutrition, hydratation…). Est-ce compatible avec la
    minimisation et la limitation des finalités ? Faut-il ne garder que ce qui sert ?
13. **Assistant Claude du coach (Anthropic)** : le coach utilise son propre compte. Anthropic
    est-il un destinataire, un sous-traitant du coach, un tiers ? Le coach devient-il
    responsable de traitement, ou responsable conjoint avec Agon ? Que doit dire la politique ?
    Faut-il un contrat avec le coach ?
14. **Professionnels du staff** : sont-ils destinataires, sous-traitants ou responsables
    indépendants pour ce qu'ils écrivent ? Faut-il des engagements écrits (secret professionnel,
    confidentialité) de leur part ?
15. **Historique des accords** : il part avec le compte supprimé, et seule une trace anonyme
    reste (`account_deletions`). Cela suffit-il à prouver le consentement (art. 7.1) en cas de
    contrôle après suppression ?
16. **Re-consentement** : à chaque nouvelle catégorie de données, tous les utilisateurs doivent
    ré-accepter l'accord socle (fait le 13/11). Est-ce nécessaire, ou une information suffit-elle
    pour des données qui entrent dans la même finalité ?
17. Faut-il tenir un **registre des traitements** (art. 30), malgré la taille de l'entreprise ?
    Les données de santé ne semblent pas relever de l'exception des petites structures.
    Existe-t-il un modèle adapté ?

## 4. Incident à qualifier

18. Le bucket de stockage `test-media` est **public** depuis le 2026-08-25 (constaté le
    2026-11-13 en lecture sur la base). Il contient des photos du corps déposées avec les
    mensurations : 12 fichiers.
    - Faits : l'application les affiche par liens signés, mais le fichier reste lisible par
      quiconque connaît son adresse exacte. L'adresse contient l'identifiant aléatoire de
      l'athlète et un horodatage ; elle n'est publiée nulle part à notre connaissance. Aucun accès
      anormal n'a été constaté, mais rien n'a été vérifié dans les journaux.
    - Questions :
      - Est-ce une violation de données au sens de l'art. 4.12 ?
      - Faut-il la consigner dans le registre des violations (art. 33.5) ?
      - Faut-il la notifier à la CNIL dans les 72 h, et informer les athlètes concernés ?
      - Dans quel délai, et avec quels éléments ?
    - Le correctif (bucket privé) est proposé en parallèle.

## 5. CGU, CGV, consommation

19. Le service est gratuit aujourd'hui pour les athlètes comme pour les coachs. Quand faut-il
    des **CGV** ? Dès un abonnement coach (vente B2B à des professionnels), ou aussi si l'athlète
    paie un jour ? Quelles clauses sont indispensables : droit de rétractation, reconduction
    tacite, résiliation en trois clics ?
20. **Médiateur de la consommation** : les CGU citent l'article L.612-1 sans nommer de médiateur.
    Pour un service gratuit, faut-il en désigner un ? Lequel, et à quel coût ?
21. La relation coach / athlète : Agon « n'est pas partie au contrat de coaching ». La clause
    tient-elle si Agon facture un jour les coachs ? Faut-il des conditions spécifiques coach
    (statut de sous-traitant du coach, accord de traitement art. 28) ?
22. Les clauses de responsabilité (CGU §8) et l'avertissement « pas un dispositif médical »
    sont-elles suffisantes face à des indicateurs de surcharge ?
23. Les stores (App Store, Play Store) imposent-ils des mentions de plus (suppression de compte,
    déclaration des données, IA) que nos documents ne couvriraient pas ?

## 6. Ce que nous attendons de l'avis

- Pour chaque question : la réponse, le niveau de risque, et l'action recommandée.
- Pour HDS : l'obligation (oui / non / partielle), et le chemin le moins coûteux pour être en règle.
- Les phrases de la politique de confidentialité et des CGU à corriger.
