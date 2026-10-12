/**
 * ImportEnergyTextDialog — import d'une séance énergétique par copier-coller
 * d'un texte au format YOXX (sans IA, parseur déterministe).
 *
 * Coller → aperçu + rapport ligne par ligne en direct → « Importer dans l'éditeur ».
 * L'import remplit l'éditeur ; rien n'est enregistré tant que le coach ne clique
 * pas sur « Enregistrer » / « Enregistrer & planifier ».
 */
import { useMemo, useState } from "react";
import { C } from "@/lib/theme";
import { parseEnergySession, type EnergyImportResult } from "@/lib/import/yoxx/parseEnergySession";
import { expandIntervals, computeTotals } from "@/lib/energy";
import { formatSLong } from "@/lib/energy/formatTarget";
import ImportIssueList, { issueCounts } from "./ImportIssueList";

const KIND_LABEL: Record<string, string> = {
  vo2: "VO₂max / VMA", tempo: "Tempo", seuil: "Seuil lactique", footing: "Footing / Endurance",
  fartlek: "Fartlek", autre: "Autres",
};

const EXAMPLE = `SÉANCE ÉNERGÉTIQUE : 6 x 400 + 4 x 200
TYPE : VO2

ÉCHAUFFEMENT 10' @ Z2 | + qlq accel
ÉCHAUFFEMENT 5' [Autre] | Pogo jump bilatéraux (3x15 intention de raideur total)
GROUPE x6
  EFFORT 400m [Course] @ chrono 1:37-1:40
  RÉCUP 1' [Course] @ 6'00-7'00/km
FIN
EFFORT 1'
GROUPE x2
  EFFORT 200m @ chrono 0:46-0:48
  RÉCUP 30" @ 6'00-7'00/km
FIN`;

const CHEATSHEET: [string, string][] = [
  ["En-tête", "SÉANCE ÉNERGÉTIQUE : titre · TYPE : VO2 · STRUCTURE : continu · MATÉRIEL : Course · CONSIGNE : … · IMAGE : https://…"],
  ["Étape", "RÔLE DURÉE [MATÉRIEL] @ CIBLE | consigne"],
  ["Rôles", "ÉCHAUFFEMENT · EFFORT · RÉCUP (active) · REPOS (passive) · RETOUR · LIBRE"],
  ["Durées", "10' · 1'30 · 30\" · 1h20 · 400m · 1,5km · 15cal · LAP"],
  ["Matériel", "[Course] [Rameur] [SkiErg] [BikeErg] [Vélo] [Elliptique] [Corde] [Autre]"],
  ["Cibles", "Z2 · 80-85% FCmax · 150-160bpm · 4'40-4'50/km · 14-15km/h · 95-100% VMA · 98% VC · 90% Allure 10K · 250-280W · 90% FTP · 110% PMA · 170-180spm · 85-90rpm · chrono 1:37-1:40 · \"texte libre\""],
  ["RPE", "| RPE 8 (dans la consigne)"],
  ["Groupe", "GROUPE x6 [départ 4'30] | consigne du groupe … FIN"],
];

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

