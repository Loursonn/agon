import { useEffect, useState } from "react";
import { Check, GitMerge, Pencil, RotateCcw, Scissors, X } from "lucide-react";
import { C, alpha } from "@/lib/theme";
import { fmtClock, fmtMeters, parseClock } from "@/lib/seance";
import type { DetailLap } from "@/lib/activityDetail";
import type { LapType } from "./LapExercisePicker";
import { MONO, buttonStyle } from "./seanceUi";

export interface LapEditorActions {
  onCut: () => void;
  onMerge: () => void;
  onRename: (name: string) => void;
  onResetWatch: () => void;
  onResetProposal?: () => void;
  onCancel: () => void;
  onSave: () => void;
  onSetBounds: (startS: number, endS: number) => void;
  onCutAtChange: (s: number) => void;
  onApplyExercise?: (name: string, exerciseId: string | null, type: LapType) => void;
}

interface Props extends LapEditorActions {
  hyrox: boolean;
  laps: readonly DetailLap[];
  names: string[];
  selected: number;
  cutAtS: number | null;
  saving: boolean;
  watchLapCount: number;
  dirty: boolean;
  /** "toolbar" : barre d'outils seule (posée au-dessus du graphe, planche HyroxAjusterOrdi) ;
   *  "detail" : consigne + saisie précise (dans la carte du graphe) ; défaut : les deux. */
  part?: "toolbar" | "detail";
}

/** Barre « Modifier les tours » (ordinateur) : outils, saisie précise, choix de l'exercice (HYROX). */
export function SeanceLapEditor(p: Props) {
  const lap = p.laps[p.selected];
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(lap?.name ?? "");
  useEffect(() => { setName(lap?.name ?? ""); setRenaming(false); }, [p.selected, lap?.name]);

  const showBar = p.part !== "detail";
  const showDetail = p.part !== "toolbar";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {showBar && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, background: alpha(C.ac, 0.12), border: `1px solid ${alpha(C.ac, 0.42)}` }}>
        <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", color: C.ac, marginRight: 6 }}>{p.hyrox ? "AJUSTER LES TOURS" : "MODIFIER LES TOURS"}</span>
        <button type="button" style={buttonStyle("ghost", p.cutAtS == null)} onClick={p.onCut} disabled={p.cutAtS == null}><Scissors size={14} />{p.hyrox ? "Couper" : "Couper ici"}</button>
        <button type="button" style={buttonStyle("ghost", p.selected >= p.laps.length - 1)} onClick={p.onMerge} disabled={p.selected >= p.laps.length - 1}><GitMerge size={14} />{p.hyrox ? "Fusionner" : "Fusionner avec le suivant"}</button>
        <button type="button" style={buttonStyle()} onClick={() => setRenaming(true)}><Pencil size={14} />Renommer</button>
        {!p.hyrox && <button type="button" style={buttonStyle()} onClick={p.onResetWatch}><RotateCcw size={14} />Revenir aux tours de la montre</button>}
        <span style={{ flex: 1 }} />
        <button type="button" style={buttonStyle()} onClick={p.onCancel}><X size={14} />Annuler</button>
        <button type="button" style={buttonStyle("primary", p.saving || !p.dirty)} onClick={p.onSave} disabled={p.saving || !p.dirty}><Check size={14} />{p.saving ? "Enregistrement…" : "Enregistrer"}</button>
      </div>}
      {showDetail && <div style={{ fontSize: 12, color: C.tx2 }}>
        {p.hyrox
          ? "Clique sur la courbe pour placer une coupe. Glisse une poignée dorée pour caler une limite (fin du sled sur la reprise de FC), ou tape le temps ci-dessous."
          : "Clique sur la courbe pour couper le tour à cet endroit. Glisse une poignée dorée pour déplacer une limite."}
      </div>}

      {showDetail && lap && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.brdL}` }}>
          <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.14em", color: C.tx3 }}>
            {p.hyrox ? `TOUR ${p.selected + 1}` : `SAISIE PRÉCISE · TOUR ${p.selected + 1}`}
          </span>
          {renaming ? (
            <span style={{ display: "inline-flex", gap: 6 }}>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { p.onRename(name.trim()); setRenaming(false); } if (e.key === "Escape") setRenaming(false); }}
                style={{ height: 32, padding: "0 10px", borderRadius: 8, background: C.s2, border: `1px solid ${C.ac}`, color: C.tx, fontSize: 13, fontFamily: "inherit", outline: "none" }}
              />
              <button type="button" style={{ ...buttonStyle("primary"), height: 32 }} onClick={() => { p.onRename(name.trim()); setRenaming(false); }}>OK</button>
            </span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 500 }}>{p.names[p.selected]}</span>
          )}
          <TimeField label="Début" value={lap.startS} disabled={p.selected === 0} onCommit={(v) => p.onSetBounds(v, lap.endS)} />
          <TimeField label="Fin" value={lap.endS} disabled={p.selected === p.laps.length - 1} onCommit={(v) => p.onSetBounds(lap.startS, v)} />
          {p.hyrox ? (
            <>
              <Static label="Durée" value={fmtClock(lap.endS - lap.startS)} />
              {lap.distanceOverrideM != null && <Static label="Réalisé" value={fmtMeters(lap.distanceOverrideM)} />}
              {lap.reps != null && <Static label="Réalisé" value={`${lap.reps} reps`} />}
              {lap.loadKg != null && <Static label="Charge" value={`${lap.loadKg} kg`} />}
            </>
          ) : (
            <TimeField label="Couper à" value={p.cutAtS ?? Math.round((lap.startS + lap.endS) / 2)} onCommit={p.onCutAtChange} />
          )}
          {!p.hyrox && <span style={{ fontSize: 11.5, color: C.tx3 }}>Tape le temps en min:s, la limite se place à la seconde près sur le graphique.</span>}
        </div>
      )}

      {showDetail && !p.hyrox && (
        <div style={{ fontSize: 11.5, color: C.tx3 }}>
          Tours d’origine : {p.watchLapCount} (montre). Tes changements ne modifient pas le fichier de la montre ; « Revenir aux tours de la montre » les annule tous.
        </div>
      )}
    </div>
  );
}

function Static({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11.5, color: C.tx3 }}>{label}</span>
      <span style={{ ...MONO, fontSize: 13 }}>{value}</span>
    </span>
  );
}

function TimeField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(fmtClock(value));
  useEffect(() => setText(fmtClock(value)), [value]);
  const commit = () => {
    const v = parseClock(text);
    if (v === null) setText(fmtClock(value));
    else if (v !== value) onCommit(v);
  };
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11.5, color: C.tx3 }}>{label}</span>
      <input
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        style={{ ...MONO, width: 74, height: 32, padding: "0 8px", borderRadius: 8, background: C.s2, border: `1px solid ${C.brdL}`, color: disabled ? C.tx3 : C.tx, fontSize: 13, outline: "none" }}
      />
    </label>
  );
}
