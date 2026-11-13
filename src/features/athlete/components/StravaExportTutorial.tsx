import { useState } from "react";
import { C, H } from "@/lib/theme";

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
    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${C.o}59`, background: `radial-gradient(90% 120% at 100% 0%, ${C.o}33, transparent 60%), linear-gradient(160deg, ${C.o}1F, ${C.o}0D), ${C.s1}` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: "100%", padding: "12px 16px 12px 12px", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: C.tx, textAlign: "left" }}
      >
        <span aria-hidden style={{ width: 36, height: 36, flex: "none", borderRadius: 10, background: C.o, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 14px ${C.o}66` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8" strokeLinecap="square"><path d="M12 3V15M7 10L12 15L17 10M4 19H20" /></svg>
        </span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Importer mon historique Strava</span>
        <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.tx2} strokeWidth="1.5" strokeLinecap="square" style={{ flex: "none", transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}><path d="M9 5L16 12L9 19" /></svg>
      </button>
      {open && (
      <div style={{ padding: "0 16px 16px" }}>
      <div style={{ fontSize: 12, color: C.tx3, marginBottom: 12, lineHeight: 1.5 }}>
        Ton historique Strava aide ton coach à connaître ton passé d'entraînement. Regarde la vidéo (30 s) puis suis les étapes : tout se fait depuis un ordinateur.
      </div>

      <video
        src={VIDEO}
        poster={POSTER}
        controls playsInline preload="metadata"
        style={{ width: "100%", borderRadius: 4, background: H.noir, marginBottom: 12, display: "block" }}
      />

      <ol style={{ margin: 0, paddingLeft: 18, listStyle: "decimal", display: "flex", flexDirection: "column", gap: 6 }}>
        {STEPS.map((s) => (
          <li key={s} style={{ fontSize: 12, color: C.tx2, lineHeight: 1.5 }}>{s}</li>
        ))}
      </ol>

      </div>
      )}
    </div>
  );
}
