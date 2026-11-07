/**
 * Fusion « saisie locale faite pendant que la clé n'était pas chargée » +
 * « valeur enfin relue en base ».
 *
 * Contexte : quand la lecture d'une clé app_data échoue, l'état local part de
 * la valeur par défaut (`fallback`) et l'athlète peut quand même saisir (ex.
 * wellness du jour). L'écriture est bloquée (sinon elle écraserait l'historique).
 * À la relecture réussie, on réapplique la saisie locale PAR-DESSUS la valeur
 * serveur, au lieu de la remplacer :
 *  - objets : fusion clé par clé (récursive) ; une clé locale encore égale au
 *    défaut est considérée « non touchée » et laisse la valeur serveur ;
 *  - tableaux : union (éléments à `id` fusionnés par id, la version locale
 *    gagne ; les autres ajoutés s'ils n'existent pas déjà) ;
 *  - scalaires : la valeur locale gagne si elle diffère du défaut.
 *
 * Les suppressions faites pendant la panne ne sont pas rejouées (un élément
 * peut réapparaître) : on préfère un doublon à une perte.
 */

type Json = unknown;

const isPlainObject = (v: Json): v is Record<string, Json> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

function deepEqual(a: Json, b: Json): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function idOf(v: Json): string | null {
  if (!isPlainObject(v)) return null;
  const id = v.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function mergeArrays(server: Json[], local: Json[]): Json[] {
  const out = [...server];
  for (const item of local) {
    const id = idOf(item);
    if (id !== null) {
      const idx = out.findIndex((s) => idOf(s) === id);
      if (idx >= 0) out[idx] = item;
      else out.push(item);
    } else if (!out.some((s) => deepEqual(s, item))) {
      out.push(item);
    }
  }
  return out;
}

export function mergeLocalIntoServer<T>(server: T, local: T, fallback: T): T {
  // Rien de touché localement → la base fait foi.
  if (deepEqual(local, fallback)) return server;
  if (server === null || server === undefined) return local;

  if (Array.isArray(server) && Array.isArray(local)) {
    return mergeArrays(server, local) as T;
  }
  if (isPlainObject(server) && isPlainObject(local)) {
    const fb = isPlainObject(fallback) ? fallback : {};
    const out: Record<string, Json> = { ...server };
    for (const [k, lv] of Object.entries(local)) {
      if (!(k in server)) {
        // Champ absent en base : on garde la saisie locale sauf si c'est le défaut.
        if (!(k in fb) || !deepEqual(lv, fb[k])) out[k] = lv;
        continue;
      }
      out[k] = mergeLocalIntoServer(server[k], lv, fb[k]);
    }
    return out as T;
  }
  return local;
}
