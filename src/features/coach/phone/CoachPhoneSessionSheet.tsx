import { useMemo, useState } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { C } from "@/lib/theme";
import { addDays } from "@shared/domain/dates";
import { Chevron, MONO, KICKER, PhoneButton, rowLine } from "./phoneUi";

const DOW = ["L", "M", "M", "J", "V", "S", "D"];

export interface SheetSession {
  title: string;
  date: string;
  typeLabel: string;
  color: string;
  /** Séance réalisée, commencée ou notée : ni déplacée, ni mise en repos. */
  locked: boolean;
}

export interface SheetActions {
  onMove?: (date: string) => void;
  onDuplicate?: (date: string) => void;
  onEdit?: () => void;
  onRest?: () => void;
  onRemove?: () => void;
  onOpen?: () => void;
  openLabel?: string;
}

/**
 * Feuille d'une séance du planning coach sur téléphone (planche
 * CoachPhonePlanning) : « Déplacer au » un jour de la semaine, modifier,
 * dupliquer, passer en repos, retirer. Pas de glisser-déposer.
 */
export function CoachPhoneSessionSheet({
  session, weekMonday, busyDays, today, actions, pending, onClose,
}: {
  session: SheetSession;
  weekMonday: string;
  /** Jours de la semaine qui ont déjà une séance (info « elle s'ajoute à côté »). */
  busyDays: ReadonlySet<string>;
  today: string;
  actions: SheetActions;
  pending?: boolean;
  onClose: () => void;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekMonday, i)), [weekMonday]);
  const busyOthers = days.filter((d) => d !== session.date && busyDays.has(d));
  const dayName = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
  const head = `${session.typeLabel} · ${new Date(session.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}`;
  const canPickDay = !!(actions.onMove || actions.onDuplicate);

  const item = (label: string, onClick: (() => void) | undefined, color: string, i: number, chevron = false) =>
    onClick ? (
      <button key={label} type="button" disabled={pending} onClick={onClick} style={{
        display: "flex", alignItems: "center", gap: 12, height: 46, width: "100%", background: "none", border: "none",
        boxShadow: rowLine(i), color, fontSize: 14, fontFamily: "inherit", textAlign: "left", cursor: "pointer", padding: 0,
      }}>
        <span style={{ flex: 1 }}>{label}</span>
        {chevron && <Chevron />}
      </button>
    ) : null;

  const rows = [
    actions.onOpen ? { l: actions.openLabel ?? "Voir la séance", f: actions.onOpen, c: C.tx, ch: true } : null,
    actions.onEdit ? { l: "Modifier la séance", f: actions.onEdit, c: C.tx, ch: true } : null,
    !session.locked && actions.onRest ? { l: "Passer en repos", f: actions.onRest, c: C.tx2, ch: false } : null,
    actions.onRemove ? { l: "Retirer du planning", f: actions.onRemove, c: C.r, ch: false } : null,
  ].filter(Boolean) as Array<{ l: string; f: () => void; c: string; ch: boolean }>;

  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent style={{ background: C.s1, borderColor: C.brdL, color: C.tx }}>
        <div style={{ padding: "6px 16px calc(18px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ ...MONO, fontSize: 10, letterSpacing: "0.12em", color: session.color, textTransform: "uppercase" }}>{head}</div>
            <DrawerTitle style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{session.title}</DrawerTitle>
            <DrawerDescription className="sr-only">Déplacer, modifier ou retirer la séance</DrawerDescription>
          </div>

          {canPickDay && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ ...KICKER, color: C.tx2 }}>{session.locked ? "Dupliquer au" : "Déplacer au"}</span>
              <div style={{ display: "flex", gap: 5 }}>
                {days.map((d, i) => {
                  const cur = d === session.date;
                  const sel = d === target;
                  const past = d < today;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={past || cur}
                      aria-pressed={sel}
                      aria-label={new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                      onClick={() => setTarget(d)}
                      style={{
                        flex: 1, height: 40, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        fontSize: 11, lineHeight: 1.2, fontFamily: "inherit", cursor: past || cur ? "default" : "pointer", padding: 0,
                        background: cur ? C.ac : sel ? C.tx : "transparent", color: cur || sel ? C.bg : past ? C.s2 : busyDays.has(d) ? C.tx3 : C.tx2,
                        border: cur || sel ? "none" : `1px solid ${C.brdL}`, fontWeight: cur || sel ? 500 : 400, opacity: past ? 0.5 : 1,
                      }}
                    >
                      <span>{DOW[i]}</span>
                      <span style={{ ...MONO, fontSize: 12 }}>{Number(d.slice(8))}</span>
                    </button>
                  );
                })}
              </div>
              {busyOthers.length > 0 && (
                <div style={{ fontSize: 11, color: C.tx3 }}>
                  {busyOthers.map((d) => dayName(d)).join(", ")} {busyOthers.length > 1 ? "ont" : "a"} déjà une séance : elle s’ajoute à côté.
                </div>
              )}
              {target && (
                <div style={{ display: "flex", gap: 8 }}>
                  {!session.locked && actions.onMove && (
                    <PhoneButton primary disabled={pending} style={{ flex: 1 }} onClick={() => actions.onMove!(target)}>Déplacer au {dayName(target)}</PhoneButton>
                  )}
                  {actions.onDuplicate && (
                    <PhoneButton disabled={pending} style={{ flex: 1 }} onClick={() => actions.onDuplicate!(target)}>Dupliquer</PhoneButton>
                  )}
                </div>
              )}
              {!target && session.locked && (
                <div style={{ fontSize: 11, color: C.tx3 }}>Séance réalisée, commencée ou notée : elle ne se déplace pas.</div>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((r, i) => item(r.l, r.f, r.c, i, r.ch))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
