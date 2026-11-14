import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Emits dist/sw.js from pwa/sw.js with the app-shell file list baked in: the
 * HTML, the entry chunk with its static imports and CSS, the manifest and icons.
 * Tool chunks are left out on purpose — they are cached the first time each tool
 * is opened, so installing the app doesn't download all of them up front.
 */
function serviceWorker(): Plugin {
  return {
    name: 'o-zenith-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const shell = new Set<string>(['/', '/index.html', '/manifest.webmanifest', '/favicon.svg',
        '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png']);
      const visit = (name: string) => {
        const item = bundle[name];
        if (!item || shell.has('/' + name)) return;
        shell.add('/' + name);
        if (item.type === 'chunk') {
          item.imports.forEach(visit);
          item.viteMetadata?.importedCss.forEach(css => shell.add('/' + css));
        }
      };
      for (const [name, item] of Object.entries(bundle)) if (item.type === 'chunk' && item.isEntry) visit(name);
      const version = Date.now().toString(36);
      const source = readFileSync(fileURLToPath(new URL('./pwa/sw.js', import.meta.url)), 'utf8')
        .replace('__SW_VERSION__', version)
        .replace('__SW_PRECACHE__', JSON.stringify([...shell]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  }
}

/**
 * Tightens the Content-Security-Policy in index.html for production builds.
 * Dev needs inline scripts (React Refresh), eval and a websocket (HMR); the
 * built app needs none of them, only WebAssembly compilation (qpdf, Tesseract).
 */
function strictCsp(): Plugin {
  return {
    name: 'o-zenith-strict-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(/(Content-Security-Policy" content=")([^"]*)/, (_m, head: string, policy: string) => head + policy
        .replace(/script-src([^;]*)/, (_s, list: string) => 'script-src' + list
          .replace(" 'unsafe-inline'", '')
          .replace(" 'unsafe-eval'", " 'wasm-unsafe-eval'"))
        .replace(' ws: wss:', ''));
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker(), strictCsp()],
  resolve: {
    alias: {
      // shadcn convention: `@/components/ui/...` resolves under src/
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-dom')) {
            return 'vendor-motion';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router-dom/')) {
            return 'vendor-react';
          }
        },
      },
    },
  },
})
