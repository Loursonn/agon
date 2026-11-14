import { useState, useEffect, useRef } from "react";
import { errorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { addDays, localIsoDay } from "@shared/domain/dates";
import {
  calorieMode,
  dayDepense,
  evaluateLoggedDay,
  evaluateNutritionDay,
  NUTRITION_TOLERANCE_PCT,
  NutritionDayStatus,
  NutritionStrategy,
  NutritionDailyLog,
} from "@/lib/nutrition";
import { useNutritionLog, useSaveNutritionDay } from "@/features/shared/hooks/useNutrition";
import { notifyQueued } from "@/lib/offline/writes";
import { useIsDesktop } from "@/hooks/useIsDesktop";

const INK = "#0E0C0A";
const ROUGE_VIF = "#FF3B1F";
const PROTEINES = "#FF5A33";

/** Pictos de la planche « Nutrition athlète » (traits carrés, 24×24). */
const STRATEGY_ICON: Record<string, JSX.Element> = {
  maintenance: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.8" fill={INK} /></>,
  seche: <path d="M12 22C7.6 22 5 19 5 15.2C5 11 9 9 9 4C12 6 14 8 14 11C15 10 15.5 9 15.5 8C18 10 19 12.6 19 15.2C19 19 16.4 22 12 22Z" />,
  prise_de_masse: <path d="M13 2L4 14H11L10 22L20 9H13Z" />,
};

// Planche : maintenance en vert ; sèche en rouge ; prise de masse en bleu.
const STRATEGY_META: Record<string, { label: string; color: string; verb: string }> = {
  maintenance:    { label: "Maintenance",    color: C.g, verb: "Écart visé" },
  seche:          { label: "Sèche",          color: C.r, verb: "Déficit visé" },
  prise_de_masse: { label: "Prise de masse", color: C.b, verb: "Surplus visé" },
};

/** Fond teinté des cartes de la planche : aplat de la couleur à 12 % (peps, sans dégradé). */
const tint = (color: string) => `${color}1F`;
const KICK: React.CSSProperties = { ...MONO, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", color: C.tx2 };

function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
      <h2 style={{ margin: 0, height: 20, display: "flex", alignItems: "center", ...MONO, fontWeight: 400, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
        <span style={{ color: C.ac }}>{n} —</span>&nbsp;{children}
      </h2>
      <div style={{ height: 1, background: C.brd }} />
    </div>
  );
}

function IconSquare({ color, size = 32, children }: { color: string; size?: number; children: React.ReactNode }) {
  const inner = Math.round(size * 0.5);
  return (
    <span aria-hidden style={{ width: size, height: size, flex: "none", borderRadius: 10, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="square">{children}</svg>
    </span>
  );
}

// Jour LOCAL : `toISOString` datait la saisie de la veille entre minuit et ~2 h.
const isoDaysAgo = (today: string, n: number) => addDays(today, -n);

function fmtKcal(n: number) {
  return n.toLocaleString("fr-FR");
}

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const frNum = (v: number, decimals: number) => Math.abs(v).toLocaleString("fr-FR", { maximumFractionDigits: decimals });

function fmtPct(v: number, decimals = 1) {
  return `${sign(v)}${frNum(v, decimals)} %`;
}

function fmtWindow(wMin: number, wMax: number) {
  if (wMin === wMax) return fmtPct(wMin, 1);
  return `${sign(wMin)}${frNum(wMin, 1)} à ${sign(wMax)}${frNum(wMax, 1)} %`;
}

interface Props {
  athleteId: string;
  bmr: number | null;
  nutritionStrategy: NutritionStrategy | null;
  weightLog?: Record<string, number>;
  viewOnly?: boolean;
}

export default function NutritionView({ athleteId, bmr, nutritionStrategy, weightLog, viewOnly = false }: Props) {
  const isDesktop = useIsDesktop();
  const today = localIsoDay();
  // Journal lu par la couche API (lève en cas d'erreur, jamais `{}` à la place).
  const logQuery = useNutritionLog(athleteId);
  const history = logQuery.data;
  const saveDay = useSaveNutritionDay(athleteId);
  const [log, setLog] = useState<Partial<NutritionDailyLog>>({});
  // Saisie en cours : un rafraîchissement du journal ne l'écrase pas.
  const dirty = useRef(false);
  const logLoading = logQuery.isLoading;
  const saving = saveDay.isPending;

  useEffect(() => {
    if (history && !dirty.current) setLog(history[today] ?? {});
  }, [history, today]);

  const upd = (k: keyof NutritionDailyLog, v: number | null) => {
    dirty.current = true;
    setLog(prev => {
      const next = { ...prev, [k]: v };
      if (k === "glucides_consumed" || k === "lipides_consumed" || k === "proteines_consumed") {
        const g = k === "glucides_consumed" ? v : (prev.glucides_consumed ?? 0);
        const l = k === "lipides_consumed"  ? v : (prev.lipides_consumed  ?? 0);
        const p = k === "proteines_consumed"? v : (prev.proteines_consumed ?? 0);
        next.total_calories_consumed = (g ?? 0) * 4 + (l ?? 0) * 9 + (p ?? 0) * 4;
      }
      return next;
    });
  };

  // Une seule écriture : la journée du jour, via la RPC atomique.
  async function handleSave() {
    try {
      const status = await saveDay.mutateAsync({ day: today, log: log as NutritionDailyLog });
      dirty.current = false;
      if (status === "queued") notifyQueued();
      else toast.success("Journée enregistrée !");
    } catch (e) {
      toast.error(errorMessage(e, "Erreur lors de l'enregistrement"));
    }
  }

  const card: React.CSSProperties = {
    background: C.s1, borderRadius: 6, padding: "16px",
    border: "1px solid " + C.brd, marginBottom: 12,
  };

  if (!nutritionStrategy) {
    return (
      <div style={{ padding: "24px 20px 40px" }}>
        <div style={{ ...card, textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 6 }}>Pas encore de plan nutritionnel</div>
          <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>Ton coach n'a pas encore défini de stratégie. Elle apparaîtra ici dès qu'elle sera prête.</div>
        </div>
      </div>
    );
  }

  const strat = nutritionStrategy;
  const meta = STRATEGY_META[strat.strategy] || { label: strat.strategy, color: C.ac, verb: "Objectif" };

  // ── Dépense & évaluation du jour ───────────────────────────────────────────
  const mode = calorieMode(strat);
  const showActiveCal = mode === "active" || mode === "hybrid";
  const activeCal = log.active_calories ?? 0;
  const dynamicDepense = dayDepense(strat, bmr, log);

  const calConsumed = log.total_calories_consumed || 0;
  const evalDay = evaluateNutritionDay(strat, calConsumed, dynamicDepense);
  // Bornes/fenêtre pour affichage même sans saisie (consumed factice)
  const displayEval = evalDay ?? evaluateNutritionDay(strat, 1, dynamicDepense);

  const wMin = displayEval?.windowMin ?? 0;
  const wMax = displayEval?.windowMax ?? 0;
  const hasWindow = displayEval != null && (wMin !== 0 || wMax !== 0);
  const targetMin = displayEval?.targetMin ?? 0;
  const targetMax = displayEval?.targetMax ?? 0;

  // ── Macros ─────────────────────────────────────────────────────────────────
  const macroTargets = [
    { key: "glucides_consumed" as const,  label: "Glucides",  targetG: strat.macros_glucides,  targetPct: strat.macros_glucides_pct,  color: C.b },
    { key: "lipides_consumed"  as const,  label: "Lipides",   targetG: strat.macros_lipides,   targetPct: strat.macros_lipides_pct,   color: C.ac },
    { key: "proteines_consumed" as const, label: "Protéines", targetG: strat.macros_proteines, targetPct: strat.macros_proteines_pct, color: PROTEINES },
  ];
  const hasMacroTargets = macroTargets.some(m => m.targetG || m.targetPct);
  const hasPcts = macroTargets.every(m => m.targetPct != null && m.targetPct > 0);

  const statusColor = evalDay?.status === "ok" ? C.g : evalDay?.status === "close" ? C.o : evalDay ? C.r : C.tx3;

  // ── Streak & historique ────────────────────────────────────────────────────
  const statusFor = (dateISO: string): NutritionDayStatus | null => {
    return evaluateLoggedDay(strat, bmr, history?.[dateISO])?.status ?? null;
  };

  const streakData = (() => {
    if (!history) return null;
    // Streak : jours consécutifs "ok" en remontant depuis aujourd'hui
    // (si aujourd'hui pas encore rempli, on part d'hier sans casser la série)
    let streak = 0;
    let i = statusFor(today) === null ? 1 : 0;
    let startISO = today;
    for (; i < 365; i++) {
      const iso = isoDaysAgo(today, i);
      const st = statusFor(iso);
      if (st === "ok") { streak++; startISO = iso; }
      else break;
    }
    const days = Array.from({ length: 14 }, (_, k) => {
      const iso = isoDaysAgo(today, 13 - k);
      return { iso, status: statusFor(iso) };
    });
    return { streak, startISO, days };
  })();

  const weightData = (() => {
    if (!weightLog) return null;
    const entries = Object.entries(weightLog)
      .filter(([, v]) => typeof v === "number" && v > 0)
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return null;
    const last30 = entries.filter(([d]) => d >= isoDaysAgo(today, 30));
    const series = (last30.length >= 2 ? last30 : entries.slice(-10)).map(([d, v]) => ({ d, v }));
    const current = entries[entries.length - 1][1];
    // Delta depuis le début de la streak (ou sur la fenêtre affichée)
    const refDate = streakData && streakData.streak > 0 ? streakData.startISO : (series[0]?.d ?? entries[0][0]);
    const ref = entries.filter(([d]) => d <= refDate).pop()?.[1] ?? series[0]?.v ?? current;
    return { series, current, delta: +(current - ref).toFixed(1) };
  })();

  const deltaGood = weightData
    ? (strat.strategy === "seche" ? weightData.delta <= 0 : strat.strategy === "prise_de_masse" ? weightData.delta >= 0 : Math.abs(weightData.delta) <= 0.5)
    : true;

  // Anneau « Total du jour » : part de la borne haute de la zone.
  const ringPct = targetMax > 0 ? Math.min(1, calConsumed / targetMax) : 0;
  const R = 73, CIRC = 2 * Math.PI * R;

  return (
    <div style={{ padding: "24px 20px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Titre et date : en-tête de page (AlimPage) */}

      {/* Ordinateur (planche AthOrdiBAlimentation) : objectif, série et poids sur une rangée 1,75 / 1 / 1. */}
      <div style={isDesktop ? { display: "grid", gridTemplateColumns: "minmax(0, 1.75fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "stretch" } : { display: "contents" }}>
      {/* ── Objectif ── */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14, padding: 16, border: `1px solid ${meta.color}73`, background: tint(meta.color) }}>
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: meta.color }} />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <IconSquare color={meta.color} size={40}>{STRATEGY_ICON[strat.strategy] ?? STRATEGY_ICON.maintenance}</IconSquare>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...DISPLAY, fontSize: 17, letterSpacing: "0.06em", fontWeight: 400, color: C.tx, lineHeight: 1.2 }}>{meta.label}</div>
            {hasWindow && (
              <div style={{ fontSize: 12, color: C.tx2, marginTop: 3, lineHeight: 1.45 }}>
                {meta.verb} : <span style={{ ...MONO, color: C.tx }}>{fmtWindow(wMin, wMax)}</span> vs dépense
              </div>
            )}
          </div>
          {strat.target_weight && (
            <div style={{ textAlign: "right", flex: "none" }}>
              <div style={KICK}>Poids cible</div>
              <div style={{ ...MONO, fontSize: 22, color: meta.color, marginTop: 4 }}>
                {Number(strat.target_weight).toLocaleString("fr-FR")}<span style={{ fontSize: 11, color: C.tx2 }}> kg</span>
              </div>
            </div>
          )}
        </div>

        {/* Zone kcal estimée */}
        <div style={{ marginTop: 18 }}>
          <div style={KICK}>{dynamicDepense != null ? "Zone du jour (BMR + activité)" : "Zone kcal estimée"}</div>
          {targetMin > 0 ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, ...MONO }}>
              <span style={{ fontSize: 30, lineHeight: 1, color: C.tx }}>{fmtKcal(targetMin)}</span>
              {targetMin !== targetMax && <><span style={{ fontSize: 13, color: C.tx3 }}>–</span><span style={{ fontSize: 30, lineHeight: 1, color: C.tx }}>{fmtKcal(targetMax)}</span></>}
              <span style={{ fontSize: 12, color: C.tx2 }}>kcal</span>
            </div>
          ) : (
            <div style={{ ...MONO, fontSize: 30, color: C.tx3, marginTop: 6 }}>—</div>
          )}
          <div style={{ fontSize: 12, color: C.tx2, marginTop: 6 }}>
            {dynamicDepense != null
              ? `Dépense : BMR ${fmtKcal(bmr!)} + ${fmtKcal(activeCal)} actives = ${fmtKcal(dynamicDepense)} kcal`
              : showActiveCal ? "S'ajuste quand tu saisis tes calories actives" : displayEval ? `Base dépense ${fmtKcal(displayEval.reference)} kcal` : ""}
          </div>
        </div>

        {/* Répartition macros cible */}
        {hasMacroTargets && (
          <div style={{ marginTop: 14 }}>
            {hasPcts && (
              <div style={{ display: "flex", gap: 4, height: 8, marginBottom: 10 }}>
                {macroTargets.map(m => (
                  <div key={m.key} style={{ width: (m.targetPct || 0) + "%", background: m.color, borderRadius: 4 }} />
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              {macroTargets.map(m => (
                <span key={m.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.tx2, whiteSpace: "nowrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, flex: "none" }} />
                  <span style={{ ...MONO, fontSize: 13, color: C.tx }}>{m.targetG ?? "—"}</span>
                  <span style={{ ...MONO }}>g{m.targetPct != null ? ` · ${m.targetPct} %` : ""}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Série + poids ── */}
      {(streakData || weightData) && (
        <div style={isDesktop ? { display: "contents" } : { display: "grid", gridTemplateColumns: streakData && weightData ? "1fr 1fr" : "1fr", gap: 10 }}>
          {streakData && (
            <div style={{ borderRadius: 14, padding: 14, border: `1px solid ${C.o}66`, background: tint(C.o), display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconSquare color={C.o} size={24}>{STRATEGY_ICON.seche}</IconSquare>
                <span style={KICK}>Série en cours</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...MONO, fontSize: 40, lineHeight: 1, color: streakData.streak > 0 ? C.o : C.tx3 }}>{streakData.streak}</span>
                <span style={{ fontSize: 12, color: C.tx2, lineHeight: 1.3 }}>jour{streakData.streak > 1 ? "s" : ""} dans l'objectif</span>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {streakData.days.map(d => (
                  <div key={d.iso} title={d.iso} style={{
                    flex: 1, height: 20, borderRadius: 4, boxSizing: "border-box",
                    background: d.status === "ok" ? C.g : d.status === "close" ? C.o : d.status === "off" ? ROUGE_VIF : "transparent",
                    border: d.status ? "none" : `1px dashed ${C.tx3}`,
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", ...MONO, fontSize: 10, color: C.tx3 }}>
                <span>J−13</span><span>aujourd'hui</span>
              </div>
            </div>
          )}

          {weightData && (
            <div style={{ borderRadius: 14, padding: 14, border: `1px solid ${C.b}66`, background: tint(C.b), display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <IconSquare color={C.b} size={24}><path d="M5 20H19L17 8H7Z" /><circle cx="12" cy="5" r="2" /></IconSquare>
                <span style={KICK}>Poids</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ ...MONO, fontSize: 36, lineHeight: 1, color: C.tx }}>{weightData.current.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</span>
                <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>kg</span>
              </div>
              {weightData.delta !== 0 && (
                <span style={{ alignSelf: "flex-start", ...MONO, fontSize: 11, letterSpacing: "0.06em", color: INK, background: deltaGood ? C.g : C.o, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
                  {weightData.delta > 0 ? "▲ +" : "▼ −"}{Math.abs(weightData.delta).toLocaleString("fr-FR")} kg
                </span>
              )}
              {weightData.series.length >= 2 ? (() => {
                const vs = weightData.series.map(p => p.v);
                const min = Math.min(...vs), max = Math.max(...vs);
                const span = max - min || 1;
                const pts = weightData.series.map((p, idx) => {
                  const x = (idx / (weightData.series.length - 1)) * 100;
                  const y = 22 - ((p.v - min) / span) * 18;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(" ");
                return (
                  <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={{ width: "100%", height: 26, display: "block" }}>
                    <polyline points={pts} fill="none" stroke={C.b} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                );
              })() : (
                <div style={{ fontSize: 10, color: C.tx3 }}>Pas assez de pesées récentes</div>
              )}
            </div>
          )}
        </div>
      )}

      </div>

      {/* ── Mon suivi du jour ── */}
      <section style={{ marginTop: 8 }}>
        <SectionTitle n="01">Mon suivi du jour</SectionTitle>

        {logLoading ? (
          <div style={{ color: C.tx3, fontSize: 13, textAlign: "center", padding: "14px 0" }}>Chargement…</div>
        ) : logQuery.isError ? (
          <div style={{ color: C.tx3, fontSize: 13, textAlign: "center", padding: "14px 0" }}>
            Impossible de charger ton journal.{" "}
            <button onClick={() => logQuery.refetch()} style={{ background: "none", border: "none", color: C.ac, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 13, padding: 0 }}>
              Réessayer
            </button>
          </div>
        ) : (
          <div style={isDesktop
            ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gridTemplateRows: "auto 1fr", gap: 16, alignItems: "start" }
            : { display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Calories actives (PC : colonne de droite, planche AthOrdiBAlimentation) */}
            {showActiveCal && (
              <label style={{ ...(isDesktop ? { gridColumn: 2, gridRow: 1, padding: "16px 18px" } : { padding: "10px 12px" }), display: "flex", alignItems: "center", gap: 12, borderRadius: 14, border: `1px solid ${ROUGE_VIF}73`, background: tint(ROUGE_VIF) }}>
                <IconSquare color={ROUGE_VIF} size={32}>{STRATEGY_ICON.seche}</IconSquare>
                <span style={{ flex: 1, fontSize: 13 }}>
                  Calories actives brûlées
                  {mode === "hybrid" && <span style={{ display: "block", fontSize: 11, color: C.tx3 }}>optionnel</span>}
                </span>
                <input
                  aria-label="Calories actives brûlées"
                  style={{ width: 74, height: 34, boxSizing: "border-box", padding: "0 10px", borderRadius: 8, border: `1px solid ${ROUGE_VIF}80`, background: C.s2, color: ROUGE_VIF, ...MONO, fontSize: 15, outline: "none", textAlign: "right" }}
                  type="number" inputMode="numeric" min={0} max={5000} placeholder="0"
                  value={log.active_calories ?? ""}
                  onChange={viewOnly ? undefined : (e => upd("active_calories", e.target.value ? parseInt(e.target.value) : null))}
                  readOnly={viewOnly}
                />
                <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>kcal</span>
              </label>
            )}

            {/* Total du jour + macros */}
            <div style={{ background: C.s1, border: `1px solid ${C.brdL}`, borderRadius: isDesktop ? 16 : 14, padding: isDesktop ? "24px 28px" : 16, display: "flex", flexDirection: isDesktop ? "row" : "column", alignItems: isDesktop ? "center" : undefined, gap: isDesktop ? 36 : 16, ...(isDesktop ? { gridColumn: 1, gridRow: "1 / span 2" } : {}) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flex: "none" }}>
                <div style={{ position: "relative", width: 160, height: 160, flex: "none" }}>
                  <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden>
                    <defs><linearGradient id="nutri-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.o} /><stop offset="1" stopColor={C.ac} /></linearGradient></defs>
                    <circle cx="80" cy="80" r={R} fill="none" stroke={C.brd} strokeWidth="14" />
                    {ringPct > 0 && <circle cx="80" cy="80" r={R} fill="none" stroke="url(#nutri-ring)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(ringPct * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`} transform="rotate(-90 80 80)" />}
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={KICK}>Total du jour</span>
                    <span style={{ ...MONO, fontSize: 32, lineHeight: 1.15, color: calConsumed > 0 ? C.tx : C.tx3 }}>{calConsumed > 0 ? fmtKcal(calConsumed) : "—"}</span>
                    {targetMin > 0 && (
                      <span style={{ ...MONO, fontSize: 10, color: C.tx2, textAlign: "center", lineHeight: 1.4 }}>
                        / {fmtKcal(targetMin)}{targetMin !== targetMax ? `–${fmtKcal(targetMax)}` : ""}<br />kcal
                      </span>
                    )}
                  </div>
                </div>
                {calConsumed > 0 && evalDay && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <span style={KICK}>{evalDay.actualPct <= 0 ? "Déficit réel" : "Surplus réel"}</span>
                    <span style={{ ...MONO, fontSize: 30, lineHeight: 1, color: statusColor }}>{fmtPct(evalDay.actualPct, 0)}</span>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: isDesktop ? 18 : 16, flex: 1, minWidth: 0 }}>
              {macroTargets.map(m => {
                const consumed = log[m.key] ?? null;
                const target = m.targetG;
                const ratio = consumed != null && target ? consumed / target : null;
                const pct = ratio != null ? Math.round(ratio * 100) : null;
                const over = ratio != null && ratio > 1.05;
                return (
                  <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: m.color, flex: "none" }} />
                      <span style={{ fontSize: 13, color: C.tx2, width: 72 }}>{m.label}</span>
                      <input
                        aria-label={`${m.label} consommés (g)`}
                        style={{ width: 64, height: 32, boxSizing: "border-box", padding: "0 8px", borderRadius: 8, border: `1px solid ${m.color}${consumed != null ? "80" : "40"}`, background: C.s2, color: over ? C.o : m.color, ...MONO, fontSize: 18, outline: "none", textAlign: "right" }}
                        type="number" inputMode="numeric" min={0} max={1000} placeholder="—"
                        value={log[m.key] ?? ""}
                        onChange={viewOnly ? undefined : (e => upd(m.key, e.target.value ? parseInt(e.target.value) : null))}
                        readOnly={viewOnly}
                      />
                      <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{target != null ? `/ ${target} g` : "g"}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{pct != null ? `${pct} %` : ""}</span>
                    </label>
                    {target != null && (
                      <div style={{ height: 10, borderRadius: 5, background: m.color + "26" }}>
                        <div style={{ height: 10, width: Math.min(pct ?? 0, 100) + "%", borderRadius: 5, background: over ? C.o : m.color, transition: "width 0.3s" }} />
                      </div>
                    )}
                  </div>
                );
              })}
              </div>

              {!viewOnly && !isDesktop && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ height: 54, width: "100%", borderRadius: 12, border: "none", background: saving ? C.s2 : C.ac, color: saving ? C.tx3 : INK, fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}
                >
                  {saving ? "Enregistrement…" : "Enregistrer ma journée"}
                </button>
              )}
            </div>
            {!viewOnly && isDesktop && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ gridColumn: 2, gridRow: 2, alignSelf: "end", height: 48, width: "100%", borderRadius: 10, border: "none", background: saving ? C.s2 : C.ac, color: saving ? C.tx3 : INK, fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}
              >
                {saving ? "Enregistrement…" : "Enregistrer ma journée"}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Retour sur l'objectif ── */}
      {evalDay && (() => {
        const objectif = hasWindow ? `Objectif ${fmtWindow(wMin, wMax)} (±${NUTRITION_TOLERANCE_PCT} pts)` : `Cible ${fmtKcal(evalDay.target)} kcal ±${NUTRITION_TOLERANCE_PCT} %`;
        const reel = `${evalDay.actualPct <= 0 ? "Déficit" : "Surplus"} réel ${fmtPct(evalDay.actualPct)}`;
        const bg = evalDay.status === "ok" ? C.g : evalDay.status === "close" ? C.o : ROUGE_VIF;
        const title = evalDay.status === "ok"
          ? `Objectif ${meta.label} atteint`
          : evalDay.status === "close" ? `Proche de l'objectif (${fmtPct(evalDay.diffPct)} d'écart)` : `Hors objectif (${fmtPct(evalDay.diffPct)} d'écart)`;
        return (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 14, background: bg, color: INK }}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="square" style={{ flex: "none", marginTop: 1 }}>
              {evalDay.status === "ok" ? <path d="M4 12.5L9.5 18L20 6" /> : <><path d="M12 3L22 20H2Z" /><path d="M12 10V14M12 17V17.5" /></>}
            </svg>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{objectif} · {reel}</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
