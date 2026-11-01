/**
 * Points forts / points faibles, drapeaux, règles d'axes de travail et plan de bloc.
 *
 * Règles validées par Hugo le 31/10/2026 (03-Evaluation-athlete.md, « Axes de
 * travail »). Port de axesPlan() / roxPlan() et de la logique des cas types du
 * radar bilan YOXX. Le moteur PROPOSE ; le coach valide ; l'athlète ne voit
 * que la version validée.
 */
import { SEGMENTS, type SegmentName } from "./chronoData";
import { csForTarget, predictChrono, segmentsAt, type ChronoPrediction, type Division } from "./chrono";
import { noteOf, type ScoreResult } from "./scores";
import type { AxesParams, GridSet, MetricSource, RuleCondition, Sex, WorkAxisRule } from "./types";
import { fmtHm, fmtTime, fr, num, parseTime } from "./util";

// ── Points forts / faibles et drapeaux ──────────────────────────────────────

export interface Flag { key: string; text: string; source: MetricSource }

export interface StrengthsWeaknesses {
  strengths: { key: string; label: string; score: number }[];
  weaknesses: { key: string; label: string; score: number }[];
  flags: Flag[];
}

export function strengthsWeaknesses(r: ScoreResult, set: GridSet): StrengthsWeaknesses {
  const scored = r.axes.filter(a => a.score != null) as { key: string; label: string; score: number }[];
  const asc = [...scored].sort((a, b) => a.score - b.score);
  const desc = [...scored].sort((a, b) => b.score - a.score);
  const flags: Flag[] = [];
  for (const a of r.asymmetries) flags.push({ key: `asym_${a.key}`, text: `Asymétrie ${a.key} ${Math.round(a.lsi * 100)} %`, source: "ma méthode" });
  const caps = set.scoring.robustness_caps;
  if (r.ktw_diff_cm != null && r.ktw_diff_cm > caps.ktw_diff_flag_cm) flags.push({ key: "ktw_diff", text: `Écart knee-to-wall G/D de ${fr(r.ktw_diff_cm)} cm`, source: "publiée" });
  const [lo, hi] = set.scoring.thruster_press_expected;
  if (r.thruster_press != null && (r.thruster_press < lo || r.thruster_press > hi))
    flags.push({ key: "thruster_press", text: `Ratio thruster / press ${fr(r.thruster_press, 2)} (attendu ${fr(lo)}-${fr(hi)})`, source: "ma méthode" });
  for (const [k, label] of [["sled_push_reserve", "Sled Push"], ["sled_pull_reserve", "Sled Pull"]] as const) {
    const n = noteOf(r, k);
    if (n != null && n <= 2) flags.push({ key: k, text: `${label} : la charge de course dépasse 75 % de la charge max estimée`, source: "ma méthode" });
  }
  return { strengths: desc.slice(0, 3), weaknesses: asc.slice(0, 3), flags };
}

// ── Règles (table hyrox_work_axes_rules) ────────────────────────────────────

/** Valeurs lisibles par les règles : note.<clé>, val.<clé> et lectures dérivées. */
export function ruleMetrics(r: ScoreResult, inputs: { wb_no_reps?: number | null }): Record<string, number | null> {
  const m: Record<string, number | null> = {};
  for (const x of r.measures) {
    m[`val.${x.key}`] = x.value;
    if (!x.reading) m[`note.${x.key}`] = x.note;
  }
  const lsis = Object.values(r.lsi).filter((x): x is number => x != null);
  m["lsi.min"] = lsis.length ? Math.min(...lsis) : null;
  m["e"] = r.running.e;
  m["week1.sled_push_drop"] = r.week1_push?.worst_intra_drop ?? null;
  m["week1.sled_pull_drop"] = r.week1_pull?.worst_intra_drop ?? null;
  m["val.wb_last_first"] = r.wb_last_first;
  m["val.wb_no_reps"] = num(inputs.wb_no_reps);
  return m;
}

function evalCond(c: RuleCondition, m: Record<string, number | null>, sex: Sex): boolean {
  if ("all" in c) return c.all.every(x => evalCond(x, m, sex));
  if ("any" in c) return c.any.some(x => evalCond(x, m, sex));
  const v = m[c.metric];
  if (v == null) return false;
  if (c.op === "<=_metric_minus") {
    const o = m[c.other];
    return o != null && v <= o - c.value;
  }
  const ref = typeof c.value === "number" ? c.value : c.value[sex];
  switch (c.op) {
    case "<": return v < ref;
    case "<=": return v <= ref;
    case ">": return v > ref;
    case ">=": return v >= ref;
  }
}

