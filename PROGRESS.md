# PROGRESS.md - Refonte MyPrepaPro

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

## 🏃 PROMPT 7 - Flexibilité planning + édition séance athlète

### A. Décalage de séance
- [x] Migration SQL `20260507000000_athlete_flexibility.sql` (5 colonnes + contrainte unique + indexes + RLS)
- [x] `useRescheduleWorkout` — UPDATE scheduled_date + flags, optimistic + rollback
- [x] `RescheduleDrawer` dans `ProgramPage` — sélecteur 14 jours, raison, alerte semaine suivante
- [x] Badge "Décalée du {date}" dans `WorkoutDetailPage`
- [x] Marqueur orange dans `CalendarMonthView` (dot plein si coachAlert, contour si rescheduled)
- [x] Badge ⚡ N dans `ContextBar` → lien RetoursPage
- [x] Section "Modifications planning" dans `RetoursPage`

### B. Séance non prévue le jour-J
- [x] `useStartUnplannedSession` — INSERT workout_log avec flags athlète
- [x] Section "Faire une autre séance" dans `TodayPage` (collapsed, liste séances non complétées)
- [x] Badge "N séances aujourd'hui" si conflit jour-J

### C. Édition live (bonus sets + exercices)
- [x] `useAddBonusSet` — PATCH athlete_modifications JSONB, isolé de app_data
- [x] `useAddCustomExercise` — PATCH athlete_modifications JSONB
- [x] `useWorkoutLog` — hook lecture workout_log courant pour une session
- [x] `BonusSetSection` dans `WorkoutDetailPage` — "+ Série" sous chaque exercice
- [x] `ExercisePicker` modal dans `WorkoutDetailPage` — recherche dans table exercises
- [x] Guard : boutons cachés si pas de workoutLogId (séances legacy app_data)
- [x] Isolation surcharge progressive : athlete_modifications ≠ sets legacy → computeAutoProgress non affecté

### Types & QueryKeys
- [x] `AthleteModifications`, `BonusSet`, `CustomExercise` dans `athlete.ts`
- [x] Champs workout_logs mis à jour dans `types.ts`
- [x] `workoutLogsWeek`, `athleteModifications` dans `queryKeys.ts`
- [x] `rescheduledByAthlete`, `coachAlert` dans `WeekSession` (useActivePlan)
- [x] `rescheduledByAthlete`, `coachAlert` dans `UnifiedCalendarEvent`

### Build & lint
- [x] `npm run build` passe (0 erreur)
- [x] `npm run lint` — 0 erreur sur tous les fichiers modifiés
- [ ] ✅ **TEST MANUEL** : reschedule, bonus set, séance non prévue, vue coach

---

**Dernière mise à jour :** 2026-05-07 — PROMPT 7 terminé (TEST MANUEL restant)

---

## ✅ PROMPT 8 - Refonte système de planification (frise périodisation)

### §1 — Suppression Schema A (saisons + planning_blocks)
- [x] Migration `20260510000000_drop_legacy_planning_schema_a.sql` créée
- [x] `usePlanningBlocks.ts` supprimé
- [x] `PlanningOverview.tsx` supprimé
- [x] `PlanningEditor.tsx` supprimé — remplacé par lien vers TimelineView
- [x] `src/types/planning.ts` nettoyé : `Season`, `PlanningBlock`, `BLOCK_TYPE_LABELS` supprimés
- [x] `BlockType` mis à jour : `macrocycle | mesocycle | cycle | microcycle`
- [x] `CompetitionFormModal.tsx` : suppression `season_id`, `planning_block_id`
- [x] `useCompetitions.ts` : suppression `useSeasonCompetitions`
- [x] `ContextBar.tsx` : suppression tab "Saison"
- [x] `PlanningPage.tsx` : refactorisée, type `PlanView` sans "season"
- [x] `ProgPage.tsx` : PlanningEditor remplacé par redirect planning timeline

### §2 — Règles de chevauchement
- [x] Migration `20260510100000_period_overlap_triggers.sql` créée
- [x] Triggers : `check_macrocycle_overlap`, `check_mesocycle_overlap`, `check_cycle_overlap`
- [x] `PeriodConflictDialog.tsx` créé (cascade shift / réduire / annuler)
- [x] `ChildOverflowDialog.tsx` créé (multi-parent / réduire / annuler)

### §3 — Multi-parent (calcul à la volée)
- [x] `useEffectiveParents.ts` créé (hooks `useEffectiveParentsMeso`, `useEffectiveParentsCycle`, `useEffectiveParentsMicro`)
- [x] Secondaire = tout parent du même niveau qui chevauche la plage de l'enfant

### §4 — Changement de parent
- [x] `ChangeParentDialog.tsx` créé

### §5 — Dates snappées + PERIOD_DEFAULTS
- [x] `planningHelpers.ts` créé : `snapMonday`, `snapSunday`, `chainNextStart`, `endFromWeeks`, `computeCascade`
- [x] `PERIOD_DEFAULTS` exporté depuis `src/types/planning.ts` : macro=52, meso=13, cycle=4, micro=1 semaines

