import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import type { ExpectedBlock } from "@shared/domain/hyroxLaps";
import { C, alpha } from "@/lib/theme";
import type { DetailLap, DetailLapWithMetrics } from "@/lib/activityDetail";
import type { LapKind } from "@/lib/seance";
import { confirmModel } from "@/lib/seanceConfirm";
import { StationIcon } from "./StationIcon";
import { MONO, pillStyle } from "./seanceUi";

export type ConfirmPatch = Partial<Pick<DetailLap, "reps" | "distanceOverrideM" | "loadKg" | "comment">>;

interface Props {
  laps: readonly DetailLapWithMetrics[];
  names: string[];
  kinds: readonly LapKind[];
  blocks: readonly ExpectedBlock[] | null;
  /** Marque de la montre (« Garmin »), sinon « montre ». */
  device: string | null;
  saving: boolean;
  onClose: () => void;
  onValidate: (patches: Record<number, ConfirmPatch>) => void;
}

const FIELD: CSSProperties = {
  ...MONO, height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${alpha(C.tx, 0.18)}`,
  background: "transparent", color: C.tx, fontSize: 13.5, boxSizing: "border-box",
};

/** Nombre modifiable : « 15 m », « 9 », « 102 kg ». Enregistré à la sortie du champ. */
function NumberInput({ value, unit, warn, label, onCommit }: { value: number | null; unit: string; warn?: boolean; label: string; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  useEffect(() => setText(value == null ? "" : String(value).replace(".", ",")), [value]);
  const commit = () => {
    const t = text.trim().replace(",", ".");
    const n = t === "" ? null : Number(t);
    if (n === null || (Number.isFinite(n) && n >= 0)) onCommit(n);
    else setText(value == null ? "" : String(value).replace(".", ","));
  };
  return (
    <span style={{ ...FIELD, display: "inline-flex", alignItems: "center", gap: 3, borderColor: warn ? C.o + "AA" : FIELD.border as string }}>
      <input
        aria-label={label}
        inputMode="decimal"
        value={text}
        placeholder="—"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ ...MONO, width: `${Math.max(1.5, text.length + 0.4)}ch`, background: "transparent", border: "none", outline: "none", color: warn ? C.o : C.tx, fontSize: 13.5, padding: 0 }}
      />
      {unit && unit !== "reps" && <span style={{ color: warn ? C.o : C.tx }}>{unit}</span>}
    </span>
  );
}

/**
 * « C'est bien cette séance » (planche HyroxConfirmerTel) : l'athlète vérifie
 * reps / distances / charges station par station, laisse un mot s'il veut, puis
 * valide la séance (les tours passent « validés »).
 */
export function HyroxConfirmSheet(p: Props) {
  const [patches, setPatches] = useState<Record<number, ConfirmPatch>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [showFolded, setShowFolded] = useState(false);
  const edited = useMemo(() => p.laps.map((l, i) => ({ ...l, ...patches[i] })), [p.laps, patches]);
  // Repli décidé à l'ouverture : une station ne disparaît pas pendant qu'on la corrige.
  const [initial] = useState(() => confirmModel(p.laps, p.names, p.kinds, p.blocks, p.device));
  const model = confirmModel(edited, p.names, p.kinds, p.blocks, p.device);
  const foldedAt = new Set(initial.stations.filter((s) => s.folded).map((s) => s.index));
  const patch = (i: number, v: ConfirmPatch) => setPatches((cur) => ({ ...cur, [i]: { ...cur[i], ...v } }));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label="C’est bien cette séance" style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      {/* La séance reste visible, voilée, derrière la feuille (planche). */}
      <div onClick={p.onClose} style={{ position: "absolute", inset: 0, background: alpha(C.bg, 0.55) }} />
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, top: 90, borderRadius: "22px 22px 0 0", background: C.s2,
        borderTop: `1px solid ${alpha(C.tx, 0.18)}`, padding: "10px 16px 24px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto",
      }}>
        <button type="button" aria-label="Fermer" onClick={p.onClose} style={{ width: 40, height: 4, borderRadius: 2, background: alpha(C.tx, 0.18), margin: "0 auto 4px", border: "none", padding: 0, cursor: "pointer", flex: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Check size={18} color={C.g} strokeWidth={2.2} aria-hidden />
          <span style={{ fontSize: 15 }}>C’est bien cette séance</span>
        </div>
        <div style={{ fontSize: 12.5, color: C.tx2 }}>Vérifie ce que tu as vraiment fait. Corrige les reps ou la charge si besoin, et laisse un mot sur une station.</div>

        {model.runLabel && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: C.bg, border: `1px solid ${C.brd}` }}>
            <StationIcon name="Course" size={18} />
            <span style={{ flex: 1, fontSize: 13 }}>{model.runLabel}</span>
            {model.runDetail && <span style={{ ...MONO, fontSize: 12, color: C.tx2 }}>{model.runDetail}</span>}
            <Check size={15} color={C.g} strokeWidth={2.2} aria-label="Conforme" />
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          {model.stations.filter((s) => showFolded || !foldedAt.has(s.index)).map((s) => (
            <div key={s.index} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 0", borderTop: `1px solid ${C.brd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <StationIcon name={s.name} size={20} />
                <span style={{ flex: 1, fontSize: 13.5 }}>{s.name}</span>
                {s.differs ? <span style={pillStyle(C.o)}>À corriger</span> : <Check size={16} color={C.g} strokeWidth={2.2} aria-label="Conforme au prévu" />}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingLeft: 30 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: C.tx3 }}>Prévu → fait</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{ ...MONO, fontSize: 13, color: C.tx3 }}>{s.plannedText ?? "—"} →</span>
                    <NumberInput
                      label={`${s.name} : fait`}
                      value={s.done}
                      unit={s.unit}
                      warn={s.differs}
                      onCommit={(v) => patch(s.index, { [s.field]: v })}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: C.tx3 }}>Charge</div>
                  <div style={{ marginTop: 3 }}>
                    <NumberInput label={`${s.name} : charge`} value={s.loadKg} unit="kg" onCommit={(v) => patch(s.index, { loadKg: v })} />
                  </div>
                </div>
              </div>
              {editing === s.index ? (
                <textarea
                  autoFocus
                  aria-label={`${s.name} : commentaire`}
                  defaultValue={s.comment ?? ""}
                  maxLength={500}
                  rows={2}
                  placeholder="Un mot pour ton coach"
                  onBlur={(e) => { patch(s.index, { comment: e.target.value.trim() || null }); setEditing(null); }}
                  style={{ marginLeft: 30, padding: "8px 10px", borderRadius: 10, background: C.bg, border: `1px solid ${C.ac}55`, color: C.tx, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }}
                />
              ) : s.comment ? (
                <button type="button" onClick={() => setEditing(s.index)} style={{ marginLeft: 30, padding: "8px 10px", borderRadius: 10, background: C.bg, border: `1px solid ${C.ac}55`, fontSize: 12, color: C.tx2, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                  « {s.comment} »
                </button>
              ) : (
                <button type="button" onClick={() => setEditing(s.index)} style={{ marginLeft: 30, alignSelf: "flex-start", fontSize: 12, color: C.ac, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  + Commentaire
                </button>
              )}
            </div>
          ))}
        </div>

        {initial.foldedLabel && (
          <button type="button" onClick={() => setShowFolded((v) => !v)} style={{ fontSize: 11.5, color: C.tx3, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
            {showFolded ? "Replier les stations conformes" : `${initial.foldedLabel} · afficher`}
          </button>
        )}

        <div style={{ marginTop: "auto", paddingTop: 8 }}>
          <button
            type="button"
            disabled={p.saving}
            onClick={() => p.onValidate(patches)}
            style={{ width: "100%", height: 52, borderRadius: 12, border: "none", background: C.ac, color: C.bg, fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: p.saving ? 0.5 : 1, fontFamily: "inherit" }}
          >
            Valider la séance
          </button>
        </div>
      </div>
    </div>
  );
}
