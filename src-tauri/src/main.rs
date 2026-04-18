#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::Serialize;
use serde_json::json;
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{CustomMenuItem, Manager, Menu, Submenu};

#[derive(Serialize)]
struct StoredRecipe {
    file_name: String,
    name: String,
    recipe: String,
}

const DEFAULT_FAVORITES: &[&str] = &[
    "To Base64",
    "From Base64",
    "To Hex",
    "From Hex",
    "To Hexdump",
    "From Hexdump",
    "URL Decode",
    "Regular expression",
    "Entropy",
    "Fork",
    "Magic",
];

fn config_dir(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home_dir = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to resolve HOME for application config directory.".to_string())?;
    let dir = home_dir.join(".config").join("cyberchef");

    fs::create_dir_all(&dir).map_err(|error| {
        format!(
            "Unable to create config directory at {}: {error}",
            dir.display()
        )
    })?;

    Ok(dir)
}

fn favorites_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("favorite.json"))
}

fn options_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("options.json"))
}

fn session_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("session.json"))
}

fn recipes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| "Unable to resolve the application data directory.".to_string())?
        .join("recipes");

    fs::create_dir_all(&dir).map_err(|error| {
        format!(
            "Unable to create recipe directory at {}: {error}",
            dir.display()
        )
    })?;

    Ok(dir)
}

fn sanitise_recipe_stem(recipe_name: &str) -> String {
    let mut stem = String::new();

    for ch in recipe_name.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            stem.push(ch);
        } else if matches!(ch, ' ' | '-' | '_' | '(' | ')' | '[' | ']') {
            stem.push('_');
        }
    }

    let stem = stem.trim_matches('_').to_string();

    if stem.is_empty() {
        "recipe".to_string()
    } else {
        stem
    }
}

fn format_extension(format: &str) -> &'static str {
    match format {
        "chef" => "cyberchef",
        "clean-json" | "compact-json" => "recipe.json",
        _ => "recipe.txt",
    }
}

fn recipe_display_name(path: &Path) -> String {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("recipe");

    file_name
        .trim_end_matches(".recipe.json")
        .trim_end_matches(".cyberchef")
        .trim_end_matches(".recipe.txt")
        .replace('_', " ")
}

fn default_favorites() -> Vec<String> {
    DEFAULT_FAVORITES
        .iter()
        .map(|favorite| (*favorite).to_string())
        .collect()
}

fn default_options() -> serde_json::Value {
    json!({
        "updateUrl": true,
        "showHighlighter": true,
        "wordWrap": true,
        "showErrors": true,
        "errorTimeout": 4000,
        "attemptHighlight": true,
        "theme": "classic",
        "useMetaKey": false,
        "logLevel": "info",
        "autoMagic": true,
        "imagePreview": true,
        "syncTabs": true,
        "showCatCount": false
    })
}

fn default_session() -> serde_json::Value {
    json!({
        "recipe": [],
        "input": "",
        "inputChrEnc": 0,
        "inputEol": "LF",
        "outputChrEnc": 0,
        "outputEol": "LF",
        "autoBake": true
    })
}

fn write_favorites_config(path: &Path, favorites: &[String]) -> Result<(), String> {
    let contents =
        serde_json::to_string_pretty(&json!({"favorites": favorites})).map_err(|error| {
            format!(
                "Unable to serialize favorites config {}: {error}",
                path.display()
            )
        })?;

    fs::write(path, format!("{contents}\n")).map_err(|error| {
        format!(
            "Unable to write favorites config {}: {error}",
            path.display()
        )
    })
}

fn write_options_config(path: &Path, options: &serde_json::Value) -> Result<(), String> {
    let options = options.as_object().ok_or_else(|| {
        format!(
            "Unable to write options config {}: options payload must be a JSON object.",
            path.display()
        )
    })?;
    let contents = serde_json::to_string_pretty(options).map_err(|error| {
        format!(
            "Unable to serialize options config {}: {error}",
            path.display()
        )
    })?;

    fs::write(path, format!("{contents}\n"))
        .map_err(|error| format!("Unable to write options config {}: {error}", path.display()))
}