### §6 — UX
- [x] §6.a Raccourcis clavier : `usePlanningKeyboardShortcuts.ts` créé (N/←/→/↑/↓/Suppr/Cmd+D/Esc)
- [x] §6.b Boutons dates rapides : `DateQuickAdjust.tsx` créé, intégré dans 3 drawers
- [x] §6.d Breadcrumb : calculé dynamiquement dans TimelineView depuis état drawer + données
- [ ] §6.c Inline creation (+ button en fin de chaque ligne) — non implémenté

### §7 — Réutilisation drawers existants
- [x] `MacrocycleDrawer.tsx` : DateQuickAdjust + prevEndDate intégré
- [x] `MesocycleDrawer.tsx` : DateQuickAdjust + prevEndDate intégré
- [x] `CycleDrawer.tsx` : DateQuickAdjust + prevEndDate intégré

### §8 — Tests Vitest
- [x] `src/__tests__/planning.test.ts` créé — 23 tests
- [x] Overlap detection (4 tests)
- [x] `useEffectiveParentsMeso` + `useEffectiveParentsCycle` (4 tests)
- [x] `snapMonday` / `snapSunday` (3 tests)
- [x] `chainNextStart` / `endFromWeeks` (4 tests)
- [x] `computeCascade` (2 tests)
- [x] `PERIOD_DEFAULTS` (4 tests)
- [x] `npm run test` → 23/23 ✅

### Build & lint
- [x] `npm run build` passe (0 erreur)
- [ ] ✅ **TEST MANUEL** : création/édition périodes, chevauchement, cascade, multi-parent

---

**Dernière mise à jour :** 2026-05-10 — PROMPT 8 terminé (§6.c inline creation + TEST MANUEL restants)

## 🎯 PROMPT 9 - Refonte Banque Spécifique (Sport → Qualité, WOD/Classique, blocs)

- [x] Audit préalable restitué et validé (Option A : extension `energy_sessions`, blocs privés)
- [x] Migration `20260718000000_specifique_sport_quality.sql` (référentiels seedés + colonnes + backfill + `specific_blocks` + RLS)
- [ ] ⚠️ Migration **à déployer** (`npx supabase login` + `npx supabase db push`) — pas de token CLI dispo
- [x] Types `src/types/specific.ts` (+ extension `EnergySessionRow`)
- [x] `QK.specificSports` / `QK.physicalQualities` / `QK.specificBlocks`
- [x] Hooks `useSpecificTaxonomy` (sports/qualités + création custom) et `useSpecificBlocks` (CRUD optimiste)
- [x] Catalogue `SpecificCatalog` : rail sports + compteurs, groupes par qualité, puces, filtres Toutes/Mes/Vérifiées, fix copies athlète exclues
- [x] `SpecificSessionCard` : badges Sport/Qualité/Format/Officiel, actions Attribuer/Modifier/Dupliquer/Supprimer (confirmation + toasts)
- [x] Builder : sélecteurs Sport/Qualité (ajout custom inline), toggle WOD | Classique
- [x] Builder Classique : blocs + exercices/consignes (prescription libre), dnd-kit, aperçu dédié
- [x] Banque de blocs : drawer picker (filtres Sport/Qualité, multi-sélection, insertion), enregistrement d'un bloc depuis le builder, renommage/suppression
- [x] Builder WOD inchangé (IntervalBuilder/SessionPreview/SchemaEditor réutilisés tels quels)
- [x] `npm run build` passe · `npx eslint` 0 erreur sur les fichiers modifiés
- [ ] ✅ **TEST MANUEL** : après déploiement migration — création WOD + Classique, tri, attribution, banque de blocs
- [ ] Visuel athlète pour le format Classique (décidé : plus tard)

**Dernière mise à jour :** 2026-07-18 — PROMPT 9 code terminé (migration à déployer + TEST MANUEL restants)
- [x] Évolution : plus de toggle global WOD/Classique — nouvelle séance spécifique = par blocs, chaque bloc typé Classique ou WOD (mix possible, pastille Mixte), legacy WOD pleine page éditable + bouton « Convertir en blocs »

---

## ✅ Module Fiches (2026-10-14)
- [x] Migration `20261014100000_fiches.sql` (tables, RLS, RPC, bucket privé `docs`) appliquée en prod
- [x] Tests RLS `supabase/tests/fiches_rls.sql` : 29/29 (bloc annulé, sans effet de bord)
- [x] Types + hooks React Query + sync des attributions (programme / énergie)
- [x] Tests unitaires (resolveFicheForWeek, collecte doc_id, retrait fiches perso, compressImage)
- [x] Page coach `/coach/fiches` (banque, import, variantes, archivage, libre-service)
- [x] Rattachement séance / bloc / occurrence / séance énergie (FichePickerDrawer)
- [x] Athlète : viewer, Programme → Fiches, séance, carte du jour, énergie, menu ☰, ajouts, commentaires
- [x] Coach : onglet Fiches de l'espace athlète
- [x] `npm run build` OK ; aucune nouvelle erreur lint / test
- [ ] **TEST MANUEL** des 8 scénarios avec comptes coach / athlète de test (aucun compte de test disponible)

