import type React from 'react';

export interface GlassPhysicsOptions {
  maxTilt?: number;      // Maximum tilt in degrees (default 3deg)
  lift?: number;         // Hover lift in px (default 3px)
  hoverScale?: number;   // Scale on hover (default 1.01)
  pressedScale?: number; // Scale on click/squish (default 0.98)
  perspective?: number;  // Perspective distance (default 1000px)
}

export type GlassMouseMoveEvent = {
  currentTarget: HTMLElement;
  clientX: number;
  clientY: number;
  buttons?: number;
};

export type GlassMouseLeaveEvent = {
  currentTarget: HTMLElement;
};

export type GlassMousePressEvent = {
  currentTarget: HTMLElement;
};

interface CardPhysicsState {
  targetRx: number;
  targetRy: number;
  targetTranslateY: number;
  targetTranslateX: number;
  targetScale: number;

  currentRx: number;
  currentRy: number;
  currentTranslateY: number;
  currentTranslateX: number;
  currentScale: number;

  isHovered: boolean;
  isPressed: boolean;
  rafId: number | null;

  maxTilt: number;
  lift: number;
  hoverScale: number;
  pressedScale: number;
  perspective: number;
}

const cardStates = new WeakMap<HTMLElement, CardPhysicsState>();

function getOrCreateState(el: HTMLElement, options: GlassPhysicsOptions): CardPhysicsState {
  let state = cardStates.get(el);
  if (!state) {
    state = {
      targetRx: 0,
      targetRy: 0,
      targetTranslateY: 0,
      targetTranslateX: 0,
      targetScale: 1,

      currentRx: 0,
      currentRy: 0,
      currentTranslateY: 0,
      currentTranslateX: 0,
      currentScale: 1,

      isHovered: false,
      isPressed: false,
      rafId: null,

      maxTilt: options.maxTilt ?? 3,
      lift: options.lift ?? 3,
      hoverScale: options.hoverScale ?? 1.01,
      pressedScale: options.pressedScale ?? 0.98,
      perspective: options.perspective ?? 1000,
    };
    cardStates.set(el, state);
  } else {
    if (options.maxTilt !== undefined) state.maxTilt = options.maxTilt;
    if (options.lift !== undefined) state.lift = options.lift;
    if (options.hoverScale !== undefined) state.hoverScale = options.hoverScale;
    if (options.pressedScale !== undefined) state.pressedScale = options.pressedScale;
    if (options.perspective !== undefined) state.perspective = options.perspective;
  }
  return state;
}

function startSpringLoop(el: HTMLElement, state: CardPhysicsState) {
  if (state.rafId !== null) return;

  const step = () => {
    // Critically-damped spring lerp (0.12) as specified
    state.currentRx += (state.targetRx - state.currentRx) * 0.12;
    state.currentRy += (state.targetRy - state.currentRy) * 0.12;
    state.currentTranslateY += (state.targetTranslateY - state.currentTranslateY) * 0.12;
    state.currentTranslateX += (state.targetTranslateX - state.currentTranslateX) * 0.12;
    state.currentScale += (state.targetScale - state.currentScale) * 0.18;

    el.style.transform = `perspective(${state.perspective}px) rotateX(${state.currentRx.toFixed(3)}deg) rotateY(${state.currentRy.toFixed(3)}deg) translate3d(${state.currentTranslateX.toFixed(2)}px, ${state.currentTranslateY.toFixed(2)}px, 0) scale3d(${state.currentScale.toFixed(3)}, ${state.currentScale.toFixed(3)}, 1)`;

    const rxDiff = Math.abs(state.targetRx - state.currentRx);
    const ryDiff = Math.abs(state.targetRy - state.currentRy);
    const tyDiff = Math.abs(state.targetTranslateY - state.currentTranslateY);
    const txDiff = Math.abs(state.targetTranslateX - state.currentTranslateX);
    const scaleDiff = Math.abs(state.targetScale - state.currentScale);

    if (rxDiff < 0.01 && ryDiff < 0.01 && tyDiff < 0.015 && txDiff < 0.015 && scaleDiff < 0.001) {
      // Reached equilibrium
      state.currentRx = state.targetRx;
      state.currentRy = state.targetRy;
      state.currentTranslateY = state.targetTranslateY;
      state.currentTranslateX = state.targetTranslateX;
      state.currentScale = state.targetScale;

      if (!state.isHovered) {
        el.style.transform = '';
      } else {
        el.style.transform = `perspective(${state.perspective}px) rotateX(${state.currentRx.toFixed(3)}deg) rotateY(${state.currentRy.toFixed(3)}deg) translate3d(${state.currentTranslateX.toFixed(2)}px, ${state.currentTranslateY.toFixed(2)}px, 0) scale3d(${state.currentScale.toFixed(3)}, ${state.currentScale.toFixed(3)}, 1)`;
      }

      state.rafId = null;
      return;
    }

    state.rafId = requestAnimationFrame(step);
  };

  state.rafId = requestAnimationFrame(step);
}

