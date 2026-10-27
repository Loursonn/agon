/**
 * Le scanner XML, vérifié sur ce que les exportateurs écrivent réellement.
 *
 * Les cas testés ici ne sont pas théoriques : préfixes de namespace variables,
 * CDATA, entités dans un nom d'activité, déclaration d'encodage ISO-8859-1,
 * fichier tronqué en plein milieu. Chacun existe dans au moins un export réel,
 * et chacun casse différemment.
 */
import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  isoMillis,
  isoOffsetSeconds,
  localName,
  scanXml,
  xmlNumber,
  xmlTextFromBytes,
} from "../activityFiles/xml";

/** Trace des évènements, pour pouvoir affirmer l'ordre autant que le contenu. */
function trace(source: string) {
  const events: string[] = [];
  const attrs: Array<Record<string, string>> = [];
  scanXml(source, {
    open(name, a) {
      events.push(`<${name}>`);
      attrs.push({ ...a });
    },
    close(name) {
      events.push(`</${name}>`);
    },
    text(value) {
      events.push(`"${value}"`);
    },
  });
  return { events, attrs };
}

describe("scanXml", () => {
  it("remonte ouvertures, texte et fermetures dans l'ordre", () => {
    const { events } = trace("<a><b>12</b></a>");
    expect(events).toEqual(["<a>", "<b>", '"12"', "</b>", "</a>"]);
  });

  it("n'appelle pas le gestionnaire de texte pour l'indentation", () => {
    const { events } = trace("<a>\n  <b>1</b>\n</a>\n");
    expect(events).toEqual(["<a>", "<b>", '"1"', "</b>", "</a>"]);
  });

  it("réduit les préfixes de namespace au nom local", () => {
    // Garmin écrit `ns3:TPX`, d'autres `tpx:TPX` : le préfixe n'a pas de sens
    // stable, seul le nom local en a.
    const { events } = trace("<ns3:TPX><ns3:Speed>3.2</ns3:Speed></ns3:TPX>");
    expect(events).toEqual(["<TPX>", "<Speed>", '"3.2"', "</Speed>", "</TPX>"]);
  });

  it("traite une balise auto-fermante comme une ouverture puis une fermeture", () => {
    const { events } = trace("<a><b/></a>");
    expect(events).toEqual(["<a>", "<b>", "</b>", "</a>"]);
  });

  it("lit les attributs, guillemets simples ou doubles", () => {
    const { attrs } = trace(`<trkpt lat="45.1" lon='5.7'/>`);
    expect(attrs[0]).toEqual({ lat: "45.1", lon: "5.7" });
  });

  it("accepte un attribut contenant un chevron fermant", () => {
    // Une valeur d'attribut peut contenir `>` : chercher naïvement le premier
    // `>` couperait la balise au milieu.
    const { attrs } = trace(`<a title="2 > 1" b="x"/>`);
    expect(attrs[0]).toEqual({ title: "2 > 1", b: "x" });
  });

  it("réduit aussi le préfixe des attributs", () => {
    const { attrs } = trace(`<Creator xsi:type="Device_t"/>`);
    expect(attrs[0]).toEqual({ type: "Device_t" });
  });

  it("ignore la déclaration XML, les commentaires et le DOCTYPE", () => {
    const { events } = trace(
      `<?xml version="1.0" encoding="UTF-8"?><!-- export --><!DOCTYPE a><a>1</a>`,
    );
    expect(events).toEqual(["<a>", '"1"', "</a>"]);
  });

  it("rend le contenu d'une section CDATA sans décoder d'entités", () => {
    const { events } = trace("<n><![CDATA[Sortie & co <3]]></n>");
    expect(events).toEqual(["<n>", '"Sortie & co <3"', "</n>"]);
  });

  it("décode les entités du texte", () => {
    const { events } = trace("<n>C&#244;te &amp; vent</n>");
    expect(events).toEqual(["<n>", '"Côte & vent"', "</n>"]);
  });

  it("ne remonte pas d'attributs mutables partagés", () => {
    // Deux balises sans attribut doivent recevoir le même objet gelé sans
    // qu'une écriture sur l'une se voie sur l'autre.
    const seen: Array<Readonly<Record<string, string>>> = [];
    scanXml("<a/><b/>", { open: (_n, a) => void seen.push(a) });
    expect(Object.isFrozen(seen[0])).toBe(true);
    expect(seen[0]).toEqual({});
    expect(seen[1]).toEqual({});
  });

  it("refuse un document tronqué en pleine balise", () => {
    // C'est exactement ce que produit un téléchargement interrompu.
    expect(() => trace("<a><trkpt lat=\"45.1\"")).toThrow(/non fermée/);
  });

  it("refuse un commentaire non fermé", () => {
    expect(() => trace("<a><!-- oups")).toThrow(/commentaire/);
  });

  it("refuse une valeur d'attribut non fermée", () => {
    expect(() => trace('<a b="oups')).toThrow(/attribut/);
  });

  it("tolère un texte de queue hors de toute balise", () => {
    const { events } = trace("<a>1</a>fin");
    expect(events).toEqual(["<a>", '"1"', "</a>", '"fin"']);
  });
});

