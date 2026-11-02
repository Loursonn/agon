import { useEffect, useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { C } from "@/lib/theme";
import {
  BATTERY_SESSIONS, SCHEDULED_SESSIONS, defaultSessionDates, mondayOf, nextMondayIso, planTestWeek, type ScheduledSession,
} from "@/lib/hyrox/tests";
import { useScheduleTestWeek, type BatteryCalendarRow, type BatteryTest } from "@/features/shared/hooks/hyrox/useHyroxTests";
import { Btn, Muted } from "./ui";
import { fmtDate, inputStyle, labelStyle, todayIso } from "./format";

interface Props {
  open: boolean;
  athleteId: string;
  tests: BatteryTest[];
  /** Tests de la batterie déjà dans le calendrier de l'athlète (prévus ou faits). */
  calendar: BatteryCalendarRow[];
  onClose: () => void;
}

const WEEKDAY = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const dayLabel = (iso: string) => `${WEEKDAY[new Date(iso + "T12:00:00Z").getUTCDay()]} ${fmtDate(iso)}`;

/**
 * Programme la semaine de tests : le coach choisit le lundi, ajuste au besoin
 * le jour de chaque séance, voit l'aperçu, puis tout est posé d'un coup dans
 * le calendrier de l'athlète. La Semaine 1 (sleds 3 × 50 m) n'en fait pas partie.
 */
export default function ScheduleTestWeekDrawer({ open, athleteId, tests, calendar, onClose }: Props) {
  const schedule = useScheduleTestWeek(athleteId);
  const [monday, setMonday] = useState(() => nextMondayIso(todayIso()));
  const [dates, setDates] = useState<Record<ScheduledSession, string>>(() => defaultSessionDates(nextMondayIso(todayIso())));

  useEffect(() => {
    if (!open) return;
    const m = nextMondayIso(todayIso());
    setMonday(m);
    setDates(defaultSessionDates(m));
  }, [open]);

  const plan = useMemo(() => planTestWeek(tests, dates, calendar), [tests, dates, calendar]);
  const toCreate = plan.filter(p => !p.alreadyThere);

  const pickMonday = (iso: string) => {
    if (!iso) return;
    const m = mondayOf(iso);
    setMonday(m);
    setDates(defaultSessionDates(m));
  };

  return (
    <Drawer open={open} onOpenChange={o => !o && onClose()}>
      <DrawerContent style={{ background: C.s1, borderTop: "1px solid " + C.brd, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <DrawerHeader style={{ padding: "16px 20px 8px", flexShrink: 0 }}>
          <DrawerTitle style={{ color: C.tx, fontSize: 16 }}>Programmer la semaine de tests</DrawerTitle>
          <Muted>Chaque test des séances 1 à 5 est posé dans le calendrier de l'athlète, à faire. La Semaine 1 (sleds 3 × 50 m) se programme à part.</Muted>
        </DrawerHeader>
        <div style={{ overflowY: "auto", padding: "4px 20px 28px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          <label style={labelStyle} htmlFor="test-week-monday">Semaine du lundi</label>
          <input
            id="test-week-monday"
            type="date"
            value={monday}
            onChange={e => pickMonday(e.target.value)}
            style={{ ...inputStyle, marginBottom: 16 }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SCHEDULED_SESSIONS.map(s => {
              const meta = BATTERY_SESSIONS.find(b => b.key === s)!;
              const items = plan.filter(p => p.session === s);
              return (
                <div key={s} style={{ background: C.s2, borderRadius: 4, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.tx }}>{meta.label}</div>
                    <input
                      type="date"
                      aria-label={`Date de la ${meta.label}`}
                      value={dates[s]}
                      onChange={e => e.target.value && setDates(d => ({ ...d, [s]: e.target.value }))}
                      style={{ ...inputStyle, width: 150, padding: "5px 8px", fontSize: 12 }}
                    />
                  </div>
                  <Muted style={{ marginBottom: 4 }}>{dayLabel(dates[s])}</Muted>
                  {items.map(p => (
                    <div key={p.testId} style={{ fontSize: 12, color: p.alreadyThere ? C.tx3 : C.tx2, lineHeight: 1.6 }}>
                      {p.name}
                      {p.alreadyThere && <span style={{ fontSize: 10, marginLeft: 6 }}>· déjà dans le calendrier ce jour-là</span>}
                    </div>
                  ))}
                  {!items.length && <Muted>Aucun test dans cette séance.</Muted>}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 16 }}>
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn
              primary
              disabled={!toCreate.length || schedule.isPending}
              onClick={() => schedule.mutate(toCreate.map(p => ({ name: p.name, date: p.date })), { onSuccess: onClose })}
            >
              {schedule.isPending
                ? "Programmation…"
                : toCreate.length
                  ? `Programmer ${toCreate.length} test${toCreate.length > 1 ? "s" : ""}`
                  : "Tout est déjà programmé"}
            </Btn>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
