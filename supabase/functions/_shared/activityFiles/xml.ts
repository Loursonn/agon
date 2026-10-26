/**
 * Scanner XML minimal, sans dépendance, en flux.
 *
 * Pourquoi ne pas utiliser `DOMParser` : il existe dans le navigateur et pas
 * dans Deno. Or ces décodeurs doivent tourner aux deux endroits — c'est tout
 * l'intérêt de les partager. Une variante par environnement reviendrait à deux
 * parseurs du même format, donc à l'écart inexplicable entre un import manuel
 * et une synchronisation automatique du *même* fichier.
 *
 * Pourquoi un flux et pas un arbre : un GPX d'ultra échantillonné à la seconde
 * contient 50 000 points. Construire l'arbre complet avant d'en extraire huit
 * nombres coûte des dizaines de mégaoctets de pics mémoire sur un téléphone,
 * alors que les agrégats se calculent point par point.
 *
 * Ce qui est volontairement ignoré :
 *  - les préfixes de namespace, réduits au nom local. Les exportateurs ne sont
 *    pas d'accord entre eux (`ns3:TPX` chez Garmin, `tpx:TPX` ailleurs) et ces
 *    préfixes n'ont aucune valeur sémantique : seul le nom local en a.
 *  - la validation : un fichier non conforme doit être *rejeté avec sa raison*,
 *    pas diagnostiqué. Les erreurs levées ici sont donc des messages lisibles,
 *    destinés à remonter à l'athlète dans la liste des fichiers refusés.
 */

/** Attributs d'une balise qui n'en a pas. Partagé, donc gelé. */
export const NO_ATTRS: Readonly<Record<string, string>> = Object.freeze({});

export interface XmlHandlers {
  /** Balise ouvrante. Une balise auto-fermante déclenche `open` puis `close`. */
  open?(name: string, attrs: Readonly<Record<string, string>>): void;
  close?(name: string): void;
  /** Texte, entités déjà décodées. Les blancs seuls ne sont pas remontés. */
  text?(value: string): void;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Décode les entités XML, y compris numériques décimales et hexadécimales. */
export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, body: string) => {
      if (body[0] === "#") {
        const hex = body[1] === "x" || body[1] === "X";
        const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        /*
          Une entité hors plage Unicode est laissée telle quelle plutôt que
          remplacée par un caractère de substitution : dans un nom d'activité,
          `&#999999;` visible se corrige, un `�` silencieux ne se remarque pas.
        */
        if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return whole;
        try {
          return String.fromCodePoint(code);
        } catch {
          return whole;
        }
      }
      return ENTITIES[body] ?? whole;
    },
  );
}

/** Nom local d'un nom qualifié : `ns3:TPX` → `TPX`. */
export function localName(qname: string): string {
  const colon = qname.indexOf(":");
  return colon < 0 ? qname : qname.slice(colon + 1);
}

const isSpace = (c: string): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\r";

/**
 * Parcourt le document et appelle les gestionnaires au passage.
 *
 * Lève sur un document tronqué ou malformé. Un téléchargement interrompu
 * produit exactement ça, et il vaut mieux refuser le fichier que livrer une
 * activité amputée de sa fin sans le dire.
 */
export function scanXml(source: string, handlers: XmlHandlers): void {
  const n = source.length;
  let i = 0;

  const emitText = (chunk: string) => {
    if (!handlers.text) return;
    // Un XML indenté est surtout composé de retours à la ligne : les remonter
    // ferait appeler le gestionnaire des dizaines de milliers de fois pour rien.
    if (chunk.trim() === "") return;
    handlers.text(decodeEntities(chunk));
  };

  while (i < n) {
    const lt = source.indexOf("<", i);
    if (lt < 0) {
      emitText(source.slice(i));
      return;
    }
    if (lt > i) emitText(source.slice(i, lt));

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      if (end < 0) throw new Error("commentaire XML non fermé");
      i = end + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      if (end < 0) throw new Error("section CDATA non fermée");
      // Pas de décodage d'entités : c'est la définition d'une section CDATA.
      const chunk = source.slice(lt + 9, end);
      if (handlers.text && chunk.trim() !== "") handlers.text(chunk);
      i = end + 3;
      continue;
    }

    if (source.startsWith("<?", lt)) {
      const end = source.indexOf("?>", lt + 2);
      if (end < 0) throw new Error("instruction de traitement XML non fermée");
      i = end + 2;
      continue;
    }

    if (source.startsWith("<!", lt)) {
      /*
        DOCTYPE. Un sous-ensemble interne (`<!DOCTYPE x [ ... ]>`) contenant un
        `>` tromperait cette recherche, mais aucun exportateur d'activité n'en
        produit, et accepter les entités personnalisées qu'il déclarerait
        ouvrirait la porte aux attaques par expansion d'entités (« billion
        laughs »). Ne pas les gérer est ici une protection, pas un manque.
      */
      const end = source.indexOf(">", lt + 2);
      if (end < 0) throw new Error("déclaration XML non fermée");
      i = end + 1;
      continue;
    }

    if (source[lt + 1] === "/") {
      const end = source.indexOf(">", lt + 2);
      if (end < 0) throw new Error("balise de fermeture non fermée");
      handlers.close?.(localName(source.slice(lt + 2, end).trim()));
      i = end + 1;
      continue;
    }

    i = scanOpenTag(source, lt, handlers);
  }
}

