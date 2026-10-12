/**
 * Parseur déterministe (sans IA) d'une séance MUSCU au format YOXX.
 *
 *   SÉANCE MUSCU : Full body 2
 *   ABRÉGÉ : FB2
 *   BLOC A [Force] repos 2' | consigne du bloc
 *   A1.1 Split squat haltères : 3×8 RIR 3 | Par jambe
 *     S1 : 3×8 RIR 3
 *     S2 : 4×8 RIR 3
 *   A1.2 Développé militaire haltères : 3×8 @75% RIR 4 tempo 3-0-1
 *
 * Le parseur ne connaît ni la bibliothèque d'exercices ni les méthodes : il
 * renvoie les noms tels qu'écrits. La résolution (lien bibliothèque, création,
 * méthodes) est faite ensuite par resolveMuscuImport().
 *
 * Référence complète : docs/format-seance-yoxx.md
 */
import type { Bloc, BlocCategory, Exercice, ExerciceParams, ProgSession } from "@/features/coach/components/programmation/types";
import {
  A_SAISIR,
  cleanTypography,
  norm,
  parseNum,
  parseTime,
  type ImportIssue,
  type ImportIssueLevel,
} from "./common";

// ── Résultat ─────────────────────────────────────────────────────────────────

/** Référence à résoudre après parsing (exercice de la bibliothèque, méthode). */
export interface MuscuExerciseRef {
  /** Exercice.id dans la séance produite */
  exoId: string;
  /** Nom tel qu'écrit dans le texte */
  name: string;
  line: number;
  raw: string;
  /** Méthode demandée (nom tel qu'écrit) */
  methodName?: string;
  /** Séries concernées pour une méthode de scope « set » (1-indexé) */
  methodSets?: number[];
  /** true si le texte ne donne aucune série×reps → paramètres à prendre dans la méthode */
  paramsFromMethod?: boolean;
}

export interface MuscuImportResult {
  /** Séance prête, à ceci près : exercise_id vides et méthodes non résolues */
  session: ProgSession;
  refs: MuscuExerciseRef[];
  issues: ImportIssue[];
}

export interface ParseOptions {
  genId?: () => string;
}

// ── Vocabulaire ──────────────────────────────────────────────────────────────

const CATEGORIES: Record<string, BlocCategory> = {
  echauffement: "Echauffement", echauf: "Echauffement", warmup: "Echauffement",
  force: "Force",
  hypertrophie: "Hypertrophie", hypertro: "Hypertrophie",
  "explo/vitesse": "Explo/vitesse", explo: "Explo/vitesse", vitesse: "Explo/vitesse", explosivite: "Explo/vitesse", puissance: "Explo/vitesse",
  mixte: "Mixte",
  cardio: "Cardio",
};

/** Mêmes couleurs que BlocForm (palette de l'app), attribuées dans l'ordre des blocs */
const BLOC_PALETTE = ["#FFC933", "#F97316", "#22C55E", "#EF4444", "#3B9EFF", "#FACC15", "#EC4899", "#14B8A6"];

const DAYS: Record<string, number> = {
  lundi: 0, lun: 0, mardi: 1, mar: 1, mercredi: 2, mer: 2, jeudi: 3, jeu: 3,
  vendredi: 4, ven: 4, samedi: 5, sam: 5, dimanche: 6, dim: 6,
};

const OTHER_FORMATS: [RegExp, string][] = [
  [/^seance (energetique|energie|cardio)/, "une séance ÉNERGÉTIQUE"],
  [/^seance specifique/, "une séance SPÉCIFIQUE"],
  [/^programme/, "un PROGRAMME"],
];

const HELP_EXO =
  "Un exercice s'écrit « A1 Nom de l'exercice : 3×8 @75% RIR 2 » (A1.1 / A1.2 = superset). " +
  "Un bloc commence par « BLOC Nom [Catégorie] repos 2' ».";

// ── Parseur ──────────────────────────────────────────────────────────────────

