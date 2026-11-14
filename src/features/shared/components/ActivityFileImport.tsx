import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useActivityFileImport,
  type ImportReport,
} from "@/features/shared/hooks/useActivityFileImport";
import { reportSummary } from "@/lib/activityImport";

/**
 * Dépôt de fichiers d'activité (archive d'export, FIT, TCX, GPX).
 *
 * Sert deux usages que rien ne distingue pour l'athlète : récupérer un
 * historique qu'aucune API ne donne — Garmin n'expose que les quatre-vingt-dix
 * derniers jours, COROS limite les téléchargements quotidiens — et importer une
 * sortie enregistrée sur une montre qui n'est pas connectée.
 *
 * Le compte rendu est affiché en entier, refus compris. « 312 activités
 * importées » sans mention des 8 fichiers illisibles laisse croire à un succès
 * complet, et l'athlète cherche ensuite pendant une semaine pourquoi une sortie
 * manque.
 */

/** Au-delà, c'est un disque entier qu'on fait glisser, pas un export. */
const MAX_FILES = 5000;

const EXTENSIONS = ".zip,.fit,.tcx,.gpx,.gz";

/**
 * Fichiers d'un glisser-déposer, dossiers compris.
 *
 * `DataTransfer.files` est vide quand on dépose un dossier : sans parcours
 * explicite, l'athlète qui décompresse son export puis fait glisser le dossier
 * obtenu — le geste le plus naturel — verrait l'interface ne rien faire du
 * tout, sans message.
 */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  // Navigateur sans l'API d'entrées : les fichiers simples passent quand même.
  if (entries.length === 0) return Array.from(dt.files);

  const out: File[] = [];
  const queue = [...entries];

  while (queue.length > 0 && out.length < MAX_FILES) {
    const entry = queue.shift()!;

    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) =>
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null)),
      );
      if (file) out.push(file);
      continue;
    }

    const reader = (entry as FileSystemDirectoryEntry).createReader();
    /*
      `readEntries` ne rend que cent entrées par appel et il faut le rappeler
      jusqu'à la réponse vide. S'arrêter au premier appel marche sur un dossier
      d'exemple et perd silencieusement le reste sur un vrai export.
    */
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve) =>
        reader.readEntries(resolve, () => resolve([])),
      );
      if (batch.length === 0) break;
      queue.push(...batch);
    }
  }

  return out;
}

const plural = (n: number, singulier: string, pluriel = singulier + "s") =>
  `${n} ${n > 1 ? pluriel : singulier}`;

type Source = "strava" | "garmin";

const SOURCES: Record<Source, { label: string; sub: string; tag: string; how: string }> = {
  strava: {
    label: "Strava",
    sub: "archive .zip",
    tag: "Import Strava",
    how: "Dans Strava : Paramètres, Mon compte, « Télécharger votre compte ». Dépose ensuite le .zip reçu par e-mail.",
  },
  garmin: {
    label: "Garmin",
    sub: "export .zip",
    tag: "Garmin",
    how: "Dans Garmin Connect (sur ordinateur) : Compte, Gestion des données, « Exporter vos données ». Dépose ensuite le .zip reçu par e-mail.",
  },
};

