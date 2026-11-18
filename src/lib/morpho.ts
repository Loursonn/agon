/**
 * Bilan morpho-anatomique (méthode BilanPro, A. Beck) : calculs purs.
 *
 * Analyse osseuse à partir des dernières longueurs connues (taille, envergure,
 * humérus, avant-bras, jambe debout, tibia ; fémur = jambe − tibia), plus les
 * observations à l'œil du coach (abdomen, clavicules, cage) et sa carte
 * musculaire (muscle long ou court). Seuils de terrain de Beck, pas des normes
 * validées.
 */

export type Length = "long" | "court";

export interface MorphoLengths {
  height: number | null;      // taille debout
  wingspan: number | null;    // envergure
  humerus: number | null;     // acromion → olécrane (arm_length_cm)
  forearm: number | null;     // olécrane → tête de l'ulna
  leg: number | null;         // debout, EIAS → malléole interne
  tibia: number | null;       // rotule → malléole (shank_length_cm)
}

export interface MorphoObservations {
  abdomen: "long" | "court" | null;
  clavicules: "longues" | "courtes" | null;
  cage: "epaisse" | "etroite" | null;
  coude_valgus: "aucun" | "modere" | "marque" | null;
  muscles: Partial<Record<MuscleKey, Length>>;
  note: string | null;
}

export const EMPTY_OBSERVATIONS: MorphoObservations = {
  abdomen: null, clavicules: null, cage: null, coude_valgus: null, muscles: {}, note: null,
};

// ── Ratios ───────────────────────────────────────────────────────────────────

export interface MorphoRatios {
  femur: number | null;
  /** Jambe / taille, en %. Repère : 50 %. */
  legPct: number | null;
  /** Envergure − taille, en cm. Repères : 0 et + 8. */
  spanDiff: number | null;
  /** Tibia / fémur, en %. Repère : 100 %. */
  tibiaFemurPct: number | null;
  /** Avant-bras / humérus, en %. Repère : 100 %. */
  forearmHumerusPct: number | null;
}

const ok = (v: number | null): v is number => v != null && Number.isFinite(v) && v > 0;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function morphoRatios(l: MorphoLengths): MorphoRatios {
  const femur = ok(l.leg) && ok(l.tibia) && l.leg > l.tibia ? round1(l.leg - l.tibia) : null;
  return {
    femur,
    legPct: ok(l.leg) && ok(l.height) ? round1((l.leg / l.height) * 100) : null,
    spanDiff: ok(l.wingspan) && ok(l.height) ? round1(l.wingspan - l.height) : null,
    tibiaFemurPct: ok(l.tibia) && femur ? round1((l.tibia / femur) * 100) : null,
    forearmHumerusPct: ok(l.forearm) && ok(l.humerus) ? round1((l.forearm / l.humerus) * 100) : null,
  };
}

// ── Analyse osseuse ──────────────────────────────────────────────────────────

export type SegmentKey =
  | "jambes" | "buste" | "abdomen" | "cage" | "clavicules"
  | "bras" | "humerus" | "avant_bras" | "femurs" | "tibias";

export interface SegmentVerdict {
  key: SegmentKey;
  label: string;
  /** null : mesure ou observation manquante. */
  length: Length | null;
  /** « Bras très longs », « Fémurs courts »… */
  verdict: string | null;
  /** Ce que ça change, adressé à l'athlète. */
  text: string | null;
  /** Ce qui manque pour conclure. */
  missing?: string;
}

