> **Document historique** (époque du monolithe `WeightliftingTracker`) — ne plus s'y fier. État actuel : `CLAUDE.md` et `docs/AUDIT_REFONTE_2026-11.md`.

# Audit — WeightliftingTracker.jsx

> Fichier audité : `src/components/WeightliftingTracker.jsx`  
> Taille réelle : **1 301 lignes** (commentaire CLAUDE.md à corriger : il indique ~2500)  
> Date d'audit : 2026-04-27

---

## 1. Sous-sections logiques

### Composants helpers (hors `App`)

| Lignes | Nom | Rôle |
|--------|-----|------|
| 40–114 | `DataManager` | Suppression sélective de données (séances, logs, wellness, blessures) |
| 116–156 | `BlockHistoryViewer` | Plein écran d'historique des blocs archivés |

### Composant principal `App` (export default)

| Lignes | Section | Détail |
|--------|---------|--------|
| 1–30 | **Imports** | React, Supabase, recharts, libs locales, composants enfants (20+ imports) |
| 158–161 | **Props & Auth** | Déclaration props (`athleteId`, `defaultMode`, `viewOnly`…) + `useAuth()` |
| 162–201 | **Déclaration états** | ~60 `useState`, 1 `useRef` (timer), `timerRef` |
| 203–260 | **Effets de chargement** | 6 `useEffect` : données locales, énergie Supabase, wellness reset, habits, coach feedback, tests + visibilité |
| 261–297 | **Wrappers save/set** | Setters `setExos`, `setSets`, `setSessions`… qui persiste via `save()` + `flash()` |
| 298–325 | **`archiveAndNewBlock`** | Archive le bloc courant et en démarre un nouveau |
| 327–338 | **`applyAIEdit`** | Fusionne les exercices générés par l'IA dans les séances |
| 333–339 | **`saveWellness`** | Sauvegarde le bilan du jour + mise à jour poids + milestone |
| 341–365 | **Calculs dérivés** (`useMemo`) | `allMethods`, `tw`, `weeksArr`, `isDeload`, `weeklyTarget`, `currentWeek`, `totalTarget`, `streak`, `weekAdherence`, `motivMsg`, `prs`, `muscSets`, `combinedData`, `activeInjuries` |
| 366–455 | **Progression automatique** | `computeAutoProgress`, `autoProgressOnComplete`, `useEffect` sync au chargement, `completeSession`, `uncompleteSession` |
| 456–472 | **Helpers UI / tabs** | `bankAddEx`, `bankAddMsg`, `handleBankAdd`, `showTierModal`, `showExoParams`, définition de `coachTabs`, `athTabs`, `tabS` |
| 473–474 | **Loading screen** | Rendu conditionnel si `!loaded` |

---

### Vue Athlète

| Lignes | Section | Détail |
|--------|---------|--------|
| 477–710 | **Drawer profil athlète** | Profil, données sportives, poids, wellness, 1RM, blessures, retour coach, objectifs, déconnexion |
| 711–720 | **Modal déconnexion** | Confirm dialog logout |
| 721 | **Modal Wellness Flow** | `WellnessFlow` (plein écran) conditionné par `showWellness` |
| 722–765 | **Modal feedback app** | `AppFbForm` composant inline (avec ses propres `useState` locaux) |
| 766–778 | **Notifications flottantes** | `milestoneNotif`, `autoProgNotif`, `weekJustCompleted`, timer overlay |
| 780–795 | **Header global** | Logo, save status, toggle coach/athlete, bouton profil |
| 1183–1187 | **Bannière séance active** | Bouton flottant "Reprendre" si session en cours (lecture localStorage) |
| 1189–1253 | **`tab="dash"` — Dashboard** | Bonjour, blessures, wellness du jour, WeekCalendar, nutrition résumé, prochaine séance, HabitDashboard |
| 1255–1265 | **`tab="log"` — Séance** | Sous-onglets muscu/énergie/spécifique → `LogView`, `EnergySessionLog` |
| 1268 | **`tab="alim"` — Alimentation** | `NutritionView` |
| 1270 | **`tab="test"` — Tests** | `TestSessionView` |
| 1272 | **`tab="retours"`** | `RetoursView` |
| 1274–1297 | **`tab="coachfeedback"`** | Vue retours du coach (pseudo-tab, navigation programmatique depuis le drawer) |