export function matchRules(rules: WorkAxisRule[], metrics: Record<string, number | null>, sex: Sex): WorkAxisRule[] {
  return rules.filter(x => x.active && evalCond(x.condition, metrics, sex));
}

// ── Contexte de l'athlète (cas types) ───────────────────────────────────────

export interface LastRaceRoxzone {
  /** Top % au classement final et en Roxzone, même course. */
  top_pct_final?: number | null;
  top_pct_roxzone?: number | null;
  roxzone_s?: number | string | null;
  /** Run moyen des runs 2 à 7 (s). */
  avg_run_s?: number | string | null;
  cause?: "marche" | "orga" | "site" | null;
}

export interface AthleteContext {
  competition: "A" | "B" | "C" | "none";
  weeks_to_a?: number | null;
  injury_risk?: boolean;
  pain?: boolean;
  comeback?: boolean;
  first_hyrox?: boolean;
  duo?: boolean;
  /** Duo ou relais : stations qu'il fera (les autres en entretien). */
  duo_stations?: SegmentName[] | null;
  to_pro?: boolean;
  four_sessions?: boolean;
  missing_equipment?: boolean;
  wish?: string | null;
  insists?: boolean;
  tech_faults?: { wall_balls?: boolean; bbj?: boolean; sleds?: boolean };
  last_race?: LastRaceRoxzone | null;
}

export type SegmentRole =
  | "Principal 2"
  | "Principal 2 (technique, no-reps, transitions)"
  | "Principal 2 au bloc suivant"
  | "Appoint (technique)"
  | "Entretien"
  | "Appoint en zone 1"
  | "Analyse à part (parcours)";

export interface SegmentRow {
  segment: SegmentName;
  quality: "Endurance de force" | "Sleds" | "Grip" | null;
  gain_s: number;
  category: "petit" | "moyen" | "gros" | null;
  /** Catégorie décalée par la note au test. */
  shifted_by_note: boolean;
  note: number | null;
  speed: "rapide" | "moyenne" | null;
  role: SegmentRole;
  rank: number;
}

export interface PlanItem { label: string; detail: string }

export interface RoxzoneReading { text: string; loss: boolean; cause: LastRaceRoxzone["cause"] | null; points: number | null; ratio: number | null }

export interface AxesPlan {
  algo: "axes@1.0.0";
  estimate_s: number;
  target_s: number;
  /** Chrono visé déjà atteint : calcul sur C − 10 min. */
  target_shifted: boolean;
  gap_s: number;
  run_gain_s: number;
  rows: SegmentRow[];
  /** Qualité retenue par la matrice (avant les cas types). */
  matrix_group: string | null;
  short_prep: boolean;
  course: { cs_kmh: number; cs_min_kmh: number; stations_level: "fortes" | "moyennes" | "faibles"; orientation: "seuils" | "vitesse" | null; vo2_all_year: boolean; text: string };
  principal1: PlanItem;
  principal2: PlanItem & { from: "matrice" | "pain" | "comeback" | "risk" | "first" | "wish" };
  appoint: { items: string[]; detail: string };
  maintenance: string[];
  safety: string[];
  roxzone: RoxzoneReading;
  block: string[];
}

