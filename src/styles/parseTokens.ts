/**
 * Lecture de src/styles/tokens.css, partagée par src/lib/theme.ts (navigateur),
 * tailwind.config.ts (Node) et les tests. Pur, sans dépendance.
 */

export type TokenMap = Readonly<Record<string, string>>;

/** Déclarations `--nom: valeur;` du bloc `:root` (commentaires ignorés ; la dernière l'emporte, comme en CSS). */
export function parseTokens(css: string): TokenMap {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const root = /:root\s*\{([^}]*)\}/.exec(code);
  if (!root) throw new Error("tokens.css : bloc :root introuvable");
  const out: Record<string, string> = {};
  for (const m of root[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** Valeur finale d'un token, `var(--x)` remplacés récursivement. Lève si le token manque. */
export function resolveToken(tokens: TokenMap, name: string, seen: readonly string[] = []): string {
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`Token ${name} absent de src/styles/tokens.css`);
  if (seen.includes(name)) throw new Error(`Token ${name} : référence circulaire`);
  return raw.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, ref: string) => resolveToken(tokens, ref, [...seen, name]));
}

/** Noms (sans le préfixe `--agon-<préfixe>-`) des tokens d'une famille, ex. `scale(t, "text")` → ["xs", "sm", …]. */
export function scale(tokens: TokenMap, prefix: string): string[] {
  const p = `--agon-${prefix}-`;
  return Object.keys(tokens).filter((k) => k.startsWith(p)).map((k) => k.slice(p.length));
}

/** Tokens de couleur exposés à Tailwind (`bg-agon-<nom>`) : tout sauf typo, formes, espacements et alias shadcn. */
export function colorTokenNames(tokens: TokenMap): string[] {
  return Object.keys(tokens)
    .filter((k) => k.startsWith("--agon-"))
    .filter((k) => !/^--agon-(ui|font|text|radius|space)-/.test(k) && k !== "--agon-radius" && k !== "--agon-or-poli")
    .map((k) => k.slice("--agon-".length));
}
