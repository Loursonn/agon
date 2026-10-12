/**
 * Parseur déterministe (sans IA) d'une séance SPÉCIFIQUE au format YOXX.
 *
 *   SÉANCE SPÉCIFIQUE : Compromised Run
 *   SPORT : Hyrox
 *   QUALITÉ : Compromised
 *
 *   BLOC CLASSIQUE : Échauffement en autonomie | consigne du bloc
 *   - Mobilisation + Run + Force progressive : 4x30m, 5x8, 3' | repos 1'
 *
 *   BLOC WOD : Compromised SPush + Run + WB | décrément < 1'15
 *   GROUPE x6
 *     EXO Sled Push 15m @110kg
 *     EFFORT 600m [Course] @ 4'45/km
 *   FIN
 *
 * Les blocs WOD réutilisent le lecteur d'étapes de l'énergétique (+ lignes EXO).
 * Sport, qualité et exercices sont renvoyés par leur nom : la résolution
 * (lien / création) est faite par l'écran d'import.
 *
 * Référence complète : docs/format-seance-yoxx.md
 */
import type { SessionImage } from "@/types/energy";
import type { ClassiqueBlock, ClassiqueItem, SessionBlock, WodBlock } from "@/types/specific";
import { cleanTypography, norm, type ImportIssue, type ImportIssueLevel } from "./common";
import { createStepsParser, type WodExerciseRef } from "./parseEnergySession";

export interface ClassiqueItemRef {
  itemId: string;
  name: string;
  line: number;
}

export interface ParsedSpecificSession {
  name: string;
  /** Nom tel qu'écrit (résolu / créé à l'import) */
  sportName: string | null;
  qualityName: string | null;
  notes: string | null;
  images: SessionImage[];
  blocks: SessionBlock[];
}

export interface SpecificImportResult {
  session: ParsedSpecificSession;
  /** Exercices des blocs WOD (lignes EXO) : lien bibliothèque / création */
  wodExercises: WodExerciseRef[];
  /** Lignes des blocs classiques : liées seulement si le nom est identique à un exercice */
  classiqueItems: ClassiqueItemRef[];
  issues: ImportIssue[];
}

const OTHER_FORMATS: [RegExp, string][] = [
  [/^seance (energetique|energie|cardio)/, "une séance ÉNERGÉTIQUE"],
  [/^seance (muscu|musculation|force)/, "une séance MUSCU"],
  [/^programme/, "un PROGRAMME"],
];

const STEP_START = /^(echauffement|echauf|echa|effort|travail|recup|recuperation|repos|retour|libre|groupe|fin|exo|exercice)\b/;

