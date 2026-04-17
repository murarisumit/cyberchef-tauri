# Wrapper Customizations

This document tracks desktop-specific behavior that this repository layers on
top of upstream CyberChef without maintaining a long-lived fork.

Review this file whenever `vendor/cyberchef` is updated.

## Current Customizations

### Staged asset injection

The wrapper does not edit upstream-built files in `vendor/cyberchef/build/prod`
directly. Instead, it stages the CyberChef production build into
`.artifacts/cyberchef-dist/` and injects wrapper-owned assets there.

Primary implementation:

- [scripts/lib.mjs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/scripts/lib.mjs)

Injected assets:

- [wrapper-assets/tauri-font-override.css](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-font-override.css)
- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)

Review impact when upstream changes:

- `index.html` head structure changes
- asset loading order changes
- Bootstrap or theme CSS specificity changes

### Desktop font override

The desktop wrapper overrides the default CyberChef UI font to use
`Trebuchet MS` for the general app chrome while preserving:

- `Material Icons` for icon glyphs
- CodeMirror and code-like content as monospace

Primary implementation:

- [wrapper-assets/tauri-font-override.css](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-font-override.css)

Review impact when upstream changes:

- theme variable names such as `--primary-font-family`
- Bootstrap Material font defaults
- editor DOM structure or class names such as `.cm-editor`

### Desktop recipe storage

The upstream CyberChef save/load recipe experience is browser-oriented and uses
`localStorage`. In the desktop app, this wrapper replaces that workflow with a
real recipes folder backed by Tauri commands.

Behavior:

- Save button becomes `Save to Folder`
- save modal gets an `Open Folder` button
- saved recipes are stored in the app data directory under `recipes/`
- load dropdown is populated from that folder
- delete removes the saved recipe file from that folder

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)
- [src-tauri/tauri.conf.json](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/tauri.conf.json)

Upstream touchpoints this customization depends on:

- `window.app` being available
- `#save-button`, `#load-name`, `#load-delete-button`, `#save-footer`
- `#save-name`, `#load-text`, `#load`
- save/load modals continuing to exist with roughly the same structure

Review impact when upstream changes:

- save/load modal markup or ids change
- save/load event listener behavior changes
- CyberChef stops exposing `window.app`
- Tauri IPC/global bridge behavior changes

## Update Review Checklist

When updating CyberChef, review at least these areas:

1. Build and staging still inject wrapper assets into the staged dist.
2. Desktop font override still applies to the intended UI and does not break icons or editor readability.
3. Save recipe opens the desktop-aware flow and stores files in the recipes folder.
4. Load recipe lists saved files from the folder and loads them correctly.
5. Delete recipe removes the selected saved file from the folder.
6. Tauri app still builds and launches after the vendor update.

## Adding New Customizations

If a future change modifies upstream CyberChef behavior from the wrapper layer:

1. Add a short section here describing the behavior, files, and upstream touchpoints.
2. Add any required review steps to [docs/UPDATING.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/UPDATING.md).
3. Prefer wrapper-owned assets and Tauri commands over direct edits inside `vendor/cyberchef` when practical.
