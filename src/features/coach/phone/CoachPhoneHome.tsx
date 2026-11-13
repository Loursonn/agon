import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR, ROUGE } from "@/lib/peps";
import { useAuth } from "@/hooks/useAuth";
import { useCoachDashboard, type SessionStatus } from "@/features/shared/hooks/useCoachDashboard";
import { useWellnessAlerts } from "@/features/shared/hooks/useWellnessAlerts";
import { useUnfinishedWorkouts } from "@/features/shared/hooks/useUnfinishedWorkouts";
import { useUpcomingCompetitions } from "@/features/shared/hooks/useUpcomingCompetitions";
import { formatAssessment } from "@/lib/wellnessBaseline";
import { localIsoDay, addDays } from "@shared/domain/dates";
import { Avatar, CARD, DISPLAY, KICKER, MONO, PhonePage, Section, Tag, dash, rowLine, shortDate } from "./phoneUi";
import { useCoachDayWorkouts, yesterdayIso } from "./useCoachPhoneDay";

const STATUS_LABEL: Record<SessionStatus, string> = {
  planned: "Planifié", in_progress: "En cours", completed: "Terminé", missed: "Manqué", skipped: "Sauté",
};

interface Todo { key: string; athleteId: string; name: string; tag: string; color: string; text: string; action: string; to: string }

