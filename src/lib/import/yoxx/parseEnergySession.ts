/**
 * Parseur déterministe (sans IA) d'une séance ÉNERGÉTIQUE au format YOXX.
 *
 *   SÉANCE ÉNERGÉTIQUE : 6 x 400 + 4 x 200
 *   TYPE : VO2
 *   ÉCHAUFFEMENT 10' @ Z2 | + qlq accel
 *   GROUPE x6
 *     EFFORT 400m [Course] @ chrono 1:37-1:40
 *     RÉCUP 1' [Course] @ 6'00-7'00/km
 *   FIN
 *
 * Règle d'or : ne jamais tout bloquer. Tout ce qui est lisible est importé ;
 * chaque problème produit un ImportIssue (ligne + explication) et, si une
 * valeur manque, une zone « ⚠ À SAISIR » à l'endroit exact dans la séance.
 *
 * Référence complète : docs/format-seance-yoxx.md
 */
import type {
  EnergyDuration,
  EnergyGroup,
  EnergyInterval,
  EnergyStep,
  EnergyTarget,
  ExerciseInterval,
  IntervalRole,
  SessionImage,
  SessionKind,
  StructureType,
} from "@/types/energy";
import {
  A_SAISIR,
  cleanTypography,
  norm,
  parseNum,
  parseNumRange,
  parseTime,
  parseTimeRange,
  type ImportIssue,
  type ImportIssueLevel,
} from "./common";

// ── Résultat ─────────────────────────────────────────────────────────────────

export interface ParsedEnergySession {
  name: string;
  session_kind: SessionKind;
  /** Renseigné si session_kind = 'custom' */
  custom_kind: string | null;
  structure_type: StructureType;
  /** Consigne générale de la séance */
  notes: string | null;
  images: SessionImage[];
  intervals: EnergyStep[];
}

export interface EnergyImportResult {
  session: ParsedEnergySession;
  issues: ImportIssue[];
}

export interface ParseOptions {
  /** Générateur d'id des étapes (injectable pour les tests) */
  genId?: () => string;
}

// ── Vocabulaire ──────────────────────────────────────────────────────────────

const ROLE_WORDS: Record<string, IntervalRole> = {
  echauffement: "warmup", echauf: "warmup", echa: "warmup", echauffements: "warmup",
  effort: "work", travail: "work",
  recup: "recovery", recuperation: "recovery",
  repos: "rest",
  retour: "cooldown",
  libre: "open",
};

const KIND_WORDS: Record<string, SessionKind> = {
  vo2: "vo2", vo2max: "vo2", vma: "vo2", "vo2max / vma": "vo2", "vo2 / vma": "vo2",
  tempo: "tempo",
  seuil: "seuil", "seuil lactique": "seuil",
  footing: "footing", endurance: "footing", ef: "footing", "footing / endurance": "footing",
  "endurance fondamentale": "footing",
  fartlek: "fartlek",
  autre: "autre", autres: "autre",
};

/** Clé d'équipement de l'app (IntervalEditor) ← mots acceptés */
const EQUIPMENT_WORDS: Record<string, string> = {
  course: "course", run: "course", running: "course", cap: "course",
  rameur: "rameur", row: "rameur", rower: "rameur", aviron: "rameur",
  skierg: "skierg", ski: "skierg", "ski erg": "skierg",
  bikeerg: "bikeerg", bike: "bikeerg", "bike erg": "bikeerg",
  velo: "velo", "home trainer": "velo",
  elliptique: "elliptique",
  corde: "corde", "corde a sauter": "corde",
  autre: "autre",
};

