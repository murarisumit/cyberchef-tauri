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
    sync::Mutex,
};
use tauri::{
    CustomMenuItem, LogicalPosition, LogicalSize, Manager, Menu, Position, Size, Submenu,
    WindowEvent,
};
#[cfg(target_os = "macos")]
use {
    cocoa::{
        appkit::{NSWindow, NSWindowOrderingMode, NSWindowTabbingMode},
        base::{id, nil, YES},
        foundation::NSString,
    },
    objc::{class, msg_send, sel, sel_impl},
    std::sync::mpsc,
};

#[derive(Serialize)]
struct StoredRecipe {
    file_name: String,
    name: String,
    recipe: String,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigDirOverride {
    config_dir: String,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowConfig {
    width: u32,
    height: u32,
    x: Option<i32>,
    y: Option<i32>,
    maximized: bool,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowRegistry {
    open_windows: Vec<String>,
    next_window_index: u32,
}

#[derive(Default)]
struct AppState {
    is_exiting: Mutex<bool>,
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

const DEFAULT_WINDOW_WIDTH: u32 = 1440;
const DEFAULT_WINDOW_HEIGHT: u32 = 900;
const MAIN_WINDOW_LABEL: &str = "main";
const WINDOW_TABBING_IDENTIFIER: &str = "cyberchef";

fn home_dir() -> Result<PathBuf, String> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to resolve HOME for application config directory.".to_string())
}

fn ensure_directory(path: &Path, label: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Unable to create {label} at {}: {error}", path.display()))?;
    Ok(path.to_path_buf())
}

fn default_config_dir() -> Result<PathBuf, String> {
    ensure_directory(
        &home_dir()?.join(".config").join("cyberchef"),
        "config directory",
    )
}

fn expand_home_path(path: PathBuf) -> Result<PathBuf, String> {
    let path_str = path.to_string_lossy();

    if path_str == "~" {
        return home_dir();
    }

    if let Some(relative) = path_str.strip_prefix("~/") {
        return Ok(home_dir()?.join(relative));
    }

    if path.is_absolute() {
        return Ok(path);
    }

    Ok(home_dir()?.join(path))
}

fn config_override_path() -> Result<PathBuf, String> {
    Ok(default_config_dir()?.join("config-dir.json"))
}

fn read_config_dir_override() -> Result<Option<PathBuf>, String> {
    let override_path = config_override_path()?;

    if !override_path.exists() {
        return Ok(None);
    }

    let contents = fs::read_to_string(&override_path).map_err(|error| {
        format!(
            "Unable to read config override file {}: {error}",
            override_path.display()
        )
    })?;
    let parsed: ConfigDirOverride = serde_json::from_str(&contents).map_err(|error| {
        format!(
            "Unable to parse config override file {}: {error}. Expected JSON like {{\"configDir\": \"/path/to/config\"}}",
            override_path.display()
        )
    })?;

    Ok(Some(expand_home_path(PathBuf::from(parsed.config_dir))?))
}

fn write_config_dir_override(path: &Path) -> Result<PathBuf, String> {
    let override_path = config_override_path()?;
    let payload = ConfigDirOverride {
        config_dir: path.display().to_string(),
    };
    let contents = serde_json::to_string_pretty(&payload).map_err(|error| {
        format!(
            "Unable to serialize config override file {}: {error}",
            override_path.display()
        )
    })?;

    fs::write(&override_path, format!("{contents}\n")).map_err(|error| {
        format!(
            "Unable to write config override file {}: {error}",
            override_path.display()
        )
    })?;

    Ok(override_path)
}

fn clear_config_dir_override() -> Result<(), String> {
    let override_path = config_override_path()?;

    if override_path.exists() {
        fs::remove_file(&override_path).map_err(|error| {
            format!(
                "Unable to remove config override file {}: {error}",
                override_path.display()
            )
        })?;
    }

    Ok(())
}

fn config_dir(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("CYBERCHEF_CONFIG_DIR") {
        let dir = expand_home_path(PathBuf::from(path))?;
        return ensure_directory(&dir, "config directory");
    }

    if let Some(dir) = read_config_dir_override()? {
        return ensure_directory(&dir, "config directory");
    }

    default_config_dir()
}

fn sanitise_window_label(label: &str) -> String {
    let mut sanitised = String::new();

    for ch in label.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
            sanitised.push(ch);
        } else {
            sanitised.push('_');
        }
    }

    if sanitised.is_empty() {
        "window".to_string()
    } else {
        sanitised
    }
}

fn favorites_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("favorite.json"))
}

