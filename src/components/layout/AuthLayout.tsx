import { Outlet } from 'react-router-dom';
import FluidSilkCanvas from '../canvas/FluidSilkCanvas';
import '../auth/AuthMonochrome.css';

const AuthLayout = () => {
  return (
    <div className="mono-viewport min-h-screen w-full overflow-hidden relative flex flex-col justify-between items-center">
      {/* GPU WebGL Fluid Silk Shader Canvas */}
      <FluidSilkCanvas />

      {/* Dark Edge Vignette */}
      <div className="mono-vignette" aria-hidden="true" />

      {/* Top Header: Pure static, non-interactive brand wordmark (no links or click actions) */}
      <header className="mono-header">
        <span className="mono-brand-wordmark" aria-hidden="true">
          O-ZENITH
        </span>
      </header>

      {/* Centerpiece: Streamlined Double-Bezel Auth Card */}
      <main className="mono-centerpiece">
        <div className="mono-auth-stack">
          <Outlet />
        </div>
      </main>

      {/* Bottom Footer: Whisper-quiet minimal copyright/credit */}
      <footer className="mono-footer">
        <p className="mono-credit-text">
          By Oritho Business Solutions PVT LTD
        </p>
      </footer>
    </div>
  );
};

export default AuthLayout;
