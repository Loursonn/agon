---
name: edge-function
description: Écrire, tester et déployer une Edge Function Supabase (Deno) d'Agon. Déclencheurs - « edge function », « fonction serveur », « déploie la fonction », modification de supabase/functions/.
---

# Edge Function

## Écrire
- `supabase/functions/<nom>/index.ts`. Code partagé dans `supabase/functions/_shared/` — attention, une partie est aussi importée par le front (décodeurs FIT) : rester compatible navigateur.
- Authentifier l'appelant : lire le JWT, `supabase.auth.getUser()`, puis vérifier le droit (ex. `is_coach_of`) avant d'utiliser la clé `service_role`.
- Webhooks entrants (Garmin…) : vérifier la signature / le secret, répondre vite (200), traiter ensuite ; idempotent (même notification reçue deux fois = un seul effet).
- Jamais de secret en dur : `Deno.env.get(...)`, posé avec `supabase secrets set` (demander avant).
- Logs sans donnée personnelle (pas d'email, pas de contenu santé).

## Déployer
1. `pwd` : le dossier courant doit contenir le bon code (le CLI empaquette `supabase/functions/` du dossier courant, quelle que soit la branche).
2. `grep` dans le fichier le symbole que tu viens d'ajouter.
3. Le contrat d'appel change (champ obligatoire, nouveau refus) ? `git rev-list --count origin/main..origin/dev` : si le client de prod ne l'envoie pas encore, attendre le merge ou rendre le changement tolérant.
4. **Demander** avant de déployer, puis `supabase functions deploy <nom>`.
5. Tester l'appel réel (compte de démo) et lire les logs dans le dashboard Supabase.
