/**
 * Minuteur plein écran de la séance spécifique (planche Ath2SeanceSpecifique) :
 * effort en orange, récup en bleu (le prochain exercice passe au premier plan),
 * tour en cours et exercices du tour en bas.
 */
import { useEffect } from "react";
import type { FlatExecStep } from "@/features/athlete/hooks/useSpecificExecution";
import { formatTarget } from "@/lib/energy/formatTarget";
import { PaceEquivalents } from "@/features/shared/components/PaceEquivalents";
import { stepDistanceM } from "@/lib/energy/paceEquivalents";
import { StationIcon } from "@/features/shared/components/seance/StationIcon";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { C, alpha } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import {
  PHASE_LABEL, fmtClock, fmtShort, isRestStep, nextWork, roundOf, roundView, stepDetail, stepSeconds, stepTitle, wodSummary,
} from "@/lib/specificTimer";

interface Props {
  flat: readonly FlatExecStep[];
  index: number;
  secondsLeft: number;
  /** EMOM : secondes restantes dans la minute (null hors départ fixe). */
  minuteLeft?: number | null;
  elapsed: number;
  onSkip: () => void;
  /** « Terminer » : arrête le minuteur (format WOD : retour athlète). */
  onFinish: () => void;
  /** VMA de l'athlète en km/h — sans elle, pas de « % VMA » dans les équivalences. */
  vma?: number | null;
}

const LABEL = { ...MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: C.tx3 };

