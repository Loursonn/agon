---
name: preparer-pr
description: Prépare et ouvre la pull request dev → main (mise en production). Déclencheurs - « PR », « mise en prod », « ouvre la PR ».
---

# PR `dev` → `main`

Rythme : environ tous les 3 lots, pas après chaque prompt.

1. Tout est poussé (skill `pousser` sinon).
2. Intégrer `main` d'abord — les merges précédents créent des divergences qui cassent le build Vercel sans marqueur de conflit visible :
   ```bash
   git fetch origin
   git merge origin/main --no-edit
   npm run check
   git push origin dev
   ```
3. Lister ce qui part en prod : `git log --oneline origin/main..origin/dev`.
4. Points de vigilance à écrire dans la PR :
   - migrations SQL : lesquelles sont déjà appliquées en prod, lesquelles sont à appliquer **après** le merge ;
   - Edge Functions à (re)déployer et dans quel ordre par rapport au merge ;
   - secrets / variables à poser.
5. Une PR dev → main déjà ouverte ? La mettre à jour (`gh pr edit`) plutôt que d'en créer une seconde.
6. ```bash
   gh pr create --base main --head dev --title "…" --body "$(cat <<'BODY'
   ## Résumé
   - …

   ## Après le merge
   - …

   ## Test
   - [ ] …

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   BODY
   )"
   ```
7. Donner le lien. C'est Hugo qui relit et merge.
