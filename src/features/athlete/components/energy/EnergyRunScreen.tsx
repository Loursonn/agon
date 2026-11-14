import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { C } from "@/lib/theme";
import { DISPLAY, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import {
  aimedSeconds, doneLabel, durPhrase, endsByButton, flattenRun, fmtChrono, fmtDur, mainTarget, repLabel, roleWord,
  roundRemaining, runNext, runPause, runResume, runStart, runTick, sessionElapsed, sessionRemaining, stepElapsed, stepPhrase,
  stepRemaining, stepTint, type Refs,
} from "@/lib/energy/energyRun";
import type { EnergyStep } from "@/types/energy";
import { tintCard, tintColor, tintLabel } from "./energyTint";

type WakeLock = { release: () => Promise<void> };

/** Garde l'écran allumé pendant la séance (si le navigateur le permet). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLock | null = null;
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    nav.wakeLock?.request("screen").then((l) => { if (cancelled) void l.release(); else lock = l; }).catch(() => {});
    return () => { cancelled = true; void lock?.release().catch(() => {}); };
  }, []);
}

/**
 * Séance d'énergie en plein écran (planche EnergieTel, écrans 03-04) : couleur
 * de la zone visée en effort, bleu en récup, chrono géant, cible, « Ensuite »
 * toujours visible. Un bloc en distance se termine au bouton (« 400 m fait »).
 */
export function EnergyRunScreen({ steps, refs, onExit }: {
  steps: EnergyStep[];
  refs: Refs;
  /** Fin (`finished`) ou arrêt de la séance : durée réelle en secondes, pauses exclues. */
  onExit: (elapsedS: number, finished: boolean) => void;
}) {
  const flat = useMemo(() => flattenRun(steps), [steps]);
  const [now, setNow] = useState(() => Date.now());
  const [st, setSt] = useState(() => runStart(flat, Date.now()));
  useWakeLock();

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setSt((s) => runTick(flat, s, t));
    }, 250);
    return () => clearInterval(id);
  }, [flat]);

  // Vibration au changement de pas.
  const lastIndex = useRef(st.index);
  useEffect(() => {
    if (st.index !== lastIndex.current) {
      lastIndex.current = st.index;
      navigator.vibrate?.(200);
    }
  }, [st.index]);

  const exitedRef = useRef(false);
  useEffect(() => {
    if (st.finished && !exitedRef.current) {
      exitedRef.current = true;
      onExit(sessionElapsed(st, now), true);
    }
  }, [st, now, onExit]);

  const cur = flat[st.index];
  if (!cur) return null;
  const step = cur.step;
  const next = flat[st.index + 1] ?? null;
  const tint = stepTint(step, refs);
  const color = tintColor(tint);
  const target = mainTarget(step, refs);
  const remaining = stepRemaining(flat, st, now);
  const elapsed = stepElapsed(st, now);
  const aimed = aimedSeconds(step, refs);
  const byButton = endsByButton(step) && !cur.emom?.gap;
  const paused = st.pausedAtMs != null;
  const rep = repLabel(cur);
  const left = sessionRemaining(flat, st, now, refs);
  const depart = cur.emom && !cur.emom.gap ? roundRemaining(flat, st, now) : null;

  const act = (f: (t: number) => void) => () => f(Date.now());

  return (
    <div role="dialog" aria-label="Séance en cours" style={{
      position: "fixed", inset: 0, zIndex: 70, background: C.bg, color: C.tx,
      display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto",
    }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 8px", display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" onClick={() => onExit(sessionElapsed(st, Date.now()), false)} style={{
          height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent",
          color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
        }}>Terminer</button>
        <span style={{ flex: 1 }} />
        <span style={{ ...LABEL }}>Reste</span>
        <span style={{ ...MONO, fontSize: 15 }}>{fmtChrono(left)}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "6px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ ...tintCard(color), borderRadius: 18, position: "relative", overflow: "hidden", padding: "18px 18px 20px 21px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ ...LABEL, color }}>{tintLabel(roleWord(step), tint)}</span>
            {rep && <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>{rep}</span>}
          </div>
          <div style={{ ...DISPLAY, fontWeight: 400, fontSize: 34 }}>
            {cur.emom?.gap ? "Repos" : step.duration?.kind === "lap_button" ? roleWord(step) : durPhrase(step)}
          </div>
          {step.type === "interval" && step.notes?.trim() && !cur.emom?.gap && (
            <div style={{ fontSize: 14, color: C.tx2 }}>{step.notes.trim()}</div>
          )}
          {cur.emom?.gap && <div style={{ fontSize: 14, color: C.tx2 }}>{step.type === "interval" ? step.notes : ""}</div>}

          <div aria-live="off" style={{ ...MONO, fontSize: 78, lineHeight: 1, letterSpacing: "-0.02em", color, marginTop: 8 }}>
            {fmtChrono(remaining ?? elapsed)}
          </div>
          <div style={{ ...MONO, fontSize: 13, color: C.tx2 }}>
            {remaining != null ? "restant" : aimed != null ? `le chrono monte · vise ${fmtDur(aimed)}` : "le chrono monte"}
            {depart != null && ` · départ suivant dans ${fmtChrono(depart)}`}
          </div>

          {target && !cur.emom?.gap && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ ...LABEL }}>Cible</span>
              <span style={{ ...MONO, fontSize: 54, lineHeight: 1.05, color }}>
                {target.value}<span style={{ fontSize: 20, color: C.tx2 }}>{target.unit}</span>
              </span>
              {target.secondary && <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>{target.secondary}</span>}
            </div>
          )}
        </div>

        <div style={{ background: C.s1, border: `1px solid ${C.brd}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          {next && <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", flex: "none", background: tintColor(stepTint(next.step, refs)) }} />}
          <span style={{ fontSize: 15 }}>
            <span style={{ color: C.tx2 }}>Ensuite : </span>
            {next ? (next.emom?.gap ? "repos jusqu'au départ suivant" : stepPhrase(next.step, refs)) : "fin de la séance"}
          </span>
        </div>
        {paused && <div style={{ ...MONO, textAlign: "center", fontSize: 13, color: C.tx2 }}>En pause</div>}
      </div>

      <div style={{
        padding: "14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderTop: `1px solid ${C.brd}`,
        background: C.bg, display: "flex", alignItems: "center", gap: 12,
      }}>
        <button type="button" onClick={act((t) => setSt((s) => runNext(flat, s, t)))} style={{
          flex: 1, height: 52, borderRadius: 12, background: "transparent", border: `1px solid ${C.brdL}`, color: C.tx,
          fontSize: 14, cursor: "pointer", fontFamily: "inherit",
        }}>Passer</button>
        <button type="button" aria-label={paused ? "Reprendre" : "Pause"}
          onClick={act((t) => setSt((s) => (s.pausedAtMs != null ? runResume(s, t) : runPause(s, t))))}
          style={{
            width: 64, height: 64, borderRadius: "50%", border: `2px solid ${C.tx}`, background: "transparent", flex: "none",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
          {paused ? <Play size={26} color={C.tx} /> : <Pause size={26} color={C.tx} />}
        </button>
        {byButton ? (
          <button type="button" disabled={paused} onClick={act((t) => setSt((s) => runNext(flat, s, t)))} style={{
            flex: 1, height: 52, border: 0, borderRadius: 12, background: C.ac, color: C.ink, opacity: paused ? 0.4 : 1,
            fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, whiteSpace: "nowrap",
          }}><Check size={18} color={C.ink} aria-hidden />{doneLabel(step)}</button>
        ) : <span style={{ flex: 1 }} />}
      </div>
    </div>
  );
}
