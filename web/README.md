# Meeting Sticky — web MVP

An everyday note app plus a meeting notepad that floats over your call, sorts your shorthand, listens privately,
reads shared slides, remembers each client, and writes the follow-up. Everything runs and stays in your browser.

## Look

- Themes: **Light**, **Dark**, **Immersive** (the cover fills the window behind frosted glass). Settings → Appearance.
- Home cover: 7 presets (free Unsplash photos + a calm gradient) or **your own images** ("Your image" tile; resized to ≤2400 px and kept only in this browser, removable), with an optional pixel mosaic. "Change cover" on the Home hero.
- Home hero shows today's date and a live clock; the greeting follows the time of day.
- Sticky look: **Clean** (default), **Soft sky**, **Clouds**, switchable from the sticky's header.
- Fonts: Host Grotesk Light for headings; the system font for notes, in soft slate inks rather than black.

## Everyday notes (Notion-style)

- **Sidebar workspace:** pages, sub-pages (nested tree), meetings, clients, pinned, trash, search (⌘K).
- **Block editor:** type `/` for headings, lists, to-dos, toggles, quote, code, table, divider, images and **Sub-page**.
  Markdown shortcuts work (`# `, `- `, `1. `, `[] `, ` ``` `). Drag blocks by their handle to reorder.
- **Shorthand works in notes too:** `! ` makes a to-do (an action), `" ` makes a quote, and lines starting with
  `>` `?` `$` `*` are coloured as decision, question, money and important.
- **Open actions** collects every unticked to-do from notes and every open `!` from meetings.
- **Pop out** floats any note on top; **Alt+Q** creates a quick note and floats it. Floating notes take one line at a time.
- **Pin, Move (inside another page), Trash → Restore / Delete forever** on every page, including meetings.
- **Drag in the sidebar:** drop on a row's top/bottom edge to reorder, on its middle to nest inside it, on "Pages" for the top level, or on Trash.

Overview: [`../README.md`](../README.md).

## Run it

```bash
cd "meeting-notes-app/web"
npm install
npm run dev
```

Open **http://localhost:5290 in Google Chrome or Edge** (the floating window, tab audio and WebGPU need Chromium).

## Try a real meeting

1. Open your meeting (Google Meet, Zoom web, or Teams web) in a Chrome tab.
2. In Meeting Sticky press **Alt+N**, name the client, keep **My mic + meeting tab** and **Read screen** on, then **Start meeting**.
3. Chrome asks what to share: pick the **meeting tab** and keep **Also share tab audio** on.
4. Press **Alt+P** to float the sticky over the call. Type with shorthand:

   | Start a line with | Means |
   |---|---|
   | `!` | action (`@name` sets the owner; none means you) |
   | `>` | decision |
   | `?` | open question |
   | `$` | money |
   | `"` | their exact words |
   | `*` | important |
   | `#tag` anywhere | topic |

5. **Alt+M** marks a moment, **Alt+L** pauses or resumes listening, **Alt+E** ends the meeting and opens the recap and follow-up.

The first time you listen, the transcription model downloads once (English ~100 MB, Bangla ~600 MB) and is then cached.
Use headphones so your mic doesn't pick up the other side as well.

## What's verified so far

- Notes: pages, sub-pages, slash menu, shorthand in the editor, autosave across reloads, Open actions (ticking syncs
  back to the page), pin, move, trash/restore, search, quick note and the floating note's line-by-line capture.
- Shorthand parsing, editing, recap, follow-up draft, client memory ("From last time"), search, Markdown export.
- English transcription with Whisper on WebGPU: a 7-second clip was transcribed correctly in ~2 s.
- Screen reading: one capture per slide (including the same layout with new text), nothing captured from moving video, Bangla + English OCR.
- **Not yet tried on a live call:** mic/tab capture and the floating window (the test browser blocks both). Your first real meeting is the test.
- **Bangla listening** uses a Bangla-trained wav2vec2 model (arijitx/wav2vec2-xls-r-300m-bengali, Apache-2.0) via an 8-bit ONNX export (MDTLabs). It runs on the CPU with several threads: ~6 s of speech in ~1.8 s. It gets the gist; English words inside Bangla come out rough. Its `tokenizer.json` ships in `public/models/`. Before a public release, export the model ourselves (the MDTLabs copy has no licence tag).
- **Auto language (default on):** a tiny multilingual Whisper (`onnx-community/whisper-tiny`) checks each chunk and routes it to English Whisper or the Bangla model. 4/4 test clips routed correctly. Toggle: Settings → Meetings → Detect Bangla automatically.
- Screen reading keeps text only (no screenshots), drops OCR junk, and ignores Kip's own tab if you share it by mistake.
- Multi-threading needs cross-origin isolation, so both dev and preview servers send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` (see `vite.config.ts`).
- AI summary uses Chrome's built-in on-device model when available; not yet tried.

## Safety nets (from the QA pass, see `../QA-REPORT.md`)

- A meeting only goes live once it is fully set up (this fixed the blank screen right after "Start meeting").
- Each screen has an error boundary: a broken screen shows "Try again / Go Home" instead of blanking the app.
- Closing or reloading mid-meeting asks first; if it happens anyway, Home offers **Resume meeting** or **End it**.
- Trash actions show an **Undo** toast. Empty, untitled pages and blank quick notes disappear when you leave them.
- Errors are kept in a local log (last 30, never uploaded): Settings → Diagnostics, with Copy / Clear.
- Kip asks Chrome to keep its data permanently (Settings → This browser shows whether it did).

## Limits (fixed in the Mac app later)

- Only hears meetings running in a **browser tab**, plus your mic, not the desktop Zoom/Teams apps.
- Chrome/Edge only.
- Speakers are only "You" (mic) and "Them" (tab).
