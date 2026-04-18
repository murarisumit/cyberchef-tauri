# Updating Vendored CyberChef

This is the primary maintenance operation for this repository.

Use this guide whenever you want to refresh `vendor/cyberchef`, verify the app
still builds, and optionally cut a release tied to the new CyberChef version.

## Model

- This repository is the source of truth for the desktop app.
- Upstream CyberChef is vendored into `vendor/cyberchef`.
- The preferred long-term update mechanism is `git subtree`.
- App versioning stays in this repository.
- CyberChef versioning stays in the vendored source and
  `vendor/cyberchef.vendor.json`.

## One-Time Setup

If you have not configured the upstream remote yet:

```bash
git remote get-url cyberchef-upstream >/dev/null 2>&1 || \
  git remote add cyberchef-upstream https://github.com/gchq/CyberChef.git
```

If this repository was bootstrapped without subtree history, seed the subtree:

```bash
npm run vendor:add
```

## Standard Update Flow

1. Pull the latest vendored CyberChef source:

   ```bash
   npm run vendor:pull
   ```

2. Install or refresh vendored CyberChef dependencies:

   ```bash
   npm run prepare:cyberchef
   ```

3. Validate release metadata consistency:

   ```bash
   npm run release:check
   npm run release:meta
   ```

4. Review wrapper-specific customizations before building:

   - Read
     [docs/WRAPPER_CUSTOMIZATIONS.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/WRAPPER_CUSTOMIZATIONS.md)
   - Re-check save/load recipe behavior in the desktop app
   - Re-check favorites config reload/save behavior in the desktop app
   - Re-check options config reload/save behavior in the desktop app
   - Re-check session restore/save behavior in the desktop app, including multiple tabs
   - Re-check config folder override behavior in the desktop app
   - Re-check window state restore behavior in the desktop app
   - Re-check wrapper-injected styling and any other desktop-only behavior

5. Build the desktop app:

   ```bash
   npm run tauri build
   ```

6. Manually sanity-check the built app:

   - app launches successfully
   - wrapper assets are still injected into the staged dist
   - font override still looks intentional
   - desktop recipe save/load/delete still works
   - desktop favorites config opens, reloads, and stays in sync with in-app edits
   - desktop options config opens, reloads, and stays in sync with in-app edits
   - desktop session restore brings back the last active tab set
   - desktop config folder override and default reset still work
   - desktop window state restores correctly

7. Commit the update:

   ```bash
   git commit -am "chore(vendor): update CyberChef to <version>"
   ```

## Release Flow After Update

Use this checklist when you are cutting a new app release and want Homebrew to
pick it up.

1. Cut the release in this repository:

   ```bash
   npm run release:cut
   ```

   Or set an explicit app version:

   ```bash
   npm run release:cut -- 0.2.0
   ```

2. Build the DMG and update your local Homebrew tap checkout:

   ```bash
   HOMEBREW_TAP_DIR=/absolute/path/to/homebrew-tap npm run release:bundle
   ```

   This is a local preflight step only. It lets you inspect the generated cask,
   but do not push the tap yet.

3. Push the app repository release commit and tag:

   ```bash
   git push
   git push --tags
   ```

4. Wait for the GitHub release workflow to finish and publish the release DMG.

5. Regenerate the tap cask from the published GitHub release asset, not from
   the local build:

   ```bash
   HOMEBREW_TAP_DIR=/absolute/path/to/homebrew-tap npm run release:tap:published
   ```

   The checksum in the tap must come from the exact DMG that GitHub serves for
   the release tag. Local and GitHub-built DMGs can differ.

6. In the Homebrew tap repository, commit and push the updated cask:

   ```bash
   cd /absolute/path/to/homebrew-tap
   git add Casks/cyberchef-tauri.rb
   git commit -m "cask: update cyberchef-tauri"
   git push
   ```

7. Upgrade from Homebrew:

   ```bash
   brew update
   brew upgrade --cask murarisumit/tap/cyberchef-tauri
   ```

If you want to inspect the next app version without committing or tagging:

```bash
npm run release:cut -- --dry-run
```

