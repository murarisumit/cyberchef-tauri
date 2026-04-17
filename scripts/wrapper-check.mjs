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
        tauriMain,
        tauriConfig,
    ] = await Promise.all([
        readText("scripts/lib.mjs"),
        readText("wrapper-assets/tauri-desktop.js"),
        readText("wrapper-assets/tauri-font-override.css"),
        readText("src-tauri/src/main.rs"),
        readText("src-tauri/tauri.conf.json"),
    ]);

    requireIncludes("scripts/lib.mjs", libSource, [
        "tauri-font-override.css",
        "tauri-desktop.js",
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
        'button.id = "open-recipes-folder-button"',
        'button.textContent = "Open Folder"',
        'saveButton.textContent = "Save to Folder"',
        'invoke("recipe_storage_dir")',
        'invoke("save_recipe_file"',
        'invoke("list_recipe_files")',
        'invoke("delete_recipe_file"',
        'invoke("open_recipe_storage_dir")',
        'getElementById("save-button")',
        'getElementById("load-name")',
        'getElementById("load-delete-button")',
        'getElementById("save-footer")',
    ]);

    requireIncludes("src-tauri/src/main.rs", tauriMain, [
        'join("recipes")',
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
        '"dmg"',
    ]);

    console.log("Wrapper customization checks passed.");
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