export function roxzoneReading(lr: LastRaceRoxzone | null | undefined, p: AxesParams): RoxzoneReading {
  const pf = num(lr?.top_pct_final), pr = num(lr?.top_pct_roxzone);
  const rt = parseTime(lr?.roxzone_s), rr = parseTime(lr?.avg_run_s);
  if (pf == null && pr == null && rt == null)
    return { text: "Pas de course passée : transitions apprises en simulation, fiche parcours avant la course.", loss: false, cause: null, points: null, ratio: null };
  const ratio = rt != null && rr ? rt / rr : null;
  const dp = pf != null && pr != null ? pr - pf : null;
  const parts: string[] = [];
  if (dp != null) parts.push(`top ${fr(pr, 0)} % en Roxzone contre top ${fr(pf, 0)} % au final (${dp > 0 ? `${dp.toFixed(0)} points en dessous` : "au niveau ou mieux"})`);
  if (ratio != null) parts.push(`Roxzone ${Math.round(ratio * 100)} % de son run moyen`);
  const loss = dp != null && ratio != null && dp >= p.rox_points && ratio > p.rox_ratio;
  const c = lr?.cause ?? null;
  let v = dp == null || ratio == null
    ? "Données incomplètes : il faut les deux rangs, la Roxzone et le run moyen."
    : loss ? "Perte réelle." : "Pas de perte réelle : c'est le parcours, ou c'est correct.";
  if (loss)
    v += c === "marche" ? " Cause : marche après les stations, course enchaînée dans le principal 1."
      : c === "orga" ? " Cause : organisation, transitions répétées en simulation en appoint."
      : c === "site" ? " Cause : grand site, rien à corriger."
      : " Cause à trouver (vidéo, montre, questions).";
  return { text: (parts.length ? `${parts.join(" · ")}. ` : "") + v, loss, cause: c, points: dp, ratio };
}

interface SegDef { i: number; n: SegmentName; q?: SegmentRow["quality"]; noteKey?: Parameters<typeof noteOf>[1]; tk?: "wall_balls" | "bbj" | "sleds"; fix?: SegmentRole }

const SEG_DEFS: SegDef[] = [
  { i: 7, n: "Wall balls", q: "Endurance de force", noteKey: "wall_balls", tk: "wall_balls" },
  { i: 3, n: "BBJ", q: "Endurance de force", noteKey: "bbj_80", tk: "bbj" },
  { i: 6, n: "Fentes", q: "Endurance de force" },
  { i: 2, n: "Sled Pull", q: "Sleds", noteKey: "sled_pull_reserve", tk: "sleds" },
  { i: 1, n: "Sled Push", q: "Sleds", noteKey: "sled_push_reserve", tk: "sleds" },
  { i: 5, n: "Farmers", q: "Grip", noteKey: "dead_hang" },
  { i: 4, n: "Rameur", fix: "Appoint en zone 1" },
  { i: 0, n: "SkiErg", fix: "Appoint en zone 1" },
  { i: 8, n: "Roxzone", fix: "Analyse à part (parcours)" },
];

/**
 * Plan du bloc : 2 axes principaux + l'appoint.
 * @param target_s chrono visé saisi par le coach (s)
 */