---

### Vue Coach

| Lignes | Section | Détail |
|--------|---------|--------|
| 797–842 | **CSS coach layout** | `<style>` inline responsive (sidebar, content) |
| 843–882 | **Sidebar coach** | Nav icônes/labels, info athlète, badge save |
| 884–946 | **`coachTab="prog"` — Programmation** | Config bloc (nom, dates, durée, deload), `CoachFourWeekCalendar`, sous-onglets : Planification / Musculation / Énergétique / Spécifique |
| 928 | `progSubTab="planification"` | `PlanningEditor` |
| 929–943 | `progSubTab="muscu"` | `CoachProgramEditor` + `CoachExoParams` |
| 944 | `progSubTab="energie"` | `CoachEnergyProgram` |
| 945 | `progSubTab="specifique"` | Placeholder |
| 947–957 | **`coachTab="banque"` — Banque** | Sous-onglets muscu (`ExerciseBank`) / énergie (`EnergyExerciseBank`) |
| 958–1017 | **`coachTab="stats"` — Stats** | `PlanningOverview`, 1RM Big3, poids, `MuscleVolumeCard`, blessures, comptes rendus séances |
| 1018–1176 | **`coachTab="data"` — Données** | Toggle habits, profil athlète, stratégie nutritionnelle, `PerformanceProfile`, `CoachPerfNotification`, `CoachConfig`, avis app, `DataManager` |
| 1177 | **`coachTab="test"`** | `TestSessionView` (isCoach=true) |
| 1178 | **`coachTab="retours"`** | `CoachWeeklyFeedback` |

---

## 2. Hooks React Query

**Aucun hook React Query n'est utilisé** dans ce fichier. Toutes les lectures et écritures BDD passent par :
- `useEffect` + `supabase.from(...).select()` directement
- Setters wrappés qui appellent `save(key, val)` → `sSave()` → Supabase upsert

```js
// Exemple fetch direct (ligne 214–224)
supabase.from('app_data').select('value')
  .eq('athlete_id', athleteId).eq('key', 'asp:energy_week_plan').maybeSingle()

// Exemple save wrappé (ligne 274)
const setExos = v => {
  setExosState(val);
  save(SKEYS.exos, val).then(() => flash(true)).catch(() => flash(false));
};
```

> **Impact refactor** : les futures pages devront introduire `useQuery`/`useMutation` depuis TanStack Query pour remplacer ces patterns manuels.

---

## 3. États locaux à remonter ou contextualiser

### États de navigation (à gérer par le routeur)

| State | Ligne | Valeur initiale | Destination cible |
|-------|-------|-----------------|-------------------|
| `mode` | 162 | `defaultMode\|"athlete"` | URL param ou Context |
| `tab` | 162 | `"dash"` | React Router |
| `coachTab` | 162 | `"prog"` | React Router |
| `logSubTab` | 162 | `"muscu"` | React Router |
| `progSubTab` | 162 | `"muscu"` | React Router |
| `banqueSubTab` | 162 | `"muscu"` | React Router |
| `testSubTab` | 162 | `"musculation"` | React Router |

### États de données (à mettre en Context ou store global)