export function parseSpecificSession(text: string, opts: { genId?: () => string } = {}): SpecificImportResult {
  const genId = opts.genId ?? (() => crypto.randomUUID());
  const issues: ImportIssue[] = [];
  const add = (line: number, raw: string, level: ImportIssueLevel, message: string, stepId?: string) =>
    issues.push({ line, raw, level, message, ...(stepId ? { stepId } : {}) });

  let name = "";
  let sportName: string | null = null;
  let qualityName: string | null = null;
  const notes: string[] = [];
  const images: SessionImage[] = [];
  const blocks: SessionBlock[] = [];
  const wodExercises: WodExerciseRef[] = [];
  const classiqueItems: ClassiqueItemRef[] = [];

  let current: { kind: "classique"; block: ClassiqueBlock } | { kind: "wod"; block: WodBlock; parser: ReturnType<typeof createStepsParser>; line: number } | null = null;

  const closeCurrent = () => {
    if (current?.kind === "wod") {
      const { steps, exercises } = current.parser.finish();
      current.block.steps = steps;
      wodExercises.push(...exercises);
      if (steps.length === 0) add(current.line, "", "warning", `Bloc WOD « ${current.block.title} » vide.`, current.block.id);
    } else if (current?.kind === "classique" && current.block.items.length === 0) {
      add(0, "", "warning", `Bloc classique « ${current.block.title} » vide.`, current.block.id);
    }
    current = null;
  };

  const openBlock = (kind: "classique" | "wod", title: string, instructions: string, lineNo: number) => {
    closeCurrent();
    if (kind === "wod") {
      const block: WodBlock = { id: genId(), title, kind: "wod", steps: [] };
      if (instructions) block.instructions = instructions;
      blocks.push(block);
      current = { kind: "wod", block, parser: createStepsParser({ genId, add, allowExercises: true }), line: lineNo };
    } else {
      const block: ClassiqueBlock = { id: genId(), title, kind: "classique", items: [] };
      if (instructions) block.instructions = instructions;
      blocks.push(block);
      current = { kind: "classique", block };
    }
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].trim();
    if (raw.startsWith("```")) continue;
    const cleaned = cleanTypography(raw).trim();
    const line = cleaned.replace(/^[-*•]\s+/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const n = norm(line);

    // ── Bloc ──
    const bloc = line.match(/^bloc\b\s*(classique|wod)?\s*:?\s*(.*)$/i);
    if (bloc) {
      const [head, ...rest] = bloc[2].split("|");
      const kind = bloc[1] ? (norm(bloc[1]) === "wod" ? "wod" : "classique") : null;
      if (!kind) add(lineNo, raw, "warning", "Type de bloc absent → classique. Écris « BLOC CLASSIQUE : titre » ou « BLOC WOD : titre ».");
      const title = head.trim() || (kind === "wod" ? "WOD" : "Bloc");
      openBlock(kind ?? "classique", title, rest.join("|").trim(), lineNo);
      continue;
    }

    // ── En-têtes (hors blocs WOD, où « : » peut apparaître dans une étape) ──
    const header = line.match(/^([^:|@[\]]+?)\s*:\s*(.*)$/);
    if (header && current?.kind !== "wod") {
      const key = norm(header[1]);
      const value = header[2].trim();
      const other = OTHER_FORMATS.find(([re]) => re.test(key));
      if (other) {
        add(lineNo, raw, "error", `Ce texte est ${other[1]} : cet import ne lit que les séances SPÉCIFIQUES (1re ligne « SÉANCE SPÉCIFIQUE : titre »).`);
        return { session: { name: "", sportName: null, qualityName: null, notes: null, images: [], blocks: [] }, wodExercises: [], classiqueItems: [], issues };
      }
      if (/^seance( specifique)?$/.test(key)) { name = value; continue; }
      if (key === "sport") { sportName = value || null; continue; }
      if (key === "qualite" || key === "qualite physique") { qualityName = value || null; continue; }
      if (key === "consigne" || key === "consignes") { if (value) notes.push(value); continue; }
      if (key === "image" || key === "illustration") {
        if (/^https?:\/\/\S+$/.test(value)) images.push({ url: value });
        else add(lineNo, raw, "error", "Image : il faut une adresse complète qui commence par https://");
        continue;
      }
      // sinon : ligne de bloc classique « Nom : prescription »
    }

    // Ligne hors bloc → bloc créé automatiquement
    if (!current) {
      const isStep = STEP_START.test(n);
      openBlock(isStep ? "wod" : "classique", isStep ? "WOD" : "Bloc", "", lineNo);
      add(lineNo, raw, "warning", `Ligne avant tout « BLOC » → bloc ${isStep ? "WOD" : "classique"} créé automatiquement.`);
    }

    const cur = current as NonNullable<typeof current>;
    if (cur.kind === "wod") {
      cur.parser.feed(line, lineNo, raw);
      continue;
    }

    // ── Ligne de bloc classique : « Nom : prescription | repos 1' | notes » ──
    const [first, ...segments] = line.split("|").map((x) => x.trim());
    const colon = first.indexOf(":");
    const item: ClassiqueItem = {
      id: genId(),
      name: (colon >= 0 ? first.slice(0, colon) : first).trim(),
    };
    const prescription = colon >= 0 ? first.slice(colon + 1).trim() : "";
    if (prescription) item.prescription = prescription;
    const itemNotes: string[] = [];
    for (const seg of segments) {
      const rest = seg.match(/^(?:repos|r[ée]cup)\s*:?\s*(.+)$/i);
      if (rest && !item.rest) item.rest = rest[1].trim();
      else if (seg) itemNotes.push(seg);
    }
    if (itemNotes.length) item.notes = itemNotes.join(" · ");
    if (!item.name) {
      item.name = "⚠ À SAISIR";
      add(lineNo, raw, "error", "Ligne vide de nom → à saisir.", item.id);
    }
    cur.block.items.push(item);
    classiqueItems.push({ itemId: item.id, name: item.name, line: lineNo });
  }
  closeCurrent();

  if (!name) {
    add(0, "", "warning", "Titre absent → « Séance importée ». 1re ligne attendue : « SÉANCE SPÉCIFIQUE : titre ».");
    name = "Séance importée";
  }
  if (!sportName) add(0, "", "info", "SPORT absent → à choisir dans l'éditeur si besoin.");
  if (blocks.length === 0) add(0, "", "error", "Aucun bloc trouvé dans le texte.");

  issues.sort((a, b) => a.line - b.line);

  return {
    session: {
      name,
      sportName,
      qualityName,
      notes: notes.length ? notes.join("\n") : null,
      images,
      blocks,
    },
    wodExercises,
    classiqueItems,
    issues,
  };
}