const T = {
  jambes: {
    long: "Jambes longues : squat et soulevé de terre plus durs, mais foulée plus grande en course à pied.",
    court: "Jambes courtes : squat et soulevé de terre plus faciles, foulée plus courte en course à pied.",
  },
  buste: {
    court: "Buste court par rapport aux jambes : le buste se penche davantage au squat, plus de contraintes sur le bas du dos.",
    long: "Buste long par rapport aux jambes : le buste reste plus droit au squat, moins de contraintes sur le bas du dos.",
  },
  abdomen: {
    long: "Abdomen long : les pecs prennent moins de place sur le buste et sont plus durs à développer ; la sangle abdominale est un point fort.",
    court: "Abdomen court : les pecs prennent plus de place sur le buste et se développent plus facilement ; la sangle abdominale est un point faible.",
  },
  cage: {
    court: "Cage thoracique étroite : il faut plus d'amplitude sur les mouvements de développé.",
    long: "Cage thoracique épaisse : moins d'amplitude à faire sur les mouvements de développé.",
  },
  clavicules: {
    court: "Clavicules courtes : moins d'amplitude de mouvement des épaules et des omoplates.",
    long: "Clavicules longues : plus d'amplitude de mouvement des épaules et des omoplates.",
  },
  bras: {
    long: "Bras longs (envergure supérieure à la taille) : les bras se développent plus facilement et sont avantagés en poussée et en tirage, au détriment des muscles du tronc.",
    court: "Bras courts (envergure inférieure à la taille) : les bras se développent moins facilement, mais les muscles du tronc sont avantagés.",
  },
  humerus: {
    long: "Humérus longs par rapport aux avant-bras : avantage au développé (on descend moins bas) ; biceps et triceps potentiellement plus durs à développer.",
    court: "Humérus courts par rapport aux avant-bras : on descend plus bas au développé ; biceps et triceps potentiellement plus faciles à développer.",
  },
  avant_bras: {
    court: "Avant-bras courts par rapport aux humérus : on descend moins bas au développé ; avant-bras potentiellement plus faciles à développer.",
    long: "Avant-bras longs par rapport aux humérus : on descend plus bas au développé ; avant-bras potentiellement plus durs à développer.",
  },
  femurs: {
    long: "Fémurs longs par rapport aux tibias : ischios et fessiers avantagés, quadriceps plus durs ; buste plus penché au squat, besoin de plus de mobilité de cheville.",
    court: "Fémurs courts par rapport aux tibias : quadriceps avantagés, ischios et fessiers plus durs ; buste plus droit au squat, peu de mobilité de cheville nécessaire.",
  },
  tibias: {
    court: "Tibias courts par rapport aux fémurs : mollets plus faciles à développer, mais moins d'élasticité et de rebond en course.",
    long: "Tibias longs par rapport aux fémurs : mollets plus durs à développer, mais bonne élasticité et bon rebond en course.",
  },
} as const;

function verdict(key: SegmentKey, label: string, length: Length | null, word: Record<Length, string>, missing: string): SegmentVerdict {
  if (!length) return { key, label, length: null, verdict: null, text: null, missing };
  return { key, label, length, verdict: word[length], text: T[key][length] };
}

export function boneAnalysis(l: MorphoLengths, obs: MorphoObservations): SegmentVerdict[] {
  const r = morphoRatios(l);
  const legs: Length | null = ok(l.leg) && ok(l.height) ? (l.leg >= l.height / 2 ? "long" : "court") : null;
  const bust: Length | null = legs ? (legs === "long" ? "court" : "long") : null;
  const femurs: Length | null = r.femur && ok(l.tibia) ? (r.femur > l.tibia ? "long" : "court") : null;
  const tibias: Length | null = femurs ? (femurs === "long" ? "court" : "long") : null;
  const arms: Length | null = r.spanDiff != null ? (r.spanDiff >= 0 ? "long" : "court") : null;
  const humerus: Length | null = ok(l.humerus) && ok(l.forearm) ? (l.humerus > l.forearm ? "long" : "court") : null;
  const forearm: Length | null = humerus ? (humerus === "long" ? "court" : "long") : null;
  const abdomen: Length | null = obs.abdomen;
  const cage: Length | null = obs.cage ? (obs.cage === "epaisse" ? "long" : "court") : null;
  const clav: Length | null = obs.clavicules ? (obs.clavicules === "longues" ? "long" : "court") : null;

  const armsVerdict = arms === "long" && (r.spanDiff ?? 0) >= 8 ? { long: "Bras très longs", court: "Bras courts" } : { long: "Bras longs", court: "Bras courts" };

  return [
    verdict("jambes", "Jambes", legs, { long: "Jambes longues", court: "Jambes courtes" }, "taille et jambe debout"),
    verdict("buste", "Buste", bust, { long: "Buste long", court: "Buste court" }, "taille et jambe debout"),
    verdict("femurs", "Fémurs", femurs, { long: "Fémurs longs", court: "Fémurs courts" }, "jambe debout et tibia"),
    verdict("tibias", "Tibias", tibias, { long: "Tibias longs", court: "Tibias courts" }, "jambe debout et tibia"),
    verdict("bras", "Bras", arms, armsVerdict, "taille et envergure"),
    verdict("humerus", "Humérus", humerus, { long: "Humérus longs", court: "Humérus courts" }, "humérus et avant-bras"),
    verdict("avant_bras", "Avant-bras", forearm, { long: "Avant-bras longs", court: "Avant-bras courts" }, "humérus et avant-bras"),
    verdict("abdomen", "Abdomen", abdomen, { long: "Abdomen long", court: "Abdomen court" }, "observation à l'œil"),
    verdict("cage", "Cage thoracique", cage, { long: "Cage épaisse", court: "Cage étroite" }, "observation à l'œil"),
    verdict("clavicules", "Clavicules", clav, { long: "Clavicules longues", court: "Clavicules courtes" }, "observation à l'œil"),
  ];
}

