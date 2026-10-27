import { useRef, useState } from "react";
import { toast } from "sonner";
import { C } from "@/lib/theme";
import {
  useActivityFileImport,
  type ImportReport,
} from "@/features/shared/hooks/useActivityFileImport";

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

export function ActivityFileImport() {
  const input = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const { mutate, isPending, progress } = useActivityFileImport();

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
    mutate(files, {
      onSuccess: (r) => {
        setReport(r);
        if (r.imported === 0 && r.files === 0) {
          toast.warning("Aucun fichier d'activité reconnu", {
            description: "Attendu une archive d'export, ou des fichiers .fit, .tcx ou .gpx.",
          });
          return;
        }
        if (r.imported === 0) {
          toast.success("Rien de nouveau", {
            description: "Toutes ces sorties étaient déjà dans ton historique.",
          });
          return;
        }
        toast[r.rejected.length > 0 ? "warning" : "success"](
          `${plural(r.imported, "activité importée", "activités importées")}`,
          {
            description:
              r.rejected.length > 0
                ? `${plural(r.rejected.length, "fichier non lu", "fichiers non lus")} — voir le détail.`
                : undefined,
          },
        );
      },
      onError: (e) => toast.error("Import impossible", { description: e.message }),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>Importer mes fichiers</div>
        <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.5, marginTop: 4 }}>
          Dépose l'archive de ton export Strava ou Garmin, ou des fichiers .fit, .tcx et .gpx. Tout
          est lu sur ton appareil : seules les valeurs des sorties (durée, distance, fréquence
          cardiaque, dénivelé) sont enregistrées, pas les fichiers eux-mêmes.
        </div>
      </div>

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
          <div style={{ height: 4, borderRadius: 2, background: C.s2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "15%",
                background: C.ac,
                transition: "width 0.2s",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 11,
              color: C.tx3,
              // Un nom de fichier long ne doit pas pousser la mise en page.
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {progress.phase === "insertion" ? "Enregistrement" : "Lecture"} {progress.done}/
            {progress.total} · {progress.current}
          </div>
        </div>
      )}

      {/* ── Compte rendu ── */}
      {report && !isPending && <Rapport report={report} ouvert={detailsOuverts} onToggle={() => setDetailsOuverts((o) => !o)} />}
    </div>
  );
}

/** Compte rendu d'un dépôt : ce qui est entré, ce qui a été écarté, et pourquoi. */
function Rapport({
  report,
  ouvert,
  onToggle,
}: {
  report: ImportReport;
  ouvert: boolean;
  onToggle: () => void;
}) {
  const lignes: string[] = [];
  if (report.imported > 0) lignes.push(plural(report.imported, "activité importée", "activités importées"));
  if (report.duplicates > 0) lignes.push(`${plural(report.duplicates, "fichier déjà importé", "fichiers déjà importés")}`);
  if (report.alreadyKnown > 0) lignes.push(`${plural(report.alreadyKnown, "sortie déjà connue", "sorties déjà connues")} (montre ou autre format)`);
  if (report.ignored > 0) lignes.push(`${plural(report.ignored, "élément ignoré", "éléments ignorés")}`);

  const refuses = report.rejected;

  return (
    <div
      style={{
        fontSize: 11,
        color: C.tx2,
        background: refuses.length > 0 ? C.oS : C.gS,
        border: `1px solid ${(refuses.length > 0 ? C.o : C.g)}30`,
        borderRadius: 6,
        padding: "10px 12px",
        lineHeight: 1.6,
      }}
    >
      <div>{lignes.length > 0 ? lignes.join(" · ") : "Aucune activité reconnue dans ce dépôt."}</div>

      {refuses.length > 0 && (
        <>
          <button
            type="button"
            onClick={onToggle}
            style={{
              marginTop: 6,
              background: "transparent",
              border: "none",
              padding: 0,
              color: C.o,
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            {plural(refuses.length, "fichier non lu", "fichiers non lus")} {ouvert ? "−" : "+"}
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
        </>
      )}
    </div>
  );
}
