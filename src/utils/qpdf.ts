/* qpdf (https://qpdf.sourceforge.io), compiled to WebAssembly, run in the browser.

   Used where pdf-lib can't do the job: real PDF encryption (AES-256 with
   permission flags), decryption that keeps text intact, and structural repair.
   Each call gets a fresh module instance (qpdf's main() isn't re-entrant); the
   1.3 MB .wasm is fetched once and then served from the HTTP cache. */
import createModule from '@neslinesli93/qpdf-wasm';
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';

export interface QpdfResult {
  /** The output file, or null when qpdf failed to write one. */
  output: Uint8Array | null;
  /** 0 = success, 3 = success with warnings, 2 = error. */
  exitCode: number;
  /** stderr text — useful for user-facing error messages. */
  messages: string;
}

interface EmscriptenModule {
  callMain: (args: string[]) => number;
  FS: { writeFile: (p: string, d: Uint8Array) => void; readFile: (p: string) => Uint8Array };
}

/** Run qpdf with `/in.pdf` as input and `/out.pdf` as output. */
export async function runQpdf(input: Uint8Array, args: (inPath: string, outPath: string) => string[]): Promise<QpdfResult> {
  const lines: string[] = [];
  const create = createModule as unknown as (opts: Record<string, unknown>) => Promise<EmscriptenModule>;
  const mod = await create({
    locateFile: () => wasmUrl,
    noInitialRun: true,
    print: (s: string) => lines.push(s),
    printErr: (s: string) => lines.push(s),
  });
  mod.FS.writeFile('/in.pdf', input);
  let exitCode: number;
  // This build writes qpdf's stderr through console.error rather than printErr.
  const consoleError = console.error;
  console.error = (...parts: unknown[]) => { lines.push(parts.join(' ')); };
  try {
    exitCode = mod.callMain(args('/in.pdf', '/out.pdf'));
  } catch (e) {
    // Emscripten signals exit() by throwing ExitStatus { status }.
    exitCode = typeof (e as { status?: number })?.status === 'number' ? (e as { status: number }).status : 2;
  } finally {
    console.error = consoleError;
  }
  let output: Uint8Array | null = null;
  try { output = mod.FS.readFile('/out.pdf'); } catch { /* qpdf wrote nothing */ }
  return { output: exitCode === 2 ? null : output, exitCode, messages: lines.join('\n') };
}

/** qpdf's "invalid password" failure. */
export const isPasswordError = (r: QpdfResult) => /invalid password/i.test(r.messages);
