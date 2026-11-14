import { useEffect, useState, type ReactNode } from "react";
import { AgonMark } from "@/features/shared/components/AgonMark";
import { Check, Dumbbell, HeartPulse, Users } from "lucide-react";
import { toast } from "sonner";
import { markOnboarded } from "@/api/profile";
import { ProviderCards } from "@/features/shared/components/ConnectedServicesSection";
import { C, alpha } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { TYPE_COLOR } from "@/lib/peps";
import { finishLocally, saveStep, savedStep } from "@/lib/onboarding";

/** Ressenti 1 → 5 : du rouge au vert, comme le wellness. Le 4 (ancien vert acide) passe à
 *  l'or de marque : en vert il serait identique au 5. */
const FEEL_COLOR = [C.rouge, C.blocCore, C.o, C.ac, C.g];
const ROWS = [
  { key: "fatigue", label: "Récupération" },
  { key: "sommeil", label: "Sommeil" },
  { key: "energie", label: "Énergie" },
] as const;
type RowKey = (typeof ROWS)[number]["key"];

const H1 = "agon-display m-0 text-[28px] font-light leading-[1.12] tracking-[0.06em]";
const LEAD = "mt-1.5 text-[13px] leading-[1.45] text-agon-tx2";

interface Props {
  uid: string;
  firstName: string;
  coachName: string | null;
  /** Enregistre le premier wellness (mêmes règles que le wellness du matin). */
  saveWellness: (data: Record<string, unknown>) => void | Promise<boolean>;
  onDone: () => void;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <AgonMark size={24} />
      <span className="agon-display text-[12px] font-normal leading-none tracking-[0.32em]">Agon</span>
    </div>
  );
}

