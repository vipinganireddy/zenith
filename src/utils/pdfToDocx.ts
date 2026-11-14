/* PDF → structured content → Word / HTML.

   Rebuilds a flowing document from the positioned text pdf.js reports:
   • reading order — text grouped into lines by baseline, left to right, top to bottom
   • real spaces where separate text runs had a visual gap (no "glued" words)
   • lines reflowed into paragraphs; a new paragraph on a blank-line gap, a new
     indent, a list marker, a short (unwrapped) line or a style change
   • headings from font size relative to the page's body text; bold/italic from the font
   • centred lines kept centred
   • images extracted at native resolution (pdf.js decodes every format: JPEG,
     JPEG2000, JBIG2, CMYK, soft masks) and placed in reading position
   Scanned pages have no text layer; callers are told so they can suggest OCR. */
import {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, PageBreak, Tab,
  type ParagraphChild,
} from 'docx';
import * as pdfjsLib from 'pdfjs-dist';
import './pdfWorker';
import { escapeHtml } from './htmlToPdf';
import { zipSync, strToU8 } from 'fflate';

type PDFPage = Awaited<ReturnType<Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>['getPage']>>;
type Viewport = ReturnType<PDFPage['getViewport']>;

interface Run { text: string; x: number; right: number; size: number; bold: boolean; italic: boolean }
interface Line { y: number; top: number; bottom: number; x: number; right: number; size: number; runs: Run[] }

export interface PageImage {
  png: Uint8Array;
  /** Native pixel size. */
  pixelWidth: number; pixelHeight: number;
  /** Displayed box on the page, in points (y down). */
  x: number; top: number; width: number; height: number;
}

/** An image ready for a document: photos as JPEG, graphics with transparency as PNG. */
export interface DocImage extends PageImage { data: Uint8Array; format: 'png' | 'jpg' }

export type Element =
  | { kind: 'text'; level: 0 | 1 | 2 | 3; center: boolean; lines: Line[] }
  | { kind: 'image'; image: DocImage };

export interface PageContent { width: number; height: number; elements: Element[]; hasText: boolean }

async function fontStyle(page: PDFPage, fontName: string) {
  try {
    const f = page.commonObjs.get(fontName) as { name?: string; bold?: boolean; italic?: boolean } | undefined;
    const name = f?.name ?? '';
    return { bold: !!f?.bold || /bold|black|heavy|semibold|demi/i.test(name), italic: !!f?.italic || /italic|oblique/i.test(name) };
  } catch {
    return { bold: false, italic: false };
  }
}

/** Lines in reading order, in viewport coordinates (y grows downward). */
async function extractLines(page: PDFPage, vp: Viewport): Promise<Line[]> {
  const content = await page.getTextContent();
  const runs: (Run & { y: number })[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue;
    const m = pdfjsLib.Util.transform(vp.transform, item.transform);
    const size = Math.hypot(m[2], m[3]);
    if (size < 1) continue;
    const { bold, italic } = await fontStyle(page, item.fontName);
    runs.push({ text: item.str, x: m[4], right: m[4] + item.width * vp.scale, size, bold, italic, y: m[5] });
  }
  runs.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const r of runs) {
    const line = lines.find(l => Math.abs(l.y - r.y) < Math.min(l.size, r.size) * 0.45);
    if (line) {
      line.runs.push(r);
      line.x = Math.min(line.x, r.x); line.right = Math.max(line.right, r.right);
      line.size = Math.max(line.size, r.size);
    } else {
      lines.push({ y: r.y, top: r.y - r.size, bottom: r.y + r.size * 0.25, x: r.x, right: r.right, size: r.size, runs: [r] });
    }
  }
  for (const l of lines) l.runs.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => a.y - b.y);
}

interface RawImage { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray; kind?: number }

