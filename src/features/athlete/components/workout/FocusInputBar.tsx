import { C } from "@/lib/theme";
import { MONO } from "@/features/shared/components/seance/seanceUi";
import { TYPE_COLOR } from "@/lib/peps";

export interface FocusPending {
  exName: string;
  /** Série proposée, numérotée à partir de 1. */
  setNumber: number;
  setCount: number;
  kg: string;
  reps: string;
  /** « kg », « % » ou rien (poids du corps). */
  unit: string;
  /** Série isométrique : « reps » = secondes. */
  isIso: boolean;
  /** Superset : « Superset · ex. 2 / 2 ». */
  supersetTag?: string;
}

const fmt = (v: string) => (v ? String(v).replace(".", ",") : "—");

function Stepper({ label, hint, value, unit, onMinus, onPlus, onTap }: {
  label: string; hint: string; value: string; unit?: string;
  onMinus: () => void; onPlus: () => void; onTap: () => void;
}) {
  const btn = { width: 46, height: 46, borderRadius: 12, background: C.s2, border: "1px solid " + C.brdL, color: C.tx, ...MONO, fontSize: 22, cursor: "pointer", flex: "none" as const, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{label}</span>
        <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{hint}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button type="button" aria-label={`${label} : moins`} onClick={onMinus} style={btn}>−</button>
        <button
          type="button"
          aria-label={`${label} : saisir au pavé`}
          onClick={onTap}
          style={{ flex: 1, minWidth: 0, height: 46, borderRadius: 12, border: "1px solid " + C.brd, background: "transparent", color: C.tx, cursor: "pointer", display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3, padding: 0 }}
        >
          <span style={{ ...MONO, fontSize: 20, whiteSpace: "nowrap" }}>{fmt(value)}</span>
          {unit && <span style={{ ...MONO, fontSize: 12, color: C.tx3 }}>{unit}</span>}
        </button>
        <button type="button" aria-label={`${label} : plus`} onClick={onPlus} style={btn}>+</button>
      </div>
    </div>
  );
}

/**
 * Zone de saisie « Un pouce » (maquette « Séance en cours ») : bloc courant,
 * charge ± et reps ±, gros bouton « Valider série », navigation de bloc.
 * Toucher une valeur ouvre le pavé maison.
 */
export function FocusInputBar({
  blocLabel,
  blocIndex,
  blocCount,
  onPrev,
  onNext,
  pending,
  kgStep,
  onKgStep,
  onRepsStep,
  onKgTap,
  onRepsTap,
  onValidate,
  restLabel,
  rest,
  allDone,
  onFinish,
  onShowAll,
}: {
  blocLabel: string;
  blocIndex: number;
  blocCount: number;
  onPrev: () => void;
  onNext: () => void;
  pending: FocusPending | null;
  kgStep: number;
  onKgStep: (delta: number) => void;
  onRepsStep: (delta: number) => void;
  onKgTap: () => void;
  onRepsTap: () => void;
  onValidate: () => void;
  /** « Lance la récup de 1:30 » sous le bouton. */
  restLabel: string | null;
  /** Récup en cours (lancée par une série validée) : compte à rebours dans la zone. */
  rest?: { left: number; total: number; next: string | null; onStop: () => void } | null;
  allDone: boolean;
  onFinish: () => void;
  onShowAll: () => void;
}) {
  const navBtn = (disabled: boolean) => ({ width: 36, height: 36, borderRadius: 10, border: "1px solid " + C.brdL, background: "transparent", color: disabled ? C.tx3 : C.tx, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flex: "none" as const });
  const hasNext = blocIndex < blocCount - 1;
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 64, zIndex: 20, background: C.bg, borderTop: "1px solid " + C.brd, padding: "10px 16px 12px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" aria-label="Bloc précédent" disabled={blocIndex === 0} onClick={onPrev} style={navBtn(blocIndex === 0)}>‹</button>
          <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
            <div style={{ ...MONO, fontSize: 11, color: C.tx2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {blocLabel} · {blocIndex + 1} / {blocCount}
            </div>
            {pending && (
              <div style={{ fontSize: 12, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pending.supersetTag ? `${pending.supersetTag} · ` : ""}{pending.exName} · série {pending.setNumber} / {pending.setCount}
              </div>
            )}
          </div>
          <button type="button" aria-label="Bloc suivant" disabled={!hasNext} onClick={onNext} style={navBtn(!hasNext)}>›</button>
        </div>

        {pending ? (
          <>
            <div style={{ display: "flex", gap: 12 }}>
              <Stepper
                label={pending.unit === "%" ? "Charge (%)" : "Charge"}
                hint={`± ${String(kgStep).replace(".", ",")}`}
                value={pending.kg}
                unit={pending.unit === "kg" ? "kg" : pending.unit === "%" ? "%" : undefined}
                onMinus={() => onKgStep(-kgStep)}
                onPlus={() => onKgStep(kgStep)}
                onTap={onKgTap}
              />
              <Stepper
                label={pending.isIso ? "Secondes" : "Reps"}
                hint={pending.isIso ? "± 5" : "± 1"}
                value={pending.reps}
                onMinus={() => onRepsStep(pending.isIso ? -5 : -1)}
                onPlus={() => onRepsStep(pending.isIso ? 5 : 1)}
                onTap={onRepsTap}
              />
            </div>
            <button
              type="button"
              onClick={onValidate}
              style={{ width: "100%", height: 54, borderRadius: 12, border: "none", background: TYPE_COLOR.fait, color: C.bg, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Valider série {pending.setNumber}
              {pending.kg || pending.reps ? ` · ${pending.kg ? fmt(pending.kg) + (pending.unit === "kg" ? " kg" : pending.unit === "%" ? " %" : "") : "PDC"} × ${fmt(pending.reps)}${pending.isIso ? " s" : ""}` : ""}
            </button>
            {rest ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...MONO, fontSize: 18, color: rest.left <= 10 ? C.ac : C.tx, minWidth: 52 }}>
                  {Math.floor(rest.left / 60)}:{String(rest.left % 60).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ height: 4, borderRadius: 2, background: C.s2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${rest.total > 0 ? Math.max(0, Math.min(100, (rest.left / rest.total) * 100)) : 0}%`, background: C.ac, transition: "width 1s linear" }} />
                  </div>
                  <span style={{ fontSize: 11.5, color: C.tx3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Récup{rest.next ? ` · ensuite ${rest.next}` : ""}</span>
                </div>
                <button type="button" onClick={rest.onStop} style={{ height: 32, padding: "0 10px", borderRadius: 10, border: "1px solid " + C.brdL, background: "transparent", color: C.tx, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Passer</button>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.tx3 }}>
              <span>{rest ? "" : restLabel ?? ""}</span>
              <button type="button" onClick={onShowAll} style={{ background: "none", border: "none", padding: 0, color: C.ac, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Toute la séance</button>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            {hasNext && !allDone && (
              <button type="button" onClick={onNext} style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Bloc suivant ›
              </button>
            )}
            <button
              type="button"
              onClick={onFinish}
              style={{ flex: 1, height: 52, borderRadius: 12, border: allDone ? "none" : "1px solid " + C.brdL, background: allDone ? TYPE_COLOR.fait : "transparent", color: allDone ? C.bg : C.tx, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Terminer la séance
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
