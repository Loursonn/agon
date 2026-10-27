/**
 * Point d'entrée de l'import de fichiers : un fichier, ou une archive entière.
 *
 * L'aiguillage se fait sur le *contenu* et non sur l'extension. Un athlète
 * renomme, un système d'exploitation ajoute « (1) », un exportateur écrit
 * `.gpx` dans un fichier qui est un TCX : décider sur l'extension donne alors
 * une erreur de décodage incompréhensible, là où une signature donne une
 * réponse juste ou un refus clair.
 */
import { gunzip, listZipEntries, readZipEntry, type ByteSource } from "./archive.ts";
import { looksLikeFit, parseFit } from "./fit.ts";
import { looksLikeGpx, parseGpx } from "./gpx.ts";
import { looksLikeTcx, parseTcx } from "./tcx.ts";
import type { ParsedActivity, ParseResult } from "./types.ts";

export type { ParsedActivity, ParseResult };
export { bytesSource, blobSource } from "./archive.ts";

/** Vrai si ce nom vaut la peine d'être ouvert. Sur le nom, donc indicatif. */
export function looksLikeActivityName(name: string): boolean {
  return /\.(fit|tcx|gpx)(\.gz)?$/i.test(name);
}

/**
 * Décode un fichier d'activité, quel que soit son format.
 *
 * `.gz` est déplié d'abord : Strava compresse ainsi les FIT et les TCX de ses
 * exports, mais pas les GPX, et la règle n'est écrite nulle part.
 */
export async function parseActivityFile(name: string, bytes: Uint8Array): Promise<ParseResult> {
  let content = bytes;
  let label = name;

  if (/\.gz$/i.test(name) || isGzip(bytes)) {
    try {
      content = await gunzip(bytes, name);
      label = name.replace(/\.gz$/i, "");
    } catch (e) {
      return {
        activities: [],
        rejected: [{ name, reason: e instanceof Error ? e.message : String(e) }],
      };
    }
  }

  if (looksLikeFit(content)) return parseFit(content, label);
  if (looksLikeTcx(content)) return parseTcx(content, label);
  if (looksLikeGpx(content)) return parseGpx(content, label);

  return {
    activities: [],
    rejected: [{
      name: label,
      reason: "format non reconnu — attendu un FIT, un TCX ou un GPX",
    }],
  };
}

/** En-tête gzip, pour reconnaître un fichier compressé dont le nom ne le dit pas. */
function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export interface ArchiveProgress {
  /** Fichiers d'activité traités jusqu'ici. */
  done: number;
  /** Fichiers d'activité repérés dans l'archive. */
  total: number;
  /** Celui qui vient d'être lu, pour l'afficher pendant l'attente. */
  current: string;
}

export interface ArchiveResult extends ParseResult {
  /** Fichiers d'activité ouverts. */
  files: number;
  /**
   * Membres ignorés sans examen (profil, flux, médias, dossiers).
   *
   * Comptés mais pas rejetés : un export Strava contient une vingtaine de
   * fichiers de métadonnées, et les lister comme « refusés » noierait les
   * vrais refus — ceux dont l'athlète doit s'inquiéter.
   */
  ignored: number;
}

/**
 * Décode une archive d'export.
 *
 * Les fichiers sont lus un par un et le résultat est accumulé : l'archive d'un
 * athlète assidu contient plusieurs centaines d'activités, et il n'y a aucune
 * raison de tout tenir décompressé en mémoire en même temps.
 */
export async function parseActivityArchive(
  source: ByteSource,
  options: { onProgress?: (p: ArchiveProgress) => void } = {},
): Promise<ArchiveResult> {
  let entries;
  try {
    entries = await listZipEntries(source);
  } catch (e) {
    return {
      activities: [],
      rejected: [{ name: "archive", reason: e instanceof Error ? e.message : String(e) }],
      files: 0,
      ignored: 0,
    };
  }

  const candidates = entries.filter((entry) => {
    if (entry.name.endsWith("/")) return false;
    const base = entry.name.split("/").pop() ?? entry.name;
    // Les dossiers `__MACOSX` et les fichiers `._x` sont des métadonnées
    // ajoutées par macOS à la compression, jamais du contenu.
    if (base.startsWith("._") || entry.name.startsWith("__MACOSX/")) return false;
    return looksLikeActivityName(base);
  });

  const activities: ParsedActivity[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  let done = 0;

  for (const entry of candidates) {
    const label = entry.name.split("/").pop() ?? entry.name;
    try {
      const bytes = await readZipEntry(source, entry);
      const result = await parseActivityFile(label, bytes);
      activities.push(...result.activities);
      rejected.push(...result.rejected);
    } catch (e) {
      /*
        Un membre illisible ne doit pas arrêter l'archive : sur quatre cents
        sorties, une seule abîmée annulerait tout l'import, et l'athlète n'aurait
        aucun moyen de savoir laquelle retirer.
      */
      rejected.push({ name: label, reason: e instanceof Error ? e.message : String(e) });
    }
    done++;
    options.onProgress?.({ done, total: candidates.length, current: label });
  }

  return {
    activities,
    rejected,
    files: candidates.length,
    ignored: entries.length - candidates.length,
  };
}
