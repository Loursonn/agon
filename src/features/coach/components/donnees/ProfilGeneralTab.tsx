/**
 * ProfilGeneralTab — sous-onglet « Profil Général » de Profil athlète.
 * 5 blocs distincts, code couleur par thème :
 *   1. Identité (infos perso de base + blessures)
 *   2. Composition & Nutrition (poids / masse grasse / MB + stratégie alimentaire)
 *   3. Objectifs de sommeil
 *   4. Tracker d'habitudes
 *   5. Validations de performances
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { User, Flame, Moon, ListChecks, Award, Zap, Footprints, LayoutDashboard, Lock } from "lucide-react";
import {
  HOME_LOCKED_SECTIONS, HOME_OPT_IN_SECTIONS, HOME_SECTIONS, isOptedIn, useHomeHiddenSections, useSetHomeHiddenSections, withOptIn,
} from "@/features/shared/hooks/useHomeSections";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import CoachPerfNotification from "@/components/coach/CoachPerfNotification";
import { useAuth, type Profile } from "@/hooks/useAuth";
import { coachBirthDateHint } from "@/lib/aiBirthDateNotice";
import type { Goals, Habit } from "@/features/shared/types/athlete";
import { useHyroxFlag } from "@/features/shared/hooks/hyrox/useHyroxFlag";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { formatMmSs } from "@/lib/time";
import { MedicalEntriesSection } from "@/features/shared/components/medical/MedicalEntriesSection";
import { RunningVolumeCard } from "@/features/shared/components/RunningVolumeCard";
import { useRunningVolume } from "@/features/shared/hooks/useRunningVolume";
import { localISO } from "@/lib/date";

// ── Palette des blocs (classes écrites en entier pour que Tailwind les génère) ──

type Tone = "accent" | "alerte" | "info" | "succes" | "hyrox" | "erreur";

const TONE_TEXT: Record<Tone, string> = {
  accent: "text-agon-accent", alerte: "text-agon-alerte", info: "text-agon-info",
  succes: "text-agon-succes", hyrox: "text-agon-type-hyrox", erreur: "text-agon-erreur",
};
/** Fond de l'en-tête de bloc (aplat 4 %). */
const TONE_HEAD: Record<Tone, string> = {
  accent: "bg-agon-accent/[0.039]", alerte: "bg-agon-alerte/[0.039]", info: "bg-agon-info/[0.039]",
  succes: "bg-agon-succes/[0.039]", hyrox: "bg-agon-type-hyrox/[0.039]", erreur: "bg-agon-erreur/[0.039]",
};
/** Pastille d'icône / badge (aplat 10 %). */
const TONE_SOFT: Record<Tone, string> = {
  accent: "bg-agon-accent/[0.102]", alerte: "bg-agon-alerte/[0.102]", info: "bg-agon-info/[0.102]",
  succes: "bg-agon-succes/[0.102]", hyrox: "bg-agon-type-hyrox/[0.102]", erreur: "bg-agon-erreur/[0.102]",
};
/** Bordure des tuiles de macros (12 %). */
const TONE_BORDER: Record<Tone, string> = {
  accent: "border-agon-accent/[0.125]", alerte: "border-agon-alerte/[0.125]", info: "border-agon-info/[0.125]",
  succes: "border-agon-succes/[0.125]", hyrox: "border-agon-type-hyrox/[0.125]", erreur: "border-agon-erreur/[0.125]",
};

const COL = {
  identity:  "accent",
  nutrition: "alerte",
  sleep:     "info",
  habits:    "succes",
  perfs:     "accent",
} as const satisfies Record<string, Tone>;

const KICK = "text-[10px] font-bold uppercase tracking-[0.4px] text-agon-tx3";
const SELECT = "cursor-pointer rounded-[4px] border border-agon-brd-l bg-agon-s2 px-2 py-1.5 text-[13px] font-bold text-agon-tx outline-none";
const BOX = "rounded-[4px] bg-agon-s2";
const SWITCH = "relative h-[26px] w-[46px] shrink-0 rounded-[13px] border-2 outline-none [transition:all_0.2s]";
const KNOB = "absolute top-0.5 size-[18px] rounded-full bg-agon-tx [transition:left_0.2s]";