/** Métrique de % test (clé compacte) → type de cible + nom de métrique de l'app */
const PCT_METRICS: Record<string, { kind: "hr_pct" | "pace_test_pct" | "power_test_pct"; metric: string }> = {
  fcmax: { kind: "hr_pct", metric: "FCmax" },
  fcm: { kind: "hr_pct", metric: "FCmax" },
  fc: { kind: "hr_pct", metric: "FCmax" },
  vma: { kind: "pace_test_pct", metric: "VMA" },
  vc: { kind: "pace_test_pct", metric: "VC" },
  allure10k: { kind: "pace_test_pct", metric: "Allure 10K" },
  "10k": { kind: "pace_test_pct", metric: "Allure 10K" },
  alluresemi: { kind: "pace_test_pct", metric: "Allure semi" },
  semi: { kind: "pace_test_pct", metric: "Allure semi" },
  alluremarathon: { kind: "pace_test_pct", metric: "Allure marathon" },
  marathon: { kind: "pace_test_pct", metric: "Allure marathon" },
  pma: { kind: "power_test_pct", metric: "PMA" },
  ftp: { kind: "power_test_pct", metric: "FTP" },
  pc30: { kind: "power_test_pct", metric: "PC30" },
  pc5: { kind: "power_test_pct", metric: "PC5" },
};

const OTHER_FORMATS: [RegExp, string][] = [
  [/^seance (muscu|musculation|force)/, "une séance MUSCU"],
  [/^seance specifique/, "une séance SPÉCIFIQUE"],
  [/^programme/, "un PROGRAMME"],
];

const HELP_STEP =
  "Une étape commence par ÉCHAUFFEMENT, EFFORT, RÉCUP, REPOS, RETOUR ou LIBRE, " +
  "puis la durée (10' · 30\" · 400m · 15cal · LAP). Un groupe commence par « GROUPE x6 » et se ferme par « FIN ».";

const HELP_WOD =
  "Dans un bloc WOD : une étape (EFFORT 600m @ 4'45/km), un exercice (EXO Wall Ball Shot 10 reps @6kg) ou un groupe (GROUPE x6 … FIN).";

// ── Parseur ──────────────────────────────────────────────────────────────────

export function parseEnergySession(text: string, opts: ParseOptions = {}): EnergyImportResult {
  const genId = opts.genId ?? (() => crypto.randomUUID());
  const issues: ImportIssue[] = [];
  const add = (line: number, raw: string, level: ImportIssueLevel, message: string, stepId?: string) =>
    issues.push({ line, raw, level, message, ...(stepId ? { stepId } : {}) });

  let name = "";
  let kindRaw: { value: string; line: number; raw: string } | null = null;
  let structure: StructureType | null = null;
  let defaultEquipment: string | null = null;
  const notes: string[] = [];
  const images: SessionImage[] = [];

  const steps = createStepsParser({ genId, add });

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].trim();
    // Blocs de code Markdown (```) : avant cleanTypography qui convertit ` en '
    if (raw.startsWith("```")) continue;
    // Puces de liste éventuelles (« - », « * », « • ») ignorées
    const line = cleanTypography(raw).replace(/^[-*•]\s+/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const n = norm(line);

    // ── En-têtes « CLÉ : valeur » ──
    const header = line.match(/^([^:|@[\]]+?)\s*:\s*(.*)$/);
    if (header) {
      const key = norm(header[1]);
      const value = header[2].trim();
      const other = OTHER_FORMATS.find(([re]) => re.test(key));
      if (other) {
        add(lineNo, raw, "error",
          `Ce texte est ${other[1]} : cet import ne lit que les séances ÉNERGÉTIQUES (la 1re ligne doit être « SÉANCE ÉNERGÉTIQUE : titre »).`);
        return { session: emptySession(), issues };
      }
      if (/^seance( energetique| energie| cardio)?$/.test(key)) {
        name = value;
        if (!value) add(lineNo, raw, "warning", "Titre vide → « Séance importée ». Écris « SÉANCE ÉNERGÉTIQUE : titre ».");
        continue;
      }
      if (key === "type") { kindRaw = { value, line: lineNo, raw }; continue; }
      if (key === "structure") {
        const v = norm(value);
        if (v.startsWith("fraction")) structure = "fractionne";
        else if (v.startsWith("continu")) structure = "continu";
        else add(lineNo, raw, "warning", `Structure « ${value} » inconnue → déduite automatiquement. Valeurs : fractionné ou continu.`);
        continue;
      }
      if (key === "materiel" || key === "equipement") {
        const eq = EQUIPMENT_WORDS[norm(value)];
        if (eq) defaultEquipment = eq;
        else add(lineNo, raw, "warning", `Matériel « ${value} » inconnu → ignoré. ${equipmentHelp()}`);
        continue;
      }
      if (key === "consigne" || key === "consignes") {
        if (value) notes.push(value);
        continue;
      }
      if (key === "image" || key === "illustration") {
        if (/^https?:\/\/\S+$/.test(value)) images.push({ url: value });
        else add(lineNo, raw, "error", "Image : il faut une adresse complète qui commence par https://");
        continue;
      }
      // Clé inconnue : on tente quand même la lecture comme étape (ex. « EFFORT 10:00 @ Z2 »)
    }

    steps.feed(line, lineNo, raw);
  }

  const { steps: rootChildren, hasGroup } = steps.finish(defaultEquipment);

  // Type de séance
  let session_kind: SessionKind = "autre";
  let custom_kind: string | null = null;
  if (!kindRaw || !kindRaw.value) {
    add(kindRaw?.line ?? 0, kindRaw?.raw ?? "", "warning", "TYPE absent → « Autres ». Écris « TYPE : VO2 » (VO2, Tempo, Seuil, Footing, Fartlek, Autre ou ton propre type).");
  } else {
    const k = norm(kindRaw.value);
    if (k.startsWith("specifique")) {
      add(kindRaw.line, kindRaw.raw, "error", "Une séance spécifique s'importe avec « SÉANCE SPÉCIFIQUE : » (pas encore disponible) → type mis à « Autres ».");
    } else if (KIND_WORDS[k]) {
      session_kind = KIND_WORDS[k];
    } else {
      session_kind = "custom";
      custom_kind = kindRaw.value;
      add(kindRaw.line, kindRaw.raw, "info", `Type « ${kindRaw.value} » non standard → type personnalisé.`);
    }
  }

  if (!name) {
    if (!issues.some((x) => x.message.startsWith("Titre vide")))
      add(0, "", "warning", "Titre absent → « Séance importée ». Première ligne attendue : « SÉANCE ÉNERGÉTIQUE : titre ».");
    name = "Séance importée";
  }

  if (rootChildren.length === 0) add(0, "", "error", "Aucune étape trouvée dans le texte.");

  issues.sort((a, b) => a.line - b.line);

  return {
    session: {
      name,
      session_kind,
      custom_kind,
      structure_type: structure ?? (hasGroup ? "fractionne" : "continu"),
      notes: notes.length ? notes.join("\n") : null,
      images,
      intervals: rootChildren,
    },
    issues,
  };
}

