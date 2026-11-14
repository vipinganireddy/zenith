/* Vector flattening: bake form fields and annotations into the page content.

   Text stays real text. Form fields go through pdf-lib's form.flatten(); every
   other annotation with an appearance stream (highlights, stamps, ink, notes,
   free text…) is drawn into the page as a Form XObject at its /Rect, following
   PDF 32000-1 §12.5.5 (BBox transformed by /Matrix, then fitted to /Rect), and
   the annotation is removed. Links are kept so they stay clickable. */
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFRef, PDFStream,
  pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject,
  type PDFObject,
} from 'pdf-lib';

export interface FlattenResult { fields: number; annotations: number; formError?: string }

const N = (s: string) => PDFName.of(s);

function nums(doc: PDFDocument, obj: PDFObject | undefined): number[] | null {
  const v = obj instanceof PDFRef ? doc.context.lookup(obj) : obj;
  if (!(v instanceof PDFArray)) return null;
  return v.asArray().map(x => {
    const n = x instanceof PDFRef ? doc.context.lookup(x) : x;
    return n instanceof PDFNumber ? n.asNumber() : 0;
  });
}

/** Map the appearance's BBox (after its /Matrix) onto the annotation /Rect. */
function placement(bbox: number[], m: number[], rect: number[]): number[] {
  const pts = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[0], bbox[3]], [bbox[2], bbox[3]]]
    .map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const bx1 = Math.min(...xs), bx2 = Math.max(...xs), by1 = Math.min(...ys), by2 = Math.max(...ys);
  const [rx1, ry1, rx2, ry2] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
  const sx = bx2 - bx1 > 0 ? (rx2 - rx1) / (bx2 - bx1) : 1;
  const sy = by2 - by1 > 0 ? (ry2 - ry1) / (by2 - by1) : 1;
  return [sx, 0, 0, sy, rx1 - bx1 * sx, ry1 - by1 * sy];
}

export async function flattenVector(doc: PDFDocument): Promise<FlattenResult> {
  const result: FlattenResult = { fields: 0, annotations: 0 };

  // 1. Form fields. Regenerated appearances can fail on characters Helvetica
  //    can't encode; fall back to the appearances already in the file.
  try {
    const form = doc.getForm();
    result.fields = form.getFields().length;
    if (result.fields) {
      try { form.flatten(); } catch { form.flatten({ updateFieldAppearances: false }); }
    }
  } catch (e) {
    result.formError = e instanceof Error ? e.message : String(e);
  }

  // 2. Every other annotation with a normal appearance.
  const ctx = doc.context;
  for (const page of doc.getPages()) {
    const annots = page.node.lookup(N('Annots'));
    if (!(annots instanceof PDFArray)) continue;
    const keep: PDFObject[] = [];
    let n = 0;
    for (const entry of annots.asArray()) {
      const annot = entry instanceof PDFRef ? ctx.lookup(entry) : entry;
      if (!(annot instanceof PDFDict)) continue;
      const subtype = annot.lookup(N('Subtype'));
      if (subtype === N('Link') || subtype === N('Popup')) {
        if (subtype === N('Link')) keep.push(entry);
        continue;
      }
      const flags = (annot.lookup(N('F')) as PDFNumber | undefined)?.asNumber() ?? 0;
      if (flags & 2) continue; // Hidden: drop without drawing
      const ap = annot.lookup(N('AP'));
      let normal = ap instanceof PDFDict ? ap.get(N('N')) : undefined;
      // State-dependent appearance (checkboxes, toggles): pick the current /AS.
      const normalObj = normal instanceof PDFRef ? ctx.lookup(normal) : normal;
      if (normalObj instanceof PDFDict && !(normalObj instanceof PDFStream)) {
        const as = annot.lookup(N('AS'));
        normal = as instanceof PDFName ? normalObj.get(as) : undefined;
      }
      const stream = normal instanceof PDFRef ? ctx.lookup(normal) : normal;
      const rect = nums(doc, annot.get(N('Rect')));
      if (!(stream instanceof PDFStream) || !rect) continue; // nothing visible to bake in
      const ref = normal instanceof PDFRef ? normal : ctx.register(stream);
      const bbox = nums(doc, stream.dict.get(N('BBox'))) ?? [0, 0, 1, 1];
      const matrix = nums(doc, stream.dict.get(N('Matrix'))) ?? [1, 0, 0, 1, 0, 0];
      const [a, b, c, d, e, f] = placement(bbox, matrix, rect);
      const name = page.node.newXObject(`Flat${n++}`, ref);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(a, b, c, d, e, f), drawObject(name), popGraphicsState());
      result.annotations++;
    }
    if (keep.length) page.node.set(N('Annots'), ctx.obj(keep));
    else page.node.delete(N('Annots'));
  }
  return result;
}