// ── Analyse musculaire ───────────────────────────────────────────────────────

export type MuscleKey =
  | "pectoraux" | "deltoide_anterieur" | "deltoide_moyen" | "deltoide_posterieur"
  | "grand_dorsal" | "trapezes" | "triceps" | "biceps" | "brachioradial"
  | "abdos" | "quadriceps" | "fessiers" | "ischios" | "mollets";

export interface MuscleDef {
  key: MuscleKey;
  label: string;
  zone: "haut" | "bras" | "bas";
  /** Pose de la photo à regarder. */
  pose: string;
  long: string;
  court: string;
}

export const MUSCLES: MuscleDef[] = [
  { key: "pectoraux", label: "Pectoraux", zone: "haut", pose: "De face", long: "descendent bas sur le thorax, vont jusqu'au deltoïde", court: "s'arrêtent haut, creux en haut ou au sternum" },
  { key: "deltoide_anterieur", label: "Deltoïde antérieur", zone: "haut", pose: "De face", long: "descend sous la tubérosité de l'humérus", court: "s'arrête au-dessus" },
  { key: "deltoide_moyen", label: "Deltoïde moyen", zone: "haut", pose: "Double biceps de dos", long: "au moins aussi long que la distance restante jusqu'au coude", court: "plus court que cette distance" },
  { key: "deltoide_posterieur", label: "Deltoïde postérieur", zone: "haut", pose: "Profil ou double biceps de dos", long: "va loin sur l'omoplate, proche du trapèze", court: "gros écart avec le trapèze" },
  { key: "grand_dorsal", label: "Grand dorsal", zone: "haut", pose: "Dos, pose dorsaux", long: "descend jusqu'à la taille, recouvre le fascia", court: "s'arrête haut, « sapin de Noël » visible" },
  { key: "trapezes", label: "Trapèzes", zone: "haut", pose: "Face et dos", long: "monte haut sur le cou, inférieur bas et large", court: "s'arrête haut, peu étendu" },
  { key: "abdos", label: "Abdos", zone: "haut", pose: "De face", long: "bas des pecs → bas des abdos > bas des pecs → clavicule", court: "le contraire" },
  { key: "triceps", label: "Triceps", zone: "bras", pose: "De profil", long: "descend près du coude, monte haut sur l'omoplate", court: "s'arrête loin du coude" },
  { key: "biceps", label: "Biceps", zone: "bras", pose: "Double biceps", long: "peu d'espace avec l'avant-bras", court: "beaucoup d'espace (pic marqué)" },
  { key: "brachioradial", label: "Brachioradial", zone: "bras", pose: "Profil, coude 90° contracté", long: "descend bas sur le radius", court: "s'arrête haut" },
  { key: "quadriceps", label: "Quadriceps", zone: "bas", pose: "De face, contracté", long: "vastes et droit fémoral descendent près du genou", court: "s'arrêtent haut sur la cuisse" },
  { key: "fessiers", label: "Fessiers", zone: "bas", pose: "De profil", long: "descend bas sur l'arrière de la cuisse", court: "s'arrête haut (fessier rebondi)" },
  { key: "ischios", label: "Ischios", zone: "bas", pose: "Jambe semi-tendue de profil", long: "descendent près du genou, continuent sous la fesse", court: "s'arrêtent au-dessus de la mi-cuisse" },
  { key: "mollets", label: "Mollets", zone: "bas", pose: "Dos, pointe des pieds", long: "descendent jusqu'à la cheville, Achille court", court: "long tendon d'Achille" },
];

export function muscleSummary(obs: MorphoObservations): { forts: MuscleDef[]; faibles: MuscleDef[] } {
  return {
    forts: MUSCLES.filter((m) => obs.muscles[m.key] === "long"),
    faibles: MUSCLES.filter((m) => obs.muscles[m.key] === "court"),
  };
}

// ── Conseils de programmation ────────────────────────────────────────────────

export type AdviceStatus = "avantage" | "adapter" | "neutre";

