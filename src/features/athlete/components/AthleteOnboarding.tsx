import { useEffect, useState, type ReactNode } from "react";
import { AgonMark } from "@/features/shared/components/AgonMark";
import { Check, Dumbbell, HeartPulse, Users } from "lucide-react";
import { toast } from "sonner";
import { markOnboarded } from "@/api/profile";
import { ProviderCards } from "@/features/shared/components/ConnectedServicesSection";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";
import { C, alpha, H } from "@/lib/theme";
import { TYPE_COLOR } from "@/lib/peps";
import { finishLocally, saveStep, savedStep } from "@/lib/onboarding";

/** Ressenti 1 → 5 : du rouge au vert, comme le wellness. */
const FEEL_COLOR = [C.rouge, C.blocCore, C.o, H.vertAcide, C.g];
const ROWS = [
  { key: "fatigue", label: "Récupération" },
  { key: "sommeil", label: "Sommeil" },
  { key: "energie", label: "Énergie" },
] as const;
type RowKey = (typeof ROWS)[number]["key"];

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
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <AgonMark size={24} />
      <span style={{ ...DISPLAY, fontWeight: 400, fontSize: 12, letterSpacing: "0.32em", lineHeight: 1 }}>Agon</span>
    </div>
  );
}

function Dots({ at }: { at: number }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "center" }} aria-label={`Écran ${at + 1} sur 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ width: i === at ? 20 : 6, height: 6, borderRadius: 3, background: i === at ? C.ac : alpha(C.tx, 0.18), transition: "width .2s" }} />
      ))}
    </div>
  );
}

function Point({ color, icon, title, text }: { color: string; icon: ReactNode; title: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0", borderTop: `1px solid ${C.brd}` }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: alpha(color, 0.14), border: `1px solid ${alpha(color, 0.4)}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", color }}>
        {icon}
      </span>
      <div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: C.tx2, marginTop: 2, lineHeight: 1.45 }}>{text}</div>
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
    <button type="button" disabled={disabled} onClick={onClick} style={{ height: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontWeight: 600, fontSize: 15, fontFamily: "inherit", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, width: "100%" }}>
      {label}
    </button>
  );

  const shell = (top: ReactNode, body: ReactNode, footer: ReactNode) => (
    <div role="dialog" aria-modal="true" aria-label="Bienvenue dans Agon" style={{ position: "fixed", inset: 0, zIndex: 300, background: C.bg, color: C.tx, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "calc(env(safe-area-inset-top, 0px) + 20px) 20px 160px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Logo />
          {top}
        </div>
        {body}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)", background: C.bg, borderTop: `1px solid ${C.brd}` }}>
        <div style={{ maxWidth: 448, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <Dots at={step} />
          {footer}
        </div>
      </div>
    </div>
  );

  const skip = <button type="button" onClick={() => finish(false)} style={{ fontSize: 13, color: C.tx2, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Passer</button>;

  if (step === 0) {
    return shell(
      skip,
      <>
        <div style={{ marginTop: 44, display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 132, height: 132 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${C.ac}` }} />
            <span style={{ position: "absolute", inset: 24, borderRadius: "50%", border: `1px solid ${alpha(C.tx, 0.18)}` }} />
            <span style={{ position: "absolute", inset: 42, display: "flex" }}><AgonMark size={48} /></span>
          </div>
        </div>
        <div style={{ marginTop: 26 }}>
          <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 300, fontSize: 28, lineHeight: 1.12, letterSpacing: "0.06em" }}>Bienvenue,<br />{firstName}</h1>
          <div style={{ fontSize: 13, color: C.tx2, marginTop: 6, lineHeight: 1.45 }}>Agon réunit ton programme, ton ressenti et ton coach au même endroit.</div>
        </div>
        <div style={{ marginTop: 4 }}>
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
        <div style={{ marginTop: 34 }}>
          <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 300, fontSize: 26, lineHeight: 1.12, letterSpacing: "0.06em" }}>Lie ta montre</h1>
          <div style={{ fontSize: 13, color: C.tx2, marginTop: 6, lineHeight: 1.45 }}>Facultatif. Tes activités et ta nuit arrivent seules dans Agon, ton coach les voit.</div>
        </div>
        <ProviderCards />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 14, border: `1px dashed ${alpha(C.tx, 0.18)}` }}>
          {[
            "Chaque donnée garde le nom de la montre, ex. « Garmin Forerunner 265 ».",
            "On te demande ton accord avant de partager quoi que ce soit.",
            "Tu délies ta montre quand tu veux, depuis ton profil.",
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 10, fontSize: 12.5, color: C.tx2, lineHeight: 1.45 }}>
              <Check size={15} color={C.g} strokeWidth={2} style={{ flex: "none", marginTop: 2 }} />
              <span>{t}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: C.tx3 }}>Pas de montre ? Aucun souci : tu notes ton sommeil dans le wellness.</div>
      </>,
      btn("Plus tard", () => setStep(2)),
    );
  }

  return shell(
    null,
    <>
      <div style={{ marginTop: 34 }}>
        <h1 style={{ ...DISPLAY, margin: 0, fontWeight: 300, fontSize: 26, lineHeight: 1.12, letterSpacing: "0.06em" }}>Comment tu te sens&nbsp;?</h1>
        <div style={{ fontSize: 13, color: C.tx2, marginTop: 6, lineHeight: 1.45 }}>Ton premier wellness, en 3 tapes. Demain, la version complète prendra 30 secondes.</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.tx3, marginBottom: -6 }}>
        <span>1 = très mauvais</span><span>5 = au top</span>
      </div>
      {ROWS.map((r) => (
        <div key={r.key} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 14, background: C.s1, border: `1px solid ${C.brd}` }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{r.label}</div>
          <div style={{ display: "flex", gap: 6 }}>
            {FEEL_COLOR.map((c, i) => {
              const n = i + 1;
              const on = vals[r.key] === n;
              return (
                <button key={n} type="button" aria-pressed={on} aria-label={`${r.label} ${n} sur 5`} onClick={() => setVals((v) => ({ ...v, [r.key]: n }))}
                  style={{ flex: 1, height: 46, borderRadius: 10, ...MONO, fontSize: 17, cursor: "pointer", background: on ? c : alpha(c, 0.08), color: on ? C.bg : c, border: `1px solid ${on ? c : alpha(c, 0.3)}` }}>
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
