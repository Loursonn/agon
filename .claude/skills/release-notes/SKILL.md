---
name: release-notes
description: Ajoute une entrée au fil « Nouveautés » des coachs après un lot livré. Déclencheurs - fin d'une fonctionnalité ou d'un correctif visible, « ajoute une nouveauté », avant un push.
---

# Entrée « Nouveautés »

Fichier : `src/data/releaseNotes.ts`. Les coachs lisent ces entrées dans l'app et cliquent « J'ai vu ».

- Entrée la plus récente **en tête** du tableau.
- `id` unique daté : `AAAA-MM-JJ-mot-cle`.
- `kind: "feature"` (badge NOUVEAUTÉ) **ou** `kind: "fix"` (badge CORRECTIF). Un lot mixte = deux entrées.
- Titre court ; texte qui dit ce que ça change pour un coach, sans jargon (pas de « RLS », « hook », « migration »).
- Regrouper les petits correctifs d'une même session dans une seule entrée `fix`.
- Copier la forme exacte des entrées existantes (champs, date).
