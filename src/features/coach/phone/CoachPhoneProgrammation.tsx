import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR, blocColor } from "@/lib/peps";
import { useUnifiedCalendar, type UnifiedCalendarEvent } from "@/features/shared/hooks/useUnifiedCalendar";
import { useProgrammation } from "@/features/coach/components/programmation/hooks/useProgrammation";
import { useUpdateProgrammation } from "@/features/coach/components/programmation/hooks/useUpdateProgrammation";
import type { Bloc, ProgSession } from "@/features/coach/components/programmation/types";
import { formatExercice, formatBlocTiming } from "@/features/staff/lib/formatPrescription";
import { mondayOf } from "@/lib/trainingLoadWeek";
import { addDays, localIsoDay } from "@shared/domain/dates";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { CARD, Chevron, Chip, KICKER, MONO, PhoneButton, PhonePage, Tag } from "./phoneUi";
import { CoachPhoneSessionSheet } from "./CoachPhoneSessionSheet";
import { useCurrentCycle } from "./CoachPhoneAthleteHeader";
import { editSessionPath, isDone, labelOf, sessionIdOf, typeOf, usePhoneEventActions } from "./usePhoneEventActions";
import { useSessionOccurrence } from "./useSessionOccurrence";
import CoachPhoneSeanceEdit from "./CoachPhoneSeanceEdit";

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
type Filter = "all" | "muscu" | "energie" | "hyrox";
const FILTERS: Array<{ key: Filter; label: string; color?: string }> = [
  { key: "all", label: "Tout", color: C.tx },
  { key: "muscu", label: "Muscu", color: TYPE_COLOR.muscu },
  { key: "energie", label: "Énergie", color: TYPE_COLOR.energie },
  { key: "hyrox", label: "Spécifique", color: TYPE_COLOR.hyrox },
];
const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
const dowOf = (iso: string) => DOW[(new Date(iso + "T12:00:00").getDay() + 6) % 7];
const abbr = (s: ProgSession | undefined, title: string) =>
  (s?.short?.trim() || title.replace(/[^A-Za-zÀ-ÿ0-9]/g, "").slice(0, 3)).toUpperCase().slice(0, 4);

/**
 * Programmation d'un athlète sur téléphone (planche CoachPhoneProgrammation) :
 * cycle en cours, semaines S1…Sn, séances de la semaine (filtre par type),
 * contenu d'une séance de musculation déplié, Modifier / Dupliquer.
 * `?edit=<séance>&date=<jour>` ouvre l'écran « Modifier une séance ».
 */
export default function CoachPhoneProgrammation() {
  const [params] = useSearchParams();
  const edit = params.get("edit");
  if (edit) return <CoachPhoneSeanceEdit key={`${edit}-${params.get("date") ?? ""}`} sessionId={edit} date={params.get("date")} />;
  return <ProgrammationList />;
}

