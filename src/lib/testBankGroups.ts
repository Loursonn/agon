/**
 * Banque de tests du planning coach : recherche et regroupement par dominante
 * (bilan articulaire, endurance, force…), partagés par la colonne de la vue
 * Mois et le bandeau de la vue Semaine.
 */
import { TEST_CATEGORY_LABEL, TEST_CATEGORY_ORDER, type TestCategory } from "@/features/shared/types/tests";

export interface BankTest {
  id: string;
  name: string;
  category?: string | null;
}

/** Clé d'un groupe : une dominante, HYROX, ou « autres » pour un test sans dominante connue. */
export type TestGroupKey = TestCategory | "hyrox" | "autres";

const GROUP_ORDER: TestGroupKey[] = [...TEST_CATEGORY_ORDER, "hyrox", "autres"];
const GROUP_LABEL: Record<TestGroupKey, string> = { ...TEST_CATEGORY_LABEL, hyrox: "HYROX", autres: "Autres" };

export interface TestGroup<T extends BankTest> {
  key: TestGroupKey;
  label: string;
  tests: T[];
}

/** Minuscules sans accents : « explosivite » trouve « Explosivité ». */
export function foldSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function groupKeyOf(t: BankTest): TestGroupKey {
  return t.category && t.category !== "autres" && (GROUP_ORDER as string[]).includes(t.category) ? (t.category as TestGroupKey) : "autres";
}

/**
 * Tests qui correspondent à la recherche (nom ou nom de la dominante ; chaque
 * mot doit se retrouver), regroupés par dominante dans l'ordre habituel,
 * puis HYROX, « Autres » en dernier, triés par nom dans chaque groupe. Groupes vides omis.
 */
export function groupBankTests<T extends BankTest>(tests: T[], query = ""): TestGroup<T>[] {
  const words = foldSearch(query).split(/\s+/).filter(Boolean);
  const groups = new Map<TestGroupKey, T[]>();
  for (const t of tests) {
    const key = groupKeyOf(t);
    const label = GROUP_LABEL[key];
    const hay = foldSearch(`${t.name} ${label}`);
    if (!words.every((w) => hay.includes(w))) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  return GROUP_ORDER
    .filter((k) => groups.has(k))
    .map((k) => ({
      key: k,
      label: GROUP_LABEL[k],
      tests: groups.get(k)!.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    }));
}
