import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { DISPLAY, MONO } from "@/features/shared/components/seance/seanceUi";

/** Forme 1 → 5 de la maquette « Séance · fin » : rouge → vert. */
const FORME_COLORS = ["#FF3B1F", "#FF7A1F", "#FFC933", "#A8E83A", "#66F03C"];
const FORME_LABELS = ["Très dure", "Dure", "Correcte", "Bonne", "Excellente"];

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ margin: 0, ...MONO, fontWeight: 400, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.tx2, whiteSpace: "nowrap" }}>
        <span style={{ color: C.ac }}>{n} —</span> {title}
      </h2>
      <div style={{ height: 1, background: "rgba(231,211,168,0.12)" }} />
    </div>
  );
}

function Counter({ value, label, color }: { value: ReactNode; label: string; color: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 4px", borderRadius: 12, background: `${color}24`, border: `1px solid ${color}73` }}>
      <span style={{ ...MONO, fontSize: 34, lineHeight: 1, color }}>{value}</span>
      <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", color: C.tx2 }}>{label}</span>
    </div>
  );
}

/**
 * Fin de séance, copiée de la maquette « Séance · fin » : anneau dégradé du
 * % de séries faites, nom de la séance, compteurs teintés, forme 1-5,
 * commentaire, km courus, « Terminer ».
 */
