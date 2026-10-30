import { useState } from 'react';
import { listClients, saveSettings, settings, type Language, type ListeningMode } from '../lib/db';
import { startSession } from '../lib/session';
import { logError } from '../lib/errlog';
import { Cheatsheet, go, useData } from './common';
import { PageHeader } from './ui';

const CONSENT_LINE = "Heads up: I'm taking notes with a private on-device assistant. Nothing is recorded or uploaded.";

export function StartMeeting({ client = '' }: { client?: string }) {
  const st = settings();
  const clients = useData(listClients, []);
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState(client);
  const [language, setLanguage] = useState<Language>(st.autoBangla ? 'auto' : st.defaultLanguage);
  const [listening, setListening] = useState<ListeningMode>(st.defaultListening);
  const [readScreen, setReadScreen] = useState(st.defaultReadScreen);
  const [busy, setBusy] = useState<'' | 'picker' | 'setup'>('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy('setup');
    try {
      await startSession({ title, clientName, language, listening, readScreen }, setBusy);
      if (listening !== 'off' && !st.consentShown) saveSettings({ consentShown: true });
      go('/live');
    } catch (err) {
      logError('start meeting', err);
      setError('Kip couldn’t start the meeting. Please try again.');
      setBusy('');
    }
  }

  return (
    <main className="page narrow">
      <PageHeader eyebrow="Meeting" title="New meeting" lead="Kip floats over your call, listens privately and writes the recap when you end." />
      <form onSubmit={start} className="form">
        <label>
          Title
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting – today" />
        </label>
        <label>
          Client or project <span className="muted">(optional, used for “From last time”)</span>
          <input list="clients" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Acme Ltd" />
          <datalist id="clients">{clients?.map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </label>
        <div className="row">
          <label>
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              <option value="auto">Auto: English + বাংলা</option>
              <option value="en">English only</option>
              <option value="bn">বাংলা only</option>
            </select>
          </label>
          <label>
            Listening
            <select value={listening} onChange={(e) => setListening(e.target.value as ListeningMode)}>
              <option value="mic+tab">My mic + meeting tab</option>
              <option value="mic">My mic only</option>
              <option value="off">Off (notes only)</option>
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={readScreen} onChange={(e) => setReadScreen(e.target.checked)} />
          Read text from the shared screen (slides, documents)
        </label>

        {language !== 'en' && listening !== 'off' && (
          <p className="hint">
            {language === 'auto'
              ? 'Kip listens for which language each person speaks and switches between English and Bangla on its own. '
              : ''}
            Bangla uses a Bangla-trained model that runs privately on this device (one-time ~355 MB download).
            It catches the gist well; English words said inside Bangla (“meeting”, “website”) come out rough.
          </p>
        )}
        {(listening === 'mic+tab' || readScreen) && (
          <p className="hint">
            After you press Start, Chrome asks what to share: pick the <b>Chrome tab</b> with your meeting (Meet, Zoom web,
            Teams web) and keep <b>“Also share tab audio”</b> on. Use headphones so your mic doesn’t pick up the other side twice.
          </p>
        )}
        {listening !== 'off' && (
          <div className="consent">
            <p><b>Let people know.</b> Some places require everyone’s consent before a meeting is transcribed. Audio stays on this device and is never saved, only text.</p>
            <p className="quote">{CONSENT_LINE}</p>
            <button type="button" onClick={() => { navigator.clipboard.writeText(CONSENT_LINE); setCopied(true); }}>
              {copied ? 'Copied' : 'Copy line for the chat'}
            </button>
          </div>
        )}
        {error && <p className="status warn">{error}</p>}
        <div className="row">
          <button className="primary" disabled={!!busy}>{busy === 'picker' ? 'Choose what to share…' : busy ? 'Starting…' : 'Start meeting'}</button>
          <button type="button" onClick={() => history.back()}>Cancel</button>
        </div>
      </form>
      <h3>Shorthand</h3>
      <Cheatsheet />
    </main>
  );
}
