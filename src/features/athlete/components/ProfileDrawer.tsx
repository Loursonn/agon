import { useState, useEffect } from "react";
import type React from "react";
import { HeartPulse, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useActiveInjuries } from "@/features/shared/hooks/useMedicalEntries";
import { DeclareInjurySheet } from "@/features/shared/components/medical/DeclareInjurySheet";
import { injurySummary } from "@/lib/injuryDetails";
import { useNavigate } from "react-router-dom";
import PerformanceProfile from "@/components/athlete/PerformanceProfile";
import { WeightChart, SleepTunnel } from "@/components/athlete/StatsCharts";
import { getWellnessChartData } from "@/lib/calculations";
import { getReco } from "@/lib/wellness";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { todayKey } from "@/lib/date";
import { useAthleteTrends, useAthleteInsights } from "@/features/shared/hooks/useAthleteTrends";
import { TrendCard } from "@/features/athlete/components/profile/TrendCard";
import { AppFeedbackSection } from "@/features/athlete/components/profile/AppFeedbackSection";
import { PrivacySection } from "@/features/shared/components/PrivacySection";
import { CoachRetourCard } from "@/features/athlete/components/CoachRetourCard";
import { useAthleteRetours } from "@/features/shared/hooks/useWeeklyCoachRetour";
import type { TrendSummary } from "@/lib/athleteTrends";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Profile } from "@/hooks/useAuth";
import { useCoachBooking } from "@/features/shared/hooks/useCoachBooking";
import BookingPanel from "@/features/athlete/components/BookingPanel";

interface Props {
  onClose: () => void;
}

const PERIODS = [{ d: 7, l: "7 j" }, { d: 30, l: "30 j" }, { d: 90, l: "3 mois" }] as const;

const fmt = (v: number | null, digits = 0) => v === null ? "—" : v.toFixed(digits).replace(".", ",");
const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.5px" };

