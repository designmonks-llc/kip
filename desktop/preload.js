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
window.kipDesktop = { platform: process.platform };