export function parseMuscuSession(text: string, opts: ParseOptions = {}): MuscuImportResult {
  const genId = opts.genId ?? (() => crypto.randomUUID());
  const issues: ImportIssue[] = [];
  const add = (line: number, raw: string, level: ImportIssueLevel, message: string, stepId?: string) =>
    issues.push({ line, raw, level, message, ...(stepId ? { stepId } : {}) });

  let name = "";
  let short = "";
  let dayOfWeek: number | undefined;
  let recurrence: ProgSession["recurrence"] = "weekly";
  let nbSemainesHeader: number | undefined;
  const sessionNotes: string[] = [];

  const blocs: Bloc[] = [];
  const refs: MuscuExerciseRef[] = [];
  /** Code d'exercice (ex. "A1") de chaque exercice, pour les supersets */
  const codes = new Map<string, { group: string; sub: boolean }>();
  /** Paramètres par semaine écrits sous un exercice */
  const weekParams = new Map<string, Map<number, ExerciceParams>>();
  /** Paramètres « de base » (ligne de l'exercice) */
  const baseParams = new Map<string, ExerciceParams | null>();

  let currentBloc: Bloc | null = null;
  let autoBlocLetter: string | null = null;
  let usesBlocLines = false;
  let lastExo: { exo: Exercice; line: number } | null = null;

  const newBloc = (partial: Partial<Bloc>): Bloc => {
    const b: Bloc = {
      id: genId(),
      name: "Bloc",
      category: "Mixte",
      color: BLOC_PALETTE[blocs.length % BLOC_PALETTE.length],
      series_mode: "libre",
      timing_mode: "libre",
      exercices: [],
      sort_order: blocs.length,
      ...partial,
    };
    blocs.push(b);
    return b;
  };

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i].trim();
    if (raw.startsWith("```")) continue;
    const line = cleanTypography(raw).replace(/^[-*•]\s+/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    const n = norm(line);

    // ── Ligne de semaine sous un exercice : « S2 : 4×8 RIR 3 » ──
    const wk = line.match(/^(?:s|sem|semaine)\s*(\d+)\s*:\s*(.*)$/i);
    if (wk) {
      if (!lastExo) {
        add(lineNo, raw, "error", "Ligne de semaine sans exercice au-dessus → ignorée.");
        continue;
      }
      const week = Number(wk[1]);
      if (week < 1) {
        add(lineNo, raw, "error", "Numéro de semaine invalide (S1, S2…).", lastExo.exo.id);
        continue;
      }
      const presc = parsePrescription(wk[2]);
      if (!presc.params) {
        add(lineNo, raw, "error", `Semaine ${week} illisible → reprend la semaine précédente. ${prescHelp()}`, lastExo.exo.id);
        continue;
      }
      reportPrescription(presc, lineNo, raw, lastExo.exo.id, add);
      if (presc.methodName) add(lineNo, raw, "warning", "Une méthode s'écrit sur la ligne de l'exercice, pas sur une ligne de semaine → ignorée ici.", lastExo.exo.id);
      if (presc.extra) lastExo.exo.comment = joinText(lastExo.exo.comment, `S${week} : ${presc.extra}`);
      if (!weekParams.has(lastExo.exo.id)) weekParams.set(lastExo.exo.id, new Map());
      weekParams.get(lastExo.exo.id)!.set(week, presc.params);
      continue;
    }

    // ── En-têtes « CLÉ : valeur » ──
    const header = line.match(/^([^:|@[\]]+?)\s*:\s*(.*)$/);
    if (header) {
      const key = norm(header[1]);
      const value = header[2].trim();
      const other = OTHER_FORMATS.find(([re]) => re.test(key));
      if (other) {
        add(lineNo, raw, "error", `Ce texte est ${other[1]} : cet import ne lit que les séances MUSCU (1re ligne « SÉANCE MUSCU : titre »).`);
        return { session: emptySession(genId), refs: [], issues };
      }
      if (/^seance( muscu| musculation| force)?$/.test(key)) { name = value; continue; }
      if (key === "abrege" || key === "abreviation" || key === "code") { short = value.slice(0, 6); continue; }
      if (key === "jour") {
        const d = DAYS[norm(value)];
        if (d === undefined) add(lineNo, raw, "warning", `Jour « ${value} » inconnu → aucun jour. Valeurs : Lundi … Dimanche.`);
        else dayOfWeek = d;
        continue;
      }
      if (key === "recurrence") {
        const v = norm(value);
        if (v.startsWith("unique") || v.startsWith("une fois") || v === "once") recurrence = "once";
        else if (v.startsWith("hebdo") || v.startsWith("chaque") || v === "weekly") recurrence = "weekly";
        else add(lineNo, raw, "warning", "Récurrence inconnue → hebdomadaire. Valeurs : hebdo ou unique.");
        continue;
      }
      if (key === "semaines") {
        const v = parseNum(value);
        if (v && v >= 1) nbSemainesHeader = Math.round(v);
        else add(lineNo, raw, "warning", "Nombre de semaines illisible → déduit des lignes S1, S2…");
        continue;
      }
      if (key === "consigne" || key === "consignes") { if (value) sessionNotes.push(value); continue; }
      // sinon : peut-être un exercice « A1 Squat : 3×5 » → suite
    }

    // ── Bloc ──
    if (/^bloc\b/.test(n)) {
      usesBlocLines = true;
      const [head, ...rest] = line.split("|");
      const instructions = rest.join("|").trim();
      currentBloc = newBloc(parseBlocHead(head.replace(/^bloc\s*:?\s*/i, ""), lineNo, raw, add));
      if (instructions) currentBloc.instructions = instructions;
      lastExo = null;
      continue;
    }

    // ── Exercice ──
    const ex = line.match(/^([A-Za-z])\s*(\d+)(?:\s*[.,]\s*(\d+))?\s*[-–.)]?\s+(.+)$/);
    if (ex) {
      const letter = ex[1].toUpperCase();
      const group = `${letter}${ex[2]}`;
      const body = ex[4];

      if (!usesBlocLines && (!currentBloc || autoBlocLetter !== letter)) {
        currentBloc = newBloc({ name: letter });
        autoBlocLetter = letter;
      } else if (!currentBloc) {
        currentBloc = newBloc({ name: "Bloc" });
      }

      // Commentaire : tout ce qui suit le 1er « | » (il peut contenir des « : »)
      const pipe = body.indexOf("|");
      const head = pipe >= 0 ? body.slice(0, pipe) : body;
      const comment = pipe >= 0 ? body.slice(pipe + 1).trim() : "";
      const colon = head.indexOf(":");
      const exoName = (colon >= 0 ? head.slice(0, colon) : head).trim();
      const prescText = (colon >= 0 ? head.slice(colon + 1) : "").trim();

      const exo: Exercice = {
        id: genId(),
        exercise_id: "",
        exercise_name: exoName,
        mode: "classique",
        sort_order: currentBloc.exercices.length,
        params: emptyParams(),
      };
      if (comment) exo.comment = comment;
      if (!exoName) {
        add(lineNo, raw, "error", "Nom d'exercice manquant.", exo.id);
        exo.exercise_name = A_SAISIR;
      }

      const ref: MuscuExerciseRef = { exoId: exo.id, name: exo.exercise_name, line: lineNo, raw };
      if (prescText) {
        const presc = parsePrescription(prescText);
        const unusable = !presc.params && presc.libre === undefined && !presc.methodName;
        if (!unusable) reportPrescription(presc, lineNo, raw, exo.id, add);
        if (presc.libre !== undefined) {
          exo.mode = "libre";
          exo.libre_text = presc.libre;
        }
        if (presc.methodName) {
          ref.methodName = presc.methodName;
          if (presc.methodSets) ref.methodSets = presc.methodSets;
          if (!presc.params) ref.paramsFromMethod = true;
        }
        if (presc.extra && !unusable) exo.comment = joinText(exo.comment, presc.extra);
        if (unusable) {
          add(lineNo, raw, "error", `Prescription « ${prescText} » illisible → à saisir. ${prescHelp()}`, exo.id);
          exo.mode = "libre";
          exo.libre_text = `${A_SAISIR} : ${prescText}`;
        }
        baseParams.set(exo.id, presc.params ?? null);
        if (presc.params) exo.params = presc.params;
      } else {
        baseParams.set(exo.id, null);
      }

      currentBloc.exercices.push(exo);
      codes.set(exo.id, { group, sub: ex[3] !== undefined });
      refs.push(ref);
      lastExo = { exo, line: lineNo };
      continue;
    }

    add(lineNo, raw, "error", `Ligne non reconnue → ignorée. ${HELP_EXO}`);
  }

  // ── Post-traitement ──

  // Exercices sans aucune prescription (ni ligne, ni semaines, ni méthode)
  for (const ref of refs) {
    const exo = findExo(blocs, ref.exoId)!;
    if (exo.mode === "libre" || ref.methodName) continue;
    if (!baseParams.get(exo.id) && !weekParams.has(exo.id)) {
      add(ref.line, ref.raw, "error", `Séries / répétitions manquantes → à saisir. ${prescHelp()}`, exo.id);
      exo.mode = "libre";
      exo.libre_text = A_SAISIR;
    }
  }

  // Semaines
  let maxWeek = 0;
  for (const m of weekParams.values()) for (const w of m.keys()) maxWeek = Math.max(maxWeek, w);
  const nbSemaines = Math.max(maxWeek, weekParams.size > 0 ? nbSemainesHeader ?? 0 : 0);
  for (const [exoId, weeks] of weekParams) {
    const exo = findExo(blocs, exoId)!;
    const rec: Record<string, ExerciceParams> = {};
    const first = weeks.get(Math.min(...weeks.keys()))!;
    let prev = baseParams.get(exoId) ?? first;
    for (let w = 1; w <= nbSemaines; w++) {
      const p = weeks.get(w) ?? prev;
      rec[String(w)] = p;
      prev = p;
    }
    exo.params = rec;
    if (exo.mode === "libre" && exo.libre_text === A_SAISIR) {
      exo.mode = "classique";
      delete exo.libre_text;
    }
  }

  // Supersets : A1.1 + A1.2 (+ A1.3…) consécutifs dans le même bloc
  for (const b of blocs) {
    for (let k = 0; k < b.exercices.length - 1; k++) {
      const cur = codes.get(b.exercices[k].id);
      const next = codes.get(b.exercices[k + 1].id);
      if (cur?.sub && next?.sub && cur.group === next.group) b.exercices[k].superset_with_next = true;
    }
  }

  // Consigne de séance : pas de champ dédié en muscu → consigne du 1er bloc
  if (sessionNotes.length) {
    if (blocs.length) {
      blocs[0].instructions = joinText(sessionNotes.join("\n"), blocs[0].instructions, "\n");
      add(0, "", "info", "Consigne de séance placée dans la consigne du 1er bloc (pas de champ « consigne de séance » en muscu).");
    }
  }

  if (!name) {
    add(0, "", "warning", "Titre absent → « Séance importée ». 1re ligne attendue : « SÉANCE MUSCU : titre ».");
    name = "Séance importée";
  }
  if (!short) short = deriveShort(name);
  if (blocs.length === 0) add(0, "", "error", "Aucun exercice trouvé dans le texte.");

  issues.sort((a, b) => a.line - b.line);

  return {
    session: {
      id: genId(),
      name,
      short,
      ...(dayOfWeek !== undefined ? { day_of_week: dayOfWeek } : {}),
      recurrence,
      multi_semaine: nbSemaines > 0,
      ...(nbSemaines > 0 ? { nb_semaines: nbSemaines } : {}),
      blocs,
    },
    refs,
    issues,
  };
}

