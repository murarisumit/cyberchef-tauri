(function() {
    function transformCallback(callback, once = false) {
        const identifier = window.crypto.getRandomValues(new Uint32Array(1))[0];
        const property = `_${identifier}`;

        Object.defineProperty(window, property, {
            value(result) {
                if (once) {
                    Reflect.deleteProperty(window, property);
                }

                if (typeof callback === "function") {
                    callback(result);
                }
            },
            writable: false,
            configurable: true,
        });

        return identifier;
    }

    function fallbackInvoke(command, args = {}) {
        if (typeof window.__TAURI_INVOKE__ === "function") {
            return window.__TAURI_INVOKE__(command, args);
        }

        if (typeof window.__TAURI_IPC__ !== "function") {
            return Promise.reject("Tauri bridge is unavailable in the settings window.");
        }

        return new Promise((resolve, reject) => {
            const callback = transformCallback(result => {
                resolve(result);
                Reflect.deleteProperty(window, `_${error}`);
            }, true);
            const error = transformCallback(reason => {
                reject(reason);
                Reflect.deleteProperty(window, `_${callback}`);
            }, true);

            window.__TAURI_IPC__({
                ...args,
                cmd: command,
                callback,
                error,
            });
        });
    }

    const tauri = window.__TAURI__ || {};
    const invoke = (tauri.tauri && tauri.tauri.invoke) || tauri.invoke || fallbackInvoke;
    const listen = tauri.event && tauri.event.listen;

    const actionMessages = {
        choose_config_dir_from_settings: result => `Config folder changed to ${result}.`,
        use_default_config_dir_from_settings: result => `Config folder reset to ${result}.`,
        open_config_dir: result => `Opened config folder: ${result}.`,
        choose_recipe_storage_dir: result => `Recipe folder changed to ${result}.`,
        use_default_recipe_storage_dir: result => `Recipe folder reset to ${result}.`,
        open_recipe_storage_dir: result => `Opened recipe folder: ${result}.`,
        reload_settings_now: () => "Settings reloaded.",
        reload_favorites_now: () => "Favorites reloaded.",
        reload_session_now: () => "Session reloaded.",
        reset_settings_now: () => "Settings reset to defaults.",
        reset_favorites_now: () => "Favorites reset to defaults.",
        reset_session_now: () => "Session reset for the current workspace.",
        reset_window_state_now: () => "Window state reset for the current workspace.",
    };

    function setText(target, value) {
        const node = document.getElementById(target);
        if (node) {
            node.textContent = value || "";
        }

        document.querySelectorAll(`[data-bind="${target}"]`).forEach(node => {
            node.textContent = value || "";
        });
    }

    function setStatus(message, kind = "success") {
        const status = document.getElementById("status");

        if (!status) return;

        status.textContent = message || "";
        status.classList.remove("is-success", "is-error");

        if (message) {
            status.classList.add(kind === "error" ? "is-error" : "is-success");
        }
    }

    function humaniseSource(source) {
        switch (source) {
        case "environment":
            return "Environment override";
        case "override":
            return "Custom folder";
        default:
            return "Default";
        }
    }

    function renderSnapshot(snapshot) {
        setText("target-window-label", snapshot.targetWindowLabel);
        setText("recipe-source", humaniseSource(snapshot.recipeStorageDirSource));
        setText("config-source", humaniseSource(snapshot.configDirSource));
        setText("recipe-storage-dir", snapshot.recipeStorageDir);
        setText("default-recipe-storage-dir", snapshot.defaultRecipeStorageDir);
        setText("config-dir", snapshot.configDir);
        setText("config-override-path", snapshot.configOverridePath);
        setText("favorites-config-path", snapshot.favoritesConfigPath);
        setText("options-config-path", snapshot.optionsConfigPath);
        setText("session-config-path", snapshot.sessionConfigPath);
        setText("window-config-path", snapshot.windowConfigPath);
        setText("recipe-override-path", snapshot.recipeOverridePath);

        const recipeSummary = document.getElementById("recipe-summary");
        if (recipeSummary) {
            recipeSummary.textContent = snapshot.recipeStorageDirSource === "override" ?
                "Saved recipes will be written to your custom recipe folder and loaded from there." :
                "Saved recipes will be written to the default desktop recipe folder and loaded from there.";
        }

        const configSummary = document.getElementById("config-summary");
        if (configSummary) {
            configSummary.textContent = snapshot.configDirSource === "environment" ?
                "Favorites, options, session state, and window state are currently controlled by CYBERCHEF_CONFIG_DIR." :
                "Favorites, options, session state, and window state are stored in this desktop config folder.";
        }
    }

    function bindTabNavigation() {
        const tabs = [...document.querySelectorAll("[data-tab-target]")];
        const panels = [...document.querySelectorAll("[data-tab-panel]")];

        if (!tabs.length || !panels.length) return;

        function activateTab(panelId, options = {}) {
            const {focus = false} = options;

            tabs.forEach(tab => {
                const isActive = tab.getAttribute("data-tab-target") === panelId;
                tab.classList.toggle("is-active", isActive);
                tab.setAttribute("aria-selected", isActive ? "true" : "false");
                tab.tabIndex = isActive ? 0 : -1;

                if (isActive && focus) {
                    tab.focus();
                }
            });

            panels.forEach(panel => {
                const isActive = panel.getAttribute("data-tab-panel") === panelId;
                panel.classList.toggle("is-active", isActive);
                panel.hidden = !isActive;
            });
        }

        tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => {
                activateTab(tab.getAttribute("data-tab-target"));
            });

            tab.addEventListener("keydown", event => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
                    return;
                }

                event.preventDefault();

                if (event.key === "Home") {
                    activateTab(tabs[0].getAttribute("data-tab-target"), {focus: true});
                    return;
                }

                if (event.key === "End") {
                    activateTab(tabs[tabs.length - 1].getAttribute("data-tab-target"), {focus: true});
                    return;
                }

                const direction = event.key === "ArrowRight" ? 1 : -1;
                const nextIndex = (index + direction + tabs.length) % tabs.length;
                activateTab(tabs[nextIndex].getAttribute("data-tab-target"), {focus: true});
            });
        });
    }

    async function refreshSnapshot(options = {}) {
        const {showError = true} = options;

        try {
            renderSnapshot(await invoke("load_desktop_settings"));
        } catch (error) {
            if (showError) {
                setStatus(`Could not load settings: ${error}`, "error");
            }
        }
    }

    async function handleAction(action) {
        try {
            const result = await invoke(action);
            await refreshSnapshot({showError: false});
            const messageFactory = actionMessages[action];
            setStatus(messageFactory ? messageFactory(result) : "Action completed.");
        } catch (error) {
            setStatus(`Could not complete action: ${error}`, "error");
        }
    }

    function bindActions() {
        document.querySelectorAll("[data-action]").forEach(button => {
            button.addEventListener("click", () => {
                void handleAction(button.getAttribute("data-action"));
            });
        });
    }

    async function boot() {
        bindActions();
        bindTabNavigation();
        await refreshSnapshot();

        window.addEventListener("focus", () => {
            void refreshSnapshot({showError: false});
        });

        if (typeof listen === "function") {
            await listen("desktop://settings-context-changed", () => {
                void refreshSnapshot({showError: false});
            });
            await listen("desktop://config-dir-changed", () => {
                void refreshSnapshot({showError: false});
            });
            await listen("desktop://recipe-storage-dir-changed", () => {
                void refreshSnapshot({showError: false});
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            void boot();
        }, {once: true});
    } else {
        void boot();
    }
})();
