# Releasing Kip

Every release gets release notes. They live on the GitHub Release, and the website's **Release notes** section
(landing page, `#updates`) reads them from there, so the site never needs editing for a new version.

## Release notes template

Paste this as the release description and keep only the sections that apply. The website shows the first line as
the summary, then the **New**, **Improved** and **Fixed** sections. The **Install or update** section stays on GitHub
only.

```markdown
One short sentence on what this version is about.

### New
- **Feature name.** What you can do now that you couldn't before.

### Improved
- **What got better.** How it feels or works differently.

### Fixed
- **What was broken.** What happens now instead.

### Install or update
1. Download **Kip-arm64.dmg** below (Macs with Apple silicon: M1 and newer).
2. Quit Kip if it's open, then open the .dmg and drag **Kip** into **Applications** (choose **Replace**). Your notes stay where they are.
3. The first time, macOS blocks it because the app isn't notarized yet. Open it once, then go to **System Settings → Privacy & Security → Open Anyway**.
```

Write for people, not for the code: say what changed for the person using Kip.

## Steps

1. Bump the version in `web/package.json`, `desktop/package.json` (and their lockfiles) and `RELEASE.version` in `landing/index.html`.
2. Commit and push to `main`.
3. Deploy the browser app: `npx vercel@latest deploy --prod` in `web/`.
4. Build the Mac app: `npm run dist` in `desktop/` → `desktop/release/Kip-arm64.dmg`.
5. Publish: `gh release create vX.Y.Z desktop/release/Kip-arm64.dmg --latest --title "Kip X.Y.Z for Mac" --notes-file notes.md`.
6. Deploy the landing page (`npx vercel@latest deploy --prod` in `landing/`) so the version label matches.

The "Download for Mac" buttons always point at the latest release. Older versions stay downloadable from the
release notes on the website and from GitHub.
