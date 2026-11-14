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
import { cn } from "@/lib/utils";
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

const LABEL = "agon-mono text-[11px] uppercase tracking-[0.14em] text-agon-tx3";

/** Effort en orange (HYROX), récup en bleu (énergie). */
const TONE = {
  effort: {
    text: "text-agon-type-hyrox",
    fill: "bg-agon-type-hyrox",
    card: "border-agon-type-hyrox/[0.35] bg-agon-type-hyrox/[0.08]",
    chip: "border-agon-type-hyrox bg-agon-type-hyrox/[0.16]",
  },
  recup: {
    text: "text-agon-type-energie",
    fill: "bg-agon-type-energie",
    card: "border-agon-type-energie/[0.35] bg-agon-type-energie/[0.08]",
    chip: "border-agon-type-energie bg-agon-type-energie/[0.16]",
  },
};

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
  const tone = rest ? TONE.recup : TONE.effort;
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

  // EMOM : le repos qui suit n'a pas de durée fixe, c'est le reste de la minute.
  const followingRest = following && isRestStep(following.step)
    ? following.emom?.gap
      ? following.emom.round >= following.emom.rounds
        ? "Fin du dernier tour"
        : following.emom.every === 60 ? "Repos jusqu'à la minute suivante" : "Repos jusqu'au départ suivant"
      : `${PHASE_LABEL[following.step.role] ?? "Récup"} ${fmtShort(stepSeconds(following.step))}`
    : null;
  const ensuite = !rest && following
    ? followingRest
      ? `${followingRest}${followingWork ? `, puis ${stepTitle(followingWork.step)}` : ""}`
      : stepTitle(following.step)
    : null;

  const btn = (label: string, onClick: () => void, primary: boolean) => (
    <button type="button" onClick={onClick} className={cn(
      "h-[52px] flex-1 cursor-pointer rounded-xl font-[inherit] text-[15px] font-semibold",
      primary ? cn("border-none text-agon-ink", tone.fill) : "border border-agon-tx/[0.18] bg-transparent text-agon-tx",
    )}>{label}</button>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label="Minuteur" className="fixed inset-0 z-[200] flex flex-col bg-agon-bg text-agon-tx">
      <div className="mx-auto box-border flex w-full max-w-[480px] flex-1 flex-col gap-[18px] overflow-y-auto px-5 pb-5 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <div className="flex items-center justify-between">
          <span className={cn(LABEL, "text-agon-type-hyrox")}>{wodSummary(flat)}</span>
          <span className="agon-mono text-[13px] text-agon-tx2">{fmtClock(elapsed)}</span>
        </div>

        <div className="flex items-baseline gap-2">
          {round && emom ? (
            <span className="agon-display text-[22px]">{emom.every === 60 ? "Minute" : "Départ"} <span className="agon-mono text-[26px]">{round.round}</span> <span className="text-agon-tx3">/ {round.rounds}</span></span>
          ) : round ? (
            <span className="agon-display text-[22px]">Tour <span className="agon-mono text-[26px]">{round.round}</span> <span className="text-agon-tx3">/ {round.rounds}</span></span>
          ) : current.roundLabel ? (
            <span className="agon-display text-[20px]">{current.roundLabel}</span>
          ) : (
            <span className="agon-display text-[20px]">Étape {index + 1} / {flat.length}</span>
          )}
          {view.names.length > 0 && view.current >= 0 && (
            <span className="text-[12.5px] text-agon-tx2">{rest ? "ensuite " : ""}exercice {view.current + 1} / {view.names.length}</span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 pb-1.5 pt-[18px]">
          <span className={cn(LABEL, tone.text)}>{rest ? (PHASE_LABEL[step.role] ?? "Récup") : step.type === "exercise" ? "Effort" : (PHASE_LABEL[step.role] ?? step.role)}</span>
          <span className={cn("agon-mono text-[84px] leading-none", tone.text)}>{total > 0 ? fmtClock(clock) : "—"}</span>
          {total > 0 && <span className="agon-mono text-[13px] text-agon-tx3">{minuteClock ? (emom?.every === 60 ? "reste dans la minute" : "avant le départ suivant") : `sur ${fmtClock(total)}`}</span>}
          {emom && !minuteClock && minuteLeft != null && (
            <span className="agon-mono text-[13px] text-agon-tx2">{fmtClock(minuteLeft)} {emom.every === 60 ? "dans la minute" : "avant le départ suivant"}</span>
          )}
          {total > 0 && (
            <div aria-hidden className="mt-2.5 h-1 w-full overflow-hidden rounded-[2px] bg-agon-tx/[0.1]">
              <div className={cn("h-full [transition:width_1s_linear]", tone.fill)} style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>

        <div className={cn("flex flex-col gap-1.5 rounded-[14px] border p-4", tone.card)}>
          {rest && upcoming && <span className={LABEL}>Prochain exercice</span>}
          <div className="flex items-center gap-3">
            {hero.type === "exercise" && <StationIcon name={stepTitle(hero)} size={28} />}
            <span className="text-[22px] font-medium leading-[1.2]">{rest && !upcoming ? stepTitle(step) : stepTitle(hero)}</span>
          </div>
          {heroDetail && <span className="text-[13.5px] text-agon-tx2">{heroDetail}</span>}
          {target && target !== "Libre" && !rest && <span className={cn("agon-mono text-[13px]", tone.text)}>{target}</span>}
          {!rest && step.type !== "exercise" && (
            <PaceEquivalents target={step.target} repDistanceM={stepDistanceM(step.duration)} vma={vma} omitPrimary align="left" />
          )}
        </div>

        {ensuite && (
          <div className="text-[13px] text-agon-tx2">
            <span className={LABEL}>Ensuite</span> <span className="ml-1.5">{ensuite}</span>
          </div>
        )}
        {rest && afterUpcoming && (
          <div className="text-[13px] text-agon-tx2">
            <span className={LABEL}>Puis</span> <span className="ml-1.5">{stepTitle(afterUpcoming.step)}</span>
          </div>
        )}

        {view.names.length > 1 && (
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Ce tour</span>
            <div className="flex flex-wrap gap-1.5">
              {view.names.map((n, i) => {
                const on = i === view.current;
                const done = i < view.current;
                return (
                  <span key={`${n}-${i}`} className={cn(
                    "rounded-full border px-3 py-1.5 text-[12.5px]",
                    on ? cn(tone.chip, "text-agon-tx") : cn("border-agon-tx/[0.18] bg-transparent", done ? "text-agon-tx3" : "text-agon-tx2"),
                    done && "line-through",
                  )}>{n}</span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-agon-brd bg-agon-bg px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3">
        <div className="mx-auto flex max-w-[448px] gap-2.5">
          {btn(total > 0 ? "Passer" : "Fait", onSkip, total === 0)}
          {btn("Terminer", onFinish, total > 0)}
        </div>
      </div>
    </div>
  );
}