fn write_session_config(path: &Path, session: &serde_json::Value) -> Result<(), String> {
    let session = session.as_object().ok_or_else(|| {
        format!(
            "Unable to write session config {}: session payload must be a JSON object.",
            path.display()
        )
    })?;
    let contents = serde_json::to_string_pretty(session).map_err(|error| {
        format!(
            "Unable to serialize session config {}: {error}",
            path.display()
        )
    })?;

    fs::write(path, format!("{contents}\n"))
        .map_err(|error| format!("Unable to write session config {}: {error}", path.display()))
}

fn ensure_favorites_config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = favorites_config_path(app)?;

    if !path.exists() {
        write_favorites_config(&path, &default_favorites())?;
    }

    Ok(path)
}

fn ensure_options_config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = options_config_path(app)?;

    if !path.exists() {
        write_options_config(&path, &default_options())?;
    }

    Ok(path)
}

fn ensure_session_config(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = session_config_path(app)?;

    if !path.exists() {
        write_session_config(&path, &default_session())?;
    }

    Ok(path)
}

fn read_favorites_config(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let path = ensure_favorites_config(app)?;
    let contents = fs::read_to_string(&path).map_err(|error| {
        format!(
            "Unable to read favorites config {}: {error}",
            path.display()
        )
    })?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).map_err(|error| {
        format!(
            "Unable to parse favorites config {}: {error}. Expected JSON like {{\"favorites\": [\"To Base64\"]}}",
            path.display()
        )
    })?;

    let favorites = parsed
        .get("favorites")
        .and_then(|value| value.as_array())
        .ok_or_else(|| {
            format!(
                "Favorites config {} must contain a \"favorites\" array.",
                path.display()
            )
        })?;

    let mut parsed_favorites = Vec::with_capacity(favorites.len());

    for favorite in favorites {
        let favorite = favorite.as_str().ok_or_else(|| {
            format!(
                "Favorites config {} must contain only string entries in \"favorites\".",
                path.display()
            )
        })?;
        parsed_favorites.push(favorite.to_string());
    }

    Ok(parsed_favorites)
}

fn read_options_config(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = ensure_options_config(app)?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read options config {}: {error}", path.display()))?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).map_err(|error| {
        format!(
            "Unable to parse options config {}: {error}. Expected a JSON object like {{\"theme\": \"classic\"}}",
            path.display()
        )
    })?;

    if !parsed.is_object() {
        return Err(format!(
            "Options config {} must be a JSON object.",
            path.display()
        ));
    }

    Ok(parsed)
}

fn read_session_config(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = ensure_session_config(app)?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read session config {}: {error}", path.display()))?;
    let parsed: serde_json::Value = serde_json::from_str(&contents).map_err(|error| {
        format!(
            "Unable to parse session config {}: {error}. Expected a JSON object like {{\"recipe\": []}}",
            path.display()
        )
    })?;

    if !parsed.is_object() {
        return Err(format!(
            "Session config {} must be a JSON object.",
            path.display()
        ));
    }

    Ok(parsed)
}

fn open_path_in_system(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer");

    command.arg(path);
    command
        .spawn()
        .map_err(|error| format!("Unable to open {}: {error}", path.display()))?;

    Ok(())
}

#[tauri::command]
fn recipe_storage_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(recipes_dir(&app)?.display().to_string())
}

#[tauri::command]
fn load_favorites_config(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    read_favorites_config(&app)
}

#[tauri::command]
fn save_favorites_config(app: tauri::AppHandle, favorites: Vec<String>) -> Result<String, String> {
    let path = ensure_favorites_config(&app)?;
    write_favorites_config(&path, &favorites)?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn load_options_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    read_options_config(&app)
}