The GitHub release workflow validates the tag, builds the macOS installer
image, generates a matching Homebrew cask file, and publishes a GitHub release.

## Homebrew Tap

The Homebrew distribution for this app should be a cask, not a formula, because
the release artifact is a macOS `.dmg` containing `CyberChef.app`.

The canonical cask token is:

```bash
cyberchef-tauri
```

The tap should expose install and upgrade commands as:

```bash
brew tap murarisumit/tap
brew install --cask murarisumit/tap/cyberchef-tauri
brew upgrade --cask murarisumit/tap/cyberchef-tauri
```

To preview the tap update locally from this repository, set
`HOMEBREW_TAP_DIR` and run:

```bash
npm run release:bundle
```

Treat that output as a draft. Before committing the tap, regenerate the cask
from the published GitHub release DMG.

To fetch the published GitHub release DMG and write the final tap cask in one
step:

```bash
HOMEBREW_TAP_DIR=/absolute/path/to/homebrew-tap npm run release:tap:published
```

If you need to generate the cask manually from a built DMG instead:

```bash
npm run release:homebrew -- \
  --artifact ./src-tauri/target/release/bundle/dmg/<tauri-generated>.dmg \
  --output /absolute/path/to/homebrew-tap/Casks/cyberchef-tauri.rb
```

Important:

- Only point the cask at a GitHub release that already exists.
- `npm run release:bundle` is a local preflight helper. Do not rely on its
  checksum for the final tap update.
- Before committing the tap, run `npm run release:tap:published` so the
  checksum matches what Homebrew downloads from GitHub.
- The cask version should match the published release tag without the leading
  `v`.
- Do not update the tap to an unreleased local app version.

## Downloadable GitHub Artifacts

- `.github/workflows/release.yml` uploads a downloadable release artifact on the
  workflow run, uploads a generated Homebrew cask, and also publishes the same
  DMG plus cask file as GitHub release assets for tag-based releases.
- `.github/workflows/cyberchef-upstream-build.yml` runs daily, checks the
  current upstream CyberChef HEAD, and only builds a fresh DMG artifact when
  the vendored commit is behind.
- `.github/workflows/ci.yml` is a fast validation-only workflow that checks
  release metadata and wrapper customization markers without installing
  vendored dependencies, building the app, or uploading artifacts.

Tauri writes the macOS disk image into:

```bash
src-tauri/target/release/bundle/dmg/*.dmg
```

## Bootstrap or Recovery Path

If subtree state is not ready yet, you can refresh the vendor directory from a
local CyberChef checkout instead:

```bash
CYBERCHEF_IMPORT_DIR=/absolute/path/to/CyberChef npm run vendor:cyberchef
npm run prepare:cyberchef
```

This is a fallback path, not the preferred long-term update workflow.

## Sanity Checks

These commands should succeed after a healthy update:

```bash
npm run doctor
npm run release:check
npm run tauri build
```

Expected release tag format:

```bash
v<app-version>-cyberchef.<cyberchef-version>
```

## Common Failure Modes

- `npm run vendor:pull` fails:
  The subtree remote is missing or the repo was not seeded with subtree history
  yet. Add `cyberchef-upstream` and run `npm run vendor:add` once.

- `npm run prepare:cyberchef` fails:
  Re-run after a clean vendor refresh. The vendored dependency tree should be
  installed inside `vendor/cyberchef`, not copied from elsewhere.

- `npm run release:check` fails:
  Fix the mismatch between `package.json`, `src-tauri/tauri.conf.json`,
  `vendor/cyberchef/package.json`, and `vendor/cyberchef.vendor.json`.

- `npm run tauri build` fails after a vendor update:
  Treat that as a real integration issue between wrapper and vendored CyberChef,
  not as a release-tagging problem.

- Desktop-only wrapper behavior regresses after a vendor update:
  Compare the updated upstream save/load modal markup, event wiring, and
  favourites flow, options flow, session flow, and compiled CSS against
  [docs/WRAPPER_CUSTOMIZATIONS.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/WRAPPER_CUSTOMIZATIONS.md)
  and adjust the wrapper-owned integration points rather than patching the
  vendored dist output by hand.