export default function ImportEnergyTextDialog({
  onImport, onClose, replacesExisting,
}: {
  onImport: (result: EnergyImportResult) => void;
  onClose: () => void;
  /** La séance en cours a déjà des étapes : elles seront remplacées */
  replacesExisting?: boolean;
}) {
  const [text, setText] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const result = useMemo(() => (text.trim() ? parseEnergySession(text) : null), [text]);
  const counts = result ? issueCounts(result.issues) : null;
  const totals = useMemo(() => {
    if (!result) return null;
    return computeTotals(expandIntervals({ type: "group", id: "__root__", role: "open", repeat: 1, children: result.session.intervals }));
  }, [result]);

  const canImport = !!result && result.session.intervals.length > 0;
  const s = result?.session;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.6)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 61,
        transform: "translate(-50%, -50%)",
        width: 920, maxWidth: "96vw", height: "86vh",
        background: C.s1, borderRadius: 6, border: `1px solid ${C.brd}`,
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.tx }}>Importer une séance énergétique (texte)</div>
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
              Colle le texte au format YOXX. Rien n'est enregistré tant que tu ne cliques pas sur « Enregistrer » dans l'éditeur.
            </div>
          </div>
          <button onClick={() => setShowHelp((v) => !v)} style={ghostBtn}>
            {showHelp ? "Masquer le format" : "Voir le format"}
          </button>
          {!text && (
            <button onClick={() => setText(EXAMPLE)} style={ghostBtn}>Exemple</button>
          )}
        </div>

        {showHelp && (
          <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.brd}`, background: C.s2, flexShrink: 0, maxHeight: 220, overflowY: "auto" }}>
            {CHEATSHEET.map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, fontSize: 11, marginBottom: 4 }}>
                <span style={{ width: 70, flexShrink: 0, fontWeight: 700, color: C.tx2 }}>{k}</span>
                <span style={{ color: C.tx, fontFamily: mono }}>{v}</span>
              </div>
            ))}
            <div style={{ fontSize: 10, color: C.tx3, marginTop: 6 }}>Référence complète : docs/format-seance-yoxx.md</div>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, display: "flex", gap: 0, minHeight: 0, flexWrap: "wrap" }}>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"SÉANCE ÉNERGÉTIQUE : …\nTYPE : VO2\n\nÉCHAUFFEMENT 10' @ Z2\nGROUPE x6\n  EFFORT 400m [Course] @ chrono 1:37-1:40\n  RÉCUP 1' @ 6'00-7'00/km\nFIN"}
            spellCheck={false}
            style={{
              flex: "1 1 380px", minHeight: 200, resize: "none",
              background: C.bg, color: C.tx, border: "none", borderRight: `1px solid ${C.brd}`,
              padding: 16, fontSize: 12, lineHeight: 1.6, fontFamily: mono, outline: "none",
            }}
          />

          <div style={{ flex: "1 1 340px", minWidth: 0, overflowY: "auto", padding: 16, maxHeight: "100%" }}>
            {!result ? (
              <div style={{ color: C.tx3, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
                L'aperçu et le rapport d'import s'affichent ici dès que tu colles le texte.
              </div>
            ) : (
              <>
                {/* Résumé */}
                <div style={{ background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{s!.name}</div>
                  <div style={{ fontSize: 11, color: C.tx2, marginTop: 4 }}>
                    {s!.session_kind === "custom" ? s!.custom_kind : KIND_LABEL[s!.session_kind]}
                    {" · "}{s!.structure_type === "continu" ? "Continu" : "Fractionné"}
                    {totals && totals.workCount > 0 && ` · ${totals.workCount} effort${totals.workCount > 1 ? "s" : ""}`}
                    {totals && totals.durationS > 0 && ` · ~${formatSLong(totals.durationS)}`}
                    {totals && totals.distanceM > 0 && ` · ${(totals.distanceM / 1000).toFixed(1)} km`}
                  </div>
                  {s!.notes && <div style={{ fontSize: 11, color: C.tx3, marginTop: 4, fontStyle: "italic" }}>{s!.notes}</div>}
                </div>

                {/* Rapport */}
                {result.issues.length === 0 ? (
                  <div style={{ fontSize: 12, color: C.g, fontWeight: 600 }}>✓ Tout est lisible, aucune erreur.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.tx3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                      Rapport · {counts!.errors} erreur{counts!.errors > 1 ? "s" : ""} · {counts!.warnings} à vérifier
                    </div>
                    <ImportIssueList issues={result.issues} />
                    {counts!.errors > 0 && canImport && (
                      <div style={{ fontSize: 11, color: C.tx3, marginTop: 8 }}>
                        Les erreurs deviennent des zones « ⚠ À SAISIR » dans l'éditeur, à leur place exacte.
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {replacesExisting && canImport && (
            <span style={{ fontSize: 11, color: C.o }}>⚠ Les étapes actuelles de l'éditeur seront remplacées.</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtn}>Annuler</button>
          <button
            disabled={!canImport}
            onClick={() => result && onImport(result)}
            style={{
              padding: "8px 16px", borderRadius: 4, border: "none",
              background: C.acV, color: "#0E0C0A", fontSize: 12, fontWeight: 700,
              cursor: canImport ? "pointer" : "not-allowed", opacity: canImport ? 1 : 0.4, fontFamily: "inherit",
            }}
          >
            Importer dans l'éditeur
          </button>
        </div>
      </div>
    </>
  );
}

const ghostBtn: React.CSSProperties = {
  padding: "7px 12px", borderRadius: 4, border: `1px solid ${C.brdL}`,
  background: "transparent", color: C.tx2, fontSize: 12, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