// ── Lecteur d'étapes (réutilisé par les blocs WOD des séances spécifiques) ──

/** Exercice de la bibliothèque à rattacher (lignes EXO d'un WOD) */
export interface WodExerciseRef {
  stepId: string;
  name: string;
  line: number;
  raw: string;
}

export interface StepsParserOptions {
  genId: () => string;
  add: AddIssue;
  /** Accepte les lignes « EXO … » (blocs WOD des séances spécifiques) */
  allowExercises?: boolean;
}

/**
 * Lit des lignes d'étapes (ÉCHAUFFEMENT / EFFORT / … , GROUPE … FIN, EXO …)
 * et construit l'arbre EnergyStep[]. Une ligne illisible devient une zone « À SAISIR ».
 */
export function createStepsParser({ genId, add, allowExercises = false }: StepsParserOptions) {
  const rootChildren: EnergyStep[] = [];
  const stack: { group: EnergyGroup; line: number; raw: string }[] = [];
  const current = () => (stack.length ? stack[stack.length - 1].group.children : rootChildren);
  /** Étapes dont le matériel a été écrit explicitement (ne pas écraser par MATÉRIEL) */
  const explicitEquipment = new Set<string>();
  const exercises: WodExerciseRef[] = [];
  let hasGroup = false;

  const placeholder = (raw: string): EnergyInterval => ({
    type: "interval",
    id: genId(),
    role: "open",
    duration: { kind: "lap_button" },
    target: { kind: "text", value: A_SAISIR },
    notes: raw,
  });

  return {
    /** Traite une ligne déjà nettoyée (cleanTypography, puces retirées). */
    feed(line: string, lineNo: number, raw: string) {
      const n = norm(line);

      // ── Fermeture de groupe ──
      if (/^fin\b/.test(n)) {
        const closed = stack.pop();
        if (!closed) add(lineNo, raw, "warning", "« FIN » sans « GROUPE » ouvert → ignoré.");
        else if (closed.group.children.length === 0)
          add(closed.line, closed.raw, "warning", "Groupe vide (aucune étape entre GROUPE et FIN).", closed.group.id);
        return;
      }

      // ── Ouverture de groupe ──
      if (/^groupe\b/.test(n)) {
        hasGroup = true;
        const [head, ...rest] = line.split("|");
        const instructions = rest.join("|").trim();
        const h = norm(head).replace(/^groupe\s*/, "");
        const group: EnergyGroup = { type: "group", id: genId(), role: "work", repeat: 1, children: [] };

        const rep = h.match(/(?:^|\s)(?:x\s*(\d+)|(\d+)\s*x)(?=\s|$)/);
        if (rep) group.repeat = Number(rep[1] ?? rep[2]);
        if (!rep || group.repeat < 1) {
          group.repeat = 1;
          add(lineNo, raw, "error", "Nombre de répétitions manquant ou invalide → mis à 1. Écris « GROUPE x6 ».", group.id);
        }

        const dep = h.match(/depart(?:\s*fixe)?\s*:?\s*(\S+)/);
        if (dep) {
          const s = parseTime(dep[1]);
          if (s && s > 0) group.departure_every_s = s;
          else add(lineNo, raw, "error", `Départ fixe « ${dep[1]} » illisible → à saisir. Écris par ex. « départ 4'30 ».`, group.id);
        }

        if (instructions) group.instructions = instructions;
        current().push(group);
        stack.push({ group, line: lineNo, raw });
        return;
      }

      // ── Exercice (WOD) ──
      if (allowExercises && /^exo(?:rcice)?\b/.test(n)) {
        const ex = parseExerciseLine(line, lineNo, raw, genId, add);
        current().push(ex);
        exercises.push({ stepId: ex.id, name: ex.exercise_name, line: lineNo, raw });
        return;
      }

      // ── Étape ──
      const step = parseStepLine(line, lineNo, raw, genId, add);
      if (!step) {
        const ph = placeholder(raw);
        add(lineNo, raw, "error", `Ligne non reconnue → zone « À SAISIR ». ${allowExercises ? HELP_WOD : HELP_STEP}`, ph.id);
        current().push(ph);
        return;
      }
      if (step.equipment) explicitEquipment.add(step.id);
      current().push(step);
    },

    /** Ferme les groupes restés ouverts et applique le matériel par défaut. */
    finish(defaultEquipment?: string | null) {
      for (const open of stack) {
        add(open.line, open.raw, "warning", "Groupe jamais fermé par « FIN » → fermé automatiquement à la fin du bloc.", open.group.id);
      }
      stack.length = 0;
      // Matériel par défaut (sauf repos passif et zones à saisir)
      if (defaultEquipment) {
        forEachInterval(rootChildren, (iv) => {
          if (!explicitEquipment.has(iv.id) && iv.role !== "rest" && !isPlaceholder(iv)) iv.equipment = defaultEquipment;
        });
      }
      return { steps: rootChildren, hasGroup, exercises };
    },
  };
}

