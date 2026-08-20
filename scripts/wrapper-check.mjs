import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {projectRoot, resolveCyberChefDir} from "./lib.mjs";

async function readText(relativePath) {
    return fs.readFile(path.join(projectRoot, relativePath), "utf8");
}

function requireIncludes(filePath, contents, expectedSnippets) {
    for (const snippet of expectedSnippets) {
        if (!contents.includes(snippet)) {
            throw new Error(`Missing expected marker in ${filePath}: ${snippet}`);
        }
    }
}


/**
 * Upstream markers the wrapper integrates against.
 *
 * These are not wrapper-owned. They live in vendored CyberChef and are the
 * contract the desktop bridge depends on, so a vendor update that renames or
 * removes any of them breaks desktop behavior at runtime rather than at build
 * time. Checking them here turns that into a build failure.
 */
const upstreamTouchpoints = {
    "src/web/html/index.html": [
        'id="save-button"',
        'id="save-name"',
        'id="save-footer"',
        'id="load-name"',
        'id="load-text"',
        'id="load-delete-button"',
        // The deep link the desktop app rewrites onto the cyberchef-tauri:// scheme.
        'id="save-link"',
    ],
    // generateStateUrl must keep all state in the URL fragment. The desktop
    // bridge splits the save-pane link on "#", and applies an inbound deep link
    // by writing the fragment back. If upstream moves state into the query
    // string, both halves break silently.
    "src/web/waiters/ControlsWaiter.mjs": [
        "return `${link}#${hash}`;",
    ],
    // loadURIParams must stay callable with no arguments: the deep-link handler
    // sets the fragment, then lets CyberChef re-read it.
    "src/web/App.mjs": [
        "loadURIParams(params=this.getURIParams())",
    ],
};

const upstreamAppApis = [
    "getRecipeConfig",
    "setRecipeConfig",
    "saveFavourites",
    "loadFavourites",
    "populateOperationsList",
    "initialiseOperationDragNDrop",
    "updateOption",
    "resetOptionsClick",
    "setAutoBake",
    "getInputNums",
    "getInputObj",
    "addInput",
    "clearAllIoClick",
    // Wrapped by the desktop bridge to rewrite the save-pane deep link.
    "initialiseSaveLink",
    "loadURIParams",
];

async function collectSourceText(rootDir) {
    const chunks = [];

    async function walk(currentDir) {
        const entries = await fs.readdir(currentDir, {withFileTypes: true});

        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                await walk(entryPath);
                continue;
            }

            if (entry.name.endsWith(".mjs")) {
                chunks.push(await fs.readFile(entryPath, "utf8"));
            }
        }
    }

    await walk(rootDir);
    return chunks.join("\n");
}

async function checkVendoredTouchpoints() {
    const cyberChefDir = await resolveCyberChefDir({optional: true});

    if (!cyberChefDir) {
        console.log("Vendored CyberChef not present, skipping upstream touchpoint checks.");
        return;
    }

    for (const [relativePath, snippets] of Object.entries(upstreamTouchpoints)) {
        const contents = await fs.readFile(path.join(cyberChefDir, relativePath), "utf8");
        requireIncludes(`vendor/cyberchef/${relativePath}`, contents, snippets);
    }

    const webSource = await collectSourceText(path.join(cyberChefDir, "src", "web"));

    // Matched on word boundaries so a rename that merely extends the name,
    // such as setAutoBake becoming setAutoBakeState, is still reported.
    const missingApis = upstreamAppApis.filter(
        api => !new RegExp(`\\b${api}\\b`).test(webSource)
    );

    if (missingApis.length) {
        throw new Error(
            `Vendored CyberChef no longer exposes wrapper-required APIs: ${missingApis.join(", ")}\n` +
                "Review docs/WRAPPER_CUSTOMIZATIONS.md and update the desktop bridge."
        );
    }

    const stylesheetSource = await collectStylesheetText(
        path.join(cyberChefDir, "src", "web", "stylesheets")
    );

    if (!stylesheetSource.includes("--primary-font-family")) {
        throw new Error(
            "Vendored CyberChef no longer defines --primary-font-family, " +
                "which the desktop font override depends on."
        );
    }
}

async function collectStylesheetText(rootDir) {
    const chunks = [];

    async function walk(currentDir) {
        const entries = await fs.readdir(currentDir, {withFileTypes: true});

        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                await walk(entryPath);
                continue;
            }

            if (entry.name.endsWith(".css")) {
                chunks.push(await fs.readFile(entryPath, "utf8"));
            }
        }
    }

    await walk(rootDir);
    return chunks.join("\n");
}

