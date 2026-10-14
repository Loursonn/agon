import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Calendar, ClipboardList, Target } from "lucide-react";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import CoachFourWeekCalendar from "@/components/coach/CoachFourWeekCalendar";
import { CoachExoParams } from "@/components/coach/CoachProgramEditor";
import { CoachEnergyProgram } from "@/components/coach/CoachComponents";
import { PlanningEditor } from "@/components/coach/PlanningEditor";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCreateCycleFromBloc } from "@/features/shared/hooks/useCreateCycleFromBloc";
import { SessionWeekDrawer } from "@/features/coach/components/SessionWeekDrawer";
import { localISO } from "@/lib/date";

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function ProgPage() {
  const { user } = useAuth();
  const [progSubTab, setProgSubTab] = useState("muscu");
  const [showExoParams, setShowExoParams] = useState(false);
  const [openDrawer, setOpenDrawer] = useState<{ sessId: string; sessName: string } | null>(null);

  const {
    athleteId, exos, setExos, sessions, setSessions, blockConfig,
    completedSessions, currentWeek, tw, dw, allMethods, customMethods,
    setCustomMethods, exMeta, setExMeta, sets, weekSchedule, setWeekSchedule,
    athleteNotes, energySessions, setEnergySessions, energyWeekPlan, setEnergyWeekPlan,
    energyDayPlan, setEnergyDayPlan, energyEditorKey, setEnergyEditorKey,
    energySessionsLoaded, setEnergySessionsLoaded, testSessions, visibilitySettings,
    setVisibilitySettings, wellnessHistory, sessionLogs,
    updateSessionDay, updateSessionWeekDay,
  } = useAthleteContext();

  const ctx = useAthleteContext() as unknown as Record<string, unknown>;
  const testSessionsData = (ctx.testSessions as typeof testSessions) ?? [];

  const { data: activeCycle } = useQuery({
    queryKey: ["active-cycle", athleteId],
    enabled: !!athleteId,
    staleTime: 30_000,
    queryFn: async () => {
      const today = localISO();
      const { data } = await supabase
        .from("cycles")
        .select("id, name, start_date, end_date")
        .eq("athlete_id", athleteId)
        .is("mesocycle_id", null)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  const createCycle = useCreateCycleFromBloc();

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  const sortedSessions = [...sessions].sort((a, b) => (a.day_of_week ?? 7) - (b.day_of_week ?? 7));

  return (
    <>
      {/* ── Cycle / Bloc banner ── */}
      <div style={{
        background: C.s1, borderRadius: 6, padding: "12px 16px",
        border: "1px solid " + C.b + "30", marginBottom: 14,
      }}>
        {activeCycle ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.b,
                textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4,
              }}>Cycle actif</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>{activeCycle.name}</div>
              <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                {formatDate(activeCycle.start_date)} → {formatDate(activeCycle.end_date)} · S{currentWeek}/{tw}
              </div>
            </div>
            {dw > 0 && (
              <span style={{
                padding: "4px 8px", borderRadius: 6,
                background: C.bS, color: C.b, fontSize: 10, fontWeight: 700,
              }}>Deload S{dw}</span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.tx3,
                textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4,
              }}>Bloc d'entraînement</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>
                {blockConfig?.blockName || "Bloc sans nom"}
              </div>
              {blockConfig?.startDate && (
                <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
                  Début {formatDate(blockConfig.startDate)} · {tw} semaines
                </div>
              )}
            </div>
            <button
              onClick={() => {
                if (user && blockConfig && sessions.length > 0) {
                  createCycle.mutate({ blockConfig, sessions, athleteId, coachId: user.id });
                }
              }}
              disabled={createCycle.isPending || !blockConfig?.startDate || sessions.length === 0}
              style={{
                padding: "8px 14px", borderRadius: 4,
                border: "1px solid " + C.coach + "40",
                background: C.coachS, color: C.coach,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                flexShrink: 0,
                opacity: (createCycle.isPending || !blockConfig?.startDate || sessions.length === 0) ? 0.5 : 1,
              }}
            >
              {createCycle.isPending ? "Création..." : "→ Cycle"}
            </button>
          </div>
        )}
      </div>

      {/* ── Planning calendar ── */}
      <CoachFourWeekCalendar
        sessions={sessions} completedSessions={completedSessions} currentWeek={currentWeek}
        C={C} wellnessHistory={wellnessHistory} sessionLogs={sessionLogs}
        energySessions={energySessions} energyWeekPlan={energyWeekPlan} energyDayPlan={energyDayPlan}
        setEnergyWeekPlan={setEnergyWeekPlan} setEnergyDayPlan={setEnergyDayPlan}
        testSessions={testSessionsData} visibilitySettings={visibilitySettings}
        onUpdateSessionDay={updateSessionDay} onUpdateSessionWeekDay={updateSessionWeekDay}
        onUpdateVisibility={setVisibilitySettings} athleteId={athleteId} blockConfig={blockConfig}
        weekSchedule={weekSchedule} setWeekSchedule={setWeekSchedule} exos={exos} allMethods={allMethods}
      />

      {/* ── Sub-tabs ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid " + C.brd, marginBottom: 16 }}>
        {[
          { k: "planification", l: "Planification" },
          { k: "muscu", l: "Musculation" },
          { k: "energie", l: "Énergétique" },
          { k: "specifique", l: "Spécifique" },
        ].map(t => (
          <button
            key={t.k}
            onClick={() => { setProgSubTab(t.k); setEnergyEditorKey(null); }}
            style={{
              padding: "9px 18px", border: "none",
              borderBottom: "2px solid " + (progSubTab === t.k ? C.coach : "transparent"),
              background: "transparent",
              color: progSubTab === t.k ? C.coach : C.tx3,
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              textTransform: "uppercase" as const, letterSpacing: "0.3px", flexShrink: 0,
            }}
          >{t.l}</button>
        ))}
      </div>

      {progSubTab === "planification" && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ marginBottom: 12 }}><Calendar size={32} style={{ color: C.tx3 }} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Planification périodique</div>
          <div style={{ fontSize: 12, color: C.tx3, marginBottom: 16 }}>La frise de planification est disponible dans l'onglet Planning.</div>
          <a
            href={`/coach/athletes/${athleteId}/planning?view=timeline`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "9px 18px", borderRadius: 4,
              background: C.acV, color: "#0E0C0A",
              fontSize: 12, fontWeight: 700, textDecoration: "none",
            }}
          >
            Aller à la frise →
          </a>
        </div>
      )}

      {progSubTab === "muscu" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              Musculation
              {blockConfig?.blockName && (
                <span style={{ fontSize: 11, color: C.b, fontWeight: 600, marginLeft: 8 }}>
                  {blockConfig.blockName} · {tw} sem.
                </span>
              )}
            </div>
          </div>

          {sortedSessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ marginBottom: 12 }}><ClipboardList size={40} style={{ color: C.tx3 }} /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Aucune séance</div>
              <div style={{ fontSize: 12, color: C.tx3 }}>Aucune séance configurée dans ce bloc.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {sortedSessions.map(sess => {
                const exoCount = ((exos as Record<string, unknown[]>)[sess.id] || []).length;
                return (
                  <button
                    key={sess.id}
                    onClick={() => setOpenDrawer({ sessId: sess.id, sessName: sess.name || sess.short || "Séance" })}
                    style={{
                      padding: "12px 14px", borderRadius: 6,
                      border: "1px solid " + C.brdL, background: C.s1,
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const,
                      display: "flex", flexDirection: "column" as const, gap: 6,
                      position: "relative" as const,
                    }}
                  >
                    {sess.day_of_week != null ? (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: C.coach,
                        background: C.coachS, padding: "2px 7px", borderRadius: 5,
                        alignSelf: "flex-start",
                      }}>{DOW[sess.day_of_week]}</span>
                    ) : (
                      <span
                        title="Double-clic pour assigner un jour"
                        style={{
                          fontSize: 10, fontWeight: 700, color: C.o,
                          background: C.oS, padding: "2px 7px", borderRadius: 5,
                          alignSelf: "flex-start",
                        }}
                      >Jour non défini</span>
                    )}
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, paddingRight: 20 }}>
                      {sess.name || sess.short || "Séance"}
                    </div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>
                      {exoCount} exercice{exoCount !== 1 ? "s" : ""}
                    </div>
                    <ChevronRight
                      size={14}
                      style={{
                        position: "absolute", right: 12,
                        top: "50%", transform: "translateY(-50%)", color: C.tx3,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {sortedSessions.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid " + C.brd }}>
              <button
                onClick={() => setShowExoParams(p => !p)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 4,
                  border: "1px solid " + C.brdL,
                  background: showExoParams ? C.acS : "transparent",
                  color: showExoParams ? C.ac : C.tx2,
                  fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  marginBottom: showExoParams ? 12 : 0,
                }}
              >
                Paramètres exercices{showExoParams ? " ∧" : " ∨"}
              </button>
              {showExoParams && (
                <CoachExoParams
                  exMeta={exMeta} setExMeta={setExMeta}
                  exos={exos} setExos={setExos} blockConfig={blockConfig}
                />
              )}
            </div>
          )}
        </>
      )}

      {progSubTab === "energie" && (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.tx3 }}>Voir onglet Programmation → Énergie</div>
        </div>
      )}

      {progSubTab === "specifique" && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ marginBottom: 12 }}><Target size={40} style={{ color: C.tx3 }} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Séances Spécifiques</div>
          <div style={{ fontSize: 12, color: C.tx3 }}>Planification des séances spécifiques à venir prochainement.</div>
        </div>
      )}

      {openDrawer && (
        <SessionWeekDrawer
          sessId={openDrawer.sessId}
          sessName={openDrawer.sessName}
          currentWeek={currentWeek}
          tw={tw}
          dw={dw}
          blockConfig={blockConfig}
          exos={exos as Record<string, unknown[]>}
          setExos={setExos}
          sessions={sessions}
          setSessions={setSessions}
          sets={sets as Record<string, unknown[]>}
          completedSessions={completedSessions as Record<number, string[]>}
          athleteNotes={athleteNotes as Record<string, string>}
          allMethods={allMethods as Record<string, unknown>}
          customMethods={customMethods as unknown[]}
          setCustomMethods={setCustomMethods}
          exMeta={exMeta as Record<string, unknown>}
          setExMeta={setExMeta}
          weekSchedule={weekSchedule as Record<string, unknown>}
          setWeekSchedule={setWeekSchedule}
          onClose={() => setOpenDrawer(null)}
          athleteId={athleteId ?? undefined}
        />
      )}
    </>
  );
}
