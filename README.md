# Kip

**Keep what matters from every meeting.** Kip is a free, private note app: a calm notebook for everyday notes, and a small sticky that floats over your calls, listens on your own computer, and turns quick shorthand into a clean recap.

Nothing is uploaded. Speech is transcribed on your device, audio is never stored, and there's no account.

## Get it

- **Mac (Apple silicon):** download `Kip-arm64.dmg` from the [latest release](https://github.com/designmonks-llc/kip/releases/latest), open it and drag Kip into Applications.
  The app isn't notarized yet, so the first time macOS blocks it: open it once, then go to **System Settings → Privacy & Security → Open Anyway**.
- **Browser:** the web version runs in Chrome or Edge (link coming soon).

## What it does

- **Shorthand that sorts itself:** start a line with `!` for an action, `>` a decision, `?` a question, `$` money, `"` a quote.
- **Private listening** in English and বাংলা, detected automatically, transcribed on your computer.
- **Reads shared slides** without storing screenshots.
- **Remembers each client** and drafts the follow-up email.
- **Everyday notebook:** pages inside pages, to-dos, tables, light, dark and immersive looks.

## Inside this repo

| Folder | What it is |
| --- | --- |
| [`web/`](web) | The Kip app (Vite + React + TypeScript). Everything runs in the browser; notes live in IndexedDB. |
| [`desktop/`](desktop) | Kip for Mac: an Electron shell around `web/` that adds an always-on-top sticky and meeting audio from desktop apps. |
| [`landing/`](landing) | The landing page: one static HTML file, no build step. |

## Run it yourself

```bash
# the app in your browser, at http://localhost:5290
cd web && npm install && npm run dev

# the Mac app (builds web/ first), output in desktop/release/
cd desktop && npm install && npm run dist
```

Requires Node 20 or later. See [`desktop/README.md`](desktop/README.md) for permissions and signing.