try {
    const [
        libSource,
        desktopBridge,
        fontOverride,
        settingsPage,
        settingsScript,
        settingsStyles,
        tauriMain,
        tauriConfig,
        tauriManifest,
        tauriInfoPlist,
    ] = await Promise.all([
        readText("scripts/lib.mjs"),
        readText("wrapper-assets/tauri-desktop.js"),
        readText("wrapper-assets/tauri-font-override.css"),
        readText("wrapper-assets/settings.html"),
        readText("wrapper-assets/tauri-settings.js"),
        readText("wrapper-assets/tauri-settings.css"),
        readText("src-tauri/src/main.rs"),
        readText("src-tauri/tauri.conf.json"),
        readText("src-tauri/Cargo.toml"),
        readText("src-tauri/Info.plist"),
    ]);

    requireIncludes("scripts/lib.mjs", libSource, [
        "tauri-font-override.css",
        "tauri-desktop.js",
        "settings.html",
        "tauri-settings.js",
        "tauri-settings.css",
        '<link href="tauri-font-override.css" rel="stylesheet">',
        '<script defer="defer" src="tauri-desktop.js"></script>',
        "applyWrapperOverrides",
    ]);

    requireIncludes("wrapper-assets/tauri-font-override.css", fontOverride, [
        "Trebuchet MS",
        "--primary-font-family",
        ".material-icons",
        ".cm-editor",
        "var(--fixed-width-font-family)",
    ]);

    requireIncludes("wrapper-assets/tauri-desktop.js", desktopBridge, [
        "__TAURI__",
        'openButton.id = "open-recipes-folder-button"',
        'openButton.textContent = "Open Folder"',
        'chooseButton.id = "choose-recipes-folder-button"',
        'chooseButton.textContent = "Change Folder"',
        'saveButton.textContent = "Save to Folder"',
        'invoke("load_favorites_config")',
        'invoke("save_favorites_config"',
        'invoke("load_options_config")',
        'invoke("save_options_config"',
        'invoke("load_session_config")',
        'invoke("save_session_config"',
        'listen("desktop://reload-settings"',
        'listen("desktop://config-dir-changed"',
        'listen("desktop://recipe-storage-dir-changed"',
        "window.app.manager.options.load(settings)",
        "optionsWaiter.updateOption = function(option, value)",
        'listen("desktop://reload-favorites"',
        'listen("desktop://reload-session"',
        'window.app.saveFavourites = function(favourites)',
        'window.addEventListener("statechange", scheduleSessionSave)',
        'window.app.manager.input.getInputNums()',
        'window.app.manager.input.getInputObj(inputNum)',
        'window.app.manager.input.clearAllIoClick()',
        'window.app.manager.input.addInput(false)',
        'window.app.manager.output.changeTab(activeOutputTab, false)',
        "window.app.setRecipeConfig(",
        'alertUser(`Config folder changed to ${event.payload}.`, 3500)',
        'alertUser("Session restored from config.", 3000)',
        'invoke("recipe_storage_dir")',
        'invoke("choose_recipe_storage_dir")',
        'invoke("save_recipe_file"',
        'invoke("list_recipe_files")',
        'invoke("delete_recipe_file"',
        'invoke("open_recipe_storage_dir")',
        'getElementById("save-button")',
        'getElementById("load-name")',
        'getElementById("load-delete-button")',
        'getElementById("save-footer")',
        'const DEEP_LINK_SCHEME_PREFIX = "cyberchef-tauri://"',
        'const DEEP_LINK_BASE_URL = "cyberchef-tauri://localhost/"',
        "controls.initialiseSaveLink = function(recipeConfig)",
        'getElementById("save-link")',
        'invoke("take_pending_deep_link")',
        'invoke("mark_deep_link_ready")',
        "window.history.replaceState({}, \"\", `#${hash}`)",
        "app.loadURIParams()",
        "await initialiseDeepLinks();",
    ]);

    requireIncludes("wrapper-assets/settings.html", settingsPage, [
        '<nav aria-label="Settings tabs" class="tabbar" role="tablist">',
        'data-tab-target="panel-storage"',
        'data-tab-panel="panel-actions"',
        'data-action="choose_recipe_storage_dir"',
        'data-action="choose_config_dir_from_settings"',
        'data-action="reload_settings_now"',
        'data-action="reset_window_state_now"',
    ]);

    requireIncludes("wrapper-assets/tauri-settings.js", settingsScript, [
        'invoke("load_desktop_settings")',
        'listen("desktop://settings-context-changed"',
        'listen("desktop://config-dir-changed"',
        'listen("desktop://recipe-storage-dir-changed"',
        'setStatus(`Could not complete action: ${error}`, "error")',
    ]);

    requireIncludes("wrapper-assets/tauri-settings.css", settingsStyles, [
        "--bg:",
        ".tabbar",
        ".tab-button.is-active",
        ".tab-panel",
        ".setting-row",
        ".action-row",
        ".status.is-error",
    ]);

    requireIncludes("src-tauri/src/main.rs", tauriMain, [
        'join("receipes")',
        'join("recipes")',
        'join(".config").join("cyberchef")',
        'join("favorite.json")',
        'join("options.json")',
        'join("session.json")',
        'join("window.json")',
        'join("window-registry.json")',
        'join("config-dir.json")',
        'join("recipe-dir.json")',
        "fn load_favorites_config",
        "fn save_favorites_config",
        "fn reset_favorites_config",
        "fn load_options_config",
        "fn save_options_config",
        "fn reset_options_config",
        "fn load_session_config",
        "fn save_session_config",
        "fn reset_session_config",
        "fn open_config_dir",
        "fn choose_config_dir_from_settings",
        "fn choose_recipe_storage_dir",
        "fn load_desktop_settings",
        "fn open_settings_window_for",
        "fn open_settings",
        "fn reload_settings_now",
        "fn reset_window_state_now",
        "fn save_window_state",
        "fn reset_window_state",
        "fn new_native_tab",
        'Menu::os_default(app_name)',
        '"Tabs"',
        '"New Tab"',
        '.accelerator("CmdOrCtrl+T")',
        '"Settings"',
        '"Open Settings"',
        '"CyberChef Settings"',
        '"settings.html"',
        'emit_all("desktop://reload-favorites", ())',
        'emit_all("desktop://reload-settings", ())',
        '.emit("desktop://reload-session", ())',
        'emit_all("desktop://config-dir-changed",',
        '"desktop://recipe-storage-dir-changed",',
        '.emit("desktop://settings-context-changed", ())',
        "fn recipe_storage_dir",
        "fn save_recipe_file",
        "fn list_recipe_files",
        "fn delete_recipe_file",
        "fn open_recipe_storage_dir",
        "tauri::generate_handler![",
        'const DEEP_LINK_IDENTIFIER: &str = "dev.murarisumit.cyberchef"',
        'const DEEP_LINK_SCHEME: &str = "cyberchef-tauri"',
        'const DEEP_LINK_URL_PREFIX: &str = "cyberchef-tauri://"',
        "tauri_plugin_deep_link::prepare(DEEP_LINK_IDENTIFIER)",
        "tauri_plugin_deep_link::register(DEEP_LINK_SCHEME,",
        "fn handle_deep_link(app: &tauri::AppHandle, url: String)",
        "fn open_deep_link_window(app: &tauri::AppHandle) -> Result<(), String>",
        "fn take_pending_deep_link(app: tauri::AppHandle) -> Result<Option<String>, String>",
        "fn mark_deep_link_ready(app: tauri::AppHandle) -> Result<(), String>",
        "pending_deep_links: Mutex<Vec<String>>",
        "deep_link_ready: Mutex<bool>",
    ]);

    requireIncludes("src-tauri/tauri.conf.json", tauriConfig, [
        '"distDir": "../.artifacts/cyberchef-dist"',
        '"identifier": "dev.murarisumit.cyberchef"',
        '"tabbingIdentifier": "cyberchef"',
        '"dmg"',
    ]);

    requireIncludes("src-tauri/Cargo.toml", tauriManifest, [
        'tauri-plugin-deep-link = "0.1.2"',
    ]);

    // macOS registers the scheme from the bundled Info.plist, which the Tauri
    // bundler merges from this file. Without it the plugin silently never fires.
    requireIncludes("src-tauri/Info.plist", tauriInfoPlist, [
        // The About panel renders CFBundleVersion; release:check pins its value.
        "<key>CFBundleVersion</key>",
        "<string>CyberChef ",
        "<key>CFBundleURLTypes</key>",
        "<key>CFBundleURLSchemes</key>",
        "<string>cyberchef-tauri</string>",
        "<string>dev.murarisumit.cyberchef</string>",
    ]);

    await checkVendoredTouchpoints();

    console.log("Wrapper customization checks passed.");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
