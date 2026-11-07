---
name: rgpd-check
description: Vérifie qu'une nouvelle donnée personnelle ou de santé est correctement protégée, exportable et supprimable. Déclencheurs - nouvelle table ou colonne avec des données d'athlète, nouveau bucket Storage, nouvelle intégration, « RGPD », « données de santé ».
---

# Vérification RGPD

Agon traite des **données de santé** (blessures, wellness, poids, fréquence cardiaque…). Pour chaque nouvelle donnée :

1. **Accès** : RLS — l'athlète, ses coachs (`is_coach_of`), le staff autorisé (`staff_can`), personne d'autre. Rien pour `anon`. Bucket Storage privé, chemin préfixé par l'uuid de l'athlète.
2. **Suppression du compte** : `supabase/functions/delete-account` — la ligne part-elle en cascade ? Le bucket est-il dans `USER_BUCKETS` et dans `list_user_storage_objects` ?
3. **Export** : `src/lib/dataExport.ts` inclut-il la donnée ?
4. **Finalité** : texte de `src/lib/legal.ts` (politique de confidentialité) à jour si la donnée ou le destinataire est nouveau (ex. nouveau provider, nouvel appel IA).
5. **IA** : la donnée est-elle envoyée à Gemini ? Si oui, est-ce dit dans la politique ? Les données Garmin ne doivent jamais y aller.
6. **Logs** : aucune donnée personnelle dans les `console.log` des Edge Functions.

Rendre un tableau court : point, statut (OK / à faire), fichier à modifier.
