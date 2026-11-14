/* PPTX → HTML slides (one fixed-size <section class="slide"> per slide), for
   htmlToPdf(..., { pageSelector: 'section.slide' }).

   Covers what most business decks use: slide size and backgrounds; text boxes
   and placeholders (positions inherited from the layout/master when the slide
   doesn't set them) with font size, bold/italic/underline, colour, alignment,
   bullets and vertical anchoring; pictures; solid shape fills and outlines;
   grouped shapes; tables. Not covered: charts, SmartArt, gradients, theme-only
   colours and animations — those parts are skipped, never invented. */
import { unzipSync, strFromU8 } from 'fflate';
import { escapeHtml } from './htmlToPdf';

const EMU_PER_PX = 9525; // 914400 EMU per inch / 96 px per inch
const NS = {
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
};

type Zip = Record<string, Uint8Array>;
interface Box { x: number; y: number; w: number; h: number }
interface Placeholder { box?: Box; type: string; idx: string }

const parse = (zip: Zip, path: string) => zip[path] ? new DOMParser().parseFromString(strFromU8(zip[path]), 'application/xml') : null;
const kids = (el: Element | null | undefined, ns: string, name: string) => el ? [...el.children].filter(c => c.namespaceURI === ns && c.localName === name) : [];
const kid = (el: Element | null | undefined, ns: string, name: string) => kids(el, ns, name)[0] ?? null;
const deep = (el: Element | Document | null | undefined, ns: string, name: string) => el ? [...el.getElementsByTagNameNS(ns, name)] : [];

function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function rels(zip: Zip, partPath: string): Record<string, string> {
  const dir = partPath.split('/').slice(0, -1).join('/');
  const name = partPath.split('/').pop();
  const doc = parse(zip, `${dir}/_rels/${name}.rels`);
  const out: Record<string, string> = {};
  doc?.querySelectorAll('Relationship').forEach(r => {
    if (r.getAttribute('TargetMode') !== 'External') out[r.getAttribute('Id')!] = resolve(partPath, r.getAttribute('Target')!);
  });
  return out;
}

function xfrm(sp: Element): Box | undefined {
  const x = deep(sp, NS.a, 'xfrm')[0];
  const off = kid(x, NS.a, 'off'), ext = kid(x, NS.a, 'ext');
  if (!off || !ext) return undefined;
  return { x: +off.getAttribute('x')! / EMU_PER_PX, y: +off.getAttribute('y')! / EMU_PER_PX, w: +ext.getAttribute('cx')! / EMU_PER_PX, h: +ext.getAttribute('cy')! / EMU_PER_PX };
}

function placeholderOf(sp: Element): { type: string; idx: string } | null {
  const ph = deep(sp, NS.p, 'ph')[0];
  return ph ? { type: ph.getAttribute('type') ?? 'body', idx: ph.getAttribute('idx') ?? '' } : null;
}

function placeholders(doc: Document | null): Placeholder[] {
  if (!doc) return [];
  return deep(doc, NS.p, 'sp').flatMap(sp => {
    const ph = placeholderOf(sp);
    return ph ? [{ ...ph, box: xfrm(sp) }] : [];
  });
}

const color = (el: Element | null | undefined) => {
  const c = deep(el, NS.a, 'srgbClr')[0]?.getAttribute('val');
  return c ? `#${c}` : null;
};

function solidFill(spPr: Element | null): string | null {
  const f = kid(spPr, NS.a, 'solidFill');
  return f ? color(f) : null;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', emf: 'image/x-emf', wmf: 'image/x-wmf', tif: 'image/tiff', tiff: 'image/tiff' };
function dataUrl(bytes: Uint8Array, path: string): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream'};base64,${btoa(s)}`;
}

/** Default text size (pt) when a run doesn't say — PowerPoint's standard template sizes. */
function defaultSize(phType: string | undefined, level: number): number {
  if (phType === 'title' || phType === 'ctrTitle') return 44;
  if (phType === 'subTitle') return 24;
  if (phType === 'body' || phType === 'obj') return [28, 24, 20, 20, 20][Math.min(level, 4)];
  return 18;
}

