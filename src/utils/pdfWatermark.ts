/* Remove watermarks that are marked as watermarks — the way Acrobat, Word, most
   PDF generators and our own Add Watermark tool produce them:

   1. marked-content artifacts:   /Artifact <</Subtype /Watermark ...>> BDC … EMC
   2. optional-content layers named "Watermark":   /OC /MCx BDC … EMC
   3. form XObjects tagged  /PieceInfo /ADBE_CompoundType /Private /Watermark
   4. annotations of subtype /Watermark

   A watermark that was flattened into the page (part of a scanned image, or drawn
   with no tagging at all) is indistinguishable from content and is left alone —
   the caller reports that honestly instead of guessing. */
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFRawStream, PDFStream, PDFString, PDFHexString,
  PDFOperator, PDFOperatorNames, decodePDFRawStream, type PDFObject, type PDFPage,
} from 'pdf-lib';

export interface WatermarkRemoval { annotations: number; blocks: number; xobjects: number; pagesChanged: number }

const N = (s: string) => PDFName.of(s);

const bytesToLatin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };
const latin1ToBytes = (s: string) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; };

function lookup(doc: PDFDocument, o: PDFObject | undefined): PDFObject | undefined {
  return o instanceof PDFRef ? doc.context.lookup(o) : o;
}
function textOf(o: PDFObject | undefined): string {
  if (o instanceof PDFString || o instanceof PDFHexString) return o.decodeText();
  if (o instanceof PDFName) return o.decodeText();
  return '';
}

/** Is a properties dict (inline or from /Properties) a watermark artifact or a "Watermark" layer? */
function isWatermarkProps(doc: PDFDocument, props: PDFObject | undefined): boolean {
  const d = lookup(doc, props);
  if (!(d instanceof PDFDict)) return false;
  if (lookup(doc, d.get(N('Subtype'))) === N('Watermark')) return true;
  if (lookup(doc, d.get(N('Type'))) === N('OCG') && /watermark/i.test(textOf(lookup(doc, d.get(N('Name')))))) return true;
  // An OCMD wrapping a Watermark OCG.
  const ocgs = lookup(doc, d.get(N('OCGs')));
  if (ocgs instanceof PDFDict) return isWatermarkProps(doc, ocgs);
  if (ocgs instanceof PDFArray) return ocgs.asArray().some(o => isWatermarkProps(doc, o));
  return false;
}

function isWatermarkXObject(doc: PDFDocument, xobj: PDFObject | undefined): boolean {
  const s = lookup(doc, xobj);
  if (!(s instanceof PDFStream)) return false;
  const piece = lookup(doc, s.dict.get(N('PieceInfo')));
  const compound = piece instanceof PDFDict ? lookup(doc, piece.get(N('ADBE_CompoundType'))) : undefined;
  if (compound instanceof PDFDict && /watermark/i.test(textOf(lookup(doc, compound.get(N('Private')))))) return true;
  return isWatermarkProps(doc, s.dict.get(N('OC')));
}

interface Op { op: string; start: number; end: number; operands: string[] }

/** Tokenise a content stream into operators with the byte span of each (operands included). */
function parseOps(src: string): Op[] {
  const ops: Op[] = [];
  const isWs = (c: string) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === '\f' || c === '\0';
  const isDelim = (c: string) => '()<>[]{}/%'.includes(c);
  let i = 0, opStart = -1;
  let operands: string[] = [];
  const mark = () => { if (opStart < 0) opStart = i; };
  while (i < src.length) {
    const c = src[i];
    if (isWs(c)) { i++; continue; }
    if (c === '%') { while (i < src.length && src[i] !== '\n' && src[i] !== '\r') i++; continue; }
    mark();
    const tokStart = i;
    if (c === '(') {
      let depth = 1; i++;
      while (i < src.length && depth) { if (src[i] === '\\') i += 2; else { if (src[i] === '(') depth++; else if (src[i] === ')') depth--; i++; } }
    } else if (c === '<' && src[i + 1] === '<') {
      // Inline dictionary: skip to the matching >>, honouring nesting and strings.
      let depth = 0;
      while (i < src.length) {
        if (src[i] === '<' && src[i + 1] === '<') { depth++; i += 2; }
        else if (src[i] === '>' && src[i + 1] === '>') { depth--; i += 2; if (!depth) break; }
        else if (src[i] === '(') { let d = 1; i++; while (i < src.length && d) { if (src[i] === '\\') i += 2; else { if (src[i] === '(') d++; else if (src[i] === ')') d--; i++; } } }
        else i++;
      }
    } else if (c === '<') { while (i < src.length && src[i] !== '>') i++; i++; }
    else if (c === '[' || c === ']' || c === '{' || c === '}') i++;
    else if (c === '/') { i++; while (i < src.length && !isWs(src[i]) && !isDelim(src[i])) i++; }
    else {
      while (i < src.length && !isWs(src[i]) && !isDelim(src[i])) i++;
      const word = src.slice(tokStart, i);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) || word === 'true' || word === 'false' || word === 'null') { operands.push(word); continue; }
      if (word === 'BI') {
        // Inline image: binary data runs from "ID " to whitespace + "EI" + whitespace.
        const id = src.indexOf('ID', i);
        let j = id + 3;
        while (j < src.length && !(isWs(src[j - 1]) && src.startsWith('EI', j) && (j + 2 >= src.length || isWs(src[j + 2])))) j++;
        i = j + 2;
        ops.push({ op: 'BI', start: opStart, end: i, operands: [] });
      } else {
        ops.push({ op: word, start: opStart, end: i, operands });
      }
      opStart = -1; operands = [];
      continue;
    }
    operands.push(src.slice(tokStart, i));
  }
  return ops;
}