// ── Ligne EXO (exercice dans un WOD) : « EXO Sled Push 15m @110kg | consigne » ──

const QTY_RE = /\s+((?:\d+(?:\s*-\s*\d+)?\s*(?:reps?|r[ée]p(?:[ée]titions?)?)\b)|(?:\d+(?:[.,]\d+)?\s*(?:km|m)\b)|(?:\d+\s*k?cals?\b)|(?:\d+h\d*|\d+'(?:\d{1,2}"?)?|\d+(?:"|s\b|sec\b|min\b)|\d+:\d{2}))\s*$/i;

function parseExerciseLine(line: string, lineNo: number, raw: string, genId: () => string, add: AddIssue): ExerciseInterval {
  const id = genId();
  let body = line.replace(/^exo(?:rcice)?\s*:?\s*/i, "");
  const pipe = body.indexOf("|");
  const notes: string[] = [];
  if (pipe >= 0) {
    const c = body.slice(pipe + 1).trim();
    if (c) notes.push(c);
    body = body.slice(0, pipe);
  }
  const at = body.indexOf("@");
  const chargeRaw = at >= 0 ? body.slice(at + 1).trim() : "";
  let left = (at >= 0 ? body.slice(0, at) : body).trim();

  // Nom / quantité : « Nom : 15m » ou « Nom 15m »
  let qty = "";
  const colon = left.indexOf(":");
  if (colon >= 0) {
    qty = left.slice(colon + 1).trim();
    left = left.slice(0, colon).trim();
  } else {
    const m = left.match(QTY_RE);
    if (m) {
      qty = m[1].trim();
      left = left.slice(0, m.index).trim();
    }
  }

  const ex: ExerciseInterval = {
    type: "exercise",
    id,
    role: "work",
    exercise_id: "",
    exercise_name: left || A_SAISIR,
    target: { kind: "none" },
  };
  if (!left) add(lineNo, raw, "error", "Nom de l'exercice manquant. Écris « EXO Wall Ball Shot 10 reps @6kg ».", id);

  if (qty) {
    const q = cleanTypography(qty).toLowerCase().replace(/\s+/g, "");
    const reps = q.match(/^(\d+)(?:-(\d+))?(?:reps?|r[ée]p(?:[ée]titions?)?)?$/);
    if (reps) {
      ex.reps_min = Number(reps[1]);
      if (reps[2]) ex.reps_max = Number(reps[2]);
    } else {
      const d = parseDuration(q);
      if (d && d.kind !== "lap_button") ex.duration = d;
      else {
        notes.unshift(`${A_SAISIR} quantité : ${qty}`);
        add(lineNo, raw, "error", `Quantité « ${qty} » illisible → à saisir. Écris 10 reps · 10-12 reps · 15m · 30" · 15cal.`, id);
      }
    }
  } else {
    add(lineNo, raw, "warning", "Quantité absente (reps, distance ou temps). Ex. : « EXO Sled Push 15m @110kg ».", id);
  }

  if (chargeRaw) {
    const c = norm(cleanTypography(chargeRaw)).replace(/\s+/g, "");
    const kg = c.match(/^(\d+(?:[.,]\d+)?)kg$/);
    // « 2x24kg » : deux charges (kettlebells, haltères) → charge unitaire + détail en consigne
    const multi = c.match(/^(\d+)x(\d+(?:[.,]\d+)?)kg$/);
    const pct = c.match(/^(\d+(?:[.,]\d+)?)%(?:1?rm)?$/);
    const bw = c.match(/^(?:pdc|bw|poidsducorps)(?:\+(\d+(?:[.,]\d+)?)kg)?$/);
    if (kg) { ex.weight_kg = parseNum(kg[1])!; ex.weight_unit = "kg"; }
    else if (multi) {
      ex.weight_kg = parseNum(multi[2])!; ex.weight_unit = "kg";
      notes.push(`${multi[1]} × ${multi[2]} kg`);
    }
    else if (pct) { ex.weight_kg = parseNum(pct[1])!; ex.weight_unit = "pct_rm"; }
    else if (bw) { ex.weight_unit = "bw"; if (bw[1]) ex.weight_kg = parseNum(bw[1])!; }
    else {
      notes.push(`Charge : ${chargeRaw}`);
      add(lineNo, raw, "warning", `Charge « ${chargeRaw} » non reconnue → gardée dans la consigne. Formats : @110kg · @2x24kg · @75% · @PDC · @PDC+10kg.`, id);
    }
  }

  if (notes.length) ex.notes = notes.join(" · ");
  return ex;
}

// ── Ligne d'étape ────────────────────────────────────────────────────────────

type AddIssue = (line: number, raw: string, level: ImportIssueLevel, message: string, stepId?: string) => void;

function parseStepLine(
  line: string, lineNo: number, raw: string, genId: () => string, add: AddIssue,
): EnergyInterval | null {
  const pipe = line.indexOf("|");
  const main = pipe >= 0 ? line.slice(0, pipe) : line;
  const consigne = pipe >= 0 ? line.slice(pipe + 1).trim() : "";
  const at = main.indexOf("@");
  const left = (at >= 0 ? main.slice(0, at) : main).trim();
  const targetRaw = at >= 0 ? main.slice(at + 1).trim() : null;

  // Rôle (1er mot ; « RETOUR AU CALME » accepté)
  const words = left.split(/\s+/);
  const role = ROLE_WORDS[norm(words[0]).replace(/\.$/, "")];
  if (!role) return null;
  let restWords = words.slice(1);
  if (role === "cooldown" && norm(restWords.slice(0, 2).join(" ")) === "au calme") restWords = restWords.slice(2);
  let rest = restWords.join(" ");

  const id = genId();
  const noteParts: string[] = [];

  // Matériel [..]
  let equipment: string | undefined;
  const br = rest.match(/\[([^\]]*)\]/);
  if (br) {
    rest = (rest.slice(0, br.index) + rest.slice(br.index! + br[0].length)).trim();
    equipment = EQUIPMENT_WORDS[norm(br[1])];
    if (!equipment) {
      equipment = "autre";
      add(lineNo, raw, "warning", `Matériel « ${br[1]} » inconnu → « Autre ». ${equipmentHelp()}`, id);
    }
  }

  // Durée
  let duration = parseDuration(rest);
  if (!duration) {
    duration = { kind: "lap_button" };
    noteParts.push(`${A_SAISIR} durée : ${rest || "(vide)"}`);
    add(lineNo, raw, "error",
      rest
        ? `Durée « ${rest} » illisible → à saisir. Formats : 10' · 1'30 · 30" · 1h20 · 400m · 1,5km · 15cal · LAP.`
        : `Durée manquante → à saisir. Après le rôle, écris la durée : 10' · 30" · 400m · 15cal · LAP.`,
      id);
  }

  // Cible
  let target: EnergyTarget = { kind: "none" };
  if (targetRaw !== null) {
    const t = parseTarget(targetRaw);
    if (t.kind === "rpe") {
      noteParts.unshift(t.label);
      add(lineNo, raw, "info", `${t.label} placé dans la consigne de l'étape (pas de cible RPE en énergétique).`, id);
    } else if (t.kind === "error") {
      target = { kind: "text", value: `${A_SAISIR} : ${targetRaw}` };
      add(lineNo, raw, "error", `${t.message} → cible à saisir.`, id);
    } else if (t.kind === "loose") {
      target = { kind: "text", value: targetRaw };
      add(lineNo, raw, "warning",
        `Cible « ${targetRaw} » non reconnue → gardée en texte libre. Si c'est voulu, écris-la entre guillemets ; sinon utilise une unité (Z2, 4'40/km, 95% VMA, 250W…).`, id);
    } else {
      target = t.target;
    }
  }

  if (consigne) noteParts.push(consigne);

  return {
    type: "interval",
    id,
    role,
    duration,
    target,
    ...(equipment ? { equipment } : {}),
    ...(noteParts.length ? { notes: noteParts.join(" · ") } : {}),
  };
}

export function parseDuration(raw: string): EnergyDuration | null {
  const s = norm(cleanTypography(raw)).replace(/\s+/g, "");
  if (!s) return null;
  if (s === "lap") return { kind: "lap_button" };
  const dist = s.match(/^(\d+(?:[.,]\d+)?)(km|m)$/);
  if (dist) {
    const v = parseNum(dist[1])!;
    return { kind: "distance", value: Math.round(dist[2] === "km" ? v * 1000 : v) };
  }
  const cal = s.match(/^(\d+)k?cals?$/);
  if (cal) return { kind: "calories", value: Number(cal[1]) };
  const t = parseTime(s);
  return t && t > 0 ? { kind: "time", value: t } : null;
}

type TargetParse =
  | { kind: "ok"; target: EnergyTarget }
  | { kind: "rpe"; label: string }
  | { kind: "loose" }
  | { kind: "error"; message: string };

export function parseTarget(raw: string): TargetParse {
  const t = cleanTypography(raw).trim();
  if (!t) return { kind: "ok", target: { kind: "none" } };

  const quoted = t.match(/^"(.*)"$/);
  if (quoted) return { kind: "ok", target: { kind: "text", value: quoted[1].trim() } };

  const n = norm(t);
  const c = n.replace(/\s+/g, "");

  const zone = c.match(/^z(?:one)?([1-5])$/);
  if (zone) return { kind: "ok", target: { kind: "hr_zone", zone: Number(zone[1]) as 1 | 2 | 3 | 4 | 5 } };
  if (/^z(?:one)?\d/.test(c))
    return { kind: "error", message: `Zone « ${t} » invalide (une seule zone, de Z1 à Z5)` };

  const rpe = c.match(/^rpe([\d.,]+(?:-[\d.,]+)?)(?:\/10)?$/);
  if (rpe) return { kind: "rpe", label: `RPE ${rpe[1].replace(".", ",")}` };

  if (n.startsWith("chrono")) {
    const v = t.replace(/^chrono\s*:?\s*/i, "").trim();
    if (!parseTimeRange(v)) return { kind: "error", message: `Chrono « ${v} » illisible (écris par ex. « chrono 1:37-1:40 » ou « chrono 46"-48" »)` };
    return { kind: "ok", target: { kind: "text", value: v } };
  }

  const pct = c.match(/^([\d.,]+(?:-[\d.,]+)?)%(.*)$/);
  if (pct) {
    const r = parseNumRange(pct[1]);
    const m = PCT_METRICS[pct[2]];
    if (!r) return { kind: "error", message: `Pourcentage « ${t} » illisible` };
    if (!pct[2]) return { kind: "error", message: `« ${t} » : % de quoi ? Précise FCmax, VMA, VC, Allure 10K, PMA, FTP…` };
    if (!m) return { kind: "error", message: `« % ${pct[2].toUpperCase()} » inconnu. Valeurs : % FCmax, VMA, VC, Allure 10K, Allure semi, Allure marathon, PMA, FTP, PC30, PC5` };
    if (m.kind === "hr_pct") return { kind: "ok", target: { kind: "hr_pct", min: r.min, max: r.max } };
    return { kind: "ok", target: { kind: m.kind, test_metric: m.metric, min: r.min, max: r.max } };
  }

  const unit = c.match(/^([\d.,]+(?:-[\d.,]+)?)(bpm|w|watts?|km\/?h|spm|ppm|rpm)$/);
  if (unit) {
    const r = parseNumRange(unit[1]);
    if (!r) return { kind: "error", message: `Valeur « ${t} » illisible` };
    const u = unit[2];
    if (u === "bpm") return { kind: "ok", target: { kind: "hr_bpm", min: r.min, max: r.max } };
    if (u.startsWith("w")) return { kind: "ok", target: { kind: "power", min: r.min, max: r.max } };
    if (u.startsWith("km")) {
      if (r.min <= 0 || r.max <= 0) return { kind: "error", message: `Vitesse « ${t} » invalide` };
      // Stockage canonique de l'app : secondes par km (cf. formatTarget / paceBounds)
      return { kind: "ok", target: { kind: "pace", unit: "kmh", min_s_per_unit: Math.round(3600 / r.min), max_s_per_unit: Math.round(3600 / r.max) } };
    }
    return { kind: "ok", target: { kind: "cadence", min: r.min, max: r.max, unit: u === "rpm" ? "rpm" : "spm" } };
  }

  const pace = c.match(/^(.+?)(?:min)?\/km$/);
  if (pace) {
    const r = parseTimeRange(pace[1]);
    if (!r) return { kind: "error", message: `Allure « ${t} » illisible (écris par ex. « 4'40-4'50/km »)` };
    return { kind: "ok", target: { kind: "pace", unit: "min_per_km", min_s_per_unit: r.min, max_s_per_unit: r.max } };
  }

  return { kind: "loose" };
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

function equipmentHelp(): string {
  return "Valeurs : Course, Rameur, SkiErg, BikeErg, Vélo, Elliptique, Corde, Autre.";
}

function isPlaceholder(iv: EnergyInterval): boolean {
  return iv.target.kind === "text" && iv.target.value === A_SAISIR;
}

function forEachInterval(steps: EnergyStep[], fn: (iv: EnergyInterval) => void) {
  for (const s of steps) {
    if (s.type === "interval") fn(s);
    else if (s.type === "group") forEachInterval(s.children, fn);
  }
}

function emptySession(): ParsedEnergySession {
  return {
    name: "", session_kind: "autre", custom_kind: null, structure_type: "fractionne",
    notes: null, images: [], intervals: [],
  };
}