#[tauri::command]
fn save_options_config(
    app: tauri::AppHandle,
    options: serde_json::Value,
) -> Result<String, String> {
    let path = ensure_options_config(&app)?;
    write_options_config(&path, &options)?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn load_session_config(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    read_session_config(&app)
}

#[tauri::command]
fn save_session_config(
    app: tauri::AppHandle,
    session: serde_json::Value,
) -> Result<String, String> {
    let path = ensure_session_config(&app)?;
    write_session_config(&path, &session)?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn open_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = config_dir(&app)?;
    open_path_in_system(&dir)?;
    Ok(dir.display().to_string())
}

#[tauri::command]
fn save_recipe_file(
    app: tauri::AppHandle,
    recipe_name: String,
    recipe_contents: String,
    format: String,
) -> Result<String, String> {
    let dir = recipes_dir(&app)?;
    let file_name = format!(
        "{}.{}",
        sanitise_recipe_stem(&recipe_name),
        format_extension(&format)
    );
    let file_path = dir.join(file_name);

    fs::write(&file_path, recipe_contents)
        .map_err(|error| format!("Unable to save recipe to {}: {error}", file_path.display()))?;

    Ok(file_path.display().to_string())
}

#[tauri::command]
fn list_recipe_files(app: tauri::AppHandle) -> Result<Vec<StoredRecipe>, String> {
    let dir = recipes_dir(&app)?;
    let mut recipes = Vec::new();

    let entries = fs::read_dir(&dir)
        .map_err(|error| format!("Unable to read recipe directory {}: {error}", dir.display()))?;

    for entry in entries {
        let entry =
            entry.map_err(|error| format!("Unable to inspect saved recipe entry: {error}"))?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let recipe = fs::read_to_string(&path)
            .map_err(|error| format!("Unable to read recipe file {}: {error}", path.display()))?;
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| format!("Saved recipe path is not valid UTF-8: {}", path.display()))?
            .to_string();

        recipes.push(StoredRecipe {
            file_name,
            name: recipe_display_name(&path),
            recipe,
        });
    }

    recipes.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));

    Ok(recipes)
}

#[tauri::command]
fn delete_recipe_file(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    let dir = recipes_dir(&app)?;
    let file_path = dir.join(file_name);

    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|error| {
            format!(
                "Unable to delete recipe file {}: {error}",
                file_path.display()
            )
        })?;
    }

    Ok(())
}

#[tauri::command]
fn open_recipe_storage_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = recipes_dir(&app)?;
    open_path_in_system(&dir)?;
    Ok(dir.display().to_string())
}

fn build_app_menu(app_name: &str) -> Menu {
    let settings_menu = Submenu::new(
        "Settings",
        Menu::new()
            .add_item(CustomMenuItem::new("open_config_dir", "Open Config Folder"))
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(CustomMenuItem::new("reload_settings", "Reload Settings"))
            .add_item(CustomMenuItem::new(
                "reload_favorites_config",
                "Reload Favorites",
            )),
    );

    Menu::os_default(app_name).add_submenu(settings_menu)
}

fn main() {
    let context = tauri::generate_context!();
    let menu = build_app_menu(&context.package_info().name);

    tauri::Builder::default()
        .menu(menu)
        .on_menu_event(|event| match event.menu_item_id() {
            "open_config_dir" => {
                if let Err(error) = open_config_dir(event.window().app_handle()) {
                    eprintln!("{error}");
                }
            }
            "reload_settings" => {
                if let Err(error) = event
                    .window()
                    .app_handle()
                    .emit_all("desktop://reload-settings", ())
                {
                    eprintln!("Unable to emit settings reload event: {error}");
                }
            }
            "reload_favorites_config" => {
                if let Err(error) = event
                    .window()
                    .app_handle()
                    .emit_all("desktop://reload-favorites", ())
                {
                    eprintln!("Unable to emit favorites reload event: {error}");
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            recipe_storage_dir,
            load_favorites_config,
            save_favorites_config,
            load_options_config,
            save_options_config,
            load_session_config,
            save_session_config,
            open_config_dir,
            save_recipe_file,
            list_recipe_files,
            delete_recipe_file,
            open_recipe_storage_dir
        ])
        .run(context)
        .expect("error while running tauri application");
}
