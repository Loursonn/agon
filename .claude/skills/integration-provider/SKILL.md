---
name: integration-provider
description: Travailler sur les intégrations montres / plateformes (COROS, Garmin, Whoop, Strava…) - OAuth, synchro, webhooks, déconnexion. Déclencheurs - « Garmin », « Coros », « montre », « synchro », « provider ».
---

# Intégrations provider

Lire d'abord : `docs/integrations/README.md`, le fichier du provider (`COROS_INTEGRATION.md`, `GARMIN_DOSSIER.md`…), les entrées 2026-10 de `docs/DECISIONS.md`, la section Garmin/Coros de `docs/AUDIT_REFONTE_2026-11.md`.

## Tables
- `provider_connections` : jetons (lecture seule pour l'athlète ; écriture par Edge Functions seulement).
- `provider_activities` : activités ; l'athlète n'écrit que `source = 'file_import'`.
- Consentement montre demandé à la connexion, revérifié à chaque synchro.

## Règles qui ne bougent pas
- OAuth2 avec PKCE ; `state` vérifié ; callback qui redirige vers `APP_URL`.
- Jetons rafraîchis avant expiration, sous verrou (deux synchros simultanées ne doivent pas consommer le même refresh token).
- Une erreur réseau ou API n'est **jamais** traitée comme « 0 activité » ; le curseur de synchro n'avance que sur succès.
- Doublons inter-sources refusés à l'insertion (même sport, départ à ±2 min).
- Chaque chiffre affiché nomme sa source ; mesure absente = « — ».
- Données Garmin : jamais envoyées à l'IA ; attribution « Garmin [appareil] » à l'écran.
- Déconnexion : révoquer côté provider, supprimer les jetons ; endpoints de désinscription et de changement de permissions (Garmin) obligatoires.
- Export RGPD et suppression de compte couvrent les données provider (skill `rgpd-check`).

## Tester
Tests unitaires des décodeurs et du mapping dans `src/lib/__tests__` ; fichiers d'exemple anonymisés seulement. Synchro réelle uniquement avec le compte de Hugo ou un compte de démo.
