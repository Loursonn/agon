import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useAuth, Profile } from "@/hooks/useAuth";
import {
  getNutritionStrategy,
  upsertNutritionStrategy,
  NutritionStrategyType,
  CalorieMode,
  DeficitMode,
} from "@/lib/nutrition";
import { localISO } from "@/lib/date";

const C = {
  bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D",
  brd: "rgba(255,255,255,0.06)", brdL: "rgba(255,255,255,0.1)",
  tx: "#F2F2F4", tx2: "#9194A0", tx3: "#555866",
  ac: "#FFC933", acS: "rgba(123,111,255,0.12)",
  coach: "#FFC933", coachS: "rgba(212,83,142,0.12)",
  g: "#66F03C", gS: "rgba(34,201,147,0.1)",
  r: "#FF5A33", b: "#33B5FF", o: "#F5A623",
};

const NAP_OPTIONS = [
  { value: 1.2,   label: "Sédentaire",     sub: "Peu ou pas d'exercice" },
  { value: 1.375, label: "Légère",          sub: "1-3j / semaine" },
  { value: 1.55,  label: "Modérée",         sub: "3-5j / semaine" },
  { value: 1.725, label: "Intense",         sub: "6-7j / semaine" },
  { value: 1.9,   label: "Très intense",    sub: "Sport + travail physique" },
];

type MetaMode = "manual" | "formula_no_bf" | "formula_bf";

function calcMifflin(weight: number, height: number, age: number, gender: "male" | "female"): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(gender === "male" ? base + 5 : base - 161);
}

function calcKatchMcArdle(weight: number, bodyFat: number): number {
  const lbm = weight * (1 - bodyFat / 100);
  return Math.round(370 + 21.6 * lbm);
}