export interface MovementAdvice {
  key: "squat" | "souleve" | "developpe" | "tirage" | "elevations" | "course";
  label: string;
  status: AdviceStatus;
  /** Conseils concrets de programmation. */
  conseils: string[];
  /** Segments qui expliquent le statut (« fémurs longs »…). */
  because: string[];
}

/**
 * Pour chaque grand mouvement : avantagé, à adapter ou neutre selon les
 * leviers, avec les réglages concrets (variante, amplitude, priorité).
 */
export function programmingAdvice(bones: SegmentVerdict[]): MovementAdvice[] {
  const v = Object.fromEntries(bones.map((b) => [b.key, b.length])) as Record<SegmentKey, Length | null>;
  const word = (k: SegmentKey) => bones.find((b) => b.key === k)?.verdict?.toLowerCase() ?? "";
  const out: MovementAdvice[] = [];
  const push = (key: MovementAdvice["key"], label: string, plus: SegmentKey[], minus: SegmentKey[], ifPlus: string[], ifMinus: string[]) => {
    const status: AdviceStatus = minus.length ? "adapter" : plus.length ? "avantage" : "neutre";
    out.push({
      key, label, status,
      conseils: status === "adapter" ? ifMinus : status === "avantage" ? ifPlus : [],
      because: [...minus, ...plus].map(word).filter(Boolean),
    });
  };
  const has = (k: SegmentKey, l: Length) => v[k] === l;
  const pick = (pairs: [SegmentKey, Length][]) => pairs.filter(([k, l]) => has(k, l)).map(([k]) => k);

  push("squat", "Squat",
    pick([["femurs", "court"], ["jambes", "court"]]),
    pick([["femurs", "long"], ["jambes", "long"]]),
    ["Back squat barre haute, amplitude complète : mouvement roi pour les quadriceps."],
    ["Talons surélevés ou chaussures d'haltéro, écartement un peu plus large.", "Front squat, hack squat, presse ou squat bulgare pour cibler les quadriceps.", "Mobilité de cheville en routine."]);

  push("souleve", "Soulevé de terre",
    pick([["bras", "long"], ["jambes", "court"]]),
    pick([["bras", "court"]]),
    ["Conventionnel : levier favorable, mouvement à prioriser en force."],
    ["Trap bar ou sumo pour garder le buste plus droit.", "Pas de soulevé en déficit ; hip thrust et RDL pour la chaîne postérieure."]);

  push("developpe", "Développé",
    pick([["humerus", "long"], ["cage", "long"]]),
    pick([["cage", "court"], ["humerus", "court"]]),
    ["Développé couché barre : peu d'amplitude, bon potentiel en force."],
    ["Haltères ou prise un peu plus large pour réduire l'amplitude.", "Arc thoracique et omoplates serrées ; amplitude contrôlée en bas.", "Dips et écartés pour les pecs plutôt que du volume barre."]);

  push("tirage", "Tirage",
    [],
    pick([["bras", "long"]]),
    [],
    ["Prise neutre et sangles : penser coudes, pas mains, pour garder le travail sur les dorsaux.", "Tirages à la poulie unilatéraux, amplitude complète en étirement."]);

  push("elevations", "Élévations d'épaules",
    pick([["bras", "court"]]),
    pick([["bras", "long"]]),
    ["Élévations latérales libres : levier court, charge facile à progresser."],
    ["Élévations à la poulie ou à la machine, coude légèrement fléchi.", "Charges modérées, plus de séries : le levier long rend la charge lourde."]);

  push("course", "Course et pliométrie",
    pick([["jambes", "long"], ["tibias", "long"]]),
    pick([["tibias", "court"]]),
    ["Grande foulée et bonne élasticité : la pliométrie et le travail de vitesse rapportent vite."],
    ["Travail élastique pied-cheville : pogos, sauts à la corde, bondissements.", "Mollets en volume (tibia court = mollet facile à développer)."]);

  return out;
}

export interface MusclePriority { muscle: MuscleDef; conseil: string }

/** Muscles courts = priorités de volume ; muscles longs = potentiel à exploiter. */
export function musclePriorities(obs: MorphoObservations): { priorites: MusclePriority[]; atouts: MusclePriority[] } {
  const { forts, faibles } = muscleSummary(obs);
  return {
    priorites: faibles.map((m) => ({ muscle: m, conseil: "Volume ciblé, amplitude contrôlée en étirement maximal" })),
    atouts: forts.map((m) => ({ muscle: m, conseil: "Potentiel élevé : charge lourde et grande amplitude" })),
  };
}
