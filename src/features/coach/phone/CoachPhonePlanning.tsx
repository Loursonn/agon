import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR, dayTint } from "@/lib/peps";
import {
  useUnifiedCalendar, type UnifiedCalendarEvent,
} from "@/features/shared/hooks/useUnifiedCalendar";
import { useDayThemesRange } from "@/features/shared/hooks/useDayThemes";
import { useLoadWeeks } from "@/features/shared/hooks/useLoadWeeks";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { indexDayThemesByDate } from "@/lib/dayTheme";
import { mondayOf } from "@/lib/trainingLoadWeek";
import { ratioZone, LOAD_PARAMS } from "@shared/domain/trainingLoad";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { CARD, Chevron, MONO, PhonePage, fmtDec, rowLine } from "./phoneUi";
import { CoachPhoneSessionSheet } from "./CoachPhoneSessionSheet";
import { isDone, labelOf, typeOf, usePhoneEventActions } from "./usePhoneEventActions";
import { useCurrentCycle } from "./CoachPhoneAthleteHeader";
import { CompetitionActions, type CompetitionActionTarget } from "@/features/shared/components/CompetitionActions";
import { cancelledByLabel } from "@shared/domain/competitions";
import { useAuth } from "@/hooks/useAuth";
import { useCreateTestSession } from "@/features/shared/hooks/useUnifiedCalendar";
import { PhoneTestPicker } from "./PhoneTestPicker";

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SHOWN: UnifiedCalendarEvent["type"][] = ["workout", "energy", "test", "competition", "free_activity"];
const STATUS: Record<string, string> = { completed: "Fait", missed: "Manquée", in_progress: "En cours", skipped: "Repos", cancelled: "Annulée" };

function StatTile({ label, value, unit, sub, color = C.tx }: { label: string; value: string; unit?: string; sub: string; color?: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 12, background: C.s1, border: `1px solid ${C.brd}`, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.tx3, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ whiteSpace: "nowrap" }}>
        <span style={{ ...MONO, fontSize: 20, color }}>{value}</span>
        {unit && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}> {unit}</span>}
      </div>
      <div style={{ fontSize: 10.5, color: C.tx2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
    </div>
  );
}

/**
 * Planning d'un athlète sur téléphone (planche CoachPhonePlanning) : une
 * semaine, 3 chiffres (séances, course, ratio de charge), une ligne par jour ;
 * toucher une séance ouvre la feuille Déplacer / Modifier ; toucher une
 * compétition ouvre Annuler / Rétablir / Supprimer.
 */
