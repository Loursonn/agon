/**
 * Accueil coach ordinateur — planche `Coach.dc.html` (canvas « Agon · maquettes
 * app », peps). En-tête pleine largeur sur fond « arène » : date, grand titre,
 * citation sans cadre, tuiles « Manquées hier » / « Tests à venir ». Puis le
 * bandeau Nouveauté et deux colonnes de sections numérotées.
 */
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { Check, ChevronRight, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/features/shared/components/EmptyState";
import { useCoachDashboard, type SessionStatus } from "@/features/shared/hooks/useCoachDashboard";
import { usePlanningMargin } from "@/features/shared/hooks/usePlanningMargin";
import { useRecentRecords } from "@/features/shared/hooks/useRecentRecords";
import { useUpcomingCompetitions } from "@/features/shared/hooks/useUpcomingCompetitions";
import { useRecentActivity } from "@/features/shared/hooks/useRecentActivity";
import { useUnfinishedWorkouts } from "@/features/shared/hooks/useUnfinishedWorkouts";
import { useWellnessAlerts } from "@/features/shared/hooks/useWellnessAlerts";
import { formatAssessment } from "@/lib/wellnessBaseline";
import { useAuth } from "@/hooks/useAuth";
import { C, alpha } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { localISO } from "@/lib/date";
import { CitationFigure } from "@/features/shared/components/CitationDuJour";
import { CoachUpdatesCard } from "@/features/coach/components/updates/CoachUpdatesCard";

// ── Petits éléments de la planche ─────────────────────────────────────────────

const KICK: CSSProperties = { ...MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 };
const ROW_LINE = "1px solid rgba(231,211,168,0.08)";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Pastille pleine (« Terminé », « RPE 7 ») ; `null` = contour neutre (« Planifié »). */
function Pill({ color, children }: { color: string | null; children: ReactNode }) {
  return (
    <span style={{
      ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap",
      flex: "none", borderRadius: 999, lineHeight: 1.3,
      ...(color
        ? { color: C.ink, background: color, padding: "4px 9px" }
        : { color: C.tx2, background: "rgba(231,211,168,0.06)", border: `1px solid ${C.brdL}`, padding: "2px 8px" }),
    }}>{children}</span>
  );
}

/** Rond d'initiales : plein de la couleur (wellness, alerte), sinon neutre. */
function Avatar({ name, color }: { name: string; color?: string | null }) {
  const base: CSSProperties = {
    width: 38, height: 38, boxSizing: "border-box", borderRadius: "50%", flex: "none",
    display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 12,
  };
  return color
    ? <span style={{ ...base, background: color, color: C.ink, fontWeight: 500, boxShadow: `0 0 0 3px ${alpha(color, 0.18)}` }}>{initials(name)}</span>
    : <span style={{ ...base, border: "1px solid rgba(231,211,168,0.22)", background: C.s2, color: C.tx2 }}>{initials(name)}</span>;
}

function SectionHead({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ margin: 0, height: 20, display: "flex", alignItems: "center", ...MONO, fontWeight: 400, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
        <span style={{ color: C.ac }}>{String(n).padStart(2, "0")} —</span>&nbsp;{children}
      </h2>
      <div style={{ height: 1, background: "rgba(231,211,168,0.12)" }} />
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionHead n={n}>{title}</SectionHead>
      {children}
    </section>
  );
}

const panel: CSSProperties = { background: C.s1, border: "1px solid rgba(231,211,168,0.12)", borderRadius: 14, overflow: "hidden" };

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ ...panel, padding: "18px 16px", fontSize: 12.5, color: C.tx3, textAlign: "center" }}>{children}</div>;
}