// ── Bloc ─────────────────────────────────────────────────────────────────────

type AddIssue = (line: number, raw: string, level: ImportIssueLevel, message: string, stepId?: string) => void;

function parseBlocHead(head: string, line: number, raw: string, add: AddIssue): Partial<Bloc> {
  let h = head.trim();
  const out: Partial<Bloc> = {};

  const cat = h.match(/\[([^\]]*)\]/);
  if (cat) {
    h = (h.slice(0, cat.index) + h.slice(cat.index! + cat[0].length)).trim();
    const c = CATEGORIES[norm(cat[1])];
    if (c) out.category = c;
    else add(line, raw, "warning", `Catégorie « ${cat[1]} » inconnue → Mixte. Valeurs : Echauffement, Force, Hypertrophie, Explo/vitesse, Mixte, Cardio.`);
  }

  // Le nom s'arrête au 1er mot-clé de réglage
  const kw = h.search(/\s(?:repos|r[ée]cup|d[ée]part|libre|\d+\s*(?:s[ée]ries|tours)|s[ée]ries)\b/i);
  const name = (kw >= 0 ? h.slice(0, kw) : h).trim().replace(/[:\-–]$/, "").trim();
  const settings = kw >= 0 ? h.slice(kw) : "";
  out.name = name || "Bloc";

  const dep = settings.match(/d[ée]part\s*:?\s*(\S+)/i);
  const rep = settings.match(/(?:repos|r[ée]cup)\s*:?\s*(\S+)/i);
  if (dep) {
    const s = parseTime(dep[1]);
    if (s) Object.assign(out, { timing_mode: "depart", timing_depart_min: Math.floor(s / 60), timing_depart_sec: s % 60 });
    else add(line, raw, "error", `Départ « ${dep[1]} » illisible → timing libre. Écris « départ 2' » ou « départ 1'30 ».`);
  } else if (rep && norm(rep[1]) !== "libre") {
    const s = parseTime(rep[1]);
    if (s) Object.assign(out, { timing_mode: "repos", timing_repos_min: Math.floor(s / 60), timing_repos_sec: s % 60 });
    else add(line, raw, "error", `Repos « ${rep[1]} » illisible → timing libre. Écris « repos 2' » ou « repos 1'30 ».`);
  }

  const ser = settings.match(/(\d+)\s*(?:s[ée]ries|tours)\b/i) ?? settings.match(/s[ée]ries\s*:?\s*(\d+)/i);
  if (ser) Object.assign(out, { series_mode: "fixe", series_count: Number(ser[1]) });

  return out;
}