/**
 * Butter-smooth cursor physics for floating glass tiles.
 * Updates CSS illumination variables instantaneously (zero lag) and drives 3D tilt via RAF spring interpolation.
 */
export const handleGlassMouseMove = (
  e: React.MouseEvent<HTMLElement> | GlassMouseMoveEvent,
  options: GlassPhysicsOptions = {}
) => {
  const el = e.currentTarget;
  if (!el || typeof el.getBoundingClientRect !== 'function') return;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Zero-lag real-time specular illumination follower
  el.style.setProperty('--mouse-x', `${x.toFixed(1)}px`);
  el.style.setProperty('--mouse-y', `${y.toFixed(1)}px`);
  el.style.setProperty('--card-x', `${x.toFixed(1)}px`);
  el.style.setProperty('--card-y', `${y.toFixed(1)}px`);
  el.style.setProperty('--glare-opacity', '1');

  const state = getOrCreateState(el, options);
  state.isHovered = true;

  if (e.buttons !== undefined) {
    state.isPressed = e.buttons === 1;
  }

  // Normalized offsets from center (-0.5 to 0.5)
  const normX = x / rect.width - 0.5;
  const normY = y / rect.height - 0.5;

  // Pitch (rotateX) & Roll (rotateY) up to ±3deg towards cursor
  state.targetRx = -normY * state.maxTilt;
  state.targetRy = normX * state.maxTilt;

  // Hover lift of 3px (translateY = -3px) with magnetic horizontal bias
  state.targetTranslateY = -state.lift + normY * 1.5;
  state.targetTranslateX = normX * 2.5;
  state.targetScale = state.isPressed ? state.pressedScale : state.hoverScale;

  startSpringLoop(el, state);
};

/**
 * Tactile mousedown compression ("squish" physics).
 */
export const handleGlassMouseDown = (
  e: React.MouseEvent<HTMLElement> | GlassMousePressEvent,
  options: GlassPhysicsOptions = {}
) => {
  const el = e.currentTarget;
  if (!el) return;
  const state = getOrCreateState(el, options);
  state.isPressed = true;
  state.targetScale = state.pressedScale;
  startSpringLoop(el, state);
};

/**
 * Release tactile compression back to hover scale.
 */
export const handleGlassMouseUp = (
  e: React.MouseEvent<HTMLElement> | GlassMousePressEvent,
  options: GlassPhysicsOptions = {}
) => {
  const el = e.currentTarget;
  if (!el) return;
  const state = getOrCreateState(el, options);
  state.isPressed = false;
  state.targetScale = state.isHovered ? state.hoverScale : 1;
  startSpringLoop(el, state);
};

/**
 * Spring-damper return to equilibrium when cursor leaves the card.
 */
export const handleGlassMouseLeave = (
  e: React.MouseEvent<HTMLElement> | GlassMouseLeaveEvent
) => {
  const el = e.currentTarget;
  if (!el) return;

  el.style.setProperty('--mouse-x', '-999px');
  el.style.setProperty('--mouse-y', '-999px');
  el.style.setProperty('--glare-opacity', '0');

  const state = cardStates.get(el);
  if (!state) {
    el.style.transform = '';
    return;
  }

  state.isHovered = false;
  state.isPressed = false;
  state.targetRx = 0;
  state.targetRy = 0;
  state.targetTranslateY = 0;
  state.targetTranslateX = 0;
  state.targetScale = 1;

  startSpringLoop(el, state);
};

export const resetGlassPhysics = (el: HTMLElement) => {
  const state = cardStates.get(el);
  if (state && state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  cardStates.delete(el);
  if (el.style) {
    el.style.transform = '';
  }
};
