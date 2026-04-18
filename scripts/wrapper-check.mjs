import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {projectRoot} from "./lib.mjs";

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
    ] = await Promise.all([
        readText("scripts/lib.mjs"),
        readText("wrapper-assets/tauri-desktop.js"),
        readText("wrapper-assets/tauri-font-override.css"),
        readText("wrapper-assets/settings.html"),
        readText("wrapper-assets/tauri-settings.js"),
        readText("wrapper-assets/tauri-settings.css"),
        readText("src-tauri/src/main.rs"),
        readText("src-tauri/tauri.conf.json"),
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
    ]);

    requireIncludes("src-tauri/tauri.conf.json", tauriConfig, [
        '"distDir": "../.artifacts/cyberchef-dist"',
        '"identifier": "dev.sumit.cyberchef"',
        '"tabbingIdentifier": "cyberchef"',
        '"dmg"',
    ]);

    console.log("Wrapper customization checks passed.");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