// ── Prescription : « 3×8-10 @75% RIR 2 tempo 3-0-1 méthode "Rest-Pause" sur séries 3 » ──

export interface Prescription {
  params: ExerciceParams | null;
  libre?: string;
  methodName?: string;
  methodSets?: number[];
  /** Texte non compris, conservé en commentaire */
  extra?: string;
  notes: { level: ImportIssueLevel; message: string }[];
}

export function parsePrescription(input: string): Prescription {
  let s = ` ${cleanTypography(input).trim()} `;
  const out: Prescription = { params: null, notes: [] };
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = s.match(re);
    if (m) s = s.slice(0, m.index) + " " + s.slice(m.index! + m[0].length);
    return m;
  };

  // Mode libre : tout le reste est le texte
  const libre = s.match(/^\s*libre\b\s*:?\s*(.*)$/i);
  if (libre) {
    out.libre = libre[1].trim().replace(/^"(.*)"$/, "$1");
    return out;
  }

  // Méthode (en dernier dans la ligne ; nom entre guillemets conseillé)
  const methSets = take(/\s(?:sur\s+(?:les\s+)?)?s[ée]ries?\s+(\d+(?:\s*(?:,|-|à|et)\s*\d+)*)\s*$/i);
  const meth = take(/\sm[ée]thode\s*:?\s*(?:"([^"]+)"|(.+?))\s*$/i);
  if (meth) {
    out.methodName = (meth[1] ?? meth[2]).trim();
    if (methSets) out.methodSets = parseSetList(methSets[1]);
  } else if (methSets) {
    // « séries 3 » sans méthode : remis dans le texte
    s += ` ${methSets[0]}`;
  }

  const tempo = take(/\stempo\s*:?\s*([0-9x](?:\s*-\s*[0-9x]){2,3}|[0-9x]{3,4})(?=\s)/i);
  const rir = take(/\sRIR\s*:?\s*(\d+(?:\s*\/\s*\d+)*)(?=\s)/i);
  const rpe = take(/\sRPE\s*:?\s*(\d+(?:[.,]\d)?)(?:\s*-\s*(\d+(?:[.,]\d)?))?(?:\s*\/\s*10)?(?=\s)/i);
  const load = take(/\s@\s*(?:(pdc|bw|poids du corps)|(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*)\s*(kg|%\s*(?:1\s*)?(?:rm)?))(?=\s)/i);
  const restIntra = take(/\sR\s*(\d+)\s*(?:"|s|sec)?(?=\s)/);
  const iso = take(/\siso\b/i);
  const amrap = take(/\s(\d+)\s*x\s*amrap\b/i);
  const sr = take(/\s(\d+)\s*x\s*(\([^)]*\)|[\d"s+\-/]+)(?=\s)/i);

  if (amrap) {
    out.methodName = out.methodName ?? "AMRAP";
    const p = emptyParams();
    p.nb_series = Number(amrap[1]);
    out.params = p;
    out.notes.push({ level: "info", message: "AMRAP → méthode « AMRAP » de la banque." });
  }

  if (sr) {
    const p = out.params ?? emptyParams();
    p.nb_series = Number(sr[1]);
    let reps = sr[2].trim();
    if (/["s]$/.test(reps) || /["s]\//.test(reps)) {
      p.reps_mode = { mode: "global", value: "iso" };
      reps = reps.replace(/["s]/g, "");
    }
    if (reps.includes("+")) {
      const parts = reps.replace(/[()]/g, "").split("+").map((x) => Number(x.trim()));
      if (parts.some((x) => !Number.isFinite(x) || x <= 0)) {
        out.notes.push({ level: "error", message: `Cluster « ${sr[2]} » illisible (écris 3×(3+3) R15")` });
      } else {
        p.cluster = { nb_clusters: parts.length, reps: parts, recup_sec: restIntra ? Number(restIntra[1]) : 15 };
        p.reps = { mode: "global", value: parts[0] };
        if (!restIntra) out.notes.push({ level: "warning", message: "Cluster sans récup intra (R15\") → 15 s par défaut." });
      }
    } else if (reps.includes("/")) {
      const vals = reps.split("/").map((x) => Number(x.trim()));
      if (vals.some((x) => !Number.isFinite(x))) out.notes.push({ level: "error", message: `Répétitions par série « ${sr[2]} » illisibles` });
      else {
        p.reps = { mode: "par_serie", values: fit(vals, p.nb_series, out, "répétitions") };
      }
    } else {
      const range = reps.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        p.reps = { mode: "global", value: Number(range[1]) };
        p.reps_max = { mode: "global", value: Number(range[2]) };
      } else if (/^\d+$/.test(reps)) {
        p.reps = { mode: "global", value: Number(reps) };
      } else {
        out.notes.push({ level: "error", message: `Répétitions « ${sr[2]} » illisibles` });
      }
    }
    if (restIntra && !p.cluster) out.notes.push({ level: "warning", message: `« R${restIntra[1]} » ignoré : la récup intra ne sert qu'aux clusters 3×(3+3) R15".` });
    out.params = p;
  } else if (restIntra) {
    s += ` R${restIntra[1]}`;
  }

  if (out.params) {
    const p = out.params;
    if (iso) p.reps_mode = { mode: "global", value: "iso" };
    if (load) {
      if (load[1]) {
        p.charge_unit = "PDC";
      } else {
        p.charge_unit = /kg/i.test(load[3]) ? "kg" : "%RM";
        const vals = load[2].split("/").map((x) => parseNum(x)!);
        p.charge = vals.length > 1
          ? { mode: "par_serie", values: fit(vals, p.nb_series, out, "charges") }
          : { mode: "global", value: vals[0] };
      }
    }
    if (rir) {
      const vals = rir[1].split("/").map((x) => Number(x.trim()));
      p.rir = vals.length > 1 ? { mode: "par_serie", values: fit(vals, p.nb_series, out, "RIR") } : { mode: "global", value: vals[0] };
      if (rpe) out.notes.push({ level: "warning", message: "RIR et RPE écrits tous les deux → RIR gardé." });
    } else if (rpe) {
      const hi = parseNum(rpe[2] ?? rpe[1])!;
      const v = Math.max(0, Math.round(10 - hi));
      p.rir = { mode: "global", value: v };
      out.notes.push({ level: "info", message: `RPE ${rpe[2] ? `${rpe[1]}-${rpe[2]}` : rpe[1]} → RIR ${v} (RIR = 10 − RPE).` });
    }
    if (tempo) p.tempo = { mode: "global", value: tempo[1].replace(/\s+/g, "").toUpperCase() };
  } else {
    // Sans séries×reps, ces réglages n'ont pas de support → remis dans le texte
    for (const m of [tempo, rir, rpe, load, iso]) if (m) s += ` ${m[0].trim()}`;
  }

  const rest = s.replace(/\s+/g, " ").trim();
  if (rest) {
    out.extra = rest;
    out.notes.push({ level: "warning", message: `« ${rest} » non compris → gardé dans le commentaire de l'exercice` });
  }
  return out;
}

function reportPrescription(p: Prescription, line: number, raw: string, stepId: string, add: AddIssue) {
  for (const n of p.notes) add(line, raw, n.level, n.message, stepId);
}

function prescHelp(): string {
  return "Ex. : 3×8 · 3×8-10 · 4×10/8/6/6 · 3×20\" ISO · 3×(3+3) R15\" · @75% · @80kg · @PDC · RIR 2 · tempo 3-0-1 · libre \"texte\".";
}

function parseSetList(raw: string): number[] {
  const out = new Set<number>();
  for (const part of raw.split(/\s*(?:,|et)\s*/)) {
    const r = part.match(/^(\d+)\s*(?:-|à)\s*(\d+)$/);
    if (r) for (let k = Number(r[1]); k <= Number(r[2]); k++) out.add(k);
    else if (/^\d+$/.test(part.trim())) out.add(Number(part.trim()));
  }
  return [...out].sort((a, b) => a - b);
}

/** Ajuste une liste « par série » au nombre de séries (avertit si différent). */
function fit<T>(vals: T[], nb: number, out: Prescription, what: string): T[] {
  if (vals.length === nb) return vals;
  out.notes.push({ level: "warning", message: `${vals.length} valeurs de ${what} pour ${nb} séries → ajusté (dernière valeur répétée ou surplus ignoré).` });
  const r = vals.slice(0, nb);
  while (r.length < nb) r.push(vals[vals.length - 1]);
  return r;
}

// ── Utilitaires ──────────────────────────────────────────────────────────────

export function emptyParams(): ExerciceParams {
  return {
    nb_series: 1,
    reps: { mode: "global", value: 0 },
    reps_mode: { mode: "global", value: "EC" },
    charge_unit: "kg",
    charge: { mode: "global", value: null },
    rir: { mode: "global", value: null },
    tempo: { mode: "global", value: "" },
  };
}

function joinText(a: string | undefined, b: string | undefined, sep = " · "): string {
  return [a, b].filter((x) => x && x.trim()).join(sep);
}

function findExo(blocs: Bloc[], id: string): Exercice | undefined {
  for (const b of blocs) for (const e of b.exercices) if (e.id === id) return e;
  return undefined;
}

/** « Full body 2 » → « FB2 », « Upper 1 » → « U1 » */
export function deriveShort(name: string): string {
  const words = norm(name).split(/[\s\-_/]+/).filter(Boolean);
  const s = words.map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase())).join("");
  return s.slice(0, 5) || "S";
}

function emptySession(genId: () => string): ProgSession {
  return { id: genId(), name: "", short: "", recurrence: "weekly", multi_semaine: false, blocs: [] };
}
