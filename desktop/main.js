// Kip for Mac: a thin Electron shell around the Kip web app (built into ./app).
// Everything runs on this Mac. The shell adds what a browser tab can't do:
//  - a fixed private address (kip://app) so notes stay put between launches,
//  - a floating sticky that stays on top of other apps, even full-screen calls,
//  - hearing the meeting app's sound (Zoom, Teams…) through macOS system audio.
const { app, BrowserWindow, protocol, session, desktopCapturer, ipcMain, shell, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const APP_DIR = path.join(__dirname, 'app');
const ORIGIN = 'kip://app';

// macOS system audio for screen sharing (Core Audio taps, macOS 14.2+). Without it only Windows gets call audio.
app.commandLine.appendSwitch('enable-features', 'MacCatapLoopbackAudioForScreenShare');

protocol.registerSchemesAsPrivileged([
  { scheme: 'kip', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.onnx': 'application/octet-stream',
};
// Cross-origin isolation, same as the web version's server: lets the speech models use several CPU threads.
const ISOLATION = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless', 'Cross-Origin-Resource-Policy': 'same-origin' };

async function serve(request) {
  const { pathname } = new URL(request.url);
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(APP_DIR, rel));
  if (!file.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
  try {
    const body = await fs.readFile(file);
    return new Response(body, { headers: { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', ...ISOLATION } });
  } catch {
    // A real 404 matters: the speech engine looks for optional local model files before downloading them.
    return new Response('Not found', { status: 404, headers: ISOLATION });
  }
}

let main = null;

function createMain() {
  main = new BrowserWindow({
    width: 1280, height: 840, minWidth: 900, minHeight: 600,
    title: 'Kip', backgroundColor: '#f4f8fc', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: false, sandbox: false, nodeIntegration: false, spellcheck: true },
  });
  main.once('ready-to-show', () => main.show());
  main.on('closed', () => { main = null; });

  main.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // The floating sticky: Kip opens it itself and draws into it directly.
    if (frameName === 'kip-float' || frameName === 'meeting-sticky') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 380, height: 560, minWidth: 300, minHeight: 320, title: 'Kip', alwaysOnTop: true,
          fullscreenable: false, backgroundColor: '#ffffff',
        },
      };
    }
    // Links out (help pages, emails) open in the normal browser.
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  main.webContents.on('did-create-window', (child) => {
    // stays above other apps, on every desktop, and over a full-screen Zoom or Teams
    child.setAlwaysOnTop(true, 'floating');
    child.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  });
  main.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); shell.openExternal(url); }
  });

  main.loadURL(`${ORIGIN}/`);
}

// ---- choosing what to share: a small Kip window listing screens and windows ----
function pickSource(sources) {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      parent: main || undefined, modal: !!main, width: 720, height: 560, resizable: false, minimizable: false, maximizable: false,
      title: 'Share with Kip', backgroundColor: '#f4f8fc', show: false,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, sandbox: false },
    });
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      ipcMain.removeHandler('picker:list');
      ipcMain.removeAllListeners('picker:choose');
      if (!picker.isDestroyed()) picker.close();
      resolve(sources.find((s) => s.id === id) || null);
    };
    ipcMain.handle('picker:list', () => sources.map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith('screen:'), thumb: s.thumbnail.toDataURL(), icon: s.appIcon ? s.appIcon.toDataURL() : null })));
    ipcMain.on('picker:choose', (_e, id) => finish(id));
    picker.on('closed', () => finish(null));
    picker.once('ready-to-show', () => picker.show());
    picker.loadFile(path.join(__dirname, 'picker.html'));
  });
}

app.whenReady().then(async () => {
  protocol.handle('kip', serve);
  const ses = session.defaultSession;

  // Microphone and screen access stay with Kip's own pages; macOS asks the person the first time.
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const ours = (details.requestingUrl || wc.getURL()).startsWith(ORIGIN);
    cb(ours && ['media', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'persistent-storage', 'fullscreen'].includes(permission));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => (origin || '').startsWith(ORIGIN));

  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
      const sources = (await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 320, height: 200 }, fetchWindowIcons: true }))
        .filter((s) => !own.has(s.id) && s.name);
      const choice = await pickSource(sources);
      // The chosen window gives the picture for reading slides; the sound comes from the Mac's audio output.
      if (choice) callback({ video: choice, audio: 'loopback' });
      else callback({});
    } catch {
      callback({});
    }
  });

  if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone').catch(() => {});

  createMain();
  app.on('activate', () => { if (!main) createMain(); });
});

// One Kip at a time: two copies would fight over the same notes database.
if (!app.requestSingleInstanceLock()) app.quit();
else app.on('second-instance', () => { if (main) { if (main.isMinimized()) main.restore(); main.focus(); } });

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
