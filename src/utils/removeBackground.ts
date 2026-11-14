/* Remove a plain background from an image, entirely in the browser.

   The background colour is estimated from the image border; every pixel connected
   to the border whose colour is within `tolerance` of it is made transparent (a
   flood fill, so a white shirt in the middle of a white-background photo survives).
   Pixels just outside the tolerance fade out over `feather` for a clean edge.
   Busy photographic backgrounds need a segmentation model — this is deliberately
   the plain-background case (product shots, logos, signatures, scans). */

export interface BackgroundOptions {
  tolerance: number; feather: number; color?: [number, number, number];
  /** Also clear matching areas enclosed by the subject (the inside of an "O" in a logo). */
  everywhere?: boolean;
}

/** Median colour of the outermost pixels — robust to a few stray border pixels. */
export function borderColor(img: ImageData): [number, number, number] {
  const { width: w, height: h, data } = img;
  const r: number[] = [], g: number[] = [], b: number[] = [];
  const add = (x: number, y: number) => { const i = (y * w + x) * 4; if (data[i + 3] > 0) { r.push(data[i]); g.push(data[i + 1]); b.push(data[i + 2]); } };
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += step) { add(0, y); add(w - 1, y); }
  const med = (a: number[]) => { if (!a.length) return 255; a.sort((p, q) => p - q); return a[a.length >> 1]; };
  return [med(r), med(g), med(b)];
}

/** Fraction of the border that is already transparent. */
export function transparentBorder(img: ImageData): number {
  const { width: w, height: h, data } = img;
  let n = 0, t = 0;
  const at = (x: number, y: number) => { n++; if (data[(y * w + x) * 4 + 3] < 16) t++; };
  for (let x = 0; x < w; x++) { at(x, 0); at(x, h - 1); }
  for (let y = 0; y < h; y++) { at(0, y); at(w - 1, y); }
  return t / n;
}

/** Returns the number of pixels made (fully or partly) transparent. Mutates `img`. */
export function removePlainBackground(img: ImageData, opts: BackgroundOptions): number {
  const { width: w, height: h, data } = img;
  const [br, bg, bb] = opts.color ?? borderColor(img);
  const tol = opts.tolerance, soft = tol + Math.max(0, opts.feather);
  const dist = (p: number) => {
    const i = p * 4;
    // Redmean-weighted RGB distance: cheap and closer to perceived difference than plain RGB.
    const rm = (data[i] + br) / 2, dr = data[i] - br, dg = data[i + 1] - bg, db = data[i + 2] - bb;
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 3;
  };
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0, changed = 0;
  const push = (p: number) => { if (!seen[p]) { seen[p] = 1; stack[top++] = p; } };
  if (opts.everywhere) for (let p = 0; p < w * h; p++) push(p);
  else {
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  }
  while (top) {
    const p = stack[--top];
    if (data[p * 4 + 3] === 0) { // already transparent: part of the background, keep spreading
      const x = p % w;
      if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (p >= w) push(p - w); if (p < w * (h - 1)) push(p + w);
      continue;
    }
    const d = dist(p);
    if (d > soft) continue;
    const a = p * 4 + 3;
    if (d <= tol) {
      data[a] = 0;
      const x = p % w;
      if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (p >= w) push(p - w); if (p < w * (h - 1)) push(p + w);
    } else {
      // Edge band: partial transparency, and do not spread further into the subject.
      data[a] = Math.round(data[a] * (d - tol) / (soft - tol));
    }
    changed++;
  }
  return changed;
}