function resourceDict(doc: PDFDocument, page: PDFPage, key: string): PDFDict | undefined {
  const res = page.node.Resources();
  const d = res ? lookup(doc, res.get(N(key))) : undefined;
  return d instanceof PDFDict ? d : undefined;
}

export function removeWatermarks(doc: PDFDocument): WatermarkRemoval {
  const result: WatermarkRemoval = { annotations: 0, blocks: 0, xobjects: 0, pagesChanged: 0 };
  for (const page of doc.getPages()) {
    let changed = false;

    // 4. Watermark annotations.
    const annots = page.node.lookup(N('Annots'));
    if (annots instanceof PDFArray) {
      const keep = annots.asArray().filter(a => lookup(doc, (lookup(doc, a) as PDFDict | undefined)?.get(N('Subtype'))) !== N('Watermark'));
      if (keep.length !== annots.size()) {
        result.annotations += annots.size() - keep.length;
        page.node.set(N('Annots'), doc.context.obj(keep));
        changed = true;
      }
    }

    // 1–3. Content streams.
    const contents = page.node.normalizedEntries().Contents;
    if (!contents) continue;
    let src = '';
    for (const ref of contents.asArray()) {
      const s = lookup(doc, ref);
      if (s instanceof PDFRawStream) src += bytesToLatin1(decodePDFRawStream(s).decode()) + '\n';
      else if (s instanceof PDFStream) src += bytesToLatin1(s.getContents()) + '\n';
    }
    const props = resourceDict(doc, page, 'Properties');
    const xobjects = resourceDict(doc, page, 'XObject');
    const ops = parseOps(src);
    const cut: [number, number][] = [];
    for (let k = 0; k < ops.length; k++) {
      const o = ops[k];
      if (o.op === 'BDC') {
        const [tag, p] = o.operands;
        const inline = p?.startsWith('<<') ? p : '';
        const named = p?.startsWith('/') && props ? props.get(N(p.slice(1))) : undefined;
        const watermark = (tag === '/Artifact' && /\/Subtype\s*\/Watermark/.test(inline))
          || (tag === '/OC' && isWatermarkProps(doc, named))
          || (!!named && isWatermarkProps(doc, named));
        if (!watermark) continue;
        let depth = 1, e = k + 1;
        for (; e < ops.length && depth; e++) {
          if (ops[e].op === 'BDC' || ops[e].op === 'BMC') depth++;
          else if (ops[e].op === 'EMC') depth--;
        }
        if (depth === 0) { cut.push([o.start, ops[e - 1].end]); result.blocks++; k = e - 1; }
      } else if (o.op === 'Do' && xobjects) {
        const name = o.operands[0];
        if (name?.startsWith('/') && isWatermarkXObject(doc, xobjects.get(N(name.slice(1))))) {
          cut.push([o.start, o.end]); result.xobjects++;
        }
      }
    }
    if (cut.length) {
      let out = '', at = 0;
      for (const [s, e] of cut) { out += src.slice(at, s); at = e; }
      out += src.slice(at);
      const stream = doc.context.flateStream(latin1ToBytes(out));
      page.node.set(N('Contents'), doc.context.register(stream));
      changed = true;
    }
    if (changed) result.pagesChanged++;
  }
  return result;
}

/** Run `draw` inside an  /Artifact <</Type /Pagination /Subtype /Watermark>> BDC … EMC  block,
    the standard tagging that lets viewers, screen readers and Remove Watermark recognise it. */
export function asWatermark(doc: PDFDocument, page: PDFPage, draw: () => void): void {
  // pdf-lib types operator args without dictionaries, but PDFDict serialises inline correctly.
  const props = doc.context.obj({ Type: 'Pagination', Subtype: 'Watermark' }) as unknown as PDFName;
  page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [N('Artifact'), props]));
  draw();
  page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
}