describe("decodeEntities", () => {
  it("décode les cinq entités nommées de XML", () => {
    expect(decodeEntities("&amp;&lt;&gt;&quot;&apos;")).toBe("&<>\"'");
  });

  it("décode le décimal et l'hexadécimal", () => {
    expect(decodeEntities("&#233;&#xE9;")).toBe("éé");
  });

  it("laisse intacte une entité inconnue plutôt que de l'effacer", () => {
    // `&nbsp;` n'est pas défini en XML. Le laisser visible se corrige ; le
    // remplacer par un caractère de substitution passe inaperçu.
    expect(decodeEntities("a&nbsp;b")).toBe("a&nbsp;b");
  });

  it("laisse intacte une entité numérique hors plage Unicode", () => {
    expect(decodeEntities("&#99999999;")).toBe("&#99999999;");
  });
});

describe("localName", () => {
  it("retire le préfixe", () => {
    expect(localName("gpxtpx:hr")).toBe("hr");
  });

  it("laisse un nom sans préfixe tel quel", () => {
    expect(localName("trkpt")).toBe("trkpt");
  });
});

describe("xmlTextFromBytes", () => {
  const utf8 = (s: string) => new TextEncoder().encode(s);

  it("lit de l'UTF-8 par défaut", () => {
    expect(xmlTextFromBytes(utf8("<a>é</a>"))).toBe("<a>é</a>");
  });

  it("retire la marque d'ordre des octets", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("<a/>")]);
    expect(xmlTextFromBytes(bytes)).toBe("<a/>");
  });

  it("respecte un encodage ISO-8859-1 déclaré", () => {
    /*
      Les TCX des anciens Garmin Connect sont en ISO-8859-1. Décodés en UTF-8,
      les mesures restent justes (elles sont en ASCII) et seuls les noms
      d'activité sont abîmés — la forme de bug la plus durable, parce que rien
      ne la signale.
    */
    const head = utf8('<?xml version="1.0" encoding="ISO-8859-1"?><n>');
    const bytes = new Uint8Array([...head, 0xe9, ...utf8("t&eacute;</n>")]);
    expect(xmlTextFromBytes(bytes)).toContain("ét");
  });

  it("retombe sur UTF-8 si l'étiquette déclarée est inconnue", () => {
    const bytes = utf8('<?xml version="1.0" encoding="pas-un-encodage"?><a>é</a>');
    expect(xmlTextFromBytes(bytes)).toContain("é");
  });
});

describe("xmlNumber", () => {
  it("lit un décimal et une notation scientifique", () => {
    expect(xmlNumber("12.03")).toBe(12.03);
    expect(xmlNumber("1.2E2")).toBe(120);
  });

  it("tolère les blancs autour", () => {
    expect(xmlNumber("\n  7 ")).toBe(7);
  });

  it("rend null sur ce qui n'est pas un nombre", () => {
    expect(xmlNumber("")).toBeNull();
    expect(xmlNumber("Active")).toBeNull();
    expect(xmlNumber(undefined)).toBeNull();
  });
});

describe("isoOffsetSeconds", () => {
  it("lit un décalage positif et négatif", () => {
    expect(isoOffsetSeconds("2026-10-03T09:12:38+02:00")).toBe(7200);
    expect(isoOffsetSeconds("2026-10-03T03:12:38-04:00")).toBe(-14400);
  });

  it("accepte la forme compacte sans deux-points", () => {
    expect(isoOffsetSeconds("2026-10-03T09:12:38+0530")).toBe(19800);
  });

  it("rend null sur un horodatage UTC", () => {
    /*
      `Z` dit que l'instant est en UTC, pas que l'athlète était à Greenwich.
      Renvoyer 0 ferait basculer une sortie de 23 h au lendemain sans qu'on
      sache que l'information manquait.
    */
    expect(isoOffsetSeconds("2026-10-03T07:12:38Z")).toBeNull();
  });
});

describe("isoMillis", () => {
  it("lit un horodatage ISO", () => {
    expect(isoMillis("2026-10-03T07:12:38Z")).toBe(Date.parse("2026-10-03T07:12:38Z"));
  });

  it("rend null sur une date illisible ou absente", () => {
    expect(isoMillis("hier")).toBeNull();
    expect(isoMillis(null)).toBeNull();
  });
});
