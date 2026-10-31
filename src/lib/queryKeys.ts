/**
 * Centralized React Query key factory.
 * All keys are typed tuples so cache invalidation is safe to refactor.
 */
export const QK = {
  habits:               (aid: string) => ['habits', aid]               as const,
  habitLogs:            (aid: string) => ['habitLogs', aid]            as const,
  testSessions:         (aid: string) => ['testSessions', aid]         as const,
  energySessions:       ['energy-sessions']                            as const,
  energySession:        (id: string)  => ['energy-sessions', id]       as const,
  energyAssignments:    (aid: string) => ['energy-assignments', aid]   as const,
  nutritionStrategy:    (aid: string) => ['nutritionStrategy', aid]    as const,
  coachFeedback:        (aid: string) => ['coachFeedback', aid]        as const,
  appFeedback:          (aid: string) => ['appFeedback', aid]          as const,
  visibility:           (aid: string) => ['visibility', aid]           as const,
  athleteData:          (aid: string) => ['athleteData', aid]          as const,
  // ── Tests énergétiques structurés ────────────────────────────────────────
  testDefinitions:      (cid: string) => ['testDefinitions', cid]      as const,
  athleteTestResults:   (aid: string) => ['athleteTestResults', aid]   as const,
  athleteCurrentValues: (aid: string) => ['athleteCurrentValues', aid] as const,
  // ── Mensurations / photos ──────────────────────────────────────────────────
  measurementLogs:      (aid: string) => ['measurementLogs', aid]      as const,
  // ── Profil sportif par catégorie ────────────────────────────────────────────
  profileItems:         (aid: string) => ['profileItems', aid]         as const,
  articularProfile:     (aid: string) => ['articularProfile', aid]     as const,
  // ── Compétitions ─────────────────────────────────────────────────────────
  competitions:         (aid?: string) => aid ? ['competitions', aid] : ['competitions'] as const,
  // ── Retours hebdomadaires ─────────────────────────────────────────────────
  weeklyRetours: (athleteId?: string, weekStartDate?: string) =>
    athleteId && weekStartDate
      ? ['weeklyRetours', athleteId, weekStartDate]
      : ['weeklyRetours'],
  // ── Retours mensuels ──────────────────────────────────────────────────────
  monthlyRetours: (athleteId?: string, month?: string) =>
    athleteId && month
      ? ['monthlyRetours', athleteId, month]
      : ['monthlyRetours'],
  // ── Plan actif (mésocycle courant + séances à venir) ─────────────────────────
  activePlan:     (aid: string) => ['activePlan', aid] as const,
  // ── Workout logs (semaine) ────────────────────────────────────────────────────
  workoutLogsWeek: (aid: string, mondayISO: string) => ['workout-logs-week', aid, mondayISO] as const,
  // ── Calendrier unifié (planning coach) — préfixe de useUnifiedCalendar ──────
  cal:            (aid: string) => ['cal', aid] as const,
  calAll:         ['cal'] as const,
  // ── Modifications athlète (reschedule + bonus, pour coach) ───────────────────
  athleteModifications: (aid: string) => ['athleteModifications', aid] as const,
  // ── Lien de première connexion d un athlète pré-créé ─────────────────────────
  exerciseBankMuscles: ["exerciseBankMuscles"] as const,
  muscleVolumeLogs: (aid: string) => ["muscleVolumeLogs", aid] as const,
  athleteClaim: (aid: string) => ["athleteClaim", aid] as const,
  claimInfo: (token: string) => ["claimInfo", token] as const,
  // ── Coach dashboard ───────────────────────────────────────────────────────────
  coachDashboard: {
    today:         (cid: string, date: string) => ['coachDashboard', 'today',         cid, date] as const,
    wellness:      (cid: string, date: string) => ['coachDashboard', 'wellness',      cid, date] as const,
    missed:        (cid: string, date: string) => ['coachDashboard', 'missed',        cid, date] as const,
    planningMargin: (cid: string)               => ['coachDashboard', 'planningMargin', cid]       as const,
    recentRecords:  (cid: string)               => ['coachDashboard', 'recentRecords',  cid]       as const,
    upcomingTests:  (cid: string, date: string) => ['coachDashboard', 'upcomingTests',  cid, date] as const,
    wellnessAlerts: (cid: string, date: string) => ['coachDashboard', 'wellnessAlerts', cid, date] as const,
  },
  // ── Méthodes d'entraînement ───────────────────────────────────────────────────
  trainingMethods: (filters?: object) => ['training_methods', filters ?? {}] as const,
  trainingMethod:  (id: string)       => ['training_methods', id]            as const,
  // ── Banque Spécifique ─────────────────────────────────────────────────────────
  specificSports:    ['specific-sports']    as const,
  physicalQualities: ['physical-qualities'] as const,
  specificBlocks:    ['specific-blocks']    as const,
  // ── Roadmap ───────────────────────────────────────────────────────────────────
  roadmapPhases: ['roadmap-phases'] as const,
  roadmapItems:  (phaseId?: string) => phaseId ? ['roadmap-items', phaseId] : ['roadmap-items'] as const,
  roadmapVotes:  (userId: string)   => ['roadmap-votes', userId]             as const,
  // ── Avis athlètes (retours sur l'app) ─────────────────────────────────────────
  appFeedbackList: ['app-feedback'] as const,
  // ── Tendances athlète (Mon profil) ────────────────────────────────────────────
  athleteInsights: (aid: string, day: string) => ['athlete-insights', aid, day] as const,
  // ── HYROX ─────────────────────────────────────────────────────────────────────
  hyroxResults:    (aid: string) => ['hyroxResults', aid]    as const,
  hyroxResult:     (id: string)  => ['hyroxResult', id]      as const,
  hyroxReferences: ['hyroxReferences']                        as const,
  hyroxPlans:      (aid: string) => ['hyroxPlans', aid]      as const,
  // ── Fiches ────────────────────────────────────────────────────────────────────
  docs:            ['docs'] as const,
  docsBank:        (cid: string) => ['docs', 'bank', cid]          as const,
  docsSelfService: (cid: string) => ['docs', 'self-service', cid]  as const,
  docsByIds:       (ids: string) => ['docs', 'by-ids', ids]        as const,
  doc:             (id: string)  => ['docs', 'one', id]            as const,
  docFamily:       (oid: string) => ['docs', 'family', oid]        as const,
  athleteDocs:     (aid: string) => ['docs', 'athlete', aid]       as const,
  docAssignments:  (oid: string) => ['docs', 'assignments', oid]   as const,
  docComments:     (docId: string, aid: string) => ['docs', 'comments', docId, aid] as const,
  docSignedUrl:    (path: string) => ['docs', 'signed-url', path]  as const,
  // ── Nouveautés de l'app (vue coach) ───────────────────────────────────────────
  appUpdateReads:  (uid: string) => ['app-update-reads', uid] as const,
  appUpdateStats:  ['app-update-stats'] as const,
  // ── Thème du jour ─────────────────────────────────────────────────────────────
  // Deux granularités : une fenêtre (vues calendrier) et un jour (drawer,
  // bandeau athlète). Le préfixe commun rend l'invalidation globale possible
  // après une écriture, sans connaître la fenêtre affichée.
  dayThemesAll:   ['day-themes'] as const,
  dayThemes:      (aid: string) => ['day-themes', aid] as const,
  dayThemesRange: (aid: string, from: string, to: string) =>
    ['day-themes', aid, 'range', from, to] as const,
  dayTheme:       (aid: string, date: string) => ['day-themes', aid, 'day', date] as const,
  /** Derniers thèmes posés par un coach, tous athlètes confondus (raccourcis). */
  dayThemesRecent: (coachId: string) => ['day-themes', 'recent', coachId] as const,
  // ── Point hebdo : lien de réservation du coach ─────────────────────────────────
  coachBooking:   (coachId: string) => ['coach-booking', coachId] as const,
  // ── Conformité RGPD ───────────────────────────────────────────────────────────
  consents:       (uid: string) => ['consents', uid] as const,
  // ── Services connectés (Garmin / COROS) ───────────────────────────────────────
  providerConnections: (uid: string) => ['provider-connections', uid] as const,
  providerActivities:  (aid: string) => ['provider-activities', aid] as const,
  providerDailies:     (aid: string, from: string, to: string) =>
    ['provider-dailies', aid, from, to] as const,
  // ── Staff autour des athlètes ─────────────────────────────────────────────────
  staff:               ['staff'] as const,
  athleteStaff:        (aid: string) => ['staff', 'athlete', aid] as const,
  staffInvitations:    (aid: string) => ['staff', 'invitations', aid] as const,
  myStaffLinks:        (uid: string) => ['staff', 'mine', uid] as const,
  staffInvitation:     (token: string) => ['staff', 'invitation', token] as const,
  staffConsent:        (aid: string) => ['staff', 'consent', aid] as const,
  // ── API coach pour assistant IA (Claude) ──────────────────────────────────────
  coachApiKeys:   (coachId: string) => ['coach-api-keys', coachId] as const,
  coachApiDrafts: (aid: string) => ['coach-api-drafts', aid] as const,
  coachApiHistory: (aid: string) => ['coach-api-drafts', aid, 'history'] as const,
} as const;
