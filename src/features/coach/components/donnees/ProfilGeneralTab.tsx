/**
 * ProfilGeneralTab — sous-onglet « Profil Général » de Profil athlète.
 * 5 blocs distincts, code couleur par thème :
 *   1. Identité (infos perso de base + antécédents médicaux)
 *   2. Composition & Nutrition (poids / masse grasse / MB + stratégie alimentaire)
 *   3. Objectifs de sommeil
 *   4. Tracker d'habitudes
 *   5. Validations de performances
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { User, Flame, Moon, ListChecks, Award, Zap, Footprints, LayoutDashboard, Lock } from "lucide-react";
import { HOME_LOCKED_SECTIONS, HOME_SECTIONS, useHomeHiddenSections, useSetHomeHiddenSections } from "@/features/shared/hooks/useHomeSections";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import CoachPerfNotification from "@/components/coach/CoachPerfNotification";
import type { Profile } from "@/hooks/useAuth";
import type { Goals, Habit } from "@/features/shared/types/athlete";
import { useHyroxFlag } from "@/features/shared/hooks/hyrox/useHyroxFlag";
import { useHyroxResults } from "@/features/shared/hooks/hyrox/useHyroxResults";
import { formatMmSs } from "@/lib/time";
import { MedicalEntriesSection } from "@/features/shared/components/medical/MedicalEntriesSection";
import { RunningVolumeCard } from "@/features/shared/components/RunningVolumeCard";
import { useRunningVolume } from "@/features/shared/hooks/useRunningVolume";
import { localISO } from "@/lib/date";

// ── Palette des blocs ─────────────────────────────────────────────────────────

const COL = {
  identity:  "#FFC933",
  nutrition: "#F5A623",
  sleep:     "#33B5FF",
  habits:    "#66F03C",
  perfs:     "#FFC933",
};

// ── Section shell ─────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, subtitle, color, children, motif }: {
  icon: typeof User;
  title: string;
  subtitle?: string;
  color: string;
  children: React.ReactNode;
  motif?: boolean;
}) {
  return (
    <section style={{
      background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 6,
      overflow: "hidden",
    }}>
      <div style={{
        position: "relative",
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${C.brd}`,
        background: color + "0A",
      }}>
        {motif && <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 20, backgroundImage: "url(/brand/agon-pattern-frise-meandre-sombre.svg)", backgroundSize: "600px", backgroundRepeat: "repeat-x", opacity: 0.18, pointerEvents: "none", zIndex: 0, maskImage: "linear-gradient(180deg, #000 0%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, transparent 100%)" }} />}
        <span style={{
          position: "relative", zIndex: 1,
          width: 26, height: 26, borderRadius: 4, flexShrink: 0,
          background: color + "1A", color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={14} />
        </span>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {title}
          </div>
          {subtitle && <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}

function Tile({ label, value, color }: { label: string; value: string | null; color?: string }) {
  return (
    <div style={{ background: C.s2, borderRadius: 4, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: value ? (color ?? C.tx) : C.tx3 }}>{value || "—"}</div>
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
  const pctColor = pct >= 70 ? C.g : pct >= 40 ? C.o : C.r;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i));
    return { iso: localISO(d), done: done.has(localISO(d)), label: d.toLocaleDateString("fr-FR", { weekday: "narrow" }) };
  });

  return (
    <div style={{ background: C.s2, borderRadius: 4, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 18, flexShrink: 0 }}>{habit.icon || "✅"}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{habit.name}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          {last7.map((d) => (
            <div key={d.iso} title={d.iso} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, background: d.done ? C.g : C.s1, border: "1px solid " + (d.done ? C.g : C.brdL) }} />
              <span style={{ fontSize: 8, color: C.tx3 }}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: pctColor }}>{pct}%</div>
        <div style={{ fontSize: 9, color: C.tx3 }}>30 jours</div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <select
          value={h}
          onChange={(e) => onChange({ h: Number(e.target.value), m })}
          style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", outline: "none" }}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{String(i).padStart(2, "0")}h</option>
          ))}
        </select>
        <select
          value={m}
          onChange={(e) => onChange({ h, m: Number(e.target.value) })}
          style={{ padding: "6px 8px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", outline: "none" }}
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "end" }}>
        <HMPicker label="Coucher" value={goals.sleepBedtime} onChange={(v) => handleChange({ sleepBedtime: v })} />
        <HMPicker label="Lever" value={goals.sleepWakeup} onChange={(v) => handleChange({ sleepWakeup: v })} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Durée</div>
          <div style={{ padding: "6px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, fontSize: 15, fontWeight: 800, color: durTarget != null ? COL.sleep : C.tx3 }}>
            {durTarget != null
              ? `${Math.floor(durTarget)}h${Math.round((durTarget % 1) * 60) > 0 ? String(Math.round((durTarget % 1) * 60)).padStart(2, "0") : ""}`
              : "—"}
          </div>
        </div>
      </div>
      {saved && <div style={{ fontSize: 11, color: C.g, fontWeight: 600, marginTop: 10 }}>✓ Objectifs enregistrés</div>}
    </>
  );
}

// ── ProfilGeneralTab ──────────────────────────────────────────────────────────

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
  const SC: Record<string, string> = { maintenance: C.b, seche: C.r, prise_de_masse: C.g };
  const SL: Record<string, string> = { maintenance: "Maintenance", seche: "Sèche", prise_de_masse: "Prise de masse" };

  const editBtn = (label: string, tab: "profil" | "nutrition") => onEditProfile && (
    <button onClick={() => onEditProfile(tab)} style={{ padding: "5px 12px", borderRadius: 4, border: "1px solid " + C.coach + "50", background: C.coachS, color: C.coach, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── 1. Identité ── */}
      <Section icon={User} title="Identité" subtitle="Informations personnelles et antécédents" color={COL.identity} motif>
        {ap ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: COL.identity + "20", border: "2px solid " + COL.identity + "40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: COL.identity, flexShrink: 0 }}>{initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{[ap.first_name, ap.last_name].filter(Boolean).join(" ") || ap.full_name}</div>
                <div style={{ fontSize: 11, color: C.tx3 }}>{ap.gender === "male" ? "Homme" : ap.gender === "female" ? "Femme" : "Genre non renseigné"}</div>
              </div>
              {editBtn("Modifier l'identité", "profil")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Tile label="Âge" value={ap.age ? ap.age + " ans" : null} color={COL.identity} />
              <Tile label="Taille" value={ap.height_cm ? ap.height_cm + " cm" : null} color={COL.identity} />
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, color: C.tx3 }}>Profil non renseigné</div>
            {editBtn("Créer le profil", "profil")}
          </div>
        )}

        {/* Antécédents médicaux */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.brd}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
            Antécédents médicaux <span style={{ fontWeight: 400, textTransform: "none" }}>— modifiables par l'athlète et par toi</span>
          </div>
          {athleteId && <MedicalEntriesSection athleteId={athleteId} canEdit />}
        </div>
      </Section>

      {/* ── 1a. Accueil de l'athlète (sections visibles) ── */}
      {athleteId && (
        <Section icon={LayoutDashboard} title="Accueil de l'athlète" subtitle="Sections visibles sur sa page Aujourd'hui — masquer ne supprime rien" color={C.ac}>
          <HomeSectionsEditor athleteId={athleteId} />
        </Section>
      )}

      {/* ── 1b. Volume de course à pied ── */}
      <Section icon={Footprints} title="Volume de course à pied" subtitle="Km réalisés : semaine, 7 jours glissants, 8 dernières semaines" color={C.ac}>
        <RunningVolumeCard volume={runVolume} isLoading={runLoading} />
      </Section>

      {/* ── 2. Composition & Nutrition ── */}
      <Section icon={Flame} title="Composition & Nutrition" subtitle="Références corporelles et stratégie alimentaire" color={COL.nutrition}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: ns ? 14 : 0 }}>
          <Tile label="Poids réf." value={ap?.weight_kg ? ap.weight_kg + " kg" : null} color={COL.nutrition} />
          <Tile label="Masse grasse" value={ap?.body_fat_pct ? ap.body_fat_pct + " %" : null} color={COL.nutrition} />
          <Tile label="Métabolisme de base" value={ap?.base_metabolism ? ap.base_metabolism.toLocaleString("fr-FR") + " kcal" : null} color={COL.nutrition} />
        </div>

        {ns ? (() => {
          const sc = SC[ns.strategy] || C.ac; const sl = SL[ns.strategy] || ns.strategy;
          const theorKcal = ((ns.macros_glucides || 0) * 4) + ((ns.macros_lipides || 0) * 9) + ((ns.macros_proteines || 0) * 4);
          const NAP_L: Record<number, string> = { 1.2: "Sédentaire", 1.375: "Légère", 1.55: "Modérée", 1.725: "Intense", 1.9: "Très intense" };
          return (
            <div style={{ borderTop: `1px solid ${C.brd}`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: sc, background: sc + "1A", padding: "3px 10px", borderRadius: 999 }}>{sl}</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {ns.target_weight && <span style={{ fontSize: 12, color: C.tx3 }}>Cible : <span style={{ color: C.tx, fontWeight: 700 }}>{ns.target_weight} kg</span></span>}
                  {editBtn("Modifier", "nutrition")}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div style={{ background: C.s2, borderRadius: 4, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", marginBottom: 3 }}>Calories cibles</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: COL.nutrition }}>{ns.total_calories_coach ? ns.total_calories_coach.toLocaleString("fr-FR") + " kcal" : "—"}</div>
                  {ns.nap && <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>NAP {NAP_L[ns.nap] || ns.nap} (×{ns.nap})</div>}
                </div>
                <div style={{ background: C.s2, borderRadius: 4, padding: "10px 12px" }}>
                  <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", marginBottom: 3 }}>{ns.strategy === "seche" ? "Déficit cible" : ns.strategy === "prise_de_masse" ? "Surplus cible" : "Tolérance"}</div>
                  {ns.surplus_deficit_min != null && ns.surplus_deficit_max != null
                    ? <div style={{ fontSize: 16, fontWeight: 800, color: sc }}>{ns.strategy === "seche" ? Math.abs(ns.surplus_deficit_min) + "%" : ns.strategy === "prise_de_masse" ? "+" + ns.surplus_deficit_max + "%" : "±" + ns.surplus_deficit_max + "%"}</div>
                    : <div style={{ fontSize: 13, color: C.tx3 }}>—</div>}
                </div>
              </div>
              {(ns.macros_glucides || ns.macros_lipides || ns.macros_proteines) && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[{ label: "Glucides", pct: ns.macros_glucides_pct, g: ns.macros_glucides, color: C.b }, { label: "Lipides", pct: ns.macros_lipides_pct, g: ns.macros_lipides, color: C.o }, { label: "Protéines", pct: ns.macros_proteines_pct, g: ns.macros_proteines, color: C.g }].map(m => (
                      <div key={m.label} style={{ background: C.s2, borderRadius: 4, padding: "8px", textAlign: "center", border: "1px solid " + m.color + "20" }}>
                        <div style={{ fontSize: 9, color: m.color, fontWeight: 700, marginBottom: 3 }}>{m.label}</div>
                        {m.pct != null && <div style={{ fontSize: 18, fontWeight: 900, color: m.color, lineHeight: 1 }}>{m.pct}<span style={{ fontSize: 10 }}>%</span></div>}
                        {m.g != null && <div style={{ fontSize: 12, fontWeight: 600, color: C.tx2, marginTop: 1 }}>{m.g} g</div>}
                      </div>
                    ))}
                  </div>
                  {theorKcal > 0 && <div style={{ marginTop: 8, fontSize: 11, color: C.tx3, textAlign: "right" }}>Total macros : <span style={{ fontWeight: 700, color: C.tx }}>{theorKcal} kcal</span></div>}
                </>
              )}
              <div style={{ marginTop: 8, fontSize: 10, color: C.tx3 }}>
                {ns.calorie_mode === "active" ? "Mode : BMR + calories actives (athlète)" : ns.calorie_mode === "hybrid" ? "Mode : Hybride" : "Mode : BMR × NAP (calories fixes)"}
              </div>
            </div>
          );
        })() : (
          <div style={{ borderTop: `1px solid ${C.brd}`, paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: C.tx3 }}>Aucune stratégie alimentaire définie</div>
            {editBtn("Définir", "nutrition")}
          </div>
        )}
      </Section>

      {/* ── 3. Objectifs de sommeil ── */}
      <Section icon={Moon} title="Objectifs de sommeil" subtitle="Visibles dans le tunnel de sommeil (retours)" color={COL.sleep}>
        <SleepGoalsBody goals={goals} setGoals={setGoals} />
      </Section>

      {/* ── 3b. Suivi HYROX ── */}
      <Section icon={Zap} title="Suivi HYROX" subtitle="Active l'onglet HYROX : courses, stations, Roxzone, radar, tests" color="#F5A623">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Athlète HYROX</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>Activer le suivi HYROX pour cet athlète</div>
          </div>
          <button disabled={hyroxToggling} onClick={toggleHyrox} style={{ width: 46, height: 26, borderRadius: 13, background: hyroxEnabled ? "#F5A623" : C.s2, border: `2px solid ${hyroxEnabled ? "#F5A623" : C.brdL}`, cursor: hyroxToggling ? "default" : "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0, outline: "none", opacity: hyroxToggling ? 0.6 : 1 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: hyroxEnabled ? 24 : 2, transition: "left 0.2s" }} />
          </button>
        </div>
        {hyroxEnabled && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: C.tx2 }}>
              {hyroxRaces.length} course{hyroxRaces.length !== 1 ? "s" : ""} saisie{hyroxRaces.length !== 1 ? "s" : ""}
              {hyroxRaces.length > 0 && (() => {
                const last = hyroxRaces[0];
                return ` · dernier chrono ${formatMmSs(last.total_s, { hours: true })} (${last.event_name}, ${last.date})`;
              })()}
            </div>
            <button
              onClick={() => navigate(`/coach/athletes/${urlAthleteId ?? athleteId}/hyrox`)}
              style={{
                alignSelf: "flex-start",
                padding: "6px 14px", borderRadius: 4, border: "1px solid " + C.ac + "40",
                background: C.acS, color: C.ac, fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Ouvrir l'onglet HYROX
            </button>
          </div>
        )}
      </Section>

      {/* ── 4. Tracker d'habitudes ── */}
      <Section icon={ListChecks} title="Tracker d'habitudes" subtitle="Habitudes de l'athlète et adhérence" color={COL.habits}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Suivi activé</div>
            <div style={{ fontSize: 11, color: habitToggleErr ? C.r : C.tx3, marginTop: 2 }}>{habitToggleErr || "Activer le suivi d'habitudes pour cet athlète"}</div>
          </div>
          <button disabled={habitToggling} onClick={toggleHabitEnabled} style={{ width: 46, height: 26, borderRadius: 13, background: habitEnabled ? COL.habits : C.s2, border: `2px solid ${habitEnabled ? COL.habits : C.brdL}`, cursor: habitToggling ? "default" : "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0, outline: "none", opacity: habitToggling ? 0.6 : 1 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: habitEnabled ? 24 : 2, transition: "left 0.2s" }} />
          </button>
        </div>
        {habitEnabled && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {habits.length === 0 ? (
              <div style={{ fontSize: 12, color: C.tx3, padding: "8px 0" }}>Aucune habitude créée par l'athlète pour l'instant.</div>
            ) : (
              habits.map((h) => <HabitRow key={h.id} habit={h} dates={habitLogs[h.id] ?? []} />)
            )}
          </div>
        )}
      </Section>

      {/* ── 5. Validations de performances ── */}
      <Section icon={Award} title="Validations de performances" subtitle="Performances déclarées par l'athlète à valider" color={COL.perfs}>
        <CoachPerfNotification coachId={athleteId} athleteId={athleteId} C={C} />
      </Section>
    </div>
  );
}

// ── Accueil de l'athlète : sections visibles ──────────────────────────────────

function HomeSectionsEditor({ athleteId }: { athleteId: string }) {
  const { hidden } = useHomeHiddenSections(athleteId);
  const setHidden = useSetHomeHiddenSections(athleteId);

  const toggle = (key: string) =>
    setHidden.mutate(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
      {HOME_LOCKED_SECTIONS.map((label) => (
        <div
          key={label}
          title="Toujours visible"
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 4,
            background: C.s2, border: `1px solid ${C.brd}`, color: C.tx3, fontSize: 12,
          }}
        >
          <Lock size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{label}</span>
          <span style={{ fontSize: 10 }}>toujours</span>
        </div>
      ))}
      {HOME_SECTIONS.map(({ key, label }) => {
        const visible = !hidden.includes(key);
        return (
          <label
            key={key}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 4,
              background: visible ? C.acS : C.s2, border: `1px solid ${visible ? C.ac + "50" : C.brd}`,
              color: visible ? C.tx : C.tx3, fontSize: 12, cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={visible}
              onChange={() => toggle(key)}
              style={{ accentColor: C.ac, width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
            />
            <span style={{ flex: 1 }}>{label}</span>
          </label>
        );
      })}
    </div>
  );
}