function Loading({ n = 3 }: { n?: number }) {
  return (
    <div style={{ ...panel, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl bg-agon-s2" />)}
    </div>
  );
}

/** Carte d'alerte teintée (Blessé, À traiter, Alertes wellness, À clôturer…) : aplat 12 %, liseré 3 px. */
function TintCard({ color, borderAlpha = 0.42, onClick, children, gap = 16, pad = "14px 18px 14px 21px" }: {
  color: string; borderAlpha?: number; onClick?: () => void; children: ReactNode; gap?: number; pad?: string;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap, padding: pad, width: "100%",
      background: alpha(color, 0.12), border: `1px solid ${alpha(color, borderAlpha)}`, borderRadius: 14,
      color: C.tx, textAlign: "left", fontFamily: "inherit", cursor: onClick ? "pointer" : "default",
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
      {children}
    </button>
  );
}

function TwoLines({ title, sub }: { title: ReactNode; sub: ReactNode }) {
  const one: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...one, fontSize: 14, fontWeight: 500 }}>{title}</div>
      <div style={{ ...one, fontSize: 12, color: C.tx2, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const Chevron = () => <ChevronRight size={16} strokeWidth={1.5} style={{ color: C.tx3, flex: "none" }} aria-hidden />;

// ── Séance du jour ────────────────────────────────────────────────────────────

const STATUS_PILL: Record<SessionStatus, { label: string; color: string | null }> = {
  planned:     { label: "Planifié", color: null },
  in_progress: { label: "En cours", color: C.b },
  completed:   { label: "Terminé",  color: C.g },
  missed:      { label: "Manqué",   color: C.rouge },
  skipped:     { label: "Sauté",    color: C.o },
};

function rpeColor(rpe: number) {
  return rpe >= 8 ? C.rouge : rpe >= 7 ? C.o : rpe >= 5 ? C.ac : C.g;
}

/** Case de la séance : pleine (cochée) une fois commencée, en contour tant qu'elle est planifiée. */
function SessionBox({ status }: { status: SessionStatus }) {
  const planned = status === "planned";
  return planned
    ? <span aria-hidden style={{ width: 20, height: 20, boxSizing: "border-box", flex: "none", borderRadius: 6, border: `1.5px solid ${C.ac}`, background: alpha(C.ac, 0.12) }} />
    : (
      <span aria-hidden style={{ width: 20, height: 20, flex: "none", borderRadius: 6, background: C.ac, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={13} strokeWidth={2.5} style={{ color: C.ink }} />
      </span>
    );
}

function WellnessBox({ score, color }: { score: number | null; color: string }) {
  const box: CSSProperties = {
    position: "relative", overflow: "hidden", width: 64, height: 36, boxSizing: "border-box", borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 22, lineHeight: 1,
  };
  if (score == null) {
    return <span style={{ ...box, background: "rgba(231,211,168,0.04)", border: "1px solid rgba(231,211,168,0.12)", color: C.tx3 }}>—</span>;
  }
  return (
    <span style={{ ...box, background: alpha(color, 0.14), border: `1px solid ${alpha(color, 0.45)}`, color }}>
      {score}
      <span aria-hidden style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${Math.max(0, Math.min(100, score))}%`, background: color }} />
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachHomePage() {
  const navigate  = useNavigate();
  const { profile, athletes, user, canCoachSelf } = useAuth();
  const isCoachAthlete = profile?.role === "coach_athlete";

  const { todayAthletes, missedSessions, upcomingTests, isLoadingToday, isLoadingMissed, isLoadingTests } = useCoachDashboard();
  const { cycles: endingSoon, isLoading: loadMargin }   = usePlanningMargin(14);
  const { records, isLoading: loadRecords }             = useRecentRecords(8);
  const { competitions, isLoading: loadCompet }         = useUpcomingCompetitions(30);
  const { activities, isLoading: loadActivity }         = useRecentActivity(8);
  const { alerts: wellnessAlerts, injuries: wellnessInjuries } = useWellnessAlerts();

  // Séances travaillées mais jamais clôturées par l'athlète : les données sont
  // là, mais le statut "planned" les exclut de l'historique et des stats.
  const athleteIds = useMemo(
    () => [...new Set([...athletes.map((a) => a.id), ...(isCoachAthlete && canCoachSelf && user ? [user.id] : [])])],
    [athletes, isCoachAthlete, canCoachSelf, user],
  );
  const { data: unfinished = [] } = useUnfinishedWorkouts(athleteIds);
  const athleteNameById = useMemo(
    () => new Map(athletes.map((a) => [a.id, a.full_name ?? "Athlète"])),
    [athletes],
  );

  const firstName  = profile?.full_name?.split(" ")[0] ?? "Coach";
  const todayLabel = format(new Date(), "EEEE d MMMM", { locale: fr });

  // Sections numérotées dans l'ordre d'affichage (les sections vides ne comptent pas)
  let sec = 0;
  const nx = () => ++sec;

  const compA  = competitions.filter((c) => c.priority === "A" && c.daysUntil <= 14);
  const compBC = competitions.filter((c) => !(c.priority === "A" && c.daysUntil <= 14));

  const tiles = [
    { label: "Manquées hier", count: missedSessions.length, unit: missedSessions.length > 1 ? "séances" : "séance", color: C.o, loading: isLoadingMissed },
    { label: "Tests à venir", count: upcomingTests.length, unit: "cette semaine", color: C.ame, loading: isLoadingTests },
  ];

  return (
    <div className="w-full pb-20">

      {/* ── En-tête sur fond « arène » ── */}
      <header style={{
        position: "relative", overflow: "hidden", padding: "40px 40px 34px", borderBottom: `1px solid ${C.brd}`,
        background: `url(/brand/agon-fond-arene-entete.svg) center/cover, ${C.bg}`,
      }}>
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 680, minWidth: 0 }}>
            <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ac }}>
              {todayLabel} · {athletes.length} athlète{athletes.length !== 1 ? "s" : ""}
              {isCoachAthlete && canCoachSelf ? " · ton programme inclus" : ""}
            </span>
            <h1 style={{ margin: 0, ...DISPLAY, fontWeight: 300, fontSize: 44, lineHeight: 1.1, letterSpacing: "0.06em", color: C.tx }}>
              Bonjour, {firstName}
            </h1>
            <CitationFigure barWidth={3} margin="8px 0 0" />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {tiles.map((t) => (
              <button key={t.label} type="button" onClick={() => navigate("/coach/athletes")} style={{
                width: 168, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, padding: "16px 18px 16px 21px",
                borderRadius: 14, position: "relative", overflow: "hidden", textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                background: alpha(t.color, 0.12), border: `1px solid ${alpha(t.color, 0.45)}`, color: C.tx,
              }}>
                <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: t.color }} />
                <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>{t.label}</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  {t.loading
                    ? <Skeleton className="h-12 w-10 rounded bg-agon-s2" />
                    : <span style={{ ...MONO, fontSize: 48, lineHeight: 1, color: t.color }}>{t.count}</span>}
                  <span style={{ fontSize: 12, color: C.tx2, whiteSpace: "nowrap" }}>{t.unit}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div style={{ padding: "28px 40px 48px", display: "flex", flexDirection: "column", gap: 32 }}>
        <CoachUpdatesCard />

        <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 32, alignItems: "start" }}>

          {/* ── Colonne gauche (2/3) ── */}
          <div className="lg:col-span-2" style={{ display: "flex", flexDirection: "column", gap: 32, minWidth: 0 }}>

            <Section n={nx()} title="Aujourd’hui">
              {isLoadingToday ? <Loading /> : todayAthletes.length === 0 ? (
                <Empty>Aucune séance planifiée aujourd’hui</Empty>
              ) : (
                <div style={panel}>
                  {todayAthletes.map((a, i) => (
                    <button
                      key={a.athleteId}
                      type="button"
                      onClick={() => navigate(`/coach/athletes/${a.athleteId}/planning`)}
                      className="hover:bg-[rgba(255,255,255,0.02)]"
                      style={{
                        display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", width: "100%",
                        background: "transparent", border: "none", borderBottom: i < todayAthletes.length - 1 ? ROW_LINE : "none",
                        color: C.tx, textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      <Avatar name={a.athleteName} color={a.wellnessScore != null ? a.wellnessColor : null} />
                      <div style={{ width: 140, flex: "none", minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.athleteName}</div>
                        <div style={{ fontSize: 11, color: C.tx3 }}>{a.wellnessLabel ?? "—"}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                        <span style={KICK}>Séance du jour</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {a.sessions.length === 0 ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 8, height: 24 }}>
                              <span aria-hidden style={{ width: 20, height: 20, boxSizing: "border-box", flex: "none", borderRadius: 6, border: `1.5px solid ${C.tx3}`, background: alpha(C.pierre, 0.12) }} />
                              <span style={{ fontSize: 13, color: C.tx3 }}>Repos</span>
                            </span>
                          ) : a.sessions.map((s) => (
                            <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, height: 24, minWidth: 0, whiteSpace: "nowrap" }}>
                              <SessionBox status={s.status} />
                              <span style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{s.sessionName ?? "Séance"}</span>
                              <Pill color={STATUS_PILL[s.status].color}>{STATUS_PILL[s.status].label}</Pill>
                              {s.rpeScore != null && <Pill color={rpeColor(s.rpeScore)}>RPE {s.rpeScore}</Pill>}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ width: 92, flex: "none", display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                        <span style={KICK}>Wellness</span>
                        <WellnessBox score={a.wellnessScore} color={a.wellnessColor} />
                      </div>
                      <Chevron />
                    </button>
                  ))}
                </div>
              )}
            </Section>

            {/* Blessé / malade — réponse du wellness (aujourd'hui ou hier) */}
            {wellnessInjuries.length > 0 && (
              <Section n={nx()} title="Blessé / malade">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {wellnessInjuries.map((a) => (
                    <TintCard key={`${a.athleteId}_${a.day}`} color={C.rouge} onClick={() => navigate(`/coach/athletes/${a.athleteId}/retours?vue=wellness`)}>
                      <Avatar name={a.athleteName} color={C.rouge} />
                      <TwoLines title={a.athleteName} sub={`${a.day === localISO() ? "Aujourd’hui" : "Hier"} — ${a.note}`} />
                      <Pill color={C.rouge}>Blessé</Pill>
                      <Chevron />
                    </TintCard>
                  ))}
                </div>
              </Section>
            )}

            {/* À traiter — séances manquées */}
            {missedSessions.length > 0 && (
              <Section n={nx()} title="À traiter">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {missedSessions.map((m) => (
                    <TintCard key={`${m.athleteId}_${m.date}`} color={C.o} onClick={() => navigate(`/coach/athletes/${m.athleteId}/planning`)}>
                      <Avatar name={m.athleteName} color={C.o} />
                      <TwoLines title={m.athleteName} sub={`${m.sessionName ?? "Séance"} — non réalisée hier`} />
                      <Pill color={C.rouge}>Manqué</Pill>
                      <Chevron />
                    </TintCard>
                  ))}
                </div>
              </Section>
            )}

            {/* Alertes wellness — écart à l'habitude de l'athlète */}
            {wellnessAlerts.length > 0 && (
              <Section n={nx()} title="Alertes wellness">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {wellnessAlerts.map((a) => {
                    const alerte = a.assessment.level === "alerte";
                    const accent = alerte ? C.rouge : C.o;
                    return (
                      <TintCard key={a.athleteId} color={accent} onClick={() => navigate(`/coach/athletes/${a.athleteId}/retours?vue=wellness`)}>
                        <Avatar name={a.athleteName} color={accent} />
                        <TwoLines
                          title={a.athleteName}
                          sub={`${formatAssessment(a.assessment)}${a.assessment.twoConsecutive ? " · 2 saisies de suite" : ""}`}
                        />
                        <Pill color={accent}>{alerte ? "Alerte" : "À surveiller"}</Pill>
                        <Chevron />
                      </TintCard>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Séances à clôturer */}
            {unfinished.length > 0 && (
              <Section n={nx()} title="Séances à clôturer">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unfinished.slice(0, 8).map((w) => {
                    const name = athleteNameById.get(w.athleteId)
                      ?? (w.athleteId === user?.id ? (profile?.full_name ?? "Moi") : "Athlète");
                    return (
                      <TintCard key={w.id} color={C.ac} borderAlpha={0.3} onClick={() => navigate(`/coach/athletes/${w.athleteId}/planning`)}>
                        <Avatar name={name} />
                        <TwoLines
                          title={name}
                          sub={<>
                            <span style={{ color: C.ac }}>{w.sessionName}</span>
                            {" — "}{format(new Date(w.scheduledDate + "T12:00:00"), "d MMM", { locale: fr })} ·{" "}
                            {w.loggedSets} série{w.loggedSets > 1 ? "s" : ""} saisie{w.loggedSets > 1 ? "s" : ""}, jamais terminée
                          </>}
                        />
                        <Chevron />
                      </TintCard>
                    );
                  })}
                </div>
              </Section>
            )}

            <Section n={nx()} title="Activité récente">
              {loadActivity ? <Loading n={4} /> : activities.length === 0 ? (
                <Empty>Aucune activité récente</Empty>
              ) : (
                <div style={panel}>
                  {activities.map((act, i) => {
                    const dot = act.type === "session" ? C.g : act.type === "wellness" ? C.ac : C.b;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => navigate(`/coach/athletes/${act.athleteId}/planning`)}
                        className="hover:bg-[rgba(255,255,255,0.02)]"
                        style={{
                          display: "flex", alignItems: "center", gap: 14, padding: "13px 18px", width: "100%",
                          background: "transparent", border: "none", borderBottom: i < activities.length - 1 ? ROW_LINE : "none",
                          textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                        }}
                      >
                        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: dot, flex: "none" }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.tx, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{act.label}</span>
                        <span style={{ fontSize: 12, color: C.tx3, whiteSpace: "nowrap" }}>
                          {formatDistanceToNow(act.updatedAt, { locale: fr, addSuffix: true })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            {/* Raccourci vers son propre programme (coach-athlète) */}
            {isCoachAthlete && canCoachSelf && user && (
              <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <TintCard color={C.ac} borderAlpha={0.38} onClick={() => navigate(`/coach/athletes/${user.id}/planning`)}>
                  <Avatar name={profile?.full_name ?? "?"} color={C.ac} />
                  <TwoLines title={profile?.full_name} sub={<span style={{ color: C.ac }}>Mon programme personnel</span>} />
                  <Chevron />
                </TintCard>
              </section>
            )}

            {athletes.length === 0 && !isCoachAthlete && (
              <EmptyState
                icon={Users}
                title="Aucun athlète pour l'instant"
                description={`Code coach : ${profile?.coach_code ?? "—"} — partage-le pour que tes athlètes te rejoignent.`}
                cta={{ label: "Gérer les athlètes", onClick: () => navigate("/coach/athletes") }}
              />
            )}
          </div>

          {/* ── Colonne droite (1/3) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 32, minWidth: 0 }}>

            <Section n={nx()} title="À anticiper">
              {loadMargin ? <Loading /> : endingSoon.length === 0 ? (
                <Empty>Aucun cycle ne se termine bientôt</Empty>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {endingSoon.map((c) => (
                    <TintCard key={c.cycleId} color={C.ac} borderAlpha={0.38} gap={14} pad="14px 16px 14px 19px" onClick={() => navigate(`/coach/athletes/${c.athleteId}/planning`)}>
                      <TwoLines
                        title={`${c.athleteName} · fin du cycle`}
                        sub={<>
                          <span style={{ color: C.ac }}>Dans <span style={MONO}>{c.daysLeft}</span> j</span>
                          {" · jusqu’au "}{format(parseISO(c.endDate), "d MMM", { locale: fr })}
                        </>}
                      />
                      <span style={{
                        height: 34, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 8, flex: "none",
                        background: C.ac, color: C.ink, fontWeight: 600, fontSize: 14, whiteSpace: "nowrap",
                      }}>Planifier</span>
                    </TintCard>
                  ))}
                </div>
              )}
            </Section>

            <Section n={nx()} title="Records & tests">
              {loadRecords ? <Loading /> : records.length === 0 ? (
                <Empty>Aucun résultat récent</Empty>
              ) : (
                <div style={{ background: alpha(C.ame, 0.1), border: `1px solid ${alpha(C.ame, 0.3)}`, borderRadius: 14, overflow: "hidden" }}>
                  {records.map((r, i) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate(`/coach/athletes/${r.athleteId}/tests`)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", width: "100%",
                        background: "transparent", border: "none", borderBottom: i < records.length - 1 ? ROW_LINE : "none",
                        color: C.tx, textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      {r.coachValidated === true ? (
                        <span aria-label="Validé" style={{ width: 26, height: 26, flex: "none", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: C.g }}>
                          <Check size={15} strokeWidth={2.5} style={{ color: C.ink }} />
                        </span>
                      ) : (
                        <span aria-label="À valider" style={{ width: 26, height: 26, boxSizing: "border-box", flex: "none", borderRadius: 8, border: `1.5px dashed ${C.ame}`, background: alpha(C.ame, 0.1) }} />
                      )}
                      <TwoLines title={r.metricName} sub={<span style={{ color: C.tx3 }}>{r.athleteName}</span>} />
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div style={{ ...MONO, fontSize: 20, lineHeight: 1.15, color: C.ac, whiteSpace: "nowrap" }}>
                          {r.value}<span style={{ fontSize: 11, color: C.tx2 }}> {r.unit}</span>
                        </div>
                        <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{format(parseISO(r.date), "dd/MM")}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Section>

            <Section n={nx()} title="Compétitions">
              {loadCompet ? <Loading /> : competitions.length === 0 ? (
                <Empty>Aucune compétition dans les 30 jours</Empty>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[...compA, ...compBC].map((c) => {
                    const urgent = compA.includes(c);
                    const prio = c.priority === "A" ? C.rouge : c.priority === "B" ? C.o : null;
                    const body = (
                      <>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.athleteName}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
                          {c.priority && <Pill color={prio}>Importance {c.priority}</Pill>}
                          <span style={{ ...MONO, fontSize: urgent ? 22 : 17, lineHeight: 1, color: urgent ? C.rouge : C.tx, minWidth: 52, textAlign: "right" }}>J-{c.daysUntil}</span>
                        </div>
                      </>
                    );
                    return urgent ? (
                      <TintCard key={c.id} color={C.rouge} gap={12} pad="14px 16px 14px 19px" onClick={() => navigate(`/coach/athletes/${c.athlete_id}/planning`)}>
                        {body}
                      </TintCard>
                    ) : (
                      <button key={c.id} type="button" onClick={() => navigate(`/coach/athletes/${c.athlete_id}/planning`)} style={{
                        ...panel, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", width: "100%",
                        color: C.tx, textAlign: "left", fontFamily: "inherit", cursor: "pointer",
                      }}>{body}</button>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
