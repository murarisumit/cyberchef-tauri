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
- [wrapper-assets/settings.html](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/settings.html)
- [wrapper-assets/tauri-settings.css](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-settings.css)
- [wrapper-assets/tauri-settings.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-settings.js)

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
- save modal gets `Open Folder` and `Change Folder` buttons
- saved recipes are stored in the chosen recipe folder
- default recipe storage remains the app data directory under `recipes/`
- the settings window can choose or reset the recipe folder
- load dropdown is populated from that folder
- delete removes the saved recipe file from that folder

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [wrapper-assets/settings.html](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/settings.html)
- [wrapper-assets/tauri-settings.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-settings.js)
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

### Desktop settings window

The wrapper exposes a dedicated Tauri settings window so desktop-owned settings
and reset actions no longer need to live as a long menu list.

Behavior:

- the app menu now exposes `Open Settings`
- the settings window shows the current config folder, recipe folder, and the
  desktop-owned file paths for favorites, options, session, and window state
- reload and reset actions for settings, favorites, session, and window state
  are triggered from that window
- session and window actions target the workspace window that opened settings

Primary implementation:

- [wrapper-assets/settings.html](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/settings.html)
- [wrapper-assets/tauri-settings.css](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-settings.css)
- [wrapper-assets/tauri-settings.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-settings.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

### Desktop favorites config

The upstream CyberChef favourites list is browser-oriented and stored in
`localStorage`. In the desktop app, this wrapper mirrors the favourites UI to a
real JSON config file so the list can be edited outside the app and kept under
user control.

Behavior:

- favourites are loaded from a desktop config file on startup
- edits made through CyberChef's built-in favourites UI save back to that file
- returning focus to the app reloads the config file
- the settings window can reload or reset favourites
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
- the settings window can reload or reset settings
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

- the current working recipe and the full input tab set are saved to a desktop session file
- input and output encoding/EOL settings are saved per tab
- the Auto Bake toggle is saved with the session
- the active input and output tab selection are saved with the session
- the last saved session is restored automatically on startup
- the settings window can reload or reset the session
- the main window uses `~/.config/cyberchef/session.json`
- additional native windows use `~/.config/cyberchef/windows/<label>/session.json`

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

Upstream touchpoints this customization depends on:

- `window.app.getRecipeConfig`, `window.app.setRecipeConfig`
- `window.app.manager.input.getInputNums`, `getInputObj`, `clearAllIoClick`, `addInput`, `changeTab`
- `window.app.manager.output.outputs`, `changeTab`
- `window.app.manager.controls.setAutoBake`
- `statechange` continuing to represent meaningful workspace updates

Review impact when upstream changes:

- recipe or tab restore semantics change
- input/output worker APIs or tab numbering behavior change
- the Auto Bake control flow changes
- CyberChef changes how active workspace state is represented

### Native macOS window tabs

The Tauri shell can open additional desktop windows with the same macOS
tabbing identifier so AppKit groups them as native window tabs, like Safari.

Behavior:

- the `Tabs` menu exposes `New Tab` with `CmdOrCtrl+T`
- each new native tab is backed by a separate Tauri window with the shared
  `cyberchef` tabbing identifier
- open native tabs are recorded in `window-registry.json` and restored on launch
- each native tab gets its own session and window-state files
- shared favorites and options remain app-wide

Primary implementation:

- [src-tauri/tauri.conf.json](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/tauri.conf.json)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

### Desktop config directory override

Desktop-owned state normally lives in `~/.config/cyberchef`, but the wrapper
also supports redirecting that config tree to another folder under user control.

Behavior:

- the settings window exposes `Open Folder`, `Choose Folder`, and `Use Default`
- an override can also be set with the `CYBERCHEF_CONFIG_DIR` environment variable
- settings-window overrides are recorded in `~/.config/cyberchef/config-dir.json`
- changing the config folder immediately reloads favorites, settings, and session state from the new location

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

Review impact when upstream changes:

- desktop config ownership expands to more files or settings
- menu event wiring changes
- platform-specific folder picker behavior changes

### Desktop window state

The Tauri shell also persists window state as desktop-owned config instead of
relying on platform defaults only.

Behavior:

- window size, position, and maximized state are saved to `window.json`
- the main window uses `~/.config/cyberchef/window.json`
- additional native windows use `~/.config/cyberchef/windows/<label>/window.json`
- the settings window exposes `Reset Window State`

Primary implementation:

- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)

Review impact when upstream changes:

- Tauri window APIs or event semantics change
- macOS window tabbing behavior changes
- the app gains additional multi-window flows that need separate persistence

### Desktop deep links

Upstream CyberChef builds its `Deep link` URL from `window.location`. Inside the
Tauri shell that resolves to `tauri://localhost/`, which means nothing outside
the app and is indistinguishable from any other Tauri app. The wrapper registers
a real `cyberchef-tauri://` URL scheme and rewrites that one link onto it.

Behavior:

- the `Deep link` shown in the save pane reads `cyberchef-tauri://localhost/#recipe=...`
- opening such a link launches the app if it is not running, and loads the
  recipe and input into a window
- an incoming link on an already-running app opens a **new** workspace window
  (a native tab on macOS) so it never overwrites unsaved work
- on a cold start the link loads into the window the app opens anyway
- a link applied at startup suppresses the saved-session restore for that window,
  matching how upstream lets URL state win over stored state