export default function ExecutionCard({ flat, index, secondsLeft, minuteLeft = null, elapsed, onSkip, onFinish, vma }: Props) {
  const current = flat[index];
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  if (!current) return null;

  const { step } = current;
  const rest = isRestStep(step);
  const color = rest ? TYPE_COLOR.energie : TYPE_COLOR.hyrox;
  const emom = current.emom ?? null;
  // EMOM : le gros chrono suit la minute, sauf pendant un effort chronométré.
  const minuteClock = !!emom && (emom.gap || stepSeconds(step) === 0);
  const total = minuteClock && emom ? emom.every : stepSeconds(step);
  const clock = minuteClock ? (minuteLeft ?? emom?.every ?? 0) : secondsLeft;
  const round = roundOf(current);
  const view = roundView(flat, index);
  const upcoming = rest ? nextWork(flat, index) : null;
  const afterUpcoming = upcoming ? nextWork(flat, flat.indexOf(upcoming)) : null;
  const following = rest ? null : flat[index + 1] ?? null;
  const followingWork = !rest ? nextWork(flat, index) : null;
  const target = step.type !== "exercise" && step.target ? formatTarget(step.target) : "";
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - clock / total)) : 0;

  const hero = rest && upcoming ? upcoming.step : step;
  const heroDetail = rest && upcoming ? [fmtShort(stepSeconds(upcoming.step)), stepDetail(upcoming.step)].filter((s) => s && s !== "0 s").join(" · ") : stepDetail(step);

  const ensuite = !rest && following
    ? isRestStep(following.step)
      ? `${PHASE_LABEL[following.step.role] ?? "Récup"} ${fmtShort(stepSeconds(following.step))}${followingWork ? `, puis ${stepTitle(followingWork.step)}` : ""}`
      : stepTitle(following.step)
    : null;

  const btn = (label: string, onClick: () => void, primary: boolean) => (
    <button type="button" onClick={onClick} style={{
      flex: 1, height: 52, borderRadius: 12, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
      background: primary ? color : "transparent", color: primary ? C.bg : C.tx, border: primary ? "none" : `1px solid ${alpha(C.tx, 0.18)}`,
    }}>{label}</button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Minuteur" style={{ position: "fixed", inset: 0, zIndex: 200, background: C.bg, color: C.tx, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 0px) + 16px) 20px 20px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ ...LABEL, color: TYPE_COLOR.hyrox }}>{wodSummary(flat)}</span>
          <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>{fmtClock(elapsed)}</span>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          {round && emom ? (
            <span style={{ ...DISPLAY, fontSize: 22, fontWeight: 300 }}>{emom.every === 60 ? "Minute" : "Départ"} <span style={{ ...MONO, fontSize: 26 }}>{round.round}</span> <span style={{ color: C.tx3 }}>/ {round.rounds}</span></span>
          ) : round ? (
            <span style={{ ...DISPLAY, fontSize: 22, fontWeight: 300 }}>Tour <span style={{ ...MONO, fontSize: 26 }}>{round.round}</span> <span style={{ color: C.tx3 }}>/ {round.rounds}</span></span>
          ) : current.roundLabel ? (
            <span style={{ ...DISPLAY, fontSize: 20, fontWeight: 300 }}>{current.roundLabel}</span>
          ) : (
            <span style={{ ...DISPLAY, fontSize: 20, fontWeight: 300 }}>Étape {index + 1} / {flat.length}</span>
          )}
          {view.names.length > 0 && view.current >= 0 && (
            <span style={{ fontSize: 12.5, color: C.tx2 }}>{rest ? "ensuite " : ""}exercice {view.current + 1} / {view.names.length}</span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "18px 0 6px" }}>
          <span style={{ ...LABEL, color }}>{rest ? (PHASE_LABEL[step.role] ?? "Récup") : step.type === "exercise" ? "Effort" : (PHASE_LABEL[step.role] ?? step.role)}</span>
          <span style={{ ...MONO, fontSize: 84, lineHeight: 1, color, fontVariantNumeric: "tabular-nums" }}>{total > 0 ? fmtClock(clock) : "—"}</span>
          {total > 0 && <span style={{ ...MONO, fontSize: 13, color: C.tx3 }}>{minuteClock ? (emom?.every === 60 ? "reste dans la minute" : "avant le départ suivant") : `sur ${fmtClock(total)}`}</span>}
          {emom && !minuteClock && minuteLeft != null && (
            <span style={{ ...MONO, fontSize: 13, color: C.tx2 }}>{fmtClock(minuteLeft)} {emom.every === 60 ? "dans la minute" : "avant le départ suivant"}</span>
          )}
          {total > 0 && (
            <div aria-hidden style={{ width: "100%", height: 4, borderRadius: 2, background: alpha(C.tx, 0.1), marginTop: 10, overflow: "hidden" }}>
              <div style={{ width: `${progress * 100}%`, height: "100%", background: color, transition: "width 1s linear" }} />
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 16, borderRadius: 14, background: alpha(color, 0.08), border: `1px solid ${alpha(color, 0.35)}` }}>
          {rest && upcoming && <span style={LABEL}>Prochain exercice</span>}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {hero.type === "exercise" && <StationIcon name={stepTitle(hero)} size={28} />}
            <span style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.2 }}>{rest && !upcoming ? stepTitle(step) : stepTitle(hero)}</span>
          </div>
          {heroDetail && <span style={{ fontSize: 13.5, color: C.tx2 }}>{heroDetail}</span>}
          {target && target !== "Libre" && !rest && <span style={{ ...MONO, fontSize: 13, color }}>{target}</span>}
          {!rest && step.type !== "exercise" && (
            <PaceEquivalents target={step.target} repDistanceM={stepDistanceM(step.duration)} vma={vma} omitPrimary align="left" />
          )}
        </div>

        {ensuite && (
          <div style={{ fontSize: 13, color: C.tx2 }}>
            <span style={LABEL}>Ensuite</span> <span style={{ marginLeft: 6 }}>{ensuite}</span>
          </div>
        )}
        {rest && afterUpcoming && (
          <div style={{ fontSize: 13, color: C.tx2 }}>
            <span style={LABEL}>Puis</span> <span style={{ marginLeft: 6 }}>{stepTitle(afterUpcoming.step)}</span>
          </div>
        )}

        {view.names.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={LABEL}>Ce tour</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {view.names.map((n, i) => {
                const on = i === view.current;
                const done = i < view.current;
                return (
                  <span key={`${n}-${i}`} style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: 12.5,
                    background: on ? alpha(color, 0.16) : "transparent", border: `1px solid ${on ? color : alpha(C.tx, 0.18)}`,
                    color: on ? C.tx : done ? C.tx3 : C.tx2, textDecoration: done ? "line-through" : "none",
                  }}>{n}</span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", borderTop: `1px solid ${C.brd}`, background: C.bg }}>
        <div style={{ display: "flex", gap: 10, maxWidth: 448, margin: "0 auto" }}>
          {btn(total > 0 ? "Passer" : "Fait", onSkip, total === 0)}
          {btn("Terminer", onFinish, total > 0)}
        </div>
      </div>
    </div>
  );
}
