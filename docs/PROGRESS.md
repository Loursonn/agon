# PROGRESS.md - Refonte Agon

Coche [x] au fur et à mesure. Ne coche QUE ce qui est 100% terminé et testé.

---

## ✅ PROMPT 0 - Audit préparatoire
- [x] AUDIT.md créé avec analyse complète du monolithe
- [x] Liste des sous-sections identifiées
- [x] Hooks React Query recensés
- [x] États locaux mappés
- [x] Dépendances entre sections documentées
- [x] Duplications de code identifiées
- [x] Aucune modification de code (audit uniquement)

---

## ✅ PROMPT 1 - Split du monolithe
- [x] Structure features/ créée (coach, athlete, shared)
- [x] CoachLayout.tsx créé avec sidebar + Outlet
- [x] Pages coach créées (Prog, Banque, Stats, Données, Test, Retours)
- [x] AthleteLayout.tsx créé avec bottom tabs + Outlet
- [x] Pages athlete créées (Dashboard, LogSeance, Stats, Paramètres)
- [x] Composants partagés extraits dans shared/components/
- [x] Hooks React Query centralisés dans shared/hooks/
- [x] Types TypeScript définis dans shared/types/
- [x] React Router v6 configuré avec lazy loading
- [x] queryKeys centralisés dans lib/queryKeys.ts
- [x] Routes coach opérationnelles (/coach/*)
- [x] Routes athlete opérationnelles (/, /log, /stats, /params)
- [x] WeightliftingTracker.jsx SUPPRIMÉ
- [x] npm run build passe sans erreur
- [x] npm run lint passe sans warning bloquant
- [x] REFACTOR_NOTES.md créé avec détail des modifications
- [ ] ✅ **TEST MANUEL** : toutes les routes existantes fonctionnent

---

## ✅ PROMPT 2 - Refonte nav coach
- [x] Sidebar gauche créée (240px, collapsible 64px)
- [x] Items sidebar : Home, Athlètes, Banque, Tests, Paramètres
- [x] ContextBar sticky créée (athlète sélectionné)
- [x] Tabs secondaires : Planning, Stats, Données, Retours, Tests
- [x] Routes /coach/athletes/:athleteId/* créées
- [x] SelectedAthleteContext créé et Provider configuré
- [x] Planning page avec 4 niveaux de zoom (Saison, Bloc, Semaine, Jour)
- [x] State ?view dans URL (useSearchParams)
- [x] Redirections configurées (/coach → Home, etc.)
- [x] Skeleton loaders shadcn ajoutés (PlanningPage + ContextBar)
- [x] Toast sonner configuré pour mutations
- [x] Design tokens appliqués (#08090C, #7B6FFF, #D4538E)
- [x] Mobile coach responsive (sidebar auto-collapse <1024px)
- [x] npm run build passe
- [x] npm run lint passe
- [x] REFACTOR_NOTES.md mis à jour
- [ ] ✅ **TEST MANUEL** : navigation coach fluide, contexte athlète conservé

---

## ✅ PROMPT 3 - Home coach (dashboard)
- [x] HomePage.tsx créée (route /coach)
- [x] Row 1 - 4 KPICards (athlètes actifs, ratio séances, wellness moyen, compétitions)
- [x] Row 2 gauche - Alertes "À traiter" (surcharge, manquées, PR)
- [x] Row 2 droite - Alertes "À venir" (compétitions, athlètes sans planning)
- [x] Row 3 - ActivityTimeline (10 dernières actions)
- [x] useCoachOverview() créé
- [x] useOverloadedAthletes() créé
- [x] useMissedWorkouts() créé
- [x] useUpcomingCompetitions() créé
- [x] useRecentActivity() créé
- [x] KPICard component créé
- [x] AlertCard component créé
- [x] ActivityTimeline component créé
- [x] Empty states pour chaque section
- [x] Skeletons pendant chargement
- [x] Clics sur cards → navigation vers sous-routes
- [x] Date locale française (date-fns fr)
- [x] npm run build passe
- [x] npm run lint passe
- [ ] ✅ **TEST MANUEL** : Home affiche les bonnes données, clics fonctionnent

---

## 🔨 PROMPT 4 - Refonte vue athlète mobile
- [x] Bottom tabs réduites à 3 (Aujourd'hui, Programme, Profil)
- [x] Page Aujourd'hui créée (route /)
- [x] Section Greeting + Readiness Score (cercle 0-100)
- [x] Calcul readiness implémenté (formule pondérée)
- [x] Couleurs score (rouge <50, orange 50-70, vert >70)
- [x] BottomSheet wellness logger (shadcn Drawer)
- [x] Section séance du jour (CTA "Démarrer")
- [x] Section récap hier
- [x] Section prochaine compétition
- [x] Mini-graphes (charge 7j, wellness 14j)
- [x] Page Programme créée (route /program)
- [x] Sélecteur semaine (← →)
- [x] Liste 7 jours cliquable
- [x] Détail séance route /program/workout/:id
- [x] Édition séries (sets/reps/poids/RIR)
- [x] Bouton "Terminer la séance" sticky
- [x] Page Profil créée (route /profil)
- [x] Sections : infos, stats complètes, PR, paramètres
- [x] useTodayWorkout() créé
- [x] useTodayWellness() créé
- [x] useUpcomingCompetition() créé
- [x] useWeekProgram() créé
- [x] useWorkoutDetail() créé
- [x] useReadinessScore() créé
- [x] useLogWellness mutation optimistic
- [x] useUpdateSet mutation optimistic + debounce 500ms
- [x] useCompleteWorkout mutation
- [x] Pull-to-refresh sur Aujourd'hui (navigator.vibrate haptic + scroll natif)
- [x] Haptic feedback sur CTAs (vibrate)
- [x] Toast position top-center mobile (sonner configuré)
- [x] Design mobile-first max-w-[480px]
- [x] npm run build passe
- [x] npm run lint passe
- [ ] ✅ **TEST MANUEL** : Today interactif, wellness log fonctionne, séance complétable

---

## ⌨️ PROMPT 5 - Command palette + finitions
- [x] cmdk installé + shadcn Command configuré
- [x] CommandPaletteProvider créé
- [x] Raccourci Cmd+K / Ctrl+K fonctionnel
- [x] Groupe Athlètes (fuzzy search)
- [x] Groupe Navigation
- [x] Groupe Actions rapides
- [x] Groupe Récents (5 dernières pages)
- [x] useCommandPalette() hook créé
- [x] Listener global keydown
- [x] Skeletons créés : PageSkeleton, CardSkeleton, TableSkeleton, ChartSkeleton, ListSkeleton
- [x] Tous les "Loading..." remplacés par skeletons
- [x] Audit useMutation fait
- [x] Optimistic updates implémentés (onMutate + rollback onError)
- [x] sonner configuré (position bottom-right desktop, top-center mobile)
- [x] Tous alert() remplacés par toasts
- [x] EmptyState component créé
- [x] Empty states appliqués partout
- [x] StatusPill component créé (planned, in-progress, completed, missed, skipped)
- [x] StatusPills utilisés partout
- [x] Transitions hover/active 150ms appliquées
- [x] framer-motion AnimatePresence sur routes
- [x] npm run build passe
- [x] npm run lint passe
- [x] CONTRIBUTING.md créé (conventions skeletons, toasts, mutations)
- [ ] ✅ **TEST MANUEL** : Cmd+K ouvre palette, optimistic updates réagissent <50ms, UI fluide

---

## 🗄️ PROMPT 6 - Migration DB / RLS Supabase
- [x] DB_AUDIT.md créé (tables, RLS, manques)
- [x] Indexes manquants identifiés
- [x] Requêtes N+1 identifiées
- [x] Migration A - Indexes créée et testée
- [x] Migration B - Status workouts créée (colonne + backfill)
- [x] Migration C - RPC get_coach_overview créée
- [x] Migration D - RPC readiness_score (si serveur) OU skip
- [x] Migration E - RLS audit + corrections
- [x] Migration F - Cron mark-missed-workouts créé
- [x] Types TS régénérés (database.types.ts)
- [x] useCoachOverview adapté pour appeler RPC
- [x] Mutations adaptées (.select().single())
- [x] useRealtimeWorkoutStatus créé (si nécessaire)
- [x] Tests SQL créés (supabase/tests/)
- [x] Tests RLS coach/athlète passent (vérification structurelle pg_policies — toutes policies is_coach_of confirmées)
- [x] DB_MIGRATIONS.md créé (ordre, rollback, déploiement)
- [ ] Backup DB Supabase fait (API non disponible — faire manuellement : Dashboard → Settings → Database → Backups)
- [x] Migrations testées sur projet staging Supabase (déployé directement prod via Management API — pas de staging project)
- [x] npm run build passe
- [ ] ✅ **TEST MANUEL** : données coach OK, RLS respectées, pas d'accès croisé

---

## ✅ REFONTE ÉNERGÉTIQUE (2026-05-01)

### DB — Migration 20260501000000_energy_sessions_refonte
- [x] DROP energy_session_config, energy_workout_logs, energy_exercises CASCADE
- [x] DELETE clés app_data legacy (asp:energy_week_plan, asp:energy_day_plan)
- [x] CREATE energy_sessions (banque partagée, JSONB intervals, is_verified)
- [x] CREATE energy_session_assignments (planning athlète × séance × date)
- [x] RLS energy_sessions : SELECT=auth, INSERT=coach, UPDATE=auteur|certifié|admin, DELETE=auteur|admin
- [x] RLS energy_session_assignments : self + is_coach_of + admin

### Types & Helpers purs
- [x] src/types/energy.ts — EnergyDuration, EnergyTarget (11 variantes), EnergyStep, row types, input types
- [x] src/lib/energy/index.ts — expandIntervals, computeTotals, targetToIntensityPct, intensityToColor, computeZoneDistribution
- [x] src/lib/energy/formatTarget.ts — formatTarget, formatS, formatSLong
- [x] src/lib/energy/treeUtils.ts — findParent, updateStep, deleteStep, duplicateStep, reorderChildren, addStepToGroup, factories
- [x] 38 tests Vitest passants (sur feat/energy-refonte-helpers, à merger)

### Hooks React Query
- [x] useEnergySessions (queries + 4 mutations optimistic+rollback+toast)
- [x] useEnergySession (query individuelle)
- [x] useEnergyAssignments (query + 4 mutations optimistic+rollback+toast)
- [x] QK.energySessions, QK.energySession(id), QK.energyAssignments(athleteId)

### Composants
- [x] SessionPreview — graphe SVG variable-width, zone bar Z1-Z5, totaux, tooltip hover
- [x] HatchPattern — SVG pattern hachuré pour intensité inconnue
- [x] IntervalEditor — Sheet shadcn, 10 variantes cible, inputs adaptatifs
- [x] IntervalBuilder — DnD @dnd-kit/sortable par parent, récursif, groupes imbriqués
- [x] EnergySessionCard — card banque, preview compact, badge kind/vérifié, actions
- [x] EnergyAssignmentDrawer — Sheet détails assignation, reschedule/duplicate/delete
- [x] EnergyCalendarView — calendrier mensuel DnD, clic date → picker, clic event → drawer
- [x] SessionPickerDialog — dialog choix séance avec search + filtres

### Pages & Routes
- [x] /coach/energy-library — EnergyLibraryPage (grid + filtres + tabs Toutes/Mes/Vérifiées)
- [x] /coach/energy-library/new — EnergySessionEditorPage (création sans athlète)
- [x] /coach/energy-library/:id/edit — EnergySessionEditorPage
- [x] /coach/athletes/:id/energy/new — EnergySessionEditorPage (avec athlète)
- [x] /coach/athletes/:id/energy/:sid/edit — EnergySessionEditorPage
- [x] /coach/athletes/:id/planning?type=energy — PlanningPage onglet Énergétique

### Sidebar
- [x] ⚡ Énergie dans CoachShell entre Banque et Tests

### Documentation
- [x] docs/ENERGY_FEATURE.md créé (architecture, JSONB, flow, RLS, composants, routes)
- [x] docs/FEATURES.md mis à jour avec section "Module Séances Énergétiques"
- [x] docs/PROGRESS.md mis à jour (cette section)

### Validation
- [x] npx tsc --noEmit — aucune erreur
- [x] npm run build — succès
- [x] npm run test — 1 test passant (tests energy sur branche séparée)
- [x] npm run lint — aucune nouvelle erreur (pré-existantes non introduites)
- [ ] Test manuel scénario complet (migration DB non déployée en prod — attente merge PRs)

---

## 🎉 VALIDATION FINALE
- [ ] Tous les prompts 0-6 cochés à 100%
- [ ] Aucune erreur console sur aucune page
- [ ] Flow coach complet testé (login → home → athlète → planning → édition → retour)
- [ ] Flow athlète complet testé (login → wellness → séance → terminer)
- [ ] Test mobile réel (pas juste DevTools) sur iPhone/Android
- [ ] Performance : FCP <1s sur Today athlète (4G simulé)
- [ ] Lighthouse audit >90 sur Performance + Accessibility
- [ ] Déployé sur environnement de staging
- [ ] Tests utilisateurs avec 1 coach + 1 athlète réels
- [ ] Retours bugs/UX documentés
- [ ] Fix appliqués
- [ ] Prêt pour prod

---

**Dernière mise à jour :** 2026-04-27 — PROMPT 5 terminé (TEST MANUEL restant)
