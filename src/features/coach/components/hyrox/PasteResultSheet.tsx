import { useState } from "react";
import { X, ClipboardPaste } from "lucide-react";
import { C } from "@/lib/theme";
import { formatMmSs } from "@/lib/time";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import type { RaceImport } from "@/lib/hyrox/resultImport";
import { useRaceImport } from "@/features/shared/hooks/hyrox/useRaceImport";
import { useAthleteContext } from "@/features/shared/context/AthleteContext";

interface Props {
  onClose: () => void;
  /** Résultat lu : ouvre la fiche pré-remplie (`race` = course existante à mettre à jour). */
  onReady: (imp: RaceImport, race: HyroxResult | null) => void;
}

/**
 * « Coller mon résultat » : l'athlète (ou le coach) colle la page de résultat
 * copiée sur results.hyrox.com. Agon ne va jamais lire le site lui-même.
 */
export default function PasteResultSheet({ onClose, onReady }: Props) {
  const { athleteId } = useAthleteContext();
  const { prepare } = useRaceImport(athleteId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ imp: RaceImport; race: HyroxResult } | null>(null);
  const [showVideo, setShowVideo] = useState(false);

  function read(raw: string) {
    setError(null);
    setDuplicate(null);
    const prepared = prepare(raw);
    if (!prepared) {
      setError("Aucun temps reconnu. Vérifie que tu as bien copié le tableau « Workout summary » (Running 1, 1000m SkiErg…).");
      return;
    }
    if (prepared.duplicate) {
      setDuplicate({ imp: prepared.imp, race: prepared.duplicate });
      return;
    }
    onReady(prepared.imp, null);
  }

  async function pasteFromClipboard() {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip.trim()) { setError("Le presse-papiers est vide : copie d'abord ton résultat."); return; }
      setText(clip);
      read(clip);
    } catch {
      setError("Agon n'a pas pu lire le presse-papiers. Colle le texte dans la zone ci-dessous (appui long, puis « Coller »).");
    }
  }

  const step: React.CSSProperties = { marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div role="dialog" aria-label="Coller mon résultat" style={{
        position: "relative", width: "min(460px, 100vw)", height: "100%",
        background: C.bg, borderLeft: "1px solid " + C.brd,
        overflowY: "auto", padding: "16px 20px 40px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.tx }}>Coller mon résultat</div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: "none", border: "none", color: C.tx3, cursor: "pointer" }}><X size={18} /></button>
        </div>

        <ol style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13, color: C.tx2, lineHeight: 1.55 }}>
          <li style={step}>Ouvre ton résultat sur <strong style={{ color: C.tx }}>results.hyrox.com</strong> : cherche ton nom, puis touche ta course.</li>
          <li style={step}>
            Copie toute la page. <strong style={{ color: C.tx }}>Sur téléphone</strong> : appui long sur un mot en haut, puis étire la
            sélection jusqu'en bas du tableau « Workout summary », et « Copier ». <strong style={{ color: C.tx }}>Sur ordinateur</strong> :
            Cmd + A puis Cmd + C (Ctrl sur Windows).
          </li>
          <li style={step}>Reviens ici et touche <strong style={{ color: C.tx }}>« Coller »</strong>.</li>
        </ol>
        <div style={{ fontSize: 12, color: C.tx3, lineHeight: 1.5, marginBottom: 14, padding: "8px 10px", background: C.s1, borderRadius: 8, border: "1px solid " + C.brd }}>
          Tu as une capture d'écran de ton résultat ? Ouvre-la dans Photos, appui long sur le texte, « Tout sélectionner »,
          « Copier », puis colle-la ici.
        </div>

        <button
          type="button"
          onClick={pasteFromClipboard}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
            height: 48, borderRadius: 12, border: "1px solid " + C.brdL, background: "transparent",
            color: C.tx, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10,
          }}
        >
          <ClipboardPaste size={15} /> Coller
        </button>

        <textarea
          aria-label="Texte du résultat"
          value={text}
          onChange={(e) => { setText(e.target.value); setError(null); setDuplicate(null); }}
          placeholder={"…ou colle le texte ici.\nRace  2026 Bordeaux\nRunning 1  00:04:28\n1000m SkiErg  00:04:22\n…"}
          style={{
            width: "100%", minHeight: 140, padding: "8px 10px", borderRadius: 8,
            border: "1px solid " + (error ? C.o : C.brdL), background: C.s2, color: C.tx,
            fontSize: 12, fontFamily: "monospace", resize: "vertical", outline: "none",
          }}
        />

        {error && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: C.o, lineHeight: 1.5 }}>{error}</div>}

        {duplicate ? (
          <div role="alert" style={{ marginTop: 12, padding: "12px", borderRadius: 10, border: "1px solid " + C.o, background: C.o + "14" }}>
            <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5, marginBottom: 10 }}>
              Cette course est déjà dans Agon : <strong>{duplicate.race.event_name}</strong> du {duplicate.race.date},{" "}
              {formatMmSs(duplicate.race.total_s, { hours: true })}.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => onReady(duplicate.imp, duplicate.race)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: "none", background: C.ac, color: C.ink, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Mettre à jour cette course
              </button>
              <button type="button" onClick={onClose}
                style={{ height: 44, padding: "0 14px", borderRadius: 10, border: "1px solid " + C.brdL, background: "transparent", color: C.tx2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => read(text)}
            disabled={!text.trim()}
            style={{
              marginTop: 12, width: "100%", height: 48, borderRadius: 12, border: "none",
              background: C.ac, color: C.ink, fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              cursor: text.trim() ? "pointer" : "default", opacity: text.trim() ? 1 : 0.4,
            }}
          >
            Lire le résultat
          </button>
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: C.tx3, lineHeight: 1.5 }}>
          Agon lit seulement le texte que tu colles. Tu vérifies la fiche avant de l'enregistrer.
        </div>
        <button type="button" onClick={() => setShowVideo((v) => !v)}
          style={{ marginTop: 10, padding: 0, border: "none", background: "none", color: C.b, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          {showVideo ? "▾" : "▸"} Voir la vidéo (ordinateur)
        </button>
        {showVideo && (
          <div style={{ marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid " + C.brd }}>
            <video controls playsInline preload="metadata" style={{ width: "100%", display: "block" }}
              src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/public-assets/hyrox-import-tuto.mp4`} />
          </div>
        )}
      </div>
    </div>
  );
}
