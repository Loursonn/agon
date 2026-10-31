/**
 * Clés API `agon_…` des coachs, pour leur assistant IA.
 *
 * Générées dans le navigateur, montrées une seule fois, et seul leur hash
 * SHA-256 part en base : Agon ne peut pas redonner une clé perdue, seulement
 * en émettre une nouvelle. L'Edge Function `coach-api` recalcule le hash de la
 * clé reçue et le cherche dans `coach_api_keys`.
 */

export const API_KEY_PREFIX = "agon_";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 40;

/**
 * 40 caractères base62, soit environ 238 bits d'entropie.
 *
 * Tirage par rejet : un octet ≥ 248 est écarté, sinon `octet % 62` favoriserait
 * les premiers caractères de l'alphabet.
 */
export function generateApiKey(): string {
  let out = "";
  while (out.length < LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(64));
    for (const b of bytes) {
      if (b >= 248) continue;
      out += ALPHABET[b % 62];
      if (out.length === LENGTH) break;
    }
  }
  return API_KEY_PREFIX + out;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Début affichable de la clé, pour la reconnaître dans la liste. */
export function keyPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 8);
}
