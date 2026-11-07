> **Document historique** (époque du monolithe `WeightliftingTracker`) — ne plus s'y fier. État actuel : `CLAUDE.md` et `docs/AUDIT_REFONTE_2026-11.md`.

# Architecture technique

---

## Stack

| Couche | Outil | Version |
|--------|-------|---------|
| Frontend | React + Vite | React 18, Vite 5 |
| Langage | TypeScript | 5.x |
| UI | shadcn/ui + Tailwind CSS | — |
| Backend / BDD | Supabase (PostgreSQL) | supabase-js ^2 |
| Auth | Supabase Auth | intégré |
| IA | Google Gemini 2.5 Flash | via Edge Function |
| Routing | React Router v6 | — |
| Data fetching | TanStack React Query v5 | — |
| Charts | Recharts | ^2 |
| Formulaires | React Hook Form + Zod | — |
| Mobile (cible future) | React Native + Expo | pas encore démarré |

---

## Composant principal

Toute l'application vit actuellement dans un seul fichier :

```
src/components/WeightliftingTracker.jsx   (~2500 lignes)
```

Ce composant exporte une fonction `App({ athleteId, defaultMode, canToggleMode, userName })` et gère :
- La vue coach (onglets : Prog, Exos, Banque, Config, Stats, Données)
- La vue athlète (onglets : Accueil, Séance, Stats)
- Tout le state local (exercices, séances, sets, wellness, etc.)
- La persistance via Supabase (table `app_data`, clé-valeur JSONB)

**Pourquoi un seul fichier ?** C'est un prototype Lovable. La refactorisation est prévue (voir `FEATURES.md` phase 2).

---

## Routing

```
/             → RoleRedirect (redirige selon le rôle)
/login        → Login.tsx
/coach        → ProtectedRoute > CoachDashboard > WeightliftingTracker (mode coach)
/athlete      → ProtectedRoute > AthleteDashboard > WeightliftingTracker (mode athlete)
/invite/:token → InviteAccept.tsx
```

---

## Authentification

- Supabase Auth (email + password)
- Hook `useAuth()` dans `src/hooks/useAuth.tsx`
- Table `profiles` : contient le rôle (`coach`, `athlete`, `coach_athlete`) et le `coach_id`
- `ProtectedRoute` : redirige vers `/login` si non connecté
- `RoleRedirect` : redirige vers `/coach` ou `/athlete` selon le rôle

---

## Persistance des données

**Actuellement** : une seule table Supabase `app_data` (clé-valeur JSONB).

Les données sont lues/écrites via deux helpers dans `WeightliftingTracker.jsx` :
```javascript
sLoad(key, fallback, athleteId)   // lecture
sSave(key, value, athleteId)      // écriture
```

Chaque athlète a ses propres données isolées via `athleteId`.

**Clés stockées** :
| Clé | Contenu |
|-----|---------|
| `exos` | exercices par séance `{ sessId: [Exercise] }` |
| `sets` | performances `{ "exId_week": [Set] }` |
| `completed` | séances complétées `{ week: [sessId] }` |
| `sessions` | structure des séances |
| `blockConfig` | config du bloc (semaines, deload, tier config) |
| `wellness` | wellness du jour |
| `wellnessHistory` | historique wellness |
| `bw` | poids corporel |
| `goals` | objectifs |
| `injuries` | blessures |

---

## Types d'exercices

| Type | Couleur | Affiche kg/séries/RIR |
|------|---------|----------------------|
| `muscu` | violet `#7B6FFF` | oui |
| `halterophilie` | violet `#8b5cf6` | oui (même logique que muscu) |
| `plio` | orange `#F5A623` | non (reps/sets seulement) |
| `mobilite` | vert `#22C993` | non (durée/sets) |

---

## Système de tiers

Les exercices sont classés en 3 tiers qui définissent la progression automatique :

| Tier | Type | Mode progression | Exemples |
|------|------|-----------------|----------|
| 1 | Composé lourd | RIR décroissant | Squat, Bench, Traction |
| 2 | Accessoire | Reps croissantes | Hack squat, Dips |
| 3 | Isolation | Charge fixe/croissante | Leg extension, Élévations |

Config dans `blockConfig.tierConfig` (ou `DEF_TIER_CONFIG` par défaut).

---

## Surcharge progressive automatique

Quand une séance est marquée comme terminée (`completeSession()`), la fonction `autoProgressOnComplete()` recalcule automatiquement toutes les semaines futures en se basant sur les performances réelles (kg, reps, RIR enregistrés).

---

## Variables d'environnement

```
VITE_SUPABASE_URL              URL du projet Supabase
VITE_SUPABASE_PUBLISHABLE_KEY  Clé anonyme Supabase (publique, safe côté client)
```

Le fichier `.env` n'est jamais commité (dans `.gitignore`).

---

## Déploiement

- **Hébergeur** : Vercel
- **Déclencheur** : push sur `main` → Vercel redéploie automatiquement
- **Config** : `vercel.json` → rewrite SPA (`/*` → `/index.html`)
- **Env vars** : à configurer dans Vercel Dashboard → Settings → Environment Variables