function textBody(txBody: Element, phType: string | undefined, slideNum: number): { html: string; anchor: string } {
  const bodyPr = kid(txBody, NS.a, 'bodyPr');
  const anchor = bodyPr?.getAttribute('anchor') ?? (phType === 'title' || phType === 'ctrTitle' ? 'ctr' : 't');
  const bulleted = phType === 'body' || phType === 'obj';
  const paras = kids(txBody, NS.a, 'p').map(p => {
    const pPr = kid(p, NS.a, 'pPr');
    const level = +(pPr?.getAttribute('lvl') ?? 0);
    const algn = pPr?.getAttribute('algn');
    const align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' ? 'justify'
      : phType === 'ctrTitle' || phType === 'subTitle' ? 'center' : 'left';
    let html = '';
    let size = defaultSize(phType, level);
    for (const node of [...p.children]) {
      if (node.namespaceURI !== NS.a) continue;
      if (node.localName === 'br') { html += '<br>'; continue; }
      if (node.localName !== 'r' && node.localName !== 'fld') continue;
      const rPr = kid(node, NS.a, 'rPr');
      let text = kid(node, NS.a, 't')?.textContent ?? '';
      if (node.localName === 'fld' && node.getAttribute('type') === 'slidenum') text = String(slideNum);
      const sz = rPr?.getAttribute('sz');
      if (sz) size = +sz / 100;
      const styles = [`font-size:${size}pt`];
      if (rPr?.getAttribute('b') === '1') styles.push('font-weight:bold');
      if (rPr?.getAttribute('i') === '1') styles.push('font-style:italic');
      if (rPr?.getAttribute('u') && rPr.getAttribute('u') !== 'none') styles.push('text-decoration:underline');
      const c = color(kid(rPr, NS.a, 'solidFill'));
      if (c) styles.push(`color:${c}`);
      const latin = kid(rPr, NS.a, 'latin')?.getAttribute('typeface');
      if (latin && !latin.startsWith('+')) styles.push(`font-family:'${latin.replace(/'/g, '')}',Arial,sans-serif`);
      html += `<span style="${styles.join(';')}">${escapeHtml(text)}</span>`;
    }
    const buNone = !!kid(pPr, NS.a, 'buNone');
    const buChar = kid(pPr, NS.a, 'buChar')?.getAttribute('char');
    const hasBullet = !!html && (buChar || (bulleted && !buNone));
    const marker = hasBullet ? `<span style="position:absolute;left:-0.9em">${escapeHtml(buChar ?? '•')}</span>` : '';
    const indent = level * 1.2 + (hasBullet ? 1 : 0);
    return `<p style="margin:0 0 0.25em ${indent}em;position:relative;text-align:${align};font-size:${size}pt;line-height:1.15">${marker}${html || '&nbsp;'}</p>`;
  });
  return { html: paras.join(''), anchor };
}