function ProgrammationList() {
  const { athleteId = "" } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();
  const today = localIsoDay();
  const { cycle, weeks, weekIndex } = useCurrentCycle(athleteId, today);
  const [pick, setPick] = useState<number | null>(null); // index de semaine du cycle (0-based)
  const [offset, setOffset] = useState(0); // sans cycle : semaines autour d'aujourd'hui
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<UnifiedCalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);

  const wi = pick ?? (weekIndex != null ? weekIndex - 1 : 0);
  const week = cycle && weeks[wi] ? weeks[wi] : null;
  const start = week?.start_date ?? addDays(mondayOf(today), offset * 7);
  const end = week?.end_date ?? addDays(start, 6);

  const cal = useUnifiedCalendar(athleteId, { start, end });
  const { data: prog = [] } = useProgrammation(athleteId);
  const progById = useMemo(() => new Map(prog.map((s) => [s.id, s])), [prog]);
  const close = () => setSelected(null);
  const { actionsFor, pending } = usePhoneEventActions(athleteId, close);

  const events = useMemo(
    () => (cal.data ?? [])
      .filter((e) => (e.type === "workout" || e.type === "energy") && e.status !== "skipped")
      .filter((e) => filter === "all" || typeOf(e) === filter)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [cal.data, filter],
  );
  const busyDays = useMemo(() => new Set((cal.data ?? []).map((e) => e.date)), [cal.data]);

  return (
    <PhonePage gap={12} style={{ paddingTop: 14 }}>
      {cycle ? (
        <>
          <div style={{ padding: "12px 14px", borderRadius: 14, background: alpha(TYPE_COLOR.competition, 0.1), border: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...KICKER, color: C.tx2 }}>Cycle en cours</span>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{cycle.name}</div>
              <div style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{fmtDay(cycle.start_date)} → {fmtDay(cycle.end_date)}</div>
            </div>
            {weekIndex && <Tag color={C.tx} filled>S{weekIndex} / {weeks.length}</Tag>}
          </div>
          {weeks.length > 0 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
              {weeks.map((w, i) => {
                const active = i === wi;
                const current = weekIndex === i + 1;
                return (
                  <button key={w.id} type="button" aria-pressed={active} onClick={() => { setPick(i); setOpen(null); }} style={{
                    flex: "1 0 44px", height: 36, borderRadius: 10, ...MONO, fontSize: 12, cursor: "pointer",
                    background: active ? C.tx : "transparent", color: active ? C.bg : current ? C.ac : C.tx2,
                    border: active ? "none" : `1px solid ${current ? alpha(C.ac, 0.5) : C.brdL}`, fontWeight: active ? 500 : 400,
                  }}>S{i + 1}</button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 34 }}>
          <button type="button" aria-label="Semaine précédente" onClick={() => setOffset((o) => o - 1)} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" }}><Chevron dir="left" color={C.tx2} size={20} /></button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{offset === 0 ? "Cette semaine" : `Semaine du ${fmtDay(start)}`}</div>
            <div style={{ fontSize: 11, color: C.tx3 }}>Pas de cycle en cours</div>
          </div>
          <button type="button" aria-label="Semaine suivante" onClick={() => setOffset((o) => o + 1)} style={{ background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" }}><Chevron color={C.tx2} size={20} /></button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        {FILTERS.map((f) => <Chip key={f.key} active={filter === f.key} color={f.color} onClick={() => setFilter(f.key)}>{f.label}</Chip>)}
      </div>

      {cal.isError && <div style={{ fontSize: 12, color: C.o }}>Programmation : lecture impossible.</div>}
      {!cal.isLoading && events.length === 0 && (
        <div style={{ ...CARD, padding: 14, fontSize: 13, color: C.tx3 }}>Aucune séance cette semaine.</div>
      )}

      {events.map((e) => {
        const t = typeOf(e);
        const col = TYPE_COLOR[t];
        const sid = sessionIdOf(e);
        const session = sid ? progById.get(sid) : undefined;
        const key = `${e.type}-${e.id}`;
        const isOpen = open === key;
        const nEx = session ? session.blocs.reduce((n, b) => n + b.exercices.length, 0) : 0;
        const sub = e.type === "workout"
          ? session ? `${session.blocs.length} bloc${session.blocs.length > 1 ? "s" : ""} · ${nEx} exercice${nEx > 1 ? "s" : ""}` : "Séance retirée du programme"
          : [labelOf(e), e.status === "completed" ? "Fait" : null].filter(Boolean).join(" · ");
        return (
          <div key={key} style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: alpha(col, isOpen ? 0.08 : 0.05), border: `1px solid ${alpha(col, isOpen ? 0.33 : 0.19)}` }}>
            <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: col }} />
            <button type="button" aria-expanded={isOpen} onClick={() => (e.type === "workout" && session ? setOpen(isOpen ? null : key) : setSelected(e))} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px 12px 16px", background: "none", border: "none",
              color: C.tx, fontFamily: "inherit", textAlign: "left", cursor: "pointer",
            }}>
              <span style={{ width: 40, flex: "none", textAlign: "center" }}>
                <span style={{ display: "block", fontSize: 11, color: e.date === today ? C.ac : C.tx3 }}>{dowOf(e.date)}</span>
                <span style={{ display: "block", ...MONO, fontSize: 12, color: col }}>{abbr(session, e.title)}</span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                <div style={{ fontSize: 11.5, color: C.tx3 }}>{sub}</div>
              </div>
              {isDone(e) && <Tag color={C.g} filled>Fait</Tag>}
              <Chevron dir={e.type === "workout" && session ? (isOpen ? "up" : "down") : "right"} />
            </button>
            {isOpen && session && (
              <SessionContent
                athleteId={athleteId}
                session={session}
                date={e.date}
                onEdit={() => navigate(editSessionPath(athleteId, session.id, e.date))}
                onDuplicate={() => setSelected(e)}
              />
            )}
          </div>
        );
      })}

      <button type="button" onClick={() => setCreating(true)} style={{
        height: 48, borderRadius: 14, border: `1px solid ${C.brdL}`, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        color: C.tx, fontSize: 14, fontFamily: "inherit", cursor: "pointer",
      }}>
        <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ac} strokeWidth="1.5" strokeLinecap="square"><path d="M12 5V19M5 12H19" /></svg>
        Créer une séance
      </button>
      <div style={{ fontSize: 11.5, color: C.tx3, textAlign: "center" }}>Les banques et l’import de texte restent sur ordinateur.</div>

      {selected && (
        <CoachPhoneSessionSheet
          session={{ title: selected.title, date: selected.date, typeLabel: labelOf(selected), color: TYPE_COLOR[typeOf(selected)], locked: isDone(selected) }}
          weekMonday={mondayOf(selected.date)}
          busyDays={busyDays}
          today={today}
          actions={actionsFor(selected)}
          pending={pending}
          onClose={close}
        />
      )}
      {creating && <CreateSessionSheet athleteId={athleteId} prog={prog} start={start} onClose={() => setCreating(false)} />}
    </PhonePage>
  );
}

