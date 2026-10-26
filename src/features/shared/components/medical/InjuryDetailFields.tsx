/**
 * Détail d'une blessure : les champs qui expliquent la gêne, tous facultatifs.
 *
 * Deux niveaux volontairement séparés. Ce qui change la séance de demain
 * (douleur, impact) est visible tout de suite ; le reste (type, mécanisme,
 * contexte, suivi médical) attend derrière « Préciser ». Une gêne doit pouvoir
 * se déclarer en dix secondes, donc rien n'est obligatoire et rien ne bloque.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { C } from "@/lib/theme";
import { painReading } from "@/lib/injuryDetails";
import type { InjuryDetail } from "@/lib/injuryDetails";
import {
  DIAGNOSED_BY_LABEL,
  INJURY_CONTEXT_LABEL,
  INJURY_DECLARE_INTRO,
  INJURY_MECHANISM_LABEL,
  INJURY_TYPE_LABEL,
  TRAINING_IMPACT_LABEL,
} from "@/features/shared/types/medical";
import { inputStyle, labelStyle } from "./medicalStyles";
import { ChipChoice } from "./medicalUi";

/** L'encart qui ouvre toute déclaration de blessure, athlète comme coach. */
export function InjuryIntro() {
  return (
    <div style={{
      background: C.acS, border: "1px solid " + C.ac + "35", borderRadius: 6,
      padding: "10px 12px", fontSize: 11.5, lineHeight: 1.55, color: C.tx2,
    }}>
      {INJURY_DECLARE_INTRO}
    </div>
  );
}

export function InjuryDetailFields({ value, onChange, startOpen = false }: {
  value: InjuryDetail;
  onChange: (next: InjuryDetail) => void;
  /** Ouvre d'emblée les précisions — utile en modification d'une ligne déjà détaillée. */
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const set = <K extends keyof InjuryDetail>(k: K, v: InjuryDetail[K]) => onChange({ ...value, [k]: v });

  const pain = value.pain_level;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Douleur aujourd'hui</span>
          {pain === null ? (
            <span style={{ fontSize: 11, color: C.tx3 }}>non renseignée</span>
          ) : (
            <button
              type="button" onClick={() => set("pain_level", null)}
              style={{
                border: "none", background: "transparent", padding: 0, cursor: "pointer",
                fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: C.ac,
              }}
            >
              {pain}/10 · {painReading(pain)} — effacer
            </button>
          )}
        </div>
        <input
          type="range" min={0} max={10} step={1}
          value={pain ?? 0}
          onChange={(e) => set("pain_level", Number(e.target.value))}
          aria-label="Douleur de 0 à 10"
          style={{ width: "100%", accentColor: C.ac, opacity: pain === null ? 0.45 : 1 }}
        />
      </div>

      <ChipChoice
        label="Et l'entraînement ?" labels={TRAINING_IMPACT_LABEL}
        value={value.training_impact} onChange={(v) => set("training_impact", v)}
      />

      <button
        type="button" onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start",
          border: "none", background: "transparent", padding: 0, cursor: "pointer",
          fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: C.tx3,
          textTransform: "uppercase", letterSpacing: "0.4px",
        }}
      >
        <ChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        {open ? "Masquer les précisions" : "Préciser (facultatif)"}
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 10, borderLeft: "1px solid " + C.brd }}>
          <ChipChoice
            label="Type" labels={INJURY_TYPE_LABEL}
            value={value.injury_type} onChange={(v) => set("injury_type", v)}
          />
          <ChipChoice
            label="Comment c'est arrivé" labels={INJURY_MECHANISM_LABEL}
            value={value.mechanism} onChange={(v) => set("mechanism", v)}
          />
          <ChipChoice
            label="Où ça s'est produit" labels={INJURY_CONTEXT_LABEL}
            value={value.context} onChange={(v) => set("context", v)}
          />
          <ChipChoice
            label="Vu par" labels={DIAGNOSED_BY_LABEL}
            value={value.diagnosed_by} onChange={(v) => set("diagnosed_by", v)}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Jours d'arrêt</label>
              <input
                style={inputStyle} type="number" min={0} inputMode="numeric"
                value={value.days_off ?? ""}
                onChange={(e) => set("days_off", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="0"
              />
            </div>
            <div>
              <label style={labelStyle}>Retour prévu</label>
              <input
                style={inputStyle} type="date"
                value={value.return_date ?? ""}
                onChange={(e) => set("return_date", e.target.value || null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
