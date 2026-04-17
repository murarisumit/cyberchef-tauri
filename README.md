# CyberChef Tauri Wrapper

This repository exists to turn CyberChef into a local desktop app while keeping
CyberChef vendored separately from the Tauri packaging layer.

The main intent is to keep `gchq/CyberChef` easy to refresh independently while
doing desktop-shell work here instead.

## Intent

- Keep CyberChef source vendored under `vendor/cyberchef/`.
- Keep Tauri packaging, desktop-specific config, and local app workflow in this
  repository only.
- Make it possible to update vendored CyberChef independently from wrapper changes.
- Avoid carrying long-lived app-shell patches in a CyberChef fork.

## Boundary

This repository owns:

- Tauri config and Rust shell in `src-tauri/`
- wrapper scripts in `scripts/`
- vendored CyberChef source in `vendor/cyberchef/`
- staged local build artifacts in `.artifacts/`
- app icon generation from CyberChef's existing logo assets

This repository does not own:

- CyberChef source code
- CyberChef release workflow
- CyberChef website packaging details like ZIP/hash publishing

The wrapper builds the vendored CyberChef web app and then packages that output
as a desktop app.

## Input Model

The source of truth for the app is the vendored CyberChef checkout at:

```bash
vendor/cyberchef
```

The intended long-term update model is a git subtree, so this repository
remains the source of truth and upstream refreshes become one repo-local
command.

The most common maintenance path is documented in [docs/UPDATING.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/UPDATING.md).

Recommended one-time setup:

```bash
git remote get-url cyberchef-upstream >/dev/null 2>&1 || \
  git remote add cyberchef-upstream https://github.com/gchq/CyberChef.git
npm run vendor:add
```

Recommended update flow after that:

```bash
npm run vendor:pull
```

The local import script is kept as a bootstrap or fallback path from any local
CyberChef clone. By default, it reads from:

```bash
../cyberchef
```

You can point the import somewhere else with:

```bash
CYBERCHEF_IMPORT_DIR=/absolute/path/to/CyberChef npm run vendor:cyberchef
```

Build commands read CyberChef from `vendor/cyberchef` by default. You can still
override that for one-off runs with:

```bash
CYBERCHEF_DIR=/absolute/path/to/CyberChef npm run build:web
```

## Project Layout

- `package.json`: wrapper entrypoints
- `scripts/lib.mjs`: shared path resolution and shell helpers
- `scripts/vendor-subtree.mjs`: adds or updates `vendor/cyberchef/` as a subtree
- `scripts/vendor-cyberchef.mjs`: refreshes `vendor/cyberchef/` from a local clone
- `scripts/build-cyberchef.mjs`: runs the web-only CyberChef build pipeline
- `scripts/dev-cyberchef.mjs`: starts CyberChef's dev server for Tauri dev mode
- `scripts/sync-icons.mjs`: regenerates wrapper icons from CyberChef assets
- `src-tauri/`: Tauri shell and bundle configuration
- `.artifacts/cyberchef-dist/`: staged web build consumed by Tauri

## Workflow

1. Install wrapper dependencies:

   ```bash
   npm install
   ```

2. Vendor CyberChef into this repository.

   Preferred long-term path:

   ```bash
   git remote get-url cyberchef-upstream >/dev/null 2>&1 || \
     git remote add cyberchef-upstream https://github.com/gchq/CyberChef.git
   npm run vendor:add
   ```

   Local bootstrap/fallback path:

   ```bash
   npm run vendor:cyberchef
   ```

3. Install dependencies in the vendored CyberChef checkout:

   ```bash
   npm run prepare:cyberchef
   ```

4. Generate wrapper icons from vendored CyberChef assets:

   ```bash
   npm run sync:icons
   ```

5. Build the staged CyberChef web bundle from vendored source:

   ```bash
   npm run build:web
   ```

6. Build the desktop app:

   ```bash
   npm run tauri build
   ```

7. Run the desktop app in development mode:

   ```bash
   npm run tauri dev
   ```

## Release Flow

The dedicated update and release guide lives in
[docs/UPDATING.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/UPDATING.md).

The canonical release tag is derived from both versions:

```bash
v<app-version>-cyberchef.<cyberchef-version>
```

For the current vendored tree, the metadata command is:

```bash
npm run release:meta
```

The consistency check command is:

```bash
npm run release:check
```

Recommended release sequence:

1. Update vendored CyberChef:

   ```bash
   npm run vendor:pull
   ```

2. Install vendored dependencies and verify the build:

   ```bash
   npm run prepare:cyberchef
   npm run release:check
   npm run tauri build
   ```

3. Commit with both versions in the message:

   ```bash
   git commit -m "chore(release): app 0.1.0 with CyberChef 10.23.0"
   ```

4. Create the combined tag:

   ```bash
   git tag -a v0.1.0-cyberchef.10.23.0 -m "App 0.1.0 bundled with CyberChef 10.23.0"
   ```

5. Push the branch and tag. The release workflow will validate the tag, build the
   macOS DMG, and publish a GitHub release.

## GitHub Actions

- `.github/workflows/ci.yml`: macOS validation on pushes and pull requests
- `.github/workflows/release.yml`: tag-driven macOS release build and GitHub release

## Why The Wrapper Builds CyberChef Itself

This repository intentionally does not consume CyberChef's website release ZIP or
full release task. Instead, it vendors CyberChef source and runs only the web
bundle steps needed for Tauri:

```bash
npx grunt clean:prod clean:config exec:generateConfig findModules webpack:web
```

That keeps the wrapper focused on the app use case and avoids unrelated release
steps.

## Current Status

- The wrapper project can build a local macOS `.app` from vendored CyberChef
  source in this repository.
- The primary installer output is currently:

  ```bash
  src-tauri/target/release/bundle/macos/*.dmg
  ```

- The wrapper is configured to emit both a macOS `.app` bundle and a `.dmg`
  installer, with the DMG used as the downloadable GitHub artifact.

## Notes

- `npm run vendor:add` seeds `vendor/cyberchef/` as a subtree.
- `npm run vendor:pull` updates vendored CyberChef with one command.
- `npm run vendor:cyberchef` remains available as a local bootstrap/fallback
  import path and records the imported version/commit.
- `npm run release:check` verifies app version alignment, vendored version
  alignment, and tag consistency when a release tag is provided.
- `npm run release:meta` prints the combined release metadata and expected tag.
- `npm run tauri build` and `npm run build:web` use `vendor/cyberchef/` by
  default.
- `npm run build:web` respects CyberChef's `.nvmrc` when `nvm` is available.
- The expected CyberChef runtime in the current checkout is Node `18`.
- `npm run doctor` prints the vendored CyberChef path, import metadata, and
  staging location.

## Next Work

If you continue development in this folder, likely next tasks belong here:

- improve window sizing, title, and platform behavior in `src-tauri/tauri.conf.json`
- add native menu/tray/deep-linking if needed
- add signing/notarization/release packaging later, separately from local app use
- make the wrapper configurable for other platforms if you need Windows/Linux
- add a pinned release or patch-management layer if you want stricter upgrade control
