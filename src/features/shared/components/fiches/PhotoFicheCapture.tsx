/**
 * Prise de photos pour créer une fiche : appareil photo du téléphone
 * (une photo par appui, on enchaîne) ou import depuis la galerie.
 * Vignettes réordonnables ; l'assemblage se fait à l'envoi (photosToFicheFile).
 */
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { MAX_FICHE_PHOTOS } from "@/lib/photosToFiche";
import { BTN_GHOST } from "@/features/shared/components/fiches/ficheStyles";

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

  const small = "h-[22px] rounded-[3px] border-none bg-black/[0.65] p-0 font-[inherit] text-[12px] leading-[22px] text-agon-tx";
  const smallBtn = cn(small, "w-[22px] cursor-pointer");
  const pickBtn = cn(BTN_GHOST, "min-w-[140px] flex-1", disabled || full ? "opacity-50" : "opacity-100");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {touch && (
          <button type="button" disabled={disabled || full} onClick={() => cameraRef.current?.click()}
            className={pickBtn}>
            📷 Prendre une photo
          </button>
        )}
        <button type="button" disabled={disabled || full} onClick={() => galleryRef.current?.click()}
          className={pickBtn}>
          {touch ? "🖼 Depuis la galerie" : "🖼 Ajouter des photos"}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      {photos.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
          {photos.map((p, i) => (
            <div key={urls[i]} className="relative aspect-[3/4] overflow-hidden rounded-[4px] border border-agon-brd bg-agon-s2">
              <img src={urls[i]} alt={`Photo ${i + 1}`} className="block size-full object-cover" />
              <span className={cn(small, "absolute left-[3px] top-[3px] w-auto cursor-default px-1.5")}>{i + 1}</span>
              <button type="button" aria-label={`Retirer la photo ${i + 1}`} onClick={() => remove(i)} disabled={disabled}
                className={cn(smallBtn, "absolute right-[3px] top-[3px]")}>×</button>
              {photos.length > 1 && (
                <div className="absolute inset-x-[3px] bottom-[3px] flex justify-between">
                  <button type="button" aria-label="Mettre la photo avant" onClick={() => move(i, -1)} disabled={disabled || i === 0}
                    className={cn(smallBtn, i === 0 ? "invisible" : "visible")}>‹</button>
                  <button type="button" aria-label="Mettre la photo après" onClick={() => move(i, 1)} disabled={disabled || i === photos.length - 1}
                    className={cn(smallBtn, i === photos.length - 1 ? "invisible" : "visible")}>›</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] leading-[1.45] text-agon-tx3">
        {photos.length === 0
          ? `Photos compressées avant envoi. Plusieurs photos = un seul PDF, une page par photo (${MAX_FICHE_PHOTOS} max).`
          : photos.length === 1
            ? "1 photo : envoyée en image compressée. Ajoute-en d'autres pour faire un PDF."
            : `${photos.length} photos → un PDF de ${photos.length} pages, dans cet ordre.`}
      </div>
    </div>
  );
}
