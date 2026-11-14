/* Recompress the photos embedded in a PDF, keeping text and vector content.

   Images are where PDF size lives. Each embedded image the browser can decode
   safely is downsampled to `maxDimension` and re-encoded as JPEG at `quality`;
   the new stream replaces the old one only if it is meaningfully smaller.

   Deliberately skipped (left byte-for-byte as they were):
   • stencil masks, soft masks (/SMask targets) and colour-key masked images —
     lossy JPEG would put halos on transparency;
   • CMYK / Lab / Indexed / >8-bit images, and images with /Decode arrays —
     re-encoding as RGB JPEG would shift their colours;
   • JPEG2000, JBIG2, CCITT (fax) and other filters the browser can't decode. */
import { PDFDocument, PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict, PDFRef, PDFBool, type PDFObject } from 'pdf-lib';
import { unzlibSync } from 'fflate';

export interface ImageCompressOptions {
  /** Longest side in pixels after downsampling. */
  maxDimension: number;
  /** JPEG quality 0–1. */
  quality: number;
  onProgress?: (fraction: number) => void;
}

export interface ImageCompressResult {
  images: number;
  recompressed: number;
  savedBytes: number;
}

const N = (n: string) => PDFName.of(n);

function lookup(doc: PDFDocument, obj: PDFObject | undefined): PDFObject | undefined {
  return obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
}

function numberOf(doc: PDFDocument, dict: PDFDict, key: string): number | undefined {
  const v = lookup(doc, dict.get(N(key)));
  return v instanceof PDFNumber ? v.asNumber() : undefined;
}

/** Channels for an RGB/Gray colour space (incl. ICCBased with N=1/3), else null. */
function channels(doc: PDFDocument, cs: PDFObject | undefined): 1 | 3 | null {
  const v = lookup(doc, cs);
  if (v === N('DeviceRGB') || v === N('CalRGB')) return 3;
  if (v === N('DeviceGray') || v === N('CalGray')) return 1;
  if (v instanceof PDFArray && v.size() >= 2 && lookup(doc, v.get(0)) === N('ICCBased')) {
    const icc = lookup(doc, v.get(1));
    if (icc instanceof PDFRawStream) {
      const n = numberOf(doc, icc.dict, 'N');
      return n === 3 ? 3 : n === 1 ? 1 : null;
    }
  }
  if (v instanceof PDFArray && v.size() >= 1 && (lookup(doc, v.get(0)) === N('CalRGB'))) return 3;
  return null;
}

function filters(doc: PDFDocument, dict: PDFDict): string[] {
  const f = lookup(doc, dict.get(N('Filter')));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) return f.asArray().map(x => (lookup(doc, x) as PDFName)?.decodeText?.() ?? '?');
  return [];
}

/** Undo PNG row predictors (PDF /Predictor >= 10) for 8-bit samples. */
function unpredictPng(data: Uint8Array, columns: number, colors: number): Uint8Array<ArrayBuffer> | null {
  const bpp = colors;
  const rowLen = columns * colors;
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = r * (rowLen + 1) + 1;
    const dst = r * rowLen;
    for (let i = 0; i < rowLen; i++) {
      const x = data[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = r > 0 ? out[dst - rowLen + i] : 0;
      const c = r > 0 && i >= bpp ? out[dst - rowLen + i - bpp] : 0;
      let v: number;
      switch (type) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: return null;
      }
      out[dst + i] = v & 0xff;
    }
  }
  return out;
}

function ascii85(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let group: number[] = [];
  const flush = (len: number) => {
    let v = 0;
    for (let i = 0; i < 5; i++) v = v * 85 + (group[i] ?? 84);
    for (let i = 0; i < len - 1; i++) out.push((v >>> (24 - 8 * i)) & 0xff);
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === 0x7e) break; // '~>' end marker
    if (c <= 0x20) continue; // whitespace
    if (c === 0x7a && group.length === 0) { out.push(0, 0, 0, 0); continue; } // 'z'
    group.push(c - 33);
    if (group.length === 5) { flush(5); group = []; }
  }
  if (group.length) flush(group.length);
  return Uint8Array.from(out);
}

