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

4. Build the desktop app:

   ```bash
   npm run tauri build
   ```

5. Commit the update:

   ```bash
   git commit -am "chore(vendor): update CyberChef to <version>"
   ```

## Release Flow After Update

If the update is also a release:

1. Bump the app version in:

   - `package.json`
   - `src-tauri/tauri.conf.json`

2. Re-run the checks:

   ```bash
   npm run release:check
   npm run release:meta
   ```

3. Commit the release:

   ```bash
   git commit -am "chore(release): app <app-version> with CyberChef <cyberchef-version>"
   ```

4. Create the release tag:

   ```bash
   git tag -a v<app-version>-cyberchef.<cyberchef-version> \
     -m "App <app-version> bundled with CyberChef <cyberchef-version>"
   ```

5. Push the branch and tag:

   ```bash
   git push
   git push --tags
   ```

The GitHub release workflow will validate the tag, build the macOS installer
image, and publish a GitHub release.

## Downloadable GitHub Artifacts

- `.github/workflows/ci.yml` uploads a downloadable `CyberChef-ci-macos.dmg`
  artifact on push and pull request runs.
- `.github/workflows/release.yml` uploads a downloadable release artifact on the
  workflow run and also publishes the same DMG as a GitHub release asset for
  tag-based releases.
- `.github/workflows/cyberchef-upstream-build.yml` runs daily, checks the
  current upstream CyberChef HEAD, and only builds a fresh DMG artifact when
  the vendored commit is behind.

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
