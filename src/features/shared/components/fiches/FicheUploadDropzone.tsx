/**
 * FicheUploadDropzone — glisser-déposer + sélection (multi-fichiers),
 * PDF et images. Le contrôle de taille / mime définitif est fait à l'upload.
 */
import { useRef, useState } from "react";
import { C } from "@/lib/theme";
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
      style={{
        border: "1.5px dashed " + (over ? C.ac : C.brdL),
        background: over ? C.acS : "transparent",
        borderRadius: 6, padding: compact ? "12px" : "28px 16px", textAlign: "center",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
        minHeight: 44,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: C.tx2 }}>
        {label ?? (multiple ? "Glisse tes fichiers ici ou clique pour choisir" : "Glisse un fichier ici ou clique pour choisir")}
      </div>
      <div style={{ fontSize: 11, color: C.tx3, marginTop: 4 }}>
        {hint ?? (imagesOnly ? "JPG, PNG, WebP" : "PDF, JPG, PNG, WebP · 10 Mo max")}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: "none" }}
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}
