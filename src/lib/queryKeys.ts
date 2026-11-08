/**
 * Clés React Query encore partagées hors de `src/api/`.
 *
 * Les clés vivent désormais dans chaque module (`<entité>Keys`, CLAUDE.md) ;
 * ne restent ici que celles encore lues ou invalidées par `QK.*`. Les valeurs
 * sont inchangées : elles servent de préfixes d'invalidation.
 */
export const QK = {
  testSessions:         (aid: string) => ['testSessions', aid]         as const,
  energySessions:       ['energy-sessions']                            as const,
  energyAssignments:    (aid: string) => ['energy-assignments', aid]   as const,
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
  // ── Coach dashboard ───────────────────────────────────────────────────────────
  coachDashboard: {
    planningMargin: (cid: string) => ['coachDashboard', 'planningMargin', cid] as const,
  },
  // ── Fiches ────────────────────────────────────────────────────────────────────
  docs:            ['docs'] as const,
  // ── Thème du jour ─────────────────────────────────────────────────────────────
  // Deux granularités : une fenêtre (vues calendrier) et un jour (drawer,
  // bandeau athlète). Le préfixe commun rend l'invalidation globale possible
  // après une écriture, sans connaître la fenêtre affichée.
  dayThemes:      (aid: string) => ['day-themes', aid] as const,
  dayThemesRange: (aid: string, from: string, to: string) =>
    ['day-themes', aid, 'range', from, to] as const,
  dayTheme:       (aid: string, date: string) => ['day-themes', aid, 'day', date] as const,
  /** Derniers thèmes posés par un coach, tous athlètes confondus (raccourcis). */
  dayThemesRecent: (coachId: string) => ['day-themes', 'recent', coachId] as const,
  // ── Staff autour des athlètes ─────────────────────────────────────────────────
  staff:               ['staff'] as const,
} as const;