const fmtSize = (bytes: number) =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(bytes / 1000))} Ko`;

/**
 * `athleteId` : le coach importe pour son athlète (fiche de l'athlète) ; les
 * sorties sont enregistrées au nom de l'athlète. Absent : l'athlète lui-même.
 *
 * `sourceChoice` : deux boutons « Strava / Garmin » au-dessus de la zone de
 * dépôt (page « Montres et données »). `coachName` : nom du coach qui voit les
 * sorties importées. `onOpenStravaTutorial` : lien « Comment récupérer mon
 * archive Strava ».
 */
export function ActivityFileImport({
  athleteId,
  forCoach = false,
  sourceChoice = false,
  coachName,
  onOpenStravaTutorial,
}: {
  athleteId?: string;
  forCoach?: boolean;
  sourceChoice?: boolean;
  coachName?: string;
  onOpenStravaTutorial?: () => void;
} = {}) {
  const input = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [fichiers, setFichiers] = useState<{ name: string; size: number } | null>(null);
  const { mutate, isPending, progress } = useActivityFileImport(athleteId);

  const lancer = (files: File[]) => {
    if (files.length === 0) return;
    if (files.length > MAX_FILES) {
      toast.error("Trop de fichiers d'un coup", {
        description: `Dépose plutôt l'archive .zip de ton export (${files.length} fichiers reçus).`,
      });
      return;
    }

    setReport(null);
    setDetailsOuverts(false);
    setFichiers({
      name: files.length === 1 ? files[0]!.name : `${files.length} fichiers`,
      size: files.reduce((n, f) => n + f.size, 0),
    });
    mutate(files, {
      onSuccess: (r) => {
        setReport(r);
        const entered = r.created + r.merged + r.unchanged;
        if (entered === 0 && r.files === 0) {
          toast.warning("Aucun fichier d'activité reconnu", {
            description: "Attendu une archive d'export, ou des fichiers .fit, .tcx ou .gpx.",
          });
          return;
        }
        if (r.created + r.merged === 0) {
          toast.success("Rien de nouveau", {
            description: "Toutes ces sorties étaient déjà complètes dans l'historique.",
          });
          return;
        }
        toast[r.rejected.length > 0 ? "warning" : "success"]("Import terminé", { description: reportSummary(r) });
      },
      onError: (e) => toast.error("Import impossible", { description: e.message }),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="text-[12px] font-semibold text-agon-tx">
          {forCoach ? "Importer l'historique de l'athlète" : "Importer mes fichiers"}
        </div>
        <div className="mt-1 text-[11px] leading-[1.5] text-agon-tx3">
          {forCoach ? "Dépose l'archive d'export Strava ou Garmin de l'athlète" : "Dépose l'archive de ton export Strava ou Garmin"}, ou
          des fichiers .fit, .tcx et .gpx. Une sortie déjà présente (montre Garmin, autre fichier) est
          complétée, jamais dupliquée : titre, description, effort ressenti et matériel s'ajoutent, et la
          meilleure courbe est gardée. Tout est lu sur l'appareil : les fichiers ne sont pas envoyés,
          seules les valeurs des sorties sont enregistrées. La note privée Strava n'est pas importée.
        </div>
      </div>

      {sourceChoice && !forCoach && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(Object.keys(SOURCES) as Source[]).map((k) => {
              const on = source === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSource(on ? null : k)}
                  className={cn(
                    "flex-1 cursor-pointer rounded-[10px] border px-2 py-2.5 text-center font-[inherit] text-agon-tx",
                    on ? "border-agon-accent bg-agon-accent-doux" : "border-agon-brd bg-agon-s2",
                  )}
                >
                  <span className="block text-[13px] font-medium">{SOURCES[k].label}</span>
                  <span className="mt-0.5 block text-[11px] text-agon-tx3">{SOURCES[k].sub}</span>
                </button>
              );
            })}
          </div>
          {source && <div className="text-[11.5px] leading-[1.5] text-agon-tx2">{SOURCES[source].how}</div>}
          {onOpenStravaTutorial && (
            <button
              type="button"
              onClick={onOpenStravaTutorial}
              className="cursor-pointer border-none bg-transparent p-0 text-left font-[inherit] text-[12px] text-agon-accent"
            >
              Comment récupérer mon archive Strava ›
            </button>
          )}
        </div>
      )}

      {/* ── Zone de dépôt ── */}
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          void filesFromDrop(e.dataTransfer).then(lancer);
        }}
        disabled={isPending}
        className={cn(
          "rounded-[6px] border border-dashed px-3.5 py-[18px] text-center font-[inherit] text-[12px] leading-[1.5]",
          survol ? "border-agon-accent bg-agon-accent-doux text-agon-accent" : "border-agon-brd-l bg-agon-s2 text-agon-tx2",
          isPending ? "cursor-wait" : "cursor-pointer",
        )}
      >
        {isPending
          ? "Lecture en cours…"
          : "Glisser des fichiers ici, ou appuyer pour les choisir"}
      </button>

      <input
        ref={input}
        type="file"
        multiple
        accept={EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          /*
            Champ remis à zéro après lecture : sans cela, redéposer exactement
            le même fichier ne déclenche pas `change` et l'athlète appuie deux
            fois sans rien voir se passer.
          */
          e.target.value = "";
          lancer(files);
        }}
      />

      {/* ── Avancement ── */}
      {isPending && progress && (
        <div className="flex flex-col gap-1.5">
          {fichiers && (
            <div className="flex justify-between gap-2.5 text-[12px] text-agon-tx">
              <span className="truncate">{fichiers.name}</span>
              <span className="flex-none text-agon-tx3">
                {fmtSize(fichiers.size)}{source ? ` · ${SOURCES[source].label}` : ""}
              </span>
            </div>
          )}
          <div className="h-1 overflow-hidden rounded-[2px] bg-agon-s2">
            <div
              className="h-full bg-agon-accent [transition:width_0.2s]"
              style={{ width: progress.total > 0 ? `${Math.min(100, (progress.done / progress.total) * 100)}%` : "15%" }}
            />
          </div>
          <div className="flex justify-between gap-2.5 text-[11px] text-agon-tx3">
            <span>
              {progress.phase === "enregistrement" ? "Enregistrement des sorties…" : "Lecture des sorties…"}{" "}
              {Math.min(progress.done, progress.total)} / {progress.total}
            </span>
            {progress.total > 0 && (
              <span>{Math.min(100, Math.round((progress.done / progress.total) * 100))} %</span>
            )}
          </div>
        </div>
      )}

      {/* ── Compte rendu ── */}
      {report && !isPending && (
        <Rapport
          report={report}
          ouvert={detailsOuverts}
          onToggle={() => setDetailsOuverts((o) => !o)}
          onDone={() => setReport(null)}
          sourceTag={sourceChoice && !forCoach && source ? SOURCES[source].tag : null}
          coachName={forCoach ? undefined : coachName}
        />
      )}
    </div>
  );
}

