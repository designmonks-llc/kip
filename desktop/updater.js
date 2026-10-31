// Kip updates itself from GitHub Releases, no website or re-download needed.
// macOS's own updater (Squirrel) only works for Apple-signed apps, so Kip does it the simple way:
//   1. check the latest release (once at launch, then every 6 hours, or when asked),
//   2. download Kip-<arch>.zip and unpack it next to the app,
//   3. on "Restart", a tiny helper script waits for Kip to quit, swaps the app (keeping the old one
//      until the new one is in place, and putting it back if anything fails) and opens the new Kip.
// Notes live in Kip's data folder, not inside the app, so an update never touches them.
const { app, net } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FEED = process.env.KIP_UPDATE_FEED || 'https://api.github.com/repos/designmonks-llc/kip/releases/latest';
const EVERY = 6 * 60 * 60 * 1000;

const parse = (v) => String(v).replace(/^v/, '').split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, (err, out) => (err ? rej(err) : res(out))));

/** The .app bundle Kip is running from (…/Kip.app). */
const bundlePath = () => path.resolve(process.execPath, '..', '..', '..');

function createUpdater(send) {
  let state = { status: 'idle' }; // idle | checking | available | downloading | ready | error | current
  let release = null;
  let staged = null;
  const set = (patch) => { state = { ...state, ...patch }; send(state); };

  async function check(manual = false) {
    if (['downloading', 'ready'].includes(state.status)) return state;
    set({ status: 'checking', manual });
    try {
      const res = await net.fetch(FEED, { headers: { 'User-Agent': `Kip/${app.getVersion()}`, Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
      const r = await res.json();
      const asset = (r.assets || []).find((a) => a.name === `Kip-${process.arch}.zip`);
      if (!newer(r.tag_name, app.getVersion()) || !asset) { set({ status: 'current', version: app.getVersion(), manual }); return state; }
      release = { version: String(r.tag_name).replace(/^v/, ''), notes: r.body || '', url: asset.browser_download_url, size: asset.size };
      set({ status: 'available', ...release, manual });
    } catch (e) {
      set({ status: manual ? 'error' : 'idle', error: String(e.message || e), manual });
    }
    return state;
  }

  async function download() {
    if (!release || state.status === 'downloading') return;
    set({ status: 'downloading', progress: 0 });
    try {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kip-update-'));
      const zip = path.join(dir, 'Kip.zip');
      const res = await net.fetch(release.url, { headers: { 'User-Agent': `Kip/${app.getVersion()}` } });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
      const total = Number(res.headers.get('content-length')) || release.size || 0;
      const fh = await fs.open(zip, 'w');
      let got = 0, last = 0;
      try {
        for await (const chunk of res.body) {
          await fh.write(chunk);
          got += chunk.length;
          if (total && Date.now() - last > 250) { last = Date.now(); set({ progress: Math.round((got / total) * 100) }); }
        }
      } finally {
        await fh.close();
      }
      await run('/usr/bin/ditto', ['-x', '-k', zip, dir]);
      const app_ = path.join(dir, 'Kip.app');
      // make sure it really is the version we expect before offering it
      const plist = await run('/usr/libexec/PlistBuddy', ['-c', 'Print CFBundleShortVersionString', path.join(app_, 'Contents', 'Info.plist')]);
      if (plist.trim() !== release.version) throw new Error(`Downloaded ${plist.trim()}, expected ${release.version}`);
      await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', app_]).catch(() => {});
      staged = app_;
      set({ status: 'ready', progress: 100 });
    } catch (e) {
      set({ status: 'error', error: String(e.message || e) });
    }
  }

  /** Quits Kip; a helper swaps the app and opens the new one. */
  async function install() {
    if (!staged) return { ok: false, error: 'Nothing downloaded yet.' };
    const target = bundlePath();
    if (!target.endsWith('.app') || target.includes('/AppTranslocation/') || target.startsWith('/Volumes/')) {
      return { ok: false, error: 'Move Kip into your Applications folder first, then update.' };
    }
    try { await fs.access(path.dirname(target), constants.W_OK); } catch {
      return { ok: false, error: `Kip can't write to ${path.dirname(target)}. Update from the website instead.` };
    }
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const args = process.argv.slice(1).filter((a) => a.startsWith('--')).map(q).join(' ');
    const script = path.join(path.dirname(staged), 'swap.sh');
    await fs.writeFile(script, `#!/bin/sh
# Waits for Kip to quit, swaps in the new app, puts the old one back if anything fails, then opens Kip.
# (a finished process that hasn't been collected yet shows as Z: it counts as gone)
i=0
while S=$(ps -o stat= -p ${process.pid} 2>/dev/null) && [ -n "$S" ] && [ "\${S#Z}" = "$S" ]; do
  i=$((i+1)); [ $i -gt 200 ] && exit 1   # Kip didn't quit within a minute: leave everything as it is
  sleep 0.3
done
T=${q(target)}; N=${q(staged)}
rm -rf "$T.previous"
if mv "$T" "$T.previous" && /usr/bin/ditto "$N" "$T"; then rm -rf "$T.previous"; else rm -rf "$T"; mv "$T.previous" "$T"; fi
/usr/bin/xattr -dr com.apple.quarantine "$T" 2>/dev/null
open "$T"${args ? ` --args ${args}` : ''}
`, { mode: 0o755 });
    spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 150);
    return { ok: true };
  }

  return {
    get: () => state,
    check,
    download,
    install,
    start() {
      setTimeout(() => check(false), 15_000);
      setInterval(() => { if (state.status === 'idle' || state.status === 'current') check(false); }, EVERY);
    },
  };
}

module.exports = { createUpdater, newer };
