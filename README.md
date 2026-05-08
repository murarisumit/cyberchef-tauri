# CyberChef Tauri Wrapper

This repository packages CyberChef as a local desktop app using Tauri while
keeping the CyberChef source vendored separately from the app shell.

The goal is simple: keep desktop-specific work in this repo, keep CyberChef
under `vendor/cyberchef`, and avoid carrying a long-lived fork just to ship a
desktop wrapper.

## What This Repo Owns

- Tauri config and Rust shell in `src-tauri/`
- wrapper scripts in `scripts/`
- vendored CyberChef source in `vendor/cyberchef/`
- staged web build output in `.artifacts/cyberchef-dist/`
- icon generation from CyberChef assets

## History Model

This repository uses a two-track history model inside a single Git repository:

- `main` contains the desktop wrapper and the vendored CyberChef tree at `vendor/cyberchef`
- `upstream/cyberchef` is the dedicated in-repo mirror branch for upstream CyberChef history

The mirror branch is kept aligned with upstream, and `main` imports it into
`vendor/cyberchef` using unsquashed subtree semantics. This keeps the wrapper
history and CyberChef history distinct while keeping the repository complete on
its own.

This repo does not own CyberChef's upstream release packaging, website ZIP
distribution, or broader website release workflow.

## Project Layout

- `package.json`: wrapper entrypoints
- `scripts/lib.mjs`: shared path resolution and shell helpers
- `scripts/build-cyberchef.mjs`: builds the web app used by Tauri
- `scripts/dev-cyberchef.mjs`: starts CyberChef's dev server for Tauri dev mode
- `scripts/prepare-cyberchef.mjs`: installs vendored CyberChef dependencies
- `scripts/sync-icons.mjs`: regenerates wrapper icons from CyberChef assets
- `src-tauri/`: Tauri shell and bundle configuration
- `vendor/cyberchef/`: vendored CyberChef source

## Local Development

Install wrapper dependencies:

```bash
npm install
```

Install vendored CyberChef dependencies:

```bash
npm run prepare:cyberchef
```

Fast-path vendored CyberChef update:

```bash
npm run vendor:update -- 11.0.0
```

To pull the latest upstream tagged release, omit the version:

```bash
npm run vendor:update
```

This command vendors the requested CyberChef version, installs its dependencies,
and runs the release metadata consistency check. Add `--build-web` if you also
want to rebuild the staged web app during the update.

The default in-repo upstream mirror branch name is `upstream/cyberchef`. You
can override it with `CYBERCHEF_MIRROR_BRANCH` if needed.

Run the desktop app in development mode:

```bash
npm run tauri dev
```

Build the desktop app:

```bash
npm run tauri build
```

Use the full Tauri build only when you need a desktop packaging check or a
release artifact. A normal vendor refresh does not need to wait for DMG bundling.

Install or upgrade the released macOS app from Homebrew:

```bash
brew tap murarisumit/tap
brew install --cask murarisumit/tap/cyberchef-tauri
brew upgrade --cask murarisumit/tap/cyberchef-tauri
```

Sync the local Homebrew tap cask after a local release build:

```bash
HOMEBREW_TAP_DIR=/absolute/path/to/homebrew-tap npm run release:bundle
```

Regenerate wrapper icons from CyberChef assets:

```bash
npm run sync:icons
```

## How The Build Works

The Tauri app consumes a staged CyberChef web build from:

```bash
.artifacts/cyberchef-dist
```

`src-tauri/tauri.conf.json` runs the wrapper build step before Tauri packaging,
so the desktop app is always built from the vendored CyberChef source in this
repository.

The primary macOS installer output is:

```bash
src-tauri/target/release/bundle/dmg/*.dmg
```

## GitHub Actions

- `.github/workflows/ci.yml`: macOS validation on pushes and pull requests,
  including dependency preparation and a full desktop build check
- `.github/workflows/release.yml`: tag-driven macOS release build
- `.github/workflows/cyberchef-upstream-build.yml`: daily upstream check that
  refreshes the vendor snapshot and builds a DMG when CyberChef has moved upstream

## Related Docs

- Update and release workflow:
  [docs/UPDATING.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/UPDATING.md)
- Wrapper-owned CyberChef customizations to review on vendor updates:
  [docs/WRAPPER_CUSTOMIZATIONS.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/WRAPPER_CUSTOMIZATIONS.md)
