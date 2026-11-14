import { useState } from "react";
import { C } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Vidéo servie par l'app (public/tutos), floutée : aucune donnée personnelle.
const VIDEO = "/tutos/strava-import.mp4";
const POSTER = "/tutos/strava-import.jpg";

const STEPS = [
  "Sur strava.com (sur ordinateur), clique sur ta photo en haut à droite → Paramètres → Mon compte.",
  "Descends tout en bas de la page : « Télécharger votre compte » → Commencer, puis « Demander le téléchargement ».",
  "Attends quelques minutes : Strava t'envoie un e-mail. Clique sur « Download Archive » pour télécharger le dossier .zip.",
  "Décompresse le .zip : double-clic dessus sur Mac, clic droit → « Extraire tout » sur Windows.",
  "Glisse le dossier obtenu directement dans la zone « Glisser des fichiers ici » juste au-dessus. Évite « appuyer pour les choisir » : l'ordinateur ne sélectionne pas toujours tous les fichiers.",
];

/** Tuto : récupérer son archive Strava et l'importer soi-même dans Agon. */
export function StravaExportTutorial() {
  const [open, setOpen] = useState(false);

  // Planche « Profil athlète » : une ligne orange repliée ; le tuto s'ouvre au toucher.
  return (
    <div className="overflow-hidden rounded-[14px] border border-agon-alerte/[0.42] bg-agon-alerte/[0.12]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent py-3 pl-3 pr-4 text-left font-[inherit] text-agon-tx"
      >
        <span aria-hidden className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-agon-alerte">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8" strokeLinecap="square"><path d="M12 3V15M7 10L12 15L17 10M4 19H20" /></svg>
        </span>
        <span className="flex-1 text-[14px] font-medium">Importer mon historique Strava</span>
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.tx2} strokeWidth="1.5" strokeLinecap="square"
          className={cn("flex-none transition-transform duration-150", open && "rotate-90")}><path d="M9 5L16 12L9 19" /></svg>
      </button>
      {open && (
      <div className="px-4 pb-4">
      <div className="mb-3 text-[12px] leading-normal text-agon-tx3">
        Ton historique Strava aide ton coach à connaître ton passé d'entraînement. Regarde la vidéo (30 s) puis suis les étapes : tout se fait depuis un ordinateur.
      </div>

      <video
        src={VIDEO}
        poster={POSTER}
        controls playsInline preload="metadata"
        className="mb-3 block w-full rounded-[4px] bg-agon-ink"
      />

      <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-[18px]">
        {STEPS.map((s) => (
          <li key={s} className="text-[12px] leading-normal text-agon-tx2">{s}</li>
        ))}
      </ol>

      </div>
      )}
    </div>
  );
}
