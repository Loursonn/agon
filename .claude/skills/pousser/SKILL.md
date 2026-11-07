---
name: pousser
description: Sauvegarde le travail sur la branche dev (vérifications, commit, push). Déclencheurs - « PUSH », « pousse », « sauvegarde sur dev », « commit ».
---

# Pousser sur `dev`

1. `git branch --show-current` doit afficher `dev`. Sinon, s'arrêter et demander.
2. `git status --short`. Ne **jamais** ajouter : `.claude/settings.local.json`, `supabase/.temp/`, `.env*`, fichiers de test perso. Ajouter fichier par fichier (`git add <fichiers>`), jamais `git add .`.
3. Lot visible par les coachs ? Vérifier qu'une entrée existe dans `src/data/releaseNotes.ts` (skill `release-notes`).
4. `npm run check` (typecheck + lint + tests + build). Rouge → corriger avant de pousser.
5. Message : `type(scope): résumé` (feat, fix, refactor, chore, docs, test), corps si le « pourquoi » n'est pas évident, puis la ligne `Co-Authored-By:` du modèle Claude utilisé. Demander le message à l'utilisateur seulement s'il veut le choisir ; sinon le rédiger.
6. `git push origin dev`. Refusé (l'autre dev a poussé) → `git pull origin dev --rebase`, lire les deux versions de chaque conflit avant de trancher, `npm run check`, repousser. Jamais `--force`.
7. Donner le hash et le lien du commit.
