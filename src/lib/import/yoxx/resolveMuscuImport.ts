/**
 * Résolution d'une séance muscu parsée : lien vers la bibliothèque d'exercices
 * et vers les méthodes de la banque. Fonction pure (les exercices à créer sont
 * créés avant par l'appelant, qui fournit leurs ids).
 */
import type { Exercice, ExerciceParams, ProgSession } from "@/features/coach/components/programmation/types";
import type { MethodConfig, MethodScope } from "@/types/trainingMethods";
import type { ImportIssue } from "./common";
import { nameKey, similarity } from "./matchExercise";
import type { MuscuImportResult } from "./parseMuscuSession";

export interface MethodRef {
  id: string;
  name: string;
  scope: MethodScope;
  config: MethodConfig;
}

export interface ResolveInput {
  /** Exercice retenu pour chaque Exercice.id (lié ou créé). Absent = laissé sans lien. */
  exercises: Record<string, { id: string; name: string }>;
  methods: MethodRef[];
  /** Conversion config de méthode → paramètres (methodConfigToExerciceParams de l'app) */
  methodToParams: (config: MethodConfig, scope: MethodScope) => ExerciceParams;
}

export function findMethod(name: string, methods: MethodRef[]): { method: MethodRef; exact: boolean } | null {
  const key = nameKey(name);
  const exact = methods.find((m) => nameKey(m.name) === key);
  if (exact) return { method: exact, exact: true };
  const best = methods
    .map((m) => ({ m, s: similarity(name, m.name) }))
    .sort((a, b) => b.s - a.s)[0];
  return best && best.s >= 0.85 ? { method: best.m, exact: false } : null;
}

export function resolveMuscuImport(parsed: MuscuImportResult, input: ResolveInput): { session: ProgSession; issues: ImportIssue[] } {
  const session: ProgSession = structuredClone(parsed.session);
  const issues: ImportIssue[] = [...parsed.issues];
  const byId = new Map<string, Exercice>();
  for (const b of session.blocs) for (const e of b.exercices) byId.set(e.id, e);

  for (const ref of parsed.refs) {
    const exo = byId.get(ref.exoId);
    if (!exo) continue;

    // Exercice de la bibliothèque
    const lib = input.exercises[ref.exoId];
    if (lib) {
      exo.exercise_id = lib.id;
      if (nameKey(lib.name) !== nameKey(exo.exercise_name)) {
        issues.push({ line: ref.line, raw: ref.raw, level: "info", stepId: exo.id, message: `« ${exo.exercise_name} » lié à l'exercice « ${lib.name} » de ta bibliothèque.` });
      }
      exo.exercise_name = lib.name;
    }

    // Méthode
    if (!ref.methodName) continue;
    const found = findMethod(ref.methodName, input.methods);
    if (!found) {
      exo.comment = [`⚠ Méthode non importée : ${ref.methodName}`, exo.comment].filter(Boolean).join(" · ");
      issues.push({
        line: ref.line, raw: ref.raw, level: "error", stepId: exo.id,
        message: `Méthode « ${ref.methodName} » introuvable dans ta banque → « méthode non importée », à choisir à la main. Écris le nom exact entre guillemets (méthode "Rest-Pause").`,
      });
      if (ref.paramsFromMethod) {
        exo.mode = "libre";
        exo.libre_text = `⚠ À SAISIR : méthode ${ref.methodName}`;
      }
      continue;
    }
    const { method } = found;
    if (!found.exact) {
      issues.push({ line: ref.line, raw: ref.raw, level: "warning", stepId: exo.id, message: `Méthode « ${ref.methodName} » → « ${method.name} » (nom le plus proche dans ta banque).` });
    }

    exo.mode = "methode";
    exo.methode_id = method.id;
    const fromMethod = input.methodToParams(method.config, method.scope);
    exo.params = mapParams(exo.params, (p) => {
      if (ref.paramsFromMethod) return { ...fromMethod, reps_mode: p.reps_mode, nb_series: method.scope === "set" ? p.nb_series : fromMethod.nb_series };
      // Méthode « set » : le découpage en sous-séries vient de la méthode si le texte ne le précise pas
      if (method.scope === "set" && !p.cluster && fromMethod.cluster) return { ...p, cluster: fromMethod.cluster };
      return p;
    });
    if (method.scope === "set") {
      const nb = firstParams(exo.params).nb_series;
      const sets = ref.methodSets?.filter((n) => n >= 1 && n <= nb);
      exo.applied_to_sets = sets && sets.length ? sets : Array.from({ length: nb }, (_, k) => k + 1);
      if (ref.methodSets && sets && sets.length !== ref.methodSets.length) {
        issues.push({ line: ref.line, raw: ref.raw, level: "warning", stepId: exo.id, message: `Séries ${ref.methodSets.join(", ")} : seules les séries 1 à ${nb} existent.` });
      }
    } else if (ref.methodSets) {
      issues.push({ line: ref.line, raw: ref.raw, level: "warning", stepId: exo.id, message: `« ${method.name} » s'applique à tout l'exercice : « séries ${ref.methodSets.join(", ")} » ignoré.` });
    }
  }

  issues.sort((a, b) => a.line - b.line);
  return { session, issues };
}

function isWeekRecord(p: Exercice["params"]): p is Record<string, ExerciceParams> {
  return !!p && typeof p === "object" && !("nb_series" in p);
}

function mapParams(p: Exercice["params"], fn: (x: ExerciceParams) => ExerciceParams): Exercice["params"] {
  if (!isWeekRecord(p)) return fn(p);
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, fn(v)]));
}

function firstParams(p: Exercice["params"]): ExerciceParams {
  return isWeekRecord(p) ? (p["1"] ?? Object.values(p)[0]) : p;
}