function Counter({ value, label, color }: { value: number | null; label: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}` }}>
      <div style={{ ...MONO, fontSize: 24, lineHeight: 1.1, color }}>{value == null ? "—" : value}</div>
      <div style={{ fontSize: 11.5, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
    </div>
  );
}

function TodoCard({ t, onOpen }: { t: Todo; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} style={{
      position: "relative", display: "flex", gap: 12, alignItems: "center", padding: "12px 14px 12px 16px", borderRadius: 14,
      background: `radial-gradient(120% 100% at 100% 0%, ${alpha(t.color, 0.11)}, transparent 60%), ${C.s1}`,
      border: `1px solid ${alpha(t.color, 0.27)}`, overflow: "hidden", textAlign: "left", color: C.tx, fontFamily: "inherit", cursor: "pointer", width: "100%",
    }}>
      <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: t.color }} />
      <Avatar name={t.name} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
          <Tag color={t.color} filled>{t.tag}</Tag>
        </div>
        <div style={{ fontSize: 12, color: C.tx2, marginTop: 3 }}>{t.text}</div>
        <div style={{ fontSize: 12, color: C.ac, marginTop: 6 }}>{t.action} ›</div>
      </div>
    </button>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <div style={{ ...CARD, padding: "4px 14px" }}>{children}</div>;
}


/**
 * Accueil coach sur téléphone (planche CoachPhoneAccueil) : à traiter, hier
 * (fait / pas fait avec les retours), aujourd'hui, compétitions.
 */
export default function CoachPhoneHome() {
  const navigate = useNavigate();
  const { profile, athletes } = useAuth();
  const today = localIsoDay();
  const yesterday = yesterdayIso();
  const { todayAthletes, missedSessions, upcomingTests, isLoadingToday } = useCoachDashboard();
  const { alerts, injuries } = useWellnessAlerts();
  const ids = useMemo(() => athletes.map((a) => a.id), [athletes]);
  const { data: unfinished = [] } = useUnfinishedWorkouts(ids);
  const { competitions } = useUpcomingCompetitions(45);
  const yQ = useCoachDayWorkouts(yesterday);

  const nameOf = useMemo(() => new Map(athletes.map((a) => [a.id, a.full_name])), [athletes]);
  const firstName = (profile?.first_name || profile?.full_name?.split(" ")[0] || "coach").trim();

  // ── 01 À traiter : blessé > alerte > manquée hier > à clôturer ──────────────
  const todos = useMemo<Todo[]>(() => {
    const out: Todo[] = [];
    for (const i of injuries) {
      out.push({ key: `inj-${i.athleteId}`, athleteId: i.athleteId, name: i.athleteName, tag: "Blessé", color: ROUGE, text: i.note, action: "Ouvrir et adapter", to: `/coach/athletes/${i.athleteId}/planning` });
    }
    for (const a of alerts) {
      if (out.some((o) => o.athleteId === a.athleteId && o.tag === "Blessé")) continue;
      const red = a.assessment.level === "alerte";
      out.push({
        key: `al-${a.athleteId}`, athleteId: a.athleteId, name: a.athleteName, tag: red ? "Alerte" : "Vigilance", color: red ? ROUGE : C.o,
        text: formatAssessment(a.assessment) + (a.assessment.twoConsecutive ? " · 2 saisies de suite" : ""),
        action: "Voir le wellness", to: `/coach/athletes/${a.athleteId}/wellness`,
      });
    }
    for (const m of missedSessions) {
      out.push({ key: `mi-${m.athleteId}-${m.date}-${m.sessionName}`, athleteId: m.athleteId, name: m.athleteName, tag: "Manquée", color: C.o, text: `${m.sessionName ?? "Séance"} non réalisée hier`, action: "Replanifier", to: `/coach/athletes/${m.athleteId}/planning` });
    }
    for (const w of unfinished.slice(0, 8)) {
      out.push({ key: `un-${w.id}`, athleteId: w.athleteId, name: nameOf.get(w.athleteId) ?? "—", tag: "À clôturer", color: C.o, text: `${w.sessionName || "Séance"} du ${shortDate(w.scheduledDate).toLowerCase()} jamais terminée`, action: "Clôturer", to: `/coach/athletes/${w.athleteId}/planning` });
    }
    return out;
  }, [injuries, alerts, missedSessions, unfinished, nameOf]);

  // ── 02 Hier : une ligne par athlète (sa première séance), repos sinon ───────
  const yesterdayRows = useMemo(() => {
    const logs = yQ.data ?? [];
    const rows = athletes.map((a) => {
      const mine = logs.filter((l) => l.athlete_id === a.id && l.status !== "skipped");
      const done = mine.find((l) => l.status === "completed") ?? null;
      return { athlete: a, log: done ?? mine[0] ?? null };
    });
    // Faites d'abord, puis non faites, puis repos.
    const rank = (r: (typeof rows)[number]) => (!r.log ? 2 : r.log.status === "completed" ? 0 : 1);
    return rows.sort((x, y) => rank(x) - rank(y));
  }, [yQ.data, athletes]);
  const withSession = yesterdayRows.filter((r) => r.log).length;
  const doneCount = yesterdayRows.filter((r) => r.log?.status === "completed").length;

  // ── 03 Aujourd'hui ─────────────────────────────────────────────────────────
  const todayRows = useMemo(() => {
    const byId = new Map(todayAthletes.map((t) => [t.athleteId, t]));
    return athletes.map((a) => ({ athlete: a, t: byId.get(a.id) ?? null }));
  }, [todayAthletes, athletes]);

  const weekEnd = addDays(today, 7);
  const testsWeek = upcomingTests.filter((t) => t.date <= weekEnd).length;
  const open = (to: string) => navigate(to);

  return (
    <PhonePage>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 28 }}>
        <span style={KICKER}>{shortDate(today)} · {athletes.length} athlète{athletes.length > 1 ? "s" : ""}</span>
      </div>
      <h1 style={{ margin: 0, ...DISPLAY, fontSize: 22 }}>Bonjour, {firstName}</h1>
      <div style={{ display: "flex", gap: 8 }}>
        <Counter value={todos.length} label="À traiter" color={ROUGE} />
        <Counter value={missedSessions.length} label="Manquée hier" color={C.o} />
        <Counter value={testsWeek} label="Tests semaine" color={TYPE_COLOR.test} />
      </div>

      <Section n={1} title="À traiter" count={todos.length || undefined}>
        {todos.length === 0 ? (
          <div style={{ ...CARD, padding: "14px", fontSize: 13, color: C.tx2 }}>Rien à traiter ce matin.</div>
        ) : todos.map((t) => <TodoCard key={t.key} t={t} onOpen={() => open(t.to)} />)}
      </Section>

      <Section
        n={2}
        title={`Hier · ${shortDate(yesterday).toLowerCase()}`}
        right={withSession > 0 ? <span style={{ ...MONO, fontSize: 11, color: C.g }}>{doneCount} / {withSession} FAITES</span> : undefined}
      >
        {athletes.length === 0 ? null : (
          <Rows>
            {yesterdayRows.map((r, i) => {
              const l = r.log;
              const done = l?.status === "completed";
              return (
                <button key={r.athlete.id} type="button" onClick={() => open(`/coach/athletes/${r.athlete.id}/planning`)} style={{
                  display: "flex", gap: 10, padding: "10px 0", width: "100%", textAlign: "left",
                  background: "none", border: "none", boxShadow: rowLine(i),
                  color: C.tx, fontFamily: "inherit", cursor: "pointer",
                }}>
                  <span aria-hidden style={{
                    width: 22, height: 22, flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                    background: !l ? "transparent" : done ? C.g : alpha(ROUGE, 0.15), color: !l ? C.tx3 : done ? C.bg : ROUGE,
                    border: !l ? `1px solid ${C.brdL}` : "none",
                  }}>{!l ? "" : done ? "✓" : "✕"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500, color: l ? C.tx : C.tx2 }}>{r.athlete.full_name}</span>
                      {done && l?.rpe_score != null && <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>RPE {l.rpe_score}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden" }}>
                      {l && <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: TYPE_COLOR.muscu, flex: "none" }} />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{l ? l.session_name : "Repos"}</span>
                    </div>
                    {l && l.notes ? (
                      <div style={{ fontSize: 12, color: C.tx, marginTop: 3 }}>« {l.notes} »</div>
                    ) : l && !done ? (
                      <div style={{ fontSize: 12, color: C.tx3, marginTop: 3 }}>Non réalisée · pas de message</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </Rows>
        )}
      </Section>

      <Section n={3} title="Aujourd’hui" right={<span style={KICKER}>Wellness</span>}>
        {athletes.length > 0 && (
          <Rows>
            {todayRows.map(({ athlete, t }, i) => {
              const s = t?.sessions[0] ?? null;
              return (
                <button key={athlete.id} type="button" onClick={() => open(`/coach/athletes/${athlete.id}/planning`)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 0", width: "100%", textAlign: "left",
                  background: "none", border: "none", boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", cursor: "pointer",
                }}>
                  <Avatar name={athlete.full_name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{athlete.full_name}</div>
                    <div style={{ fontSize: 12, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s ? s.sessionName ?? "Séance" : "Repos"}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>{s ? STATUS_LABEL[s.status] : isLoadingToday ? "" : "Repos"}</span>
                  <span style={{ ...MONO, fontSize: 14, minWidth: 26, textAlign: "right", color: t?.wellnessScore != null ? t.wellnessColor : C.tx3 }}>
                    {dash(t?.wellnessScore)}
                  </span>
                </button>
              );
            })}
          </Rows>
        )}
      </Section>

      {competitions.length > 0 && (
        <Section n={4} title="Compétitions">
          <Rows>
            {competitions.slice(0, 6).map((c, i) => (
              <button key={c.id} type="button" onClick={() => open(`/coach/athletes/${c.athlete_id}/planning`)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "11px 0", width: "100%", textAlign: "left",
                background: "none", border: "none", boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", cursor: "pointer",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: C.tx2 }}>{c.athleteName}{c.priority ? ` · ${c.priority}` : ""}</div>
                </div>
                <Tag color={c.priority === "A" ? ROUGE : C.tx2} filled={c.priority === "A"}>{c.daysUntil === 0 ? "Jour J" : `J-${c.daysUntil}`}</Tag>
              </button>
            ))}
          </Rows>
        </Section>
      )}
    </PhonePage>
  );
}