export function axesPlan(
  r: ScoreResult,
  d: Division,
  target_s: number,
  ctx: AthleteContext,
  set: GridSet,
  opts: { age?: number | null; prediction?: ChronoPrediction | null } = {},
): AxesPlan | null {
  const p = set.axes;
  const P = opts.prediction ?? predictChrono(r, d);
  const cs = r.running.cs_kmh;
  if (!P || cs == null) return null;

  // 1. Chrono estimé C et visé T.
  const C = P.median_s;
  let T = target_s;
  let shifted = false;
  if (T > C - p.target_margin_s) { T = C - p.shift_s; shifted = true; }
  const gap = C - T;

  // 2. Gains par segment (athlète médian à C − athlète médian à T).
  const a = segmentsAt(C, d), b = segmentsAt(T, d);
  const g = SEGMENTS.map((_, i) => a[i] - b[i]);
  const runGain = gap - g.reduce((s, x) => s + x, 0);

  const short = ctx.competition === "A" && (num(ctx.weeks_to_a) ?? 0) > 0 && (num(ctx.weeks_to_a) as number) < p.short_prep_weeks;
  const CAT = ["petit", "moyen", "gros"] as const;
  const duoKeep = ctx.duo && ctx.duo_stations?.length ? new Set(ctx.duo_stations) : null;

  // 3-5. Matrice gain × vitesse.
  const rows: SegmentRow[] = SEG_DEFS.map(def => {
    const gs = g[def.i];
    const ratio = gs / gap;
    let c = ratio >= p.gain_big ? 2 : ratio >= p.gain_medium ? 1 : 0;
    const c0 = c;
    const nt = def.noteKey ? noteOf(r, def.noteKey) : null;
    if (nt != null) {
      if (nt <= p.note_up) c = Math.min(2, c + 1);
      else if (nt >= p.note_down) c = Math.max(0, c - 1);
    }
    if (ctx.to_pro && /Wall balls|Sled/.test(def.n)) c = Math.min(2, c + 1);
    const v: SegmentRow["speed"] = def.tk && ctx.tech_faults?.[def.tk] ? "rapide" : "moyenne";
    let role: SegmentRole, rk = 9;
    if (def.fix) role = def.fix;
    else if (duoKeep && !duoKeep.has(def.n)) role = "Entretien";
    else if (short && c === 2) { role = "Principal 2 (technique, no-reps, transitions)"; rk = 1; }
    else if (short && c === 1) role = "Appoint (technique)";
    else if (short) role = "Entretien";
    else if (c === 2 && v === "rapide") { role = "Principal 2"; rk = 1; }
    else if (c === 2) { role = "Principal 2"; rk = 2; }
    else if (c === 1 && v === "moyenne") { role = "Principal 2 au bloc suivant"; rk = 3; }
    else if (v === "rapide") role = "Appoint (technique)";
    else role = "Entretien";
    return {
      segment: def.n, quality: def.q ?? null, gain_s: gs, category: def.fix ? null : CAT[c], shifted_by_note: !def.fix && c !== c0,
      note: nt, speed: def.fix ? null : v, role, rank: rk,
    };
  });
  const p2 = rows.filter(x => x.rank <= 2).sort((x, y) => x.rank - y.rank || (x.note ?? 3) - (y.note ?? 3) || y.gain_s - x.gain_s);
  let grp: string | null = p2.length ? p2[0].quality : null;
  if (short) grp = p2.length ? "Gains rapides" : null;
  else {
    if (ctx.to_pro) {
      grp = "Sleds";
      rows.forEach(x => { if (x.quality === "Sleds") { x.role = "Principal 2"; x.rank = Math.min(x.rank, 2); } });
    }
    rows.forEach(x => { if (x.rank <= 2 && x.quality !== grp) x.role = "Principal 2 au bloc suivant"; });
  }

  // Course : principal 1, toujours.
  const lvl = P.station_level ? P.station_level.mean : 3;
  const col: 1 | 2 | 3 = lvl >= p.stations_strong ? 1 : lvl <= p.stations_weak ? 3 : 2;
  const need = csForTarget(T, col, d, p.standard_dprime_m).cs_kmh;
  const levelName = (["", "fortes", "moyennes", "faibles"] as const)[col] as "fortes" | "moyennes" | "faibles";
  const e = r.running.e;
  const orientation = e == null ? null : e < set.running.e_reading_cut ? "seuils" : "vitesse";
  const vmaNote = noteOf(r, "vma");
  const vo2 = vmaNote != null && vmaNote <= 2;
  let course = `VC ${fr(cs)} km/h, minimum ${fr(need)} pour ${fmtHm(T)} (stations ${levelName})${cs < need ? `, écart ${fr(need - cs)} km/h` : ", au-dessus du minimum"}. `;
  if (e != null) course += orientation === "seuils" ? `Facteur d'endurance ${fr(e, 2)} : seuils, zone 2 longue près de la VC.` : `Facteur d'endurance ${fr(e, 2)} : vitesse, zone 3 courte.`;
  if (vo2) course += " VMA basse : VO2 toute l'année.";

  // 7. Sécurité, hors classement.
  const safety: string[] = r.asymmetries.map(x => `asymétrie ${x.key} ${Math.round(x.lsi * 100)} %`);
  const kt = r.ktw_weak_cm;
  if (kt != null && kt < set.scoring.robustness_caps.ktw_below_cm) safety.push(`knee-to-wall ${fr(kt)} cm`);
  for (const [l, k] of [["pointes", "calf_raise"], ["pont 1 jambe", "bridge"], ["assis-debout 1 jambe", "sit_to_stand"]] as const) {
    const n = noteOf(r, k);
    if (n != null && n <= 2) safety.push(`${l} note ${n}`);
  }

  // 7b. Roxzone.
  const RX = roxzoneReading(ctx.last_race, p);

  // 8. Cas types : le premier qui s'applique remplace le principal 2.
  const p2Items = rows.filter(x => /^Principal 2($| \()/.test(x.role));
  const p2s = p2Items.map(x => `${x.segment} (${fmtTime(x.gain_s)})`).join(", ");
  const matrix = grp ? grp + (p2s ? ` · ${p2s}` : "") : "Aucun gros gain : on reste sur la course";
  const riskBC = !!ctx.injury_risk && (ctx.competition === "B" || ctx.competition === "C");
  const older = (num(opts.age) ?? 0) >= p.older_age;
  const wish = (ctx.wish ?? "").trim();

  let from: AxesPlan["principal2"]["from"] = "matrice";
  let v1 = "Course", d1 = course, v2 = "", d2 = "";
  if (ctx.pain) { from = "pain"; v2 = "Robustesse (réathlétisation)"; d2 = "Douleur déjà présente : si rééducation nécessaire, kiné d'abord. Avis médical ou du kiné."; }
  else if (ctx.comeback) { from = "comeback"; v2 = "Robustesse, remise en route"; v1 = "Course en zone 1"; d1 = "Reprise après coupure : bloc 1 de remise en route, la matrice s'applique au bloc 2."; }
  else if (riskBC) { from = "risk"; v2 = "Robustesse, la blessure à risque"; v1 = "Course, en volume prudent"; d1 = `Compétition classée ${ctx.competition} : on se concentre sur la blessure.`; }
  else if (ctx.first_hyrox) { from = "first"; v2 = "Robustesse"; v1 = "Course, en volume"; d1 = "Premier HYROX : objectif finir entier, le chrono passe après (sauf si l'athlète en veut un)."; }
  else if (wish && ctx.insists) { from = "wish"; v2 = `${wish} (envie de l'athlète)`; d2 = `Il insiste : choix noté dans sa fiche. Matrice : ${matrix}.`; }
  if (from !== "matrice" && from !== "wish" && grp) d2 += `${d2 ? " " : ""}${grp} passe au bloc suivant.`;
  if (RX.loss && RX.cause === "marche" && !["comeback", "risk", "first"].includes(from)) d1 += " Plus la course enchaînée juste après les stations (perte en Roxzone).";
  if (from === "matrice") {
    v2 = matrix;
    d2 = short ? "Prépa courte : seulement les gains rapides sur les stations à gros gain." : grp ? "Gros gain, ajusté par la note au test." : "";
    if (ctx.to_pro && !short) d2 = "Passage à Pro : sleds et wall balls montent d'un cran, force aux sleds en principal 2.";
    if (ctx.duo) d2 += `${d2 ? " " : ""}Duo ou relais : garder seulement les stations qu'il fera, les autres en entretien.`;
  }

  // Appoint.
  const robOn = ["pain", "comeback", "risk", "first"].includes(from);
  const ap = ["ergos en zone 1", ...rows.filter(x => x.role === "Appoint (technique)").map(x => `technique ${x.segment}`)];
  if (from === "first") ap.push("stations en technique et standards");
  if (!robOn && (safety.length || ctx.injury_risk || older))
    ap.push(`robustesse${ctx.injury_risk ? " renforcée (blessure à risque, compétition A : risque accepté avec l'athlète)" : older ? " toujours (45 ans ou plus)" : " 10 à 15 min"}`);
  if (wish && !ctx.insists) ap.push(`${wish} (envie de l'athlète)`);
  if (RX.loss && RX.cause === "orga") ap.push("transitions répétées en simulation");

  const maintenance = rows.filter(x => x.role === "Entretien" || x.role === "Principal 2 au bloc suivant").map(x => x.segment + (x.role === "Entretien" ? "" : " (bloc suivant)"));
  const block = [short ? "Prépa courte : un seul bloc de 4 à 5 semaines, puis l'affûtage." : `Bloc de 4 à 5 semaines${older ? ", décharge systématique en fin de bloc (45 ans ou plus)." : ", décharge si besoin."}`];
  if (ctx.competition === "none") block.push("Pas de compétition datée : matrice pure, fixer une compétition B pour le retest.");
  if (ctx.missing_equipment) block.push("Matériel manquant : un substitut en salle, la vraie station quand il a accès à une box.");

  return {
    algo: "axes@1.0.0",
    estimate_s: C, target_s: T, target_shifted: shifted, gap_s: gap, run_gain_s: runGain, rows, matrix_group: grp, short_prep: short,
    course: { cs_kmh: cs, cs_min_kmh: need, stations_level: levelName, orientation, vo2_all_year: vo2, text: course },
    principal1: { label: v1, detail: d1 },
    principal2: { label: v2, detail: d2, from },
    appoint: { items: ap, detail: ctx.four_sessions ? "4 séances par semaine : l'appoint passe dans les échauffements et les retours au calme." : "" },
    maintenance, safety, roxzone: RX, block,
  };
}
