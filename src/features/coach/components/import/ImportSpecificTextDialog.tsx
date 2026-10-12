/**
 * ImportSpecificTextDialog — import d'une séance SPÉCIFIQUE (blocs classique + WOD)
 * par copier-coller d'un texte au format YOXX (sans IA).
 *
 * - Sport / qualité : liés par nom, sinon créés.
 * - EXO des blocs WOD : nom identique → lié ; noms proches → choix ; sinon créé.
 * - Lignes des blocs classiques : consignes simples, liées seulement si le nom
 *   est identique à un exercice de la bibliothèque (vidéo).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import { useAuth } from "@/hooks/useAuth";
import { parseSpecificSession } from "@/lib/import/yoxx/parseSpecificSession";
import { nameKey } from "@/lib/import/yoxx/matchExercise";
import type { ImportIssue } from "@/lib/import/yoxx/common";
import type { EnergyStep, SessionImage } from "@/types/energy";
import type { SessionBlock } from "@/types/specific";
import {
  useSpecificSports, usePhysicalQualities, useCreateSport, useCreateQuality,
} from "@/features/shared/hooks/useSpecificTaxonomy";
import ImportIssueList, { issueCounts } from "./ImportIssueList";
import ImportTextDialogShell, { SectionTitle } from "./ImportTextDialogShell";
import { useExerciseChoices, ExerciseChoiceList, ChoiceRow } from "./ExerciseChoices";

export interface SpecificImportApply {
  name: string;
  sport_id: string | null;
  quality_id: string | null;
  notes: string | null;
  images: SessionImage[];
  blocks: SessionBlock[];
}

const EXAMPLE = `SÉANCE SPÉCIFIQUE : Compromised Run
SPORT : Hyrox
QUALITÉ : Compromised
CONSIGNE : Wall balls toujours avec une box dessous.

BLOC CLASSIQUE : Échauffement en autonomie | Mobilisation + Run + Force progressive + stimulation cardiaque
- Mobilisation + Run + Force progressive : 4x30m, 5x8, 3' | repos 1'

BLOC WOD : Compromised SPush + Run + WB | Aucun bloc > bloc le plus rapide + 1'15
GROUPE x6
  EXO Sled Push 15m @110kg | Buste un peu plus haut. Pousse le sol derrière toi.
  EFFORT 600m [Course] @ 4'45/km
  EXO Wall Ball Shot 10 reps @6kg
  RÉCUP 2' [Course] | Footing léger permet de récup
FIN`;

const CHEATSHEET: [string, string][] = [
  ["En-tête", "SÉANCE SPÉCIFIQUE : titre · SPORT : Hyrox · QUALITÉ : Compromised · CONSIGNE : … · IMAGE : https://…"],
  ["Bloc classique", "BLOC CLASSIQUE : titre | consigne du bloc"],
  ["Ligne classique", "- Nom : prescription libre | repos 1' | notes"],
  ["Bloc WOD", "BLOC WOD : titre | consigne du bloc — puis les lignes de l'énergétique"],
  ["Étape", "EFFORT 600m [Course] @ 4'45/km | consigne   (mêmes règles que l'énergétique)"],
  ["Exercice", "EXO Sled Push 15m @110kg · EXO Wall Ball Shot 10 reps @6kg · EXO Gainage 45\" @PDC"],
  ["Quantité", "10 reps · 8-10 reps · 15m · 1km · 30\" · 1'30 · 15cal"],
  ["Charge", "@110kg · @75% · @PDC · @PDC+10kg"],
  ["Groupe", "GROUPE x6 [départ 4'] | consigne … FIN"],
];

function walkSteps(steps: EnergyStep[], fn: (s: EnergyStep) => void) {
  for (const s of steps) {
    fn(s);
    if (s.type === "group") walkSteps(s.children, fn);
  }
}

export default function ImportSpecificTextDialog({
  onImport, onClose, replacesExisting,
}: {
  onImport: (data: SpecificImportApply, issues: ImportIssue[]) => void;
  onClose: () => void;
  replacesExisting?: boolean;
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const { data: sports = [] } = useSpecificSports();
  const { data: qualities = [] } = usePhysicalQualities();
  const createSport = useCreateSport();
  const createQuality = useCreateQuality();

  const parsed = useMemo(() => (text.trim() ? parseSpecificSession(text) : null), [text]);
  const names = useMemo(() => parsed?.wodExercises.map((e) => e.name) ?? [], [parsed]);
  const choices = useExerciseChoices(names);

  const sport = parsed?.session.sportName ? sports.find((x) => nameKey(x.name) === nameKey(parsed.session.sportName!)) : undefined;
  const quality = parsed?.session.qualityName ? qualities.find((x) => nameKey(x.name) === nameKey(parsed.session.qualityName!)) : undefined;
  const linkedItems = useMemo(() => {
    const byKey = new Map(choices.library.map((e) => [nameKey(e.name), e]));
    return new Map((parsed?.classiqueItems ?? []).flatMap((it) => {
      const e = byKey.get(nameKey(it.name));
      return e ? [[it.itemId, e] as const] : [];
    }));
  }, [parsed, choices.library]);

  const s = parsed?.session;
  const counts = issueCounts(parsed?.issues ?? []);
  const canImport = !!s && s.blocks.length > 0 && !choices.isLoading;
  const nbCreate = choices.toCreate.length;

  async function handleImport() {
    if (!parsed || !user?.id) return;
    setImporting(true);
    try {
      const { byKey, created } = await choices.resolveAll(user.id);

      let sportId = sport?.id ?? null;
      if (!sportId && parsed.session.sportName) {
        sportId = (await createSport.mutateAsync({ name: parsed.session.sportName, coachId: user.id })).id;
      }
      let qualityId = quality?.id ?? null;
      if (!qualityId && parsed.session.qualityName) {
        qualityId = (await createQuality.mutateAsync({ name: parsed.session.qualityName, coachId: user.id })).id;
      }

      const blocks: SessionBlock[] = structuredClone(parsed.session.blocks);
      for (const b of blocks) {
        if (b.kind === "wod") {
          walkSteps(b.steps, (st) => {
            if (st.type !== "exercise") return;
            const ex = byKey.get(nameKey(st.exercise_name));
            if (!ex) return;
            st.exercise_id = ex.id;
            st.exercise_name = ex.name;
            if (ex.youtube_id) st.youtube_id = ex.youtube_id;
          });
        } else {
          for (const it of b.items) {
            const ex = linkedItems.get(it.id);
            if (!ex) continue;
            it.exercise_id = ex.id;
            if (ex.youtube_id) it.youtube_id = ex.youtube_id;
          }
        }
      }

      const createdKeys = new Set(created.map((e) => nameKey(e.name)));
      const extra: ImportIssue[] = parsed.wodExercises
        .filter((r) => createdKeys.has(nameKey(r.name)))
        .map((r) => ({ line: r.line, raw: r.raw, level: "info" as const, stepId: r.stepId, message: `« ${r.name} » créé dans ta bibliothèque.` }));
      if (created.length) toast.success(`${created.length} exercice${created.length > 1 ? "s" : ""} créé${created.length > 1 ? "s" : ""} dans ta bibliothèque`);

      onImport(
        { name: parsed.session.name, sport_id: sportId, quality_id: qualityId, notes: parsed.session.notes, images: parsed.session.images, blocks },
        [...parsed.issues, ...extra].sort((a, b) => a.line - b.line),
      );
    } catch (e) {
      console.error("[import spécifique]", e);
      toast.error("Erreur lors de la création (exercices, sport ou qualité) — rien n'a été importé");
    } finally {
      setImporting(false);
    }
  }

  return (
    <ImportTextDialogShell
      title="Importer une séance spécifique (texte)"
      text={text}
      onTextChange={setText}
      placeholder={"SÉANCE SPÉCIFIQUE : …\nSPORT : Hyrox\n\nBLOC CLASSIQUE : Échauffement\n- Mobilisation : 5'\n\nBLOC WOD : …\nGROUPE x6\n  EXO Sled Push 15m @110kg\n  EFFORT 600m @ 4'45/km\nFIN"}
      example={EXAMPLE}
      cheatsheet={CHEATSHEET}
      canImport={canImport}
      importLabel="Importer dans l'éditeur"
      importing={importing}
      onImport={handleImport}
      onClose={onClose}
      footerNote={
        <span style={{ fontSize: 11, color: C.o }}>
          {replacesExisting && canImport ? "⚠ Les blocs actuels de l'éditeur seront remplacés. " : ""}
          {nbCreate > 0 && <span style={{ color: C.b }}>{nbCreate} exercice{nbCreate > 1 ? "s" : ""} sera{nbCreate > 1 ? "ont" : ""} créé{nbCreate > 1 ? "s" : ""}.</span>}
        </span>
      }
    >
      {s && (
        <>
          <div style={{ background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 4, padding: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{s.name}</div>
            <div style={{ fontSize: 11, color: C.tx2, marginTop: 6 }}>
              {s.blocks.length} bloc{s.blocks.length > 1 ? "s" : ""}
              {" · "}{s.blocks.filter((b) => b.kind === "wod").length} WOD
              {" · "}{s.blocks.filter((b) => b.kind !== "wod").length} classique{s.blocks.filter((b) => b.kind !== "wod").length > 1 ? "s" : ""}
            </div>
            {s.notes && <div style={{ fontSize: 11, color: C.tx3, marginTop: 4, fontStyle: "italic" }}>{s.notes}</div>}
          </div>

          {(s.sportName || s.qualityName) && (
            <>
              <SectionTitle>Sport / qualité</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {s.sportName && (
                  <ChoiceRow color={sport ? C.g : C.b} badge={sport ? "Lié" : "Créé"}>
                    <span style={{ color: C.tx }}>Sport : {sport?.name ?? s.sportName}</span>
                  </ChoiceRow>
                )}
                {s.qualityName && (
                  <ChoiceRow color={quality ? C.g : C.b} badge={quality ? "Lié" : "Créé"}>
                    <span style={{ color: C.tx }}>Qualité : {quality?.name ?? s.qualityName}</span>
                  </ChoiceRow>
                )}
              </div>
            </>
          )}

          {choices.matches.size > 0 && (
            <>
              <SectionTitle>Exercices des WOD {choices.isLoading && "· chargement de la bibliothèque…"}</SectionTitle>
              <ExerciseChoiceList choices={choices} />
            </>
          )}

          {(parsed?.classiqueItems.length ?? 0) > 0 && (
            <div style={{ fontSize: 11, color: C.tx3, marginTop: 10 }}>
              Blocs classiques : {parsed!.classiqueItems.length} ligne{parsed!.classiqueItems.length > 1 ? "s" : ""} en consigne
              {linkedItems.size > 0 && ` (${linkedItems.size} liée${linkedItems.size > 1 ? "s" : ""} à un exercice de la bibliothèque)`}.
            </div>
          )}

          {parsed!.issues.length === 0 ? (
            <div style={{ fontSize: 12, color: C.g, fontWeight: 600, marginTop: 12 }}>✓ Tout est lisible, aucune erreur.</div>
          ) : (
            <>
              <SectionTitle>
                Rapport · {counts.errors} erreur{counts.errors > 1 ? "s" : ""} · {counts.warnings} à vérifier
              </SectionTitle>
              <ImportIssueList issues={parsed!.issues} />
            </>
          )}
        </>
      )}
    </ImportTextDialogShell>
  );
}