async function imageToPng(img: RawImage): Promise<Uint8Array | null> {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  if (img.bitmap) g.drawImage(img.bitmap, 0, 0);
  else if (img.data) {
    const n = img.width * img.height;
    const rgba = new Uint8ClampedArray(n * 4);
    if (img.kind === 3) rgba.set(img.data.subarray(0, n * 4));
    else if (img.kind === 2) for (let i = 0; i < n; i++) { rgba[i * 4] = img.data[i * 3]; rgba[i * 4 + 1] = img.data[i * 3 + 1]; rgba[i * 4 + 2] = img.data[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
    else if (img.kind === 1) {
      const rowBytes = (img.width + 7) >> 3;
      for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        const v = (img.data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
        const o = (y * img.width + x) * 4; rgba[o] = rgba[o + 1] = rgba[o + 2] = v; rgba[o + 3] = 255;
      }
    } else return null;
    g.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  } else return null;
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
  c.width = c.height = 0;
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/** Images drawn on the page with their displayed box (tracks the graphics-state CTM). */
export async function extractPageImages(page: PDFPage, vp: Viewport = page.getViewport({ scale: 1 }), minSize = 8): Promise<PageImage[]> {
  const ops = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  const stack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const out: PageImage[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = pdfjsLib.Util.transform(ctm, args as number[]);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      try {
        const m = pdfjsLib.Util.transform(vp.transform, ctm);
        // The image fills the unit square under the CTM; take its bounding box.
        const xs = [m[4], m[4] + m[0], m[4] + m[2], m[4] + m[0] + m[2]];
        const ys = [m[5], m[5] + m[1], m[5] + m[3], m[5] + m[1] + m[3]];
        const box = { x: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
        if (box.right - box.x < minSize || box.bottom - box.top < minSize) continue; // rules, bullets, spacers
        // Images reused across pages live in the document-wide cache (ids "g_…").
        const id = args[0] as string;
        const obj = (fn === OPS.paintInlineImageXObject ? args[0] : id.startsWith('g_') ? page.commonObjs.get(id) : page.objs.get(id)) as RawImage;
        const png = await imageToPng(obj);
        if (png) out.push({ png, pixelWidth: obj.width, pixelHeight: obj.height, x: box.x, top: box.top, width: box.right - box.x, height: box.bottom - box.top });
      } catch { /* undecodable image: skip it */ }
    }
  }
  return out;
}

const hasGap = (a: Run, b: Run) => b.x - a.right > b.size * 1.5;
const lineText = (l: Line) => l.runs.map(r => r.text).join(' ');

/** Group a page's lines and images into headings, paragraphs and images, in reading order. */
async function pageContent(page: PDFPage): Promise<PageContent> {
  const vp = page.getViewport({ scale: 1 }); // 1 unit = 1 pt; rotation applied
  const images = await extractPageImages(page, vp); // also resolves fonts used by fontStyle()
  const lines = await extractLines(page, vp);

  const weights = new Map<number, number>();
  for (const l of lines) { const k = Math.round(l.size); weights.set(k, (weights.get(k) ?? 0) + lineText(l).length); }
  const body = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
  const leftEdge = Math.min(...lines.map(l => l.x), vp.width);
  const rightEdge = Math.max(...lines.map(l => l.right), 0);

  type Item = { top: number; line?: Line; image?: PageImage };
  const items: Item[] = [...lines.map(line => ({ top: line.top, line })), ...images.map(image => ({ top: image.top, image }))]
    .sort((a, b) => a.top - b.top);

  const elements: Element[] = [];
  let para: Extract<Element, { kind: 'text' }> | null = null;
  for (const it of items) {
    if (it.image) { para = null; elements.push({ kind: 'image', image: { ...it.image, data: it.image.png, format: 'png' } }); continue; }
    const l = it.line!;
    const ratio = l.size / body;
    const shortLine = l.right - l.x < vp.width * 0.75;
    const level = (shortLine && ratio >= 1.6 ? 1 : shortLine && ratio >= 1.3 ? 2 : shortLine && ratio >= 1.12 ? 3 : 0) as 0 | 1 | 2 | 3;
    const center = Math.abs((l.x + l.right) / 2 - vp.width / 2) < vp.width * 0.04 && l.x - leftEdge > vp.width * 0.12;
    const last = para?.lines[para.lines.length - 1];
    const listItem = /^\s*([•●▪◦‣–*-]|\d{1,3}[.)]|[a-zA-Z][.)])\s/.test(lineText(l));
    const tabular = l.runs.some((r, i) => i > 0 && hasGap(l.runs[i - 1], r));
    const lastTabular = !!last && last.runs.some((r, i) => i > 0 && hasGap(last.runs[i - 1], r));
    // Only a line that ran to the right margin wrapped; a short line was a deliberate break.
    const lastWrapped = !!last && rightEdge - last.right < last.size * 3;
    const continues = para && last && lastWrapped && level === 0 && para.level === 0 && para.center === center
      && !listItem && !tabular && !lastTabular
      && Math.abs(l.size - last.size) < 0.5
      && l.top - last.bottom < l.size * 0.9            // no blank-line gap
      && Math.abs(l.x - para.lines[0].x) < l.size * 1.5; // no new indent
    if (continues) para!.lines.push(l);
    else { para = { kind: 'text', level, center, lines: [l] }; elements.push(para); }
  }
  return { width: vp.width, height: vp.height, elements, hasText: lines.length > 0 };
}

/** Photos stored as PNG are 3–5× larger than needed: re-encode opaque, large images as JPEG when that is smaller. */
async function forDocument(img: PageImage): Promise<DocImage> {
  const keep: DocImage = { ...img, data: img.png, format: 'png' };
  if (img.png.length < 150_000 || typeof createImageBitmap !== 'function') return keep;
  try {
    const bmp = await createImageBitmap(new Blob([img.png as BlobPart], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const px = g.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 255) { c.width = 0; return keep; } // transparency: PNG only
    const jpg = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.88));
    c.width = 0;
    if (!jpg || jpg.size >= img.png.length * 0.8) return keep;
    return { ...img, data: new Uint8Array(await jpg.arrayBuffer()), format: 'jpg' };
  } catch { return keep; }
}

