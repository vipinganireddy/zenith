/* Native-app glue (Capacitor iOS / Android). Does nothing in the browser.

   1. Downloads. App web views ignore <a download> — tapping "Download" in a
      tool would do nothing. In the apps, every download link (in the page or
      created on the fly with a.click()) is intercepted: the file is written to
      the app's cache and the system share sheet opens, which offers
      "Save to Files", Drive, Mail, AirDrop… on iOS and the share targets on Android.
   2. Status bar text follows the app's light/dark theme.
   Plugins are imported lazily so the website never downloads them. */
import { isNativeApp } from './pwa';
import { effectiveTheme, THEME_EVENT } from './theme';

const toBase64 = async (blob: Blob): Promise<string> => {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
};

async function saveViaShareSheet(href: string, fileName: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const blob = await (await fetch(href)).blob();
  const name = (fileName || 'download').replace(/[\\/:*?"<>|]+/g, '_');
  const { uri } = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: name, url: uri, dialogTitle: 'Save or share' });
  } catch { /* user closed the sheet */ }
}

/** True when this anchor is a file download the web view would swallow. */
const isDownload = (a: HTMLAnchorElement) => a.hasAttribute('download') && /^(blob:|data:)/.test(a.href);

export function initNativeBridge() {
  if (!isNativeApp()) return;

  // Links in the page
  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a');
    if (a && isDownload(a)) {
      e.preventDefault();
      saveViaShareSheet(a.href, a.getAttribute('download') || '');
    }
  }, true);

  // Links created in code and clicked without being attached (const a = …; a.click())
  const nativeClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (!this.isConnected && isDownload(this)) { saveViaShareSheet(this.href, this.getAttribute('download') || ''); return; }
    nativeClick.call(this);
  };

  // Status bar: dark text on the light theme, light text on the dark theme
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    const apply = () => {
      StatusBar.setStyle({ style: effectiveTheme() === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
    };
    apply();
    window.addEventListener(THEME_EVENT, apply);
  }).catch(() => {});
}

