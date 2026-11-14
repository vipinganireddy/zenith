/* Configures pdf.js to use the locally-bundled worker instead of a CDN.
   Keeps every PDF tool working offline / behind blockers — true to the
   "your files never leave the browser" promise. Import once for the
   side effect; repeated imports are no-ops. */
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/* Render with `intent: 'print'` everywhere we draw pages to an off-screen canvas.
   pdf.js paces 'display' renders with requestAnimationFrame, which browsers stop
   in background tabs — a job left running while the user switches tabs would
   silently stall. 'print' renders straight through, and also includes form-field
   appearances exactly as they would print (what flatten/rasterise should show). */