export async function readPdf(data: ArrayBuffer, onProgress?: (f: number) => void): Promise<PageContent[]> {
  const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: new Uint8Array(data) }).promise;
  const pages: PageContent[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pg = await pageContent(await pdf.getPage(p));
    for (const el of pg.elements) if (el.kind === 'image') el.image = await forDocument(el.image);
    pages.push(pg);
    onProgress?.(p / pdf.numPages);
  }
  return pages;
}

// ── Word ──────────────────────────────────────────────────────────────────────
const PX_PER_PT = 96 / 72;
const HEADINGS = [undefined, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const;

function runsToChildren(line: Line): ParagraphChild[] {
  const kids: ParagraphChild[] = [];
  let prev: Run | null = null;
  for (const r of line.runs) {
    let text = r.text;
    // A column-sized gap (tables, aligned figures) becomes a tab; a small one, a word space.
    const tab = !!prev && hasGap(prev, r);
    if (prev && !tab && !/\s$/.test(prev.text) && !/^\s/.test(text) && r.x - prev.right > r.size * 0.2) text = ' ' + text;
    const style = { bold: r.bold, italics: r.italic, size: Math.round(r.size * 2) }; // half-points
    kids.push(tab ? new TextRun({ ...style, children: [new Tab(), text.trimStart()] }) : new TextRun({ ...style, text }));
    prev = r;
  }
  return kids;
}

export interface PdfToDocxResult { blob: Blob; pages: number; textPages: number; images: number; preview: string }

export async function pdfToDocx(data: ArrayBuffer, onProgress?: (f: number) => void): Promise<PdfToDocxResult> {
  const pages = await readPdf(data, onProgress);
  const children: Paragraph[] = [];
  let images = 0, preview = '';
  pages.forEach((pg, p) => {
    let first = p > 0;
    const pageBreak = () => (first ? (first = false, [new PageBreak()]) : []);
    for (const el of pg.elements) {
      if (el.kind === 'image') {
        const k = Math.min(1, (pg.width - 72) / el.image.width);
        children.push(new Paragraph({
          children: [...pageBreak(), new ImageRun({ type: el.image.format, data: el.image.data, transformation: { width: Math.round(el.image.width * k * PX_PER_PT), height: Math.round(el.image.height * k * PX_PER_PT) } })],
          spacing: { after: 120 },
        }));
        images++;
        continue;
      }
      const kids: ParagraphChild[] = [...pageBreak()];
      el.lines.forEach((l, i) => { if (i) kids.push(new TextRun({ text: ' ' })); kids.push(...runsToChildren(l)); });
      children.push(new Paragraph({ children: kids, heading: HEADINGS[el.level], alignment: el.center ? AlignmentType.CENTER : undefined, spacing: { after: 120 } }));
      if (preview.length < 600) preview += el.lines.map(lineText).join(' ') + '\n';
    }
    if (first) children.push(new Paragraph({ children: [new PageBreak()] })); // blank page
  });
  const [w, h] = pages[0] ? [pages[0].width, pages[0].height] : [595.28, 841.89];
  const doc = new Document({
    sections: [{
      properties: { page: { size: { width: Math.round(w * 20), height: Math.round(h * 20) }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      children: children.length ? children : [new Paragraph('')],
    }],
  });
  return { blob: await Packer.toBlob(doc), pages: pages.length, textPages: pages.filter(p => p.hasText).length, images, preview: preview.slice(0, 400) };
}

// ── HTML ──────────────────────────────────────────────────────────────────────
const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

function runsToHtml(line: Line): string {
  let html = '';
  let prev: Run | null = null;
  for (const r of line.runs) {
    let sep = '';
    if (prev) sep = hasGap(prev, r) ? '&emsp;' : (!/\s$/.test(prev.text) && !/^\s/.test(r.text) && r.x - prev.right > r.size * 0.2 ? ' ' : '');
    let t = escapeHtml(r.text);
    if (r.bold) t = `<strong>${t}</strong>`;
    if (r.italic) t = `<em>${t}</em>`;
    html += sep + t;
    prev = r;
  }
  return html;
}

export interface PdfToHtmlResult { html: string; pages: number; textPages: number; images: number }

/** A standalone, responsive, searchable HTML document (images embedded; no scripts). */
export async function pdfToHtml(data: ArrayBuffer, title: string, onProgress?: (f: number) => void): Promise<PdfToHtmlResult> {
  const pages = await readPdf(data, onProgress);
  let images = 0;
  const body = pages.map((pg, i) => {
    const parts = pg.elements.map(el => {
      if (el.kind === 'image') {
        images++;
        return `<figure><img src="data:image/${el.image.format === 'jpg' ? 'jpeg' : 'png'};base64,${toBase64(el.image.data)}" width="${Math.round(el.image.width * PX_PER_PT)}" alt=""></figure>`;
      }
      const tag = el.level ? `h${el.level}` : 'p';
      const cls = el.center ? ' class="center"' : '';
      return `<${tag}${cls}>${el.lines.map(runsToHtml).join(' ')}</${tag}>`;
    });
    return `<section class="page" aria-label="Page ${i + 1}">\n${parts.join('\n')}\n</section>`;
  }).join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #f3f4f6; color: #111; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .page { max-width: 820px; margin: 24px auto; padding: 48px 56px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.08); border-radius: 6px; }
  h1, h2, h3 { line-height: 1.25; margin: 1.2em 0 .5em; }
  p { margin: 0 0 .8em; }
  .center { text-align: center; }
  figure { margin: 1em 0; }
  img { max-width: 100%; height: auto; }
  @media (max-width: 640px) { .page { margin: 0; padding: 24px 18px; border-radius: 0; box-shadow: none; } }
  @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; page-break-after: always; } }
</style>
</head>
<body>
${body}
</body>
</html>`;
  return { html, pages: pages.length, textPages: pages.filter(p => p.hasText).length, images };
}

/** A page's text in reading order — one string per visual line, word spaces restored, blank line between paragraphs. */
export async function pageTextLines(page: PDFPage): Promise<string[]> {
  const lines = await extractLines(page, page.getViewport({ scale: 1 }));
  const out: string[] = [];
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (prev && l.top - prev.bottom > l.size * 0.9) out.push(''); // paragraph gap
    out.push(l.runs.reduce((s, r, k) => {
      const p = l.runs[k - 1];
      if (!p) return r.text;
      const sep = hasGap(p, r) ? '\t' : (!/\s$/.test(p.text) && !/^\s/.test(r.text) && r.x - p.right > r.size * 0.2 ? ' ' : '');
      return s + sep + r.text;
    }, ''));
  });
  return out;
}

export interface PdfToEpubResult { epub: Uint8Array; pages: number; textPages: number; images: number }

/** A valid EPUB 3 (with nav document): headings, paragraphs, emphasis and images, one section per page. */
export async function pdfToEpub(data: ArrayBuffer, title: string, onProgress?: (f: number) => void): Promise<PdfToEpubResult> {
  const pages = await readPdf(data, onProgress);
  const xml = (s: string) => s.replace(/&emsp;/g, '&#8195;'); // XHTML has no named entities beyond the XML five
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {};
  const manifest: string[] = [];
  const toc: string[] = [];
  let images = 0;
  pages.forEach((pg, i) => {
    let firstHeading = '';
    const body = pg.elements.map((el, k) => {
      if (el.kind === 'image') {
        const name = `images/p${i + 1}_${k}.${el.image.format}`;
        files[`OEBPS/${name}`] = el.image.data;
        manifest.push(`<item id="img${images}" href="${name}" media-type="image/${el.image.format === 'jpg' ? 'jpeg' : 'png'}"/>`);
        images++;
        return `<figure><img src="${name}" alt=""/></figure>`;
      }
      const tag = el.level ? `h${el.level}` : 'p';
      const text = el.lines.map(runsToHtml).join(' ');
      if (el.level && el.level <= 2 && !firstHeading) firstHeading = el.lines.map(l => l.runs.map(r => r.text).join('')).join(' ').trim();
      return `<${tag}${el.center ? ' class="center"' : ''}>${xml(text)}</${tag}>`;
    }).join('\n');
    const label = firstHeading ? escapeHtml(firstHeading.slice(0, 80)) : `Page ${i + 1}`;
    files[`OEBPS/p${i + 1}.xhtml`] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>${label}</title><link rel="stylesheet" href="style.css" type="text/css"/></head>
<body><section id="page${i + 1}">
${body || '<p></p>'}
</section></body></html>`);
    manifest.push(`<item id="p${i + 1}" href="p${i + 1}.xhtml" media-type="application/xhtml+xml"/>`);
    toc.push(`<li><a href="p${i + 1}.xhtml">${label}</a></li>`);
  });
  const t = escapeHtml(title);
  files['OEBPS/nav.xhtml'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head><meta charset="utf-8"/><title>${t}</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${toc.join('')}</ol></nav></body></html>`);
  files['OEBPS/style.css'] = strToU8('body{font-family:serif;line-height:1.5;margin:0 5%}h1,h2,h3{font-family:sans-serif;line-height:1.25}.center{text-align:center}figure{margin:1em 0;text-align:center}img{max-width:100%;height:auto}');
  const uid = `urn:uuid:${crypto.randomUUID()}`;
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">${uid}</dc:identifier><dc:title>${t}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${manifest.join('')}</manifest>
<spine>${pages.map((_, i) => `<itemref idref="p${i + 1}"/>`).join('')}</spine>
</package>`);
  // The mimetype entry must be first and stored uncompressed (EPUB OCF).
  const ordered = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }] as [Uint8Array, { level: 0 }],
    'META-INF/container.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    ...files,
  };
  return { epub: zipSync(ordered), pages: pages.length, textPages: pages.filter(p => p.hasText).length, images };
}
