import assert from 'node:assert/strict';
import test from 'node:test';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16) as unknown as number;
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id);
}

const {
  handleGlassMouseMove,
  handleGlassMouseDown,
  handleGlassMouseUp,
  handleGlassMouseLeave,
  resetGlassPhysics,
} = await import('./glassPhysics.ts');

test('handleGlassMouseMove updates transforms and css properties with zero-lag follower', async () => {
  const styles: Record<string, string> = {};
  const mockElement = {
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 100 }),
    style: {
      setProperty: (k: string, v: string) => { styles[k] = v; },
      transform: '',
      transition: '',
    },
  } as unknown as HTMLElement;

  const mockEvent = {
    currentTarget: mockElement,
    clientX: 200, // exact center
    clientY: 150, // exact center
  };

  handleGlassMouseMove(mockEvent, { maxTilt: 3, lift: 3 });

  // Spotlights update synchronously
  assert.equal(styles['--mouse-x'], '100.0px');
  assert.equal(styles['--mouse-y'], '50.0px');
  assert.equal(styles['--glare-opacity'], '1');

  // Wait for RAF step
  await new Promise((r) => setTimeout(r, 40));

  assert.match(mockElement.style.transform, /perspective\(1000px\)/);
  assert.match(mockElement.style.transform, /translate3d\(/);

  resetGlassPhysics(mockElement);
});

test('handleGlassMouseDown and handleGlassMouseUp handle tactile click squish', async () => {
  const mockElement = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: {
      setProperty: () => {},
      transform: '',
      transition: '',
    },
  } as unknown as HTMLElement;

  handleGlassMouseDown({ currentTarget: mockElement }, { pressedScale: 0.98 });
  await new Promise((r) => setTimeout(r, 40));

  // Should have compressed scale in transform
  assert.match(mockElement.style.transform, /scale3d\(0\.9/);

  handleGlassMouseUp({ currentTarget: mockElement });
  await new Promise((r) => setTimeout(r, 40));

  resetGlassPhysics(mockElement);
});

test('handleGlassMouseLeave resets transforms and clears glare', async () => {
  const styles: Record<string, string> = { '--glare-opacity': '1' };
  const mockElement = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    style: {
      setProperty: (k: string, v: string) => { styles[k] = v; },
      transform: 'rotateX(2deg)',
      transition: '',
    },
  } as unknown as HTMLElement;

  handleGlassMouseMove({ currentTarget: mockElement, clientX: 20, clientY: 20 });
  await new Promise((r) => setTimeout(r, 20));

  handleGlassMouseLeave({ currentTarget: mockElement });

  assert.equal(styles['--glare-opacity'], '0');
  assert.equal(styles['--mouse-x'], '-999px');

  resetGlassPhysics(mockElement);
});
