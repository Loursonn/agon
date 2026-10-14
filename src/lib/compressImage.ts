/**
 * Compression d'image côté navigateur avant upload (zéro dépendance).
 * Resize au plus grand côté ≤ maxDim, ré-encode en JPEG.
 * Bonus : le passage par canvas retire les métadonnées EXIF (dont GPS).
 *
 * Si la sortie est plus lourde que l'original (image déjà petite), on garde l'original.
 */
/** Dimensions cibles (ratio conservé, jamais d'agrandissement). */
export function fitDimensions(width: number, height: number, maxDim: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= maxDim && height <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * format 'webp' : export WebP, repli JPEG si le navigateur ne sait pas encoder
 * le WebP (vieux Safari renvoie du PNG ou null).
 */
export async function compressImage(
  file: File,
  maxDim = 1440,
  quality = 0.8,
  format: 'jpeg' | 'webp' = 'jpeg',
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  let bitmap: ImageBitmap;
  try {
    // imageOrientation: applique la rotation EXIF (sinon photos portrait tournées)
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file; // navigateur trop ancien → on upload tel quel
    }
  }

  const { width, height } = fitDimensions(bitmap.width, bitmap.height, maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close?.(); return file; }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  let blob = format === 'webp' ? await encode('image/webp') : null;
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg');
  if (!blob || blob.size >= file.size) return file;

  const isWebp = blob.type === 'image/webp';
  const name = file.name.replace(/\.[^.]+$/, '') + (isWebp ? '.webp' : '.jpg');
  return new File([blob], name, { type: isWebp ? 'image/webp' : 'image/jpeg', lastModified: Date.now() });
}

/** Préréglage Fiches : 1600 px max, WebP 0.75 (cible 150-300 Ko par capture). */
export function compressFicheImage(file: File): Promise<File> {
  return compressImage(file, 1600, 0.75, 'webp');
}

/** « 1,2 Mo », « 240 Ko », « 512 o » */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
