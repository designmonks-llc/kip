import { CircleCheckBig, FileText, ImageIcon, Mic, MoreHorizontal, NotebookPen, Star } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { loadOpenActions } from '../lib/actions';
import { coverFor, customCovers } from '../lib/covers';
import { blocksToText } from '../lib/blocks';
import { isTrashed, listClients, listPages, openItemsForClient, saveSettings, type Page } from '../lib/db';
import { fmtDateTime } from '../lib/recap';
import { CoverPicker, EmptyState, Mosaic } from './brand';
import { Switch, useSettings } from './ui';
import { go, SHORTHAND, useData, useSession } from './common';
import { PageActionsMenu, renamePage } from './PageActions';
import { newPage, pageHref, pageTitle, quickNote } from './workspace';

function greeting(now: Date) {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Ticks on the minute, so the clock and greeting stay right while Kip is left open. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(new Date()); t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50); };
    t = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(t);
  }, []);
  return now;
}

export function Home() {
  const now = useNow();
  useSyncExternalStore(customCovers.subscribe, customCovers.version);
  const s = useSession();
  const [hint, setHint] = useState('');
  const [menu, setMenu] = useState<{ page: Page; rect: DOMRect } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const pages = useData(listPages, []);
  const actions = useData(loadOpenActions, []);
  const clients = useData(async () => {
    const cs = await listClients();
    return Promise.all(cs.map(async (c) => ({ ...c, open: (await openItemsForClient(c.id)).length })));
  }, []);

  const byId = new Map((pages ?? []).map((p) => [p.id, p]));
  const recent = (pages ?? []).filter((p) => !isTrashed(p, byId)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
  const openCount = actions ? actions.notes.length + actions.meetings.length : 0;
  const openPreview = actions
    ? [
        ...actions.notes.map((n) => ({ text: n.todo.text, href: pageHref(n.page) })),
        ...actions.meetings.map((m) => ({ text: m.line.text, href: `/m/${m.meeting.id}` })),
      ].slice(0, 4)
    : [];
  const st = useSettings();
  const name = st.yourName.split(' ')[0];
  const cover = coverFor(st.cover);
  const [picking, setPicking] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picking) return;
    const close = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPicking(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [picking]);
  const today = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <main className="home">
      <div className="hero-wrap">
        <div className="cover-btn-wrap" ref={pickerRef}>
          <button className="cover-btn" onClick={() => setPicking(!picking)}><ImageIcon size={14} /> Change cover</button>
          {picking && (
            <div className="cover-pop">
              <CoverPicker value={st.cover} onPick={(id) => saveSettings({ cover: id })} />
              <div className="cover-pop-foot">
                <span>Pixel mosaic</span>
                <Switch label="Pixel mosaic" checked={st.mosaic} onChange={(v) => saveSettings({ mosaic: v })} />
              </div>
            </div>
          )}
        </div>
        <Mosaic key={cover.id} art={cover.art} tiles={st.mosaic} className="hero" cell={32} seed={23} clusters={8} fy={0.2} area={{ x0: 0.62, x1: 1, y0: 0.05, y1: 0.8 }}>
          <div className="hero-veil" />
          <div className="hero-content">
            <p className="eyebrow">{today} · <time className="clock" dateTime={now.toISOString()}>{time}</time></p>
            <h1 className="display">{greeting(now)}{name ? `, ${name}` : ''}.</h1>
          </div>
        </Mosaic>
      </div>

      <div className="quick">
        <button className="quick-card" onClick={() => newPage()}>
          <span className="qc-top"><span className="qc-icon"><FileText size={16} /></span></span>
          <b>New page</b><span className="sub">A note, idea or doc. Type / for blocks.</span>
        </button>
        <button className="quick-card" onClick={() => go(s ? '/live' : '/new')}>
          <span className="qc-top"><span className="qc-icon"><Mic size={16} /></span><kbd>⌥N</kbd></span>
          <b>{s ? 'Back to live meeting' : 'New meeting'}</b><span className="sub">Floating sticky, private listening, screen reading.</span>
        </button>
        <button className="quick-card" onClick={async () => setHint((await quickNote()) ?? '')}>
          <span className="qc-top"><span className="qc-icon"><NotebookPen size={16} /></span><kbd>⌥Q</kbd></span>
          <b>Quick note</b><span className="sub">A blank note that floats on top of everything.</span>
        </button>
      </div>
      {hint && <p className="status warn">{hint}</p>}

      <div className="home-grid">
        <section>
          <div className="sec-head"><p className="eyebrow-d">Recent</p><h2>Jump back in</h2></div>
          {pages && recent.length === 0 ? (
            <div className="recent-empty">
              <EmptyState title="A clear page" text="Nothing here yet. Start a page, a meeting or a quick note and it shows up here." />
            </div>
          ) : (
            <div className="recent-grid">
              {recent.map((p) => {
                const snippet = p.kind === 'note'
                  ? blocksToText(p.content ?? []).split('\n').filter(Boolean).slice(0, 2).join(' · ')
                  : 'Meeting notes, recap and follow-up';
                return (
                  <article
                    key={p.id}
                    className={`note-card ${menu?.page.id === p.id ? 'menu-open' : ''}`}
                    onClick={() => renaming !== p.id && go(pageHref(p))}
                  >
                    <div className="nc-head">
                      <span className={`nc-icon ${p.kind}`}>{p.kind === 'meeting' ? <Mic size={14} /> : <FileText size={14} />}</span>
                      {p.pinned && <Star size={13} className="pin-mark" />}
                    </div>
                    {renaming === p.id ? (
                      <input
                        className="rename"
                        autoFocus
                        defaultValue={p.title}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                        onBlur={(e) => { renamePage(p, e.target.value.trim()); setRenaming(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') { e.currentTarget.value = p.title; e.currentTarget.blur(); }
                        }}
                      />
                    ) : (
                      <div className="nc-title">{pageTitle(p)}</div>
                    )}
                    <div className="nc-snippet">{snippet || 'Empty page'}</div>
                    <div className="nc-meta">{p.kind === 'meeting' ? 'Meeting' : 'Page'} · {fmtDateTime(p.updatedAt)}</div>
                    <button
                      className="icon-btn card-menu-btn"
                      title="More actions"
                      aria-label="More actions"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setMenu(menu?.page.id === p.id ? null : { page: p, rect: e.currentTarget.getBoundingClientRect() }); }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside>
          <div className="sec-head"><p className="eyebrow-d">Today</p><h2>At a glance</h2></div>
          <div className="glance">
          <div className="side-card span-2 clickable" onClick={() => go('/actions')}>
            <h2><span>Open actions</span><CircleCheckBig size={16} color="var(--blue)" /></h2>
            <div className="big">{openCount}</div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>{openCount ? 'to-dos across your notes and meetings' : 'Nothing open. Nice.'}</p>
            {openPreview.length > 0 && (
              <ul className="mini-list">
                {openPreview.map((o, i) => (
                  <li key={i} onClick={(e) => { e.stopPropagation(); go(o.href); }}>{o.text}</li>
                ))}
              </ul>
            )}
          </div>

          {clients && clients.length > 0 && (
            <div className="side-card">
              <h2>Clients</h2>
              {clients.slice(0, 3).map((c) => (
                <div key={c.id} className="client-row" onClick={() => go(`/c/${c.id}`)}>
                  <span>{c.name}</span>{c.open > 0 && <span className="pill">{c.open} open</span>}
                </div>
              ))}
            </div>
          )}

          <div className="side-card">
            <h2>Shorthand</h2>
            <p className="cheats" title="Works in meetings and pages. In a page, “! ” makes a to-do and “&quot; ” a quote.">
              {SHORTHAND.map(([k, v]) => <span key={k}><code>{k}</code> {v}</span>)}
            </p>
          </div>
          </div>
        </aside>
      </div>

      {menu && (
        <PageActionsMenu page={menu.page} anchor={menu.rect} onClose={() => setMenu(null)} onRename={() => setRenaming(menu.page.id)} onNotice={setHint} />
      )}
    </main>
  );
}
