# Contributing

This repository packages CyberChef as a desktop app using Tauri, while keeping
the CyberChef source vendored separately from the app shell.

The goal is simple: keep desktop-specific work in this repo, keep CyberChef
under `vendor/cyberchef`, and avoid carrying a long-lived fork just to ship a
desktop wrapper.

## What This Repo Owns

- Tauri config and Rust shell in `src-tauri/`
- wrapper scripts in `scripts/`
- wrapper-owned web assets in `wrapper-assets/`
- vendored CyberChef source in `vendor/cyberchef/`
- staged web build output in `.artifacts/cyberchef-dist/`
- icon generation from CyberChef assets

This repo does not own CyberChef's upstream release packaging, website ZIP
distribution, or broader website release workflow.

## Project Layout

- `package.json`: wrapper entrypoints
- `scripts/lib.mjs`: shared path resolution and shell helpers
- `scripts/build-cyberchef.mjs`: builds the web app used by Tauri
- `scripts/dev-cyberchef.mjs`: starts CyberChef's dev server for Tauri dev mode
- `scripts/prepare-cyberchef.mjs`: installs vendored CyberChef dependencies
- `scripts/sync-icons.mjs`: regenerates wrapper icons from CyberChef assets
- `wrapper-assets/`: desktop-only JS, CSS, and the settings window
- `src-tauri/`: Tauri shell and bundle configuration
- `vendor/cyberchef/`: vendored CyberChef source

## History Model

This repository uses a two-track history model inside a single Git repository:

- `main` contains the desktop wrapper and the vendored CyberChef tree at `vendor/cyberchef`
- `upstream/cyberchef` is the dedicated in-repo mirror branch for upstream CyberChef history

The mirror branch is kept aligned with upstream, and `main` imports it into
`vendor/cyberchef` using unsquashed subtree semantics. This keeps the wrapper
history and CyberChef history distinct while keeping the repository complete on
its own.

## Local Development

Install dependencies:

```bash
npm install
npm run prepare:cyberchef
```

Run the desktop app in development mode:

```bash
npm run tauri dev
```

Build the desktop app:

```bash
npm run tauri build
```

Refresh the vendored CyberChef version:

```bash
npm run vendor:update -- 11.0.0
```

## How The Build Works

The Tauri app consumes a staged CyberChef web build from:

```bash
.artifacts/cyberchef-dist
```

`src-tauri/tauri.conf.json` runs the wrapper build step before Tauri packaging,
so the desktop app is always built from the vendored CyberChef source in this
repository.

The wrapper does not edit upstream files in place. It stages the CyberChef
production build, then injects wrapper-owned assets into the staged copy. See
[docs/WRAPPER_CUSTOMIZATIONS.md](docs/WRAPPER_CUSTOMIZATIONS.md) for what is
layered on top of upstream and which upstream touchpoints it depends on.

The primary macOS installer output is:

```bash
src-tauri/target/release/bundle/dmg/*.dmg
```

## Validation Gates

These run in CI on every pull request. Run them locally before opening one:

```bash
npm run release:check
npm run wrapper:check
npm run doctor
npm run build:web
npm run tauri build
```

Report gate results rather than summarizing them away. A gate that was not run
should be called out explicitly as not run.

`wrapper:check` guards the upstream touchpoints the desktop layer depends on. If
you add a customization, add markers for it there, and prove each marker can
fail: mutate the thing it guards, confirm it reports, then restore. A check that
has only ever passed is not evidence.

## Changing Wrapper Behavior

Prefer wrapper-owned assets and Tauri commands over editing `vendor/cyberchef`
directly. When you add behavior that modifies upstream CyberChef from the
wrapper layer:

1. Add a section to [docs/WRAPPER_CUSTOMIZATIONS.md](docs/WRAPPER_CUSTOMIZATIONS.md)
   describing the behavior, files, and upstream touchpoints.
2. Add markers to `scripts/wrapper-check.mjs` so a vendor bump cannot break it
   silently.
3. Add any required review steps to [docs/UPDATING.md](docs/UPDATING.md).

## Updating Vendored CyberChef

Every vendored bump follows the runbook in [docs/UPDATING.md](docs/UPDATING.md).
Do not skip steps because a bump looks routine. In short:

1. Work on a branch. Never commit a vendor bump directly to `main`.
2. Load the commit signing key first; the subtree import ends in a merge commit.
3. Run `npm run vendor:update -- <version>`.
4. Diff the upstream range against the wrapper touchpoints.
5. Run the validation gates.
6. Open a PR stating what was validated and what was not.

## GitHub Actions

- `.github/workflows/ci.yml`: macOS validation on pushes and pull requests
- `.github/workflows/release.yml`: tag-driven macOS release build and GitHub release publishing
- `.github/workflows/cyberchef-upstream-build.yml`: scheduled upstream update detection and DMG build

## Related Docs

- Update and release workflow: [docs/UPDATING.md](docs/UPDATING.md)
- Wrapper-owned CyberChef customizations: [docs/WRAPPER_CUSTOMIZATIONS.md](docs/WRAPPER_CUSTOMIZATIONS.md)
- Agent and contributor conventions: [AGENTS.md](AGENTS.md)
