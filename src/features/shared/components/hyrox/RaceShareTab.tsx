import { useEffect, useRef, useState } from "react";
import { C } from "@/lib/theme";
import { LABEL, buttonStyle, pillStyle } from "@/features/shared/components/seance/seanceUi";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import type { RaceWatchAnalysis } from "@/lib/hyrox/raceWatch";
import { drawShareCard, shareCardBlob } from "./raceShareCard";
import { Sources } from "./raceAnalysisUi";

/** « Partager ma course » : carte 9:16 dessinée sur l'appareil (HyroxAnaTel, écran 04). */
export default function RaceShareTab(props: {
  race: HyroxResult; analysis: RaceWatchAnalysis; division: string; isRecord: boolean;
  coachName: string | null; attribution: string | null; hr: Array<number | null> | null;
}) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [showHr, setShowHr] = useState(true);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);
  const hasHr = !!props.hr && props.hr.some((v) => v != null);

  useEffect(() => {
    if (!ref.current) return;
    drawShareCard(ref.current, {
      race: props.race, analysis: props.analysis, divisionLabel: props.division, isRecord: props.isRecord,
      coachName: props.coachName, attribution: props.attribution, theme, showHr: showHr && hasHr, hrSeries: props.hr,
    });
  }, [props.race, props.analysis, props.division, props.isRecord, props.coachName, props.attribution, props.hr, theme, showHr, hasHr]);

  const fileName = `hyrox-${props.race.date}.png`;
  const save = async () => {
    if (!ref.current) return;
    const blob = await shareCardBlob(ref.current);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const share = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const blob = await shareCardBlob(ref.current);
      if (!blob) return;
      const file = new File([blob], fileName, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: props.race.event_name });
      } else {
        await save();
      }
    } catch {
      /* partage annulé */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <canvas ref={ref} style={{ width: "100%", maxWidth: 320, aspectRatio: "9 / 16", borderRadius: 16, border: `1px solid ${C.brd}` }} aria-label="Carte à partager" />
      <div style={{ display: "flex", gap: 6 }}>
        <span style={{ ...LABEL, alignSelf: "center" }}>Fond</span>
        {(["dark", "light"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTheme(t)} style={{ ...pillStyle(C.ac, theme === t), height: 28, cursor: "pointer" }}>{t === "dark" ? "Sombre" : "Clair"}</button>
        ))}
      </div>
      {hasHr && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: C.tx2 }}>
          <input type="checkbox" checked={showHr} onChange={(e) => setShowHr(e.target.checked)} />
          Afficher la FC <span style={{ color: C.tx3, fontSize: 11 }}>courbe et moyenne de la montre</span>
        </label>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={share} disabled={busy} style={buttonStyle("primary", busy)}>Partager</button>
        <button type="button" onClick={save} style={buttonStyle()}>Enregistrer l’image</button>
      </div>
      <Sources>chrono, stations : {props.race.is_official ? "résultat officiel" : "temps saisis"}{props.attribution ? ` · courbe et FC moyenne : ${props.attribution} (masquables)` : ""} · image créée sur l'appareil, rien n'est envoyé</Sources>
    </div>
  );
}
