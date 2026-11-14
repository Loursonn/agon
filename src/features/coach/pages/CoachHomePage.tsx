/**
 * Accueil coach ordinateur — planche `Coach.dc.html` (canvas « Agon · maquettes
 * app », peps). En-tête pleine largeur sur fond « arène » : date, grand titre,
 * citation sans cadre, tuiles « Manquées hier » / « Tests à venir ». Puis le
 * bandeau Nouveauté et deux colonnes de sections numérotées.
 *
 * Styles en classes Tailwind (charte : bg-agon-*, text-agon-*) ; seules les
 * couleurs calculées (alerte, wellness, priorité) restent en ligne.
 * Breakpoints : marges et tuiles se resserrent sous `md` / `sm`, colonnes à partir de `lg`.
 */
import { useMemo, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";
import { localISO } from "@/lib/date";
import { CitationFigure } from "@/features/shared/components/CitationDuJour";
import { CoachUpdatesCard } from "@/features/coach/components/updates/CoachUpdatesCard";

// ── Petits éléments de la planche ─────────────────────────────────────────────

const KICK = "agon-mono text-[10px] uppercase tracking-[0.14em] text-agon-tx3";
/** Filet entre deux lignes d'une liste. */
const ROW_LINE = "border-b border-agon-sable/[0.08] last:border-b-0";
const PANEL = "overflow-hidden rounded-[14px] border border-agon-sable/[0.12] bg-agon-s1";
const ROW_BTN = "flex w-full cursor-pointer items-center border-0 bg-transparent text-left";
const ELLIPSIS = "overflow-hidden text-ellipsis whitespace-nowrap";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Pastille pleine (« Terminé », « RPE 7 ») ; `null` = contour neutre (« Planifié »). */
function Pill({ color, children }: { color: string | null; children: ReactNode }) {
  return (
    <span
      className={cn(
        "agon-mono flex-none whitespace-nowrap rounded-full text-[11px] font-medium uppercase leading-[1.3] tracking-[0.08em]",
        color ? "px-[9px] py-1 text-agon-ink" : "border border-agon-brd-l bg-agon-sable/[0.06] px-2 py-0.5 text-agon-tx2",
      )}
      style={color ? { background: color } : undefined}
    >
      {children}
    </span>
  );
}

/** Rond d'initiales : plein de la couleur (wellness, alerte), sinon neutre. */
function Avatar({ name, color }: { name: string; color?: string | null }) {
  const base = "agon-mono flex size-[38px] flex-none items-center justify-center rounded-full text-[12px]";
  return color
    ? <span className={cn(base, "font-medium text-agon-ink")} style={{ background: color, boxShadow: `0 0 0 3px ${alpha(color, 0.18)}` }}>{initials(name)}</span>
    : <span className={cn(base, "border border-agon-sable/[0.22] bg-agon-s2 text-agon-tx2")}>{initials(name)}</span>;
}

function SectionHead({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="agon-mono m-0 flex h-5 items-center whitespace-nowrap text-[11px] font-normal uppercase tracking-[0.12em] text-agon-tx2">
        <span className="text-agon-accent">{String(n).padStart(2, "0")} —</span>&nbsp;{children}
      </h2>
      <div className="h-px bg-agon-sable/[0.12]" />
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <SectionHead n={n}>{title}</SectionHead>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className={cn(PANEL, "px-4 py-[18px] text-center text-[12.5px] text-agon-tx3")}>{children}</div>;
}

function Loading({ n = 3 }: { n?: number }) {
  return (
    <div className={cn(PANEL, "flex flex-col gap-2 p-3.5")}>
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl bg-agon-s2" />)}
    </div>
  );
}

/** Carte d'alerte teintée (Blessé, À traiter, Alertes wellness, À clôturer…) : aplat 12 %, liseré 3 px. */
function TintCard({ color, borderAlpha = 0.42, onClick, children, compact = false }: {
  color: string; borderAlpha?: number; onClick?: () => void; children: ReactNode;
  /** Colonne de droite : espacement 14 px (12 px pour les compétitions via `gap`) et marges 16 px. */
  compact?: boolean | "tight";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center overflow-hidden rounded-[14px] border text-left text-agon-tx",
        onClick ? "cursor-pointer" : "cursor-default",
        compact ? "py-3.5 pl-[19px] pr-4" : "py-3.5 pl-[21px] pr-[18px]",
        compact === "tight" ? "gap-3" : compact ? "gap-3.5" : "gap-4",
      )}
      style={{ background: alpha(color, 0.12), borderColor: alpha(color, borderAlpha) }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      {children}
    </button>
  );
}

function TwoLines({ title, sub }: { title: ReactNode; sub: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <div className={cn(ELLIPSIS, "text-[14px] font-medium")}>{title}</div>
      <div className={cn(ELLIPSIS, "mt-0.5 text-[12px] text-agon-tx2")}>{sub}</div>
    </div>
  );
}

const Chevron = () => <ChevronRight size={16} strokeWidth={1.5} className="flex-none text-agon-tx3" aria-hidden />;

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
    ? <span aria-hidden className="size-5 flex-none rounded-[6px] border-[1.5px] border-agon-accent bg-agon-accent/[0.12]" />
    : (
      <span aria-hidden className="flex size-5 flex-none items-center justify-center rounded-[6px] bg-agon-accent">
        <Check size={13} strokeWidth={2.5} className="text-agon-ink" />
      </span>
    );
}

