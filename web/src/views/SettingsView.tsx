import { Archive, Copy, Monitor, Moon, RotateCcw, Sparkles, Sun, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { backupName, listAutoBackups, makeBackup, restoreAutoBackup, restoreBackup, type RestoreSummary } from '../lib/backup';
import { clearErrors, readErrors } from '../lib/errlog';
import { desktop, saveBlob } from '../lib/files';
import { checkForUpdate, useUpdate } from './Updates';
import { toasts } from '../lib/toast';
import { deleteEverything, saveSettings, type Language, type ListeningMode, type Settings } from '../lib/db';
import { summarizerAvailability } from '../lib/summarize';
import { CoverPicker } from './brand';
import { go, useData } from './common';
import { PageHeader, Segmented, SetCard, SetRow, Switch, useSettings } from './ui';

interface Check { label: string; ok: boolean; what: string }

async function checks(): Promise<Check[]> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  return [
    { label: 'Floating window', ok: 'documentPictureInPicture' in window, what: 'Keeps the sticky on top of your call.' },
    { label: 'Fast English transcription', ok: !!(gpu && (await gpu.requestAdapter().catch(() => null))), what: 'Uses your graphics chip (WebGPU).' },
    { label: 'Fast Bangla transcription', ok: crossOriginIsolated, what: 'Uses several CPU threads.' },
    { label: 'Screen reading in the background', ok: 'MediaStreamTrackProcessor' in window, what: 'Reads slides while the tab is hidden.' },
    { label: 'Data kept permanently', ok: !!(await navigator.storage?.persisted?.().catch(() => false)), what: 'Chrome won’t clear Kip’s notes when the disk gets full.' },
    { label: 'AI summary on this device', ok: (await summarizerAvailability()) !== 'unavailable', what: 'Chrome’s built-in model (English).' },
  ];
}

export function SettingsView() {
  const s = useSettings();
  const support = useData(checks, []);
  const set = (patch: Partial<Settings>) => saveSettings(patch);

  return (
    <main className="page narrow settings">
      <PageHeader eyebrow="Preferences" title="Settings" lead="Kip keeps everything on this device. Nothing is uploaded." />

      <SetCard title="Appearance">
        <SetRow label="Theme" desc="Auto follows your Mac's light or dark setting. Immersive puts your cover behind the whole app, under frosted glass.">
          <Segmented<Settings['theme']>
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[['light', <><Sun size={14} /> Light</>], ['dark', <><Moon size={14} /> Dark</>], ['auto', <><Monitor size={14} /> Auto</>], ['immersive', <><Sparkles size={14} /> Immersive</>]]}
          />
        </SetRow>
        <SetRow label="Home cover" desc="The picture at the top of Home, and behind everything in immersive mode." stacked>
          <CoverPicker value={s.cover} onPick={(cover) => set({ cover })} />
        </SetRow>
        <SetRow label="Pixel mosaic" desc="Squares that break the cover into pixels.">
          <Switch label="Pixel mosaic" checked={s.mosaic} onChange={(mosaic) => set({ mosaic })} />
        </SetRow>
        <SetRow label="Sticky style" desc="How the floating note and the meeting sticky look.">
          <Segmented<Settings['stickyStyle']> value={s.stickyStyle} onChange={(stickyStyle) => set({ stickyStyle })} options={[['clean', 'Clean'], ['sky', 'Soft sky'], ['clouds', 'Clouds']]} />
        </SetRow>
      </SetCard>

      <SetCard title="You">
        <SetRow label="Your name" desc="Used in the Home greeting and to sign follow-up emails.">
          <input key={s.yourName} defaultValue={s.yourName} placeholder="Your name" onBlur={(e) => set({ yourName: e.target.value.trim() })} />
        </SetRow>
      </SetCard>

      <SetCard title="Meetings">
        <SetRow label="Detect Bangla automatically" desc="Kip hears which language each person speaks and switches between English and Bangla on its own. Uses a Bangla-trained model (one-time ~355 MB download).">
          <Switch label="Detect Bangla automatically" checked={s.autoBangla} onChange={(autoBangla) => set({ autoBangla })} />
        </SetRow>
        {!s.autoBangla && (
          <SetRow label="Meeting language" desc="Used when automatic detection is off.">
            <Segmented<'en' | 'bn'> value={s.defaultLanguage === 'bn' ? 'bn' : 'en'} onChange={(defaultLanguage) => set({ defaultLanguage })} options={[['en', 'English'], ['bn', 'বাংলা']]} />
          </SetRow>
        )}
        <SetRow label="Listening" desc="What Kip listens to when a meeting starts.">
          <select value={s.defaultListening} onChange={(e) => set({ defaultListening: e.target.value as ListeningMode })}>
            <option value="mic+tab">My mic + meeting tab</option>
            <option value="mic">My mic only</option>
            <option value="off">Off</option>
          </select>
        </SetRow>
        <SetRow label="English transcription" desc="Accurate is a larger one-time download (~100 MB).">
          <Segmented<Settings['quality']> value={s.quality} onChange={(quality) => set({ quality })} options={[['accurate', 'Accurate'], ['fast', 'Fast']]} />
        </SetRow>
        <SetRow label="Read the shared screen" desc="Pick up text from slides and documents during calls.">
          <Switch label="Read the shared screen" checked={s.defaultReadScreen} onChange={(defaultReadScreen) => set({ defaultReadScreen })} />
        </SetRow>
      </SetCard>

      <SetCard title="This browser">
        {(support ?? []).map((c) => (
          <SetRow key={c.label} label={c.label} desc={c.what}>
            <span className={`status-dot ${c.ok ? 'ok' : 'no'}`}>{c.ok ? 'Ready' : 'Not available'}</span>
          </SetRow>
        ))}
      </SetCard>

      <Diagnostics />

      {desktop()?.setMenuBarIcon && <MacCard />}
      <BackupCard />
      <SetCard title="Privacy & data" tone="danger">
        <SetRow label="Everything stays here" desc="Notes, meetings and transcripts live only in this browser. Audio is never saved, only text." />
        <SetRow label="Delete all data" desc="Removes every page, meeting and client. This can’t be undone.">
          <button className="danger" onClick={async () => { if (confirm('Delete all meetings, clients and notes? This cannot be undone.')) { await deleteEverything(); go('/'); } }}>
            Delete all data
          </button>
        </SetRow>
      </SetCard>
    </main>
  );
}

