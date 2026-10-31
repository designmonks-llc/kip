// Runs in Kip's page before the app starts.
// Electron's own Document Picture-in-Picture doesn't open reliably and can't float over other apps,
// so Kip's floating sticky gets the same API here, always: a small window that the main process
// keeps on top of every other app, even full-screen calls (see main.js, 'kip-float').
Object.defineProperty(window, 'documentPictureInPicture', {
  configurable: true,
  value: {
    async requestWindow({ width = 380, height = 560 } = {}) {
      const w = window.open('about:blank', 'kip-float', `width=${width},height=${height}`);
      if (!w) throw new Error('Could not open the floating window');
      return w;
    },
  },
});
// What a browser tab can't do, handed to Kip's page (see web/src/lib/files.ts, KipDesktop).
const { ipcRenderer } = require('electron');
window.kipDesktop = {
  platform: process.platform,
  // open a page's file with its own app (a PDF opens in Preview)
  openFile: (name, bytes) => ipcRenderer.invoke('kip:open-file', name, bytes),
  // a page as PDF, saved where the person chooses (returns false if they cancel)
  printToPdf: (html, name) => ipcRenderer.invoke('kip:print-pdf', html, name),
  // the Mac share sheet (AirDrop, Mail, Messages…) with the page as a PDF; `html` is the page as UTF-8
  share: (name, html) => ipcRenderer.invoke('kip:share', name, html),
  // a backup file in ~/Library/Application Support/Kip/Backups (the newest five are kept)
  writeBackup: (name, bytes) => ipcRenderer.invoke('kip:write-backup', name, bytes),
  // the Kip icon in the menu bar: on/off, and what it asks for ('quick', 'show', 'hidden')
  setMenuBarIcon: (on) => ipcRenderer.invoke('kip:set-tray', on),
  getMenuBarIcon: () => ipcRenderer.invoke('kip:get-tray'),
  onMenuBar: (fn) => ipcRenderer.on('kip:tray', (_e, action) => fn(action)),
  // updates from inside Kip: state, check, download, then quit-swap-reopen
  updateState: () => ipcRenderer.invoke('kip:update-state'),
  checkForUpdate: () => ipcRenderer.invoke('kip:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('kip:update-download'),
  installUpdate: () => ipcRenderer.invoke('kip:update-install'),
  onUpdate: (fn) => ipcRenderer.on('kip:update', (_e, state) => fn(state)),
};
