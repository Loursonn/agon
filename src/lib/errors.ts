/**
 * Extraction du message d'une erreur attrapée.
 *
 * TypeScript type `catch (e)` en `unknown` : on ne peut pas lire `e.message`
 * sans vérifier. Le réflexe facile est `catch (e: any)`, qui rend un `undefined`
 * silencieux affiché tel quel à l'athlète dès que ce qui est jeté n'est pas une
 * `Error` (une string, un objet Supabase, une promesse rejetée sans raison).
 *
 * Ici on couvre les trois formes réellement rencontrées — `Error`, string nue,
 * objet portant un champ `message` (c'est le cas des erreurs PostgREST) — et on
 * retombe sur un libellé lisible plutôt que sur « undefined ».
 */
export function errorMessage(err: unknown, fallback = "Erreur inconnue"): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err.trim() || fallback;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}
