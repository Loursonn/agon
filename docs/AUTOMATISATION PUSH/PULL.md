# CLAUDE.md — Commandes rapides

## COMMANDE : PUSH

Quand l'utilisateur dit **"PUSH"**, exécute exactement ces étapes dans l'ordre :

1. Vérifie le statut git :
   ```bash
   git status
   ```

2. Ajoute tous les fichiers modifiés :
   ```bash
   git add .
   ```

3. Demande à l'utilisateur : **"Message de commit ?"**
   - Attends sa réponse
   - Si aucune réponse, utilise un message automatique au format : `feat: [résumé des fichiers modifiés] — $(date +%d/%m/%Y)`

4. Crée le commit :
   ```bash
   git commit -m "[message fourni]"
   ```

5. Push sur la branche courante :
   ```bash
   git push origin HEAD
   ```

6. Confirme avec le résultat du push.

---

## COMMANDE : PR

Quand l'utilisateur dit **"PR"**, exécute exactement ces étapes dans l'ordre :

1. Vérifie la branche courante :
   ```bash
   git branch --show-current
   ```

2. Assure-toi que tout est pushé (relance un PUSH si des modifications non committées existent).

3. Demande à l'utilisateur :
   - **"Titre de la PR ?"**
   - **"Description (optionnel) ?"**

4. Crée la Pull Request via GitHub CLI :
   ```bash
   gh pr create --base main --head [branche courante] --title "[titre]" --body "[description]"
   ```

5. Affiche le lien de la PR créée.

---

## NOTES

- La branche principale du projet est `main`
- Toujours pusher sur la branche courante, jamais directement sur `main`
- Si `gh` (GitHub CLI) n'est pas installé, le signaler et donner la commande d'installation :
  ```bash
  winget install --id GitHub.cli
  ```
## COMMANDE : Récup :
Récupère la branche mise à jour de : https://github.com/Loursonn/agon pour que je puisse coder à partir de cette version mise à jour.
Affiche aussi le commit pour savoir ce que mon associé à changé
