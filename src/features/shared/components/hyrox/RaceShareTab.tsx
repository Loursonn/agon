import { useEffect, useRef, useState } from "react";
import { C, alpha } from "@/lib/theme";
import { buttonStyle } from "@/features/shared/components/seance/seanceUi";
import type { HyroxResult } from "@/features/shared/types/hyrox";
import type { RaceVerdict } from "@/lib/hyrox/verdict";
import { SHARE_SIZE, drawShareCard, loadShareFonts, shareCardBlob, type ShareFormat } from "./raceShareCard";

/**
 * « Partager ma course » (lot 6, maquette validée par Hugo le 16/11/2026) :
 * format post 4:5 ou story 9:16, nom (affiché par défaut, Q2), place, chrono
 * possible. Le frein et la source du classement restent toujours. Athlète
 * seulement (Q3). Image créée sur l'appareil, rien n'est envoyé.
 */
export default function RaceShareTab({ race, verdict, athleteName }: {
  race: HyroxResult;
  verdict: RaceVerdict;
  athleteName: string | null;
}) {
  const [format, setFormat] = useState<ShareFormat>("post");
  const [showName, setShowName] = useState(true);
  const [showPlace, setShowPlace] = useState(true);
  const [showPossible, setShowPossible] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    loadShareFonts().then(() => { if (alive) setFontsReady(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    drawShareCard(ref.current, { race, verdict, format, athleteName: showName ? athleteName : null, showPlace, showPossible });
  }, [race, verdict, format, athleteName, showName, showPlace, showPossible, fontsReady]);

  const fileName = `hyrox-${race.date}-${format}.png`;
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
        await nav.share({ files: [file], title: race.event_name });
      } else {
        await save();
      }
    } catch {
      /* partage annulé */
    } finally {
      setBusy(false);
    }
  };

  const size = SHARE_SIZE[format];
  const toggles: Array<{ label: string; on: boolean; set: (v: boolean) => void; show: boolean }> = [
    { label: "Afficher mon nom", on: showName, set: setShowName, show: !!athleteName },
    { label: `Afficher ma place à ${race.event_name.replace(/^HYROX\s+/i, "")}`, on: showPlace, set: setShowPlace, show: !!verdict.place },
    { label: "Afficher le chrono possible", on: showPossible, set: setShowPossible, show: !!verdict.margin },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420, width: "100%", alignSelf: "center" }}>
      <div role="radiogroup" aria-label="Format" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 4, padding: 3, borderRadius: 12, background: C.s2 }}>
        {(["post", "story"] as const).map((f) => {
          const on = format === f;
          return (
            <button key={f} type="button" role="radio" aria-checked={on} onClick={() => setFormat(f)}
              style={{
                height: 40, borderRadius: 9, border: `1px solid ${on ? alpha(C.ac, 0.45) : "transparent"}`, background: on ? alpha(C.ac, 0.12) : "transparent",
                color: on ? C.tx : C.tx2, fontFamily: "inherit", fontSize: 13.5, cursor: "pointer",
              }}>
              {f === "post" ? "Post 4:5" : "Story 9:16"}
            </button>
          );
        })}
      </div>

      <canvas ref={ref} aria-label="Aperçu de la carte à partager"
        style={{ alignSelf: "center", width: "100%", maxWidth: format === "post" ? 320 : 260, aspectRatio: `${size.w} / ${size.h}`, borderRadius: 10, border: `1px solid ${C.brdL}` }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        {toggles.filter((t) => t.show).map((t, i) => (
          <label key={t.label} style={{ minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 14, borderTop: i ? `1px solid ${C.brd}` : "none", cursor: "pointer" }}>
            {t.label}
            <input type="checkbox" checked={t.on} onChange={(e) => t.set(e.target.checked)} style={{ width: 22, height: 22, accentColor: C.ac }} />
          </label>
        ))}
        <span style={{ fontSize: 11.5, color: C.tx3, lineHeight: 1.5, paddingTop: 4 }}>
          Le frein et la source du classement restent toujours sur la carte : c'est ce qui la rend crédible. Image créée sur ton téléphone, rien n'est envoyé.
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <button type="button" onClick={save} style={{ ...buttonStyle(), height: 48, borderRadius: 12, fontSize: 14.5 }}>Enregistrer l'image</button>
        <button type="button" onClick={share} disabled={busy} style={{ ...buttonStyle("primary", busy), height: 48, borderRadius: 12, fontSize: 14.5 }}>Partager…</button>
      </div>
    </div>
  );
}