function WellnessBox({ score, color }: { score: number | null; color: string }) {
  const box = "agon-mono relative flex h-9 w-16 items-center justify-center overflow-hidden rounded-[8px] border text-[22px] leading-none";
  if (score == null) {
    return <span className={cn(box, "border-agon-sable/[0.12] bg-agon-sable/[0.04] text-agon-tx3")}>—</span>;
  }
  return (
    <span className={box} style={{ background: alpha(color, 0.14), borderColor: alpha(color, 0.45), color }}>
      {score}
      <span aria-hidden className="absolute bottom-0 left-0 h-[3px]" style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: color }} />
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
      <header
        className="relative overflow-hidden border-b border-agon-brd px-5 pb-7 pt-8 md:px-10 md:pb-[34px] md:pt-10"
        style={{ background: `url(/brand/agon-fond-arene-entete.svg) center/cover, ${C.bg}` }}
      >
        <div className="relative flex flex-wrap items-end justify-between gap-6 md:gap-10">
          <div className="flex min-w-0 max-w-[680px] flex-col gap-3">
            <span className="agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-accent">
              {todayLabel} · {athletes.length} athlète{athletes.length !== 1 ? "s" : ""}
              {isCoachAthlete && canCoachSelf ? " · ton programme inclus" : ""}
            </span>
            <h1 className="agon-display m-0 text-[32px] font-light leading-[1.1] tracking-[0.06em] text-agon-tx md:text-[44px]">
              Bonjour, {firstName}
            </h1>
            <CitationFigure barWidth={3} margin="8px 0 0" />
          </div>
          <div className="flex w-full gap-3 sm:w-auto">
            {tiles.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => navigate("/coach/athletes")}
                className="relative flex flex-1 cursor-pointer flex-col gap-2 overflow-hidden rounded-[14px] border py-4 pl-[21px] pr-[18px] text-left text-agon-tx sm:w-[168px] sm:flex-none"
                style={{ background: alpha(t.color, 0.12), borderColor: alpha(t.color, 0.45) }}
              >
                <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: t.color }} />
                <span className="agon-mono whitespace-nowrap text-[11px] uppercase tracking-[0.14em] text-agon-tx2">{t.label}</span>
                <span className="flex items-baseline gap-2.5">
                  {t.loading
                    ? <Skeleton className="h-12 w-10 rounded bg-agon-s2" />
                    : <span className="agon-mono text-[48px] leading-none" style={{ color: t.color }}>{t.count}</span>}
                  <span className="whitespace-nowrap text-[12px] text-agon-tx2">{t.unit}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-8 px-5 pb-12 pt-7 md:px-10">
        <CoachUpdatesCard />

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">

          {/* ── Colonne gauche (2/3) ── */}
          <div className="flex min-w-0 flex-col gap-8 lg:col-span-2">

            <Section n={nx()} title="Aujourd’hui">
              {isLoadingToday ? <Loading /> : todayAthletes.length === 0 ? (
                <Empty>Aucune séance planifiée aujourd’hui</Empty>
              ) : (
                <div className={PANEL}>
                  {todayAthletes.map((a) => (
                    <button
                      key={a.athleteId}
                      type="button"
                      onClick={() => navigate(`/coach/athletes/${a.athleteId}/planning`)}
                      className={cn(ROW_BTN, ROW_LINE, "gap-4 px-[18px] py-3.5 text-agon-tx hover:bg-[rgba(255,255,255,0.02)]")}
                    >
                      <Avatar name={a.athleteName} color={a.wellnessScore != null ? a.wellnessColor : null} />
                      <div className="w-[140px] min-w-0 flex-none">
                        <div className={cn(ELLIPSIS, "text-[14px] font-medium")}>{a.athleteName}</div>
                        <div className="text-[11px] text-agon-tx3">{a.wellnessLabel ?? "—"}</div>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                        <span className={KICK}>Séance du jour</span>
                        <div className="flex flex-col gap-1.5">
                          {a.sessions.length === 0 ? (
                            <span className="flex h-6 items-center gap-2">
                              <span aria-hidden className="size-5 flex-none rounded-[6px] border-[1.5px] border-agon-tx3 bg-agon-pierre/[0.12]" />
                              <span className="text-[13px] text-agon-tx3">Repos</span>
                            </span>
                          ) : a.sessions.map((s) => (
                            <span key={s.id} className="flex h-6 min-w-0 items-center gap-2 whitespace-nowrap">
                              <SessionBox status={s.status} />
                              <span className="overflow-hidden text-ellipsis text-[13.5px] font-medium">{s.sessionName ?? "Séance"}</span>
                              <Pill color={STATUS_PILL[s.status].color}>{STATUS_PILL[s.status].label}</Pill>
                              {s.rpeScore != null && <Pill color={rpeColor(s.rpeScore)}>RPE {s.rpeScore}</Pill>}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex w-[92px] flex-none flex-col items-end gap-[5px]">
                        <span className={KICK}>Wellness</span>
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
                <div className="flex flex-col gap-2">
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
                <div className="flex flex-col gap-2">
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
                <div className="flex flex-col gap-2">
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
                <div className="flex flex-col gap-2">
                  {unfinished.slice(0, 8).map((w) => {
                    const name = athleteNameById.get(w.athleteId)
                      ?? (w.athleteId === user?.id ? (profile?.full_name ?? "Moi") : "Athlète");
                    return (
                      <TintCard key={w.id} color={C.ac} borderAlpha={0.3} onClick={() => navigate(`/coach/athletes/${w.athleteId}/planning`)}>
                        <Avatar name={name} />
                        <TwoLines
                          title={name}
                          sub={<>
                            <span className="text-agon-accent">{w.sessionName}</span>
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
                <div className={PANEL}>
                  {activities.map((act) => {
                    const dot = act.type === "session" ? C.g : act.type === "wellness" ? C.ac : C.b;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => navigate(`/coach/athletes/${act.athleteId}/planning`)}
                        className={cn(ROW_BTN, ROW_LINE, "gap-3.5 px-[18px] py-[13px] hover:bg-[rgba(255,255,255,0.02)]")}
                      >
                        <span aria-hidden className="size-2 flex-none rounded-[2px]" style={{ background: dot }} />
                        <span className={cn(ELLIPSIS, "min-w-0 flex-1 text-[13px] text-agon-tx")}>{act.label}</span>
                        <span className="whitespace-nowrap text-[12px] text-agon-tx3">
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
              <section className="flex flex-col gap-3.5">
                <TintCard color={C.ac} borderAlpha={0.38} onClick={() => navigate(`/coach/athletes/${user.id}/planning`)}>
                  <Avatar name={profile?.full_name ?? "?"} color={C.ac} />
                  <TwoLines title={profile?.full_name} sub={<span className="text-agon-accent">Mon programme personnel</span>} />
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
          <div className="flex min-w-0 flex-col gap-8">

            <Section n={nx()} title="À anticiper">
              {loadMargin ? <Loading /> : endingSoon.length === 0 ? (
                <Empty>Aucun cycle ne se termine bientôt</Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {endingSoon.map((c) => (
                    <TintCard key={c.cycleId} color={C.ac} borderAlpha={0.38} compact onClick={() => navigate(`/coach/athletes/${c.athleteId}/planning`)}>
                      <TwoLines
                        title={`${c.athleteName} · fin du cycle`}
                        sub={<>
                          <span className="text-agon-accent">Dans <span className="agon-mono">{c.daysLeft}</span> j</span>
                          {" · jusqu’au "}{format(parseISO(c.endDate), "d MMM", { locale: fr })}
                        </>}
                      />
                      <span className="inline-flex h-[34px] flex-none items-center whitespace-nowrap rounded-[8px] bg-agon-accent px-3.5 text-[14px] font-semibold text-agon-ink">
                        Planifier
                      </span>
                    </TintCard>
                  ))}
                </div>
              )}
            </Section>

            <Section n={nx()} title="Records & tests">
              {loadRecords ? <Loading /> : records.length === 0 ? (
                <Empty>Aucun résultat récent</Empty>
              ) : (
                <div className="overflow-hidden rounded-[14px] border border-agon-amethyste/30 bg-agon-amethyste/10">
                  {records.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate(`/coach/athletes/${r.athleteId}/tests`)}
                      className={cn(ROW_BTN, ROW_LINE, "gap-3.5 px-4 py-[13px] text-agon-tx")}
                    >
                      {r.coachValidated === true ? (
                        <span aria-label="Validé" className="flex size-[26px] flex-none items-center justify-center rounded-[8px] bg-agon-succes">
                          <Check size={15} strokeWidth={2.5} className="text-agon-ink" />
                        </span>
                      ) : (
                        <span aria-label="À valider" className="size-[26px] flex-none rounded-[8px] border-[1.5px] border-dashed border-agon-amethyste bg-agon-amethyste/10" />
                      )}
                      <TwoLines title={r.metricName} sub={<span className="text-agon-tx3">{r.athleteName}</span>} />
                      <div className="flex-none text-right">
                        <div className="agon-mono whitespace-nowrap text-[20px] leading-[1.15] text-agon-accent">
                          {r.value}<span className="text-[11px] text-agon-tx2"> {r.unit}</span>
                        </div>
                        <div className="agon-mono text-[11px] text-agon-tx3">{format(parseISO(r.date), "dd/MM")}</div>
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
                <div className="flex flex-col gap-2">
                  {[...compA, ...compBC].map((c) => {
                    const urgent = compA.includes(c);
                    const prio = c.priority === "A" ? C.rouge : c.priority === "B" ? C.o : null;
                    const body = (
                      <>
                        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                          <div className={cn(ELLIPSIS, "text-[14px] font-medium")}>{c.name}</div>
                          <div className={cn(ELLIPSIS, "text-[12px] text-agon-tx2")}>{c.athleteName}</div>
                        </div>
                        <div className="flex flex-none items-center gap-3">
                          {c.priority && <Pill color={prio}>Importance {c.priority}</Pill>}
                          <span className={cn("agon-mono min-w-[52px] text-right", urgent ? "text-[22px] text-agon-rouge" : "text-[17px] text-agon-tx", "leading-none")}>
                            J-{c.daysUntil}
                          </span>
                        </div>
                      </>
                    );
                    return urgent ? (
                      <TintCard key={c.id} color={C.rouge} compact="tight" onClick={() => navigate(`/coach/athletes/${c.athlete_id}/planning`)}>
                        {body}
                      </TintCard>
                    ) : (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => navigate(`/coach/athletes/${c.athlete_id}/planning`)}
                        className={cn(PANEL, "flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left text-agon-tx")}
                      >
                        {body}
                      </button>
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
