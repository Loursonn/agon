# WHOOP — étude d'intégration

Vérifié le **27 octobre 2026**. Conditions lues : <https://developer.whoop.com/api-terms-of-use/>

**Conclusion : l'accès est facile, l'architecture ne l'est pas.** WHOOP se
connecte plus vite que Garmin — pas de dossier à déposer pour commencer — mais
ses conditions interdisent précisément ce que fait Agon pour COROS et Garmin :
conserver les données en base.

---

## Ce qui marche, et qui n'allait pas de soi

**L'affichage au coach est permis.** La clause 4.2(a) interdit d'exposer les
données WHOOP à un tiers *« without explicit opt-in consent from the user »*.
Avec un consentement explicite et opt-in, c'est donc autorisé — même forme que
la clause 4.1(b) de Garmin, et l'exact inverse de la clause 2.3 de Strava qui
l'interdit en toute circonstance et nous a fait abandonner Strava.

Notre mécanisme de consentement répond déjà à cette exigence : demande
distincte par source, révocable depuis le même écran, versionnée, journalisée
en append-only.

**L'accès de départ est en libre-service.** Un palier « Sandbox » de 10 membres
s'obtient sans demande ni revue, en créant une application dans le Developer
Dashboard. De quoi vérifier la forme réelle des données avant d'engager quoi
que ce soit — ce que Garmin ne permet qu'avec une clé personnelle limitée.

OAuth 2.0 (authorization code), API REST v2, webhooks disponibles. Aucun tarif
publié.

### Paliers

| Palier | Membres connectés | Demande |
|---|---|---|
| Sandbox | 10 | Aucune — immédiat |
| Build | 100 | Revue manuelle |
| Growth | 1 000 | Revue manuelle |
| Scale | 5 000 | Revue manuelle |
| Production | Illimité | Revue manuelle |

On ne demande que le palier immédiatement supérieur, et il faut avoir connecté
au moins 50 % du palier courant pour prétendre au suivant. Les revues sont
manuelles, sans délai annoncé, et relancer WHOOP en dehors du Dashboard peut
faire désactiver l'application.

---

## Ce qui bloque : la clause 4.2(b)

> *« Scrape, build databases, or otherwise create permanent copies of WHOOP
> Data »*, ni conserver de copie en cache au-delà de ce que permet l'en-tête
> `Cache-Control`.

C'est exactement notre architecture. `provider_activities` et
`provider_dailies` sont des copies permanentes, conservées « pour la durée de
vie du compte » — c'est écrit dans notre propre politique de confidentialité.
Pour COROS et Garmin c'est le bon choix ; pour WHOOP, c'est la chose
explicitement interdite.

Le préambule du §4.2 ouvre une porte : *« Unless expressly authorized by the
WHOOP Data owner or by applicable law »*. Si le « WHOOP Data owner » désigne
le membre — ce que suggère le §4.1, *« WHOOP Data is the sole responsibility of
the person that makes it available »* — alors son consentement explicite
pourrait couvrir la conservation. **Cette lecture est plausible et ne suffit
pas.** C'est le même raisonnement qui avait fait perdre du temps sur Strava :
une absence d'interdiction claire n'est pas une autorisation, et une
interprétation favorable d'une clause ambiguë n'est pas un accord. À faire
confirmer par WHOOP avant de coder, pas après.

### Ce que ça change si la clause s'applique telle quelle

Il faudrait lire WHOOP à la demande au lieu de le stocker. Conséquences, toutes
visibles par l'utilisateur :

- **Le coach ne voit rien quand l'athlète n'est pas connecté.** Sans copie
  locale, l'affichage dépend d'un appel à l'API au moment du rendu.
- **Pas d'historique.** Les graphes de tendance, les moyennes sur quatre
  semaines, la comparaison prévu/réalisé supposent des séries conservées.
- **Pas de rapprochement avec les séances.** Aligner une sortie WHOOP sur la
  séance programmée du jour suppose de l'avoir en base.
- **Dépendance à la disponibilité de WHOOP.** Une panne chez eux vide l'écran
  au lieu de montrer la dernière valeur connue.

Autrement dit : WHOOP deviendrait un affichage ponctuel, pas une source du
suivi. C'est une fonctionnalité différente de celle qu'on a construite pour
COROS et Garmin, et il faut le dire à l'athlète plutôt que de lui laisser
croire à un bogue.

---

## L'IA : interdiction explicite, plus nette que partout ailleurs

> 4.2(c) — *« Use any API or WHOOP Data to create, develop, test, train, or
> improve any large language model or other machine learning or AI model,
> application, or system. »*

Les mots *« application, or system »* vont au-delà de l'entraînement de
modèle : ils couvrent raisonnablement le fait d'alimenter un système d'IA, donc
nos appels à Gemini.

**Décision si l'intégration se fait** : `data_source_policies` reçoit une ligne
`whoop` avec `ai_allowed = false`, `coach_visible = true`. Pas par précaution
comme pour COROS, mais sur une clause lue et citée. Le trigger
`apply_source_ai_policy` fait le reste — une donnée WHOOP ne peut alors pas
atteindre Gemini, même par erreur de code.

À noter : il faudra de toute façon ajouter la ligne avant tout import. Une
source absente de `data_source_policies` fait échouer l'insertion, par
construction — une source inconnue est traitée comme interdite, pas comme
permise par défaut.

---

## Autres clauses à retenir

- **4.2(d)** — interdiction de copier, modifier, vendre, sous-licencier ou
  distribuer les données WHOOP à des tiers. Écarte toute présentation publique
  ou jeu de données dérivé, même agrégé.
- **4.2(e)** et **4.2(f)** — ne pas travestir la source des données ni retirer
  les mentions de propriété. L'interface doit nommer WHOOP comme origine.
- **7.1** — à la fin du contrat ou à la coupure de l'accès, supprimer tout
  contenu conservé. Notre mécanisme de retrait de consentement supprime déjà
  les jetons et les données obtenues par eux, donc le comportement existe.
- **2.3** — politique de confidentialité obligatoire, décrivant ce qui est
  collecté et comment c'est partagé. Déjà en place.
- **HIPAA** — interdiction d'utiliser l'API pour des données de santé protégées
  au sens HIPAA sans accord écrit préalable. Sans objet en France, mais à ne
  pas oublier si des athlètes américains arrivent.

---

## Ce qu'il faudrait faire, dans l'ordre

1. **Créer une application Sandbox** (10 membres, immédiat) et connecter un
   compte WHOOP réel. Objectif : voir la forme des données et les en-têtes
   `Cache-Control` renvoyés, qui déterminent ce que la clause 4.2(b) autorise
   réellement à conserver.
2. **Poser la question de la conservation à WHOOP**, par le Dashboard, avant
   d'écrire une ligne de code d'intégration. La réponse décide entre deux
   architectures incompatibles.
3. Selon la réponse : soit le schéma `provider_*` existant s'applique tel quel,
   soit il faut un mode « lecture à la demande » qui n'existe pas aujourd'hui.
4. Ajouter la ligne `whoop` dans `data_source_policies` avant tout import.

**À ne pas faire** : commencer par coder en supposant que le consentement de
l'athlète couvre la conservation. C'est l'erreur Strava, une deuxième fois.

---

*Sources : WHOOP API Terms of Use et documentation développeur, consultées le
27 octobre 2026. Les paliers et les procédures d'approbation bougent —
revérifier avant de s'engager.*
