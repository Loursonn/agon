import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QK } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import {
  activityRow,
  splitNewActivities,
  type KnownStart,
} from "@/lib/activityImport";
import type { ParsedActivity } from "@shared/activityFiles/index.ts";

/**
 * Import de fichiers d'activité déposés par l'athlète.
 *
 * Tout se passe dans le navigateur : les octets ne quittent pas l'appareil,
 * seules les valeurs décodées partent en base. Ce n'est pas une optimisation
 * mais la seule façon honnête de le faire — une archive d'export Strava pèse
 * couramment plusieurs centaines de mégaoctets, et la téléverser pour en
 * extraire huit nombres par sortie coûterait à l'athlète son forfait mobile
 * pour un résultat identique. Accessoirement, aucune limite de taille de
 * requête ni de durée d'Edge Function ne s'applique.
 *
 * Les décodeurs sont ceux de la synchronisation automatique (`@shared`), pas
 * une seconde implémentation : deux parseurs du même format divergent
 * toujours, et c'est alors l'écart entre un import manuel et une synchro du
 * *même* fichier qui devient impossible à expliquer.
 */

/**
 * Décodeurs chargés à la demande.
 *
 * Les quatre formats réunis pèsent plus que l'écran de séance, et l'immense
 * majorité des ouvertures de l'application n'importe aucun fichier : les
 * inclure dans le paquet de l'athlète ferait payer à chaque démarrage, sur
 * réseau mobile, un code utilisé une fois. L'import, lui, est déjà un geste
 * long — quelques centaines de millisecondes de chargement y sont invisibles.
 */
const decoders = () => import("@shared/activityFiles/index.ts");

/** Signature d'un zip (`PK\x03\x04`), pour reconnaître une archive. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Lignes envoyées par requête. Borne la taille du corps, pas le débit. */
const INSERT_CHUNK = 50;

export interface ImportProgress {
  /** Ce qui est en cours, pour que l'attente dise quelque chose. */
  phase: "lecture" | "insertion";
  /** Fichier (ou membre d'archive) en cours. */
  current: string;
  done: number;
  total: number;
}

export interface ImportReport {
  /** Activités réellement ajoutées. */
  imported: number;
  /** Fichiers déjà importés auparavant, reconnus à l'empreinte. */
  duplicates: number;
  /**
   * Sorties déjà présentes sous un autre format ou via une autre source.
   * Comptées à part : « déjà importé » et « déjà là, mais venu de la montre »
   * n'appellent pas la même conclusion.
   */
  alreadyKnown: number;
  /** Fichiers d'activité examinés. */
  files: number;
  /** Membres d'archive ignorés sans examen (profil, flux, médias). */
  ignored: number;
  rejected: Array<{ name: string; reason: string }>;
}

const emptyReport = (): ImportReport => ({
  imported: 0,
  duplicates: 0,
  alreadyKnown: 0,
  files: 0,
  ignored: 0,
  rejected: [],
});

async function startsWithZipMagic(file: File): Promise<boolean> {
  if (file.size < 4) return false;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return ZIP_MAGIC.every((b, i) => head[i] === b);
}

/**
 * Activités déjà en base sur la plage de jours couverte par le dépôt.
 *
 * Paginé explicitement : PostgREST plafonne une réponse à mille lignes, et un
 * athlète qui importe cinq ans d'historique en dépasse. Sans pagination, les
 * lignes au-delà du millième seraient simplement absentes du jeu de
 * comparaison — donc réimportées en double, et le bogue n'apparaîtrait que
 * chez les utilisateurs les plus assidus.
 */
async function loadKnown(
  athleteId: string,
  fromDate: string,
  toDate: string,
): Promise<{ ids: Set<string>; starts: KnownStart[] }> {
  const ids = new Set<string>();
  const starts: KnownStart[] = [];
  const PAGE = 1000;

  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("provider_activities")
      .select("external_id, started_at, sport")
      .eq("athlete_id", athleteId)
      .gte("local_date", fromDate)
      .lte("local_date", toDate)
      // Ordre stable, sans quoi deux pages peuvent se recouvrir ou se sauter.
      .order("started_at", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (error) throw new Error(`lecture de l'historique : ${error.message}`);
    const rows = (data ?? []) as Array<{
      external_id: string;
      started_at: string;
      sport: string | null;
    }>;

    for (const r of rows) {
      ids.add(r.external_id);
      starts.push({ ms: Date.parse(r.started_at), sport: r.sport });
    }
    if (rows.length < PAGE) break;
  }

  return { ids, starts };
}