/** Contenu d'une séance de muscu pour cette occurrence (adaptation du jour comprise). */
function SessionContent({ athleteId, session, date, onEdit, onDuplicate }: {
  athleteId: string; session: ProgSession; date: string; onEdit: () => void; onDuplicate: () => void;
}) {
  const { occurrence, override, isLoading } = useSessionOccurrence(athleteId, session.id, date);
  const blocs: Bloc[] = override ? (override.blocs as Bloc[]) : session.blocs;
  return (
    <div style={{ margin: "0 14px 0 16px", padding: "12px 0 14px", borderTop: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 10 }}>
      {override && <div><Tag color={C.ac}>Adaptée pour ce jour</Tag></div>}
      {isLoading ? null : blocs.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.tx3 }}>Séance vide.</div>
      ) : blocs.map((b, bi) => {
        const col = blocColor(b.color, bi);
        const timing = formatBlocTiming(b);
        return (
          <div key={b.id} style={{ display: "flex", gap: 10 }}>
            <span aria-hidden style={{ width: 3, flex: "none", borderRadius: 2, background: col }} />
            <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: col }}>{b.category ?? `Bloc ${bi + 1}`}</span>
              <span style={{ fontSize: 11.5, color: C.tx3, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>
              {timing && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{timing}</span>}
            </div>
            {b.exercices.map((ex, i) => {
              // Une adaptation du jour a des params à plat : formatExercice les lit tels quels.
              const line = formatExercice(ex, occurrence);
              return (
                <div key={ex.id} style={{ display: "flex", gap: 10, padding: "7px 0" }}>
                  <span style={{ ...MONO, fontSize: 11, color: C.tx3, width: 12, flex: "none" }}>{i + 1}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{line.name}</div>
                    {line.detail && <div style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{line.detail}</div>}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        );
      })}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
        <PhoneButton primary onClick={onEdit} style={{ height: 40, borderRadius: 10, fontSize: 13 }}>Modifier</PhoneButton>
        <PhoneButton onClick={onDuplicate} style={{ height: 40, borderRadius: 10, fontSize: 13 }}>Dupliquer</PhoneButton>
      </div>
    </div>
  );
}

/** « Créer une séance » : nom, abréviation, puis l'écran Modifier pour la remplir. */
function CreateSessionSheet({ athleteId, prog, start, onClose }: { athleteId: string; prog: ProgSession[]; start: string; onClose: () => void }) {
  const navigate = useNavigate();
  const save = useUpdateProgrammation(athleteId);
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const input: React.CSSProperties = {
    height: 44, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: C.bg, color: C.tx,
    fontSize: 16, fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };
  function create() {
    const n = name.trim();
    if (!n) return;
    const s: ProgSession = {
      id: crypto.randomUUID(), name: n, short: (short.trim() || n.slice(0, 3)).toUpperCase().slice(0, 4),
      recurrence: "weekly", multi_semaine: false, blocs: [],
    };
    save.mutate({ base: prog, next: [...prog, s] }, {
      onSuccess: () => {
        toast.success("Séance créée : ajoute ses exercices");
        onClose();
        navigate(editSessionPath(athleteId, s.id));
      },
    });
  }
  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent style={{ background: C.s1, borderColor: C.brdL, color: C.tx }}>
        <form onSubmit={(ev) => { ev.preventDefault(); create(); }} style={{ padding: "6px 16px calc(18px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 10 }}>
          <DrawerTitle style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Créer une séance de musculation</DrawerTitle>
          <DrawerDescription style={{ fontSize: 12, color: C.tx3, margin: 0 }}>
            Elle rejoint son programme. Place-la ensuite dans le planning (semaine du {fmtDay(start)}).
          </DrawerDescription>
          <label style={{ fontSize: 12, color: C.tx2, display: "flex", flexDirection: "column", gap: 4 }}>
            Nom
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Force bas du corps" style={input} />
          </label>
          <label style={{ fontSize: 12, color: C.tx2, display: "flex", flexDirection: "column", gap: 4 }}>
            Abréviation (4 lettres max)
            <input value={short} maxLength={4} onChange={(e) => setShort(e.target.value)} placeholder="FBC" style={input} />
          </label>
          <PhoneButton primary type="submit" disabled={!name.trim() || save.isPending}>Créer et ajouter les exercices</PhoneButton>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
