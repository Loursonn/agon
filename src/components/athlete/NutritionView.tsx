import { useState, useEffect } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { EmojiIcon } from "@/components/ui/AgonIcon";
import {
  getDailyLog,
  upsertDailyLog,
  evaluateNutritionDay,
  NUTRITION_TOLERANCE_PCT,
  NutritionDayStatus,
  NutritionStrategy,
  NutritionDailyLog,
} from "@/lib/nutrition";

const STRATEGY_META: Record<string, { label: string; color: string; icon: string; verb: string }> = {
  maintenance:    { label: "Maintenance",    color: C.b, icon: "balance", verb: "Écart visé" },
  seche:          { label: "Sèche",          color: C.r, icon: "flamme", verb: "Déficit visé" },
  prise_de_masse: { label: "Prise de masse", color: C.g, icon: "musculation", verb: "Surplus visé" },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtKcal(n: number) {
  return n.toLocaleString("fr-FR");
}

function fmtPct(v: number, decimals = 1) {
  return (v > 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

function fmtWindow(wMin: number, wMax: number) {
  if (wMin === wMax) return fmtPct(wMin, wMin % 1 === 0 ? 0 : 1);
  const f = (v: number) => (v > 0 ? "+" : "") + (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1));
  return `${f(wMin)} à ${f(wMax)}%`;
}

interface Props {
  athleteId: string;
  bmr: number | null;
  nutritionStrategy: NutritionStrategy | null;
  history?: Record<string, NutritionDailyLog>;
  weightLog?: Record<string, number>;
  onLogSaved?: (date: string, log: NutritionDailyLog) => void;
  viewOnly?: boolean;
}

export default function NutritionView({ athleteId, bmr, nutritionStrategy, history, weightLog, onLogSaved, viewOnly = false }: Props) {
  const today = todayISO();
  const [log, setLog] = useState<Partial<NutritionDailyLog>>({});
  const [logLoading, setLogLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDailyLog(athleteId, today)
      .then(existing => { if (existing) setLog(existing); })
      .catch(err => console.error("getDailyLog:", err))
      .finally(() => setLogLoading(false));
  }, [athleteId, today]);

  const upd = (k: keyof NutritionDailyLog, v: number | null) => {
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

  async function handleSave() {
    setSaving(true);
    try {
      const logToSave = log as NutritionDailyLog;
      await upsertDailyLog(athleteId, today, logToSave);
      onLogSaved?.(today, logToSave);
      toast.success("Journée enregistrée !");
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  }

  const card: React.CSSProperties = {
    background: C.s1, borderRadius: 6, padding: "16px",
    border: "1px solid " + C.brd, marginBottom: 12,
  };

  if (!nutritionStrategy) {
    return (
      <div style={{ padding: "16px 16px 40px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 16 }}>Alimentation</div>
        <div style={{ ...card, textAlign: "center", padding: "32px 20px" }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}></div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 6 }}>Pas encore de plan nutritionnel</div>
          <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5 }}>Ton coach n'a pas encore défini de stratégie. Elle apparaîtra ici dès qu'elle sera prête.</div>
        </div>
      </div>
    );
  }

  const strat = nutritionStrategy;
  const meta = STRATEGY_META[strat.strategy] || { label: strat.strategy, color: C.ac, icon: "nutrition", verb: "Objectif" };

  // ── Dépense & évaluation du jour ───────────────────────────────────────────
  const mode = strat.calorie_mode ?? (strat.can_track_calories ? "active" : "nap");
  const showActiveCal = mode === "active" || mode === "hybrid";
  const activeCal = log.active_calories ?? 0;
  const dynamicDepense = (mode !== "nap" && activeCal > 0 && bmr) ? bmr + activeCal : null;

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
    { key: "lipides_consumed"  as const,  label: "Lipides",   targetG: strat.macros_lipides,   targetPct: strat.macros_lipides_pct,   color: C.o },
    { key: "proteines_consumed" as const, label: "Protéines", targetG: strat.macros_proteines, targetPct: strat.macros_proteines_pct, color: C.g },
  ];
  const hasMacroTargets = macroTargets.some(m => m.targetG || m.targetPct);
  const hasPcts = macroTargets.every(m => m.targetPct != null && m.targetPct > 0);

  // ── Jauge (espace %) : zone = fenêtre ±2 pts, échelle fenêtre ±10 pts ──────
  const gauge = (() => {
    if (!displayEval) return null;
    const lo = wMin - 10, hi = wMax + 10;
    const span = hi - lo;
    const pct = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));
    return {
      zoneStart: pct(wMin - NUTRITION_TOLERANCE_PCT),
      zoneEnd: pct(wMax + NUTRITION_TOLERANCE_PCT),
      zero: wMin <= 0 && 0 <= wMax ? null : pct(0),
      cursor: evalDay ? pct(evalDay.actualPct) : null,
    };
  })();

  const statusColor = evalDay?.status === "ok" ? C.g : evalDay?.status === "close" ? C.o : evalDay ? C.r : C.tx3;

  // ── Streak & historique ────────────────────────────────────────────────────
  const statusFor = (dateISO: string): NutritionDayStatus | null => {
    const l = history?.[dateISO] as NutritionDailyLog | undefined;
    const consumed = l?.total_calories_consumed || 0;
    if (!consumed) return null;
    const act = l?.active_calories || 0;
    const dyn = (mode !== "nap" && act > 0 && bmr) ? bmr + act : null;
    return evaluateNutritionDay(strat, consumed, dyn)?.status ?? null;
  };

  const streakData = (() => {
    if (!history) return null;
    // Streak : jours consécutifs "ok" en remontant depuis aujourd'hui
    // (si aujourd'hui pas encore rempli, on part d'hier sans casser la série)
    let streak = 0;
    let i = statusFor(today) === null ? 1 : 0;
    let startISO = today;
    for (; i < 365; i++) {
      const iso = isoDaysAgo(i);
      const st = statusFor(iso);
      if (st === "ok") { streak++; startISO = iso; }
      else break;
    }
    const days = Array.from({ length: 14 }, (_, k) => {
      const iso = isoDaysAgo(13 - k);
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
    const last30 = entries.filter(([d]) => d >= isoDaysAgo(30));
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

  return (
    <div style={{ padding: "16px 16px 40px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px", color: C.tx }}>Alimentation</div>
        <div style={{ fontSize: 11, color: C.tx3 }}>
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </div>
      </div>

      {/* ── Objectif ── */}
      <div style={card}>
        {/* Stratégie en grand */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid " + C.brd }}>
          <div style={{ width: 46, height: 46, borderRadius: 6, background: meta.color + "1C", border: "1px solid " + meta.color + "40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            <EmojiIcon value={meta.icon} size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: meta.color, letterSpacing: "-0.3px", lineHeight: 1.1 }}>{meta.label}</div>
            {hasWindow && (
              <div style={{ fontSize: 12, color: C.tx2, marginTop: 3 }}>
                {meta.verb} : <span style={{ fontWeight: 800, color: C.tx }}>{fmtWindow(wMin, wMax)}</span>
                <span style={{ color: C.tx3 }}> vs dépense</span>
              </div>
            )}
          </div>
          {strat.target_weight && (
            <div style={{ textAlign: "center", padding: "6px 12px", borderRadius: 6, background: C.s2, border: "1px solid " + C.brdL }}>
              <div style={{ fontSize: 9, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Poids cible</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ac }}>{strat.target_weight}<span style={{ fontSize: 10, color: C.tx3 }}> kg</span></div>
            </div>
          )}
        </div>

        {/* Zone kcal estimée */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.tx3, marginBottom: 4 }}>
              {dynamicDepense != null ? "Zone du jour (BMR + activité saisie)" : "Zone kcal estimée"}
            </div>
            {targetMin > 0 ? (
              targetMin !== targetMax ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 24, fontWeight: 900, color: C.tx, lineHeight: 1 }}>{fmtKcal(targetMin)}</span>
                  <span style={{ fontSize: 13, color: C.tx3, fontWeight: 600 }}>–</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: C.tx, lineHeight: 1 }}>{fmtKcal(targetMax)}</span>
                  <span style={{ fontSize: 11, color: C.tx3 }}>kcal</span>
                </div>
              ) : (
                <div style={{ fontSize: 26, fontWeight: 900, color: C.tx, lineHeight: 1 }}>
                  {fmtKcal(targetMin)}<span style={{ fontSize: 12, color: C.tx3, fontWeight: 400 }}> kcal</span>
                </div>
              )
            ) : (
              <div style={{ fontSize: 24, fontWeight: 900, color: C.tx3 }}>—</div>
            )}
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>
              {dynamicDepense != null
                ? `Dépense : BMR ${fmtKcal(bmr!)} + ${fmtKcal(activeCal)} actives = ${fmtKcal(dynamicDepense)} kcal`
                : showActiveCal ? "S'ajuste quand tu saisis tes calories actives" : displayEval ? `Base dépense ${fmtKcal(displayEval.reference)} kcal` : ""}
            </div>
          </div>
        </div>

        {/* Répartition macros cible — une ligne */}
        {hasMacroTargets && (
          <div style={{ marginTop: 14 }}>
            {hasPcts && (
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 8, background: C.s2 }}>
                {macroTargets.map(m => (
                  <div key={m.key} style={{ width: (m.targetPct || 0) + "%", background: m.color }} />
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {macroTargets.map(m => (
                <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: C.tx2 }}>
                    <span style={{ fontWeight: 800, color: C.tx }}>{m.targetG ?? "—"}</span> g
                    {m.targetPct != null && <span style={{ color: C.tx3 }}> · {m.targetPct}%</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Streak + poids ── */}
      {(streakData || weightData) && (
        <div style={{ ...card, display: "flex", gap: 14 }}>
          {/* Streak */}
          {streakData && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Série en cours</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: streakData.streak > 0 ? C.o : C.tx3, lineHeight: 1 }}>
                  {streakData.streak > 0 ? "" + streakData.streak : "0"}
                </span>
                <span style={{ fontSize: 11, color: C.tx3 }}>jour{streakData.streak > 1 ? "s" : ""} dans l'objectif</span>
              </div>
              {/* 14 derniers jours */}
              <div style={{ display: "flex", gap: 3 }}>
                {streakData.days.map(d => (
                  <div key={d.iso} title={d.iso} style={{
                    flex: 1, height: 16, borderRadius: 4,
                    background: d.status === "ok" ? C.g : d.status === "close" ? C.o : d.status === "off" ? C.r + "70" : C.s2,
                    border: d.iso === today ? "1px solid " + C.tx2 : "1px solid transparent",
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.tx3, marginTop: 3 }}>
                <span>J−13</span><span>aujourd'hui</span>
              </div>
            </div>
          )}

          {/* Poids */}
          {weightData && (
            <div style={{ flex: 1, minWidth: 0, paddingLeft: streakData ? 14 : 0, borderLeft: streakData ? "1px solid " + C.brd : "none" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>Poids</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 28, fontWeight: 900, color: C.tx, lineHeight: 1 }}>{weightData.current}</span>
                <span style={{ fontSize: 11, color: C.tx3 }}>kg</span>
                {weightData.delta !== 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: deltaGood ? C.g : C.o, marginLeft: "auto" }}>
                    {weightData.delta > 0 ? "▲ +" : "▼ "}{weightData.delta} kg
                  </span>
                )}
              </div>
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
                    <polyline points={pts} fill="none" stroke={C.ac} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    <circle cx={100} cy={22 - ((vs[vs.length - 1] - min) / span) * 18} r="2.2" fill={C.ac} vectorEffect="non-scaling-stroke" />
                  </svg>
                );
              })() : (
                <div style={{ fontSize: 10, color: C.tx3 }}>Pas assez de pesées récentes</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Mon suivi ── */}
      <div style={card}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
          Mon suivi du jour
        </div>

        {logLoading ? (
          <div style={{ color: C.tx3, fontSize: 13, textAlign: "center", padding: "14px 0" }}>Chargement...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Calories actives */}
            {showActiveCal && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, background: C.s2, border: "1px solid " + C.brdL }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.tx2 }}>⌚ Calories actives brûlées</div>
                  <div style={{ fontSize: 9, color: C.tx3, marginTop: 1 }}>montre / app{mode === "hybrid" ? " — optionnel" : ""}</div>
                </div>
                <input
                  style={{ width: 100, padding: "8px 10px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s1, color: C.tx, fontSize: 15, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" as const, boxSizing: "border-box" as const }}
                  type="number" min={0} max={5000} placeholder="0"
                  value={log.active_calories ?? ""}
                  onChange={viewOnly ? undefined : (e => upd("active_calories", e.target.value ? parseInt(e.target.value) : null))}
                  readOnly={viewOnly}
                />
              </div>
            )}

            {/* Macros — une seule ligne */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {macroTargets.map(m => {
                const consumed = log[m.key] ?? null;
                const target = m.targetG;
                const ratio = consumed != null && target ? consumed / target : null;
                const pct = ratio != null ? Math.min(Math.round(ratio * 100), 100) : 0;
                const over = ratio != null && ratio > 1.05;

                return (
                  <div key={m.key} style={{ background: C.s2, borderRadius: 6, padding: "10px 8px 8px", border: "1px solid " + m.color + "22", display: "flex", flexDirection: "column", gap: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: m.color, textTransform: "uppercase", letterSpacing: "0.4px" }}>{m.label}</span>
                    </div>
                    <input
                      style={{ width: "100%", padding: "9px 4px", borderRadius: 4, border: "1px solid " + m.color + (consumed != null ? "55" : "30"), background: C.s1, color: over ? C.o : C.tx, fontSize: 17, fontWeight: 800, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const, textAlign: "center" as const }}
                      type="number" min={0} max={1000} placeholder="—"
                      value={log[m.key] ?? ""}
                      onChange={viewOnly ? undefined : (e => upd(m.key, e.target.value ? parseInt(e.target.value) : null))}
                      readOnly={viewOnly}
                    />
                    <div style={{ textAlign: "center", fontSize: 9, color: C.tx3, minHeight: 12 }}>
                      {target != null ? `/ ${target} g` : "g"}
                    </div>
                    {target != null && (
                      <div style={{ height: 3, background: C.s1, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: pct + "%", background: over ? C.o : m.color, borderRadius: 2, transition: "width 0.3s" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total calculé + jauge % */}
            {calConsumed > 0 && evalDay && (
              <div style={{ padding: "12px 14px", borderRadius: 6, background: C.s2, border: "1px solid " + statusColor + "35" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: gauge ? 10 : 0 }}>
                  <div>
                    <div style={{ fontSize: 10, color: C.tx3, marginBottom: 2 }}>Total du jour</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: statusColor, lineHeight: 1 }}>
                      {fmtKcal(calConsumed)}
                      <span style={{ fontSize: 11, color: C.tx3, fontWeight: 400 }}> kcal</span>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: C.tx3, marginBottom: 2 }}>{evalDay.actualPct <= 0 ? "Déficit réel" : "Surplus réel"}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: statusColor }}>{fmtPct(evalDay.actualPct)}</div>
                  </div>
                </div>

                {/* Jauge : zone verte = fenêtre % ±2 pts, curseur = % réel */}
                {gauge && (
                  <div style={{ position: "relative", height: 22 }}>
                    <div style={{ position: "absolute", top: 8, left: 0, right: 0, height: 6, borderRadius: 3, background: C.s1 }} />
                    <div style={{ position: "absolute", top: 8, left: gauge.zoneStart + "%", width: (gauge.zoneEnd - gauge.zoneStart) + "%", height: 6, borderRadius: 3, background: "linear-gradient(90deg, " + C.g + "70, " + C.g + ")" }} />
                    {gauge.zero != null && (
                      <div style={{ position: "absolute", top: 6, left: `calc(${gauge.zero}% - 1px)`, width: 1, height: 10, background: C.tx3 }} title="dépense (0%)" />
                    )}
                    {gauge.cursor != null && (
                      <div style={{ position: "absolute", top: 3, left: `calc(${gauge.cursor}% - 2px)`, width: 4, height: 16, borderRadius: 2, background: statusColor + statusColor + "90", transition: "left 0.3s" }} />
                    )}
                  </div>
                )}
              </div>
            )}

            {!viewOnly && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ width: "100%", padding: "14px 0", borderRadius: 6, border: "none", background: saving ? C.s2 : C.ac, color: saving ? C.tx3 : "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}
              >
                {saving ? "Enregistrement..." : "Enregistrer ma journée"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Feedback objectif ── */}
      {evalDay && (() => {
        const objectif = hasWindow ? `objectif ${fmtWindow(wMin, wMax)} (±${NUTRITION_TOLERANCE_PCT} pts)` : `cible ${fmtKcal(evalDay.target)} kcal ±${NUTRITION_TOLERANCE_PCT}%`;
        const reel = `${evalDay.actualPct <= 0 ? "Déficit" : "Surplus"} réel ${fmtPct(evalDay.actualPct)}`;

        let bg: string, border: string, color: string, icon: string, title: string;
        if (evalDay.status === "ok") {
          bg = C.gS; border = C.g + "40"; color = C.g;
          icon = "ok"; title = `Objectif ${meta.label} atteint !`;
        } else if (evalDay.status === "close") {
          bg = C.oS; border = C.o + "40"; color = C.o;
          icon = "~"; title = `Proche de l'objectif (${fmtPct(evalDay.diffPct)} d'écart)`;
        } else {
          bg = C.rS; border = C.r + "40"; color = C.r;
          icon = "alerte"; title = `Hors objectif (${fmtPct(evalDay.diffPct)} d'écart)`;
        }

        return (
          <div style={{ ...card, background: bg, border: "1px solid " + border, marginBottom: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 4 }}>{icon} {title}</div>
            <div style={{ fontSize: 11, color: C.tx2 }}>{reel} · {objectif} · {fmtKcal(calConsumed)} kcal vs dépense {fmtKcal(evalDay.reference)} kcal</div>
          </div>
        );
      })()}
    </div>
  );
}