- the address bar URL that `App.updateTitle` hands to `history.replaceState` is
  deliberately left on `tauri://localhost/`; swapping the document origin there
  would throw

Primary implementation:

- [wrapper-assets/tauri-desktop.js](/Users/sumitmurari/workspace/personal/cyberchef-tauri/wrapper-assets/tauri-desktop.js)
- [src-tauri/src/main.rs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/src/main.rs)
- [src-tauri/Info.plist](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/Info.plist)
- [src-tauri/Cargo.toml](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/Cargo.toml)

Scheme registration is platform-specific:

- macOS reads `CFBundleURLSchemes` from the bundled `Info.plist`. The Tauri
  bundler merges `src-tauri/Info.plist` into the app bundle, so the scheme only
  exists in a bundled build. `npm run tauri dev` cannot receive deep links on
  macOS; use `npm run tauri build -- --debug` and open the built `.app` once so
  Launch Services registers it.
- Windows and Linux registration happens at runtime, the first time the app runs
  and `tauri_plugin_deep_link::register` is called.

Upstream touchpoints this customization depends on:

- `window.app.manager.controls.initialiseSaveLink(recipeConfig)`
- `#save-link` carrying the generated URL in its `href`
- `window.app.loadURIParams()` reading state from the URL fragment
- `ControlsWaiter.generateStateUrl` keeping all state in the fragment, not the
  query string

Review impact when upstream changes:

- `initialiseSaveLink` is renamed, inlined, or stops writing `#save-link`
- state moves from the URL fragment into the query string
- `loadURIParams` stops being callable without arguments

### About panel version

macOS renders its standard About panel as
`Version <CFBundleShortVersionString> (<CFBundleVersion>)`. Tauri fills the
first from the app version and the second with a build timestamp, so the panel
said nothing about which CyberChef the build actually contains.

Behavior:

- the About panel reads `Version <app version> (CyberChef <vendored version>)`,
  e.g. `Version 0.1.6 (CyberChef 11.4.0)`
- the wrapper version and the vendored CyberChef version are both visible, and
  the CyberChef one is labelled so the two cannot be confused
- the build timestamp Tauri would otherwise put there is dropped

Primary implementation:

- [src-tauri/Info.plist](/Users/sumitmurari/workspace/personal/cyberchef-tauri/src-tauri/Info.plist)
- [scripts/lib.mjs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/scripts/lib.mjs)
- [scripts/release-check.mjs](/Users/sumitmurari/workspace/personal/cyberchef-tauri/scripts/release-check.mjs)

Why the plist and not Tauri's API: `MenuItem::About` carries an
`AboutMetadata` struct, but the macOS backend in Tauri 1.x discards it and calls
`orderFrontStandardAboutPanel:`, which reads the bundled `Info.plist` directly.
Setting the metadata in Rust has no effect. The bundler merges
`src-tauri/Info.plist` last, so the value there wins over the generated one.

Keeping it honest:

- `npm run vendor:update` rewrites `CFBundleVersion` via
  `syncInfoPlistBundleVersion`, on both the subtree and recovery import paths
- `npm run release:check` fails if `CFBundleVersion` drifts from the vendored
  CyberChef version, or if the key goes missing entirely

Review impact when upstream changes:

- the vendored CyberChef version scheme changes shape
- Tauri gains a working macOS About metadata API and this can move into Rust
## Automated Touchpoint Checks

`npm run wrapper:check` verifies the wrapper-owned markers listed above and
also asserts that the upstream touchpoints the desktop bridge depends on still
exist in `vendor/cyberchef`:

- the save/load modal element ids
- the `window.app` methods used for recipes, favourites, options, and sessions
- the `--primary-font-family` CSS variable used by the font override

That covers the integration points that fail silently at runtime. It does not
cover behavior, so the manual review below is still required.

## Update Review Checklist

When updating CyberChef, review at least these areas:

1. Build and staging still inject wrapper assets into the staged dist.
2. Desktop font override still applies to the intended UI and does not break icons or editor readability.
3. Save recipe opens the desktop-aware flow and stores files in the recipes folder.
4. Changing the recipe folder updates save/load behavior without restarting the app.
5. Load recipe lists saved files from the folder and loads them correctly.
6. Delete recipe removes the selected saved file from the folder.
7. Settings window opens and shows the current desktop folders and file paths.
8. Favorites reload from the desktop config file and in-app edits write back to it.
9. Options reload from the desktop config file and in-app edits write back to it.
10. Session restore saves and restores the full active tab set correctly.
11. Config folder override and reset actions still work.
12. Window state restores correctly.
13. Deep link in the save pane still reads `cyberchef-tauri://localhost/#...`.
14. Opening a `cyberchef-tauri://` link loads the recipe into the app.
15. About panel shows the wrapper version and the new CyberChef version.
16. Tauri app still builds and launches after the vendor update.

## Adding New Customizations

If a future change modifies upstream CyberChef behavior from the wrapper layer:

1. Add a short section here describing the behavior, files, and upstream touchpoints.
2. Add any required review steps to [docs/UPDATING.md](/Users/sumitmurari/workspace/personal/cyberchef-tauri/docs/UPDATING.md).
3. Prefer wrapper-owned assets and Tauri commands over direct edits inside `vendor/cyberchef` when practical.
