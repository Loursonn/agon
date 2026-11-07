---
name: recuperer
description: Récupère la dernière version de la branche dev depuis GitHub et montre ce que l'associé a changé. Déclencheurs - « Récup », « récupère », « mets-moi à jour », début de session.
---

# Récupérer `dev`

1. Si des fichiers sont modifiés localement (`git status --short`), les lister et **demander** avant de continuer : la suite les efface. Proposer `git stash` s'ils doivent être gardés.
2. ```bash
   git checkout dev
   git fetch origin
   git log --oneline HEAD..origin/dev
   git reset --hard origin/dev
   ```
3. Résumer en français, en une ligne par commit, ce qui a changé (`git log --stat HEAD@{1}..HEAD` pour les fichiers touchés). Signaler toute nouvelle migration dans `supabase/migrations/` : elle est peut-être déjà appliquée en prod, ou pas — ne jamais la rejouer sans demander.
4. `npm ci` si `package-lock.json` a changé, puis `npm run dev` (un seul serveur, port 5173) et vérifier que l'app charge.
