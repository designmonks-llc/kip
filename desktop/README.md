# Kip for Mac

A thin Electron shell around the Kip web app (`../web`). Everything still runs on the Mac; the shell adds:

- **A fixed private address** (`kip://app`): notes stay put between launches, and the speech models can use several CPU threads (cross-origin isolation).
- **A floating sticky** that stays on top of every app, on every desktop, even over a full-screen Zoom or Teams.
- **Meeting audio from desktop apps**: the call's sound comes from macOS system audio (Core Audio taps, macOS 14.2+), with a Kip-styled picker for the meeting window.

## Build

```bash
npm install
npm run dist      # builds ../web, then release/Kip-<version>-arm64.dmg
npm start         # or: run it without packaging
```

The app is **ad-hoc signed**, not notarized (that needs a paid Apple Developer account). A copy built on your own Mac opens normally. A copy downloaded from the internet is blocked the first time: open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.

## Permissions Kip asks for

| What | Why |
| --- | --- |
| Microphone | Your side of the meeting |
| Screen & System Audio Recording | The meeting app's sound, and text on shared slides |

Both are asked the first time they're needed. After allowing screen recording, macOS asks you to reopen Kip.

## Files

- `main.js`: windows, the `kip://` file server, permissions, the share picker
- `preload.js`: gives Kip's page the floating-window API
- `picker.html` + `picker-preload.js`: the "Share your meeting with Kip" window
- `build/icon.png`: the app icon (1024 px)
