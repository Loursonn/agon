import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Pause, Play, X } from "lucide-react";
import { C } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { DISPLAY, LABEL, MONO } from "@/features/shared/components/seance/seanceUi";
import {
  aimedSeconds, doneLabel, durPhrase, endsByButton, estimatedSeconds, flattenRun, fmtChrono, fmtDur, mainTarget, roleWord,
  roundRemaining, runNext, runPause, runResume, runStart, runTick, sessionElapsed, stepElapsed, stepPhrase,
  stepRemaining, stepTint, timedSeconds, type Refs, type RunStep, type Tint,
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

/** Hauteur d'une barre du profil : récup / libre basse, zone 5 pleine hauteur. */
const barHeight = (t: Tint) => (t.kind === "zone" ? 6 + (t.zone - 1) * 5 : 6);

/** Profil de la séance (planche EnergieTel, écran 03) : barres déjà faites estompées, curseur sur le pas en cours. */
function RunProfile({ flat, index, refs }: { flat: readonly RunStep[]; index: number; refs: Refs }) {
  return (
    <div aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 26 }}>
      {flat.map((rs, i) => {
        const t = stepTint(rs.step, refs);
        return (
          <span key={i} style={{ position: "relative", flex: `${Math.max(20, estimatedSeconds(rs.step, refs) || 60)} 1 0`, minWidth: 2, height: barHeight(t), opacity: i < index ? 0.35 : 1 }}>
            <span style={{ display: "block", height: "100%", borderRadius: "3px 3px 1px 1px", background: tintColor(t) }} />
            {i === index && <span style={{ position: "absolute", left: "50%", top: -(26 - barHeight(t)) - 4, bottom: -6, width: 2, marginLeft: -1, background: C.tx }} />}
          </span>
        );
      })}
    </div>
  );
}