function renderShapes(tree: Element, zip: Zip, partPath: string, inherited: Placeholder[], slideNum: number, map: (b: Box) => Box): string {
  const relMap = rels(zip, partPath);
  let out = '';
  for (const el of [...tree.children]) {
    if (el.namespaceURI !== NS.p) continue;
    if (el.localName === 'grpSp') {
      // Child coordinates are relative to chOff/chExt, scaled into the group's box.
      const gx = deep(kid(el, NS.p, 'grpSpPr'), NS.a, 'xfrm')[0];
      const off = kid(gx, NS.a, 'off'), ext = kid(gx, NS.a, 'ext'), chOff = kid(gx, NS.a, 'chOff'), chExt = kid(gx, NS.a, 'chExt');
      if (off && ext && chOff && chExt) {
        const sx = +ext.getAttribute('cx')! / Math.max(1, +chExt.getAttribute('cx')!), sy = +ext.getAttribute('cy')! / Math.max(1, +chExt.getAttribute('cy')!);
        const ox = +off.getAttribute('x')!, oy = +off.getAttribute('y')!, cx = +chOff.getAttribute('x')!, cy = +chOff.getAttribute('y')!;
        const inner = (b: Box) => map({ x: (ox + (b.x * EMU_PER_PX - cx) * sx) / EMU_PER_PX, y: (oy + (b.y * EMU_PER_PX - cy) * sy) / EMU_PER_PX, w: b.w * sx, h: b.h * sy });
        out += renderShapes(el, zip, partPath, inherited, slideNum, inner);
      }
      continue;
    }
    if (el.localName === 'sp') {
      const ph = placeholderOf(el);
      let box = xfrm(el);
      // Layouts often inherit too, so take the first ancestor that actually has a position.
      const positioned = inherited.filter(p => p.box);
      if (!box && ph) box = (positioned.find(p => ph.idx && p.idx === ph.idx) ?? positioned.find(p => p.type === ph.type)
        ?? positioned.find(p => (ph.type === 'ctrTitle' && p.type === 'title') || (ph.type === 'subTitle' && p.type === 'body')))?.box;
      if (!box) continue;
      const b = map(box);
      const spPr = kid(el, NS.p, 'spPr');
      const fill = solidFill(spPr);
      const ln = kid(spPr, NS.a, 'ln');
      const lnColor = ln && !kid(ln, NS.a, 'noFill') ? color(kid(ln, NS.a, 'solidFill')) : null;
      const geom = kid(spPr, NS.a, 'prstGeom')?.getAttribute('prst');
      const radius = geom === 'ellipse' ? '50%' : geom === 'roundRect' ? '8%' : '0';
      const tx = kid(el, NS.p, 'txBody');
      const { html, anchor } = tx ? textBody(tx, ph?.type, slideNum) : { html: '', anchor: 't' };
      if (!html && !fill && !lnColor) continue;
      const justify = anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start';
      out += `<div style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;box-sizing:border-box;padding:4px 8px;display:flex;flex-direction:column;justify-content:${justify};overflow:hidden;border-radius:${radius};${fill ? `background:${fill};` : ''}${lnColor ? `border:1px solid ${lnColor};` : ''}">${html}</div>`;
      continue;
    }
    if (el.localName === 'pic') {
      const box = xfrm(el);
      const id = deep(el, NS.a, 'blip')[0]?.getAttributeNS(NS.r, 'embed');
      const path = id ? relMap[id] : undefined;
      if (!box || !path || !zip[path]) continue;
      const b = map(box);
      out += `<img src="${dataUrl(zip[path], path)}" style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;object-fit:fill">`;
      continue;
    }
    if (el.localName === 'graphicFrame') {
      const tbl = deep(el, NS.a, 'tbl')[0];
      const off = deep(el, NS.a, 'off')[0], ext = deep(el, NS.a, 'ext')[0];
      if (!tbl || !off || !ext) continue;
      const b = map({ x: +off.getAttribute('x')! / EMU_PER_PX, y: +off.getAttribute('y')! / EMU_PER_PX, w: +ext.getAttribute('cx')! / EMU_PER_PX, h: +ext.getAttribute('cy')! / EMU_PER_PX });
      const rows = kids(tbl, NS.a, 'tr').map((tr, ri) => `<tr>${kids(tr, NS.a, 'tc').map(tc => {
        const fill = solidFill(kid(tc, NS.a, 'tcPr'));
        const body = kid(tc, NS.a, 'txBody');
        return `<td style="border:1px solid #9ca3af;padding:4px 6px;vertical-align:top;${fill ? `background:${fill};` : ri === 0 ? 'background:#e5e7eb;font-weight:bold;' : ''}">${body ? textBody(body, undefined, slideNum).html : ''}</td>`;
      }).join('')}</tr>`).join('');
      out += `<table style="position:absolute;left:${b.x}px;top:${b.y}px;width:${b.w}px;border-collapse:collapse;font-size:12pt">${rows}</table>`;
    }
  }
  return out;
}

export async function pptxToHtml(data: ArrayBuffer): Promise<{ html: string; slides: number }> {
  const zip = unzipSync(new Uint8Array(data));
  const pres = parse(zip, 'ppt/presentation.xml');
  if (!pres) throw new Error('Not a PowerPoint (.pptx) file.');
  const sz = deep(pres, NS.p, 'sldSz')[0];
  const W = +(sz?.getAttribute('cx') ?? 9144000) / EMU_PER_PX, H = +(sz?.getAttribute('cy') ?? 6858000) / EMU_PER_PX;
  const presRels = rels(zip, 'ppt/presentation.xml');
  const slidePaths = deep(pres, NS.p, 'sldId').map(s => presRels[s.getAttributeNS(NS.r, 'id') ?? '']).filter(Boolean);

  const sections = slidePaths.map((path, i) => {
    const slide = parse(zip, path);
    if (!slide) return '';
    const layoutPath = Object.values(rels(zip, path)).find(p => p.includes('slideLayouts/'));
    const layout = layoutPath ? parse(zip, layoutPath) : null;
    const masterPath = layoutPath ? Object.values(rels(zip, layoutPath)).find(p => p.includes('slideMasters/')) : undefined;
    const master = masterPath ? parse(zip, masterPath) : null;
    const inherited = [...placeholders(layout), ...placeholders(master)];
    const bg = [slide, layout, master].map(d => solidFill(deep(d, NS.p, 'bgPr')[0] ?? null)).find(Boolean) ?? '#ffffff';
    const tree = deep(slide, NS.p, 'spTree')[0];
    const body = tree ? renderShapes(tree, zip, path, inherited, i + 1, b => b) : '';
    return `<section class="slide" style="position:relative;width:${W}px;height:${H}px;min-height:${H}px;overflow:hidden;background:${bg};box-sizing:border-box;padding:0;margin:0;font-family:Arial,Helvetica,sans-serif;color:#000">${body}</section>`;
  });
  return { html: sections.join(''), slides: sections.length };
}