function ageFromBirthDate(dateStr: string): number | null {
  if (!dateStr) return null;
  const birth = new Date(dateStr);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let a = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

interface Props {
  athlete: Profile;
  onClose: () => void;
  inline?: boolean;
  /** Onglet ouvert à l'affichage */
  initialTab?: "profil" | "nutrition";
  /** Masque le switcher d'onglets : le formulaire ne montre que initialTab */
  lockTab?: boolean;
}

export default function AthleteProfileForm({ athlete, onClose, inline = false, initialTab = "profil", lockTab = false }: Props) {
  const { updateAthleteProfile, user } = useAuth();
  const isOwnProfile = user?.id === athlete.id;

  // ── Sub-onglet ─────────────────────────────────────────────────────────────
  const [dataTab, setDataTab] = useState<"profil" | "nutrition">(initialTab);

  // ── Identité + MB ─────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState(athlete.first_name ?? "");
  const [lastName, setLastName] = useState(athlete.last_name ?? "");
  const [birthDate, setBirthDate] = useState(athlete.birth_date ?? "");
  const [heightCm, setHeightCm] = useState(athlete.height_cm?.toString() ?? "");
  const [gender, setGender] = useState<"male" | "female" | "">(athlete.gender ?? "");
  const [weightKg, setWeightKg] = useState(athlete.weight_kg?.toString() ?? "");
  const [bodyFatPct, setBodyFatPct] = useState(athlete.body_fat_pct?.toString() ?? "");
  const [metaMode, setMetaMode] = useState<MetaMode>("manual");
  const [metaManual, setMetaManual] = useState(athlete.base_metabolism?.toString() ?? "");
  const [isHyrox, setIsHyrox] = useState(athlete.is_hyrox_athlete ?? false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [errorProfile, setErrorProfile] = useState("");

  // Âge dérivé de la date de naissance (ou saisie directe fallback)
  const derivedAge = ageFromBirthDate(birthDate);

  // ── Nutrition ─────────────────────────────────────────────────────────────
  const [nutStrategy, setNutStrategy] = useState<NutritionStrategyType>("maintenance");
  const [nutTargetWeight, setNutTargetWeight] = useState("");
  const [nutCalorieMode, setNutCalorieMode] = useState<CalorieMode>("nap");
  const [nutNap, setNutNap] = useState("");
  const [nutTargetPct, setNutTargetPct] = useState("");
  const [nutDeficitMode, setNutDeficitMode] = useState<DeficitMode>("fixed");
  const [nutRangeMin, setNutRangeMin] = useState("");
  const [nutRangeMax, setNutRangeMax] = useState("");
  const [nutTotalCalCoach, setNutTotalCalCoach] = useState("");
  const [nutGlucides, setNutGlucides] = useState("");
  const [nutLipides, setNutLipides] = useState("");
  const [nutProteines, setNutProteines] = useState("");
  const [nutGlucidesPct, setNutGlucidesPct] = useState("");
  const [nutLipidesPct, setNutLipidesPct] = useState("");
  const [nutProteinesPct, setNutProteinesPct] = useState("");
  const [nutWeeklyTargetKg, setNutWeeklyTargetKg] = useState("");
  const [nutLoaded, setNutLoaded] = useState(false);
  const [savingNut, setSavingNut] = useState(false);
  const [errorNut, setErrorNut] = useState("");

  // Calculateur auto objectif hebdo
  const [calcKg, setCalcKg] = useState("");
  const [calcMonths, setCalcMonths] = useState("");

  // ── Valeurs dérivées ──────────────────────────────────────────────────────
  const bmr = parseInt(metaManual) || 0;
  const nap = parseFloat(nutNap) || 0;
  const tdee = bmr && nap ? Math.round(bmr * nap) : 0;
  const totalRefKcal = parseInt(nutTotalCalCoach) || 0;

  const DEFAULT_PCTS: Record<NutritionStrategyType, [number, number, number]> = {
    maintenance:    [45, 30, 25],
    seche:          [40, 25, 35],
    prise_de_masse: [50, 25, 25],
  };

  const stratPctMeta = {
    seche:          { label: "Déficit (%)", placeholder: "ex: 15", min: 1,  max: 40, sign: -1 },
    prise_de_masse: { label: "Surplus (%)", placeholder: "ex: 10", min: 1,  max: 30, sign: 1  },
    maintenance:    { label: "Tolérance (±%)", placeholder: "ex: 3",  min: 0,  max: 15, sign: 0  },
  }[nutStrategy];

  function deriveTargetPct(min: number | null, max: number | null, strategy: NutritionStrategyType): string {
    if (min == null && max == null) return "";
    if (strategy === "seche") return String(Math.abs(min ?? max ?? 0));
    if (strategy === "prise_de_masse") return String(Math.abs(max ?? min ?? 0));
    return String(Math.abs(max ?? 0));
  }

  function computeMinMax(pct: string, strategy: NutritionStrategyType): [number | null, number | null] {
    const v = Math.abs(parseFloat(pct));
    if (!v) return [null, null];
    if (strategy === "seche")          return [-v, -v];
    if (strategy === "prise_de_masse") return [v, v];
    return [-v, v];
  }

  // Fourchette : les inputs sont saisis en valeur absolue pour sèche/prise
  // (déficit 8 à 12 → fenêtre signée [-12, -8]). Maintenance : valeurs signées.
  function normalizedRangeWindow(): [number | null, number | null] {
    const a = parseFloat(nutRangeMin), b = parseFloat(nutRangeMax);
    if (isNaN(a) || isNaN(b)) return [null, null];
    let x = a, y = b;
    if (nutStrategy === "seche")          { x = -Math.abs(a); y = -Math.abs(b); }
    else if (nutStrategy === "prise_de_masse") { x = Math.abs(a); y = Math.abs(b); }
    return [Math.min(x, y), Math.max(x, y)];
  }

  function computeTargetKcal(tdeeVal: number, pct: string, strategy: NutritionStrategyType): number {
    const v = parseFloat(pct) || 0;
    if (!tdeeVal) return 0;
    if (strategy === "seche")          return Math.round(tdeeVal * (1 - v / 100));
    if (strategy === "prise_de_masse") return Math.round(tdeeVal * (1 + v / 100));
    return tdeeVal;
  }

  // Auto-calcul objectif hebdo depuis kg + mois
  function applyAutoCalc() {
    const kg = parseFloat(calcKg);
    const months = parseFloat(calcMonths);
    if (!kg || !months || months <= 0) return;
    const weeks = months * 4.33;
    let rate = +(kg / weeks).toFixed(2);
    if (nutStrategy === "seche") rate = -Math.abs(rate);
    else if (nutStrategy === "maintenance") rate = Math.abs(rate) <= 0.1 ? rate : 0;
    setNutWeeklyTargetKg(String(rate));
  }

  // Fourchette kcal dérivée (mode range) : TDEE ajusté par la fenêtre % normalisée
  const [rangeWinMin, rangeWinMax] = nutDeficitMode === "range" ? normalizedRangeWindow() : [null, null];
  const rangeKcalMin = tdee > 0 && rangeWinMin != null ? Math.round(tdee * (1 + rangeWinMin / 100)) : null;
  const rangeKcalMax = tdee > 0 && rangeWinMax != null ? Math.round(tdee * (1 + rangeWinMax / 100)) : null;

  // ── Sync kcal quand TDEE, mode ou % changent ──────────────────────────────
  useEffect(() => {
    if (!tdee) return;
    if (nutDeficitMode === "range") {
      // Cible = milieu de fourchette (les bornes sont sauvegardées à part)
      if (rangeKcalMin != null && rangeKcalMax != null) {
        setNutTotalCalCoach(String(Math.round((rangeKcalMin + rangeKcalMax) / 2)));
      }
    } else {
      const kcal = computeTargetKcal(tdee, nutTargetPct, nutStrategy);
      if (kcal) setNutTotalCalCoach(String(kcal));
    }
  }, [tdee, nutTargetPct, nutStrategy, nutDeficitMode, nutRangeMin, nutRangeMax]);

  // ── Sync grammes quand totalRefKcal change ────────────────────────────────
  useEffect(() => {
    const kcal = parseInt(nutTotalCalCoach) || 0;
    if (!kcal) return;
    if (nutGlucidesPct) setNutGlucides(String(Math.round(kcal * parseFloat(nutGlucidesPct) / 100 / 4)));
    if (nutLipidesPct)  setNutLipides(String(Math.round(kcal * parseFloat(nutLipidesPct) / 100 / 9)));
    if (nutProteinesPct) setNutProteines(String(Math.round(kcal * parseFloat(nutProteinesPct) / 100 / 4)));
  }, [nutTotalCalCoach]);

  // ── Macro helpers ─────────────────────────────────────────────────────────
  function pctToG(pct: string, factor: number): string {
    if (!totalRefKcal || !pct) return "";
    return String(Math.round(totalRefKcal * parseFloat(pct) / 100 / factor));
  }

  function gToPct(g: string, factor: number): string {
    if (!totalRefKcal || !g) return "";
    return String(Math.round(parseInt(g) * factor / totalRefKcal * 100));
  }

  function onPctChange(macro: "g" | "l" | "p", val: string) {
    if (macro === "g") { setNutGlucidesPct(val); setNutGlucides(pctToG(val, 4)); }
    if (macro === "l") { setNutLipidesPct(val);  setNutLipides(pctToG(val, 9)); }
    if (macro === "p") { setNutProteinesPct(val); setNutProteines(pctToG(val, 4)); }
  }

  function onGramChange(macro: "g" | "l" | "p", val: string) {
    if (macro === "g") { setNutGlucides(val); setNutGlucidesPct(gToPct(val, 4)); }
    if (macro === "l") { setNutLipides(val);  setNutLipidesPct(gToPct(val, 9)); }
    if (macro === "p") { setNutProteines(val); setNutProteinesPct(gToPct(val, 4)); }
  }

  function applyDefaultPcts() {
    const [gP, lP, pP] = DEFAULT_PCTS[nutStrategy];
    setNutGlucidesPct(String(gP)); setNutLipidesPct(String(lP)); setNutProteinesPct(String(pP));
    setNutGlucides(pctToG(String(gP), 4));
    setNutLipides(pctToG(String(lP), 9));
    setNutProteines(pctToG(String(pP), 4));
  }

  // ── Chargement nutrition depuis Supabase ──────────────────────────────────
  useEffect(() => {
    getNutritionStrategy(athlete.id)
      .then(s => {
        if (s) {
          setNutStrategy(s.strategy);
          setNutTargetWeight(s.target_weight?.toString() ?? "");
          setNutCalorieMode(s.calorie_mode ?? (s.can_track_calories ? "active" : "nap"));
          setNutNap(s.nap?.toString() ?? "");
          setNutTotalCalCoach(s.total_calories_coach?.toString() ?? "");
          const dm = s.deficit_mode ?? "fixed";
          setNutDeficitMode(dm);
          if (dm === "range") {
            const wMin = s.surplus_deficit_min, wMax = s.surplus_deficit_max;
            if (s.strategy === "seche") {
              // fenêtre [-12, -8] → inputs "déficit 8" / "déficit 12"
              setNutRangeMin(wMax != null ? String(Math.abs(wMax)) : "");
              setNutRangeMax(wMin != null ? String(Math.abs(wMin)) : "");
            } else if (s.strategy === "prise_de_masse") {
              setNutRangeMin(wMin != null ? String(Math.abs(wMin)) : "");
              setNutRangeMax(wMax != null ? String(Math.abs(wMax)) : "");
            } else {
              setNutRangeMin(wMin?.toString() ?? "");
              setNutRangeMax(wMax?.toString() ?? "");
            }
          } else {
            setNutTargetPct(deriveTargetPct(s.surplus_deficit_min ?? null, s.surplus_deficit_max ?? null, s.strategy));
          }
          setNutGlucides(s.macros_glucides?.toString() ?? "");
          setNutLipides(s.macros_lipides?.toString() ?? "");
          setNutProteines(s.macros_proteines?.toString() ?? "");
          setNutGlucidesPct(s.macros_glucides_pct?.toString() ?? "");
          setNutLipidesPct(s.macros_lipides_pct?.toString() ?? "");
          setNutProteinesPct(s.macros_proteines_pct?.toString() ?? "");
          setNutWeeklyTargetKg(s.weekly_target_kg?.toString() ?? "");
        }
      })
      .catch(console.error)
      .finally(() => setNutLoaded(true));
  }, [athlete.id]);

  // ── Formule MB ────────────────────────────────────────────────────────────
  useEffect(() => {
    const age = derivedAge ?? 0;
    if (metaMode === "formula_no_bf") {
      const w = parseFloat(weightKg), h = parseFloat(heightCm);
      if (w > 0 && h > 0 && age > 0 && (gender === "male" || gender === "female"))
        setMetaManual(calcMifflin(w, h, age, gender).toString());
    } else if (metaMode === "formula_bf") {
      const w = parseFloat(weightKg), bf = parseFloat(bodyFatPct);
      if (w > 0 && bf > 0 && bf < 100)
        setMetaManual(calcKatchMcArdle(w, bf).toString());
    }
  }, [metaMode, weightKg, heightCm, birthDate, gender, bodyFatPct]);

  // ── Sauvegardes séparées ──────────────────────────────────────────────────
  async function handleSaveProfile() {
    setSavingProfile(true);
    setErrorProfile("");
    try {
      await updateAthleteProfile(athlete.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: derivedAge,
        birth_date: birthDate || null,
        height_cm: heightCm ? parseInt(heightCm) : null,
        gender: (gender as "male" | "female") || null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        body_fat_pct: bodyFatPct ? parseFloat(bodyFatPct) : null,
        base_metabolism: metaManual ? parseInt(metaManual) : null,
        is_hyrox_athlete: isHyrox,
      });
      toast.success("Profil enregistré !");
    } catch (e) {
      setErrorProfile((e as Error).message || "Erreur lors de la sauvegarde");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSaveNutrition() {
    setSavingNut(true);
    setErrorNut("");
    let sdMin: number | null, sdMax: number | null;
    if (nutDeficitMode === "range") {
      [sdMin, sdMax] = normalizedRangeWindow();
    } else {
      [sdMin, sdMax] = computeMinMax(nutTargetPct, nutStrategy);
    }
    try {
      // Composition corporelle + MB vivent dans l'onglet nutrition : persister aussi le profil
      await updateAthleteProfile(athlete.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        age: derivedAge,
        birth_date: birthDate || null,
        height_cm: heightCm ? parseInt(heightCm) : null,
        gender: (gender as "male" | "female") || null,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        body_fat_pct: bodyFatPct ? parseFloat(bodyFatPct) : null,
        base_metabolism: metaManual ? parseInt(metaManual) : null,
      });
      await upsertNutritionStrategy(athlete.id, {
        strategy: nutStrategy,
        can_track_calories: nutCalorieMode !== "nap",
        calorie_mode: nutCalorieMode,
        deficit_mode: nutDeficitMode,
        nap: nutNap ? parseFloat(nutNap) : null,
        target_weight: nutTargetWeight ? parseFloat(nutTargetWeight) : null,
        total_calories_coach: nutTotalCalCoach ? parseInt(nutTotalCalCoach) : null,
        total_calories_min: nutDeficitMode === "range" ? rangeKcalMin : null,
        total_calories_max: nutDeficitMode === "range" ? rangeKcalMax : null,
        tdee_ref: tdee > 0 ? tdee : null,
        surplus_deficit_min: sdMin,
        surplus_deficit_max: sdMax,
        weekly_target_kg: nutWeeklyTargetKg ? parseFloat(nutWeeklyTargetKg) : null,
        macros_glucides: nutGlucides ? parseInt(nutGlucides) : null,
        macros_lipides: nutLipides ? parseInt(nutLipides) : null,
        macros_proteines: nutProteines ? parseInt(nutProteines) : null,
        macros_glucides_pct: nutGlucidesPct ? parseFloat(nutGlucidesPct) : null,
        macros_lipides_pct: nutLipidesPct ? parseFloat(nutLipidesPct) : null,
        macros_proteines_pct: nutProteinesPct ? parseFloat(nutProteinesPct) : null,
      });
      toast.success("Plan nutritionnel enregistré !");
    } catch (e) {
      setErrorNut((e as Error).message || "Erreur lors de la sauvegarde");
    } finally {
      setSavingNut(false);
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 4,
    border: "1px solid " + C.brdL, background: C.s2, color: C.tx,
    fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const,
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 600 as const, color: C.tx3,
    textTransform: "uppercase" as const, letterSpacing: "0.5px",
    display: "block", marginBottom: 6,
  };
  const sectionTitle = {
    fontSize: 12, fontWeight: 700 as const, color: C.tx2,
    marginBottom: 12, marginTop: 20, paddingBottom: 6,
    borderBottom: "1px solid " + C.brd,
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const formContent = (
    <div style={{ padding: inline ? "16px" : "20px 20px 32px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>
            {lockTab
              ? (dataTab === "profil" ? "Modifier l'identité" : "Plan nutritionnel")
              : (isOwnProfile ? "Mon profil" : "Profil de l'athlète")}
          </div>
          <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>{athlete.full_name}</div>
        </div>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 18, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>

      {/* Onglets Profil / Plan nutri (masqués en mode verrouillé) */}
      {!lockTab && (
        <div style={{ display: "flex", gap: 4, marginBottom: 20, padding: 4, background: C.s2, borderRadius: 4 }}>
          {([["profil", "Profil"], ["nutrition", "Plan nutritionnel"]] as ["profil" | "nutrition", string][]).map(([k, l]) => (
            <button key={k} onClick={() => setDataTab(k)} style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "none", background: dataTab === k ? C.coach : "transparent", color: dataTab === k ? "#fff" : C.tx3, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════ TAB PROFIL ═══════════════════════════════════ */}
      {dataTab === "profil" && (<>

        {/* Identité */}
        <div style={sectionTitle}>Identité</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={labelStyle}>Prénom</label><input style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Prénom" /></div>
          <div><label style={labelStyle}>Nom</label><input style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Nom" /></div>
        </div>

        {/* Date de naissance → âge auto */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Date de naissance</label>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              type="date"
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
              max={localISO()}
            />
            {derivedAge !== null && (
              <div style={{ padding: "8px 14px", borderRadius: 4, background: C.coach + "18", border: "1px solid " + C.coach + "40", textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.coach }}>{derivedAge}</div>
                <div style={{ fontSize: 9, color: C.tx3 }}>ans</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={labelStyle}>Taille (cm)</label><input style={inputStyle} type="number" min={100} max={250} value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="ex: 178" /></div>
          <div>
            <label style={labelStyle}>Genre</label>
            <div style={{ display: "flex", gap: 6, height: 38 }}>
              {(["male", "female"] as const).map(g => (
                <button key={g} onClick={() => setGender(g)} style={{ flex: 1, borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, border: "1px solid " + (gender === g ? C.ac : C.brdL), background: gender === g ? C.acS : C.s2, color: gender === g ? C.ac : C.tx2 }}>
                  {g === "male" ? "Homme" : "Femme"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* HYROX toggle */}
        {(athlete.coach_id === user?.id || athlete.id === user?.id) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "8px 0" }}>
            <div style={{ fontSize: 12, color: C.tx2 }}>Athlète HYROX</div>
            <button onClick={() => setIsHyrox(!isHyrox)} style={{ width: 46, height: 26, borderRadius: 13, background: isHyrox ? C.o : C.s2, border: `2px solid ${isHyrox ? C.o : C.brdL}`, cursor: "pointer", position: "relative", transition: "all 0.2s", flexShrink: 0, outline: "none" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: isHyrox ? 24 : 2, transition: "left 0.2s" }} />
            </button>
          </div>
        )}

        {errorProfile && <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 4, background: C.r + "15", border: "1px solid " + C.r + "40", fontSize: 13, color: C.r }}>{errorProfile}</div>}

        <button
          onClick={handleSaveProfile}
          disabled={savingProfile}
          style={{ width: "100%", padding: "14px 0", borderRadius: 6, border: "none", background: savingProfile ? C.s2 : C.coach, color: savingProfile ? C.tx3 : "#fff", fontSize: 15, fontWeight: 700, cursor: savingProfile ? "default" : "pointer", fontFamily: "inherit", marginTop: 24 }}
        >
          {savingProfile ? "Enregistrement..." : "Enregistrer le profil"}
        </button>
      </>)}

      {/* ═══════════════════════════════════ TAB NUTRITION ═══════════════════════════════════ */}
      {dataTab === "nutrition" && (<>

        {/* Composition corporelle (base des calculs nutritionnels) */}
        <div style={sectionTitle}>Composition corporelle</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><label style={labelStyle}>Poids de référence (kg)</label><input style={inputStyle} type="number" min={30} max={250} step={0.1} value={weightKg} onChange={e => setWeightKg(e.target.value)} placeholder="ex: 75.5" /></div>
          <div><label style={labelStyle}>Masse grasse (%)</label><input style={inputStyle} type="number" min={1} max={60} step={0.1} value={bodyFatPct} onChange={e => setBodyFatPct(e.target.value)} placeholder="ex: 18" /></div>
        </div>

        {/* Métabolisme de base */}
        <div style={sectionTitle}>Métabolisme de base</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" as const }}>
          {([["manual", "Manuel"], ["formula_no_bf", "Formule (sans MG)"], ["formula_bf", "Formule (avec MG)"]] as [MetaMode, string][]).map(([mode, label]) => (
            <button key={mode} onClick={() => setMetaMode(mode)} style={{ padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, border: "1px solid " + (metaMode === mode ? C.coach : C.brdL), background: metaMode === mode ? C.coachS : C.s2, color: metaMode === mode ? C.coach : C.tx2 }}>
              {label}
            </button>
          ))}
        </div>
        {metaMode === "formula_no_bf" && (
          <div style={{ background: C.s2, borderRadius: 4, padding: 10, marginBottom: 12, border: "1px solid " + C.brd, fontSize: 11, color: C.tx3 }}>
            Formule Mifflin-St Jeor — nécessite poids, taille, âge et genre
            {(!heightCm || !derivedAge || !gender) && <div style={{ color: C.o, marginTop: 6 }}>Complète taille, date de naissance et genre dans « Modifier l'identité »</div>}
          </div>
        )}
        {metaMode === "formula_bf" && (
          <div style={{ background: C.s2, borderRadius: 4, padding: 10, marginBottom: 12, border: "1px solid " + C.brd, fontSize: 11, color: C.tx3 }}>
            Formule Katch-McArdle — nécessite poids et % de masse grasse
          </div>
        )}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>{metaMode === "manual" ? "Métabolisme de base (kcal/j)" : "Résultat calculé (kcal/j) — modifiable"}</label>
          <input style={{ ...inputStyle, border: "1px solid " + (metaMode !== "manual" ? C.coach + "60" : C.brdL) }} type="number" min={800} max={6000} value={metaManual} onChange={e => setMetaManual(e.target.value)} placeholder="ex: 1850" />
          {metaManual && <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>{parseInt(metaManual).toLocaleString("fr-FR")} kcal / jour</div>}
        </div>

        {/* Stratégie */}
        <div style={sectionTitle}>Stratégie</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {([["seche", "Seche"], ["maintenance", "Maintenance"], ["prise_de_masse", "Prise de masse"]] as [NutritionStrategyType, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setNutStrategy(k)} style={{ flex: 1, padding: "10px 4px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, border: "1px solid " + (nutStrategy === k ? C.coach : C.brdL), background: nutStrategy === k ? C.coachS : C.s2, color: nutStrategy === k ? C.coach : C.tx2, lineHeight: 1.4 }}>
              {l}
            </button>
          ))}
        </div>

        {/* Objectif poids */}
        <div style={sectionTitle}>Objectif de poids</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Poids cible (kg)</label>
            <input style={inputStyle} type="number" min={30} max={250} step={0.1} placeholder="ex: 80.0" value={nutTargetWeight} onChange={e => setNutTargetWeight(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Objectif hebdomadaire (kg/sem)</label>
            <input style={{ ...inputStyle, border: "1px solid " + C.coach + "50", color: nutWeeklyTargetKg ? (parseFloat(nutWeeklyTargetKg) < 0 ? C.r : parseFloat(nutWeeklyTargetKg) > 0 ? C.g : C.b) : C.tx }} type="number" step={0.05} placeholder={nutStrategy === "seche" ? "ex: -0.3" : nutStrategy === "prise_de_masse" ? "ex: 0.2" : "ex: 0"} value={nutWeeklyTargetKg} onChange={e => setNutWeeklyTargetKg(e.target.value)} />
          </div>
        </div>

        {/* Presets objectif hebdo */}
        <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" as const }}>
          {(nutStrategy === "seche"
            ? [[-0.6,"−0.6"],[-0.5,"−0.5"],[-0.4,"−0.4"],[-0.3,"−0.3"],[-0.2,"−0.2"],[-0.1,"−0.1"]]
            : nutStrategy === "prise_de_masse"
            ? [[0.1,"+0.1"],[0.15,"+0.15"],[0.2,"+0.2"],[0.25,"+0.25"],[0.3,"+0.3"],[0.4,"+0.4"]]
            : [[-0.1,"−0.1"],[0,"±0"],[0.1,"+0.1"]]
          ).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setNutWeeklyTargetKg(String(v))}
              style={{ padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                border: "1px solid " + (nutWeeklyTargetKg === String(v) ? C.coach : C.brdL),
                background: nutWeeklyTargetKg === String(v) ? C.coachS : C.s2,
                color: nutWeeklyTargetKg === String(v) ? C.coach : C.tx2 }}>
              {l as string}
            </button>
          ))}
        </div>

        {/* Calculateur auto */}
        <div style={{ background: C.s2, borderRadius: 6, padding: "12px 14px", border: "1px solid " + C.coach + "30", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.coach, marginBottom: 10 }}>Calculateur automatique</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={{ ...labelStyle, color: C.tx3 }}>Objectif (kg)</label>
              <input
                style={{ ...inputStyle, fontSize: 13 }}
                type="number" step={0.5} min={0.1}
                placeholder={nutStrategy === "seche" ? "ex: 5" : nutStrategy === "prise_de_masse" ? "ex: 5" : "ex: 1"}
                value={calcKg}
                onChange={e => setCalcKg(e.target.value)}
              />
              <div style={{ fontSize: 9, color: C.tx3, marginTop: 3 }}>
                {nutStrategy === "seche" ? "kg à perdre" : nutStrategy === "prise_de_masse" ? "kg à prendre" : "tolérance en kg"}
              </div>
            </div>
            <div>
              <label style={{ ...labelStyle, color: C.tx3 }}>Délai (mois)</label>
              <input
                style={{ ...inputStyle, fontSize: 13 }}
                type="number" step={0.5} min={0.5}
                placeholder="ex: 3"
                value={calcMonths}
                onChange={e => setCalcMonths(e.target.value)}
              />
            </div>
          </div>
          {calcKg && calcMonths && parseFloat(calcMonths) > 0 && (() => {
            const weeks = parseFloat(calcMonths) * 4.33;
            let rate = +(parseFloat(calcKg) / weeks).toFixed(2);
            if (nutStrategy === "seche") rate = -Math.abs(rate);
            const rateColor = rate < 0 ? C.r : rate > 0 ? C.g : C.b;
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.tx3 }}>
                  → <span style={{ fontWeight: 700, color: rateColor }}>{rate > 0 ? "+" : ""}{rate} kg/sem</span>
                  <span style={{ fontSize: 10, marginLeft: 6 }}>sur ~{Math.round(weeks)} sem.</span>
                </div>
                <button
                  onClick={applyAutoCalc}
                  style={{ padding: "6px 14px", borderRadius: 4, border: "none", background: C.acV, color: "#0E0C0A", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Appliquer
                </button>
              </div>
            );
          })()}
          {nutWeeklyTargetKg && (
            <div style={{ fontSize: 10, color: C.tx3 }}>
              {nutStrategy === "seche" ? "Recommandé : −0.3 à −0.5 kg/sem (sèche propre)" : nutStrategy === "prise_de_masse" ? "Recommandé : +0.1 à +0.3 kg/sem (lean bulk)" : "Stable : ±0.1 kg/sem max"}
            </div>
          )}
        </div>

        {/* NAP */}
        <div style={sectionTitle}>Niveau d'activité (NAP)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          {NAP_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setNutNap(String(opt.value))} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (nutNap === String(opt.value) ? C.coach : C.brdL), background: nutNap === String(opt.value) ? C.coachS : C.s2, textAlign: "left" }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: nutNap === String(opt.value) ? C.coach : C.tx }}>{opt.label}</span>
                <span style={{ fontSize: 11, color: C.tx3, marginLeft: 8 }}>{opt.sub}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: nutNap === String(opt.value) ? C.coach : C.tx3 }}>×{opt.value}</span>
            </button>
          ))}
        </div>
        {tdee > 0 && (
          <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 4, background: C.s2, border: "1px solid " + C.brdL, fontSize: 12 }}>
            <span style={{ color: C.tx3 }}>TDEE (dépense totale) : </span>
            <span style={{ fontWeight: 800, color: C.tx }}>{tdee.toLocaleString("fr-FR")} kcal/j</span>
            <span style={{ color: C.tx3, fontSize: 10 }}> = BMR {bmr} × {nap}</span>
          </div>
        )}

        {/* Déficit / Surplus / Tolérance selon stratégie */}
        <div style={{ marginBottom: 14 }}>
          {/* Toggle fixe / fourchette */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>{stratPctMeta.label}</label>
            <div style={{ display: "flex", gap: 4 }}>
              {(["fixed", "range"] as DeficitMode[]).map(m => (
                <button key={m} onClick={() => setNutDeficitMode(m)} style={{
                  padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                  border: "1px solid " + (nutDeficitMode === m ? C.coach : C.brdL),
                  background: nutDeficitMode === m ? C.coachS : "transparent",
                  color: nutDeficitMode === m ? C.coach : C.tx3,
                }}>
                  {m === "fixed" ? "% Fixe" : "Fourchette"}
                </button>
              ))}
            </div>
          </div>
          {nutDeficitMode === "fixed" ? (
            <>
              <input style={inputStyle} type="number" min={stratPctMeta.min} max={stratPctMeta.max} step={0.5} placeholder={stratPctMeta.placeholder} value={nutTargetPct} onChange={e => setNutTargetPct(e.target.value)} />
              {nutTargetPct && tdee > 0 && (
                <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 4, background: C.s2, border: "1px solid " + C.brdL, fontSize: 12 }}>
                  <span style={{ color: C.tx3 }}>Calories cibles : </span>
                  <span style={{ fontWeight: 800, color: nutStrategy === "seche" ? C.r : nutStrategy === "prise_de_masse" ? C.g : C.b }}>
                    {computeTargetKcal(tdee, nutTargetPct, nutStrategy).toLocaleString("fr-FR")} kcal/j
                  </span>
                  <span style={{ color: C.tx3, fontSize: 11 }}> · tolérance ±2%</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 11, color: C.tx3, marginBottom: 6 }}>
                {nutStrategy === "seche" ? "Déficit visé, de X à Y % sous la dépense (ex: 8 à 12)"
                  : nutStrategy === "prise_de_masse" ? "Surplus visé, de X à Y % au-dessus de la dépense (ex: 5 à 10)"
                  : "Écart acceptable vs la dépense (valeurs signées, ex: -3 à +3)"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>
                    {nutStrategy === "seche" ? "Déficit min %" : nutStrategy === "prise_de_masse" ? "Surplus min %" : "Min %"}
                  </div>
                  <input style={inputStyle} type="number" step={0.5} min={nutStrategy === "maintenance" ? undefined : 0}
                    placeholder={nutStrategy === "seche" ? "ex: 8" : nutStrategy === "prise_de_masse" ? "ex: 5" : "ex: -3"}
                    value={nutRangeMin} onChange={e => setNutRangeMin(e.target.value)} />
                </div>
                <div style={{ color: C.tx3, fontSize: 13, paddingTop: 18 }}>→</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>
                    {nutStrategy === "seche" ? "Déficit max %" : nutStrategy === "prise_de_masse" ? "Surplus max %" : "Max %"}
                  </div>
                  <input style={inputStyle} type="number" step={0.5} min={nutStrategy === "maintenance" ? undefined : 0}
                    placeholder={nutStrategy === "seche" ? "ex: 12" : nutStrategy === "prise_de_masse" ? "ex: 10" : "ex: +3"}
                    value={nutRangeMax} onChange={e => setNutRangeMax(e.target.value)} />
                </div>
              </div>
              {rangeKcalMin != null && rangeKcalMax != null && (
                <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 4, background: C.s2, border: "1px solid " + C.brdL, fontSize: 12 }}>
                  <span style={{ color: C.tx3 }}>Fourchette : </span>
                  <span style={{ fontWeight: 800, color: nutStrategy === "seche" ? C.r : nutStrategy === "prise_de_masse" ? C.g : C.b }}>{rangeKcalMin.toLocaleString("fr-FR")}</span>
                  <span style={{ color: C.tx3 }}> → </span>
                  <span style={{ fontWeight: 800, color: nutStrategy === "seche" ? C.r : nutStrategy === "prise_de_masse" ? C.g : C.b }}>{rangeKcalMax.toLocaleString("fr-FR")} kcal/j</span>
                  <span style={{ color: C.tx3, fontSize: 11 }}> · vs TDEE {tdee.toLocaleString("fr-FR")}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mode de calcul calorique */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Mode de calcul calorique</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {([
              ["nap",    "BMR × NAP",           "Calories fixes basées sur le niveau d'activité"],
              ["active", "BMR + calories actives", "L'athlète saisit ses calories actives quotidiennes"],
              ["hybrid", "Hybride",              "NAP par défaut, remplacé si l'athlète saisit ses calories actives"],
            ] as [CalorieMode, string, string][]).map(([mode, label, sub]) => (
              <button key={mode} onClick={() => setNutCalorieMode(mode)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "inherit", border: "1px solid " + (nutCalorieMode === mode ? C.coach : C.brdL), background: nutCalorieMode === mode ? C.coachS : C.s2, textAlign: "left" }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: nutCalorieMode === mode ? C.coach : C.tx }}>{label}</span>
                  <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>{sub}</div>
                </div>
                {nutCalorieMode === mode && <span style={{ fontSize: 16, color: C.coach }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Total kcal */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Total calorique journalier cible (kcal)</label>
          {nutDeficitMode === "range" && rangeKcalMin != null && rangeKcalMax != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 4, background: C.s2, border: "1px solid " + C.coach + "50" }}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: C.tx3, marginBottom: 2 }}>Min</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.tx }}>{rangeKcalMin.toLocaleString("fr-FR")}</div>
              </div>
              <div style={{ color: C.tx3, fontSize: 14 }}>→</div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: C.tx3, marginBottom: 2 }}>Max</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: C.tx }}>{rangeKcalMax.toLocaleString("fr-FR")}</div>
              </div>
              <div style={{ paddingLeft: 10, borderLeft: "1px solid " + C.brdL, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: C.tx3, marginBottom: 2 }}>Milieu</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.coach }}>{nutTotalCalCoach || "—"}</div>
              </div>
            </div>
          ) : (
            <input style={{ ...inputStyle, border: "1px solid " + (tdee > 0 ? C.coach + "60" : C.brdL) }} type="number" min={500} max={8000} placeholder="ex: 2200" value={nutTotalCalCoach} onChange={e => setNutTotalCalCoach(e.target.value)} />
          )}
          {tdee > 0 && (
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>
              {nutDeficitMode === "range"
                ? "Fourchette auto-calculée depuis TDEE × % min/max — les macros se basent sur le milieu"
                : "Auto-calculé depuis TDEE — modifiable si besoin"}
            </div>
          )}
        </div>

        {/* Macronutriments */}
        <div style={sectionTitle}>Macronutriments</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: C.tx3 }}>Répartition</span>
          <button type="button" onClick={applyDefaultPcts} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + C.coach + "50", background: C.coachS, color: C.coach, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Suggestion {nutStrategy === "seche" ? "40/25/35" : nutStrategy === "prise_de_masse" ? "50/25/25" : "45/30/25"}
          </button>
        </div>
        {!totalRefKcal && (
          <div style={{ fontSize: 11, color: C.o, marginBottom: 10, padding: "6px 10px", borderRadius: 7, background: C.o + "12", border: "1px solid " + C.o + "30" }}>
            Renseigne les calories cibles ci-dessus pour que les grammes se calculent automatiquement.
          </div>
        )}
        {(() => {
          const pctSum = (parseFloat(nutGlucidesPct) || 0) + (parseFloat(nutLipidesPct) || 0) + (parseFloat(nutProteinesPct) || 0);
          const pctOk = pctSum === 0 || (pctSum >= 98 && pctSum <= 102);
          const macros = [
            { k: "g" as const, label: "Glucides", pct: nutGlucidesPct, g: nutGlucides, color: C.b },
            { k: "l" as const, label: "Lipides",  pct: nutLipidesPct,  g: nutLipides,  color: C.o },
            { k: "p" as const, label: "Protéines",pct: nutProteinesPct,g: nutProteines, color: C.g },
          ];
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
                {macros.map(m => (
                  <div key={m.k} style={{ background: C.s2, borderRadius: 4, padding: "10px 10px 8px", border: "1px solid " + m.color + "30" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: m.color, marginBottom: 8 }}>{m.label}</div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: C.tx3, marginBottom: 3 }}>%</div>
                      <input style={{ ...inputStyle, padding: "7px 8px", fontSize: 15, fontWeight: 800, textAlign: "center" as const, borderColor: m.color + "50", color: m.color }} type="number" min={0} max={100} step={1} placeholder="—" value={m.pct} onChange={e => onPctChange(m.k, e.target.value)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: C.tx3, marginBottom: 3 }}>grammes</div>
                      <input style={{ ...inputStyle, padding: "6px 8px", fontSize: 13, textAlign: "center" as const }} type="number" min={0} max={1000} placeholder="0" value={m.g} onChange={e => onGramChange(m.k, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: pctOk ? C.tx3 : C.r, fontWeight: pctOk ? 400 : 700 }}>
                  Total % : {pctSum}%{!pctOk && " ≠ 100%"}
                </span>
                {(nutGlucides || nutLipides || nutProteines) && (
                  <span style={{ color: C.tx3 }}>
                    Total kcal :&nbsp;
                    <span style={{ fontWeight: 700, color: C.tx }}>
                      {((parseInt(nutGlucides) || 0) * 4) + ((parseInt(nutLipides) || 0) * 9) + ((parseInt(nutProteines) || 0) * 4)}
                    </span>
                  </span>
                )}
              </div>
            </>
          );
        })()}

        {errorNut && <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 4, background: C.r + "15", border: "1px solid " + C.r + "40", fontSize: 13, color: C.r }}>{errorNut}</div>}

        <button
          onClick={handleSaveNutrition}
          disabled={savingNut || !nutLoaded}
          style={{ width: "100%", padding: "14px 0", borderRadius: 6, border: "none", background: savingNut || !nutLoaded ? C.s2 : C.coach, color: savingNut || !nutLoaded ? C.tx3 : "#fff", fontSize: 15, fontWeight: 700, cursor: savingNut || !nutLoaded ? "default" : "pointer", fontFamily: "inherit", marginTop: 24 }}
        >
          {savingNut ? "Enregistrement..." : "Enregistrer le plan nutritionnel"}
        </button>
      </>)}

    </div>
  );

  if (inline) {
    return <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.coach + "50" }}>{formContent}</div>;
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div
        style={{
          width: "100%", maxWidth: 680,
          background: C.s1, borderRadius: 6,
          border: "1px solid " + C.brdL,
          maxHeight: "90vh", overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {formContent}
      </div>
    </div>
  );
}
