import React, { useEffect, useRef } from 'react';

export interface FluxPrismCanvasProps {
  className?: string;
  theme?: 'light' | 'dark' | 'system';
}

interface BoundaryNode {
  restX: number;
  x: number;
}

interface ColumnState {
  energy: number;
  beamY: number;
}

interface StarParticle {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speed: number;
  phase: number;
}

export const FluxPrismCanvas: React.FC<FluxPrismCanvasProps> = ({ className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let isRunning = true;
    let width = window.innerWidth;
    let height = window.innerHeight;

    // Adaptive Column Density based on viewport width
    const getNumCols = (w: number) => (w < 640 ? 28 : w < 1024 ? 42 : 56);
    let numCols = getNumCols(width);

    const mouse = {
      x: width * 0.5,
      y: height * 0.45,
      prevX: width * 0.5,
      prevY: height * 0.45,
      smoothX: width * 0.5,
      smoothY: height * 0.45,
      ambientX: width * 0.5,
      ambientY: height * 0.45,
      vx: 0,
      vy: 0,
      speed: 0,
      isActive: false,
    };

    let nodes: BoundaryNode[] = [];
    let cols: ColumnState[] = [];

    const initLattice = (nCols: number) => {
      if (width <= 0 || nCols <= 0) return;
      const colW = width / nCols;
      nodes = Array.from({ length: nCols + 1 }, (_, i) => ({
        restX: i * colW,
        x: i * colW,
      }));
      cols = Array.from({ length: nCols }, () => ({
        energy: 0,
        beamY: height * 0.5,
      }));
    };

    const stars: StarParticle[] = Array.from({ length: 85 }, () => ({
      baseX: Math.random(),
      baseY: Math.random(),
      x: 0,
      y: 0,
      radius: 0.6 + Math.random() * 1.1,
      alpha: 0.15 + Math.random() * 0.3,
      speed: 0.5 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
    }));

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      if (width <= 0 || height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      numCols = getNumCols(width);
      initLattice(numCols);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.isActive = true;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
        mouse.isActive = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        mouse.x = e.touches[0].clientX;
        mouse.y = e.touches[0].clientY;
        mouse.isActive = true;
      }
    };

    const handlePointerLeave = () => {
      mouse.isActive = false;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isRunning = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
      } else {
        if (!isRunning) {
          isRunning = true;
          mouse.prevX = mouse.x;
          mouse.prevY = mouse.y;
          mouse.vx = 0;
          mouse.vy = 0;
          animationFrameId = requestAnimationFrame(render);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handlePointerLeave);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handlePointerLeave, { passive: true });
    window.addEventListener('touchcancel', handlePointerLeave, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    let time = 0;

    const render = () => {
      if (!isRunning) return;
      if (width <= 0 || height <= 0 || numCols <= 0 || nodes.length < numCols + 1) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      time += 0.016;

      // Directional velocity tracking (critically damped — zero oscillation)
      const rawVx = Math.max(-45, Math.min(45, mouse.x - mouse.prevX));
      const rawVy = Math.max(-45, Math.min(45, mouse.y - mouse.prevY));
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;

      // Smooth directional velocity vector
      mouse.vx += (rawVx - mouse.vx) * 0.12;
      mouse.vy += (rawVy - mouse.vy) * 0.12;

      // If pointer is inactive (mouse left window or finger lifted), smoothly decay velocity
      if (!mouse.isActive) {
        mouse.vx *= 0.85;
        mouse.vy *= 0.85;
        if (Math.abs(mouse.vx) < 0.01) mouse.vx = 0;
        if (Math.abs(mouse.vy) < 0.01) mouse.vy = 0;
      }

      mouse.speed = Math.hypot(mouse.vx, mouse.vy);

      // Cursor follower for local tiles (responsive, slow & smooth) + background glow
      mouse.smoothX += (mouse.x - mouse.smoothX) * 0.09;
      mouse.smoothY += (mouse.y - mouse.smoothY) * 0.09;
      mouse.ambientX += (mouse.x - mouse.ambientX) * 0.03;
      mouse.ambientY += (mouse.y - mouse.ambientY) * 0.03;

      const isLight =
        document.documentElement.classList.contains('light') ||
        document.documentElement.getAttribute('data-theme') === 'light';

      // 1. Base Cosmic Midnight Background (#030511)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = isLight ? '#EEF4F9' : '#030511';
      ctx.fillRect(0, 0, width, height);

      const offsetX = (mouse.ambientX / width - 0.5) * width * 0.2;
      const offsetY = (mouse.ambientY / height - 0.5) * height * 0.15;

      // 2. Central Electric Blue Volumetric Bloom
      const blueX = width * 0.5 + offsetX * 0.75;
      const blueY = height * 0.36 + offsetY * 0.65;
      const blueRadius = Math.max(width, height) * 0.58;
      const blueGrad = ctx.createRadialGradient(blueX, blueY, 0, blueX, blueY, blueRadius);
      if (isLight) {
        blueGrad.addColorStop(0, 'rgba(2, 151, 222, 0.22)');
        blueGrad.addColorStop(0.45, 'rgba(0, 81, 255, 0.10)');
        blueGrad.addColorStop(1, 'rgba(238, 244, 249, 0)');
      } else {
        blueGrad.addColorStop(0, 'rgba(2, 151, 222, 0.35)');
        blueGrad.addColorStop(0.38, 'rgba(0, 81, 255, 0.22)');
        blueGrad.addColorStop(0.72, 'rgba(10, 22, 55, 0.10)');
        blueGrad.addColorStop(1, 'rgba(3, 5, 17, 0)');
      }
      ctx.fillStyle = blueGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Lower-Center Solar Coral Horizon Bloom
      const coralX = width * 0.5 + offsetX * 0.45;
      const coralY = height * 0.88 + offsetY * 0.35;
      const coralRadius = Math.max(width, height) * 0.52;
      const coralGrad = ctx.createRadialGradient(coralX, coralY, 0, coralX, coralY, coralRadius);
      if (isLight) {
        coralGrad.addColorStop(0, 'rgba(255, 107, 66, 0.18)');
        coralGrad.addColorStop(0.48, 'rgba(255, 154, 118, 0.08)');
        coralGrad.addColorStop(1, 'rgba(238, 244, 249, 0)');
      } else {
        coralGrad.addColorStop(0, 'rgba(255, 107, 66, 0.36)');
        coralGrad.addColorStop(0.36, 'rgba(215, 90, 95, 0.22)');
        coralGrad.addColorStop(0.7, 'rgba(95, 55, 90, 0.08)');
        coralGrad.addColorStop(1, 'rgba(3, 5, 17, 0)');
      }
      ctx.fillStyle = coralGrad;
      ctx.fillRect(0, 0, width, height);

      // 4. Twinkling Background Stars with Directional Parallax
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const targetX = s.baseX * width - offsetX * 0.09;
        const targetY = s.baseY * height - offsetY * 0.09;
        s.x = s.x === 0 ? targetX : s.x + (targetX - s.x) * 0.08;
        s.y = s.y === 0 ? targetY : s.y + (targetY - s.y) * 0.08;

        const twinkle = 0.65 + 0.35 * Math.sin(time * s.speed + s.phase);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = isLight
          ? `rgba(15, 23, 42, ${s.alpha * twinkle * 0.5})`
          : `rgba(255, 255, 255, ${s.alpha * twinkle})`;
        ctx.fill();
      }

      // 5. Critically-Damped Directional Physics for Hovered Tile & Immediate Neighbors ONLY
      const baseColW = width / numCols;
      // Tight radius (~4.2 columns wide) so ONLY the hovered tile and immediate neighbors react
      const localRadius = baseColW * 4.2;

      nodes[0].x = 0;
      nodes[numCols].x = width;

      for (let i = 1; i < numCols; i++) {
        const node = nodes[i];
        const dist = node.restX - mouse.smoothX;
        const absDist = Math.abs(dist);

        let targetOffset = 0;
        if (absDist < localRadius && mouse.isActive) {
          // Smooth raised-cosine bell window (1.0 at cursor, smoothly 0 outside localRadius)
          const t = absDist / localRadius;
          const localMask = 0.5 * (1 + Math.cos(t * Math.PI));

          // A. Directional Shear: tiles move in the exact horizontal direction of cursor motion
          const directionalPush = mouse.vx * 1.15 * localMask;

          // B. Subtle Optical Hover Expansion: hovered tile gently opens up by 22%
          const hoverExpand = Math.sin((dist / localRadius) * Math.PI) * (baseColW * 0.22) * localMask;

          targetOffset = directionalPush + hoverExpand;
        }

        const targetX = node.restX + targetOffset;
        // Pure exponential critical damping (0.12) -> ZERO jiggle, ZERO bounce
        node.x += (targetX - node.x) * 0.12;
      }

      // Guarantee monotonic non-overlapping boundaries (zero gaps)
      const minW = baseColW * 0.55;
      for (let i = 1; i < numCols; i++) {
        if (nodes[i].x < nodes[i - 1].x + minW) {
          nodes[i].x = nodes[i - 1].x + minW;
        }
      }

      // 6. Render Hovered & Neighboring Vertical Glass Tiles
      for (let i = 0; i < numCols; i++) {
        const leftX = nodes[i].x;
        const rightX = nodes[i + 1].x;
        const w = rightX - leftX;
        const centerX = leftX + w * 0.5;
        const col = cols[i];

        const distFromCursor = Math.abs(centerX - mouse.smoothX);
        const isNear = distFromCursor < localRadius && mouse.isActive;
        const localInfluence = isNear
          ? 0.5 * (1 + Math.cos((distFromCursor / localRadius) * Math.PI))
          : 0;

        // Critically-damped energy and vertical light tracking cursor Y & vertical direction (vy)
        const targetEnergy = localInfluence * (0.65 + Math.min(0.35, mouse.speed * 0.015));
        col.energy += (targetEnergy - col.energy) * 0.10;

        const targetBeamY = mouse.smoothY + mouse.vy * 2.2;
        col.beamY += (targetBeamY - col.beamY) * (0.06 + localInfluence * 0.08);

        const energy = col.energy;
        const distToCenter = Math.abs(centerX - width * 0.5) / (width * 0.5);
        const centerMask = Math.max(0.28, 1 - distToCenter * 0.72);

        // Tile surface gradient
        const tileGrad = ctx.createLinearGradient(leftX, 0, rightX, 0);
        const baseAlpha = (0.018 + energy * 0.075) * centerMask;

        if (isLight) {
          tileGrad.addColorStop(0, `rgba(255, 255, 255, ${baseAlpha * 1.8})`);
          tileGrad.addColorStop(0.5, `rgba(2, 151, 222, ${energy * 0.06})`);
          tileGrad.addColorStop(1, 'rgba(15, 23, 42, 0.025)');
        } else {
          tileGrad.addColorStop(0, `rgba(255, 255, 255, ${baseAlpha})`);
          tileGrad.addColorStop(0.45, `rgba(56, 189, 248, ${energy * 0.065})`);
          tileGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
        }
        ctx.fillStyle = tileGrad;
        ctx.fillRect(leftX, 0, w + 0.4, height);

        // Directional Vertical Light Follow inside the active hovered tiles only
        if (energy > 0.01) {
          const beamSpan = 240 + energy * 140;
          const vGrad = ctx.createLinearGradient(
            0,
            col.beamY - beamSpan,
            0,
            col.beamY + beamSpan
          );
          if (isLight) {
            vGrad.addColorStop(0, 'rgba(2, 151, 222, 0)');
            vGrad.addColorStop(0.5, `rgba(2, 151, 222, ${energy * 0.11})`);
            vGrad.addColorStop(1, 'rgba(255, 107, 66, 0)');
          } else {
            vGrad.addColorStop(0, 'rgba(2, 151, 222, 0)');
            vGrad.addColorStop(0.48, `rgba(56, 189, 248, ${energy * 0.13})`);
            vGrad.addColorStop(0.78, `rgba(255, 107, 66, ${energy * 0.07})`);
            vGrad.addColorStop(1, 'rgba(3, 5, 17, 0)');
          }
          ctx.fillStyle = vGrad;
          ctx.fillRect(leftX, 0, w + 0.4, height);
        }

        // Crisp 1px vertical edge line
        const edgeGrad = ctx.createLinearGradient(0, 0, 0, height);
        const peakY = Math.max(0.06, Math.min(0.94, col.beamY / height));
        const edgeAlpha = 0.022 + energy * 0.16;

        if (isLight) {
          edgeGrad.addColorStop(0, 'rgba(15, 23, 42, 0.02)');
          edgeGrad.addColorStop(peakY, `rgba(2, 151, 222, ${0.045 + energy * 0.18})`);
          edgeGrad.addColorStop(1, 'rgba(15, 23, 42, 0.02)');
        } else {
          edgeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.015)');
          edgeGrad.addColorStop(peakY, `rgba(185, 235, 255, ${edgeAlpha})`);
          edgeGrad.addColorStop(1, 'rgba(255, 160, 130, 0.018)');
        }
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(leftX, 0, 1, height);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handlePointerLeave);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handlePointerLeave);
      window.removeEventListener('touchcancel', handlePointerLeave);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none z-0 ${className}`.trim()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
};

export default FluxPrismCanvas;
