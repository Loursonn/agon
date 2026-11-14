/**
 * FicheUploadDropzone — glisser-déposer + sélection (multi-fichiers),
 * PDF et images. Le contrôle de taille / mime définitif est fait à l'upload.
 */
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DOC_ALLOWED_MIME } from "@/features/shared/types/fiches";

interface Props {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  /** Restreint aux images (commentaires) */
  imagesOnly?: boolean;
  label?: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function FicheUploadDropzone({ onFiles, multiple = true, imagesOnly, label, hint, compact, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accept = imagesOnly ? "image/jpeg,image/png,image/webp" : DOC_ALLOWED_MIME.join(",");

  const take = (list: FileList | null) => {
    if (!list || disabled) return;
    const files = Array.from(list);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      className={cn(
        "min-h-11 rounded-[6px] border-[1.5px] border-dashed text-center",
        over ? "border-agon-accent bg-agon-accent-doux" : "border-agon-brd-l bg-transparent",
        compact ? "p-3" : "px-4 py-7",
        disabled ? "cursor-default opacity-50" : "cursor-pointer opacity-100",
      )}
    >
      <div className="text-[13px] font-semibold text-agon-tx2">
        {label ?? (multiple ? "Glisse tes fichiers ici ou clique pour choisir" : "Glisse un fichier ici ou clique pour choisir")}
      </div>
      <div className="mt-1 text-[11px] text-agon-tx3">
        {hint ?? (imagesOnly ? "JPG, PNG, WebP" : "PDF, JPG, PNG, WebP · 10 Mo max")}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
