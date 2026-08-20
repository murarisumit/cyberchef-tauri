# AGENTS.md

## Purpose

This repository packages a vendored CyberChef checkout as a Tauri desktop app.
Agents working here should optimize for reliable local packaging, clear release
versioning, and offline-friendly workflows.

## Core Expectations

- Be opinionated about Tauri.
- Prefer native Tauri mechanisms over ad hoc shell packaging.
- Keep the wrapper layer in this repository and keep CyberChef source vendored
  under `vendor/cyberchef`.
- Treat this repository as the source of truth for the desktop app.

## Tauri Expertise

When changing Tauri-related code or config:

- Understand `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the
  bundle output paths before making changes.
- Prefer bundle targets and workflow changes that produce installable artifacts,
  especially macOS `.dmg`.
- Keep app metadata aligned across:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - release tags and release metadata scripts
- Preserve a clean separation between:
  - vendored app source
  - Tauri packaging
  - GitHub Actions release automation

## Offline-First Rules

- Do not assume network access.
- Prefer local binaries over network-resolving commands.
- Avoid `npx` when a dependency should already exist locally.
- Do not introduce workflows that require downloading from the internet during
  normal local builds unless there is no practical alternative.
- If a build depends on installed vendored dependencies, say that explicitly.
- If a command would fail offline, document the prerequisite rather than hiding
  the dependency.

## Vendored CyberChef Rules

- Default source location is `vendor/cyberchef`.
- Preferred upstream refresh path is subtree-based, not sibling-checkout based.
- Keep update instructions centered around `docs/UPDATING.md`.
- Do not reintroduce a required `../cyberchef` workflow as the primary path.
- Treat `scripts/vendor-cyberchef.mjs` as bootstrap or recovery only.

## Vendor Update Runbook

Every vendored CyberChef bump follows this sequence. Do not skip steps because
a bump looks routine.

1. Work on a branch. Never commit a vendor bump directly to `main`.
2. Load the commit signing key before starting. The subtree import ends in a
   merge commit and a locked key stalls it partway through.
3. Run `npm run vendor:update -- <version>`.
4. Diff the upstream range against the wrapper touchpoints in
   `docs/WRAPPER_CUSTOMIZATIONS.md` before trusting the bump.
5. Run the validation gates below.
6. Open a PR that states what was validated and what was not.

## Validation Gates

These run in CI on every pull request and should also be run locally before
opening one:

- `npm run release:check`
- `npm run wrapper:check`
- `npm run doctor`
- `npm run build:web`
- `npm run tauri build`

Gate results are reported, not summarized away. A gate that was not run is
called out explicitly as not run.

## Verification Rules

- A new check must be proven able to fail. Mutate the thing it guards, confirm
  it reports, then restore. A check that has only ever passed is not evidence.
- Prefer failures at build time over failures at runtime. Upstream touchpoints
  that break silently in the desktop app belong in `wrapper:check`.
- Match identifiers on word boundaries, not as substrings. A rename that
  extends a name must still be caught.
- Never report a manual desktop check as done unless it was actually performed
  against a built app.
- Keep unrelated untracked files out of vendor bump commits.

## Build And Release Rules

- Prefer `npm run prepare:cyberchef`, `npm run release:check`, and
  `npm run tauri build` as the canonical validation path.
- Release tags should follow:
  - `v<app-version>-cyberchef.<cyberchef-version>`
- GitHub Actions artifacts should be downloadable installer artifacts when
  possible, not raw intermediate directories.
- For macOS distribution, prefer `.dmg` over `.app` as the release artifact.

## Documentation Rules

- Keep `README.md` high-level.
- Put high-frequency operational guidance in dedicated docs.
- When changing the update or release flow, update:
  - `docs/UPDATING.md`
  - `.github/workflows/*` if automation changes
  - release metadata/check scripts if version semantics change

## Decision Biases

- Prefer maintainability over cleverness.
- Prefer deterministic local builds over convenience wrappers.
- Prefer explicit version coupling over implicit release state.
- Prefer small, composable scripts over one large release script.
