import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Global Top & Bottom Viewport Progressive Scroll Blur Overlay
 * Sits at pointer-events-none fixed inset-x-0 z-40 underneath the floating navbar (z-50)
 * so scrolling tiles dissolve smoothly into optical blur instead of passing through raw transparent space.
 */
export const ViewportScrollBlur: React.FC = () => {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/dashboard/ai');

  return (
    <div
      className="viewport-scroll-blur-root pointer-events-none fixed inset-0 z-40"
      aria-hidden="true"
    >
      {/* Top Progressive Blur Mask (Underneath floating navbar) */}
      <div className="viewport-scroll-blur-top" />

      {/* Bottom Progressive Blur Mask (Bottom edge of screen; suppressed on chat to keep composer crisp) */}
      {!isChatRoute && <div className="viewport-scroll-blur-bottom" />}
    </div>
  );
};

export default ViewportScrollBlur;

