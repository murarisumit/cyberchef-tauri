#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Serialize)]
struct StoredRecipe {
    file_name: String,
    name: String,
    recipe: String,
}

fn recipes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or_else(|| "Unable to resolve the application data directory.".to_string())?
        .join("recipes");

    fs::create_dir_all(&dir)
        .map_err(|error| format!("Unable to create recipe directory at {}: {error}", dir.display()))?;

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

#[tauri::command]
fn recipe_storage_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(recipes_dir(&app)?.display().to_string())
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
        let entry = entry.map_err(|error| format!("Unable to inspect saved recipe entry: {error}"))?;
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
        fs::remove_file(&file_path)
            .map_err(|error| format!("Unable to delete recipe file {}: {error}", file_path.display()))?;
    }

    Ok(())
}

#[tauri::command]
fn open_recipe_storage_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = recipes_dir(&app)?;

    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer");

    command.arg(&dir);
    command
        .spawn()
        .map_err(|error| format!("Unable to open recipe directory {}: {error}", dir.display()))?;

    Ok(dir.display().to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            recipe_storage_dir,
            save_recipe_file,
            list_recipe_files,
            delete_recipe_file,
            open_recipe_storage_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
