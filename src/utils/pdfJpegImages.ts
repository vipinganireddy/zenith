/* The JPEG photos inside a PDF, byte-for-byte.

   A DCTDecode image stream *is* a JPEG file. Handing those bytes back unchanged
   is lossless and small; decoding and re-encoding them as PNG (what a renderer
   gives you) inflates a 2 MB photo to ~8 MB. Only "plain" JPEGs qualify — no
   transparency mask, no Decode array, RGB or greyscale — everything else needs
   decoding to look right outside the PDF. */
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef, PDFNumber, decodePDFRawStream, type PDFObject } from 'pdf-lib';

export interface JpegImage { width: number; height: number; bytes: Uint8Array }

const N = (s: string) => PDFName.of(s);

function components(doc: PDFDocument, cs: PDFObject | undefined): number | null {
  const v = cs instanceof PDFRef ? doc.context.lookup(cs) : cs;
  if (v === N('DeviceRGB') || v === N('CalRGB')) return 3;
  if (v === N('DeviceGray') || v === N('CalGray')) return 1;
  if (v instanceof PDFArray) {
    const kind = v.get(0);
    if (kind === N('ICCBased')) {
      const s = doc.context.lookup(v.get(1));
      const n = s instanceof PDFRawStream ? s.dict.get(N('N')) : undefined;
      return n instanceof PDFNumber && (n.asNumber() === 3 || n.asNumber() === 1) ? n.asNumber() : null;
    }
    if (kind === N('CalRGB')) return 3;
    if (kind === N('CalGray')) return 1;
  }
  return null; // CMYK, Indexed, Lab, Separation… need decoding
}

function plainJpeg(doc: PDFDocument, s: PDFRawStream): JpegImage | null {
  const d = s.dict;
  const filter = d.lookup(N('Filter'));
  const chain = filter instanceof PDFArray ? filter.asArray() : filter ? [filter] : [];
  // DCTDecode last; anything before it is a transport wrapper (ASCII85, Flate…) to undo.
  if (chain[chain.length - 1] !== N('DCTDecode') || d.has(N('SMask')) || d.has(N('Mask')) || d.has(N('Decode'))) return null;
  if (chain.slice(0, -1).some(f => ![N('ASCII85Decode'), N('ASCIIHexDecode'), N('FlateDecode'), N('LZWDecode'), N('RunLengthDecode')].includes(f as PDFName))) return null;
  if (!components(doc, d.get(N('ColorSpace')))) return null;
  const w = d.lookup(N('Width')), h = d.lookup(N('Height'));
  if (!(w instanceof PDFNumber) || !(h instanceof PDFNumber)) return null;
  let bytes = s.getContents();
  if (chain.length > 1) {
    const outer = d.clone(doc.context);
    outer.set(N('Filter'), doc.context.obj(chain.slice(0, -1)));
    outer.delete(N('DecodeParms'));
    bytes = decodePDFRawStream(PDFRawStream.of(outer, bytes)).decode();
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not a JPEG start-of-image
  return { width: w.asNumber(), height: h.asNumber(), bytes };
}

/** JPEG images reachable from each page (including inside form XObjects), by 0-based page index. */
export function jpegImagesByPage(doc: PDFDocument): JpegImage[][] {
  return doc.getPages().map(page => {
    const found: JpegImage[] = [];
    const visited = new Set<PDFObject>();
    const walk = (res: PDFDict | undefined) => {
      const xobjs = res?.lookup(N('XObject'));
      if (!(xobjs instanceof PDFDict)) return;
      for (const [, ref] of xobjs.entries()) {
        if (visited.has(ref)) continue;
        visited.add(ref);
        const s = ref instanceof PDFRef ? doc.context.lookup(ref) : ref;
        if (!(s instanceof PDFRawStream)) continue;
        const sub = s.dict.get(N('Subtype'));
        if (sub === N('Image')) { const j = plainJpeg(doc, s); if (j) found.push(j); }
        else if (sub === N('Form')) { const r = s.dict.lookup(N('Resources')); walk(r instanceof PDFDict ? r : undefined); }
      }
    };
    walk(page.node.Resources());
    return found;
  });
}
