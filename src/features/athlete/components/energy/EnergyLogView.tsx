import { useMemo, useState } from "react";
import { Check, ChevronLeft, Minus, Plus } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { DISPLAY, KICKER, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import { fmtDist, fmtDur, type Refs } from "@/lib/energy/energyRun";
import { logBlocks, stepMinutes } from "@/lib/energy/energyLog";
import { ACTIVITY_LABEL, type ActivityType, type RunDistanceValue } from "@/features/shared/components/runDistance";
import type { BlockLogs, EnergySessionRow } from "@/types/energy";
import { tintColor } from "./energyTint";

/**
 * « Noter ma séance » d'énergie (planche EnergieTel) : feuille du bas plein
 * largeur sur téléphone. Les blocs d'effort sont nommés par leur contenu et
 * comptés faits d'office : on décoche ce qui n'a pas été fait. Valider n'attend
 * jamais de case cochée.
 */
export function EnergyLogView({
  session, refs, blocks, onBlocks, duration, onDuration, durationHint, runDist, onRunDist, note, onNote,
  pending, onBack, onClose, onValidate,
}: {
  session: EnergySessionRow;
  refs: Refs;
  /** Saisie par bloc (clés de `block_logs`). */
  blocks: BlockLogs;
  onBlocks: (next: BlockLogs) => void;
  /** Durée réelle en minutes (saisie brute). */
  duration: string;
  onDuration: (v: string) => void;
  /** « Prévu 60 min » ou « Mesurée par le minuteur ». */
  durationHint: string;
  runDist: RunDistanceValue;
  onRunDist: (v: RunDistanceValue) => void;
  note: string;
  onNote: (v: string) => void;
  pending: boolean;
  onBack: () => void;
  onClose: () => void;
  onValidate: () => void;
}) {
  const list = useMemo(() => logBlocks(session.intervals ?? [], refs), [session.intervals, refs]);
  // Un seul bloc : rien à cocher (la séance entière est notée).
  const checkable = list.length > 1;
  const plannedMin = session.total_duration_s ? Math.round(session.total_duration_s / 60) : 0;
  const planned = ["Prévu", session.total_duration_s ? fmtDur(session.total_duration_s) : null, session.total_distance_m ? fmtDist(session.total_distance_m) : null]
    .filter(Boolean).join(" · ");
  const undone = list.filter((b) => blocks[b.id]?.done === false).length;
  const [openNotes, setOpenNotes] = useState<Set<string>>(
    () => new Set(list.filter((b) => blocks[b.id]?.note?.trim()).map((b) => b.id)),
  );

  const setBlock = (id: string, patch: Partial<{ done: boolean; note: string }>) => {
    const cur = blocks[id] ?? { done: true, note: "" };
    onBlocks({ ...blocks, [id]: { ...cur, ...patch } });
  };

  return (
    <>
      <div onClick={onClose} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 145, background: "rgba(0,0,0,0.65)" }} />
      <div role="dialog" aria-label={`Noter ma séance : ${session.name}`} style={{
        // Au-dessus des bandeaux de l'app (« Séance non terminée », z 140-141), sous les notifications (z 150).
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 146, margin: "0 auto", maxWidth: 520, maxHeight: "94dvh",
        background: C.bg, color: C.tx, borderRadius: "20px 20px 0 0", borderTop: `1px solid ${C.brdL}`,
        display: "flex", flexDirection: "column", boxShadow: "0 -12px 40px rgba(0,0,0,0.45)",
      }}>
        <div aria-hidden style={{ width: 40, height: 4, borderRadius: 2, background: C.brdL, margin: "10px auto 0", flex: "none" }} />
        <div style={{ padding: "10px 18px 8px", display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          <button type="button" aria-label="Retour" onClick={onBack} style={{
            width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none",
          }}><ChevronLeft size={16} color={C.tx} /></button>
          <span style={{ ...KICKER, flex: 1, minWidth: 0 }}>Noter ma séance</span>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{
              ...MONO, alignSelf: "flex-start", height: 24, padding: "0 9px", borderRadius: 999, background: TYPE_COLOR.energie, color: C.ink,
              fontSize: 11, letterSpacing: "0.06em", fontWeight: 500, display: "inline-flex", alignItems: "center", textTransform: "uppercase",
            }}>Énergie</span>
            <h2 style={{ ...DISPLAY, margin: 0, fontWeight: 400, fontSize: 24, lineHeight: 1.1, overflowWrap: "anywhere" }}>{session.name}</h2>
            <div style={{ ...MONO, fontSize: 14, color: C.tx2 }}>{planned}</div>
          </div>

          {checkable && (
            <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={LABEL}>Ce que tu as fait</span>
                <span style={{ ...MONO, fontSize: 12, color: undone ? C.o : C.tx3 }}>{list.length - undone} / {list.length}</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.tx3 }}>Tout est compté fait. Touche un bloc que tu n'as pas fait.</div>
              {list.map((b) => {
                const log = blocks[b.id];
                const done = log?.done !== false;
                const color = tintColor(b.tint);
                const noteOpen = openNotes.has(b.id);
                return (
                  <div key={b.id} style={{
                    background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 14, overflow: "hidden",
                  }}>
                    <button type="button" role="checkbox" aria-checked={done} onClick={() => setBlock(b.id, { done: !done })} style={{
                      width: "100%", display: "flex", alignItems: "stretch", gap: 12, padding: "12px 14px", background: "transparent", border: 0,
                      color: C.tx, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}>
                      <span aria-hidden style={{ width: 4, borderRadius: 2, background: color, flex: "none", opacity: done ? 1 : 0.35 }} />
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                        {b.rep && <span style={{ ...LABEL, fontSize: 10.5 }}>Effort {b.rep}</span>}
                        <span style={{
                          fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflowWrap: "anywhere",
                          color: done ? C.tx : C.tx3, textDecoration: done ? "none" : "line-through",
                        }}>{b.phrase}</span>
                        {!done && <span style={{ fontSize: 12, color: C.o }}>Pas fait</span>}
                      </span>
                      <span aria-hidden style={{
                        width: 28, height: 28, borderRadius: 999, flex: "none", alignSelf: "center",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: done ? C.g : "transparent", border: done ? "none" : `1.5px solid ${C.brdL}`,
                      }}>{done && <Check size={16} strokeWidth={2.6} color={C.ink} />}</span>
                    </button>
                    {noteOpen ? (
                      <div style={{ padding: "0 14px 12px 30px" }}>
                        <input
                          aria-label={`Note sur ${b.phrase}`}
                          autoFocus={!log?.note}
                          placeholder="Ressenti, allure tenue…"
                          value={log?.note ?? ""}
                          onChange={(e) => setBlock(b.id, { note: e.target.value })}
                          style={{
                            width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10,
                            border: `1px solid ${C.brdL}`, background: C.s2, color: C.tx, fontSize: 14, fontFamily: "inherit", outline: "none",
                          }}
                        />
                      </div>
                    ) : (
                      <button type="button" onClick={() => setOpenNotes((s) => new Set(s).add(b.id))} style={{
                        display: "block", margin: "-4px 0 0 30px", padding: "0 0 10px", background: "transparent", border: 0,
                        color: C.tx3, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit",
                      }}>+ note</button>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="energy-log-duration" style={LABEL}>Durée réelle</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StepButton label="Retirer 5 minutes" onClick={() => onDuration(stepMinutes(duration, -5, plannedMin))}><Minus size={18} /></StepButton>
              <div style={{
                flex: 1, minWidth: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 14, padding: "0 12px",
              }}>
                <input
                  id="energy-log-duration"
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  value={duration}
                  onChange={(e) => onDuration(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder={plannedMin ? String(plannedMin) : "—"}
                  style={{
                    ...MONO, width: "3.2ch", minWidth: 0, flex: "0 1 auto", textAlign: "right", fontSize: 30, lineHeight: 1,
                    background: "transparent", border: 0, color: C.tx, outline: "none", padding: 0,
                  }}
                />
                <span style={{ ...MONO, fontSize: 14, color: C.tx2 }}>min</span>
              </div>
              <StepButton label="Ajouter 5 minutes" onClick={() => onDuration(stepMinutes(duration, 5, plannedMin))}><Plus size={18} /></StepButton>
            </div>
            <span style={{ fontSize: 12, color: C.tx3 }}>{durationHint}</span>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={LABEL}>Activité</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(Object.keys(ACTIVITY_LABEL) as ActivityType[]).map((a) => {
                const on = runDist.activity === a;
                return (
                  <button key={a} type="button" aria-pressed={on} onClick={() => onRunDist({ ...runDist, activity: a })} style={{
                    height: 36, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13.5,
                    border: `1px solid ${on ? C.ac : C.brdL}`, background: on ? alpha(C.ac, 0.14) : "transparent", color: on ? C.ac : C.tx2,
                    fontWeight: on ? 600 : 400,
                  }}>{ACTIVITY_LABEL[a]}</button>
                );
              })}
            </div>
            {runDist.activity === "course" && (
              <label style={{
                display: "flex", alignItems: "center", gap: 10, background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 14, padding: "8px 14px",
              }}>
                <span style={{ flex: 1, fontSize: 14, color: C.tx2 }}>Distance courue</span>
                <input
                  type="text" inputMode="decimal"
                  value={runDist.km}
                  onChange={(e) => onRunDist({ ...runDist, km: e.target.value })}
                  placeholder="0"
                  style={{
                    ...MONO, width: 72, textAlign: "right", fontSize: 18, background: C.s2, border: `1px solid ${C.brdL}`,
                    borderRadius: 10, padding: "7px 10px", color: C.tx, outline: "none",
                  }}
                />
                <span style={{ ...MONO, fontSize: 13, color: C.tx3 }}>km</span>
              </label>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="energy-log-note" style={LABEL}>Note pour ton coach</label>
            <textarea
              id="energy-log-note"
              placeholder="Sensations, conditions, douleur…"
              value={note}
              onChange={(e) => onNote(e.target.value)}
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 14, resize: "none",
                border: `1px solid ${C.brd}`, background: C.s1, color: C.tx, fontSize: 14, lineHeight: 1.45, fontFamily: "inherit", outline: "none",
              }}
            />
          </section>
        </div>

        <div style={{ padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderTop: `1px solid ${C.brd}`, flex: "none" }}>
          <button type="button" onClick={onValidate} disabled={pending} style={{
            width: "100%", height: 52, border: 0, borderRadius: 12, background: C.ac, color: C.ink,
            fontSize: 15, fontWeight: 600, cursor: pending ? "default" : "pointer", fontFamily: "inherit", opacity: pending ? 0.7 : 1,
          }}>{pending ? "Validation…" : "Valider la séance"}</button>
        </div>
      </div>
    </>
  );
}

function StepButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{
      width: 48, height: 48, borderRadius: 999, flex: "none", border: `1px solid ${C.brdL}`, background: "transparent", color: C.tx,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    }}>{children}</button>
  );
}
