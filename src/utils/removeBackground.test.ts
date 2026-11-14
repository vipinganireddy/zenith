// Self-check for Remove Background.
//   node --test src/utils/removeBackground.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { removePlainBackground, borderColor } = await import('./removeBackground.ts');

/** 20×20 white image with a red 8×8 square in the middle and a white 2×2 hole inside it. */
function fixture() {
  const w = 20, h = 20, data = new Uint8ClampedArray(w * h * 4).fill(255);
  const set = (x: number, y: number, [r, g, b]: number[]) => { const i = (y * w + x) * 4; data[i] = r; data[i + 1] = g; data[i + 2] = b; };
  for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) set(x, y, [200, 30, 30]);
  for (let y = 9; y < 11; y++) for (let x = 9; x < 11; x++) set(x, y, [255, 255, 255]);
  return { width: w, height: h, data, colorSpace: 'srgb' } as unknown as ImageData;
}
const alpha = (img: ImageData, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

test('detects the border colour', () => {
  assert.deepEqual(borderColor(fixture()), [255, 255, 255]);
});

test('clears the connected background, keeps the subject and enclosed white', () => {
  const img = fixture();
  removePlainBackground(img, { tolerance: 12, feather: 10 });
  assert.equal(alpha(img, 0, 0), 0);
  assert.equal(alpha(img, 5, 10), 0);
  assert.equal(alpha(img, 7, 7), 255, 'subject kept');
  assert.equal(alpha(img, 9, 9), 255, 'white enclosed by the subject is not background');
});

test('"everywhere" also clears background colour enclosed by the subject', () => {
  const img = fixture();
  removePlainBackground(img, { tolerance: 12, feather: 0, everywhere: true });
  assert.equal(alpha(img, 9, 9), 0);
  assert.equal(alpha(img, 7, 7), 255);
});