function asciiHex(input: Uint8Array): Uint8Array {
  const hex = new TextDecoder().decode(input).replace(/[^0-9a-fA-F>]/g, '').split('>')[0];
  const even = hex.length % 2 ? hex + '0' : hex;
  const out = new Uint8Array(even.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function decode(doc: PDFDocument, stream: PDFRawStream, w: number, h: number, ch: 1 | 3): Promise<ImageBitmap | null> {
  const chain = filters(doc, stream.dict);
  let data: Uint8Array = stream.contents;
  // Unwrap the text encodings some producers (e.g. ReportLab) put around image data.
  while (chain[0] === 'ASCII85Decode' || chain[0] === 'ASCIIHexDecode') {
    data = chain.shift() === 'ASCII85Decode' ? ascii85(data) : asciiHex(data);
  }
  if (chain.length === 1 && chain[0] === 'DCTDecode') {
    return createImageBitmap(new Blob([data as BlobPart], { type: 'image/jpeg' }));
  }
  if (chain.length === 1 && chain[0] === 'FlateDecode') {
    let raw: Uint8Array = unzlibSync(data);
    const parmsObj = lookup(doc, stream.dict.get(N('DecodeParms')));
    const parms = parmsObj instanceof PDFArray ? lookup(doc, parmsObj.get(parmsObj.size() - 1)) : parmsObj;
    const predictor = parms instanceof PDFDict ? numberOf(doc, parms, 'Predictor') ?? 1 : 1;
    if (predictor >= 10) {
      const un = unpredictPng(raw, w, ch);
      if (!un) return null;
      raw = un;
    } else if (predictor !== 1) return null; // TIFF predictor: rare, skip
    if (raw.length < w * h * ch) return null;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; i < w * h; i++, j += ch) {
      rgba[i * 4] = raw[j];
      rgba[i * 4 + 1] = ch === 3 ? raw[j + 1] : raw[j];
      rgba[i * 4 + 2] = ch === 3 ? raw[j + 2] : raw[j];
      rgba[i * 4 + 3] = 255;
    }
    return createImageBitmap(new ImageData(rgba, w, h));
  }
  return null;
}

export async function recompressImages(doc: PDFDocument, opts: ImageCompressOptions): Promise<ImageCompressResult> {
  const ctx = doc.context;
  const all = ctx.enumerateIndirectObjects();
  const images = all.filter(([, o]) => o instanceof PDFRawStream && lookup(doc, o.dict.get(N('Subtype'))) === N('Image')) as [PDFRef, PDFRawStream][];

  // Images used as another image's soft mask must stay lossless.
  const maskRefs = new Set<string>();
  for (const [, s] of images) {
    const m = s.dict.get(N('SMask'));
    if (m instanceof PDFRef) maskRefs.add(m.toString());
  }

  const result: ImageCompressResult = { images: images.length, recompressed: 0, savedBytes: 0 };
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d')!;

  for (let i = 0; i < images.length; i++) {
    opts.onProgress?.(i / Math.max(images.length, 1));
    const [ref, stream] = images[i];
    const d = stream.dict;
    try {
      if (maskRefs.has(ref.toString())) continue;
      if (lookup(doc, d.get(N('ImageMask'))) === PDFBool.True) continue;
      if (d.has(N('Mask')) || d.has(N('Decode'))) continue;
      const w = numberOf(doc, d, 'Width'), h = numberOf(doc, d, 'Height');
      const bpc = numberOf(doc, d, 'BitsPerComponent');
      if (!w || !h || bpc !== 8) continue;
      if (w * h < 64 * 64) continue; // icons and rules: nothing to gain
      const ch = channels(doc, d.get(N('ColorSpace')));
      if (!ch) continue;

      const bitmap = await decode(doc, stream, w, h, ch);
      if (!bitmap) continue;
      const scale = Math.min(1, opts.maxDimension / Math.max(w, h));
      const nw = Math.max(1, Math.round(w * scale)), nh = Math.max(1, Math.round(h * scale));
      canvas.width = nw; canvas.height = nh;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, nw, nh);
      g.drawImage(bitmap, 0, 0, nw, nh);
      bitmap.close();
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', opts.quality));
      if (!blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length >= stream.contents.length * 0.9) continue; // not worth the generation loss

      const dict = ctx.obj({
        Type: 'XObject', Subtype: 'Image', Width: nw, Height: nh,
        ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode', Length: bytes.length,
      });
      const smask = d.get(N('SMask'));
      if (smask) dict.set(N('SMask'), smask);
      ctx.assign(ref, PDFRawStream.of(dict, bytes));
      result.recompressed++;
      result.savedBytes += stream.contents.length - bytes.length;
    } catch {
      // A malformed image is left exactly as it was.
    }
  }
  opts.onProgress?.(1);
  return result;
}
