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
import ImportTextDialogShell, { SectionTitle } from "./ImportTextDialogShell";

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

export default function ImportEnergyTextDialog({
  onImport, onClose, replacesExisting,
}: {
  onImport: (result: EnergyImportResult) => void;
  onClose: () => void;
  /** La séance en cours a déjà des étapes : elles seront remplacées */
  replacesExisting?: boolean;
}) {
  const [text, setText] = useState("");

  const result = useMemo(() => (text.trim() ? parseEnergySession(text) : null), [text]);
  const counts = result ? issueCounts(result.issues) : null;
  const totals = useMemo(() => {
    if (!result) return null;
    return computeTotals(expandIntervals({ type: "group", id: "__root__", role: "open", repeat: 1, children: result.session.intervals }));
  }, [result]);

  const canImport = !!result && result.session.intervals.length > 0;
  const s = result?.session;

  return (
    <ImportTextDialogShell
      title="Importer une séance énergétique (texte)"
      text={text}
      onTextChange={setText}
      placeholder={"SÉANCE ÉNERGÉTIQUE : …\nTYPE : VO2\n\nÉCHAUFFEMENT 10' @ Z2\nGROUPE x6\n  EFFORT 400m [Course] @ chrono 1:37-1:40\n  RÉCUP 1' @ 6'00-7'00/km\nFIN"}
      example={EXAMPLE}
      cheatsheet={CHEATSHEET}
      canImport={canImport}
      importLabel="Importer dans l'éditeur"
      onImport={() => result && onImport(result)}
      onClose={onClose}
      footerNote={replacesExisting && canImport && (
        <span style={{ fontSize: 11, color: C.o }}>⚠ Les étapes actuelles de l'éditeur seront remplacées.</span>
      )}
    >
      {result && (
        <>
          <div style={{ background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, padding: 12 }}>
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

          {result.issues.length === 0 ? (
            <div style={{ fontSize: 12, color: C.g, fontWeight: 600, marginTop: 12 }}>✓ Tout est lisible, aucune erreur.</div>
          ) : (
            <>
              <SectionTitle>
                Rapport · {counts!.errors} erreur{counts!.errors > 1 ? "s" : ""} · {counts!.warnings} à vérifier
              </SectionTitle>
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
    </ImportTextDialogShell>
  );
}