/**
 * Décode puis insère les fichiers déposés.
 *
 * L'avancement est exposé par un état du hook plutôt que par le résultat de la
 * mutation : il faut l'afficher *pendant*, et une archive de quatre cents
 * sorties prend assez longtemps pour qu'une interface muette passe pour figée.
 */
export function useActivityFileImport() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const reset = useCallback(() => setProgress(null), []);

  const mutation = useMutation<ImportReport, Error, File[]>({
    mutationFn: async (files) => {
      if (!user) throw new Error("Session expirée : reconnecte-toi.");
      if (files.length === 0) throw new Error("Aucun fichier à importer.");

      const report = emptyReport();
      const parsed: ParsedActivity[] = [];

      const { blobSource, looksLikeActivityName, parseActivityArchive, parseActivityFile } =
        await decoders();

      // ── Décodage ──
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ phase: "lecture", current: file.name, done: i, total: files.length });

        try {
          if (await startsWithZipMagic(file)) {
            /*
              `blobSource` lit par tranches : seule la plage demandée est
              chargée. C'est ce qui permet de traiter une archive plus grosse
              que la mémoire disponible — sur un téléphone, ce n'est pas un cas
              théorique.
            */
            const res = await parseActivityArchive(blobSource(file), {
              onProgress: (p) =>
                setProgress({
                  phase: "lecture",
                  current: p.current,
                  done: p.done,
                  total: p.total,
                }),
            });
            parsed.push(...res.activities);
            report.rejected.push(...res.rejected);
            report.files += res.files;
            report.ignored += res.ignored;
          } else {
            /*
              Un nom qui n'annonce rien d'exploitable est écarté avant d'être
              lu : sans ce filtre, glisser un dossier ferait décoder les photos
              et les PDF qu'il contient pour conclure « format non reconnu » —
              un refus juste, mais noyé dans trente autres.
            */
            if (!looksLikeActivityName(file.name)) {
              report.ignored++;
              continue;
            }
            const bytes = new Uint8Array(await file.arrayBuffer());
            const res = await parseActivityFile(file.name, bytes);
            parsed.push(...res.activities);
            report.rejected.push(...res.rejected);
            report.files++;
          }
        } catch (e) {
          // Un fichier illisible ne doit pas annuler le dépôt : sur quatre
          // cents sorties, une seule abîmée ferait tout perdre sans que
          // l'athlète sache laquelle retirer.
          report.rejected.push({
            name: file.name,
            reason: e instanceof Error ? e.message : String(e),
          });
          report.files++;
        }
      }

      if (parsed.length === 0) return report;

      // ── Déduplication, puis insertion ──
      const dates = parsed.map((a) => a.localDate).sort();
      const { ids, starts } = await loadKnown(user.id, dates[0], dates[dates.length - 1]);

      const split = splitNewActivities(parsed, ids, starts);
      const toInsert = split.toInsert;
      report.duplicates += split.duplicates;
      report.alreadyKnown += split.alreadyKnown;

      for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
        const chunk = toInsert.slice(i, i + INSERT_CHUNK);
        setProgress({
          phase: "insertion",
          current: chunk[0].localDate,
          done: i,
          total: toInsert.length,
        });

        /*
          `ignoreDuplicates` plutôt qu'une insertion sèche : deux onglets, ou un
          dépôt relancé après une coupure réseau, produiraient une violation
          d'unicité qui ferait échouer tout le lot alors que le résultat voulu
          est déjà atteint. Les lignes renvoyées sont celles réellement
          insérées, ce qui donne le compte des doublons sans requête de plus.
        */
        const { data, error } = await supabase
          .from("provider_activities")
          .upsert(chunk.map((a) => activityRow(user.id, a)), {
            onConflict: "athlete_id,source,external_id",
            ignoreDuplicates: true,
          })
          .select("id");

        if (error) throw new Error(`insertion : ${error.message}`);

        const inserted = (data ?? []).length;
        report.imported += inserted;
        report.duplicates += chunk.length - inserted;
      }

      return report;
    },
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: QK.providerActivities(user?.id ?? "none") });
    },
  });

  return { ...mutation, progress, resetProgress: reset };
}