/** Un chiffre du rapport, avec sa phrase. */
function Chiffre({ n, titre, texte }: { n: number; titre: string; texte: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-11 flex-none text-right font-data text-[20px] text-agon-tx">{n}</span>
      <span className="text-[12px] leading-[1.45] text-agon-tx2">
        <span className="font-medium text-agon-tx">{titre}</span> · {texte}
      </span>
    </div>
  );
}

/** Compte rendu d'un dépôt : ce qui est entré, ce qui a été écarté, et pourquoi. */
function Rapport({
  report,
  ouvert,
  onToggle,
  onDone,
  sourceTag,
  coachName,
}: {
  report: ImportReport;
  ouvert: boolean;
  onToggle: () => void;
  onDone: () => void;
  sourceTag: string | null;
  coachName?: string;
}) {
  const lues = report.created + report.merged + report.unchanged;
  const extras: string[] = [];
  if (report.detailsSaved > 0) extras.push(plural(report.detailsSaved, "courbe ajoutée", "courbes ajoutées"));
  if (report.ignored > 0) extras.push(plural(report.ignored, "élément ignoré", "éléments ignorés"));

  const refuses = report.rejected;

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-agon-brd bg-agon-s2 px-3.5 pb-3 pt-3.5">
      <div>
        <div className="text-[14px] font-medium text-agon-tx">Import terminé</div>
        <div className="mt-0.5 text-[12px] text-agon-tx3">{plural(lues, "sortie lue", "sorties lues")}</div>
      </div>

      <Chiffre n={report.created} titre={report.created > 1 ? "Nouvelles" : "Nouvelle"} texte="ajoutées à ton historique." />
      <Chiffre n={report.merged} titre={report.merged > 1 ? "Complétées" : "Complétée"} texte="elles existaient déjà, on y a ajouté titre, description ou courbe." />
      <Chiffre n={report.unchanged} titre={report.unchanged > 1 ? "Déjà complètes" : "Déjà complète"} texte="rien à ajouter." />

      <div className="text-[11.5px] leading-[1.5] text-agon-tx3">
        Aucune sortie en double : une même sortie venue de Strava et de ta montre n’apparaît qu’une fois.
        {sourceTag && coachName && report.created + report.merged > 0 && (
          <> Ces sorties portent la source « {sourceTag} ». {coachName} les voit dans ton planning.</>
        )}
      </div>

      {extras.length > 0 && <div className="text-[11px] text-agon-tx3">{extras.join(" · ")}</div>}
      {report.csvError && (
        <div className="text-[11px] text-agon-alerte">
          Titres, descriptions et effort ressenti non lus : {report.csvError}
        </div>
      )}

      {refuses.length === 0 ? (
        <div className="rounded-[6px] border border-agon-succes/[0.19] bg-agon-succes-doux px-2.5 py-2 text-[12px] text-agon-succes">
          Aucun fichier refusé
        </div>
      ) : (
        <div className="rounded-[6px] border border-agon-alerte/[0.19] bg-agon-alerte-doux px-2.5 py-2 text-[11px] leading-[1.6] text-agon-tx2">
          <button
            type="button"
            onClick={onToggle}
            className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-[11px] text-agon-alerte underline"
          >
            {plural(refuses.length, "erreur", "erreurs")} — détail {ouvert ? "−" : "+"}
          </button>

          {ouvert && (
            <ul className="m-0 mt-2 p-0 pl-4 text-agon-tx3">
              {/*
                Liste bornée à vingt entrées : une archive abîmée peut en
                produire des centaines, et une page de refus illisible vaut une
                page sans refus. Le compte total reste affiché juste au-dessus,
                donc rien n'est caché.
              */}
              {refuses.slice(0, 20).map((r, i) => (
                <li key={`${r.name}-${i}`} className="mb-[3px]">
                  <span className="text-agon-tx2">{r.name}</span> — {r.reason}
                </li>
              ))}
              {refuses.length > 20 && (
                <li className="-ml-4 mt-1 list-none">
                  et {refuses.length - 20} autres.
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="h-11 cursor-pointer rounded-[10px] border border-agon-brd bg-agon-s1 font-[inherit] text-[14px] font-medium text-agon-tx"
      >
        Terminé
      </button>
    </div>
  );
}
