/**
 * ImportMuscuTextDialog — import d'une séance MUSCU par copier-coller d'un
 * texte au format YOXX (sans IA).
 *
 * Exercices : nom identique → lié ; noms proches → le coach choisit ;
 * aucun nom proche → créé dans la bibliothèque à l'import.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { parseMuscuSession } from "@/lib/import/yoxx/parseMuscuSession";
import { nameKey } from "@/lib/import/yoxx/matchExercise";
import { resolveMuscuImport } from "@/lib/import/yoxx/resolveMuscuImport";
import type { ImportIssue } from "@/lib/import/yoxx/common";
import type { ProgSession } from "../programmation/types";
import { methodConfigToExerciceParams } from "../library/MethodPreview";
import { useTrainingMethods } from "@/features/shared/hooks/useTrainingMethods";
import ImportIssueList, { issueCounts } from "./ImportIssueList";
import ImportTextDialogShell, { SectionTitle } from "./ImportTextDialogShell";
import { useExerciseChoices, ExerciseChoiceList } from "./ExerciseChoices";

const DAY_LABEL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const EXAMPLE = `SÉANCE MUSCU : Full body 2
ABRÉGÉ : FB2
JOUR : Vendredi
CONSIGNE : Easy day, lendemain du compromised.

BLOC Échauffement [Echauffement] repos libre
A1 RACs hanche, cheville, épaule : libre "6'"
A2 Mobilité thoracique : libre "4' — extension sur banc, rotations en quadrupédie"

BLOC A [Force] repos 2'
A1.1 Split squat haltères | Par jambe. Amplitude sans douleur.
  S1 : 3×8 RIR 3
  S2 : 4×8 RIR 3
  S3 : 4×8 RIR 3
  S4 : 3×8 RIR 4
A1.2 Développé militaire haltères : 3×8 RIR 4

BLOC B [Force] repos 2'
B1.1 Hip thrust : 3×10 RIR 4 | Pause 2" en haut.
B1.2 Rowing haltère : 3×10 RIR 4 | Par bras.

BLOC C [Mixte] repos libre
C1.1 Abduction de hanche élastique : 3×15 | Par côté.
C1.2 Copenhagen plank levier court : 3×20" ISO | Par côté.

BLOC D [Mixte] repos libre
D1.1 Mollets jambe tendue unilatéral : 3×12 | Par jambe.
D1.2 Rotation externe de hanche élastique : 3×15 | Par côté.
D2 Extension lombaire banc 45° (ou GHD) : 3×12-15 | Pause 2" en haut.`;

const CHEATSHEET: [string, string][] = [
  ["En-tête", "SÉANCE MUSCU : titre · ABRÉGÉ : FB2 · JOUR : Lundi · RÉCURRENCE : hebdo|unique · CONSIGNE : …"],
  ["Bloc", "BLOC Nom [Force] repos 2'30 | consigne   (ou départ 3' · repos libre · 3 séries)"],
  ["Catégories", "[Echauffement] [Force] [Hypertrophie] [Explo/vitesse] [Mixte] [Cardio]"],
  ["Exercice", "A1 Nom : 3×8 @75% RIR 2 tempo 3-0-1 | commentaire   (A1.1 + A1.2 = superset)"],
  ["Séries/reps", "3×8 · 3×8-10 · 4×10/8/6/6 · 3×20\" ISO · 3×(3+3) R15\" (cluster) · 3×AMRAP"],
  ["Charge", "@80kg · @75% (du 1RM) · @70/75/80% (par série) · @PDC"],
  ["Intensité", "RIR 2 · RIR 3/2/1 · RPE 8 (→ RIR 2)"],
  ["Méthode", "… méthode \"Rest-Pause\" sur séries 3-4   (nom exact de ta banque)"],
  ["Libre", "A1 Mobilité : libre \"5' de flow\""],
  ["Semaines", "sous l'exercice, une ligne par semaine :  S1 : 3×8 RIR 3  ·  S2 : 4×8 RIR 3"],
];

export default function ImportMuscuTextDialog({
  onImport, onClose, importLabel = "Importer la séance",
}: {
  onImport: (session: ProgSession, issues: ImportIssue[]) => void;
  onClose: () => void;
  importLabel?: string;
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const { data: methods = [] } = useTrainingMethods();

  const parsed = useMemo(() => (text.trim() ? parseMuscuSession(text) : null), [text]);
  const names = useMemo(() => parsed?.refs.map((r) => r.name) ?? [], [parsed]);
  const choices = useExerciseChoices(names);

  const resolved = useMemo(() => {
    if (!parsed) return null;
    const exercises: Record<string, { id: string; name: string }> = {};
    for (const ref of parsed.refs) {
      const lib = choices.previewFor(ref.name);
      if (lib) exercises[ref.exoId] = lib;
    }
    return resolveMuscuImport(parsed, { exercises, methods, methodToParams: methodConfigToExerciceParams });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, methods, choices.matches, choices.choiceFor]);

  const visibleIssues = resolved?.issues.filter((i) => i.level !== "info" || !i.message.includes("lié à l'exercice")) ?? [];
  const counts = issueCounts(visibleIssues);
  const s = resolved?.session;
  const nbExos = s?.blocs.reduce((n, b) => n + b.exercices.length, 0) ?? 0;
  const canImport = !!parsed && nbExos > 0 && !choices.isLoading;

  async function handleImport() {
    if (!parsed || !user?.id) return;
    setImporting(true);
    try {
      const { byKey, created } = await choices.resolveAll(user.id);
      const exercises: Record<string, { id: string; name: string }> = {};
      for (const ref of parsed.refs) {
        const lib = byKey.get(nameKey(ref.name));
        if (lib) exercises[ref.exoId] = lib;
      }
      const result = resolveMuscuImport(parsed, { exercises, methods, methodToParams: methodConfigToExerciceParams });
      const createdKeys = new Set(created.map((e) => nameKey(e.name)));
      const createdIssues: ImportIssue[] = parsed.refs
        .filter((r) => createdKeys.has(nameKey(r.name)))
        .map((r) => ({ line: r.line, raw: r.raw, level: "info" as const, stepId: r.exoId, message: `« ${r.name} » créé dans ta bibliothèque.` }));
      if (created.length) toast.success(`${created.length} exercice${created.length > 1 ? "s" : ""} créé${created.length > 1 ? "s" : ""} dans ta bibliothèque`);
      onImport(result.session, [...result.issues, ...createdIssues].sort((a, b) => a.line - b.line));
    } catch (e) {
      console.error("[import muscu]", e);
      toast.error("Erreur lors de la création des exercices — rien n'a été importé");
    } finally {
      setImporting(false);
    }
  }

  const nbCreate = choices.toCreate.length;

  return (
    <ImportTextDialogShell
      title="Importer une séance muscu (texte)"
      text={text}
      onTextChange={setText}
      placeholder={"SÉANCE MUSCU : …\nABRÉGÉ : FB1\n\nBLOC A [Force] repos 2'\nA1.1 Box squat : 3×(3+3) R15\" RIR 4\nA1.2 Traction : 3×5-6 @PDC"}
      example={EXAMPLE}
      cheatsheet={CHEATSHEET}
      canImport={canImport}
      importLabel={importLabel}
      importing={importing}
      onImport={handleImport}
      onClose={onClose}
      footerNote={nbCreate > 0 && (
        <span style={{ fontSize: 11, color: C.b }}>
          {nbCreate} exercice{nbCreate > 1 ? "s" : ""} sera{nbCreate > 1 ? "ont" : ""} créé{nbCreate > 1 ? "s" : ""} dans ta bibliothèque.
        </span>
      )}
    >
      {s && (
        <>
          <div style={{ background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, padding: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
              <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.brdL}`, marginRight: 8, color: C.tx2 }}>{s.short}</span>
              {s.name}
            </div>
            <div style={{ fontSize: 11, color: C.tx2, marginTop: 6 }}>
              {s.blocs.length} bloc{s.blocs.length > 1 ? "s" : ""} · {nbExos} exercice{nbExos > 1 ? "s" : ""}
              {s.multi_semaine && ` · ${s.nb_semaines} semaines`}
              {s.day_of_week !== undefined && ` · ${DAY_LABEL[s.day_of_week]}`}
              {s.recurrence === "once" && " · séance unique"}
            </div>
          </div>

          <SectionTitle>Exercices {choices.isLoading && "· chargement de la bibliothèque…"}</SectionTitle>
          <ExerciseChoiceList choices={choices} />

          {visibleIssues.length === 0 ? (
            <div style={{ fontSize: 12, color: C.g, fontWeight: 600, marginTop: 12 }}>✓ Tout est lisible, aucune erreur.</div>
          ) : (
            <>
              <SectionTitle>
                Rapport · {counts.errors} erreur{counts.errors > 1 ? "s" : ""} · {counts.warnings} à vérifier
              </SectionTitle>
              <ImportIssueList issues={visibleIssues} />
            </>
          )}
        </>
      )}
    </ImportTextDialogShell>
  );
}