export function FinishWorkoutSheet({
  title,
  doneSets,
  skippedSets,
  totalSets,
  forme,
  onFormeChange,
  comment,
  onCommentChange,
  runKm,
  onRunKmChange,
  onConfirm,
  onClose,
  completing,
}: {
  title?: string;
  doneSets: number;
  skippedSets: number;
  totalSets: number;
  forme: number | undefined;
  onFormeChange: (f: number) => void;
  comment: string;
  onCommentChange: (c: string) => void;
  runKm: string;
  onRunKmChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  completing: boolean;
}) {
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const r = 51;
  const circ = 2 * Math.PI * r;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50 }} />
      <div
        role="dialog"
        aria-label="Terminer la séance"
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51, maxWidth: 480, margin: "0 auto",
          borderRadius: "24px 24px 0 0", overflow: "hidden", borderTop: "1px solid rgba(255,201,51,0.5)",
          background: "radial-gradient(80% 45% at 50% 0%, rgba(255,201,51,0.32), rgba(14,12,10,0) 70%), radial-gradient(60% 30% at 15% 22%, rgba(102,240,60,0.2), rgba(14,12,10,0) 70%), #1E1A16",
          maxHeight: "92vh", overflowY: "auto",
        }}
      >
        <div style={{ padding: "12px 20px max(30px, env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 22 }}>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ alignSelf: "center", width: 36, height: 4, padding: 0, border: "none", borderRadius: 2, background: "rgba(231,211,168,0.18)", cursor: "pointer" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ position: "relative", width: 112, height: 112, flex: "none" }}>
              <svg width={112} height={112} viewBox="0 0 112 112" aria-hidden>
                <defs>
                  <linearGradient id="finish-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#66F03C" />
                    <stop offset="1" stopColor="#FFC933" />
                  </linearGradient>
                </defs>
                <circle cx={56} cy={56} r={r} fill="none" stroke="rgba(231,211,168,0.10)" strokeWidth={10} />
                {pct > 0 && (
                  <circle cx={56} cy={56} r={r} fill="none" stroke="url(#finish-ring)" strokeWidth={10} strokeLinecap="round"
                    strokeDasharray={`${(circ * pct) / 100} ${circ}`} transform="rotate(-90 56 56)" />
                )}
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ ...MONO, fontSize: 30, lineHeight: 1, color: C.tx }}>{pct}<span style={{ fontSize: 14, color: C.tx2 }}> %</span></span>
                <span style={{ ...MONO, fontSize: 10, letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", color: C.tx2 }}>complété</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
              <span style={{ ...MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap", color: C.bg, background: C.ac, borderRadius: 999, padding: "3px 9px" }}>
                Fin de séance
              </span>
              <h2 style={{ margin: 0, ...DISPLAY, fontWeight: 400, fontSize: (title?.length ?? 0) > 20 ? 16 : 21, lineHeight: 1.15, letterSpacing: "0.06em", color: C.tx, overflowWrap: "break-word", hyphens: "auto" }} lang="fr">
                {title || "Terminer la séance"}
              </h2>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Counter value={doneSets} label="Séries ok" color="#66F03C" />
            <Counter value={skippedSets} label="Passées" color="#FF9500" />
            <Counter value={totalSets} label="Total" color="#FFFFFF" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead n="01" title="Forme" />
            <div role="radiogroup" aria-label="Forme pendant la séance" style={{ display: "flex", gap: 8 }}>
              {FORME_COLORS.map((col, i) => {
                const v = i + 1;
                const on = forme === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${v} — ${FORME_LABELS[i]}`}
                    title={FORME_LABELS[i]}
                    onClick={() => onFormeChange(v)}
                    style={{
                      flex: 1, height: 52, boxSizing: "border-box", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", ...MONO, fontSize: 18,
                      ...(on
                        ? { background: col, color: C.bg, border: "none", boxShadow: `0 0 0 2px #0E0C0A, 0 0 0 3px ${col}` }
                        : { background: `${col}24`, border: `1px solid ${col}80`, color: col }),
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionHead n="02" title="Commentaire" />
            <textarea
              value={comment}
              onChange={(e) => onCommentChange(e.target.value)}
              placeholder="Comment s’est passée la séance ?"
              rows={3}
              style={{
                minHeight: 84, boxSizing: "border-box", border: "1px solid rgba(231,211,168,0.18)", borderRadius: 12,
                background: "#27221D", padding: "12px 14px", fontSize: 14, lineHeight: 1.5, color: C.tx, fontFamily: "inherit", resize: "vertical",
              }}
            />
          </div>

          <label
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14,
              background: "linear-gradient(160deg, rgba(51,181,255,0.16), rgba(51,181,255,0.06)), #1E1A16", border: "1px solid rgba(51,181,255,0.45)",
            }}
          >
            <span aria-hidden style={{ width: 32, height: 32, flex: "none", borderRadius: 10, background: "#33B5FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E0C0A" strokeWidth="1.8" strokeLinecap="square">
                <path d="M13 4.5A1.5 1.5 0 1 0 13 4.49M7 21L10 15L13 17V22M10 15L11 9L16 11L19 9M11 9L7 11V14" />
              </svg>
            </span>
            <span style={{ flex: 1, fontSize: 13, color: C.tx }}>J’ai couru pendant la séance <span style={{ color: C.tx3 }}>(facultatif)</span></span>
            <input
              type="text"
              inputMode="decimal"
              value={runKm}
              onChange={(e) => onRunKmChange(e.target.value)}
              placeholder="0"
              aria-label="Kilomètres courus"
              style={{
                width: 56, height: 34, boxSizing: "border-box", border: "1px solid rgba(51,181,255,0.5)", borderRadius: 8,
                background: "transparent", textAlign: "center", ...MONO, fontSize: 14, color: C.tx,
              }}
            />
            <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>km</span>
          </label>

          <button
            type="button"
            onClick={onConfirm}
            disabled={completing}
            style={{
              height: 54, width: "100%", border: "none", borderRadius: 12, background: C.ac, color: C.bg, fontFamily: "inherit",
              fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              cursor: completing ? "default" : "pointer", opacity: completing ? 0.6 : 1,
            }}
          >
            {completing ? "Enregistrement…" : "Terminer"}
            {!completing && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15120F" strokeWidth="2" strokeLinecap="square" aria-hidden><path d="M4 12.5L9.5 18L20 6" /></svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
