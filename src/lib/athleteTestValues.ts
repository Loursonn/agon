import type { AthleteTestResult, BetterWhen, TestCategory, ValueType } from "@/features/shared/types/tests";
import { TEST_CATEGORY_COLOR, TEST_CATEGORY_LABEL, TEST_CATEGORY_ORDER } from "@/features/shared/types/tests";

/** Groupe d'affichage des valeurs de l'athlète (maquette « Tests athlète »). */
export type TestGroup = TestCategory | "hyrox" | "autres";

export const TEST_GROUP_ORDER: TestGroup[] = ["force", "endurance", "explosivite", "vitesse", "hyrox", "bilan_articulaire", "autres"];
export const TEST_GROUP_LABEL: Record<TestGroup, string> = { ...TEST_CATEGORY_LABEL, hyrox: "HYROX", autres: "Autres" };
export const TEST_GROUP_COLOR: Record<TestGroup, string> = { ...TEST_CATEGORY_COLOR, hyrox: "#FFC933", autres: "#B9AE9C" };

export interface TestPoint {
  resultId: string;
  date: string;
  value: number;
  testName: string;
  notes: string | null;
  /** Ressenti de l'athlète (1 = très dur … 5 = facile). */
  feeling?: number | null;
  /** Mot de l'athlète sur ce test. */
  comment?: string | null;
  /** Saisie du résultat (ISO), pour « Nouveau ». */
  createdAt?: string | null;
}

export interface TestValueCard {
  variableId: string;
  /** Titre affiché : nom du test s'il ne mesure qu'une valeur, sinon « Test · valeur ». */
  title: string;
  label: string;
  testName: string;
  unit: string;
  valueType: ValueType;
  betterWhen: BetterWhen;
  group: TestGroup;
  latest: TestPoint;
  /** Écart avec le test précédent (null s'il n'y en a qu'un). */
  delta: number | null;
  /** Le dernier test est meilleur (true), moins bon (false), égal ou seul (null). */
  improved: boolean | null;
  best: TestPoint;
  /** Tous les tests, du plus ancien au plus récent. */
  history: TestPoint[];
}

const nf = (v: number, max = 2) => v.toLocaleString("fr-FR", { maximumFractionDigits: max });

function mmss(secs: number): string {
  const s = Math.round(Math.abs(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Valeur lisible : durées et allures en « m:ss », nombres à la française. */
export function formatTestValue(v: number | null | undefined, type: ValueType): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (type === "pace" || type === "duration") return mmss(v);
  return nf(v);
}

/** Unité affichée : « min:s » pour une durée, « min/km » pour une allure sans unité. */
export function displayUnit(unit: string, type: ValueType): string {
  if (type === "duration") return unit && unit !== "s" && unit !== "sec" ? unit : "min:s";
  if (type === "pace") return unit || "min/km";
  return unit;
}

/** Écart signé : « +5 », « −0,4 », « −18 s » (durées / allures en secondes, ou m:ss au-delà d'une minute). */
export function formatTestDelta(delta: number | null, type: ValueType): string {
  if (delta == null || !Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  if (type === "pace" || type === "duration") {
    const a = Math.round(Math.abs(delta));
    return sign + (a >= 60 ? mmss(a) : `${a} s`);
  }
  return sign + nf(Math.abs(delta));
}

export function isBetter(a: number, b: number, when: BetterWhen): boolean {
  return when === "lower" ? a < b : a > b;
}

function cardTitle(testName: string | undefined, label: string, nbVars: number): string {
  if (!testName || testName === label) return label;
  return nbVars <= 1 ? testName : `${testName} · ${label}`;
}

export function testGroupOf(def: AthleteTestResult["test_definitions"]): TestGroup {
  if (def?.battery === "hyrox_v3" || def?.battery === "hyrox_legacy") return "hyrox";
  const c = def?.category;
  return c && (TEST_CATEGORY_ORDER as string[]).includes(c) ? c : "autres";
}

/** Une carte par variable mesurée : dernière valeur, écart, record et historique. */
export function buildTestValueCards(results: AthleteTestResult[]): TestValueCard[] {
  const byVar = new Map<string, { meta: Omit<TestValueCard, "latest" | "delta" | "improved" | "best" | "history">; pts: TestPoint[] }>();
  for (const r of results) {
    for (const v of r.athlete_test_values ?? []) {
      const tv = v.test_variables;
      const value = Number(v.value);
      if (!tv || !Number.isFinite(value)) continue;
      let entry = byVar.get(v.variable_id);
      if (!entry) {
        entry = {
          meta: {
            variableId: v.variable_id,
            title: cardTitle(r.test_definitions?.name, tv.label, r.test_definitions?.test_variables?.length ?? 1),
            label: tv.label,
            testName: r.test_definitions?.name ?? tv.label,
            unit: tv.unit ?? "",
            valueType: tv.value_type,
            betterWhen: tv.better_when,
            group: testGroupOf(r.test_definitions),
          },
          pts: [],
        };
        byVar.set(v.variable_id, entry);
      }
      entry.pts.push({
        resultId: r.id, date: r.performed_at.slice(0, 10), value, testName: r.test_definitions?.name ?? "", notes: r.notes,
        feeling: r.feeling ?? null, comment: r.comment ?? null, createdAt: r.created_at ?? null,
      });
    }
  }
  const cards: TestValueCard[] = [];
  for (const { meta, pts } of byVar.values()) {
    const history = [...pts].sort((a, b) => a.date.localeCompare(b.date));
    const latest = history[history.length - 1];
    const prev = history.length > 1 ? history[history.length - 2] : null;
    const delta = prev ? latest.value - prev.value : null;
    const improved = prev && latest.value !== prev.value ? isBetter(latest.value, prev.value, meta.betterWhen) : null;
    const best = history.reduce((b, p) => (isBetter(p.value, b.value, meta.betterWhen) ? p : b), history[0]);
    cards.push({ ...meta, latest, delta, improved, best, history });
  }
  return cards;
}

/** Cartes rangées par dominante, dans l'ordre de la maquette ; groupes vides omis. */
export function groupTestCards(cards: TestValueCard[]): Array<{ group: TestGroup; cards: TestValueCard[] }> {
  return TEST_GROUP_ORDER
    .map((group) => ({ group, cards: cards.filter((c) => c.group === group).sort((a, b) => b.latest.date.localeCompare(a.latest.date)) }))
    .filter((g) => g.cards.length > 0);
}

/** Allure (secondes par km) pour un pourcentage de VMA (km/h). */
export function paceAtVma(vmaKmh: number, pct: number): number | null {
  if (!(vmaKmh > 0) || !(pct > 0)) return null;
  return 3600 / (vmaKmh * pct);
}

/** Allure en « 3'52 ». */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return "—";
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, "0")}`;
}
/** « 21 oct. 2026 » à partir de « YYYY-MM-DD ». */
export function fmtTestDate(date: string, withYear = true): string {
  const d = new Date(date.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" });
}