fn options_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("options.json"))
}

fn window_registry_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join("window-registry.json"))
}

fn window_instance_dir(app: &tauri::AppHandle, label: &str) -> Result<PathBuf, String> {
    if label == MAIN_WINDOW_LABEL {
        return config_dir(app);
    }

    ensure_directory(
        &config_dir(app)?
            .join("windows")
            .join(sanitise_window_label(label)),
        "window state directory",
    )
}

fn remove_window_instance_dir(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    if label == MAIN_WINDOW_LABEL {
        return Ok(());
    }

    let dir = config_dir(app)?
        .join("windows")
        .join(sanitise_window_label(label));

    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|error| {
            format!(
                "Unable to remove window state directory {}: {error}",
                dir.display()
            )
        })?;
    }

    Ok(())
}

fn session_config_path(app: &tauri::AppHandle, label: &str) -> Result<PathBuf, String> {
    Ok(window_instance_dir(app, label)?.join("session.json"))
}

fn window_config_path(app: &tauri::AppHandle, label: &str) -> Result<PathBuf, String> {
    Ok(window_instance_dir(app, label)?.join("window.json"))
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
        "tabs": [
            {
                "inputBase64": "",
                "inputChrEnc": 0,
                "inputEol": "LF",
                "outputChrEnc": 0,
                "outputEol": "LF",
                "inputType": "userinput",
                "stringSample": ""
            }
        ],
        "activeTab": 1,
        "activeOutputTab": 1,
        "recipe": [],
        "input": "",
        "inputChrEnc": 0,
        "inputEol": "LF",
        "outputChrEnc": 0,
        "outputEol": "LF",
        "autoBake": true
    })
}

fn default_window_config() -> WindowConfig {
    WindowConfig {
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
        x: None,
        y: None,
        maximized: false,
    }
}

fn default_window_registry() -> WindowRegistry {
    WindowRegistry {
        open_windows: vec![MAIN_WINDOW_LABEL.to_string()],
        next_window_index: 1,
    }
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

fn write_window_config(path: &Path, window_config: &WindowConfig) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(window_config).map_err(|error| {
        format!(
            "Unable to serialize window config {}: {error}",
            path.display()
        )
    })?;

    fs::write(path, format!("{contents}\n"))
        .map_err(|error| format!("Unable to write window config {}: {error}", path.display()))
}

fn window_label_index(label: &str) -> Option<u32> {
    label
        .strip_prefix("window-")
        .and_then(|value| value.parse::<u32>().ok())
}

fn ordered_window_labels(labels: Vec<String>) -> Vec<String> {
    let mut others = labels
        .into_iter()
        .filter(|label| label != MAIN_WINDOW_LABEL)
        .collect::<Vec<_>>();

    others.sort();
    others.dedup();

    let mut ordered = vec![MAIN_WINDOW_LABEL.to_string()];
    ordered.extend(others);
    ordered
}

fn normalise_window_registry(mut registry: WindowRegistry) -> WindowRegistry {
    registry.open_windows = ordered_window_labels(registry.open_windows);

    let max_index = registry
        .open_windows
        .iter()
        .filter_map(|label| window_label_index(label))
        .max()
        .map(|value| value + 1)
        .unwrap_or(1);

    registry.next_window_index = registry.next_window_index.max(max_index);
    registry
}

fn write_window_registry(path: &Path, registry: &WindowRegistry) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(&normalise_window_registry(registry.clone()))
        .map_err(|error| {
            format!(
                "Unable to serialize window registry {}: {error}",
                path.display()
            )
        })?;

    fs::write(path, format!("{contents}\n")).map_err(|error| {
        format!(
            "Unable to write window registry {}: {error}",
            path.display()
        )
    })
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

fn ensure_session_config(app: &tauri::AppHandle, label: &str) -> Result<PathBuf, String> {
    let path = session_config_path(app, label)?;

    if !path.exists() {
        write_session_config(&path, &default_session())?;
    }

    Ok(path)
}

fn ensure_window_config(app: &tauri::AppHandle, label: &str) -> Result<PathBuf, String> {
    let path = window_config_path(app, label)?;

    if !path.exists() {
        write_window_config(&path, &default_window_config())?;
    }

    Ok(path)
}

