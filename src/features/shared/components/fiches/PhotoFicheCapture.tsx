/**
 * Prise de photos pour créer une fiche : appareil photo du téléphone
 * (une photo par appui, on enchaîne) ou import depuis la galerie.
 * Vignettes réordonnables ; l'assemblage se fait à l'envoi (photosToFicheFile).
 */
import { useEffect, useMemo, useRef } from "react";
import { C } from "@/lib/theme";
import { MAX_FICHE_PHOTOS } from "@/lib/photosToFiche";
import { btnGhost } from "@/features/shared/components/fiches/ficheStyles";

const isTouch = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

export function PhotoFicheCapture({ photos, onChange, disabled }: {
  photos: File[];
  onChange: (photos: File[]) => void;
  disabled?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const touch = useMemo(isTouch, []);

  // Une URL par photo, gardée tant que la photo est dans la liste (pas de flash au réordonnancement).
  const cache = useRef(new Map<File, string>());
  const urls = photos.map((p) => {
    let u = cache.current.get(p);
    if (!u) { u = URL.createObjectURL(p); cache.current.set(p, u); }
    return u;
  });
  useEffect(() => {
    for (const [f, u] of cache.current) {
      if (!photos.includes(f)) { URL.revokeObjectURL(u); cache.current.delete(f); }
    }
  }, [photos]);
  useEffect(() => {
    const m = cache.current;
    return () => { m.forEach((u) => URL.revokeObjectURL(u)); m.clear(); };
  }, []);

  const full = photos.length >= MAX_FICHE_PHOTOS;
  const add = (list: FileList | null) => {
    if (!list) return;
    const imgs = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "");
    onChange([...photos, ...imgs].slice(0, MAX_FICHE_PHOTOS));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(photos.filter((_, k) => k !== i));

  const small: React.CSSProperties = {
    width: 22, height: 22, borderRadius: 3, border: "none", background: "rgba(0,0,0,0.65)", color: "#fff",
    fontSize: 12, lineHeight: "22px", padding: 0, cursor: "pointer", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {touch && (
          <button type="button" disabled={disabled || full} onClick={() => cameraRef.current?.click()}
            style={{ ...btnGhost, flex: 1, minWidth: 140, opacity: disabled || full ? 0.5 : 1 }}>
            📷 Prendre une photo
          </button>
        )}
        <button type="button" disabled={disabled || full} onClick={() => galleryRef.current?.click()}
          style={{ ...btnGhost, flex: 1, minWidth: 140, opacity: disabled || full ? 0.5 : 1 }}>
          {touch ? "🖼 Depuis la galerie" : "🖼 Ajouter des photos"}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple style={{ display: "none" }}
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {photos.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 6 }}>
          {photos.map((p, i) => (
            <div key={urls[i]} style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: 4, overflow: "hidden", border: "1px solid " + C.brd, background: C.s2 }}>
              <img src={urls[i]} alt={`Photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", top: 3, left: 3, ...small, width: "auto", padding: "0 6px", cursor: "default" }}>{i + 1}</span>
              <button type="button" aria-label={`Retirer la photo ${i + 1}`} onClick={() => remove(i)} disabled={disabled}
                style={{ position: "absolute", top: 3, right: 3, ...small }}>×</button>
              {photos.length > 1 && (
                <div style={{ position: "absolute", bottom: 3, left: 3, right: 3, display: "flex", justifyContent: "space-between" }}>
                  <button type="button" aria-label="Mettre la photo avant" onClick={() => move(i, -1)} disabled={disabled || i === 0}
                    style={{ ...small, visibility: i === 0 ? "hidden" : "visible" }}>‹</button>
                  <button type="button" aria-label="Mettre la photo après" onClick={() => move(i, 1)} disabled={disabled || i === photos.length - 1}
                    style={{ ...small, visibility: i === photos.length - 1 ? "hidden" : "visible" }}>›</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.tx3, lineHeight: 1.45 }}>
        {photos.length === 0
          ? `Photos compressées avant envoi. Plusieurs photos = un seul PDF, une page par photo (${MAX_FICHE_PHOTOS} max).`
          : photos.length === 1
            ? "1 photo : envoyée en image compressée. Ajoute-en d'autres pour faire un PDF."
            : `${photos.length} photos → un PDF de ${photos.length} pages, dans cet ordre.`}
      </div>
    </div>
  );
}
