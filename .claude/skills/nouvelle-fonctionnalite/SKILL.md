---
name: nouvelle-fonctionnalite
description: Démarche pour construire une fonctionnalité dans Agon, de la question à la livraison. Déclencheurs - « ajoute », « nouvelle fonctionnalité », « je veux que le coach / l'athlète puisse… ».
---

# Nouvelle fonctionnalité

1. **Comprendre avant de coder** (règle des 95 %) : qui (coach, athlète, staff, co-coach), sur quel écran (PC coach / téléphone athlète), quelles données, que se passe-t-il hors ligne. Poser les questions avec l'outil de question.
2. **Lire** : `docs/AUDIT_REFONTE_2026-11.md` (zones fragiles), la doc `docs/*_FEATURE.md` concernée, les décisions récentes de `docs/DECISIONS.md`.
3. **Données** :
   - nouvelle table → skill `migration-bdd` (RLS via `is_coach_of`, tests SQL) ;
   - ne pas ajouter de clé dans `app_data` ni d'écriture « miroir » entre `app_data` et les tables relationnelles ;
   - accès via un hook React Query, clé dans `src/lib/queryKeys.ts`, invalidation ciblée après mutation.
4. **Code** : page dans `src/features/<rôle>/pages`, composants dans `components/`, logique pure dans `src/lib/` **avec son test**. TypeScript.
5. **Saisie athlète** : ne jamais perdre une saisie — brouillon local (`src/lib/localDraft.ts`), retry, message clair si hors ligne.
6. **Vérifier** : `npm run check`, puis l'écran dans le navigateur avec les comptes de démo (jamais de vrais athlètes). Coach et athlète si les deux sont touchés, largeur téléphone pour l'athlète.
7. **Livrer** : skill `release-notes`, entrée dans `docs/DECISIONS.md` si un choix structurant a été fait, puis skill `pousser`.
