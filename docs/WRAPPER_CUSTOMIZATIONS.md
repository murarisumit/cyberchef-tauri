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

### Desktop favorites config

The upstream CyberChef favourites list is browser-oriented and stored in
`localStorage`. In the desktop app, this wrapper mirrors the favourites UI to a
real JSON config file so the list can be edited outside the app and kept under
user control.

Behavior:

- favourites are loaded from a desktop config file on startup
- edits made through CyberChef's built-in favourites UI save back to that file
- returning focus to the app reloads the config file
- a native `Settings` menu holds desktop configuration actions such as opening the favorites folder in Finder and triggering a reload
- the config file is created automatically with the default CyberChef favourites
- default path is `~/.config/cyberchef/favorite.json`

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

Upstream touchpoints this customization depends on:

- `window.app.saveFavourites`, `window.app.loadFavourites`
- `window.app.populateOperationsList`
- `window.app.manager.recipe.initialiseOperationDragNDrop`
- browser `localStorage` remaining available in the desktop webview

Review impact when upstream changes:

- favourites method names or call flow change
- the favourites category no longer refreshes through `populateOperationsList`
- CyberChef changes when or how it persists favourites locally
- Tauri menu or event bridge behavior changes

### Desktop options config

The upstream CyberChef options dialog is browser-oriented and stored in
`localStorage`. In the desktop app, the wrapper mirrors those settings to a
real JSON config file so general app behavior is owned by the desktop wrapper
instead of a webview profile.

Behavior:

- options are loaded from a desktop config file during app startup
- changes made through CyberChef's built-in options dialog save back to that file
- the `Settings` menu exposes `Open Config Folder` and `Reload Settings`
- the options config file is created automatically with the current desktop defaults
- default path is `~/.config/cyberchef/options.json`

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

Upstream touchpoints this customization depends on:

- `window.app.options`
- `window.app.manager.options.load`
- `window.app.manager.options.updateOption`
- `window.app.manager.options.resetOptionsClick`
- browser `localStorage` remaining available in the desktop webview

Review impact when upstream changes:

- options waiter method names or event flow change
- the options modal fields no longer map directly to `window.app.options`
- CyberChef changes when or how it loads theme and other options
- Tauri menu or event bridge behavior changes

### Desktop session restore

The upstream CyberChef app is largely browser-session oriented. In the desktop
app, the wrapper stores the current working session in a real JSON file so the
app can restore the last active workspace on launch.

Behavior:

- the current working recipe and current input are saved to a desktop session file
- input and output encoding/EOL settings are saved with the session
- the Auto Bake toggle is saved with the session
- the last saved session is restored automatically on startup
- default path is `~/.config/cyberchef/session.json`

Current scope:

- restores the current active workspace rather than the full multi-tab set

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

Upstream touchpoints this customization depends on:

- `window.app.getRecipeConfig`, `window.app.setRecipeConfig`
- `window.app.setInput`
- `window.app.manager.input.getInput`, `getChrEnc`, `getEOLSeq`
- `window.app.manager.output.getChrEnc`, `getEOLSeq`
- `window.app.manager.controls.setAutoBake`
- `statechange` continuing to represent meaningful workspace updates

Review impact when upstream changes:

- recipe or input setter semantics change
- input/output encoding or EOL APIs change
- the Auto Bake control flow changes
- CyberChef changes how active workspace state is represented

## Update Review Checklist

When updating CyberChef, review at least these areas:

1. Build and staging still inject wrapper assets into the staged dist.
2. Desktop font override still applies to the intended UI and does not break icons or editor readability.
3. Save recipe opens the desktop-aware flow and stores files in the recipes folder.
4. Load recipe lists saved files from the folder and loads them correctly.
5. Delete recipe removes the selected saved file from the folder.
6. Favorites reload from the desktop config file and in-app edits write back to it.
7. Options reload from the desktop config file and in-app edits write back to it.
8. Session restore saves and restores the current active workspace correctly.
9. Tauri app still builds and launches after the vendor update.

## Adding New Customizations

If a future change modifies upstream CyberChef behavior from the wrapper layer:

1. Add a short section here describing the behavior, files, and upstream touchpoints.
2. Add any required review steps to [docs/UPDATING.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/UPDATING.md).
3. Prefer wrapper-owned assets and Tauri commands over direct edits inside `vendor/cyberchef` when practical.
