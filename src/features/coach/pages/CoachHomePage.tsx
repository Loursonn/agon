import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Users, Calendar, FlaskConical, ChevronRight,
  Heart, Dumbbell, Trophy, Layers, ArrowUpRight,
  AlertTriangle, Clock, Flag, Medal, ClipboardList,
  Zap, Check, XCircle, SkipForward, BarChart3, Circle,
  CalendarDays,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { StatusPill } from "@/features/coach/components/dashboard/StatusPill";
import { useCoachDashboard } from "@/features/shared/hooks/useCoachDashboard";
import { usePlanningMargin } from "@/features/shared/hooks/usePlanningMargin";
import { useRecentRecords } from "@/features/shared/hooks/useRecentRecords";
import { useUpcomingCompetitions } from "@/features/shared/hooks/useUpcomingCompetitions";
import { useRecentActivity } from "@/features/shared/hooks/useRecentActivity";
import { useUnfinishedWorkouts } from "@/features/shared/hooks/useUnfinishedWorkouts";
import { useAuth } from "@/hooks/useAuth";
import { C } from "@/lib/theme";
import { CitationDuJour } from "@/features/shared/components/CitationDuJour";
import { COMPETITION_META } from "@/types/planning";
import type { SessionStatus } from "@/features/shared/hooks/useCoachDashboard";

// ── Animation variants ─────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
};

// ── Visual mappings ────────────────────────────────────────────────────────────

const STATUS_ICON: Record<SessionStatus, React.ReactNode> = {
  planned:     <ClipboardList size={12} style={{ color: C.tx3 }} />,
  in_progress: <Zap size={12} style={{ color: C.y }} />,
  completed:   <Check size={12} style={{ color: C.g }} />,
  missed:      <XCircle size={12} style={{ color: C.r }} />,
  skipped:     <SkipForward size={12} style={{ color: C.tx3 }} />,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.6px] text-[#7D7468] mb-3 flex items-center gap-1.5">
      {icon && <span className="flex items-center">{icon}</span>}
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#1E1A16] border border-[rgba(231,211,168,0.15)] rounded-2xl overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl bg-[#27221D]" />
      ))}
    </div>
  );
}

