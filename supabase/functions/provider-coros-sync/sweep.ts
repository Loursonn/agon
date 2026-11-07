/**
 * Parcours d'une plage de dates, fenêtre par fenêtre, pour télécharger les FIT.
 *
 * Isolé de `index.ts` et sans aucune dépendance (base, réseau, Deno) : les
 * appels extérieurs sont injectés. C'est la partie où une erreur crée un trou
 * définitif dans l'historique, donc la partie qui doit être testée sans
 * serveur COROS.
 *
 * Invariants :
 *   - `processedThrough` ne désigne que des fenêtres listées *et* téléchargées
 *     en entier, sans erreur, depuis `from` sans interruption ;
 *   - une erreur (transport, refus COROS, quota, téléchargement) arrête le
 *     parcours : on ne saute jamais une fenêtre ;
 *   - une liste de `perCall` URL ou plus est suspecte de troncature : la
 *     fenêtre est resserrée avant d'être acceptée ;
 *   - le quota est réservé avant de télécharger, pour la fenêtre entière.
 */
import { type FitListing, type FitWindow, planFitWindow, shiftDay } from "../_shared/coros.ts";

export interface Rejection {
  name: string;
  reason: string;
}

export type IngestOutcome =
  | { kind: "ok"; imported: number; duplicates: number; rejected: Rejection[] }
  /** Échec passager : la fenêtre devra être reprise. */
  | { kind: "retry"; reason: string; quota?: boolean };

export interface SweepDeps {
  /** Liste les URL d'une fenêtre. Peut lever (transport). */
  list(range: FitWindow): Promise<FitListing>;
  /** Fichiers encore téléchargeables aujourd'hui (quota journalier en base). */
  quotaRemaining(): Promise<number>;
  /** Réserve `count` fichiers, tout ou rien. */
  reserve(count: number): Promise<boolean>;
  /** COROS a signalé le quota : le marquer épuisé pour la journée. */
  exhaustQuota(): Promise<void>;
  /** Télécharge, décode, insère. Ne lève pas : renvoie `retry` sur échec passager. */
  ingest(url: string): Promise<IngestOutcome>;
  /** Faux quand il faut s'arrêter avant d'être coupé par la plateforme. */
  hasTime(): boolean;
  /** Appelé après chaque fenêtre complète. */
  onWindowDone?(range: FitWindow): Promise<void>;
}

export interface SweepOptions {
  /** Largeur initiale des fenêtres, en jours. */
  span: number;
  /** Maximum d'URL renvoyées par appel (troncature au-delà). */
  perCall: number;
  /** Fichiers que cet appelant peut télécharger (10 manuel, 50 cron). */
  budget: number;
}

export type SweepStop = "done" | "budget" | "quota" | "deadline" | "error";

export interface SweepResult {
  processedThrough: string | null;
  stop: SweepStop;
  /** Message lisible quand `stop` vaut `error` (ou `quota` signalé par COROS). */
  error?: string;
  imported: number;
  duplicates: number;
  rejected: Rejection[];
  warnings: string[];
  /** Fichiers réservés sur le quota. */
  used: number;
}

export async function sweepFitWindows(
  deps: SweepDeps,
  from: string,
  to: string,
  opts: SweepOptions,
): Promise<SweepResult> {
  const out: SweepResult = {
    processedThrough: null,
    stop: "done",
    imported: 0,
    duplicates: 0,
    rejected: [],
    warnings: [],
    used: 0,
  };
  const stop = (s: SweepStop, error?: string): SweepResult => {
    out.stop = s;
    if (error) out.error = error;
    return out;
  };

  const quotaLeft = Math.max(0, await deps.quotaRemaining());
  // À égalité (cron : budget = quota journalier), c'est le quota qui borne.
  const limitedByQuota = quotaLeft <= opts.budget;
  let left = Math.min(opts.budget, quotaLeft);

  let cursor = from;
  while (cursor <= to) {
    if (!deps.hasTime()) return stop("deadline");

    let span = Math.max(1, opts.span);
    let range: FitWindow | null = null;
    let urls: string[] = [];

    /*
      Resserrer jusqu'à ce que la liste soit sûre (pas tronquée) et tienne
      dans ce qu'il reste à télécharger. Lister ne coûte pas de quota de
      fichiers : on le fait même budget épuisé, ce qui laisse le curseur
      traverser les périodes sans activité.
    */
    for (;;) {
      range = planFitWindow(cursor, to, span);
      if (!range) return stop("done");
      let listing: FitListing;
      try {
        listing = await deps.list(range);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return stop("error", `COROS injoignable (fichiers du ${range.from} au ${range.to}) : ${msg.slice(0, 200)}`);
      }
      if (listing.kind === "error") {
        if (listing.quota) {
          await deps.exhaustQuota();
          return stop("quota", `COROS signale le quota atteint : ${listing.reason.slice(0, 200)}`);
        }
        return stop(
          "error",
          `COROS a refusé la liste des fichiers du ${range.from} au ${range.to} : ${listing.reason.slice(0, 200) || "sans message"}`,
        );
      }
      urls = listing.kind === "urls" ? listing.urls : [];
      const truncated = urls.length >= opts.perCall;
      if ((truncated || urls.length > left) && span > 1) {
        // Sans dépasser la largeur réelle de la fenêtre (bornée par `to`).
        const width = Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
        span = Math.max(1, Math.floor(Math.min(span, width) / 2));
        continue;
      }
      if (truncated) {
        out.warnings.push(
          `${range.from} : ${urls.length} fichiers annoncés, le maximum par appel — d'éventuels fichiers au-delà n'ont pas été récupérés`,
        );
      }
      break;
    }

    if (urls.length > left) {
      return stop(limitedByQuota ? "quota" : "budget");
    }

    if (urls.length > 0) {
      if (!(await deps.reserve(urls.length))) return stop("quota");
      left -= urls.length;
      out.used += urls.length;
    }

    for (const url of urls) {
      const r = await deps.ingest(url);
      if (r.kind === "retry") {
        if (r.quota) {
          await deps.exhaustQuota();
          return stop("quota", `COROS signale le quota atteint : ${r.reason}`);
        }
        return stop("error", `Fichier du ${range.from} au ${range.to} non récupéré (${r.reason}) : nouvel essai à la prochaine synchronisation.`);
      }
      out.imported += r.imported;
      out.duplicates += r.duplicates;
      out.rejected.push(...r.rejected);
    }

    out.processedThrough = range.to;
    if (deps.onWindowDone) await deps.onWindowDone(range);
    cursor = shiftDay(range.to, 1);
  }

  return stop("done");
}