fn ensure_window_registry(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let path = window_registry_path(app)?;

    if !path.exists() {
        write_window_registry(&path, &default_window_registry())?;
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

fn read_session_config(app: &tauri::AppHandle, label: &str) -> Result<serde_json::Value, String> {
    let path = ensure_session_config(app, label)?;
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

fn read_window_config(app: &tauri::AppHandle, label: &str) -> Result<WindowConfig, String> {
    let path = ensure_window_config(app, label)?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read window config {}: {error}", path.display()))?;
    let parsed: WindowConfig = serde_json::from_str(&contents).map_err(|error| {
        format!(
            "Unable to parse window config {}: {error}. Expected a JSON object like {{\"width\": 1440, \"height\": 900}}",
            path.display()
        )
    })?;

    Ok(parsed)
}

fn read_window_registry(app: &tauri::AppHandle) -> Result<WindowRegistry, String> {
    let path = ensure_window_registry(app)?;
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("Unable to read window registry {}: {error}", path.display()))?;
    let parsed: WindowRegistry = serde_json::from_str(&contents).map_err(|error| {
        format!(
            "Unable to parse window registry {}: {error}. Expected JSON like {{\"openWindows\": [\"main\"]}}",
            path.display()
        )
    })?;

    Ok(normalise_window_registry(parsed))
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

fn apply_window_config(window: &tauri::Window, window_config: &WindowConfig) -> Result<(), String> {
    window
        .unmaximize()
        .map_err(|error| format!("Unable to restore window from maximized state: {error}"))?;

    window
        .set_size(Size::Logical(LogicalSize::new(
            f64::from(window_config.width),
            f64::from(window_config.height),
        )))
        .map_err(|error| format!("Unable to resize the window: {error}"))?;

    if let (Some(x), Some(y)) = (window_config.x, window_config.y) {
        window
            .set_position(Position::Logical(LogicalPosition::new(
                f64::from(x),
                f64::from(y),
            )))
            .map_err(|error| format!("Unable to move the window: {error}"))?;
    } else {
        window
            .center()
            .map_err(|error| format!("Unable to center the window: {error}"))?;
    }

    if window_config.maximized {
        window
            .maximize()
            .map_err(|error| format!("Unable to maximize the window: {error}"))?;
    }

    Ok(())
}

fn capture_window_config(window: &tauri::Window) -> Result<WindowConfig, String> {
    let maximized = window
        .is_maximized()
        .map_err(|error| format!("Unable to inspect window maximized state: {error}"))?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("Unable to inspect window scale factor: {error}"))?;
    let mut window_config = read_window_config(&window.app_handle(), window.label())
        .unwrap_or_else(|_| default_window_config());

    window_config.maximized = maximized;

    if !maximized {
        let size = window
            .outer_size()
            .map_err(|error| format!("Unable to inspect window size: {error}"))?;
        let position = window
            .outer_position()
            .map_err(|error| format!("Unable to inspect window position: {error}"))?;
        let logical_size = size.to_logical::<u32>(scale_factor);
        let logical_position = position.to_logical::<i32>(scale_factor);

        window_config.width = logical_size.width;
        window_config.height = logical_size.height;
        window_config.x = Some(logical_position.x);
        window_config.y = Some(logical_position.y);
    }

    Ok(window_config)
}

fn save_window_state(window: &tauri::Window) -> Result<String, String> {
    let path = ensure_window_config(&window.app_handle(), window.label())?;
    let window_config = capture_window_config(window)?;
    write_window_config(&path, &window_config)?;
    Ok(path.display().to_string())
}

fn reset_window_state(window: &tauri::Window) -> Result<String, String> {
    let path = ensure_window_config(&window.app_handle(), window.label())?;
    let window_config = default_window_config();
    write_window_config(&path, &window_config)?;
    apply_window_config(window, &window_config)?;
    Ok(path.display().to_string())
}

fn reset_favorites_file(app: &tauri::AppHandle) -> Result<String, String> {
    let path = favorites_config_path(app)?;
    write_favorites_config(&path, &default_favorites())?;
    Ok(path.display().to_string())
}

fn reset_options_file(app: &tauri::AppHandle) -> Result<String, String> {
    let path = options_config_path(app)?;
    write_options_config(&path, &default_options())?;
    Ok(path.display().to_string())
}

fn reset_session_file(window: &tauri::Window) -> Result<String, String> {
    let path = session_config_path(&window.app_handle(), window.label())?;
    write_session_config(&path, &default_session())?;
    Ok(path.display().to_string())
}

fn emit_config_dir_changed(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = config_dir(app)?;
    app.emit_all("desktop://config-dir-changed", dir.display().to_string())
        .map_err(|error| format!("Unable to emit config directory change event: {error}"))
}

fn save_window_registry(app: &tauri::AppHandle, registry: &WindowRegistry) -> Result<(), String> {
    let path = ensure_window_registry(app)?;
    write_window_registry(&path, registry)
}

fn sync_window_registry_with_open_windows(
    app: &tauri::AppHandle,
) -> Result<WindowRegistry, String> {
    let mut labels = app.windows().keys().cloned().collect::<Vec<_>>();

    if !labels.iter().any(|label| label == MAIN_WINDOW_LABEL) {
        labels.push(MAIN_WINDOW_LABEL.to_string());
    }

    let mut registry = read_window_registry(app).unwrap_or_else(|_| default_window_registry());
    registry.open_windows = ordered_window_labels(labels);
    registry = normalise_window_registry(registry);
    save_window_registry(app, &registry)?;
    Ok(registry)
}

fn remove_window_from_registry(app: &tauri::AppHandle, label: &str) -> Result<(), String> {
    let mut registry = read_window_registry(app).unwrap_or_else(|_| default_window_registry());
    registry.open_windows.retain(|candidate| candidate != label);
    registry = normalise_window_registry(registry);
    save_window_registry(app, &registry)?;
    remove_window_instance_dir(app, label)
}

fn next_window_label(app: &tauri::AppHandle) -> Result<String, String> {
    let mut registry = read_window_registry(app).unwrap_or_else(|_| default_window_registry());
    let mut next_index = registry.next_window_index;

    loop {
        let label = format!("window-{next_index}");
        if !registry.open_windows.contains(&label) && app.get_window(&label).is_none() {
            registry.next_window_index = next_index + 1;
            save_window_registry(app, &registry)?;
            return Ok(label);
        }
        next_index += 1;
    }
}

fn apply_saved_window_state(window: &tauri::Window) -> Result<(), String> {
    let window_config = read_window_config(&window.app_handle(), window.label())
        .unwrap_or_else(|_| default_window_config());
    apply_window_config(window, &window_config)
}

fn create_native_window(app: &tauri::AppHandle, label: &str) -> Result<tauri::Window, String> {
    if let Some(existing_window) = app.get_window(label) {
        existing_window
            .show()
            .map_err(|error| format!("Unable to show window {label}: {error}"))?;
        existing_window
            .set_focus()
            .map_err(|error| format!("Unable to focus window {label}: {error}"))?;
        return Ok(existing_window);
    }

    let mut config = app
        .config()
        .tauri
        .windows
        .first()
        .cloned()
        .ok_or_else(|| "Unable to load the base Tauri window config.".to_string())?;

    config.label = label.to_string();

    #[cfg(target_os = "macos")]
    {
        config.tabbing_identifier = Some(WINDOW_TABBING_IDENTIFIER.to_string());
    }

    let window = tauri::WindowBuilder::from_config(app, config)
        .build()
        .map_err(|error| format!("Unable to create window {label}: {error}"))?;

    ensure_session_config(app, label)?;
    ensure_window_config(app, label)?;
    apply_saved_window_state(&window)?;
    sync_window_registry_with_open_windows(app)?;

    Ok(window)
}

#[cfg(target_os = "macos")]
fn attach_window_as_native_tab(
    source_window: &tauri::Window,
    new_window: &tauri::Window,
) -> Result<(), String> {
    let source_window = source_window.clone();
    let new_window = new_window.clone();
    let main_thread_window = source_window.clone();
    let (sender, receiver) = mpsc::sync_channel(1);

    main_thread_window
        .run_on_main_thread(move || {
            let result = (|| unsafe {
                let source_ns_window = source_window.ns_window().map_err(|error| {
                    format!(
                        "Unable to access the native macOS window handle for {}: {error}",
                        source_window.label()
                    )
                })? as id;
                let new_ns_window = new_window.ns_window().map_err(|error| {
                    format!(
                        "Unable to access the native macOS window handle for {}: {error}",
                        new_window.label()
                    )
                })? as id;

                let _: () = msg_send![class!(NSWindow), setAllowsAutomaticWindowTabbing: YES];
                source_ns_window.setTabbingMode_(NSWindowTabbingMode::NSWindowTabbingModePreferred);
                new_ns_window.setTabbingMode_(NSWindowTabbingMode::NSWindowTabbingModePreferred);

                let source_identifier = NSString::alloc(nil).init_str(WINDOW_TABBING_IDENTIFIER);
                let new_identifier = NSString::alloc(nil).init_str(WINDOW_TABBING_IDENTIFIER);
                let _: () = msg_send![source_ns_window, setTabbingIdentifier: source_identifier];
                let _: () = msg_send![new_ns_window, setTabbingIdentifier: new_identifier];

                source_ns_window
                    .addTabbedWindow_ordered_(new_ns_window, NSWindowOrderingMode::NSWindowAbove);
                new_ns_window.makeKeyAndOrderFront_(nil);

                Ok(())
            })();

            let _ = sender.send(result);
        })
        .map_err(|error| {
            format!(
                "Unable to schedule the native macOS tab attachment on the main thread: {error}"
            )
        })?;

    receiver.recv().map_err(|error| {
        format!("Unable to receive the native macOS tab attachment result: {error}")
    })?
}

fn restore_native_windows(app: &tauri::AppHandle) -> Result<(), String> {
    let registry = read_window_registry(app).unwrap_or_else(|_| default_window_registry());
    let main_window = app.get_window(MAIN_WINDOW_LABEL);

    for label in registry
        .open_windows
        .iter()
        .filter(|label| label.as_str() != MAIN_WINDOW_LABEL)
    {
        if let Err(error) = create_native_window(app, label).and_then(|window| {
            #[cfg(target_os = "macos")]
            if let Some(main_window) = main_window.as_ref() {
                attach_window_as_native_tab(main_window, &window)?;
            }

            Ok(())
        }) {
            eprintln!("{error}");
        }
    }

    sync_window_registry_with_open_windows(app)?;
    Ok(())
}

fn choose_config_dir(window: tauri::Window) {
    let current_dir = match config_dir(&window.app_handle()) {
        Ok(dir) => dir,
        Err(error) => {
            eprintln!("{error}");
            return;
        }
    };

    match pick_config_dir(&current_dir)
        .and_then(|selected_dir| ensure_directory(&selected_dir, "config directory"))
        .and_then(|dir| write_config_dir_override(&dir).map(|_| dir))
        .and_then(|_| save_window_state(&window).map(|_| ()))
        .and_then(|_| emit_config_dir_changed(&window.app_handle()))
    {
        Ok(()) => {}
        Err(error) => eprintln!("{error}"),
    }
}

#[cfg(target_os = "macos")]
fn pick_config_dir(current_dir: &Path) -> Result<PathBuf, String> {
    let escaped_dir = current_dir.display().to_string().replace('"', "\\\"");
    let output = Command::new("osascript")
        .arg("-e")
        .arg(format!(
            "POSIX path of (choose folder with prompt \"Choose CyberChef config folder\" default location POSIX file \"{escaped_dir}\")"
        ))
        .output()
        .map_err(|error| format!("Unable to open the macOS folder chooser: {error}"))?;

    if output.status.success() {
        let selected_dir = String::from_utf8(output.stdout)
            .map_err(|error| format!("Folder chooser returned non UTF-8 output: {error}"))?
            .trim()
            .to_string();

        return Ok(PathBuf::from(selected_dir));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("-128") {
        return Err("Config folder selection was cancelled.".to_string());
    }

    Err(format!(
        "Unable to choose a config folder: {}",
        stderr.trim()
    ))
}

#[cfg(target_os = "linux")]
fn pick_config_dir(current_dir: &Path) -> Result<PathBuf, String> {
    let output = Command::new("zenity")
        .arg("--file-selection")
        .arg("--directory")
        .arg("--filename")
        .arg(current_dir)
        .output()
        .map_err(|error| format!("Unable to open the Linux folder chooser: {error}"))?;

    if output.status.success() {
        let selected_dir = String::from_utf8(output.stdout)
            .map_err(|error| format!("Folder chooser returned non UTF-8 output: {error}"))?
            .trim()
            .to_string();

        return Ok(PathBuf::from(selected_dir));
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "Unable to choose a config folder: {}",
        stderr.trim()
    ))
}

#[cfg(target_os = "windows")]
fn pick_config_dir(current_dir: &Path) -> Result<PathBuf, String> {
    let current_dir = current_dir.display().to_string().replace('\'', "''");
    let script = format!(
        "[void][System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); \
         $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; \
         $dialog.SelectedPath = '{current_dir}'; \
         if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{ Write-Output $dialog.SelectedPath }}"
    );
    let output = Command::new("powershell")
        .arg("-NoProfile")
        .arg("-Command")
        .arg(script)
        .output()
        .map_err(|error| format!("Unable to open the Windows folder chooser: {error}"))?;

    if output.status.success() {
        let selected_dir = String::from_utf8(output.stdout)
            .map_err(|error| format!("Folder chooser returned non UTF-8 output: {error}"))?
            .trim()
            .to_string();

        if !selected_dir.is_empty() {
            return Ok(PathBuf::from(selected_dir));
        }
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "Unable to choose a config folder: {}",
        stderr.trim()
    ))
}

#[tauri::command]
fn recipe_storage_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(recipes_dir(&app)?.display().to_string())
}

