# CyberChef Desktop

[CyberChef](https://github.com/gchq/CyberChef) as a native desktop app, packaged
with Tauri. Same CyberChef you know, with the parts that a browser tab cannot
give you: recipes saved as real files on disk, config you can read and edit,
native windows and tabs, and a session that survives a restart.

Everything runs locally. No data leaves your machine.

## Install

### Homebrew (recommended)

```bash
brew install --cask murarisumit/tap/cyberchef-tauri
```

### Direct download

Grab the `.dmg` from the [latest release](https://github.com/murarisumit/cyberchef-tauri/releases/latest)
and drag `CyberChef.app` into `/Applications`.

### "CyberChef is damaged and can't be opened"

macOS shows this on first launch. The app is not corrupt — it is not signed with
an Apple Developer ID, and macOS quarantines downloads from unidentified
developers. Gatekeeper reports it as "damaged" rather than showing the usual
"unidentified developer" prompt.

Install without the quarantine flag:

```bash
brew install --cask --no-quarantine murarisumit/tap/cyberchef-tauri
```

Or clear it on a copy you already installed:

```bash
xattr -dr com.apple.quarantine /Applications/CyberChef.app
codesign --force --deep --sign - /Applications/CyberChef.app
```

Only do this for builds you got from the official release page or tap.

## Using the app

### Recipes are files, not browser storage

Upstream CyberChef saves recipes into browser local storage, which disappears
when you clear your profile. This app saves them to a folder instead:

- **Save to Folder** writes the recipe to your recipes folder
- **Open Folder** reveals it in Finder
- **Change Folder** points the app somewhere else, e.g. a synced or versioned directory
- **Load recipe** lists what is in that folder, and can delete entries

### Deep links

The `Deep link` in the save pane uses the app's own URL scheme, so it opens the
desktop app rather than a website:

```bash
open "cyberchef-tauri://localhost/#recipe=To_Base64('A-Za-z0-9%2B/%3D')&input=aGk"
```

Opening one launches the app if it is not running. If it is already running, the
link opens in a **new** window (a native tab on macOS) so it never overwrites
what you are working on.

### Windows and tabs

`Cmd+T` opens a new window, tabbed natively on macOS. Each window keeps its own
input tabs, session, and window geometry, all restored on next launch.

### Settings

`CyberChef → Settings` opens a native settings window covering:

- which folder recipes are stored in
- which folder config is read from
- reloading favorites, options, or session from disk
- resetting favorites, options, session, or window state

### Where your data lives

| What | Path |
|---|---|
| Config folder | `~/.config/cyberchef` |
| Favorites | `~/.config/cyberchef/favorite.json` |
| Options | `~/.config/cyberchef/options.json` |
| Session | `~/.config/cyberchef/session.json` |
| Window state | `~/.config/cyberchef/window.json` |
| Recipes | app data directory, under `recipes/` |

Set `CYBERCHEF_CONFIG_DIR` to move the config folder, or change it from the
settings window. Both the config and recipe folders are plain files — read them,
edit them, put them in version control.

## Updating

```bash
brew upgrade --cask murarisumit/tap/cyberchef-tauri
```

Releases are tagged `v<app-version>-cyberchef.<cyberchef-version>` so you can
always tell which CyberChef version a build contains.

## Uninstalling

```bash
brew uninstall --cask murarisumit/tap/cyberchef-tauri
rm -rf ~/.config/cyberchef   # optional: also removes saved config
```

## Contributing

Development setup, repository layout, and the vendoring model are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

CyberChef is developed by [GCHQ](https://github.com/gchq/CyberChef) and licensed
under Apache 2.0. This repository only packages it as a desktop app.