| State | Ligne | Raison |
|-------|-------|--------|
| `exos` | 163 | Utilisé dans 15+ sections (coach prog, stats, calculs) |
| `sessions` | 175 | Pilote toute la logique (log, prog, calendrier) |
| `sets` | 163 | Référencé dans calculs, LogView, autoProgress |
| `blockConfig` | 176 | Consommé par CoachFourWeekCalendar, CoachProgramEditor, WeekCalendar |
| `completedSessions` | 167 | Utilisé par calendriers, stats, completeSession |
| `wellness` | 165 | Dashboard athlète + drawer |
| `injuries` | 171 | Header + drawer + coach stats |
| `weightLog` | 170 | Drawer + coach stats + saveWellness |
| `nutritionStrategy` | 172 | Dash athlète + coach data |
| `habits` / `habitLogs` | 190 | Dashboard athlète uniquement → local |
| `energyWeekPlan` / `energyDayPlan` | 162 | Partagé entre `CoachFourWeekCalendar` et `WeekCalendar` |

### États UI locaux (restent locaux)

```js
// Ces états sont purement visuels, pas besoin de les remonter
const [drawerOpen, setDrawerOpen] = useState(false);         // ligne 192
const [drawerZoom, setDrawerZoom] = useState(null);          // ligne 192
const [showWellness, setShowWellness] = useState(false);     // ligne 179
const [showBilan, setShowBilan] = useState(false);           // ligne 178
const [aiChatOpen, setAiChatOpen] = useState(false);         // ligne 188
const [timerLeft, timerActive, timerFinished] = ...          // lignes 193-194
```

### `AppFbForm` (ligne 724) — pattern anti-pattern

Composant `AppFbForm` défini **à l'intérieur** du render, avec ses propres `useState`. Il sera recréé à chaque render parent.

```js
// Ligne 724 — À extraire dans son propre fichier
const AppFbForm = () => {
  const [rating, setRating] = React.useState(null);
  const [text, setText] = React.useState("");
  ...
};
```

---

## 4. Dépendances entre sections

```
currentWeek (ligne 347)
  ← blockConfig.startDate, completedSessions, weeklyTarget, tw

weeklyTarget (ligne 346)
  ← sessions, exos, tw

computeAutoProgress (ligne 368)
  ← exos, sets, completedSessions, blockConfig (tierConfig, deloadWeek), tw, weeksArr

autoProgressOnComplete (ligne 432)
  → appelle computeAutoProgress, setExos

completeSession (ligne 454)
  → setCompletedSessions, autoProgressOnComplete
  ← weeklyTarget, goals.sessionsPerWeek

saveWellness (ligne 333)
  → setWellnessState, setWellnessHistoryState, setWeightLogState, setBodyWeightState
  ← wellnessHistory, weightLog, bodyWeight, weightMilestones, currentWeek

archiveAndNewBlock (ligne 298)
  → setBlockHistory, setSessions, setExos, setBlockConfig, setGoals, setSets, setCompletedSessions
  ← exos, completedSessions, sessions, blockConfig, goals

coachTab="stats" (ligne 958)
  ← exos, sets, sessions, blockConfig (tw, blockName), injuries, sessionLogs,
     wellnessHistory, weightLog, nutritionStrategy, prs, muscSets

tab="dash" (ligne 1189)
  ← wellness, wScore, wReco, sessions, completedSessions, currentWeek, blockConfig,
     nutritionStrategy, nutritionLog, habits, habitLogs, activeInjuries

CoachFourWeekCalendar (ligne 921)
  ← sessions, completedSessions, currentWeek, wellnessHistory, sessionLogs,
     energySessions, energyWeekPlan, energyDayPlan, testSessions, visibilitySettings,
     blockConfig, weekSchedule, exos, allMethods

tab="log" → LogView (ligne 1262)
  ← exos, sets, completedSessions, sessions, blockConfig, allMethods, athleteNotes,
     currentWeek, weeklyTarget, goals, timerLeft/Active/Finished, sessionLogs,
     freeSessions, weekSchedule
```

---

## 5. Duplications de code

### 5.1 Carte profil athlète (initiales + grille stats)

Rendu quasi-identique en **2 endroits** :

```jsx
// Drawer athlète — lignes 571–590
<div style={{width:44,height:44,borderRadius:"50%",...}}>
  {initials}
</div>
<div>{athleteProfile.age} ans · {athleteProfile.height_cm} cm · MB</div>

// Coach data tab — lignes 1027–1057
// Exactement le même markup, même styles, même logique d'initiales
```

