/**
 * Photos du téléphone → fichier de fiche prêt à l'upload.
 *  - 1 photo : image compressée (WebP/JPEG, 1600 px max).
 *  - plusieurs photos : un seul PDF, une page par photo, dans l'ordre donné.
 * Le passage par canvas applique la rotation EXIF et retire les métadonnées (GPS).
 */
import { PDFDocument } from "pdf-lib";
import { compressFicheImage, fitDimensions } from "@/lib/compressImage";
import { DOC_MAX_BYTES } from "@/features/shared/types/fiches";

export const MAX_FICHE_PHOTOS = 15;
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.72;
/** Largeur d'une page du PDF en points (A4) ; hauteur = ratio de la photo. */
const PAGE_WIDTH = 595;

export class PhotoFicheError extends Error {}

const UNREADABLE = "Photo illisible par ce navigateur (format HEIC ?). Réessaie depuis le téléphone ou en JPG.";

async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new PhotoFicheError(UNREADABLE);
    }
  }
}

/** Ré-encode toujours en JPEG (pdf-lib n'embarque que JPEG et PNG). */
async function toJpeg(file: File): Promise<{ bytes: ArrayBuffer; width: number; height: number }> {
  const bitmap = await decode(file);
  const { width, height } = fitDimensions(bitmap.width, bitmap.height, MAX_DIM);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close?.(); throw new PhotoFicheError(UNREADABLE); }
  // Fond blanc : une photo PNG transparente ne devient pas noire en JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new PhotoFicheError(UNREADABLE);
  return { bytes: await blob.arrayBuffer(), width, height };
}

function slug(title: string): string {
  return title.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "fiche";
}

export async function photosToFicheFile(photos: File[], title: string): Promise<File> {
  if (photos.length === 0) throw new PhotoFicheError("Ajoute au moins une photo.");
  if (photos.length > MAX_FICHE_PHOTOS) throw new PhotoFicheError(`${MAX_FICHE_PHOTOS} photos maximum par fiche.`);

  if (photos.length === 1) {
    const out = await compressFicheImage(photos[0]);
    if (!["image/jpeg", "image/png", "image/webp"].includes(out.type)) throw new PhotoFicheError(UNREADABLE);
    return out;
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  for (const photo of photos) {
    const { bytes, width, height } = await toJpeg(photo);
    const img = await pdf.embedJpg(bytes);
    const pageHeight = Math.round((PAGE_WIDTH * height) / width);
    const page = pdf.addPage([PAGE_WIDTH, pageHeight]);
    page.drawImage(img, { x: 0, y: 0, width: PAGE_WIDTH, height: pageHeight });
  }
  const bytes = await pdf.save();
  if (bytes.byteLength > DOC_MAX_BYTES) {
    throw new PhotoFicheError("Fiche trop lourde (10 Mo max). Retire quelques photos.");
  }
  return new File([bytes], `${slug(title)}.pdf`, { type: "application/pdf", lastModified: Date.now() });
}
