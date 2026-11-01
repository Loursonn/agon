import { useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, ChevronRight, Video } from "lucide-react";
import { C } from "@/lib/theme";
import { BATTERY_SESSIONS, addDaysIso, mondayOf, type AthleteTestProfile, type BatteryResult } from "@/lib/hyrox/tests";
import {
  useBatteryCalendar, useCancelTestWeek, useHyroxBattery, useHyroxBatteryResults,
  type BatteryCalendarRow, type BatteryTest,
} from "@/features/shared/hooks/hyrox/useHyroxTests";
import { ListSkeleton } from "@/features/shared/components/skeletons";
import TestEntryDrawer from "./TestEntryDrawer";
import ScheduleTestWeekDrawer from "./ScheduleTestWeekDrawer";
import { Btn, Card, Muted } from "./ui";
import { displayEntry, fmtDate } from "./format";

interface Props {
  athleteId: string;
  /** coach : saisit tout ; athlete : saisit les tests en auto-saisie seulement. */
  mode: "coach" | "athlete";
  readOnly?: boolean;
  profile: AthleteTestProfile | null;
}

function summary(test: BatteryTest, r: BatteryResult): string {
  return test.test_variables
    .filter(v => r.values[v.key] != null && !/^r\d_t\d$/.test(v.key))
    .slice(0, 4)
    .map(v => `${v.label} ${displayEntry(r.values[v.key], v.value_type)}${v.unit === "s" && r.values[v.key] >= 60 ? "" : ` ${v.unit}`}`)
    .join(" · ");
}