→ Extraire `<AthleteProfileCard athleteProfile={...} onEdit={...}/>`

---

### 5.2 Graphique wellness (ComposedChart score + sommeil)

Rendu **3 fois** avec le même dataset `getWellnessChartData` :

```jsx
// Drawer zoom "wellness" — ligne 512
<ResponsiveContainer height={130}><ComposedChart data={wData}>...</ComposedChart></ResponsiveContainer>

// Drawer zoom "health" — ligne 561  
<ResponsiveContainer height={200}><ComposedChart data={wData}>...</ComposedChart></ResponsiveContainer>

// Drawer mini preview — ligne 626
<ResponsiveContainer height={72}><ComposedChart data={wData}>...</ComposedChart></ResponsiveContainer>
```

→ Extraire `<WellnessScoreChart data={wData} height={n} />`

---

### 5.3 Affichage blessures actives

Identique dans le **drawer athlète** (lignes 666–674) et **coachTab="stats"** (lignes 988–991) :

```jsx
// Drawer
{activeInjuries.map(inj => {
  const sc = stC(inj.status);
  const zn = ALL_BZ.filter(z => inj.zones.includes(z.id)).map(z => z.label).join(", ");
  return <div>...</div>
})}
// Coach stats — même structure avec sc/zn identiques
```

→ Extraire `<InjuryList injuries={injuries} />`

---

### 5.4 Sous-onglets (pattern répété 4 fois)

Le même pattern de rendu de sous-onglets apparaît pour `progSubTab`, `logSubTab`, `banqueSubTab`, et `testSubTab` :

```jsx
// Exemple ligne 924
{[{k:"planification",l:"Planification"}, ...].map(t => (
  <button key={t.k}
    onClick={() => setProgSubTab(t.k)}
    style={{borderBottom: "2px solid " + (progSubTab === t.k ? C.coach : "transparent"), ...}}
  >{t.l}</button>
))}
// Même pattern aux lignes 950, 1257 — seuls tab actif et couleur changent
```

→ Extraire `<SubTabs tabs={[...]} active={x} onChange={fn} color={C.coach} />`

---

### 5.5 `WeightChart` rendu en 3 endroits

```jsx
// Ligne 485 — drawer zoom "weight"
<WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy}/>

// Ligne 605 — drawer mini preview
<WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy}/>

// Ligne 981 — coach stats
<WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy}/>
```

Props strictement identiques → pas de duplication critique (composant déjà extrait), mais les 3 sites de call sont dans le même monolithe.

---

### 5.6 Fonction `fmtTime` utilisée mais non définie

Ligne 1008 : `{fmtTime(log.duration)}` — fonction référencée sans import visible ni définition locale. Probablement manquant ou venant d'un import indirect.

---

## Résumé pour le refactor

| Priorité | Action |
|----------|--------|
| 🔴 Critique | Extraire les ~60 états en 3–4 Contexts (AthleteDataContext, BlockContext, UIContext) |
| 🔴 Critique | Introduire React Query pour toutes les lectures Supabase (remplacer les useEffect manuels) |
| 🟠 Important | Extraire `AppFbForm` (composant dans render, anti-pattern) |
| 🟠 Important | Extraire les vues coach (`CoachProgTab`, `CoachBanqueTab`, `CoachStatsTab`, `CoachDataTab`) dans `pages/coach/` |
| 🟠 Important | Extraire les vues athlète (`AthleteDashTab`, `AthleteLogTab`) dans `pages/athlete/` |
| 🟡 Moyen | Créer `<AthleteProfileCard>`, `<WellnessScoreChart>`, `<InjuryList>`, `<SubTabs>` |
| 🟡 Moyen | Vérifier/importer `fmtTime` (ligne 1008) |
| 🟢 Mineur | Déplacer `DataManager` et `BlockHistoryViewer` dans `components/coach/` |
