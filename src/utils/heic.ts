/* HEIC/HEIF (iPhone photos) → JPEG in the browser. Safari decodes HEIC natively;
   other browsers get libheif via heic2any, loaded only when a HEIC file shows up. */

export const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

/** A JPEG blob for a HEIC file (first image of a multi-image HEIC). */
export async function heicToJpeg(file: File, quality = 0.92): Promise<Blob> {
  try {
    // Native path (Safari): no download needed.
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', quality));
    if (blob) return blob;
  } catch { /* not decodable natively — fall through to libheif */ }
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality });
  return Array.isArray(out) ? out[0] : out;
}