export default function ProfileDrawer({ onClose }: Props) {
  const { athleteId, athleteProfile, viewOnly, wellness, wScore, wReco, weightLog, weightMilestones, bodyWeight, wellnessHistory, nutritionStrategy, coachFeedbacks, goals, streak } = useAthleteContext();
  const navigate = useNavigate();
  // Les blessures viennent de `medical_entries` : la même source que les
  // antécédents du profil, donc la même vérité que ce que voit le coach.
  const { injuries: activeInjuries } = useActiveInjuries(athleteId ?? undefined);
  const [declareInjury, setDeclareInjury] = useState(false);
  const [drawerSportOpen, setDrawerSportOpen] = useState(false);
  const [drawerInjOpen, setDrawerInjOpen] = useState(true);
  const [drawerZoom, setDrawerZoom] = useState<string | null>(null);
  const [wellnessPeriod, setWellnessPeriod] = useState("month");
  const [days, setDays] = useState<number>(30);

  const { summary: t, ready } = useAthleteTrends(days);
  const { insights, source, loading: insightsLoading } = useAthleteInsights(t, ready);

  const ap = athleteProfile as Profile | null;
  const name = ap ? ([ap.first_name, ap.last_name].filter(Boolean).join(" ") || ap.full_name || "Athlète") : "Athlète";

  // Retours hebdo déjà vus (= avec réaction) — les non lus sont sur l'accueil
  const { data: coachRetours = [] } = useAthleteRetours(athleteId ?? undefined);
  const seenRetours = coachRetours.filter((r) => r.athlete_reaction);
  const [showAllRetours, setShowAllRetours] = useState(false);

  // Retour coach : uniquement s'il date des 14 derniers jours
  const recentFb = Object.entries(coachFeedbacks)
    .map(([w, fb]) => ({ week: Number(w), ...fb }))
    .filter(fb => fb.note && fb.date && Date.now() - new Date(fb.date).getTime() <= 14 * 86_400_000)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];

  const weightToTarget = t.weight.value !== null && t.weightTarget ? Math.round((t.weightTarget - t.weight.value) * 10) / 10 : null;
  const weightGoodWhenUp = t.weightTarget && t.weight.prev !== null ? t.weightTarget > t.weight.prev : null;

  // Zoom overlay
  if (drawerZoom) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 103, background: C.bg, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid " + C.brd, position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
        <button onClick={() => setDrawerZoom(null)} style={{ width: 32, height: 32, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 18, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>←</button>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{drawerZoom === "weight" ? "Poids de corps" : drawerZoom === "wellness" ? "Forme & santé" : drawerZoom === "sleep" ? "Sommeil" : "Objectifs"}</div>
      </div>
      <div style={{ padding: "16px" }}>
        {drawerZoom === "weight" && (
          <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Évolution du poids</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.ac }}>{t.weight.value ?? bodyWeight.current ?? "—"}<span style={{ fontSize: 10, fontWeight: 400, color: C.tx3 }}> / {t.weightTarget || "—"} kg</span></div>
            </div>
            {Object.keys(weightLog).length > 0 ? <WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy} /> : <div style={{ textAlign: "center", color: C.tx3, fontSize: 11, padding: "24px 0" }}>Aucune mesure enregistrée</div>}
          </div>
        )}
        {drawerZoom === "wellness" && (
          <WellnessZoomContent wellness={wellness} wScore={wScore} wReco={wReco} wellnessHistory={wellnessHistory} wellnessPeriod={wellnessPeriod} setWellnessPeriod={setWellnessPeriod} />
        )}
        {drawerZoom === "sleep" && <SleepZoomContent summary={t} goals={goals} wellnessHistory={wellnessHistory} />}
        {drawerZoom === "goals" && <GoalsZoomContent />}
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(400px,94vw)", zIndex: 102, background: C.bg, overflowY: "auto", display: "flex", flexDirection: "column", borderLeft: "1px solid " + C.brd }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid " + C.brd, position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Mon profil</div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 18, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>
      <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* ── En-tête : identité + KPIs ── */}
        <div style={{ background: "linear-gradient(135deg, " + C.acS + " 0%, " + C.s1 + " 75%)", borderRadius: 6, border: "1px solid " + C.ac + "30", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.acS, border: "2px solid " + C.ac + "40", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: C.ac }}>
              {name.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>{name}</div>
              {wellness && <div style={{ fontSize: 11, color: wReco.c, fontWeight: 600 }}>Forme du jour : {wReco.label} · {wScore}</div>}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 14 }}>
            {[
              { v: String(t.attendance.done), l: "séances" },
              { v: t.attendance.pct === null ? "—" : t.attendance.pct + "%", l: "assiduité" },
              { v: String(streak ?? 0), l: "série" },
            ].map(k => (
              <div key={k.l} style={{ background: "rgba(0,0,0,0.18)", borderRadius: 4, padding: "8px 0", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.tx }}>{k.v}</div>
                <div style={{ fontSize: 10, color: C.tx3 }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Blessures actives ── */}
        {activeInjuries.length > 0 && (
          <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.r + "30", overflow: "hidden" }}>
            <button onClick={() => setDrawerInjOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: C.r }} /><div style={{ fontSize: 12, fontWeight: 600, color: C.r, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Blessures actives ({activeInjuries.length})</div></div>
              <span style={{ fontSize: 12, color: C.tx3, display: "inline-block", transition: "transform 0.2s", transform: drawerInjOpen ? "rotate(180deg)" : "none" }}>∨</span>
            </button>
            {drawerInjOpen && (
              <div style={{ borderTop: "1px solid " + C.r + "30", padding: "8px 16px" }}>
                {activeInjuries.map(inj => (
                  <div key={inj.id} style={{ padding: "8px 10px", borderRadius: 4, background: C.s2, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{inj.title}</div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>{injurySummary(inj)}</div>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: C.tx3, marginTop: 2 }}>
                  Le détail se complète depuis l'onglet Profil, section Antécédents.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Déclarer une gêne ── */}
        {/* Hors mode observation : le coach qui regarde le profil d'un athlète ne
            déclare pas à sa place depuis cet écran. */}
        {!viewOnly && athleteId && (
          <button
            onClick={() => setDeclareInjury(true)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
              background: C.s1, borderRadius: 6, border: "1px solid " + C.o + "40",
              padding: "12px 16px", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <HeartPulse size={16} style={{ color: C.o, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tx }}>Déclarer une gêne ou une blessure</div>
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 1 }}>Même une petite gêne compte — 10 secondes</div>
            </div>
            <span style={{ fontSize: 12, color: C.tx3 }}>&gt;</span>
          </button>
        )}
        {declareInjury && athleteId && (
          <DeclareInjurySheet athleteId={athleteId} onClose={() => setDeclareInjury(false)} />
        )}

        {/* ── Mes tendances ── */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={sectionTitle}>Mes tendances</div>
            <div style={{ display: "flex", gap: 3, background: C.s1, borderRadius: 4, padding: 2, border: "1px solid " + C.brd }}>
              {PERIODS.map(p => (
                <button key={p.d} onClick={() => setDays(p.d)} style={{ padding: "4px 9px", borderRadius: 6, border: "none", background: days === p.d ? C.acS : "transparent", color: days === p.d ? C.ac : C.tx3, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{p.l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <TrendCard
              label="Score de santé" value={fmt(t.health.value)} unit="/100" delta={t.health.delta} color={C.g}
              series={t.health.series} sub="moyenne wellness" onClick={() => setDrawerZoom("wellness")}
            />
            <TrendCard
              label="Sommeil" value={t.sleep ? String(t.sleep.score) : "—"} unit="/100"
              delta={t.sleep && t.prevSleep ? t.sleep.score - t.prevSleep.score : null} color={C.b}
              sub={t.sleep ? `${fmt(t.sleep.avgHours, 1)} h / ${t.sleep.targetHours} h · coucher ±${t.sleep.bedtimeDeviationMin} min` : "aucune donnée"}
              progress={t.sleep?.score ?? null} onClick={() => setDrawerZoom("sleep")}
            />
            <TrendCard
              label="Poids" value={fmt(t.weight.value, 1)} unit="kg" delta={t.weight.delta} deltaUnit=" kg" goodWhenUp={weightGoodWhenUp}
              color={C.ac} series={t.weight.series}
              sub={weightToTarget === null ? "pas d'objectif" : Math.abs(weightToTarget) < 0.3 ? "objectif atteint" : `${weightToTarget > 0 ? "+" : ""}${fmt(weightToTarget, 1)} kg vs objectif`}
              onClick={() => setDrawerZoom("weight")}
            />
            <TrendCard
              label="Assiduité" value={t.attendance.pct === null ? "—" : String(t.attendance.pct)} unit="%"
              delta={t.attendance.pct !== null && t.prevAttendance.pct !== null ? t.attendance.pct - t.prevAttendance.pct : null} deltaUnit=" pts"
              color={C.o} progress={t.attendance.pct} sub={`${t.attendance.done}/${t.attendance.planned} séances`}
            />
            <TrendCard
              label="Fatigue" value={fmt(t.fatigue.value, 1)} unit="/5" delta={t.fatigue.delta} color={C.y}
              series={t.fatigue.series} sub="5 = très en forme" onClick={() => setDrawerZoom("wellness")}
            />
            <TrendCard
              label="Stress" value={fmt(t.stress.value, 1)} unit="/5" delta={t.stress.delta} color={C.coach}
              series={t.stress.series} sub="5 = très détendu" onClick={() => setDrawerZoom("wellness")}
            />
          </div>
        </section>

        {/* ── Ce qu'on retient ── */}
        {insights.length > 0 && (
          <section style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.ac + "30", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ ...sectionTitle, color: C.ac }}>Ce qu'on retient</div>
              {insightsLoading ? <span style={{ fontSize: 10, color: C.tx3 }}>analyse…</span> : source === "ai" && <span style={{ fontSize: 9, color: C.tx3, padding: "2px 6px", borderRadius: 4, background: C.s2 }}>IA</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {insights.map((txt, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>
                  <span style={{ color: C.ac, flexShrink: 0 }}>•</span><span>{txt}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Mes derniers progrès ── */}
        <section>
          <div style={{ ...sectionTitle, marginBottom: 10 }}>Mes derniers progrès</div>
          {t.progress.length ? (
            <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
              {t.progress.slice(0, 5).map((p, i) => (
                <div key={p.exercise} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? "1px solid " + C.brd : "none" }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M6 9V2H18V9C18 12.3 15.3 15 12 15S6 12.3 6 9Z"/><path d="M6 4H2V7C2 9 3 10 5 10"/><path d="M18 4H22V7C22 9 21 10 19 10"/><path d="M12 15V18"/><path d="M8 22H16L15 18H9L8 22Z"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.exercise}</div>
                    <div style={{ fontSize: 10, color: C.tx3 }}>{fmtDay(p.date)}{p.prevKg !== null ? ` · avant ${p.prevKg} kg` : " · premier record"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.ac }}>{p.kg} kg</div>
                    {p.gain !== null && <div style={{ fontSize: 10, fontWeight: 700, color: C.g }}>+{p.gain} kg</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, padding: "16px", textAlign: "center", fontSize: 11, color: C.tx3 }}>
              Aucun nouveau record sur la période
            </div>
          )}
        </section>

        {/* ── Retours hebdo du coach déjà vus ── */}
        {seenRetours.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Retours du coach</div>
            {(showAllRetours ? seenRetours : seenRetours.slice(0, 1)).map((r) => (
              <CoachRetourCard key={r.id} retour={r} />
            ))}
            {seenRetours.length > 1 && (
              <button
                onClick={() => setShowAllRetours((v) => !v)}
                style={{ background: "none", border: "none", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0, textAlign: "left" as const, textDecoration: "underline" }}
              >
                {showAllRetours ? "Masquer les anciens retours" : `Voir les ${seenRetours.length - 1} retours précédents`}
              </button>
            )}
          </section>
        )}

        {/* ── Retour coach (14 derniers jours uniquement) ── */}
        {recentFb && (
          <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.coach + "40", overflow: "hidden" }}>
            <button onClick={() => { navigate("coach-feedback"); onClose(); }} style={{ width: "100%", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" as const }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg><span style={{ fontSize: 11, fontWeight: 700, color: C.coach }}>Retour du coach</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 9, color: C.tx3 }}>{fmtDay(recentFb.date!.slice(0, 10))}</span><span style={{ fontSize: 11, color: C.coach }}>›</span></div>
              </div>
              <div style={{ fontSize: 11, color: C.tx2, lineHeight: 1.55, fontStyle: "italic", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>"{recentFb.note}"</div>
            </button>
          </div>
        )}

        {/* ── Mes fiches ── */}
        <button onClick={() => { navigate("program?vue=fiches"); onClose(); }} style={{ width: "100%", minHeight: 48, background: C.s1, borderRadius: 6, padding: "14px 16px", border: "1px solid " + C.brd, textAlign: "left" as const, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>📄 Mes fiches</div>
          <span style={{ fontSize: 11, color: C.tx3 }}>→</span>
        </button>

        {/* ── Objectifs ── */}
        <button onClick={() => setDrawerZoom("goals")} style={{ width: "100%", background: C.s1, borderRadius: 6, padding: "14px 16px", border: "1px solid " + C.brd, textAlign: "left" as const, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Objectifs</div>
          <span style={{ fontSize: 11, color: C.tx3 }}>→</span>
        </button>

        {/* ── Réserver mon point hebdo (si le coach a posé un lien) ── */}
        {!viewOnly && <BookingSection />}

        {/* ── Mon coach ── */}
        {!viewOnly && <CoachSection />}

        {/* ── Données sportives (tests VMA, FC…) ── */}
        <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
          <button onClick={() => setDrawerSportOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Données sportives</div>
            <span style={{ fontSize: 12, color: C.tx3, display: "inline-block", transition: "transform 0.2s", transform: drawerSportOpen ? "rotate(180deg)" : "none" }}>∨</span>
          </button>
          {drawerSportOpen && <div style={{ borderTop: "1px solid " + C.brd, padding: "0 0 8px" }}><PerformanceProfile athleteId={athleteId} viewOnly={viewOnly} C={C} /></div>}
        </div>

        {/* ── Retour sur l'app ── */}
        {!viewOnly && <AppFeedbackSection />}

        {/* ── Confidentialité & données (consentements, export, suppression) ──
            Masqué en `viewOnly` : le coach qui consulte le profil d'un athlète
            ne doit pas pouvoir retirer ses consentements ni supprimer son
            compte — ce sont des droits strictement personnels. */}
        {!viewOnly && <PrivacySection />}

        {/* Déconnexion */}
        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <button onClick={async () => { await supabase.auth.signOut({ scope: "local" }); window.location.href = "/login"; }} style={{ width: "100%", padding: "12px 0", borderRadius: 6, border: "1px solid " + C.r + "30", background: C.rS, color: C.r, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>⏻</span><span>Déconnexion</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SleepZoomContent({ summary, goals, wellnessHistory }: { summary: TrendSummary; goals: { sleepTarget?: number; sleepBedtime?: { h: number; m: number } }; wellnessHistory: Record<string, unknown> }) {
  const s = summary.sleep;
  const hm = (t?: { h: number; m: number }) => t ? `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}` : "non défini";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, marginBottom: 12 }}>Score de sommeil · {summary.days} j</div>
        {s ? (<>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 14 }}><span style={{ fontSize: 40, fontWeight: 900, color: C.b, letterSpacing: "-1px" }}>{s.score}</span><span style={{ fontSize: 14, color: C.tx3 }}>/ 100</span></div>
          {[
            { l: "Régularité du coucher", v: s.regularity, d: `écart moyen ±${s.bedtimeDeviationMin} min · cible ${hm(goals.sleepBedtime)}` },
            { l: "Quantité", v: s.quantity, d: `${s.avgHours} h en moyenne · objectif ${s.targetHours} h` },
          ].map(r => (
            <div key={r.l} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx, marginBottom: 4 }}><span>{r.l}</span><span style={{ fontWeight: 700 }}>{r.v}/50</span></div>
              <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: (r.v / 50) * 100 + "%", background: C.b, borderRadius: 3 }} /></div>
              <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>{r.d}</div>
            </div>
          ))}
        </>) : <div style={{ textAlign: "center" as const, color: C.tx3, fontSize: 12, padding: "20px 0" }}>Renseigne tes heures de coucher et de réveil dans ton bilan du jour.</div>}
      </div>
      <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 12 }}>Tunnel de sommeil</div>
        <SleepTunnel wellnessHistory={wellnessHistory} C={C} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WellnessChart({ wellnessHistory, period, setPeriod, height, minimal = false }: { wellnessHistory: Record<string, unknown>; period: string; setPeriod: (v: string) => void; height: number; minimal?: boolean }) {
  const wData = getWellnessChartData(wellnessHistory, period);
  const hasSomeData = wData.some((d: { score: number | null }) => d.score !== null);
  if (!hasSomeData) return <div style={{ textAlign: "center" as const, color: C.tx3, fontSize: 11, padding: "8px 0" }}>Aucune donnée</div>;
  return (
    <>
      {!minimal && (
        <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
          {[{ k: "week", l: "7j" }, { k: "month", l: "30j" }, { k: "year", l: "12m" }].map(t => (<button key={t.k} onClick={() => setPeriod(t.k)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: period === t.k ? C.acS : "transparent", color: period === t.k ? C.ac : C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.l}</button>))}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={wData} margin={{ top: 2, right: 2, bottom: 0, left: -28 }}>
          <YAxis yAxisId="score" domain={[0, 100]} hide /><YAxis yAxisId="sleep" orientation="right" domain={[0, 12]} hide />
          <Bar yAxisId="sleep" dataKey="sleep" fill={C.b} opacity={0.3} radius={[2, 2, 0, 0]} maxBarSize={10} />
          <Line yAxisId="score" dataKey="score" stroke={C.g} strokeWidth={minimal ? 1.5 : 2} dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

function WellnessZoomContent({ wellness, wScore, wReco, wellnessHistory, wellnessPeriod, setWellnessPeriod }: { wellness: ReturnType<typeof useAthleteContext>["wellness"]; wScore: number; wReco: { c: string; label: string; desc: string }; wellnessHistory: Record<string, unknown>; wellnessPeriod: string; setWellnessPeriod: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, marginBottom: 12 }}>Forme du jour</div>
        {wellness ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
              <svg viewBox="0 0 64 64" style={{ width: 72, height: 72, transform: "rotate(-90deg)" }}><circle cx="32" cy="32" r="26" fill="none" stroke={C.s2} strokeWidth="5" /><circle cx="32" cy="32" r="26" fill="none" stroke={wReco.c} strokeWidth="5" strokeDasharray={String(2 * Math.PI * 26)} strokeDashoffset={String(2 * Math.PI * 26 * (1 - wScore / 100))} strokeLinecap="round" /></svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: wReco.c }}>{wScore}</div>
            </div>
            <div><div style={{ fontSize: 16, fontWeight: 700, color: wReco.c }}>{wReco.label}</div><div style={{ fontSize: 12, color: C.tx2, marginTop: 4 }}>{wReco.desc}</div></div>
          </div>
        ) : <div style={{ textAlign: "center" as const, color: C.tx3, fontSize: 12, padding: "20px 0" }}>Aucune donnée de forme aujourd'hui</div>}
      </div>
      <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const }}>Score de santé</div>
          <div style={{ display: "flex", gap: 3 }}>{[{ k: "week", l: "7j" }, { k: "month", l: "30j" }, { k: "year", l: "12m" }].map(t => (<button key={t.k} onClick={() => setWellnessPeriod(t.k)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: wellnessPeriod === t.k ? C.acS : "transparent", color: wellnessPeriod === t.k ? C.ac : C.tx3, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{t.l}</button>))}</div>
        </div>
        <WellnessChart wellnessHistory={wellnessHistory} period={wellnessPeriod} setPeriod={setWellnessPeriod} height={130} />
      </div>
      <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 12 }}>Tunnel de sommeil — 14 jours</div>
        <SleepTunnel wellnessHistory={wellnessHistory} C={C} />
      </div>
    </div>
  );
}

function GoalsZoomContent() {
  const { totalDone, totalTarget, bodyWeight, weightLog, nutritionStrategy } = useAthleteContext();
  const todayW = weightLog[todayKey()] || Object.entries(weightLog).sort((a, b) => b[0] > a[0] ? 1 : -1)[0]?.[1] || bodyWeight.current || null;
  const tgt = nutritionStrategy?.target_weight || bodyWeight.target || null;
  const start = bodyWeight.current || null;
  const isGain = start && tgt ? tgt >= start : true;
  const delta = tgt && todayW ? +(tgt - todayW).toFixed(1) : null;
  const pct = start && tgt && start !== tgt && todayW ? Math.min(100, Math.max(0, isGain ? ((todayW - start) / (tgt - start)) * 100 : ((start - todayW) / (start - tgt)) * 100)) : 0;
  const reached = delta !== null && Math.abs(delta) < 0.3;
  const wC = reached ? C.g : C.ac;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, marginBottom: 12 }}>Séances — Bloc en cours</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}><span style={{ fontSize: 36, fontWeight: 900, color: C.g, letterSpacing: "-1px" }}>{totalDone}</span><span style={{ fontSize: 16, color: C.tx3 }}>/ {totalTarget}</span></div>
        <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}><div style={{ height: "100%", width: Math.min((totalDone / totalTarget) * 100, 100) + "%", background: C.g, borderRadius: 3 }} /></div>
        <div style={{ fontSize: 11, color: C.tx3 }}>{Math.max(0, totalTarget - totalDone)} séance(s) restante(s)</div>
      </div>
      {tgt && (
        <div style={{ background: C.s1, borderRadius: 6, padding: "16px", border: "1px solid " + C.brd }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const }}>Objectif poids</div>
            {start && tgt && <span style={{ fontSize: 10, fontWeight: 700, color: isGain ? C.g : C.b, padding: "2px 8px", borderRadius: 5, background: (isGain ? C.g : C.b) + "18" }}>{isGain ? "▲ Prise" : "▼ Sèche"}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 10 }}><span style={{ fontSize: 36, fontWeight: 900, color: wC, letterSpacing: "-1px" }}>{todayW || "--"}</span><span style={{ fontSize: 16, color: C.tx3 }}>/ {tgt} kg</span></div>
          <div style={{ height: 6, background: C.s2, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}><div style={{ height: "100%", width: pct + "%", background: wC, borderRadius: 3, transition: "width 0.4s" }} /></div>
          <div style={{ fontSize: 11, color: reached ? C.g : C.tx3, fontWeight: reached ? 600 : 400 }}>{reached ? "Objectif atteint" : delta !== null ? (Math.abs(delta) + " kg restants") : "—"}</div>
        </div>
      )}
    </div>
  );
}

// ── Point hebdo ──────────────────────────────────────────────────────────────

/**
 * Entrée « Réserver mon point hebdo ».
 * Invisible tant que le coach n'a pas renseigné de lien Calendly : pas de
 * fausse promesse à l'athlète.
 */
function BookingSection() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);

  // Un coach auto-coaché n'a pas de point hebdo à réserver avec lui-même.
  const coachId = profile?.coach_id && profile.coach_id !== user?.id ? profile.coach_id : null;
  const { data } = useCoachBooking(coachId);

  const bookingUrl = data?.bookingUrl ?? null;
  if (!bookingUrl) return null;

  const athleteName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.full_name ||
    "";

  function handleScheduled() {
    setOpen(false);
    toast.success("Point réservé ✓ Tu reçois l'invitation avec le lien Meet par mail");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: "100%", minHeight: 48, background: C.s1, borderRadius: 6,
          padding: "14px 16px", border: "1px solid " + C.coach + "40",
          textAlign: "left" as const, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <CalendarClock size={14} color={C.coach} style={{ flexShrink: 0 }} />
          <span
            style={{
              fontSize: 12, fontWeight: 600, color: C.coach,
              textTransform: "uppercase" as const, letterSpacing: "0.5px",
            }}
          >
            Réserver mon point hebdo
          </span>
        </div>
        <span style={{ fontSize: 11, color: C.coach, flexShrink: 0 }}>→</span>
      </button>

      {open && (
        <BookingPanel
          bookingUrl={bookingUrl}
          coachName={data?.coachName ?? "ton coach"}
          athleteName={athleteName}
          athleteEmail={user?.email ?? null}
          onClose={() => setOpen(false)}
          onScheduled={handleScheduled}
        />
      )}
    </>
  );
}

// ── Gestion du coach ─────────────────────────────────────────────────────────

function CoachSection() {
  const { user, profile, linkToCoach, unlinkFromCoach, becomeSelfCoach, removeSelfAsAthlete } = useAuth();
  const [showJoin, setShowJoin] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmAction, setConfirmAction] = useState<"quit" | "stopSelf" | null>(null);
  const [coachName, setCoachName] = useState<string | null>(null);

  /**
   * Identifiant du coach externe, ou `null` si l'athlète n'en a pas (ou s'il est
   * son propre coach). Dérivé avant tout `return` anticipé : les hooks doivent
   * s'exécuter dans le même ordre à chaque rendu.
   */
  const coachId =
    user && profile && profile.coach_id && profile.coach_id !== user.id
      ? profile.coach_id
      : null;

  // Le nom du coach n'est affiché nulle part ailleurs : on le lit ici, dans un
  // effet. Le drapeau `cancelled` évite d'écrire dans un composant démonté ou
  // de faire gagner une réponse obsolète si `coachId` change entre-temps.
  useEffect(() => {
    if (!coachId) {
      setCoachName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("full_name, first_name, last_name")
      .eq("id", coachId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCoachName(
          [data.first_name, data.last_name].filter(Boolean).join(" ") ||
            data.full_name ||
            "Coach",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [coachId]);

  if (!user || !profile) return null;

  const isCoachAthlete = profile.role === "coach_athlete";
  const isSelfCoached = profile.coach_id === user.id; // coach_id = self
  const hasExternalCoach = !!profile.coach_id && profile.coach_id !== user.id;
  const noCoach = !profile.coach_id; // coach_id = null

  async function handleJoin() {
    if (!code.trim() || loading) return;
    setLoading(true);
    setMsg(null);
    try {
      await linkToCoach(code.trim());
      setMsg({ text: "Coach rejoint", ok: true });
      setCode("");
      setTimeout(() => { setShowJoin(false); setMsg(null); }, 1500);
    } catch (e: unknown) {
      setMsg({ text: (e as Error).message || "Code invalide", ok: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleQuitExternalCoach() {
    setLoading(true);
    try {
      await unlinkFromCoach();
      setMsg({ text: isCoachAthlete ? "Tu es redevenu ton propre coach" : "Coach quitté", ok: true });
      setConfirmAction(null);
      setTimeout(() => setMsg(null), 2000);
    } catch (e: unknown) {
      setMsg({ text: (e as Error).message || "Erreur", ok: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleBecomeSelfCoach() {
    setLoading(true);
    try {
      await becomeSelfCoach();
      setMsg({ text: "Tu es ton propre coach", ok: true });
      setTimeout(() => setMsg(null), 2000);
    } catch (e: unknown) {
      setMsg({ text: (e as Error).message || "Erreur", ok: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleStopSelfCoaching() {
    setLoading(true);
    try {
      await removeSelfAsAthlete();
      setMsg({ text: "Tu ne te coaches plus", ok: true });
      setConfirmAction(null);
      setTimeout(() => setMsg(null), 2000);
    } catch (e: unknown) {
      setMsg({ text: (e as Error).message || "Erreur", ok: false });
    } finally {
      setLoading(false);
    }
  }

  const joinInput = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: C.tx3 }}>{hasExternalCoach ? "Code du nouveau coach" : "Entre le code de ton coach"}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Ex: R4BL7M" maxLength={6} autoFocus
          style={{ flex: 1, padding: "8px 12px", borderRadius: 4, border: "1px solid " + C.brdL, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none", letterSpacing: "0.1em" }}
        />
        <button onClick={handleJoin} disabled={loading || !code.trim()} style={{ padding: "8px 14px", borderRadius: 4, border: "none", background: code.trim() ? C.ac : C.s2, color: code.trim() ? "#fff" : C.tx3, fontSize: 12, fontWeight: 600, cursor: code.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
          {loading ? "…" : "OK"}
        </button>
      </div>
      <button onClick={() => { setShowJoin(false); setCode(""); setMsg(null); }} style={{ padding: "6px", background: "transparent", border: "none", color: C.tx3, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
        Annuler
      </button>
    </div>
  );

  return (
    <div style={{ background: C.s1, borderRadius: 6, border: "1px solid " + C.brd, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx3, textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 10 }}>Mon coach</div>

        {/* ── État 1 : coach_athlete se coache lui-même (coach_id = self) ── */}
        {isSelfCoached && isCoachAthlete && (
          <>
            <div style={{ fontSize: 12, color: C.tx2, marginBottom: 10 }}>Tu es ton propre coach.</div>
            {showJoin ? joinInput : confirmAction === "stopSelf" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: C.r, fontWeight: 600 }}>
                  Tu n'apparaîtras plus dans tes athlètes et n'auras plus de coach. Continuer ?
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleStopSelfCoaching} disabled={loading} style={{ flex: 1, padding: "9px 0", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {loading ? "…" : "Confirmer"}
                  </button>
                  <button onClick={() => setConfirmAction(null)} style={{ flex: 1, padding: "9px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => { setShowJoin(true); setMsg(null); }} style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: "1px solid " + C.ac + "50", background: C.acS, color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Rejoindre un autre coach
                </button>
                <button onClick={() => { setConfirmAction("stopSelf"); setMsg(null); }} style={{ width: "100%", padding: "9px 0", borderRadius: 4, border: "1px solid " + C.r + "30", background: C.rS, color: C.r, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Ne plus me coacher
                </button>
              </div>
            )}
          </>
        )}

        {/* ── État 2 : pas de coach (coach_id = null) ── */}
        {noCoach && (
          <>
            <div style={{ fontSize: 12, color: C.tx2, marginBottom: 10 }}>Aucun coach assigné.</div>
            {!showJoin ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => { setShowJoin(true); setMsg(null); }} style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: "1px solid " + C.ac + "50", background: C.acS, color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Rejoindre un coach
                </button>
                {isCoachAthlete && (
                  <button onClick={handleBecomeSelfCoach} disabled={loading} style={{ width: "100%", padding: "10px 0", borderRadius: 4, border: "1px solid " + C.g + "50", background: C.g + "15", color: C.g, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {loading ? "…" : "Devenir mon propre coach"}
                  </button>
                )}
              </div>
            ) : joinInput}
          </>
        )}

        {/* ── État 3 : coaché par un autre (coach_id = autre) ── */}
        {hasExternalCoach && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.coach + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: C.coach, flexShrink: 0 }}>
                {(coachName || "C").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{coachName || "…"}</div>
                <div style={{ fontSize: 10, color: C.tx3 }}>Mon coach actuel</div>
              </div>
            </div>
            {confirmAction === "quit" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: C.r, fontWeight: 600 }}>
                  {isCoachAthlete ? "Tu redeviendras ton propre coach. Continuer ?" : "Tu n'auras plus de coach. Continuer ?"}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleQuitExternalCoach} disabled={loading} style={{ flex: 1, padding: "9px 0", borderRadius: 4, border: "none", background: C.rV, color: "#0E0C0A", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    {loading ? "…" : "Confirmer"}
                  </button>
                  <button onClick={() => setConfirmAction(null)} style={{ flex: 1, padding: "9px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmAction("quit")} style={{ width: "100%", padding: "9px 0", borderRadius: 4, border: "1px solid " + C.r + "30", background: C.rS, color: C.r, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Quitter mon coach
              </button>
            )}
          </>
        )}

        {msg && <div style={{ fontSize: 11, marginTop: 8, color: msg.ok ? C.g : C.r, fontWeight: 600 }}>{msg.text}</div>}
      </div>
    </div>
  );
}