// ── Section shell ─────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, subtitle, tone, children, motif }: {
  icon: typeof User;
  title: string;
  subtitle?: string;
  tone: Tone;
  children: React.ReactNode;
  motif?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[6px] border border-agon-brd bg-agon-s1">
      <div className={cn("relative flex items-center gap-2.5 border-b border-agon-brd px-4 py-3", TONE_HEAD[tone])}>
        {motif && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-0 h-5 bg-[url(/brand/agon-pattern-frise-meandre-sombre.svg)] bg-[length:600px] bg-repeat-x opacity-[0.18] [mask-image:linear-gradient(180deg,#000_0%,transparent_100%)]" />}
        <span className={cn("relative z-[1] flex size-[26px] shrink-0 items-center justify-center rounded-[4px]", TONE_SOFT[tone], TONE_TEXT[tone])}>
          <Icon size={14} />
        </span>
        <div className="relative z-[1]">
          <div className={cn("text-[12px] font-extrabold uppercase tracking-[0.05em]", TONE_TEXT[tone])}>
            {title}
          </div>
          {subtitle && <div className="mt-px text-[10px] text-agon-tx3">{subtitle}</div>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | null; tone?: Tone }) {
  return (
    <div className={cn(BOX, "px-2 py-2.5 text-center")}>
      <div className="mb-1 text-[9px] uppercase tracking-[0.5px] text-agon-tx3">{label}</div>
      <div className={cn("text-[14px] font-extrabold", value ? (tone ? TONE_TEXT[tone] : "text-agon-tx") : "text-agon-tx3")}>{value || "—"}</div>
    </div>
  );
}

// ── Habitudes ─────────────────────────────────────────────────────────────────

function HabitRow({ habit, dates }: { habit: Habit; dates: string[] }) {
  const done = new Set(dates);
  const today = new Date();

  let count30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    if (done.has(localISO(d))) count30++;
  }
  const pct = Math.round((count30 / 30) * 100);
  const pctTone: Tone = pct >= 70 ? "succes" : pct >= 40 ? "alerte" : "erreur";

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i));
    return { iso: localISO(d), done: done.has(localISO(d)), label: d.toLocaleDateString("fr-FR", { weekday: "narrow" }) };
  });

  return (
    <div className={cn(BOX, "flex items-center gap-3 px-3 py-2.5")}>
      <div className="shrink-0 text-[18px]">{habit.icon || "✅"}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-agon-tx">{habit.name}</div>
        <div className="mt-1.5 flex gap-1">
          {last7.map((d) => (
            <div key={d.iso} title={d.iso} className="flex flex-col items-center gap-0.5">
              <div className={cn("size-3.5 rounded-[4px] border", d.done ? "border-agon-succes bg-agon-succes" : "border-agon-brd-l bg-agon-s1")} />
              <span className="text-[8px] text-agon-tx3">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className={cn("text-[17px] font-extrabold", TONE_TEXT[pctTone])}>{pct}%</div>
        <div className="text-[9px] text-agon-tx3">30 jours</div>
      </div>
    </div>
  );
}

// ── Sommeil ───────────────────────────────────────────────────────────────────

function HMPicker({ label, value, onChange }: {
  label: string;
  value?: { h: number; m: number };
  onChange: (v: { h: number; m: number }) => void;
}) {
  const h = value?.h ?? 22;
  const m = value?.m ?? 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className={KICK}>{label}</div>
      <div className="flex items-center gap-1.5">
        <select
          value={h}
          onChange={(e) => onChange({ h: Number(e.target.value), m })}
          className={SELECT}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{String(i).padStart(2, "0")}h</option>
          ))}
        </select>
        <select
          value={m}
          onChange={(e) => onChange({ h, m: Number(e.target.value) })}
          className={SELECT}
        >
          {[0, 15, 30, 45].map((min) => (
            <option key={min} value={min}>{String(min).padStart(2, "0")}min</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function SleepGoalsBody({ goals, setGoals }: { goals: Goals; setGoals: (v: Goals) => void }) {
  const [saved, setSaved] = useState(false);

  const autoTarget = (bed?: { h: number; m: number }, up?: { h: number; m: number }): number | undefined => {
    if (!bed || !up) return undefined;
    const bedDec = bed.h + bed.m / 60;
    const upDec  = up.h  + up.m  / 60;
    const upNorm = upDec < 12 ? upDec + 24 : upDec;
    const bedNorm = bedDec < 12 ? bedDec + 24 : bedDec;
    const dur = upNorm - bedNorm;
    return dur > 0 ? Math.round(dur * 10) / 10 : undefined;
  };

  // Defaults mirroring HMPicker's display defaults so autoTarget works
  // even when only one field has been explicitly set by the user.
  const DEFAULT_BED = { h: 22, m: 0 };
  const DEFAULT_UP  = { h: 7,  m: 0 };

  const handleChange = (patch: { sleepBedtime?: { h: number; m: number }; sleepWakeup?: { h: number; m: number } }) => {
    const next = {
      ...goals,
      sleepBedtime: goals.sleepBedtime ?? DEFAULT_BED,
      sleepWakeup:  goals.sleepWakeup  ?? DEFAULT_UP,
      ...patch,
    };
    next.sleepTarget = autoTarget(next.sleepBedtime, next.sleepWakeup) ?? next.sleepTarget;
    setGoals(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const durTarget = autoTarget(goals.sleepBedtime ?? DEFAULT_BED, goals.sleepWakeup ?? DEFAULT_UP);

  return (
    <>
      <div className="grid grid-cols-3 items-end gap-4">
        <HMPicker label="Coucher" value={goals.sleepBedtime} onChange={(v) => handleChange({ sleepBedtime: v })} />
        <HMPicker label="Lever" value={goals.sleepWakeup} onChange={(v) => handleChange({ sleepWakeup: v })} />
        <div className="flex flex-col gap-1.5">
          <div className={KICK}>Durée</div>
          <div className={cn("rounded-[4px] border border-agon-brd-l bg-agon-s2 px-3 py-1.5 text-[15px] font-extrabold", durTarget != null ? TONE_TEXT[COL.sleep] : "text-agon-tx3")}>
            {durTarget != null
              ? `${Math.floor(durTarget)}h${Math.round((durTarget % 1) * 60) > 0 ? String(Math.round((durTarget % 1) * 60)).padStart(2, "0") : ""}`
              : "—"}
          </div>
        </div>
      </div>
      {saved && <div className="mt-2.5 text-[11px] font-semibold text-agon-succes">✓ Objectifs enregistrés</div>}
    </>
  );
}

// ── ProfilGeneralTab ──────────────────────────────────────────────────────────

const STRAT_TONE: Record<string, Tone> = { maintenance: "info", seche: "erreur", prise_de_masse: "succes" };
const STRAT_LABEL: Record<string, string> = { maintenance: "Maintenance", seche: "Sèche", prise_de_masse: "Prise de masse" };
const NAP_L: Record<number, string> = { 1.2: "Sédentaire", 1.375: "Légère", 1.55: "Modérée", 1.725: "Intense", 1.9: "Très intense" };

export function ProfilGeneralTab() {
  const {
    athleteId, athleteProfile, onEditProfile,
    nutritionStrategy, goals, setGoals,
    habits, habitLogs, habitEnabled, habitToggling, habitToggleErr, toggleHabitEnabled,
    freeSessions,
  } = useAthleteContext();

  const navigate = useNavigate();
  const { athleteId: urlAthleteId } = useParams<{ athleteId: string }>();
  const ap = athleteProfile as Profile | null;
  const { volume: runVolume, isLoading: runLoading } = useRunningVolume(athleteId ?? undefined, freeSessions);
  const { enabled: hyroxEnabled, toggling: hyroxToggling, toggle: toggleHyrox } = useHyroxFlag(athleteId);
  const { data: hyroxRaces = [] } = useHyroxResults(hyroxEnabled ? athleteId : undefined);

  const initials = ap
    ? ([ap.first_name, ap.last_name].filter(Boolean).join(" ") || ap.full_name || "?")
        .split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";


  const ns = nutritionStrategy;

  const editBtn = (label: string, tab: "profil" | "nutrition") => onEditProfile && (
    <button onClick={() => onEditProfile(tab)} className="shrink-0 cursor-pointer rounded-[4px] border border-agon-coach/[0.314] bg-agon-coach-doux px-3 py-[5px] text-[11px] font-semibold text-agon-coach">
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">

      {/* ── 1. Identité ── */}
      <Section icon={User} title="Identité" subtitle="Informations personnelles et blessures" tone={COL.identity} motif>
        {ap ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-agon-accent/25 bg-agon-accent/[0.125] text-[16px] font-extrabold text-agon-accent">{initials}</div>
              <div className="flex-1">
                <div className="text-[14px] font-bold text-agon-tx">{[ap.first_name, ap.last_name].filter(Boolean).join(" ") || ap.full_name}</div>
                <div className="text-[11px] text-agon-tx3">{ap.gender === "male" ? "Homme" : ap.gender === "female" ? "Femme" : "Genre non renseigné"}</div>
              </div>
              {editBtn("Modifier l'identité", "profil")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Tile label="Âge" value={ap.age ? ap.age + " ans" : null} tone={COL.identity} />
              <Tile label="Taille" value={ap.height_cm ? ap.height_cm + " cm" : null} tone={COL.identity} />
            </div>
            {coachBirthDateHint(ap) && (
              <div className="mt-2 text-[11px] text-agon-tx3">{coachBirthDateHint(ap)}</div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-agon-tx3">Profil non renseigné</div>
            {editBtn("Créer le profil", "profil")}
          </div>
        )}

        {/* Blessures */}
        <div className="mt-3.5 border-t border-agon-brd pt-3.5">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.5px] text-agon-tx3">
            Blessures <span className="font-normal normal-case">— modifiables par l'athlète et par toi</span>
          </div>
          {athleteId && <MedicalEntriesSection athleteId={athleteId} canEdit />}
        </div>
      </Section>

      {/* ── 1a. Accueil de l'athlète (sections visibles) ── */}
      {athleteId && (
        <Section icon={LayoutDashboard} title="Accueil de l'athlète" subtitle="Sections visibles sur sa page Aujourd'hui — masquer ne supprime rien" tone="accent">
          <HomeSectionsEditor athleteId={athleteId} />
        </Section>
      )}

      {/* ── 1b. Volume de course à pied ── */}
      <Section icon={Footprints} title="Volume de course à pied" subtitle="Km réalisés : semaine, 7 jours glissants, 8 dernières semaines" tone="accent">
        <RunningVolumeCard volume={runVolume} isLoading={runLoading} />
      </Section>

      {/* ── 2. Composition & Nutrition ── */}
      <Section icon={Flame} title="Composition & Nutrition" subtitle="Références corporelles et stratégie alimentaire" tone={COL.nutrition}>
        <div className={cn("grid grid-cols-3 gap-2", ns && "mb-3.5")}>
          <Tile label="Poids réf." value={ap?.weight_kg ? ap.weight_kg + " kg" : null} tone={COL.nutrition} />
          <Tile label="Masse grasse" value={ap?.body_fat_pct ? ap.body_fat_pct + " %" : null} tone={COL.nutrition} />
          <Tile label="Métabolisme de base" value={ap?.base_metabolism ? ap.base_metabolism.toLocaleString("fr-FR") + " kcal" : null} tone={COL.nutrition} />
        </div>

        {ns ? (() => {
          const st: Tone = STRAT_TONE[ns.strategy] || "accent"; const sl = STRAT_LABEL[ns.strategy] || ns.strategy;
          const theorKcal = ((ns.macros_glucides || 0) * 4) + ((ns.macros_lipides || 0) * 9) + ((ns.macros_proteines || 0) * 4);
          const macros: { label: string; pct: number | null | undefined; g: number | null | undefined; tone: Tone }[] = [
            { label: "Glucides", pct: ns.macros_glucides_pct, g: ns.macros_glucides, tone: "info" },
            { label: "Lipides", pct: ns.macros_lipides_pct, g: ns.macros_lipides, tone: "alerte" },
            { label: "Protéines", pct: ns.macros_proteines_pct, g: ns.macros_proteines, tone: "succes" },
          ];
          return (
            <div className="border-t border-agon-brd pt-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className={cn("rounded-full px-2.5 py-[3px] text-[12px] font-extrabold", TONE_TEXT[st], TONE_SOFT[st])}>{sl}</span>
                <div className="flex items-center gap-2.5">
                  {ns.target_weight && <span className="text-[12px] text-agon-tx3">Cible : <span className="font-bold text-agon-tx">{ns.target_weight} kg</span></span>}
                  {editBtn("Modifier", "nutrition")}
                </div>
              </div>
              <div className="mb-2.5 grid grid-cols-2 gap-2">
                <div className={cn(BOX, "px-3 py-2.5")}>
                  <div className="mb-[3px] text-[9px] uppercase text-agon-tx3">Calories cibles</div>
                  <div className={cn("text-[16px] font-extrabold", TONE_TEXT[COL.nutrition])}>{ns.total_calories_coach ? ns.total_calories_coach.toLocaleString("fr-FR") + " kcal" : "—"}</div>
                  {ns.nap && <div className="mt-0.5 text-[10px] text-agon-tx3">NAP {NAP_L[ns.nap] || ns.nap} (×{ns.nap})</div>}
                </div>
                <div className={cn(BOX, "px-3 py-2.5")}>
                  <div className="mb-[3px] text-[9px] uppercase text-agon-tx3">{ns.strategy === "seche" ? "Déficit cible" : ns.strategy === "prise_de_masse" ? "Surplus cible" : "Tolérance"}</div>
                  {ns.surplus_deficit_min != null && ns.surplus_deficit_max != null
                    ? <div className={cn("text-[16px] font-extrabold", TONE_TEXT[st])}>{ns.strategy === "seche" ? Math.abs(ns.surplus_deficit_min) + "%" : ns.strategy === "prise_de_masse" ? "+" + ns.surplus_deficit_max + "%" : "±" + ns.surplus_deficit_max + "%"}</div>
                    : <div className="text-[13px] text-agon-tx3">—</div>}
                </div>
              </div>
              {(ns.macros_glucides || ns.macros_lipides || ns.macros_proteines) && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {macros.map(m => (
                      <div key={m.label} className={cn(BOX, "border p-2 text-center", TONE_BORDER[m.tone])}>
                        <div className={cn("mb-[3px] text-[9px] font-bold", TONE_TEXT[m.tone])}>{m.label}</div>
                        {m.pct != null && <div className={cn("text-[18px] font-black leading-none", TONE_TEXT[m.tone])}>{m.pct}<span className="text-[10px]">%</span></div>}
                        {m.g != null && <div className="mt-px text-[12px] font-semibold text-agon-tx2">{m.g} g</div>}
                      </div>
                    ))}
                  </div>
                  {theorKcal > 0 && <div className="mt-2 text-right text-[11px] text-agon-tx3">Total macros : <span className="font-bold text-agon-tx">{theorKcal} kcal</span></div>}
                </>
              )}
              <div className="mt-2 text-[10px] text-agon-tx3">
                {ns.calorie_mode === "active" ? "Mode : BMR + calories actives (athlète)" : ns.calorie_mode === "hybrid" ? "Mode : Hybride" : "Mode : BMR × NAP (calories fixes)"}
              </div>
            </div>
          );
        })() : (
          <div className="flex items-center justify-between border-t border-agon-brd pt-3.5">
            <div className="text-[12px] text-agon-tx3">Aucune stratégie alimentaire définie</div>
            {editBtn("Définir", "nutrition")}
          </div>
        )}
      </Section>

      {/* ── 3. Objectifs de sommeil ── */}
      <Section icon={Moon} title="Objectifs de sommeil" subtitle="Visibles dans le tunnel de sommeil (retours)" tone={COL.sleep}>
        <SleepGoalsBody goals={goals} setGoals={setGoals} />
      </Section>

      {/* ── 3b. Suivi HYROX ── */}
      <Section icon={Zap} title="Suivi HYROX" subtitle="Active l'onglet HYROX : courses, stations, Roxzone, radar, tests" tone="hyrox">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-bold text-agon-tx">Athlète HYROX</div>
            <div className="mt-0.5 text-[11px] text-agon-tx3">Activer le suivi HYROX pour cet athlète</div>
          </div>
          <button
            disabled={hyroxToggling}
            onClick={toggleHyrox}
            className={cn(SWITCH, hyroxEnabled ? "border-agon-type-hyrox bg-agon-type-hyrox" : "border-agon-brd-l bg-agon-s2", hyroxToggling ? "cursor-default opacity-60" : "cursor-pointer")}
          >
            <div className={cn(KNOB, hyroxEnabled ? "left-6" : "left-0.5")} />
          </button>
        </div>
        {hyroxEnabled && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="text-[12px] text-agon-tx2">
              {hyroxRaces.length} course{hyroxRaces.length !== 1 ? "s" : ""} saisie{hyroxRaces.length !== 1 ? "s" : ""}
              {hyroxRaces.length > 0 && (() => {
                const last = hyroxRaces[0];
                return ` · dernier chrono ${formatMmSs(last.total_s, { hours: true })} (${last.event_name}, ${last.date})`;
              })()}
            </div>
            <button
              onClick={() => navigate(`/coach/athletes/${urlAthleteId ?? athleteId}/hyrox`)}
              className="cursor-pointer self-start rounded-[4px] border border-agon-accent/25 bg-agon-accent-doux px-3.5 py-1.5 text-[11px] font-semibold text-agon-accent"
            >
              Ouvrir l'onglet HYROX
            </button>
          </div>
        )}
      </Section>

      {/* ── 4. Tracker d'habitudes ── */}
      <Section icon={ListChecks} title="Tracker d'habitudes" subtitle="Habitudes de l'athlète et adhérence" tone={COL.habits}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-bold text-agon-tx">Suivi activé</div>
            <div className={cn("mt-0.5 text-[11px]", habitToggleErr ? "text-agon-erreur" : "text-agon-tx3")}>{habitToggleErr || "Activer le suivi d'habitudes pour cet athlète"}</div>
          </div>
          <button
            disabled={habitToggling}
            onClick={toggleHabitEnabled}
            className={cn(SWITCH, habitEnabled ? "border-agon-succes bg-agon-succes" : "border-agon-brd-l bg-agon-s2", habitToggling ? "cursor-default opacity-60" : "cursor-pointer")}
          >
            <div className={cn(KNOB, habitEnabled ? "left-6" : "left-0.5")} />
          </button>
        </div>
        {habitEnabled && (
          <div className="mt-3 flex flex-col gap-2">
            {habits.length === 0 ? (
              <div className="py-2 text-[12px] text-agon-tx3">Aucune habitude créée par l'athlète pour l'instant.</div>
            ) : (
              habits.map((h) => <HabitRow key={h.id} habit={h} dates={habitLogs[h.id] ?? []} />)
            )}
          </div>
        )}
      </Section>

      {/* ── 5. Validations de performances ── */}
      <Section icon={Award} title="Validations de performances" subtitle="Performances déclarées par l'athlète à valider" tone={COL.perfs}>
        <CoachPerfNotification coachId={athleteId} athleteId={athleteId} C={C} />
      </Section>
    </div>
  );
}

// ── Accueil de l'athlète : sections visibles ──────────────────────────────────

const HOME_ITEM = "flex items-center gap-2.5 rounded-[4px] border px-3 py-[9px] text-[12px]";

function HomeSectionsEditor({ athleteId }: { athleteId: string }) {
  const { hidden } = useHomeHiddenSections(athleteId);
  const setHidden = useSetHomeHiddenSections(athleteId);
  const { refreshAthletes } = useAuth();

  const toggle = (key: string) =>
    setHidden.mutate(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-1.5">
      {HOME_LOCKED_SECTIONS.map((label) => (
        <div
          key={label}
          title="Toujours visible"
          className={cn(HOME_ITEM, "border-agon-brd bg-agon-s2 text-agon-tx3")}
        >
          <Lock size={13} className="shrink-0" />
          <span className="flex-1">{label}</span>
          <span className="text-[10px]">toujours</span>
        </div>
      ))}
      {HOME_SECTIONS.map(({ key, label }) => {
        const visible = !hidden.includes(key);
        return (
          <label
            key={key}
            className={cn(HOME_ITEM, "cursor-pointer", visible ? "border-agon-accent/[0.314] bg-agon-accent-doux text-agon-tx" : "border-agon-brd bg-agon-s2 text-agon-tx3")}
          >
            <input
              type="checkbox"
              checked={visible}
              onChange={() => toggle(key)}
              className="size-[15px] shrink-0 cursor-pointer accent-agon-accent"
            />
            <span className="flex-1">{label}</span>
          </label>
        );
      })}
      {/* Désactivées par défaut : le coach coche les athlètes concernés. */}
      {HOME_OPT_IN_SECTIONS.map(({ key, label }) => {
        const on = isOptedIn(hidden, key);
        return (
          <label
            key={key}
            className={cn(HOME_ITEM, "cursor-pointer", on ? "border-agon-accent/[0.314] bg-agon-accent-doux text-agon-tx" : "border-agon-brd bg-agon-s2 text-agon-tx3")}
          >
            <input
              type="checkbox"
              checked={on}
              // La page Weekly reviews lit la liste des athlètes du coach : on la recharge.
              onChange={() => setHidden.mutate(withOptIn(hidden, key, !on), { onSuccess: () => void refreshAthletes() })}
              className="size-[15px] shrink-0 cursor-pointer accent-agon-accent"
            />
            <span className="flex-1">{label}</span>
            {!on && <span className="text-[10px]">désactivée</span>}
          </label>
        );
      })}
    </div>
  );
}
