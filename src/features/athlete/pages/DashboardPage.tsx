import { useNavigate } from "react-router-dom";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import WeekCalendar from "@/components/coach/WeekCalendar";
import { HabitDashboard } from "@/components/athlete/HabitTracker";
import { WELL_ITEMS } from "@/lib/wellness";
import { evaluateNutritionDay } from "@/lib/nutrition";
import { ALL_BZ } from "@/lib/muscles";
import { useWeeklyDistances } from "@/features/shared/hooks/useWeeklyDistances";
import { useActiveInjuries } from "@/features/shared/hooks/useMedicalEntries";
import { injurySummary } from "@/lib/injuryDetails";

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    viewOnly, sessions, exos, blockConfig, currentWeek, tw, isDeload,
    completedSessions, weekSchedule, setWeekSchedule, wellnessHistory,
    weightLog, sessionLogs, nutritionLog, energySessions, energyWeekPlan,
    energyDayPlan, testSessions, visibilitySettings, wellness, wScore, wReco,
    setShowWellness, nutritionStrategy, athleteProfile,
    habits, setHabits, habitLogs, toggleHabitLog, habitEnabled, athleteId,
    goals, freeSessions,
  } = useAthleteContext();

  const weekDistances = useWeeklyDistances(athleteId, freeSessions);
  // Bandeau blessures : lu dans `medical_entries`, comme le badge du header.
  const { injuries: activeInjuries } = useActiveInjuries(athleteId ?? undefined);

  const todayDow = (new Date().getDay() + 6) % 7;
  const doneNow = completedSessions[currentWeek] || [];
  const todaySessions = sessions.filter(s => s.day_of_week === todayDow && (exos[s.id] || []).length > 0);
  const todayNotDone = todaySessions.filter(s => !doneNow.includes(s.id));
  const todayAllDone = todaySessions.length > 0 && todayNotDone.length === 0;

  const nextSess = sessions.find(s => !doneNow.includes(s.id) && (exos[s.id] || []).length > 0);

  return (
    <div style={{ padding: "16px 16px 40px" }}>
      {/* Greeting */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>Bonjour</div>
        {sessions.length > 0
          ? <div style={{ fontSize: 12, color: C.tx2, marginTop: 2 }}>{blockConfig?.blockName || "Programme"} · S{currentWeek}/{tw}{isDeload(currentWeek) ? " (Deload)" : ""}</div>
          : <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>Aucun bloc actif</div>
        }
      </div>

      {/* Injuries alert */}
      {activeInjuries.length > 0 && (
        <button onClick={() => navigate("../stats", { relative: "path" })} style={{ width: "100%", background: C.rS, borderRadius: 6, padding: "10px 14px", border: "1.5px solid " + C.r + "50", marginBottom: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.r, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.r }}>{activeInjuries.length} blessure(s) en cours</div>
            <div style={{ fontSize: 10, color: C.r + "90" }}>{activeInjuries.map(injurySummary).join(" | ")}</div>
          </div>
          <span style={{ fontSize: 12, color: C.r }}>&gt;</span>
        </button>
      )}

      {/* Wellness card */}
      <button
        onClick={() => { if (!viewOnly) setShowWellness(true); }}
        style={{ width: "100%", background: C.s1, borderRadius: 6, padding: "14px 16px", border: "1.5px solid " + wReco.c + "35", marginBottom: 12, cursor: viewOnly ? "default" : "pointer", fontFamily: "inherit", textAlign: "left", display: "block" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Wellness du jour</div>
          {!viewOnly && <div style={{ fontSize: 10, color: C.ac, padding: "3px 10px", borderRadius: 6, border: "1px solid " + C.ac + "40", fontWeight: 600 }}>{wellness ? "Modifier" : "Remplir"} &gt;</div>}
        </div>
        {wellness ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
              <svg viewBox="0 0 64 64" style={{ width: 64, height: 64, transform: "rotate(-90deg)" }}>
                <circle cx="32" cy="32" r="26" fill="none" stroke={C.s2} strokeWidth="5" />
                <circle cx="32" cy="32" r="26" fill="none" stroke={wReco.c} strokeWidth="5" strokeDasharray={String(2 * Math.PI * 26)} strokeDashoffset={String(2 * Math.PI * 26 * (1 - wScore / 100))} strokeLinecap="round" />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: wReco.c }}>{wScore}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: wReco.c, marginBottom: 4 }}>{wReco.label}</div>
              <div style={{ fontSize: 11, color: C.tx2 }}>{wReco.desc}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {WELL_ITEMS.map((it: { k: string; inv?: boolean }) => {
                  const v = (wellness as Record<string, number>)[it.k];
                  const vc = it.inv ? (v >= 4 ? C.r : v <= 2 ? C.g : C.o) : (v >= 4 ? C.g : v <= 2 ? C.r : C.o);
                  return (
                    <div key={it.k} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: vc }}>{v}</div>
                      <div style={{ fontSize: 8, color: C.tx3 }}>{it.k.slice(0, 4)}</div>
                    </div>
                  );
                })}
                {(wellness as { sleepDur?: number }).sleepDur && <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 700, color: C.b }}>{(wellness as { sleepDur: number }).sleepDur}h</div><div style={{ fontSize: 8, color: C.tx3 }}>som.</div></div>}
                {(wellness as { poids?: number }).poids && <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 700, color: C.ac }}>{(wellness as { poids: number }).poids}</div><div style={{ fontSize: 8, color: C.tx3 }}>kg</div></div>}
              </div>
              {(wellness as { domsZones?: string[] }).domsZones?.length > 0 && (
                <div style={{ display: "flex", gap: 3, marginTop: 6, flexWrap: "wrap" }}>
                  {(wellness as { domsZones: string[] }).domsZones.map(id => {
                    const z = ALL_BZ.find((z: { id: string; label: string }) => z.id === id);
                    return z ? <span key={id} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: C.o + "20", color: C.o }}>{z.label}</span> : null;
                  })}
                </div>
              )}
            </div>
          </div>
        ) : <div style={{ fontSize: 12, color: C.tx3, textAlign: "center", padding: "10px 0" }}>Appuyez pour remplir le bilan</div>}
      </button>

      {/* Week calendar */}
      <WeekCalendar
        sessions={sessions} completedSessions={completedSessions} currentWeek={currentWeek}
        weekSchedule={weekSchedule} setWeekSchedule={setWeekSchedule} C={C}
        wellnessHistory={wellnessHistory} weightLog={weightLog} sessionLogs={sessionLogs}
        nutritionLog={nutritionLog} exos={exos} energySessions={energySessions}
        energyWeekPlan={energyWeekPlan} energyDayPlan={energyDayPlan}
        testSessions={testSessions} visibilitySettings={visibilitySettings}
      />

      {/* Nutrition summary */}
      {nutritionStrategy && (() => {
        const todayISO = new Date().toISOString().slice(0, 10);
        const todayNL = (nutritionLog[todayISO] as Record<string, number> | undefined) || null;
        const strat = nutritionStrategy;
        const consumed = todayNL?.total_calories_consumed || null;
        const bmrV = (athleteProfile as { base_metabolism?: number } | null)?.base_metabolism || 0;
        const stratTyped = strat as import("@/lib/nutrition").NutritionStrategy;
        const calorieMode = stratTyped.calorie_mode ?? (stratTyped.can_track_calories ? "active" : "nap");
        const activeCal = todayNL?.active_calories || 0;
        const dynamicTarget = calorieMode !== "nap" && activeCal > 0 ? bmrV + activeCal : null;
        const dayEval = consumed ? evaluateNutritionDay(stratTyped, consumed, dynamicTarget) : null;
        const targetCal = dayEval
          ? (dayEval.isRange ? null : dayEval.target)
          : (dynamicTarget ?? stratTyped.total_calories_coach ?? null);
        const targetLabel = dayEval?.isRange
          ? `${dayEval.targetMin.toLocaleString("fr-FR")}–${dayEval.targetMax.toLocaleString("fr-FR")}`
          : targetCal ? String(targetCal) : null;
        const stratC = strat.strategy === "seche" ? C.r : strat.strategy === "prise_de_masse" ? C.g : C.b;
        const stratL = strat.strategy === "seche" ? "Sèche" : strat.strategy === "prise_de_masse" ? "Prise" : "Maintenance";
        const feedbackC = !dayEval ? null : dayEval.status === "ok" ? C.g : dayEval.status === "close" ? C.o : C.r;
        const feedbackMsg = !dayEval ? null
          : dayEval.status === "ok" ? (dayEval.isRange ? "✓ Dans la fourchette aujourd'hui" : "✓ Dans l'objectif aujourd'hui")
          : (dayEval.status === "close" ? "~ Proche de l'objectif " : "Hors objectif ")
            + `(${dayEval.diffPct > 0 ? "+" : ""}${dayEval.diffPct.toFixed(1)}%)`;
        return (
          <div style={{ background: C.s1, borderRadius: 6, padding: "11px 16px", border: "1px solid " + (feedbackC ? feedbackC + "40" : C.brd), marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: consumed ? 8 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Alimentation</div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: stratC + "18", color: stratC }}>{stratL}</span>
              </div>
              <button onClick={() => navigate("alim")} style={{ fontSize: 10, color: C.ac, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Détail →</button>
            </div>
            {!consumed ? (
              <div style={{ fontSize: 11, color: C.tx3 }}>Aucune saisie aujourd'hui</div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: feedbackMsg ? 8 : 0 }}>
                  <div><span style={{ fontSize: 20, fontWeight: 800, color: feedbackC || stratC }}>{consumed}</span>{targetLabel && <span style={{ fontSize: 10, color: C.tx3 }}> / {targetLabel} kcal</span>}</div>
                  <div style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
                    {[{ l: "G", v: todayNL?.glucides_consumed, c: C.b }, { l: "L", v: todayNL?.lipides_consumed, c: C.o }, { l: "P", v: todayNL?.proteines_consumed, c: C.g }].map(macro => (
                      <div key={macro.l} style={{ textAlign: "center" }}><div style={{ fontSize: 12, fontWeight: 700, color: macro.c }}>{macro.v ?? "—"}</div><div style={{ fontSize: 9, color: C.tx3 }}>{macro.l} (g)</div></div>
                    ))}
                  </div>
                </div>
                {feedbackMsg && <div style={{ fontSize: 11, fontWeight: 600, color: feedbackC!, padding: "5px 10px", borderRadius: 7, background: feedbackC + "12" }}>{feedbackMsg}</div>}
              </>
            )}
          </div>
        );
      })()}

      {/* Weekly distances */}
      {weekDistances.bySport.length > 0 && (
        <div style={{ background: C.s1, borderRadius: 6, padding: "11px 16px", border: "1px solid " + C.brd, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
              Kilomètres cette semaine
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.ac }}>{weekDistances.total} km</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {weekDistances.bySport.map((d) => (
              <div key={d.sport} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", background: d.color, flexShrink: 0,
                }} />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.tx2 }}>{d.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: d.color }}>{d.km} km</div>
              </div>
            ))}
          </div>
          {weekDistances.bySport.length > 1 && (
            <div style={{
              marginTop: 8, height: 4, borderRadius: 2, overflow: "hidden",
              display: "flex", background: C.s2,
            }}>
              {weekDistances.bySport.map((d) => (
                <div
                  key={d.sport}
                  style={{
                    height: "100%",
                    width: `${(d.km / weekDistances.total) * 100}%`,
                    background: d.color,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Today's session / next session */}
      <div style={{ marginBottom: 12 }}>
        {todayAllDone ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ padding: "10px 14px", borderRadius: 4, background: C.gS, border: "1px solid " + C.g + "40", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14 }}>✓</span>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.g }}>Séance du jour effectuée</div>
            </div>
            {nextSess && (
              <button onClick={() => navigate("log", { state: { initialSess: nextSess } })} style={{ width: "100%", padding: "10px 14px", borderRadius: 4, border: "none", background: C.acS, color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
                <div><div style={{ fontSize: 11, fontWeight: 700 }}>Prochaine séance</div><div style={{ fontSize: 10, color: C.tx2 }}>{nextSess.short} - {nextSess.name}</div></div>
                <span style={{ marginLeft: "auto", fontSize: 14 }}>&gt;</span>
              </button>
            )}
          </div>
        ) : todayNotDone.length > 0 ? (
          <button onClick={() => navigate("log", { state: { initialSess: todayNotDone[0] } })} style={{ width: "100%", padding: "10px 14px", borderRadius: 4, border: "none", background: C.coachS, color: C.coach, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.coach }}>Séance du jour</div>
              <div style={{ fontSize: 10, color: C.tx2 }}>{todayNotDone[0].short} - {todayNotDone[0].name}</div>
              {todayNotDone.length > 1 && <div style={{ fontSize: 9, color: C.tx3, marginTop: 2 }}>+{todayNotDone.length - 1} autre(s) aujourd'hui</div>}
            </div>
            <span style={{ marginLeft: "auto", fontSize: 14 }}>&gt;</span>
          </button>
        ) : nextSess ? (
          <button onClick={() => navigate("log", { state: { initialSess: nextSess } })} style={{ width: "100%", padding: "10px 14px", borderRadius: 4, border: "none", background: C.acS, color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 10 }}>
            <div><div style={{ fontSize: 11, fontWeight: 700 }}>Prochaine séance</div><div style={{ fontSize: 10, color: C.tx2 }}>{nextSess.short} - {nextSess.name}</div></div>
            <span style={{ marginLeft: "auto", fontSize: 14 }}>&gt;</span>
          </button>
        ) : (
          <div style={{ padding: "10px", borderRadius: 4, background: C.gS, color: C.g, fontSize: 11, fontWeight: 600, textAlign: "center" }}>Semaine {currentWeek} complète</div>
        )}
      </div>

      {/* Habit tracker */}
      {(habitEnabled || habits.length > 0) && (
        <HabitDashboard habits={habits} setHabits={setHabits} habitLogs={habitLogs} onToggle={toggleHabitLog} viewOnly={viewOnly} athleteId={athleteId} />
      )}
    </div>
  );
}