export default function CoachPhonePlanning() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const today = localIsoDay();
  const [offset, setOffset] = useState(0);
  const monday = addDays(mondayOf(today), offset * 7);
  const sunday = addDays(monday, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  const cal = useUnifiedCalendar(athleteId, { start: monday, end: sunday });
  const themes = useDayThemesRange(athleteId, monday, sunday);
  const themeByDay = useMemo(() => indexDayThemesByDate(themes.data), [themes.data]);
  const load = useLoadWeeks(athleteId, monday, 2);
  const { cycle, weeks } = useCurrentCycle(athleteId, monday);
  const cycleWeek = useMemo(() => {
    const i = weeks.findIndex((w) => w.start_date <= addDays(monday, 3) && addDays(monday, 3) <= w.end_date);
    return i >= 0 ? i + 1 : null;
  }, [weeks, monday]);

  const [selected, setSelected] = useState<UnifiedCalendarEvent | null>(null);
  const [addDay, setAddDay] = useState<string | null>(null);
  const [compSel, setCompSel] = useState<UnifiedCalendarEvent | null>(null);

  const events = useMemo(
    () => (cal.data ?? []).filter((e) => SHOWN.includes(e.type) && e.status !== "skipped"),
    [cal.data],
  );
  const byDay = useMemo(() => {
    const m: Record<string, UnifiedCalendarEvent[]> = {};
    for (const e of events) (m[e.date] ??= []).push(e);
    return m;
  }, [events]);
  const busyDays = useMemo(() => new Set(Object.keys(byDay)), [byDay]);

  // ── Chiffres de la semaine (charge YOXX) ───────────────────────────────────
  const cur = load.data?.weeks[load.data.weeks.length - 1] ?? null;
  const prev = load.data && load.data.weeks.length > 1 ? load.data.weeks[load.data.weeks.length - 2] : null;
  const nSessions = events.filter((e) => e.type === "workout" || e.type === "energy").length;
  const nPrev = prev ? prev.sessions.filter((s) => s.planned !== null || s.done !== null).length : null;
  const zone = ratioZone(cur?.ratio ?? null);
  const [lo, hi] = LOAD_PARAMS.acwrZone;

  const close = () => setSelected(null);
  const { actionsFor, pending, assign, coachId } = usePhoneEventActions(athleteId, close);
  const createTest = useCreateTestSession();

  const weekTitle = cycle && cycleWeek ? `Semaine ${cycleWeek}` : offset === 0 ? "Cette semaine" : `Semaine du ${Number(monday.slice(8))}`;
  const range = `${Number(monday.slice(8))} → ${new Date(sunday + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
  const navBtn: React.CSSProperties = { background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" };

  return (
    <PhonePage gap={10} style={{ paddingTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 34 }}>
        <button type="button" aria-label="Semaine précédente" style={navBtn} onClick={() => setOffset((o) => o - 1)}><Chevron dir="left" color={C.tx2} size={20} /></button>
        <button type="button" onClick={() => setOffset(0)} style={{ textAlign: "center", background: "none", border: "none", color: C.tx, fontFamily: "inherit", cursor: "pointer" }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{weekTitle}</div>
          <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{range}</div>
        </button>
        <button type="button" aria-label="Semaine suivante" style={navBtn} onClick={() => setOffset((o) => o + 1)}><Chevron color={C.tx2} size={20} /></button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <StatTile label="Séances" value={String(nSessions)} sub={nPrev != null ? `${nSessions - nPrev >= 0 ? "+" : ""}${nSessions - nPrev} vs sem. préc.` : "—"} />
        <StatTile label="Course" value={cur ? fmtDec(cur.km.total, 0) : "—"} unit="km" sub={cur?.kmVariationPct != null ? `${cur.kmVariationPct >= 0 ? "+" : ""}${Math.round(cur.kmVariationPct)} % vs sem. préc.` : "—"} />
        <StatTile label="Ratio charge" value={cur?.ratio != null ? fmtDec(cur.ratio, 2) : "—"} sub={`zone ${fmtDec(lo, 1)}–${fmtDec(hi, 1)}`} color={zone === "in" ? C.g : zone ? C.o : C.tx} />
      </div>

      {cal.isError && <div style={{ fontSize: 12, color: C.o }}>Planning : lecture impossible.</div>}

      {days.map((d, i) => {
        const list = byDay[d] ?? [];
        const tint = dayTint(themeByDay[d]);
        const isToday = d === today;
        return (
          <div key={d} style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
            <div style={{ width: 44, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 4 }}>
              <span style={{ fontSize: 11, color: isToday ? C.ac : C.tx3 }}>{DOW[i]}</span>
              <span style={{ ...MONO, fontSize: 18, color: isToday ? C.ac : C.tx }}>{Number(d.slice(8))}</span>
              {tint && <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: tint, marginTop: 3 }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {list.length === 0 ? (
                d >= today ? (
                  <button type="button" onClick={() => setAddDay(d)} style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12,
                    border: `1px solid ${C.brdL}`, color: C.tx, fontSize: 13, background: "transparent", fontFamily: "inherit", cursor: "pointer",
                  }}>+ Ajouter</button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", height: 46, padding: "0 14px", borderRadius: 12, background: C.s1, color: C.tx3, fontSize: 13 }}>Repos</div>
                )
              ) : list.map((e) => {
                const col = TYPE_COLOR[typeOf(e)];
                const sel = selected?.id === e.id;
                const st = e.status ? STATUS[e.status] : undefined;
                const clickable = e.type !== "free_activity";
                const cancelled = e.status === "cancelled";
                return (
                  <button
                    key={`${e.type}-${e.id}`}
                    type="button"
                    disabled={!clickable}
                    onClick={() => (e.type === "competition" ? setCompSel(e) : setSelected(e))}
                    style={{
                      position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px 14px", borderRadius: 12,
                      background: alpha(col, sel ? 0.15 : 0.08), border: `1px ${cancelled ? "dashed" : "solid"} ${sel ? col : alpha(col, 0.27)}`, overflow: "hidden",
                      textAlign: "left", color: C.tx, fontFamily: "inherit", cursor: clickable ? "pointer" : "default", width: "100%",
                      ...(cancelled ? { opacity: 0.6 } : {}),
                    }}
                  >
                    <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: col }}>{labelOf(e)}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: cancelled ? "line-through" : undefined }}>{e.title}</div>
                      {(st || e.rpe != null) && (
                        <div style={{ ...MONO, fontSize: 11, color: e.status === "missed" ? C.o : e.status === "completed" ? C.g : C.tx3 }}>
                          {[st, e.rpe != null ? `RPE ${e.rpe}` : null].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {clickable && <Chevron />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {selected && (
        <CoachPhoneSessionSheet
          session={{ title: selected.title, date: selected.date, typeLabel: labelOf(selected), color: TYPE_COLOR[typeOf(selected)], locked: isDone(selected) }}
          weekMonday={monday}
          busyDays={busyDays}
          today={today}
          actions={actionsFor(selected)}
          pending={pending}
          onClose={close}
        />
      )}

      {compSel && <CompetitionSheet event={compSel} onClose={() => setCompSel(null)} />}

      {addDay && <AddSessionSheet athleteId={athleteId} coachId={coachId} date={addDay} onClose={() => setAddDay(null)} onAdd={(s) => assign.mutate(
        { sessionId: s.id, sessionName: s.name, athleteId, coachId, date: addDay }, { onSuccess: () => setAddDay(null) },
      )} onAddTest={(t) => createTest.mutate(
        { athleteId, coachId, title: t.title, type: t.type, date: addDay }, { onSuccess: () => setAddDay(null) },
      )} pending={assign.isPending || createTest.isPending} />}
    </PhonePage>
  );
}

/** Compétition touchée dans le planning : annuler (reste barrée), rétablir, supprimer. */
function CompetitionSheet({ event, onClose }: { event: UnifiedCalendarEvent; onClose: () => void }) {
  const { user } = useAuth();
  const raw = (event.raw ?? {}) as Partial<CompetitionActionTarget> & { cancelled_by?: string | null; location?: string | null };
  const comp: CompetitionActionTarget = {
    id: event.id, athlete_id: String(raw.athlete_id ?? ""), name: event.title, cancelled_at: raw.cancelled_at ?? null,
  };
  const by = comp.cancelled_at ? cancelledByLabel({ cancelled_by: raw.cancelled_by, athlete_id: comp.athlete_id }, user?.id) : "";
  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent style={{ background: C.s1, borderColor: C.brdL, color: C.tx }}>
        <div style={{ padding: "6px 16px calc(18px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: comp.cancelled_at ? C.tx3 : TYPE_COLOR.competition }}>
            {comp.cancelled_at ? `Annulée${by ? ` ${by}` : ""}` : "Compétition"}
          </div>
          <DrawerTitle style={{ fontSize: 17, fontWeight: 500, margin: 0, textDecoration: comp.cancelled_at ? "line-through" : undefined }}>{event.title}</DrawerTitle>
          <DrawerDescription style={{ fontSize: 12.5, color: C.tx2, margin: 0 }}>
            {new Date(event.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
            {raw.location ? ` · ${raw.location}` : ""}
          </DrawerDescription>
          <CompetitionActions comp={comp} onDone={onClose} className="mt-1" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** « Ajouter » un jour vide : une séance du programme de l'athlète, ou un test de la banque. */
function AddSessionSheet({ athleteId, coachId, date, onAdd, onAddTest, onClose, pending }: {
  athleteId: string; coachId: string; date: string; pending: boolean; onClose: () => void;
  onAdd: (s: { id: string; name: string }) => void;
  onAddTest: (t: { title: string; type: string }) => void;
}) {
  const { data: prog = [], isLoading } = useProgrammation(athleteId);
  const navigate = useNavigate();
  const [mode, setMode] = useState<"seance" | "test">("seance");
  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent style={{ background: C.s1, borderColor: C.brdL, color: C.tx }}>
        <div style={{ padding: "6px 16px calc(18px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10, maxHeight: "70vh", overflowY: "auto" }}>
          <DrawerTitle style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>
            Ajouter le {new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </DrawerTitle>
          <DrawerDescription style={{ fontSize: 12, color: C.tx3, margin: 0 }}>
            {mode === "seance" ? "Une séance de musculation de son programme." : "Un test de ta banque, rangé par dominante."}
          </DrawerDescription>
          <div role="tablist" aria-label="Type" style={{ display: "flex", gap: 6 }}>
            {([["seance", "Séance"], ["test", "Test"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)} style={{
                flex: 1, height: 36, borderRadius: 10, fontFamily: "inherit", fontSize: 13, cursor: "pointer",
                border: `1px solid ${mode === k ? C.ac : C.brdL}`, background: mode === k ? alpha(C.ac, 0.12) : "transparent",
                color: mode === k ? C.tx : C.tx2, fontWeight: mode === k ? 500 : 400,
              }}>{l}</button>
            ))}
          </div>
          {mode === "test" ? (
            <PhoneTestPicker coachId={coachId} pending={pending} onPick={onAddTest} />
          ) : isLoading ? null : prog.length === 0 ? (
            <div style={{ fontSize: 13, color: C.tx2 }}>Aucune séance dans son programme.</div>
          ) : (
            <div style={{ ...CARD, padding: "2px 14px", background: C.bg }}>
              {prog.map((s, i) => (
                <button key={s.id} type="button" disabled={pending} onClick={() => onAdd({ id: s.id, name: s.name })} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "12px 0", background: "none", border: "none",
                  boxShadow: rowLine(i), color: C.tx, fontFamily: "inherit", fontSize: 14, textAlign: "left", cursor: "pointer",
                }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: 2, background: TYPE_COLOR.muscu }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: C.ac }}>Ajouter</span>
                </button>
              ))}
            </div>
          )}
          {mode === "seance" && <button type="button" onClick={() => navigate(`/coach/athletes/${athleteId}/programmation`)} style={{ alignSelf: "flex-start", background: "none", border: "none", padding: 0, color: C.ac, fontSize: 13, fontFamily: "inherit", cursor: "pointer" }}>
            Créer une séance ›
          </button>}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