/** The local error log: lets you see (and share, if you choose) what went wrong. Never uploaded. */
function Diagnostics() {
  const [errors, setErrors] = useState(readErrors);
  const text = errors.map((e) => `${new Date(e.at).toISOString()} [${e.where}] ${e.message}`).join('\n\n');
  return (
    <SetCard title="Diagnostics">
      <SetRow label="Problems Kip noticed" desc={errors.length ? `${errors.length} saved on this device only. Copy them if you want to report a bug.` : 'Nothing has gone wrong. Errors would be listed here, on this device only.'} stacked={errors.length > 0}>
        {errors.length > 0 && (
          <>
            <ul className="diag-list">
              {[...errors].reverse().map((e, i) => (
                <li key={i}><b>{new Date(e.at).toLocaleString()}</b> · {e.where}<pre>{e.message}</pre></li>
              ))}
            </ul>
            <span className="row">
              <button onClick={async () => { await navigator.clipboard.writeText(text); toasts.show('Copied'); }}><Copy size={14} /> Copy</button>
              <button onClick={() => { clearErrors(); setErrors([]); }}><Trash2 size={14} /> Clear</button>
            </span>
          </>
        )}
      </SetRow>
    </SetCard>
  );
}

/** Back up everything to one .kip file, restore one, or roll back to the copy taken before an update. */
function BackupCard() {
  const autos = useData(listAutoBackups, []);
  const [busy, setBusy] = useState('');
  const say = (r: RestoreSummary) =>
    toasts.show(r.added ? `Restored: ${r.added} item${r.added === 1 ? '' : 's'} brought back${r.kept ? `, ${r.kept} newer ones kept` : ''}.` : 'Everything in that backup is already here.');
  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kip,application/zip';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      setBusy('restore');
      try {
        const preview = await restoreBackup(f, true);
        if (!confirm(`Restore “${f.name}”?\n\n${preview.pages} pages, ${preview.meetings} meetings, ${preview.files} files.\nNothing here is deleted; where both have the same page, the newer one is kept.`)) return;
        say(await restoreBackup(f));
      } catch (e) {
        toasts.show((e as Error).message);
      } finally {
        setBusy('');
      }
    };
    input.click();
  };
  return (
    <SetCard title="Backup">
      <SetRow label="Back up everything" desc="All pages, meetings, clients, settings and attached files in one .kip file. Keep it somewhere safe, or move Kip to another Mac.">
        <button disabled={!!busy} onClick={async () => { setBusy('backup'); try { saveBlob(await makeBackup(), backupName()); } finally { setBusy(''); } }}>
          <Archive size={14} /> {busy === 'backup' ? 'Packing…' : 'Back up'}
        </button>
      </SetRow>
      <SetRow label="Restore from a backup" desc="Brings back anything missing from a .kip file. Nothing is deleted, and newer pages are kept.">
        <button disabled={!!busy} onClick={pick}><Upload size={14} /> {busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
      </SetRow>
      <SetRow label="Before each update" desc={autos?.length ? 'Kip kept a copy of your notes before these updates opened them:' : 'Kip keeps a copy of your notes before a new version opens them. None yet.'} stacked={!!autos?.length}>
        {autos?.map((b) => (
          <span key={b.id} className="row">
            <span className="small">{new Date(b.createdAt).toLocaleString()} · from {b.version}</span>
            <button disabled={!!busy} onClick={async () => { if (confirm('Bring back anything from this copy that is missing now? Nothing is deleted.')) say(await restoreAutoBackup(b.id)); }}><RotateCcw size={14} /> Restore</button>
          </span>
        ))}
      </SetRow>
    </SetCard>
  );
}

/** Mac-only: the Kip icon in the menu bar (click it for a floating quick note). */
function MacCard() {
  const on = useData(async () => (await desktop()?.getMenuBarIcon?.()) ?? true, []);
  const [value, setValue] = useState<boolean | undefined>(undefined);
  const shown = value ?? on ?? true;
  const update = useUpdate();
  return (
    <SetCard title="Mac">
      <SetRow label="Kip in the menu bar" desc="A Kip icon at the top of your screen. Click it for a floating quick note from any app; right-click for more.">
        <Switch label="Kip in the menu bar" checked={shown} onChange={async (v) => { setValue(v); await desktop()?.setMenuBarIcon?.(v); }} />
      </SetRow>
      <SetRow label={`Version ${__APP_VERSION__}`} desc={update.status === 'checking' ? 'Checking…' : update.status === 'available' || update.status === 'ready' ? `Kip ${update.version} is ready. Use the banner at the top to update.` : 'Kip checks for updates by itself and installs them when you say so. Your notes stay as they are.'}>
        <button disabled={update.status === 'checking' || update.status === 'downloading'} onClick={() => checkForUpdate()}>Check for updates</button>
      </SetRow>
    </SetCard>
  );
}