/** Anneau de progression autour du chrono. */
function Ring({ size, color, frac, children }: { size: number; color: string; frac: number; children: React.ReactNode }) {
  const r = size / 2 - 8;
  const len = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac));
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ display: "block", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={12} />
        {f > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${f * len} ${len}`} />}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>{children}</div>
    </div>
  );
}

const pill = (bg: string, h = 24) => ({
  ...MONO, display: "inline-flex", alignItems: "center", height: h, padding: "0 9px", borderRadius: 999, background: bg,
  color: C.ink, fontSize: h > 20 ? 11.5 : 10.5, letterSpacing: "0.06em", fontWeight: 500, whiteSpace: "nowrap" as const,
});

/**
 * Séance d'énergie en plein écran (planche EnergieTel, écrans 03-04) : profil
 * de la séance avec curseur, série / répétition, chrono dans un anneau à la
 * couleur de la zone visée (bleu en récup), cible en grand, « Ensuite » (ou
 * « Prochaine » pendant la récup) toujours visible. Un bloc en distance se
 * termine au bouton (« 400 m fait »).
 */
export function EnergyRunScreen({ steps, refs, title, onExit }: {
  steps: EnergyStep[];
  refs: Refs;
  /** Nom de la séance, en tête d'écran. */
  title?: string;
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
  const gap = !!cur.emom?.gap;
  const recup = tint.kind === "recup" || gap;
  const target = gap ? null : mainTarget(step, refs);
  const remaining = stepRemaining(flat, st, now);
  const elapsed = stepElapsed(st, now);
  const aimed = aimedSeconds(step, refs);
  const byButton = endsByButton(step) && !gap;
  const paused = st.pausedAtMs != null;
  const depart = cur.emom && !gap ? roundRemaining(flat, st, now) : null;
  const dur = gap ? (cur.emom?.every ?? 0) : timedSeconds(step);
  // L'anneau se remplit avec le temps passé (planche : 1:12 restant sur 1:30 = 20 % rempli).
  const frac = remaining != null && dur > 0 ? 1 - remaining / dur : aimed ? elapsed / aimed : 0;
  const chrono = fmtChrono(remaining ?? elapsed);
  const note = step.type === "interval" ? step.notes?.trim() : "";

  // Série / répétition : le niveau intérieur en grand, la série englobante à gauche.
  const inner = cur.reps[cur.reps.length - 1] ?? null;
  const outer = cur.reps.length > 1 ? cur.reps[cur.reps.length - 2] : null;
  const nextRep = next?.reps[next.reps.length - 1] ?? null;
  // « puis 4 / 5 » quand la suite est une récup, sinon le numéro de la répétition suivante.
  const repOf = (rs: RunStep | undefined) => { const r = rs?.reps[rs.reps.length - 1]; return r ? `${r.n} / ${r.of}` : null; };
  const after = !next ? null
    : stepTint(next.step, refs).kind === "recup" ? (repOf(flat[st.index + 2]) ? `puis ${repOf(flat[st.index + 2])}` : null)
    : repOf(next);

  const act = (f: (t: number) => void) => () => f(Date.now());
  const exit = () => onExit(sessionElapsed(st, Date.now()), false);
  const ghost = {
    flex: 1, height: 52, borderRadius: 12, background: "transparent", border: `1px solid ${C.brdL}`, color: C.tx,
    fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div role="dialog" aria-label="Séance en cours" style={{
      position: "fixed", inset: 0, zIndex: 70, background: C.bg, color: C.tx,
      display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto",
    }}>
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 20px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" aria-label="Terminer la séance" onClick={exit} style={{
          width: 36, height: 36, boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.brdL}`, background: "transparent",
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none", padding: 0,
        }}><X size={15} color={C.tx} /></button>
        <span style={{ ...LABEL, flex: 1, color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title ?? "Séance d'énergie"}</span>
        <span aria-label="Temps écoulé" style={{ ...MONO, fontSize: 15, color: C.tx2 }}>{fmtChrono(sessionElapsed(st, now))}</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 18 }}>
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <RunProfile flat={flat} index={st.index} refs={refs} />
          {inner && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                <span style={{ fontSize: 14, color: C.tx2 }}>
                  {outer && <>Série <span style={{ ...MONO, fontSize: 18, color: C.tx }}>{outer.n}</span> <span style={MONO}>/ {outer.of}</span></>}
                </span>
                <span style={{ fontSize: 14, color: C.tx2 }}>
                  Répétition <span style={{ ...MONO, fontSize: 26, color: C.tx }}>{inner.n}</span> <span style={{ ...MONO, fontSize: 16 }}>/ {inner.of}</span>
                </span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: inner.of }, (_, i) => (
                  <span key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: i + 1 < inner.n ? TYPE_COLOR.fait : i + 1 === inner.n ? (recup ? TYPE_COLOR.fait : color) : C.s2 }} />
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ ...tintCard(color), margin: "12px 16px 0", padding: "14px 14px 16px", borderRadius: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {!recup && step.duration?.kind !== "lap_button" && (
            <div style={{ ...DISPLAY, fontWeight: 400, textAlign: "center", fontSize: 24, letterSpacing: "0.05em" }}>{durPhrase(step)}</div>
          )}
          <Ring size={recup ? 230 : 214} color={color} frac={frac}>
            <span style={pill(color)}>{gap ? "Repos" : `${tintLabel(roleWord(step), tint)}${recup && note ? ` · ${note}` : ""}`}</span>
            <span aria-live="off" style={{ ...MONO, fontSize: chrono.length > 5 ? 56 : 78, lineHeight: 1, letterSpacing: "-0.02em" }}>{chrono}</span>
            <span style={{ ...MONO, fontSize: 13, color: C.tx2, textAlign: "center", padding: "0 18px" }}>
              {remaining != null ? (dur > 0 ? `sur ${fmtDur(dur)}` : "restant") : aimed != null ? `vise ${fmtDur(aimed)}` : "le chrono monte"}
            </span>
          </Ring>
          {depart != null && <div style={{ ...MONO, textAlign: "center", fontSize: 13, color: C.tx2 }}>départ suivant dans {fmtChrono(depart)}</div>}
          {target && !recup && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 10 }}>
                <span style={{ ...MONO, fontSize: 54, lineHeight: 1, color }}>{target.value}</span>
                <span style={{ ...MONO, fontSize: 20, color: C.tx2 }}>{target.unit}</span>
              </div>
              {target.secondary && <div style={{ ...MONO, textAlign: "center", fontSize: 12, color: C.tx2, marginTop: -6 }}>{target.secondary}</div>}
            </>
          )}
          {!recup && note && <div style={{ textAlign: "center", fontSize: 14, color: C.tx2 }}>{note}</div>}
        </div>

        {recup && next ? (() => {
          // Pendant la récup : la répétition suivante déjà affichée en grand (écran 04).
          const nt = stepTint(next.step, refs);
          const nc = tintColor(nt);
          const ntarget = mainTarget(next.step, refs);
          const naimed = aimedSeconds(next.step, refs);
          return (
            <div style={{ margin: "10px 16px 0", padding: 14, borderRadius: 16, background: `${nc}12`, border: `1px solid ${nc}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ ...LABEL, color: C.tx2 }}>Prochaine{nextRep ? ` · ${nextRep.n} / ${nextRep.of}` : ""}</span>
                {nt.kind === "zone" && <span style={pill(nc, 20)}>Z{nt.zone}</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 6, gap: 10 }}>
                <span style={{ fontSize: 24, fontWeight: 500 }}>{next.step.duration?.kind === "lap_button" ? roleWord(next.step) : durPhrase(next.step)}</span>
                {ntarget && <span style={{ ...MONO, fontSize: 34, lineHeight: 1, color: nc, whiteSpace: "nowrap" }}>{ntarget.value}<span style={{ fontSize: 15, color: C.tx2 }}>{ntarget.unit}</span></span>}
              </div>
              {(naimed != null || ntarget?.secondary) && (
                <div style={{ ...MONO, fontSize: 12, color: C.tx2, marginTop: 4 }}>{naimed != null ? `vise ${fmtDur(naimed)}` : ntarget?.secondary}</div>
              )}
            </div>
          );
        })() : (
          <div style={{ margin: "10px 16px 0", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}` }}>
            <span aria-hidden style={{ width: 8, height: 34, borderRadius: 3, flex: "none", background: next ? tintColor(stepTint(next.step, refs)) : C.brdL }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...LABEL }}>Ensuite</span>
              <div style={{ fontSize: 15, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {next ? (next.emom?.gap ? "Repos jusqu'au départ suivant" : stepPhrase(next.step, refs)) : "Fin de la séance"}
              </div>
            </div>
            {after && <span style={{ ...MONO, fontSize: 12.5, color: C.tx2, whiteSpace: "nowrap" }}>{after}</span>}
          </div>
        )}
        {paused && <div style={{ ...MONO, textAlign: "center", fontSize: 13, color: C.tx2, marginTop: 10 }}>En pause</div>}
      </div>

      <div style={{
        padding: "14px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderTop: `1px solid ${C.brd}`,
        background: C.bg, display: "flex", alignItems: "center", gap: 12,
      }}>
        <button type="button" onClick={act((t) => setSt((s) => runNext(flat, s, t)))} style={ghost}>Passer</button>
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
        ) : (
          <button type="button" onClick={exit} style={{ ...ghost, color: C.tx2 }}>Terminer</button>
        )}
      </div>
    </div>
  );
}