// ── Athlete avatar (2 letters) ─────────────────────────────────────────────────
function Avatar({ name, color }: { name: string; color?: string }) {
  const c = color ?? C.ac;
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
      style={{ background: c + "22", color: c, border: `1.5px solid ${c}40` }}
    >
      {initials(name)}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function CoachHomePage() {
  const navigate  = useNavigate();
  const { profile, athletes, user } = useAuth();
  const isCoachAthlete = profile?.role === "coach_athlete";

  const { todayAthletes, missedSessions, upcomingTests, isLoadingToday, isLoadingMissed, isLoadingTests } = useCoachDashboard();
  const { cycles: endingSoon, isLoading: loadMargin }   = usePlanningMargin(14);
  const { records, isLoading: loadRecords }             = useRecentRecords(8);
  const { competitions, isLoading: loadCompet }         = useUpcomingCompetitions(30);
  const { activities, isLoading: loadActivity }         = useRecentActivity(8);

  // Séances travaillées mais jamais clôturées par l'athlète : les données sont
  // là, mais le statut "planned" les exclut de l'historique et des stats.
  const athleteIds = useMemo(
    () => [...athletes.map((a) => a.id), ...(isCoachAthlete && user ? [user.id] : [])],
    [athletes, isCoachAthlete, user],
  );
  const { data: unfinished = [] } = useUnfinishedWorkouts(athleteIds);
  const athleteNameById = useMemo(
    () => new Map(athletes.map((a) => [a.id, a.full_name ?? "Athlète"])),
    [athletes],
  );

  const firstName  = profile?.full_name?.split(" ")[0] ?? "Coach";
  const todayLabel = format(new Date(), "EEEE d MMMM", { locale: fr });

  const compA  = competitions.filter((c) => c.priority === "A" && c.daysUntil <= 14);
  const compBC = competitions.filter((c) => !(c.priority === "A" && c.daysUntil <= 14));

  return (
    <div className="w-full px-6 py-6 pb-20">

      {/* ── Header ── */}
      <motion.div variants={stagger} initial="hidden" animate="show" className="mb-8">
        <motion.div variants={fadeUp}>
          <h1 className="text-xl font-extrabold tracking-tight" style={{ color: C.tx }}>
            Bonjour, {firstName}
          </h1>
          <p className="text-[12px] mt-1 capitalize" style={{ color: C.tx3 }}>
            {todayLabel} · {athletes.length} athlète{athletes.length !== 1 ? "s" : ""}
            {isCoachAthlete ? " · ton programme inclus" : ""}
          </p>
        </motion.div>

        <motion.div variants={fadeUp} className="mt-5 mb-5">
          <CitationDuJour />
        </motion.div>

        {/* Action counters */}
        <motion.div variants={fadeUp} className="mt-5 grid grid-cols-2 gap-3">
          <ActionCounter
            icon={<AlertTriangle size={16} style={{ color: C.o }} />}
            label="Manquées hier"
            count={missedSessions.length}
            loading={isLoadingMissed}
            color={missedSessions.length > 0 ? C.o : C.tx3}
            onClick={() => navigate("/coach/athletes")}
          />
          <ActionCounter
            icon={<FlaskConical size={16} style={{ color: C.b }} />}
            label="Tests à venir"
            count={upcomingTests.length}
            loading={isLoadingTests}
            color={upcomingTests.length > 0 ? C.b : C.tx3}
            onClick={() => navigate("/coach/athletes")}
          />
        </motion.div>
      </motion.div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column (2/3) ── */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="lg:col-span-2 flex flex-col gap-6">

          {/* ── Aujourd'hui ── */}
          <motion.div variants={fadeUp}>
            <SectionTitle icon={<Calendar size={11} style={{ color: "#7D7468" }} />}>Aujourd'hui</SectionTitle>
            <Card>
              {isLoadingToday ? (
                <SkeletonRows n={3} />
              ) : todayAthletes.length === 0 ? (
                <p className="text-[12px] text-center py-6" style={{ color: C.tx3 }}>
                  Aucune séance planifiée aujourd'hui
                </p>
              ) : (
                <div>
                  {todayAthletes.map((a, i) => (
                    <div
                      key={a.athleteId}
                      onClick={() => navigate(`/coach/athletes/${a.athleteId}/planning`)}
                      className="flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                      style={{
                        borderBottom: i < todayAthletes.length - 1
                          ? "1px solid rgba(231,211,168,0.1)"
                          : undefined,
                      }}
                    >
                      {/* Avatar */}
                      <Avatar
                        name={a.athleteName}
                        color={a.wellnessScore != null ? a.wellnessColor : undefined}
                      />

                      {/* Name + program */}
                      <div className="w-[130px] shrink-0 min-w-0">
                        <p className="text-[13px] font-bold truncate" style={{ color: C.tx }}>
                          {a.athleteName}
                        </p>
                        <p className="text-[10px] truncate mt-0.5" style={{ color: C.tx3 }}>
                          {/* fallback subtitle */}
                          {a.sessions[0]?.sessionName ? "—" : "Pas de séance"}
                        </p>
                      </div>

                      {/* Séance du jour */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: C.tx3 }}>
                          Séance du jour
                        </p>
                        {a.sessions.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {a.sessions.map((s) => (
                              <span key={s.id} className="flex items-center gap-1.5">
                                <span className="text-[12px]">{STATUS_ICON[s.status]}</span>
                                <span className="text-[12px] font-bold truncate max-w-[100px]" style={{ color: C.tx }}>
                                  {s.sessionName ?? "Séance"}
                                </span>
                                <StatusPill status={s.status} />
                                {s.rpeScore != null && (
                                  <span className="text-[10px] font-bold px-1.5 py-px rounded bg-[rgba(59,141,240,0.12)] text-[#33B5FF] border border-[rgba(59,141,240,0.2)]">
                                    RPE {s.rpeScore}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px]" style={{ color: C.tx3 }}>Repos</p>
                        )}
                      </div>

                      {/* Wellness */}
                      <div className="shrink-0 text-right min-w-[60px]">
                        <p className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: C.tx3 }}>
                          Wellness
                        </p>
                        <div className="flex items-center justify-end gap-1">
                          <Heart
                            size={13}
                            style={{
                              color:       a.wellnessScore != null ? a.wellnessColor : C.tx3,
                              fill:        a.wellnessScore != null ? a.wellnessColor + "50" : "none",
                              strokeWidth: 2,
                            }}
                          />
                          <span
                            className="text-[14px] font-extrabold leading-none"
                            style={{ color: a.wellnessScore != null ? a.wellnessColor : C.tx3 }}
                          >
                            {a.wellnessScore ?? "—"}
                          </span>
                        </div>
                      </div>

                      <ChevronRight size={13} style={{ color: C.tx3 }} className="shrink-0 ml-1" />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>

          {/* ── À traiter — séances manquées ── */}
          {missedSessions.length > 0 && (
            <motion.div variants={fadeUp}>
              <SectionTitle icon={<AlertTriangle size={11} style={{ color: C.o }} />}>À traiter</SectionTitle>
              <Card>
                {missedSessions.map((m, i) => (
                  <div
                    key={`${m.athleteId}_${m.date}`}
                    onClick={() => navigate(`/coach/athletes/${m.athleteId}/planning`)}
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[rgba(251,146,60,0.05)] transition-colors"
                    style={{
                      borderBottom: i < missedSessions.length - 1
                        ? "1px solid rgba(231,211,168,0.1)"
                        : undefined,
                      borderLeft: `3px solid ${C.o}`,
                    }}
                  >
                    <Avatar name={m.athleteName} color={C.o} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold" style={{ color: C.tx }}>{m.athleteName}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: C.tx3 }}>
                        {m.sessionName ?? "Séance"} — non réalisée hier
                      </p>
                    </div>
                    <ChevronRight size={13} style={{ color: C.tx3 }} />
                  </div>
                ))}
              </Card>
            </motion.div>
          )}

          {/* ── Séances à clôturer ── */}
          {unfinished.length > 0 && (
            <motion.div variants={fadeUp}>
              <SectionTitle icon={<Flag size={11} style={{ color: "#7D7468" }} />}>Séances à clôturer</SectionTitle>
              <Card>
                {unfinished.slice(0, 8).map((w, i) => {
                  const name = athleteNameById.get(w.athleteId)
                    ?? (w.athleteId === user?.id ? (profile?.full_name ?? "Moi") : "Athlète");
                  return (
                    <div
                      key={w.id}
                      onClick={() => navigate(`/coach/athletes/${w.athleteId}/planning`)}
                      className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                      style={{
                        borderBottom: i < Math.min(unfinished.length, 8) - 1
                          ? "1px solid rgba(231,211,168,0.1)"
                          : undefined,
                        borderLeft: `3px solid ${C.y}`,
                      }}
                    >
                      <Avatar name={name} color={C.y} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold" style={{ color: C.tx }}>{name}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: C.tx3 }}>
                          {w.sessionName} — {format(new Date(w.scheduledDate + "T12:00:00"), "d MMM", { locale: fr })} ·{" "}
                          {w.loggedSets} série{w.loggedSets > 1 ? "s" : ""} saisie{w.loggedSets > 1 ? "s" : ""}, jamais terminée
                        </p>
                      </div>
                      <ChevronRight size={13} style={{ color: C.tx3 }} />
                    </div>
                  );
                })}
              </Card>
            </motion.div>
          )}

          {/* ── Activité récente ── */}
          <motion.div variants={fadeUp}>
            <SectionTitle icon={<Clock size={11} style={{ color: "#7D7468" }} />}>Activité récente</SectionTitle>
            <Card>
              {loadActivity ? (
                <SkeletonRows n={4} />
              ) : activities.length === 0 ? (
                <p className="text-[12px] text-center py-6" style={{ color: C.tx3 }}>
                  Aucune activité récente
                </p>
              ) : (
                <div>
                  {activities.map((act, i) => {
                    const cfg =
                      act.type === "session"  ? { Icon: Dumbbell, bg: C.acS,  color: C.ac  } :
                      act.type === "wellness" ? { Icon: Heart,    bg: C.gS,   color: C.g   } :
                                                { Icon: Trophy,   bg: C.yS,   color: C.y   };
                    return (
                      <div
                        key={act.id}
                        onClick={() => navigate(`/coach/athletes/${act.athleteId}/planning`)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                        style={{
                          borderBottom: i < activities.length - 1
                            ? "1px solid rgba(231,211,168,0.08)"
                            : undefined,
                        }}
                      >
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: cfg.bg }}
                        >
                          <cfg.Icon size={14} style={{ color: cfg.color }} strokeWidth={2} />
                        </div>
                        <p className="flex-1 text-[12px] truncate" style={{ color: C.tx2 }}>{act.label}</p>
                        <p className="text-[11px] shrink-0" style={{ color: C.tx3 }}>
                          {formatDistanceToNow(act.updatedAt, { locale: fr, addSuffix: true })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>

          {/* Self as athlete shortcut */}
          {isCoachAthlete && user && (
            <motion.div variants={fadeUp}>
              <SectionTitle icon={<Dumbbell size={11} style={{ color: "#7D7468" }} />}>Mon programme</SectionTitle>
              <button
                onClick={() => navigate(`/coach/athletes/${user.id}/planning`)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-colors hover:border-[rgba(255,201,51,0.5)]"
                style={{ background: C.acS, border: `1px solid ${C.ac}40`, fontFamily: "inherit" }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                  style={{ background: C.ac + "22", color: C.ac, border: `1.5px solid ${C.ac}40` }}
                >
                  {initials(profile?.full_name ?? "?")}
                </div>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: C.tx }}>{profile?.full_name}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: C.ac }}>Mon programme personnel</p>
                </div>
                <ChevronRight size={14} style={{ color: C.ac }} className="ml-auto" />
              </button>
            </motion.div>
          )}

          {/* Empty state */}
          {athletes.length === 0 && !isCoachAthlete && (
            <motion.div variants={fadeUp}>
              <EmptyState
                icon={Users}
                title="Aucun athlète pour l'instant"
                description={`Code coach : ${profile?.coach_code ?? "—"} — partage-le pour que tes athlètes te rejoignent.`}
                cta={{ label: "Gérer les athlètes", onClick: () => navigate("/coach/athletes") }}
              />
            </motion.div>
          )}
        </motion.div>

        {/* ── Right column (1/3) ── */}
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">

          {/* ── À anticiper ── */}
          <motion.div variants={fadeUp}>
            <SectionTitle icon={<CalendarDays size={11} style={{ color: "#7D7468" }} />}>À anticiper</SectionTitle>
            <Card>
              {loadMargin ? (
                <SkeletonRows n={3} />
              ) : endingSoon.length === 0 ? (
                <p className="text-[11px] text-center py-5" style={{ color: C.tx3 }}>
                  Aucun cycle se terminant bientôt
                </p>
              ) : (
                <div>
                  {endingSoon.map((c, i) => {
                    const urgent = c.daysLeft <= 7;
                    const color  = urgent ? C.r : C.o;
                    return (
                      <div
                        key={c.cycleId}
                        onClick={() => navigate(`/coach/athletes/${c.athleteId}/planning`)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                        style={{
                          borderBottom: i < endingSoon.length - 1
                            ? "1px solid rgba(231,211,168,0.1)"
                            : undefined,
                        }}
                      >
                        {/* Icon */}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: color + "18" }}
                        >
                          <Layers size={15} style={{ color }} strokeWidth={2} />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold truncate" style={{ color: C.tx }}>
                            {c.athleteName} · fin du cycle
                          </p>
                          <p className="text-[10px] truncate mt-0.5" style={{ color: C.tx3 }}>
                            Dans {c.daysLeft}j · jusqu'au {format(parseISO(c.endDate), "d MMM", { locale: fr })}
                          </p>
                        </div>

                        {/* Action */}
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/coach/athletes/${c.athleteId}/planning`); }}
                          className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors"
                          style={{
                            color,
                            borderColor: color + "50",
                            background:  color + "12",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={(el) => ((el.currentTarget as HTMLElement).style.background = color + "22")}
                          onMouseLeave={(el) => ((el.currentTarget as HTMLElement).style.background = color + "12")}
                        >
                          Planifier
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>

          {/* ── Records & tests ── */}
          <motion.div variants={fadeUp}>
            <SectionTitle icon={<Medal size={11} style={{ color: "#7D7468" }} />}>Records & tests</SectionTitle>
            <Card>
              {loadRecords ? (
                <SkeletonRows n={3} />
              ) : records.length === 0 ? (
                <p className="text-[11px] text-center py-5" style={{ color: C.tx3 }}>
                  Aucun résultat récent
                </p>
              ) : (
                <div>
                  {records.map((r, i) => (
                    <div
                      key={r.id}
                      onClick={() => navigate(`/coach/athletes/${r.athleteId}/tests`)}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                      style={{
                        borderBottom: i < records.length - 1
                          ? "1px solid rgba(231,211,168,0.08)"
                          : undefined,
                      }}
                    >
                      <span className="shrink-0 leading-none flex items-center justify-center w-[18px] h-[18px]">
                        {r.coachValidated === true
                          ? <Trophy size={16} style={{ color: C.y }} />
                          : r.coachValidated === null
                            ? <Circle size={14} style={{ color: C.b }} />
                            : <BarChart3 size={16} style={{ color: C.tx3 }} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold truncate" style={{ color: C.tx }}>{r.metricName}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: C.tx3 }}>{r.athleteName}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-extrabold leading-none" style={{ color: C.ac }}>
                          {r.value}
                          <span className="text-[10px] font-normal ml-0.5" style={{ color: C.tx3 }}>{r.unit}</span>
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: C.tx3 }}>
                          {format(parseISO(r.date), "dd/MM")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>

          {/* ── Compétitions ── */}
          <motion.div variants={fadeUp}>
            <SectionTitle icon={<Trophy size={11} style={{ color: "#7D7468" }} />}>Compétitions</SectionTitle>
            <Card>
              {loadCompet ? (
                <SkeletonRows n={3} />
              ) : competitions.length === 0 ? (
                <p className="text-[11px] text-center py-5" style={{ color: C.tx3 }}>
                  Aucune compétition dans les 30 jours
                </p>
              ) : (
                <div>
                  {[...compA, ...compBC].map((c, i, arr) => {
                    const meta   = COMPETITION_META[c.type];
                    const isUrgent = compA.includes(c);
                    const color  = isUrgent ? C.r : C.tx3;
                    return (
                      <div
                        key={c.id}
                        onClick={() => navigate(`/coach/athletes/${c.athlete_id}/planning`)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                        style={{
                          borderBottom: i < arr.length - 1
                            ? "1px solid rgba(231,211,168,0.08)"
                            : undefined,
                          background: isUrgent ? C.rS : "transparent",
                        }}
                      >
                        <span className="text-[10px] font-extrabold shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: meta.color + "18", color: meta.color }}>{meta.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold truncate" style={{ color: C.tx }}>{c.name}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: C.tx3 }}>
                            {c.athleteName} · {c.priority}
                          </p>
                        </div>
                        <span
                          className="text-[12px] font-extrabold shrink-0"
                          style={{ color }}
                        >
                          J-{c.daysUntil}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}

// ── Action counter tile ────────────────────────────────────────────────────────

interface ActionCounterProps {
  icon:     React.ReactNode;
  label:    string;
  count:    number;
  loading:  boolean;
  color:    string;
  onClick?: () => void;
}

function ActionCounter({ icon, label, count, loading, color, onClick }: ActionCounterProps) {
  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-2xl border transition-all cursor-pointer"
      style={{
        background:  count > 0 ? color + "12" : "#1E1A16",
        borderColor: count > 0 ? color + "45" : "rgba(231,211,168,0.15)",
      }}
    >
      <span className="leading-none flex items-center justify-center">{icon}</span>
      {loading ? (
        <Skeleton className="h-7 w-10 rounded bg-[#27221D]" />
      ) : (
        <p className="text-[26px] font-extrabold leading-none" style={{ color: count > 0 ? color : "#7D7468" }}>
          {count}
        </p>
      )}
      <p className="text-[9px] font-bold uppercase tracking-wide text-center leading-tight" style={{ color: "#7D7468" }}>
        {label}
      </p>
    </div>
  );
}