/** Lit une balise ouvrante et ses attributs. Rend l'index suivant le `>`. */
function scanOpenTag(source: string, lt: number, handlers: XmlHandlers): number {
  const n = source.length;
  let i = lt + 1;

  const nameStart = i;
  while (i < n && !isSpace(source[i]) && source[i] !== "/" && source[i] !== ">") i++;
  const name = localName(source.slice(nameStart, i));
  if (name === "") throw new Error("balise sans nom");

  let attrs: Record<string, string> | null = null;
  let selfClosing = false;
  let closed = false;

  while (i < n) {
    while (i < n && isSpace(source[i])) i++;
    if (i >= n) break;

    if (source[i] === ">") {
      i++;
      closed = true;
      break;
    }
    if (source[i] === "/") {
      selfClosing = true;
      i++;
      continue;
    }

    const keyStart = i;
    while (
      i < n && !isSpace(source[i]) &&
      source[i] !== "=" && source[i] !== ">" && source[i] !== "/"
    ) i++;
    const key = source.slice(keyStart, i);

    while (i < n && isSpace(source[i])) i++;
    if (source[i] !== "=") {
      // Attribut sans valeur : toléré en HTML, pas en XML. Ignoré plutôt que
      // fatal — il ne porte jamais une mesure.
      continue;
    }
    i++;
    while (i < n && isSpace(source[i])) i++;

    const quote = source[i];
    let value: string;
    if (quote === '"' || quote === "'") {
      const end = source.indexOf(quote, i + 1);
      if (end < 0) throw new Error(`valeur d'attribut non fermée (${key})`);
      value = source.slice(i + 1, end);
      i = end + 1;
    } else {
      const start = i;
      while (i < n && !isSpace(source[i]) && source[i] !== ">") i++;
      value = source.slice(start, i);
    }

    if (key !== "") {
      (attrs ??= {})[localName(key)] = decodeEntities(value);
    }
  }

  if (!closed) throw new Error(`balise <${name}> non fermée`);

  handlers.open?.(name, attrs ?? NO_ATTRS);
  if (selfClosing) handlers.close?.(name);
  return i;
}

/**
 * Texte d'un fichier XML, en respectant l'encodage qu'il déclare.
 *
 * Les montres récentes écrivent en UTF-8, mais les TCX exportés par les
 * anciens Garmin Connect sont en ISO-8859-1. Décoder ceux-là en UTF-8 ne casse
 * pas les mesures (elles sont en ASCII) : ça abîme seulement les noms
 * d'activité, ce qui est la forme de bug la moins visible et la plus durable.
 */
export function xmlTextFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return decodeWith("utf-16le", bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return decodeWith("utf-16be", bytes);
  }

  // La découpe peut tomber au milieu d'un caractère multioctet : sans
  // conséquence, la déclaration d'encodage est en ASCII et en tête de fichier.
  const head = decodeWith("utf-8", bytes.subarray(0, 256));
  const declared = /encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  if (declared && !/^utf-?8$/.test(declared)) {
    try {
      return new TextDecoder(declared).decode(bytes as unknown as ArrayBufferView);
    } catch {
      // Étiquette inconnue du moteur : on retombe sur UTF-8 plutôt que de
      // refuser le fichier pour un attribut cosmétique.
    }
  }
  return decodeWith("utf-8", bytes);
}

function decodeWith(label: string, bytes: Uint8Array): string {
  return new TextDecoder(label).decode(bytes as unknown as ArrayBufferView);
}

/** Nombre d'un contenu textuel, ou `null` si ce n'en est pas un. */
export function xmlNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Décalage horaire porté par un horodatage ISO, en secondes.
 *
 * `null` quand il n'y en a pas, et `Z` en fait partie : UTC ne dit rien du
 * fuseau de l'athlète. Renvoyer `0` reviendrait à affirmer qu'il était à
 * Greenwich, et une sortie de 23 h basculerait au lendemain sans qu'on sache
 * que l'information manquait.
 */
export function isoOffsetSeconds(iso: string): number | null {
  const match = /([+-])(\d{2}):?(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 3600 + Number(match[3]) * 60);
}

/** Instant d'un horodatage ISO, en millisecondes, ou `null` s'il est illisible. */
export function isoMillis(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso.trim());
  return Number.isFinite(parsed) ? parsed : null;
}
