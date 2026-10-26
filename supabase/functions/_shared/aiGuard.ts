/**
 * Garde-fou IA — ce qui peut atteindre Gemini, et sous quelles conditions.
 *
 * Deux problèmes distincts, traités ici au même endroit parce qu'ils ont la
 * même conséquence si on les rate : du texte non prévu part chez un tiers.
 *
 * 1. `athlete-insights` construisait son prompt en interpolant directement
 *    `JSON.stringify(await req.json())`. Le serveur ne décidait donc pas de ce
 *    qu'il envoyait : le client pouvait y glisser n'importe quel champ, et
 *    jusqu'à 4 000 caractères de texte arbitraire — payés par notre quota et
 *    injectés dans les instructions du modèle. `sanitizeTrendStats` renverse
 *    la charge : seuls les champs connus, retypés et bornés, franchissent la
 *    frontière.
 *
 * 2. Les données de montre arrivent avec une provenance, et les conditions du
 *    fournisseur ne permettent pas toutes de les transmettre à un modèle. La
 *    règle vit en base (`data_source_policies`), le consentement de l'athlète
 *    aussi (`current_consents`), et `aiEligibleSources` les combine. Le chemin
 *    IA ne lit par ailleurs que les vues `ai_provider_*`, qui ne contiennent
 *    pas les lignes interdites : oublier le filtre devient impossible plutôt
 *    que déconseillé.
 */

/** Sources de données telles que définies par l'enum `public.data_source`. */
export type DataSource = "garmin" | "coros" | "file_import" | "manual";

/**
 * Nombre fini dans une plage donnée, ou null.
 *
 * Tout ce qui n'est pas un nombre utilisable devient `null` et non `0` : un
 * zéro inventé est une donnée fausse, que le modèle commenterait comme si
 * elle était vraie (« ton sommeil est tombé à 0 h »).
 */
function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return Math.round(n * 100) / 100;
}

function int(v: unknown, min: number, max: number): number | null {
  const n = num(v, min, max);
  return n === null ? null : Math.round(n);
}

/** Objet brut indexable, sans recourir à `any`. */
function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Agrégats de tendance, après filtrage. Forme fermée et entièrement numérique. */
export interface SafeTrendStats {
  periode_jours: number;
  score_sante_moyen: number | null;
  score_sante_periode_prec: number | null;
  poids_kg: number | null;
  poids_variation_kg: number | null;
  poids_objectif_kg: number | null;
  sommeil: {
    score: number | null;
    heures_moy: number | null;
    objectif_h: number | null;
    ecart_coucher_min: number | null;
  } | null;
  sommeil_score_periode_prec: number | null;
  fatigue_moy_1a5: number | null;
  stress_moy_1a5: number | null;
  seances: { done: number | null; total: number | null } | null;
  seances_periode_prec: { done: number | null; total: number | null } | null;
  records: { exercice: string; kg: number | null; gain_kg: number | null }[];
}

/**
 * Nom d'exercice : conservé parce que le modèle doit pouvoir le citer, mais
 * c'est le seul texte libre admis. Donc tronqué court, débarrassé des sauts de
 * ligne et des délimiteurs qui permettraient de refermer le bloc de données
 * pour écrire des instructions à la suite.
 */
function label(v: unknown, maxLen = 40): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\r\n`$]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

function attendance(v: unknown): { done: number | null; total: number | null } | null {
  const o = obj(v);
  const done = int(o.done, 0, 1000);
  const total = int(o.total, 0, 1000);
  return done === null && total === null ? null : { done, total };
}

/**
 * Ne retient du corps de requête que les champs attendus, retypés et bornés.
 *
 * Les bornes ne sont pas de la méfiance envers le client : ce sont les plages
 * dans lesquelles une valeur a un sens physiologique. Hors de là, la donnée
 * est fausse, et une donnée fausse envoyée à un modèle ressort en conseil
 * faux.
 */
export function sanitizeTrendStats(raw: unknown): SafeTrendStats {
  const s = obj(raw);
  const sleep = obj(s.sommeil);
  const hasSleep = s.sommeil !== null && typeof s.sommeil === "object";

  const records = Array.isArray(s.records) ? s.records : [];

  return {
    periode_jours: int(s.periode_jours, 1, 400) ?? 30,
    score_sante_moyen: num(s.score_sante_moyen, 0, 100),
    score_sante_periode_prec: num(s.score_sante_periode_prec, 0, 100),
    poids_kg: num(s.poids_kg, 20, 400),
    poids_variation_kg: num(s.poids_variation_kg, -100, 100),
    poids_objectif_kg: num(s.poids_objectif_kg, 20, 400),
    sommeil: hasSleep
      ? {
        score: num(sleep.score, 0, 100),
        heures_moy: num(sleep.heures_moy, 0, 24),
        objectif_h: num(sleep.objectif_h, 0, 24),
        ecart_coucher_min: int(sleep.ecart_coucher_min, -720, 720),
      }
      : null,
    sommeil_score_periode_prec: num(s.sommeil_score_periode_prec, 0, 100),
    fatigue_moy_1a5: num(s.fatigue_moy_1a5, 1, 5),
    stress_moy_1a5: num(s.stress_moy_1a5, 1, 5),
    seances: attendance(s.seances),
    seances_periode_prec: attendance(s.seances_periode_prec),
    records: records
      .slice(0, 5)
      .map((r: unknown) => {
        const o = obj(r);
        return {
          exercice: label(o.exercice),
          kg: num(o.kg, 0, 1000),
          gain_kg: num(o.gain_kg, -500, 500),
        };
      })
      .filter((r) => r.exercice !== ""),
  };
}

/** Client Supabase minimal, limité à ce que ce module utilise réellement. */
interface RpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Sources que l'on peut transmettre à un modèle pour cet athlète.
 *
 * Tableau vide = rien ne part. C'est le cas quand l'athlète a refusé l'IA, et
 * c'est aussi le résultat en cas d'erreur : si on ne peut pas établir qu'une
 * transmission est permise, elle ne l'est pas. Le défaut penche du côté où une
 * panne ne devient pas une fuite.
 */
export async function aiEligibleSources(
  admin: RpcClient,
  athleteId: string,
): Promise<DataSource[]> {
  const { data, error } = await admin.rpc("ai_eligible_sources", { p_athlete: athleteId });
  if (error) {
    console.error("ai_eligible_sources:", error.message);
    return [];
  }
  return Array.isArray(data) ? (data as DataSource[]) : [];
}

/**
 * Vrai si cette source précise peut être transmise pour cet athlète.
 *
 * À appeler avant d'ajouter des données de montre à un prompt. Les vues
 * `ai_provider_*` filtrent déjà la règle du fournisseur ; ce contrôle ajoute le
 * consentement de l'athlète, que les vues ne connaissent pas.
 */
export async function isSourceAiEligible(
  admin: RpcClient,
  athleteId: string,
  source: DataSource,
): Promise<boolean> {
  return (await aiEligibleSources(admin, athleteId)).includes(source);
}