function Dots({ at }: { at: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label={`Écran ${at + 1} sur 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 rounded-[3px] transition-[width] [transition-duration:200ms] [transition-timing-function:ease]",
            i === at ? "w-5 bg-agon-accent" : "w-1.5 bg-agon-tx/[0.18]",
          )}
        />
      ))}
    </div>
  );
}

function Point({ color, icon, title, text }: { color: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3.5 border-t border-agon-brd py-3.5">
      <span
        className="flex size-10 flex-none items-center justify-center rounded-xl border"
        style={{ background: alpha(color, 0.14), borderColor: alpha(color, 0.4), color }}
      >
        {icon}
      </span>
      <div>
        <div className="text-[15px] font-medium">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-[1.45] text-agon-tx2">{text}</div>
      </div>
    </div>
  );
}

/**
 * Premier lancement athlète (planche Ath1Onboarding), après l'accord sur les
 * données de santé : bienvenue, montre (facultatif), premier wellness court.
 * « Passer » mène direct à Aujourd'hui. Les bulles d'aide suivent sur
 * Aujourd'hui (`TodayTips`).
 */
export function AthleteOnboarding({ uid, firstName, coachName, saveWellness, onDone }: Props) {
  const [step, setStep] = useState(() => savedStep(uid));
  const [vals, setVals] = useState<Partial<Record<RowKey, number>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { saveStep(uid, step); }, [uid, step]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const finish = (withTips: boolean) => {
    finishLocally(uid, withTips);
    // Le profil garde la fin du parcours : il ne revient pas sur un autre appareil.
    markOnboarded().catch(() => { /* rejoué au prochain lancement sur un autre appareil, sans gêne ici */ });
    onDone();
  };

  const allAnswered = ROWS.every((r) => vals[r.key] != null);
  async function validateWellness() {
    if (!allAnswered || saving) return;
    setSaving(true);
    try {
      const ok = await saveWellness({ ...vals });
      if (ok === false) { setSaving(false); return; }
    } catch {
      setSaving(false);
      toast.error("Wellness non enregistré : réessaie dans un instant.");
      return;
    }
    finish(true);
  }

  const btn = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-[52px] w-full rounded-xl border-none bg-agon-accent font-[inherit] text-[15px] font-semibold text-agon-ink",
        disabled ? "cursor-default opacity-[0.45]" : "cursor-pointer",
      )}
    >
      {label}
    </button>
  );

  const shell = (top: ReactNode, body: ReactNode, footer: ReactNode) => (
    <div role="dialog" aria-modal="true" aria-label="Bienvenue dans Agon" className="fixed inset-0 z-[300] flex flex-col bg-agon-bg text-agon-tx">
      <div className="mx-auto box-border flex w-full max-w-[480px] flex-1 flex-col gap-4 overflow-y-auto px-5 pb-[160px] pt-[calc(env(safe-area-inset-top,0px)+20px)]">
        <div className="flex items-center justify-between">
          <Logo />
          {top}
        </div>
        {body}
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-agon-brd bg-agon-bg px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-3">
        <div className="mx-auto flex max-w-[448px] flex-col gap-3">
          <Dots at={step} />
          {footer}
        </div>
      </div>
    </div>
  );

  const skip = <button type="button" onClick={() => finish(false)} className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[13px] text-agon-tx2">Passer</button>;

  if (step === 0) {
    return shell(
      skip,
      <>
        <div className="mt-11 flex justify-center">
          <div className="relative size-[132px]">
            <span className="absolute inset-0 rounded-full border-[1.5px] border-agon-accent" />
            <span className="absolute inset-6 rounded-full border border-agon-tx/[0.18]" />
            <span className="absolute inset-[42px] flex"><AgonMark size={48} /></span>
          </div>
        </div>
        <div className="mt-[26px]">
          <h1 className={H1}>Bienvenue,<br />{firstName}</h1>
          <div className={LEAD}>Agon réunit ton programme, ton ressenti et ton coach au même endroit.</div>
        </div>
        <div className="mt-1">
          <Point color={C.ac} icon={<Dumbbell size={18} strokeWidth={1.75} />} title="Ta séance du jour" text="Prête à lancer, charges et récup comprises." />
          <Point color={TYPE_COLOR.fait} icon={<HeartPulse size={18} strokeWidth={1.75} />} title="Ton ressenti en 30 secondes" text="Un wellness le matin, tes charges pendant la séance." />
          <Point color={TYPE_COLOR.energie} icon={<Users size={18} strokeWidth={1.75} />} title="Ton coach suit tout" text={`${coachName ?? "Ton coach"} voit tes retours et ajuste ton programme.`} />
        </div>
      </>,
      btn("Commencer", () => setStep(1)),
    );
  }

  if (step === 1) {
    return shell(
      null,
      <>
        <div className="mt-[34px]">
          <h1 className={cn(H1, "text-[26px]")}>Lie ta montre</h1>
          <div className={LEAD}>Facultatif. Tes activités et ta nuit arrivent seules dans Agon, ton coach les voit.</div>
        </div>
        <ProviderCards />
        <div className="flex flex-col gap-2 rounded-[14px] border border-dashed border-agon-tx/[0.18] p-3.5">
          {[
            "Chaque donnée garde le nom de la montre, ex. « Garmin Forerunner 265 ».",
            "On te demande ton accord avant de partager quoi que ce soit.",
            "Tu délies ta montre quand tu veux, depuis ton profil.",
          ].map((t) => (
            <div key={t} className="flex gap-2.5 text-[12.5px] leading-[1.45] text-agon-tx2">
              <Check size={15} color={C.g} strokeWidth={2} className="mt-0.5 flex-none" />
              <span>{t}</span>
            </div>
          ))}
        </div>
        <div className="text-[12.5px] text-agon-tx3">Pas de montre ? Aucun souci : tu notes ton sommeil dans le wellness.</div>
      </>,
      btn("Plus tard", () => setStep(2)),
    );
  }

  return shell(
    null,
    <>
      <div className="mt-[34px]">
        <h1 className={cn(H1, "text-[26px]")}>Comment tu te sens&nbsp;?</h1>
        <div className={LEAD}>Ton premier wellness, en 3 tapes. Demain, la version complète prendra 30 secondes.</div>
      </div>
      <div className="-mb-1.5 flex justify-between text-[11.5px] text-agon-tx3">
        <span>1 = très mauvais</span><span>5 = au top</span>
      </div>
      {ROWS.map((r) => (
        <div key={r.key} className="flex flex-col gap-2 rounded-[14px] border border-agon-brd bg-agon-s1 p-3.5">
          <div className="text-[15px] font-medium">{r.label}</div>
          <div className="flex gap-1.5">
            {FEEL_COLOR.map((c, i) => {
              const n = i + 1;
              const on = vals[r.key] === n;
              return (
                <button key={n} type="button" aria-pressed={on} aria-label={`${r.label} ${n} sur 5`} onClick={() => setVals((v) => ({ ...v, [r.key]: n }))}
                  className="agon-mono h-[46px] flex-1 cursor-pointer rounded-[10px] border text-[17px]"
                  style={{ background: on ? c : alpha(c, 0.08), color: on ? C.ink : c, borderColor: on ? c : alpha(c, 0.3) }}>
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>,
    btn(saving ? "Enregistrement…" : "Valider", () => void validateWellness(), !allAnswered || saving),
  );
}