/** Planning de la semaine de bilan : séances S1 à S5 + semaine 1, protocole, vidéo, saisie. */
export default function BatteryPlan({ athleteId, mode, readOnly, profile }: Props) {
  const { data: tests = [], isLoading } = useHyroxBattery();
  const { data: results = [] } = useHyroxBatteryResults(athleteId);
  const [open, setOpen] = useState<string | null>(null);
  const [entry, setEntry] = useState<BatteryTest | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const names = useMemo(() => tests.map(t => t.name), [tests]);
  const { data: calendar = [] } = useBatteryCalendar(athleteId, names);
  const canSchedule = mode === "coach" && !readOnly;

  // Prochaine date prévue (pas encore faite) de chaque test, par titre.
  const plannedByName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of calendar) if (!r.completed && !m.has(r.title.toLowerCase())) m.set(r.title.toLowerCase(), r.date);
    return m;
  }, [calendar]);

  const latest = useMemo(() => {
    const m = new Map<string, BatteryResult>();
    for (const r of results) if (!m.has(r.test_definition_id)) m.set(r.test_definition_id, r); // déjà triés du plus récent
    return m;
  }, [results]);

  if (isLoading) return <ListSkeleton rows={4} />;
  if (!tests.length)
    return <Muted>La batterie de tests HYROX n'est pas encore installée sur cette base (migration en attente).</Muted>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {canSchedule && (
        <ScheduledWeeks athleteId={athleteId} calendar={calendar} onSchedule={() => setScheduling(true)} />
      )}
      {BATTERY_SESSIONS.map(s => {
        const list = tests.filter(t => t.battery_session === s.key);
        const done = list.filter(t => latest.has(t.id)).length;
        return (
          <Card key={s.key} style={{ padding: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid " + C.brd, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}><span style={{ color: C.ac }}>{s.day}</span> · {s.label}</div>
                <Muted>{s.detail}</Muted>
              </div>
              <span style={{ fontSize: 11, color: done === list.length && list.length ? C.g : C.tx3, fontWeight: 700 }}>{done}/{list.length}</span>
            </div>
            {list.map(t => {
              const r = latest.get(t.id);
              const isOpen = open === t.id;
              const canFill = !readOnly && (mode === "coach" || t.fill_mode === "self");
              return (
                <div key={t.id} style={{ borderBottom: "1px solid " + C.brd }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : t.id)}
                      aria-expanded={isOpen}
                      style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                    >
                      {isOpen ? <ChevronDown size={14} color={C.tx3} /> : <ChevronRight size={14} color={C.tx3} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: r ? C.tx2 : C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r
                            ? `${fmtDate(r.performed_at)} · ${summary(t, r)}`
                            : plannedByName.has(t.name.toLowerCase())
                              ? `Prévu le ${fmtDate(plannedByName.get(t.name.toLowerCase())!)}`
                              : "Pas encore fait"}
                        </div>
                      </div>
                    </button>
                    {canFill ? (
                      <Btn small primary={!r} onClick={() => setEntry(t)}>{r ? "Refaire" : "Saisir"}</Btn>
                    ) : mode === "athlete" && t.fill_mode === "coach" ? (
                      <Muted>Saisi par ton coach</Muted>
                    ) : null}
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 16px 12px 36px" }}>
                      {t.protocol?.text && <div style={{ fontSize: 12, color: C.tx2, lineHeight: 1.55 }}>{t.protocol.text}</div>}
                      {t.protocol?.video && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 11, color: C.tx3 }}>
                          <Video size={12} /> {t.protocol.video}
                        </div>
                      )}
                      {t.media_url && (
                        <a href={t.media_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: C.ac, display: "inline-block", marginTop: 6 }}>
                          Voir la démonstration
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}
      <TestEntryDrawer athleteId={athleteId} test={entry} previous={entry ? latest.get(entry.id) : undefined} profile={profile} onClose={() => setEntry(null)} />
      {canSchedule && (
        <ScheduleTestWeekDrawer open={scheduling} athleteId={athleteId} tests={tests} calendar={calendar} onClose={() => setScheduling(false)} />
      )}
    </div>
  );
}

/**
 * Bouton « Programmer la semaine de tests » et semaines déjà programmées.
 * « Annuler la semaine » ne retire que les tests pas encore faits : un résultat
 * saisi n'est jamais effacé d'ici.
 */
function ScheduledWeeks({ athleteId, calendar, onSchedule }: { athleteId: string; calendar: BatteryCalendarRow[]; onSchedule: () => void }) {
  const cancel = useCancelTestWeek(athleteId);
  const [confirm, setConfirm] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const m = new Map<string, BatteryCalendarRow[]>();
    for (const r of calendar) {
      if (r.completed) continue;
      const k = mondayOf(r.date);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [calendar]);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Semaine de tests dans le calendrier</div>
          <Muted>Pose les séances 1 à 5 dans le calendrier de l'athlète, à faire. Il saisit ses résultats depuis son calendrier ou ici.</Muted>
        </div>
        <Btn primary onClick={onSchedule}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><CalendarPlus size={14} /> Programmer la semaine de tests</span>
        </Btn>
      </div>
      {weeks.map(([monday, rows]) => (
        <div key={monday} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10, paddingTop: 10, borderTop: "1px solid " + C.brd }}>
          <div style={{ flex: 1, minWidth: 180, fontSize: 12, color: C.tx2 }}>
            Semaine du {fmtDate(monday)} au {fmtDate(addDaysIso(monday, 6))} · {rows.length} test{rows.length > 1 ? "s" : ""} à faire
          </div>
          {confirm === monday ? (
            <>
              <Muted>Retirer ces {rows.length} tests du calendrier ?</Muted>
              <Btn small onClick={() => setConfirm(null)}>Garder</Btn>
              <Btn
                small
                disabled={cancel.isPending}
                style={{ color: C.r, borderColor: C.r }}
                onClick={() => cancel.mutate(rows.map(r => r.id), { onSuccess: () => setConfirm(null) })}
              >
                {cancel.isPending ? "Retrait…" : "Retirer"}
              </Btn>
            </>
          ) : (
            <Btn small onClick={() => setConfirm(monday)}>Annuler la semaine</Btn>
          )}
        </div>
      ))}
    </Card>
  );
}
