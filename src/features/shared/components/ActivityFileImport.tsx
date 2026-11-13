import { useRef, useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>
          {forCoach ? "Importer l'historique de l'athlète" : "Importer mes fichiers"}
        </div>
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5, marginTop: 4 }}>
          {forCoach ? "Dépose l'archive d'export Strava ou Garmin de l'athlète" : "Dépose l'archive de ton export Strava ou Garmin"}, ou
          des fichiers .fit, .tcx et .gpx. Une sortie déjà présente (montre Garmin, autre fichier) est
          complétée, jamais dupliquée : titre, description, effort ressenti et matériel s'ajoutent, et la
          meilleure courbe est gardée. Tout est lu sur l'appareil : les fichiers ne sont pas envoyés,
          seules les valeurs des sorties sont enregistrées. La note privée Strava n'est pas importée.
        </div>
      </div>

      {sourceChoice && !forCoach && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            {(Object.keys(SOURCES) as Source[]).map((k) => {
              const on = source === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSource(on ? null : k)}
                  style={{ flex: 1, padding: "10px 8px", borderRadius: 10, border: `1px solid ${on ? C.ac : C.brd}`, background: on ? C.acS : C.s2, color: C.tx, fontFamily: "inherit", cursor: "pointer", textAlign: "center" }}
                >
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500 }}>{SOURCES[k].label}</span>
                  <span style={{ display: "block", fontSize: 11, color: C.tx3, marginTop: 2 }}>{SOURCES[k].sub}</span>
                </button>
              );
            })}
          </div>
          {source && <div style={{ fontSize: 11.5, color: C.tx2, lineHeight: 1.5 }}>{SOURCES[source].how}</div>}
          {onOpenStravaTutorial && (
            <button
              type="button"
              onClick={onOpenStravaTutorial}
              style={{ background: "none", border: "none", padding: 0, color: C.ac, fontSize: 12, fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}
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
        style={{
          padding: "18px 14px",
          borderRadius: 6,
          border: `1px dashed ${survol ? C.ac : C.brdL}`,
          background: survol ? C.acS : C.s2,
          color: survol ? C.ac : C.tx2,
          fontSize: 12,
          fontFamily: "inherit",
          cursor: isPending ? "wait" : "pointer",
          textAlign: "center",
          lineHeight: 1.5,
        }}
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
        style={{ display: "none" }}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {fichiers && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: C.tx }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fichiers.name}</span>
              <span style={{ color: C.tx3, flex: "none" }}>
                {fmtSize(fichiers.size)}{source ? ` · ${SOURCES[source].label}` : ""}
              </span>
            </div>
          )}
          <div style={{ height: 4, borderRadius: 2, background: C.s2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: progress.total > 0 ? `${Math.min(100, (progress.done / progress.total) * 100)}%` : "15%",
                background: C.ac,
                transition: "width 0.2s",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, color: C.tx3 }}>
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
    <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
      <span style={{ width: 44, textAlign: "right", fontFamily: "var(--agon-font-data)", fontSize: 20, color: C.tx, flex: "none" }}>{n}</span>
      <span style={{ fontSize: 12, color: C.tx2, lineHeight: 1.45 }}>
        <span style={{ color: C.tx, fontWeight: 500 }}>{titre}</span> · {texte}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12, background: C.s2, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "14px 14px 12px" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.tx }}>Import terminé</div>
        <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>{plural(lues, "sortie lue", "sorties lues")}</div>
      </div>

      <Chiffre n={report.created} titre={report.created > 1 ? "Nouvelles" : "Nouvelle"} texte="ajoutées à ton historique." />
      <Chiffre n={report.merged} titre={report.merged > 1 ? "Complétées" : "Complétée"} texte="elles existaient déjà, on y a ajouté titre, description ou courbe." />
      <Chiffre n={report.unchanged} titre={report.unchanged > 1 ? "Déjà complètes" : "Déjà complète"} texte="rien à ajouter." />

      <div style={{ fontSize: 11.5, color: C.tx3, lineHeight: 1.5 }}>
        Aucune sortie en double : une même sortie venue de Strava et de ta montre n’apparaît qu’une fois.
        {sourceTag && coachName && report.created + report.merged > 0 && (
          <> Ces sorties portent la source « {sourceTag} ». {coachName} les voit dans ton planning.</>
        )}
      </div>

      {extras.length > 0 && <div style={{ fontSize: 11, color: C.tx3 }}>{extras.join(" · ")}</div>}
      {report.csvError && (
        <div style={{ fontSize: 11, color: C.o }}>
          Titres, descriptions et effort ressenti non lus : {report.csvError}
        </div>
      )}

      {refuses.length === 0 ? (
        <div style={{ fontSize: 12, color: C.g, background: C.gS, border: `1px solid ${C.g}30`, borderRadius: 6, padding: "8px 10px" }}>
          Aucun fichier refusé
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.tx2, background: C.oS, border: `1px solid ${C.o}30`, borderRadius: 6, padding: "8px 10px", lineHeight: 1.6 }}>
          <button
            type="button"
            onClick={onToggle}
            style={{ background: "transparent", border: "none", padding: 0, color: C.o, fontSize: 11, fontFamily: "inherit", cursor: "pointer", textDecoration: "underline" }}
          >
            {plural(refuses.length, "erreur", "erreurs")} — détail {ouvert ? "−" : "+"}
          </button>

          {ouvert && (
            <ul style={{ margin: "8px 0 0", padding: "0 0 0 16px", color: C.tx3 }}>
              {/*
                Liste bornée à vingt entrées : une archive abîmée peut en
                produire des centaines, et une page de refus illisible vaut une
                page sans refus. Le compte total reste affiché juste au-dessus,
                donc rien n'est caché.
              */}
              {refuses.slice(0, 20).map((r, i) => (
                <li key={`${r.name}-${i}`} style={{ marginBottom: 3 }}>
                  <span style={{ color: C.tx2 }}>{r.name}</span> — {r.reason}
                </li>
              ))}
              {refuses.length > 20 && (
                <li style={{ listStyle: "none", marginLeft: -16, marginTop: 4 }}>
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
        style={{ height: 44, borderRadius: 10, border: `1px solid ${C.brd}`, background: C.s1, color: C.tx, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer" }}
      >
        Terminé
      </button>
    </div>
  );
}
