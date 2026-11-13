/**
 * Briques de la planche « Profil sportif · seuils et zones » (CoachOrdiAProfilSportif) :
 * tuile de seuil (valeur en grand, date, source) et lignes du tableau
 * « Références de performance » (nom · valeur · date + source · crayon).
 */
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { MONO, ORDI_CARD } from "@/features/shared/components/ordi/OrdiUi";
import { frDate } from "@/features/shared/components/ordi/ordiStyles";

const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }));

function PenBtn({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth={1.5} strokeLinecap="square"><path d="M4 20H8L19 9L15 5L4 16Z" /></svg>
    </button>
  );
}

function NumberEditor({ initial, unit, step = 1, onSave, onCancel, saving }: {
  initial?: number; unit: string; step?: number; onSave: (v: number) => void; onCancel: () => void; saving?: boolean;
}) {
  const [draft, setDraft] = useState(initial != null ? String(initial) : "");
  const commit = () => {
    const v = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) { toast.error("Valeur invalide"); return; }
    onSave(v);
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <input
        autoFocus
        type="number"
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") onCancel(); }}
        onBlur={() => { if (draft.trim() === "") onCancel(); }}
        style={{ width: 80, height: 32, boxSizing: "border-box", padding: "0 8px", borderRadius: 8, border: `1px solid ${C.ac}`, background: C.bg, color: C.tx, ...MONO, fontSize: 14, textAlign: "right", outline: "none" }}
      />
      <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}>{unit}</span>
      <button onClick={commit} disabled={saving} style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "none", background: C.ac, color: C.bg, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>OK</button>
    </span>
  );
}

/** Tuile de la rubrique 01 : « SV1 · seuil 1 », valeur 24 px dans un champ sombre, date, source. */
export function ThresholdTile({ label, hint, value, unit, date, source, derived, onSave, saving, readOnlyNote }: {
  label: string;
  hint: string;
  value?: number | null;
  unit: string;
  date?: string | null;
  source?: ReactNode;
  derived?: { value: number; label: string } | null;
  onSave?: (v: number) => void;
  saving?: boolean;
  /** Valeur réglée ailleurs (ex. SV1 / SV2 dans les zones). */
  readOnlyNote?: string;
}) {
  const [editing, setEditing] = useState(false);
  const shown = value ?? derived?.value ?? null;
  return (
    <div style={{ ...ORDI_CARD, padding: 16, minWidth: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 13, color: C.tx }}>{label}</span>
          <span style={{ fontSize: 11.5, color: C.tx3 }}>{hint}</span>
        </div>
        {editing && onSave ? (
          <NumberEditor initial={shown ?? undefined} unit={unit} onSave={(v) => { onSave(v); setEditing(false); }} onCancel={() => setEditing(false)} saving={saving} />
        ) : (
          <button
            onClick={onSave ? () => setEditing(true) : undefined}
            disabled={!onSave}
            title={onSave ? `Modifier ${label}` : readOnlyNote}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, height: 45, padding: "0 12px", borderRadius: 10,
              background: C.bg, border: `1px solid ${C.brdL}`, boxSizing: "border-box", cursor: onSave ? "text" : "default",
              textAlign: "left", fontFamily: "inherit",
            }}
          >
            <span style={{ ...MONO, fontSize: 24, color: value != null ? C.tx : C.tx3 }}>{shown != null ? fmtNum(shown) : "—"}</span>
            <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{unit}</span>
            {value == null && derived && <span style={{ ...MONO, fontSize: 10, color: C.ac, marginLeft: "auto" }}>{derived.label}</span>}
          </button>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ ...MONO, fontSize: 11, color: C.tx2 }}>{date ? frDate(date) : value == null ? "Pas encore mesurée" : "—"}</span>
          {(source || readOnlyNote) && <span style={{ fontSize: 11.5, color: C.tx3 }}>{source ?? readOnlyNote}</span>}
        </div>
      </div>
    </div>
  );
}

/** Carte du tableau des références, avec titres de groupe (« Endurance », « Force »…). */
export function RefTable({ children }: { children: ReactNode }) {
  return <div style={{ ...ORDI_CARD, overflow: "hidden" }}>{children}</div>;
}

export function RefGroup({ title, first = false }: { title: string; first?: boolean }) {
  return (
    <div style={{ padding: first ? "12px 18px 6px" : "14px 18px 6px", borderTop: first ? "none" : `1px solid ${C.brd}` }}>
      <span style={{ ...MONO, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.tx3 }}>{title}</span>
    </div>
  );
}

export function RefRow({ label, value, unit, date, source, step, onSave, onDelete, saving, extra }: {
  label: ReactNode;
  value?: number | null;
  unit: string;
  date?: string | null;
  source?: string | null;
  step?: number;
  onSave?: (v: number) => void;
  onDelete?: () => void;
  saving?: boolean;
  extra?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 150px minmax(24px, auto)", alignItems: "center", gap: 12, minHeight: 46, padding: "0 18px", borderTop: `1px solid ${C.brd}` }}>
      <span style={{ fontSize: 13, color: C.tx, minWidth: 0 }}>{label}{extra}</span>
      <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {editing && onSave ? (
          <NumberEditor initial={value ?? undefined} unit={unit} step={step} saving={saving} onSave={(v) => { onSave(v); setEditing(false); }} onCancel={() => setEditing(false)} />
        ) : (
          <>
            <span style={{ ...MONO, fontSize: 15, color: value != null ? C.tx : C.tx3 }}>{value != null ? fmtNum(value) : "—"}</span>
            {value != null && <span style={{ ...MONO, fontSize: 10.5, color: C.tx3 }}> {unit}</span>}
          </>
        )}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        {value != null ? (
          <>
            <span style={{ ...MONO, fontSize: 10.5, color: C.tx2 }}>{date ? frDate(date) : "—"}</span>
            {source && <span style={{ fontSize: 11.5, color: C.tx3 }}>{source}</span>}
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: C.tx3 }}>Pas encore mesurée</span>
        )}
      </div>
      <span style={{ display: "flex", gap: 2 }}>
        {onSave && !editing && <PenBtn onClick={() => setEditing(true)} title={`Modifier ${typeof label === "string" ? label : ""}`} />}
        {onDelete && value != null && !editing && (
          <button onClick={onDelete} title="Supprimer" aria-label="Supprimer" style={{ width: 24, height: 24, background: "none", border: "none", color: C.tx3, cursor: "pointer", fontSize: 15, padding: 0 }}>×</button>
        )}
      </span>
    </div>
  );
}
