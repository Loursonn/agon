import { useState, useEffect } from "react";
import { HeartPulse, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";
import { useActiveInjuries } from "@/features/shared/hooks/useMedicalEntries";
import { DeclareInjurySheet } from "@/features/shared/components/medical/DeclareInjurySheet";
import { injurySummary } from "@/lib/injuryDetails";
import { useNavigate } from "react-router-dom";
import { useAthleteCoaches } from "@/features/shared/hooks/useCoCoach";
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
import { ConnectedServicesSection } from "@/features/shared/components/ConnectedServicesSection";
import { CoachRetourCard } from "@/features/athlete/components/CoachRetourCard";
import { useAthleteRetours } from "@/features/shared/hooks/useWeeklyCoachRetour";
import type { TrendSummary } from "@/lib/athleteTrends";
import { confirmLogout, logoutDevice } from "@/lib/offline/logoutDevice";
import { getCoachName } from "@/api/profile";
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
const SECTION_TITLE = "text-[11px] font-bold uppercase tracking-[0.5px] text-agon-tx3";
/** Titre de carte (12 px, majuscules) : « Mon coach », « Objectifs »… */
const CARD_LABEL = "text-[12px] font-semibold uppercase tracking-[0.5px] text-agon-tx3";
const CARD = "rounded-[6px] border border-agon-brd bg-agon-s1";
const ZOOM_CARD = cn(CARD, "p-4");
const BTN = "cursor-pointer font-[inherit]";
const PERIOD_BTN = cn(BTN, "rounded-[6px] border-none px-2 py-[3px] text-[10px] font-semibold");
const CHEVRON = "inline-block text-[12px] text-agon-tx3 [transition:transform_0.2s]";
const ACCORDION_BTN = cn(BTN, "flex w-full items-center justify-between border-none bg-transparent px-4 py-3");
const WELLNESS_PERIODS = [{ k: "week", l: "7j" }, { k: "month", l: "30j" }, { k: "year", l: "12m" }];

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
  const [fbExpanded, setFbExpanded] = useState(false);

  // Retour coach : uniquement s'il date des 14 derniers jours
  const recentFb = Object.entries(coachFeedbacks)
    .map(([w, fb]) => ({ week: Number(w), ...fb }))
    .filter(fb => fb.note && fb.date && Date.now() - new Date(fb.date).getTime() <= 14 * 86_400_000)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];

  const weightToTarget = t.weight.value !== null && t.weightTarget ? Math.round((t.weightTarget - t.weight.value) * 10) / 10 : null;
  const weightGoodWhenUp = t.weightTarget && t.weight.prev !== null ? t.weightTarget > t.weight.prev : null;

  // Zoom overlay
  if (drawerZoom) return (
    <div className="fixed inset-0 z-[103] flex flex-col overflow-y-auto bg-agon-bg">
      {/* PC : vue zoom centrée (720 px max) plutôt qu'étirée sur tout l'écran */}
      <div className="sticky top-0 z-[2] flex w-full items-center gap-3 border-b border-agon-brd bg-agon-bg px-4 py-3 lg:mx-auto lg:max-w-[720px]">
        <button onClick={() => setDrawerZoom(null)} className={cn(BTN, "flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-agon-brd-l bg-transparent text-[18px] text-agon-tx2")}>←</button>
        <div className="text-[14px] font-bold">{drawerZoom === "weight" ? "Poids de corps" : drawerZoom === "wellness" ? "Forme & santé" : drawerZoom === "sleep" ? "Sommeil" : "Objectifs"}</div>
      </div>
      <div className="w-full p-4 lg:mx-auto lg:max-w-[720px]">
        {drawerZoom === "weight" && (
          <div className={ZOOM_CARD}>
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-[13px] font-bold">Évolution du poids</div>
              <div className="text-[13px] font-extrabold text-agon-accent">{t.weight.value ?? bodyWeight.current ?? "—"}<span className="text-[10px] font-normal text-agon-tx3"> / {t.weightTarget || "—"} kg</span></div>
            </div>
            {Object.keys(weightLog).length > 0 ? <WeightChart log={weightLog} milestones={weightMilestones} target={bodyWeight.target} nutritionStrategy={nutritionStrategy} /> : <div className="py-6 text-center text-[11px] text-agon-tx3">Aucune mesure enregistrée</div>}
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
    <>
    {/* PC : fond assombri, un clic à côté du tiroir le ferme (mobile : inchangé, le tiroir couvre l'écran) */}
    <div className="fixed inset-0 z-[101] hidden bg-black/50 lg:block" onClick={onClose} aria-hidden="true" />
    <div className="fixed inset-y-0 right-0 z-[102] flex w-[min(400px,94vw)] flex-col overflow-y-auto border-l border-agon-brd bg-agon-bg">
      <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-agon-brd bg-agon-bg px-4 py-3">
        <div className="text-[15px] font-bold">Mon profil</div>
        <button onClick={onClose} className={cn(BTN, "flex h-7 w-7 items-center justify-center rounded-[4px] border border-agon-brd-l bg-transparent text-[18px] text-agon-tx2")}>×</button>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-4">
        {/* ── En-tête : identité + KPIs ── */}
        <div className="rounded-[14px] border border-agon-brd bg-agon-s1 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-agon-accent/[0.25] bg-agon-accent-doux text-[16px] font-extrabold text-agon-accent">
              {name.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-agon-tx">{name}</div>
              {wellness && <div className="text-[11px] font-semibold" style={{ color: wReco.c }}>Forme du jour : {wReco.label} · {wScore}</div>}
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-[repeat(3,1fr)] gap-2">
            {[
              { v: String(t.attendance.done), l: "séances" },
              { v: t.attendance.pct === null ? "—" : t.attendance.pct + "%", l: "assiduité" },
              { v: String(streak ?? 0), l: "série" },
            ].map(k => (
              <div key={k.l} className="rounded-[4px] bg-black/[0.18] py-2 text-center">
                <div className="text-[18px] font-extrabold text-agon-tx">{k.v}</div>
                <div className="text-[10px] text-agon-tx3">{k.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Blessures actives ── */}
        {activeInjuries.length > 0 && (
          <div className="overflow-hidden rounded-[6px] border border-agon-erreur/[0.19] bg-agon-s1">
            <button onClick={() => setDrawerInjOpen(o => !o)} className={ACCORDION_BTN}>
              <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-agon-erreur" /><div className="text-[12px] font-semibold uppercase tracking-[0.5px] text-agon-erreur">Blessures actives ({activeInjuries.length})</div></div>
              <span className={cn(CHEVRON, drawerInjOpen && "rotate-180")}>∨</span>
            </button>
            {drawerInjOpen && (
              <div className="border-t border-agon-erreur/[0.19] px-4 py-2">
                {activeInjuries.map(inj => (
                  <div key={inj.id} className="mb-1.5 rounded-[4px] bg-agon-s2 px-2.5 py-2">
                    <div className="text-[12px] font-semibold text-agon-tx">{inj.title}</div>
                    <div className="text-[10px] text-agon-tx3">{injurySummary(inj)}</div>
                  </div>
                ))}
                <div className="mt-0.5 text-[10px] text-agon-tx3">
                  Le détail se complète depuis l'onglet Profil, section Blessures.
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
            className={cn(BTN, "flex w-full items-center gap-2.5 rounded-[6px] border border-agon-alerte/[0.25] bg-agon-s1 px-4 py-3 text-left")}
          >
            <HeartPulse size={16} className="shrink-0 text-agon-alerte" />
            <div className="flex-1">
              <div className="text-[12.5px] font-bold text-agon-tx">Déclarer une gêne ou une blessure</div>
              <div className="mt-px text-[10px] text-agon-tx3">Même une petite gêne compte — 10 secondes</div>
            </div>
            <span className="text-[12px] text-agon-tx3">&gt;</span>
          </button>
        )}
        {declareInjury && athleteId && (
          <DeclareInjurySheet athleteId={athleteId} onClose={() => setDeclareInjury(false)} />
        )}

        {/* ── Mes tendances ── */}
        <section>
          <div className="mb-2.5 flex items-center justify-between">
            <div className={SECTION_TITLE}>Mes tendances</div>
            <div className="flex gap-[3px] rounded-[4px] border border-agon-brd bg-agon-s1 p-0.5">
              {PERIODS.map(p => (
                <button key={p.d} onClick={() => setDays(p.d)} className={cn(BTN, "rounded-[6px] border-none px-[9px] py-1 text-[10px] font-bold", days === p.d ? "bg-agon-accent-doux text-agon-accent" : "bg-transparent text-agon-tx3")}>{p.l}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
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
          <section className="rounded-[6px] border border-agon-accent/[0.19] bg-agon-s1 px-4 py-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <div className={cn(SECTION_TITLE, "text-agon-accent")}>Ce qu'on retient</div>
              {insightsLoading ? <span className="text-[10px] text-agon-tx3">analyse…</span> : source === "ai" && <span className="rounded-[4px] bg-agon-s2 px-1.5 py-0.5 text-[9px] text-agon-tx3">IA</span>}
            </div>
            <div className="flex flex-col gap-2">
              {insights.map((txt, i) => (
                <div key={i} className="flex gap-2 text-[12px] leading-[1.5] text-agon-tx2">
                  <span className="shrink-0 text-agon-accent">•</span><span>{txt}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Mes derniers progrès ── */}
        <section>
          <div className={cn(SECTION_TITLE, "mb-2.5")}>Mes derniers progrès</div>
          {t.progress.length ? (
            <div className={cn(CARD, "overflow-hidden")}>
              {t.progress.slice(0, 5).map((p, i) => (
                <div key={p.exercise} className={cn("flex items-center gap-2.5 px-3.5 py-2.5", i ? "border-t border-agon-brd" : "border-t-0")}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M6 9V2H18V9C18 12.3 15.3 15 12 15S6 12.3 6 9Z"/><path d="M6 4H2V7C2 9 3 10 5 10"/><path d="M18 4H22V7C22 9 21 10 19 10"/><path d="M12 15V18"/><path d="M8 22H16L15 18H9L8 22Z"/></svg>
                  <div className="min-w-0 flex-1">
                    <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold text-agon-tx">{p.exercise}</div>
                    <div className="text-[10px] text-agon-tx3">{fmtDay(p.date)}{p.prevKg !== null ? ` · avant ${p.prevKg} kg` : " · premier record"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[14px] font-extrabold text-agon-accent">{p.kg} kg</div>
                    {p.gain !== null && <div className="text-[10px] font-bold text-agon-succes">+{p.gain} kg</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={cn(CARD, "p-4 text-center text-[11px] text-agon-tx3")}>
              Aucun nouveau record sur la période
            </div>
          )}
        </section>

        {/* ── Retours hebdo du coach déjà vus ── */}
        {seenRetours.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className={CARD_LABEL}>Retours du coach</div>
            {(showAllRetours ? seenRetours : seenRetours.slice(0, 1)).map((r) => (
              <CoachRetourCard key={r.id} retour={r} />
            ))}
            {seenRetours.length > 1 && (
              <button
                onClick={() => setShowAllRetours((v) => !v)}
                className={cn(BTN, "border-none bg-transparent p-0 text-left text-[11px] text-agon-tx3 underline")}
              >
                {showAllRetours ? "Masquer les anciens retours" : `Voir les ${seenRetours.length - 1} retours précédents`}
              </button>
            )}
          </section>
        )}

        {/* ── Retour coach (14 derniers jours uniquement) ── */}
        {recentFb && (
          <div className="overflow-hidden rounded-[6px] border border-agon-coach/[0.25] bg-agon-s1">
            <button onClick={() => setFbExpanded((v) => !v)} className={cn(BTN, "w-full border-none bg-transparent px-3.5 py-3 text-left")}>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square" strokeLinejoin="miter"><path d="M4 4H20V17H10L6 21V17H4Z"/><path d="M8 9H16M8 13H13"/></svg><span className="text-[11px] font-bold text-agon-coach">Retour du coach</span></div>
                <div className="flex items-center gap-1.5"><span className="text-[9px] text-agon-tx3">{fmtDay(recentFb.date!.slice(0, 10))}</span><span className="text-[11px] text-agon-coach">{fbExpanded ? "–" : "+"}</span></div>
              </div>
              <div className={cn("text-[11px] italic leading-[1.55] text-agon-tx2", fbExpanded ? "whitespace-pre-wrap" : "line-clamp-3")}>"{recentFb.note}"</div>
            </button>
          </div>
        )}

        {/* ── Mes fiches ── */}
        <button onClick={() => { navigate("program?vue=fiches"); onClose(); }} className={cn(CARD, BTN, "flex min-h-[48px] w-full items-center justify-between px-4 py-3.5 text-left")}>
          <div className={CARD_LABEL}>📄 Mes fiches</div>
          <span className="text-[11px] text-agon-tx3">→</span>
        </button>

        {/* ── Objectifs ── */}
        <button onClick={() => setDrawerZoom("goals")} className={cn(CARD, BTN, "flex w-full items-center justify-between px-4 py-3.5 text-left")}>
          <div className={CARD_LABEL}>Objectifs</div>
          <span className="text-[11px] text-agon-tx3">→</span>
        </button>

        {/* ── Réserver mon point hebdo (si le coach a posé un lien) ── */}
        {!viewOnly && <BookingSection />}

        {/* ── Mon coach ── */}
        {!viewOnly && <CoachSection onClose={onClose} />}

        {/* ── Données sportives (tests VMA, FC…) ── */}
        <div className={cn(CARD, "overflow-hidden")}>
          <button onClick={() => setDrawerSportOpen(o => !o)} className={ACCORDION_BTN}>
            <div className={CARD_LABEL}>Données sportives</div>
            <span className={cn(CHEVRON, drawerSportOpen && "rotate-180")}>∨</span>
          </button>
          {drawerSportOpen && <div className="border-t border-agon-brd pb-2"><PerformanceProfile athleteId={athleteId} viewOnly={viewOnly} C={C} /></div>}
        </div>

        {/* ── Retour sur l'app ── */}
        {!viewOnly && <AppFeedbackSection />}

        {/* ── Montres & services connectés ──
            Même raison de masquage qu'en dessous : connecter ou débrancher un
            compte COROS engage l'athlète auprès d'un tiers, et un coach ne
            peut pas consentir à sa place. */}
        {!viewOnly && <ConnectedServicesSection />}

        {/* ── Confidentialité & données (consentements, export, suppression) ──
            Masqué en `viewOnly` : le coach qui consulte le profil d'un athlète
            ne doit pas pouvoir retirer ses consentements ni supprimer son
            compte — ce sont des droits strictement personnels. */}
        {!viewOnly && <PrivacySection />}

        {/* Déconnexion */}
        <div className="mt-auto pt-2">
          <button onClick={async () => { if (!confirmLogout()) return; await logoutDevice().catch(() => {}); window.location.href = "/login"; }} className={cn(BTN, "flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-agon-erreur/[0.19] bg-agon-erreur-doux py-3 text-[13px] font-semibold text-agon-erreur")}>
            <span>⏻</span><span>Déconnexion</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

function SleepZoomContent({ summary, goals, wellnessHistory }: { summary: TrendSummary; goals: { sleepTarget?: number; sleepBedtime?: { h: number; m: number } }; wellnessHistory: Record<string, unknown> }) {
  const s = summary.sleep;
  const hm = (t?: { h: number; m: number }) => t ? `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}` : "non défini";
  return (
    <div className="flex flex-col gap-3.5">
      <div className={ZOOM_CARD}>
        <div className="mb-3 text-[12px] font-semibold uppercase text-agon-tx3">Score de sommeil · {summary.days} j</div>
        {s ? (<>
          <div className="mb-3.5 flex items-baseline gap-1"><span className="text-[40px] font-black tracking-[-1px] text-agon-info">{s.score}</span><span className="text-[14px] text-agon-tx3">/ 100</span></div>
          {[
            { l: "Régularité du coucher", v: s.regularity, d: `écart moyen ±${s.bedtimeDeviationMin} min · cible ${hm(goals.sleepBedtime)}` },
            { l: "Quantité", v: s.quantity, d: `${s.avgHours} h en moyenne · objectif ${s.targetHours} h` },
          ].map(r => (
            <div key={r.l} className="mb-3">
              <div className="mb-1 flex justify-between text-[12px] text-agon-tx"><span>{r.l}</span><span className="font-bold">{r.v}/50</span></div>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-agon-s2"><div className="h-full rounded-[3px] bg-agon-info" style={{ width: (r.v / 50) * 100 + "%" }} /></div>
              <div className="mt-1 text-[10px] text-agon-tx3">{r.d}</div>
            </div>
          ))}
        </>) : <div className="py-5 text-center text-[12px] text-agon-tx3">Renseigne tes heures de coucher et de réveil dans ton bilan du jour.</div>}
      </div>
      <div className={ZOOM_CARD}>
        <div className={cn(CARD_LABEL, "mb-3")}>Tunnel de sommeil</div>
        <SleepTunnel wellnessHistory={wellnessHistory} C={C} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WellnessChart({ wellnessHistory, period, setPeriod, height, minimal = false }: { wellnessHistory: Record<string, unknown>; period: string; setPeriod: (v: string) => void; height: number; minimal?: boolean }) {
  const wData = getWellnessChartData(wellnessHistory, period);
  const hasSomeData = wData.some((d: { score: number | null }) => d.score !== null);
  if (!hasSomeData) return <div className="py-2 text-center text-[11px] text-agon-tx3">Aucune donnée</div>;
  return (
    <>
      {!minimal && (
        <div className="mb-2 flex gap-[3px]">
          {WELLNESS_PERIODS.map(t => (<button key={t.k} onClick={() => setPeriod(t.k)} className={cn(PERIOD_BTN, period === t.k ? "bg-agon-accent-doux text-agon-accent" : "bg-transparent text-agon-tx3")}>{t.l}</button>))}
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
    <div className="flex flex-col gap-3.5">
      <div className={ZOOM_CARD}>
        <div className="mb-3 text-[12px] font-semibold uppercase text-agon-tx3">Forme du jour</div>
        {wellness ? (
          <div className="flex items-center gap-3.5">
            <div className="relative h-[72px] w-[72px] shrink-0">
              <svg viewBox="0 0 64 64" className="h-[72px] w-[72px] -rotate-90"><circle cx="32" cy="32" r="26" fill="none" stroke={C.s2} strokeWidth="5" /><circle cx="32" cy="32" r="26" fill="none" stroke={wReco.c} strokeWidth="5" strokeDasharray={String(2 * Math.PI * 26)} strokeDashoffset={String(2 * Math.PI * 26 * (1 - wScore / 100))} strokeLinecap="round" /></svg>
              <div className="absolute inset-0 flex items-center justify-center text-[18px] font-extrabold" style={{ color: wReco.c }}>{wScore}</div>
            </div>
            <div><div className="text-[16px] font-bold" style={{ color: wReco.c }}>{wReco.label}</div><div className="mt-1 text-[12px] text-agon-tx2">{wReco.desc}</div></div>
          </div>
        ) : <div className="py-5 text-center text-[12px] text-agon-tx3">Aucune donnée de forme aujourd'hui</div>}
      </div>
      <div className={ZOOM_CARD}>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[12px] font-semibold uppercase text-agon-tx3">Score de santé</div>
          <div className="flex gap-[3px]">{WELLNESS_PERIODS.map(t => (<button key={t.k} onClick={() => setWellnessPeriod(t.k)} className={cn(PERIOD_BTN, wellnessPeriod === t.k ? "bg-agon-accent-doux text-agon-accent" : "bg-transparent text-agon-tx3")}>{t.l}</button>))}</div>
        </div>
        <WellnessChart wellnessHistory={wellnessHistory} period={wellnessPeriod} setPeriod={setWellnessPeriod} height={130} />
      </div>
      <div className={ZOOM_CARD}>
        <div className={cn(CARD_LABEL, "mb-3")}>Tunnel de sommeil — 14 jours</div>
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
  return (
    <div className="flex flex-col gap-3">
      <div className={ZOOM_CARD}>
        <div className="mb-3 text-[11px] font-semibold uppercase text-agon-tx3">Séances — Bloc en cours</div>
        <div className="mb-2.5 flex items-baseline gap-1"><span className="text-[36px] font-black tracking-[-1px] text-agon-succes">{totalDone}</span><span className="text-[16px] text-agon-tx3">/ {totalTarget}</span></div>
        <div className="mb-1.5 h-1.5 overflow-hidden rounded-[3px] bg-agon-s2"><div className="h-full rounded-[3px] bg-agon-succes" style={{ width: Math.min((totalDone / totalTarget) * 100, 100) + "%" }} /></div>
        <div className="text-[11px] text-agon-tx3">{Math.max(0, totalTarget - totalDone)} séance(s) restante(s)</div>
      </div>
      {tgt && (
        <div className={ZOOM_CARD}>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase text-agon-tx3">Objectif poids</div>
            {start && tgt && <span className={cn("rounded-[5px] px-2 py-0.5 text-[10px] font-bold", isGain ? "bg-agon-succes/[0.09] text-agon-succes" : "bg-agon-info/[0.09] text-agon-info")}>{isGain ? "▲ Prise" : "▼ Sèche"}</span>}
          </div>
          <div className="mb-2.5 flex items-baseline gap-1"><span className={cn("text-[36px] font-black tracking-[-1px]", reached ? "text-agon-succes" : "text-agon-accent")}>{todayW || "--"}</span><span className="text-[16px] text-agon-tx3">/ {tgt} kg</span></div>
          <div className="mb-1.5 h-1.5 overflow-hidden rounded-[3px] bg-agon-s2"><div className={cn("h-full rounded-[3px] [transition:width_0.4s]", reached ? "bg-agon-succes" : "bg-agon-accent")} style={{ width: pct + "%" }} /></div>
          <div className={cn("text-[11px]", reached ? "font-semibold text-agon-succes" : "font-normal text-agon-tx3")}>{reached ? "Objectif atteint" : delta !== null ? (Math.abs(delta) + " kg restants") : "—"}</div>
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
        className={cn(BTN, "flex min-h-[48px] w-full items-center justify-between gap-2.5 rounded-[6px] border border-agon-coach/[0.25] bg-agon-s1 px-4 py-3.5 text-left")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock size={14} color={C.coach} className="shrink-0" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.5px] text-agon-coach">
            Réserver mon point hebdo
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-agon-coach">→</span>
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

const COACH_BTN = cn(BTN, "rounded-[4px] text-[11px] font-semibold");
const CONFIRM_BTN = cn(COACH_BTN, "flex-1 border-none bg-agon-erreur-vif py-[9px] text-agon-ink");
const CANCEL_BTN = cn(COACH_BTN, "flex-1 border border-agon-brd-l bg-transparent py-[9px] text-agon-tx3");
const DANGER_BTN = cn(COACH_BTN, "w-full border border-agon-erreur/[0.19] bg-agon-erreur-doux py-[9px] text-agon-erreur");
const JOIN_BTN = cn(BTN, "w-full rounded-[4px] border border-agon-accent/[0.31] bg-agon-accent-doux py-2.5 text-[12px] font-semibold text-agon-accent");

function CoachSection({ onClose }: { onClose: () => void }) {
  const { user, profile, linkToCoach, unlinkFromCoach, becomeSelfCoach, removeSelfAsAthlete } = useAuth();
  const navigate = useNavigate();
  // Double coach : 2e coach éventuel (géré dans Profil → « Mes coachs »)
  const { data: coaches } = useAthleteCoaches(user?.id);
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
    getCoachName(coachId).then(
      (name) => { if (!cancelled && name) setCoachName(name); },
      (e) => console.error("[ProfileDrawer] coach", e),
    );
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
    <div className="flex flex-col gap-2">
      <div className="text-[11px] text-agon-tx3">{hasExternalCoach ? "Code du nouveau coach" : "Entre le code de ton coach"}</div>
      <div className="flex gap-2">
        <input
          value={code} onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Ex: R4BL7M" maxLength={6} autoFocus
          className="flex-1 rounded-[4px] border border-agon-brd-l bg-agon-s2 px-3 py-2 font-[inherit] text-[13px] tracking-[0.1em] text-agon-tx [outline:none]"
        />
        <button onClick={handleJoin} disabled={loading || !code.trim()} className={cn("rounded-[4px] border-none px-3.5 py-2 font-[inherit] text-[12px] font-semibold", code.trim() ? "cursor-pointer bg-agon-accent text-agon-tx" : "cursor-default bg-agon-s2 text-agon-tx3")}>
          {loading ? "…" : "OK"}
        </button>
      </div>
      <button onClick={() => { setShowJoin(false); setCode(""); setMsg(null); }} className={cn(BTN, "border-none bg-transparent p-1.5 text-[11px] text-agon-tx3")}>
        Annuler
      </button>
    </div>
  );

  return (
    <div className={cn(CARD, "overflow-hidden")}>
      <div className="px-4 py-3">
        <div className={cn(CARD_LABEL, "mb-2.5")}>Mon coach</div>

        {/* ── État 1 : coach_athlete se coache lui-même (coach_id = self) ── */}
        {isSelfCoached && isCoachAthlete && (
          <>
            <div className="mb-2.5 text-[12px] text-agon-tx2">Tu es ton propre coach.</div>
            {showJoin ? joinInput : confirmAction === "stopSelf" ? (
              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold text-agon-erreur">
                  Tu n'apparaîtras plus dans tes athlètes et n'auras plus de coach. Continuer ?
                </div>
                <div className="flex gap-2">
                  <button onClick={handleStopSelfCoaching} disabled={loading} className={CONFIRM_BTN}>
                    {loading ? "…" : "Confirmer"}
                  </button>
                  <button onClick={() => setConfirmAction(null)} className={CANCEL_BTN}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button onClick={() => { setShowJoin(true); setMsg(null); }} className={JOIN_BTN}>
                  Rejoindre un autre coach
                </button>
                <button onClick={() => { setConfirmAction("stopSelf"); setMsg(null); }} className={DANGER_BTN}>
                  Ne plus me coacher
                </button>
              </div>
            )}
          </>
        )}

        {/* ── État 2 : pas de coach (coach_id = null) ── */}
        {noCoach && (
          <>
            <div className="mb-2.5 text-[12px] text-agon-tx2">Aucun coach assigné.</div>
            {!showJoin ? (
              <div className="flex flex-col gap-2">
                <button onClick={() => { setShowJoin(true); setMsg(null); }} className={JOIN_BTN}>
                  Rejoindre un coach
                </button>
                {isCoachAthlete && (
                  <button onClick={handleBecomeSelfCoach} disabled={loading} className={cn(BTN, "w-full rounded-[4px] border border-agon-succes/[0.31] bg-agon-succes/[0.08] py-2.5 text-[12px] font-semibold text-agon-succes")}>
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
            <div className="mb-2.5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-agon-coach/[0.13] text-[12px] font-bold text-agon-coach">
                {(coachName || "C").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-agon-tx">{coachName || "…"}</div>
                <div className="text-[10px] text-agon-tx3">Mon coach actuel</div>
              </div>
            </div>
            {confirmAction === "quit" ? (
              <div className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold text-agon-erreur">
                  {isCoachAthlete ? "Tu redeviendras ton propre coach. Continuer ?" : "Tu n'auras plus de coach. Continuer ?"}
                </div>
                <div className="flex gap-2">
                  <button onClick={handleQuitExternalCoach} disabled={loading} className={CONFIRM_BTN}>
                    {loading ? "…" : "Confirmer"}
                  </button>
                  <button onClick={() => setConfirmAction(null)} className={CANCEL_BTN}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmAction("quit")} className={DANGER_BTN}>
                Quitter mon coach
              </button>
            )}
            {coaches?.coCoach ? (
              <div className="mt-2.5 text-[11px] text-agon-tx3">
                2e coach : <span className="font-semibold text-agon-tx">{coaches.coCoach.id === user?.id ? "toi (en duo)" : coaches.coCoach.full_name}</span>
              </div>
            ) : (
              <button
                onClick={() => { navigate("/athlete/profil#mes-coachs"); onClose(); }}
                className={cn(COACH_BTN, "mt-2 w-full border border-agon-coach/[0.25] bg-agon-coach/[0.07] py-[9px] text-agon-coach")}
              >
                Ajouter un 2e coach
              </button>
            )}
          </>
        )}

        {msg && <div className={cn("mt-2 text-[11px] font-semibold", msg.ok ? "text-agon-succes" : "text-agon-erreur")}>{msg.text}</div>}
      </div>
    </div>
  );
}
