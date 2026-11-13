import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateProviders, mergeActivities, saveActivityDetail } from "@/api/providers";
import { useAuth } from "@/hooks/useAuth";
import {
  countResult,
  emptyReport,
  mergePayload,
  parseMergeResult,
  wantsDetail,
  type ImportReport,
  type ImportTag,
} from "@/lib/activityImport";
import type { ImportActivity, NormalizedActivity } from "@shared/activityFiles/index.ts";

export type { ImportReport };

/**
 * Import de fichiers d'activité : archive d'export Strava (fichiers +
 * `activities.csv`), FIT, TCX, GPX.
 *
 * Tout est lu dans le navigateur : les octets ne quittent pas l'appareil,
 * seules les valeurs décodées partent en base. Une archive pèse couramment
 * plusieurs centaines de mégaoctets : la téléverser coûterait à l'athlète son
 * forfait mobile pour un résultat identique.
 *
 * Fusion, pas écartement (P42) : chaque sortie est envoyée à
 * `merge_provider_activities`, qui la crée ou complète celle qui existe déjà
 * (Garmin, autre fichier). La série seconde par seconde n'est envoyée que si
 * elle est meilleure que celle déjà rangée.
 *
 * Reprise : l'archive est traitée par paquets de 25. Si l'onglet se ferme,
 * redéposer la même archive reprend là où on en était — ce qui est déjà
 * fusionné revient « déjà complète », sans rien réécrire.
 */

const decoders = () => import("@shared/activityFiles/index.ts");
const archives = () => import("@shared/activityFiles/stravaArchive.ts");

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** Sorties par requête : borne la taille du corps et la mémoire des séries en attente. */
const BATCH = 25;

export interface ImportProgress {
  phase: "lecture" | "enregistrement";
  current: string;
  done: number;
  total: number;
}

async function startsWithZipMagic(file: File): Promise<boolean> {
  if (file.size < 4) return false;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return ZIP_MAGIC.every((b, i) => head[i] === b);
}

/** Décalage horaire de l'appareil à une date (sorties sans fichier : le CSV ne le donne pas). */
const deviceOffsetAt = (ms: number) => -new Date(ms).getTimezoneOffset() * 60;

interface Pending {
  name: string;
  activity: ImportActivity;
  detail: NormalizedActivity | null;
}

/**
 * Dépôt de fichiers. `athleteId` : l'athlète pour qui on importe (le coach,
 * depuis la fiche de son athlète) ; par défaut l'utilisateur connecté.
 */
export function useActivityFileImport(athleteId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const target = athleteId ?? user?.id;
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  const reset = useCallback(() => setProgress(null), []);

  const mutation = useMutation<ImportReport, Error, File[]>({
    mutationFn: async (files) => {
      if (!user || !target) throw new Error("Session expirée : reconnecte-toi.");
      if (files.length === 0) throw new Error("Aucun fichier à importer.");

      const report = emptyReport();
      const { activityDetailOf, blobSource, detailPayload, isOsMetadataName, looksLikeActivityName, parseActivityFile, qualityOf } =
        await decoders();

      let done = 0;
      let total = 0;

      /** Envoie un paquet : fusion, puis séries meilleures que celles en base. */
      const flush = async (batch: Pending[], tag: ImportTag) => {
        if (batch.length === 0) return;
        setProgress({ phase: "enregistrement", current: batch[0].activity.localDate, done, total });
        const raw = await mergeActivities(target, tag, batch.map((p) => mergePayload(p.activity)));
        for (let i = 0; i < batch.length; i++) {
          const result = parseMergeResult(raw[i]);
          countResult(report, batch[i].name, result);
          const detail = batch[i].detail;
          if (detail && wantsDetail(detail, result)) {
            try {
              await saveActivityDetail(result.id!, detailPayload(detail));
              report.detailsSaved++;
            } catch {
              /* le résumé est enregistré ; la courbe pourra être redéposée */
            }
          }
        }
        done += batch.length;
      };

      const singles: Pending[] = [];

      for (const file of files) {
        try {
          if (await startsWithZipMagic(file)) {
            const { openStravaArchive } = await archives();
            let opened;
            try {
              opened = await openStravaArchive(blobSource(file), { withDetail: true, utcOffsetAt: deviceOffsetAt });
            } catch (e) {
              report.rejected.push({ name: file.name, reason: e instanceof Error ? e.message : String(e) });
              continue;
            }
            const { scan, items } = opened;
            report.files += scan.files;
            report.ignored += scan.ignored;
            report.csvError ??= scan.csvError;
            const tag: ImportTag = scan.csvRows > 0 ? "strava_archive" : "file";
            total += scan.total;

            let batch: Pending[] = [];
            for await (const item of items()) {
              if (item.kind === "rejected") {
                report.rejected.push({ name: item.name, reason: item.reason });
                done++;
                continue;
              }
              setProgress({ phase: "lecture", current: item.name, done: done + batch.length, total });
              batch.push(item);
              if (batch.length >= BATCH) {
                await flush(batch, tag);
                batch = [];
              }
            }
            await flush(batch, tag);
            continue;
          }

          // Fichiers cachés de macOS (._xxx.fit.gz…) : ni activité ni « ignoré ».
          if (isOsMetadataName(file.name)) continue;
          if (!looksLikeActivityName(file.name)) {
            report.ignored++;
            continue;
          }
          report.files++;
          setProgress({ phase: "lecture", current: file.name, done, total: total + files.length });
          const bytes = new Uint8Array(await file.arrayBuffer());
          const res = await parseActivityFile(file.name, bytes);
          report.rejected.push(...res.rejected);
          const detail = res.activities.length === 1 ? await activityDetailOf(file.name, bytes) : null;
          res.activities.forEach((a, i) =>
            singles.push({
              name: file.name,
              activity: { ...a, quality: qualityOf(a), extras: null },
              detail: i === 0 ? detail : null,
            })
          );
        } catch (e) {
          report.rejected.push({ name: file.name, reason: e instanceof Error ? e.message : String(e) });
        }
      }

      total += singles.length;
      for (let i = 0; i < singles.length; i += BATCH) await flush(singles.slice(i, i + BATCH), "file");

      return report;
    },
    onSettled: () => {
      setProgress(null);
      if (target) void invalidateProviders(qc, target);
    },
  });

  return { ...mutation, progress, resetProgress: reset };
}