#[tauri::command]
fn current_config_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(config_dir(&app)?.display().to_string())
}

#[tauri::command]
fn set_config_dir_override(_app: tauri::AppHandle, path: String) -> Result<String, String> {
    let dir = ensure_directory(&expand_home_path(PathBuf::from(path))?, "config directory")?;
    write_config_dir_override(&dir)?;
    Ok(dir.display().to_string())
}

#[tauri::command]
fn reset_config_dir_override(app: tauri::AppHandle) -> Result<String, String> {
    clear_config_dir_override()?;
    Ok(config_dir(&app)?.display().to_string())
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
fn load_session_config(window: tauri::Window) -> Result<serde_json::Value, String> {
    read_session_config(&window.app_handle(), window.label())
}

#[tauri::command]
fn save_session_config(
    window: tauri::Window,
    session: serde_json::Value,
) -> Result<String, String> {
    let path = ensure_session_config(&window.app_handle(), window.label())?;
    write_session_config(&path, &session)?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn reset_favorites_config(app: tauri::AppHandle) -> Result<String, String> {
    reset_favorites_file(&app)
}

#[tauri::command]
fn reset_options_config(app: tauri::AppHandle) -> Result<String, String> {
    reset_options_file(&app)
}

#[tauri::command]
fn reset_session_config(window: tauri::Window) -> Result<String, String> {
    reset_session_file(&window)
}

#[tauri::command]
fn new_native_tab(window: tauri::Window) -> Result<String, String> {
    let app = window.app_handle();
    let label = next_window_label(&app)?;
    let new_window = create_native_window(&app, &label)?;

    #[cfg(target_os = "macos")]
    attach_window_as_native_tab(&window, &new_window)?;

    new_window
        .set_focus()
        .map_err(|error| format!("Unable to focus window {}: {error}", new_window.label()))?;
    Ok(new_window.label().to_string())
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
            .add_item(CustomMenuItem::new(
                "choose_config_dir",
                "Choose Config Folder...",
            ))
            .add_item(CustomMenuItem::new(
                "use_default_config_dir",
                "Use Default Config Folder",
            ))
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(CustomMenuItem::new("reload_settings", "Reload Settings"))
            .add_item(CustomMenuItem::new(
                "reload_favorites_config",
                "Reload Favorites",
            ))
            .add_item(CustomMenuItem::new(
                "reload_session_config",
                "Reload Session",
            ))
            .add_native_item(tauri::MenuItem::Separator)
            .add_item(CustomMenuItem::new("reset_settings", "Reset Settings"))
            .add_item(CustomMenuItem::new("reset_favorites", "Reset Favorites"))
            .add_item(CustomMenuItem::new("reset_session", "Reset Session"))
            .add_item(CustomMenuItem::new(
                "reset_window_state",
                "Reset Window State",
            )),
    );

    let menu = Menu::os_default(app_name);

    #[cfg(target_os = "macos")]
    let menu = menu.add_submenu(Submenu::new(
        "Tabs",
        Menu::new()
            .add_item(CustomMenuItem::new("new_native_tab", "New Tab").accelerator("CmdOrCtrl+T")),
    ));

    menu.add_submenu(settings_menu)
}

fn main() {
    let context = tauri::generate_context!();
    let menu = build_app_menu(&context.package_info().name);

    let app = tauri::Builder::default()
        .manage(AppState::default())
        .menu(menu)
        .setup(|app| {
            let window = app
                .get_window(MAIN_WINDOW_LABEL)
                .ok_or_else(|| "Unable to find the main application window.".to_string())?;
            apply_saved_window_state(&window)?;
            ensure_window_registry(&app.handle())?;
            restore_native_windows(&app.handle())?;
            Ok(())
        })
        .on_window_event(|event| match event.event() {
            WindowEvent::Moved(_)
            | WindowEvent::Resized(_)
            | WindowEvent::CloseRequested { .. } => {
                if let Err(error) = save_window_state(event.window()) {
                    eprintln!("{error}");
                }
            }
            WindowEvent::Destroyed => {
                let is_exiting = event
                    .window()
                    .state::<AppState>()
                    .is_exiting
                    .lock()
                    .map(|value| *value)
                    .unwrap_or(false);

                if !is_exiting && event.window().label() != MAIN_WINDOW_LABEL {
                    if let Err(error) = remove_window_from_registry(
                        &event.window().app_handle(),
                        event.window().label(),
                    ) {
                        eprintln!("{error}");
                    }
                }
            }
            _ => {}
        })
        .on_menu_event(|event| match event.menu_item_id() {
            "new_native_tab" => {
                if let Err(error) = new_native_tab(event.window().clone()) {
                    eprintln!("{error}");
                }
            }
            "open_config_dir" => {
                if let Err(error) = open_config_dir(event.window().app_handle()) {
                    eprintln!("{error}");
                }
            }
            "choose_config_dir" => {
                choose_config_dir(event.window().clone());
            }
            "use_default_config_dir" => {
                if let Err(error) = clear_config_dir_override()
                    .and_then(|_| save_window_state(event.window()).map(|_| ()))
                    .and_then(|_| emit_config_dir_changed(&event.window().app_handle()))
                {
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
            "reload_session_config" => {
                if let Err(error) = event.window().emit("desktop://reload-session", ()) {
                    eprintln!("Unable to emit session reload event: {error}");
                }
            }
            "reset_settings" => {
                if let Err(error) =
                    reset_options_file(&event.window().app_handle()).and_then(|_| {
                        event
                            .window()
                            .app_handle()
                            .emit_all("desktop://reload-settings", ())
                            .map_err(|emit_error| {
                                format!("Unable to emit settings reload event: {emit_error}")
                            })
                    })
                {
                    eprintln!("{error}");
                }
            }
            "reset_favorites" => {
                if let Err(error) =
                    reset_favorites_file(&event.window().app_handle()).and_then(|_| {
                        event
                            .window()
                            .app_handle()
                            .emit_all("desktop://reload-favorites", ())
                            .map_err(|emit_error| {
                                format!("Unable to emit favorites reload event: {emit_error}")
                            })
                    })
                {
                    eprintln!("{error}");
                }
            }
            "reset_session" => {
                if let Err(error) = reset_session_file(event.window()).and_then(|_| {
                    event
                        .window()
                        .emit("desktop://reload-session", ())
                        .map_err(|emit_error| {
                            format!("Unable to emit session reload event: {emit_error}")
                        })
                }) {
                    eprintln!("{error}");
                }
            }
            "reset_window_state" => {
                if let Err(error) = reset_window_state(event.window()) {
                    eprintln!("{error}");
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            recipe_storage_dir,
            current_config_dir,
            set_config_dir_override,
            reset_config_dir_override,
            load_favorites_config,
            save_favorites_config,
            reset_favorites_config,
            load_options_config,
            save_options_config,
            reset_options_config,
            load_session_config,
            save_session_config,
            reset_session_config,
            open_config_dir,
            save_recipe_file,
            list_recipe_files,
            delete_recipe_file,
            open_recipe_storage_dir,
            new_native_tab
        ])
        .build(context)
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            if let Ok(mut is_exiting) = app_handle.state::<AppState>().is_exiting.lock() {
                *is_exiting = true;
            }

            if let Err(error) = sync_window_registry_with_open_windows(app_handle) {
                eprintln!("{error}");
            }
        }
    });
}
