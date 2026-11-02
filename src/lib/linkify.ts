/**
 * Découpe un texte en morceaux texte / lien, pour rendre cliquables les URL
 * qu'un coach (ou son assistant) écrit dans une consigne. Seuls http(s) et
 * `www.` deviennent des liens : jamais `javascript:` ou autre schéma.
 */
export type LinkPart = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
/** Ponctuation finale qui appartient à la phrase, pas à l'URL. */
const TRAILING = /[.,;:!?'»)\]]+$/;

export function linkify(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let url = m[0];
    // Garde une parenthèse fermante si l'URL en ouvre une (liens Wikipédia…).
    const trail = url.match(TRAILING)?.[0] ?? "";
    let cut = trail.length;
    if (trail.startsWith(")") && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) cut = 0;
    if (cut) url = url.slice(0, -cut);
    if (!url) continue;
    if (start > last) parts.push({ type: "text", text: text.slice(last, start) });
    parts.push({ type: "link", text: url, href: /^www\./i.test(url) ? "https://" + url : url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}
