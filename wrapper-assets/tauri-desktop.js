(function() {
    const tauri = window.__TAURI__;
    const invoke = tauri && tauri.tauri && tauri.tauri.invoke;
    const listen = tauri && tauri.event && tauri.event.listen;

    if (!invoke) return;

    let savedRecipes = [];
    let recipesDir = "";
    let reloadFavoritesPromise = null;
    let lastFavoritesLoadError = "";
    let reloadSettingsPromise = null;
    let lastSettingsLoadError = "";
    let reloadSessionPromise = null;
    let lastSessionLoadError = "";
    let sessionSaveTimeout = null;
    let sessionPersistenceSuspended = false;

    const eolCodeToSequence = {
        LF: "\n",
        CR: "\r",
        CRLF: "\r\n",
    };

    const eolSequenceToCode = {
        "\n": "LF",
        "\r": "CR",
        "\r\n": "CRLF",
    };

    function alertUser(message, timeout) {
        if (window.app && typeof window.app.alert === "function") {
            window.app.alert(message, timeout || 3000);
        } else {
            window.alert(message);
        }
    }

    function activeSavePaneId() {
        const activePane = document.querySelector("#save-texts .tab-pane.active");
        return activePane ? activePane.id : "chef-format";
    }

    function activeSaveFormat() {
        switch (activeSavePaneId()) {
        case "clean-json":
            return "clean-json";
        case "compact-json":
            return "compact-json";
        default:
            return "chef";
        }
    }

    function currentSaveText() {
        const textarea = document.querySelector("#save-texts .tab-pane.active textarea");
        return textarea ? textarea.value : "";
    }

    function setHelperText(selector, text) {
        const helper = document.querySelector(selector);
        if (helper) helper.textContent = text;
    }

    function updateFolderHints() {
        if (!recipesDir) return;

        setHelperText(
            "#save-name + .bmd-help",
            `Save this recipe to ${recipesDir} so it can be loaded again later.`
        );
        setHelperText(
            "#load-name + .bmd-help",
            `Load saved recipes from ${recipesDir}.`
        );
    }

    function ensureOpenFolderButton() {
        const footer = document.getElementById("save-footer");

        if (!footer || document.getElementById("open-recipes-folder-button")) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-secondary";
        button.id = "open-recipes-folder-button";
        button.textContent = "Open Folder";
        button.addEventListener("click", async () => {
            try {
                const dir = await invoke("open_recipe_storage_dir");
                recipesDir = dir;
                updateFolderHints();
            } catch (error) {
                alertUser(`Could not open recipes folder: ${error}`, 4000);
            }
        });

        footer.insertBefore(button, footer.firstChild);
    }

    function refreshLoadSelect(recipes) {
        const select = document.getElementById("load-name");
        const loadText = document.getElementById("load-text");

        if (!select || !loadText) return;

        select.innerHTML = "";

        recipes.forEach(recipe => {
            const option = document.createElement("option");
            option.value = recipe.file_name;
            option.textContent = recipe.name;
            select.appendChild(option);
        });

        if (recipes.length > 0) {
            select.value = recipes[0].file_name;
            loadText.value = recipes[0].recipe;
        } else {
            loadText.value = "";
        }
    }

    async function populateSavedRecipes() {
        try {
            savedRecipes = await invoke("list_recipe_files");
            refreshLoadSelect(savedRecipes);
        } catch (error) {
            alertUser(`Could not read saved recipes: ${error}`, 4000);
        }
    }

    function recipeForSelection(fileName) {
        return savedRecipes.find(recipe => recipe.file_name === fileName);
    }

    async function waitForApp(maxAttempts = 50) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (window.app) return window.app;
            await new Promise(resolve => window.setTimeout(resolve, 50));
        }

        throw new Error("CyberChef app did not finish initializing.");
    }

    function refreshOperationLists() {
        if (!window.app || !window.app.manager || !window.app.manager.recipe) return;

        window.app.loadFavourites();
        window.app.populateOperationsList();
        window.app.manager.recipe.initialiseOperationDragNDrop();
    }

    function normaliseFavorites(favorites) {
        if (!Array.isArray(favorites)) return [];

        return favorites.filter(favorite => typeof favorite === "string");
    }

    function normaliseOptions(options) {
        if (!options || typeof options !== "object" || Array.isArray(options)) {
            return {};
        }

        return options;
    }

    function normaliseSession(session) {
        if (!session || typeof session !== "object" || Array.isArray(session)) {
            return {};
        }

        return session;
    }

    async function persistFavoritesToDisk(favorites, options = {}) {
        const {showError = true} = options;

        try {
            await invoke("save_favorites_config", {
                favorites: normaliseFavorites(favorites),
            });
        } catch (error) {
            if (showError) {
                alertUser(`Could not save favorites config: ${error}`, 5000);
            }
        }
    }

    async function reloadFavoritesFromDisk(options = {}) {
        const {notify = false} = options;

        if (reloadFavoritesPromise) {
            return reloadFavoritesPromise;
        }

        reloadFavoritesPromise = (async () => {
            try {
                const favorites = normaliseFavorites(await invoke("load_favorites_config"));
                const previousFavorites = localStorage.getItem("favourites");

                lastFavoritesLoadError = "";
                localStorage.setItem("favourites", JSON.stringify(favorites));
                refreshOperationLists();

                if (notify && previousFavorites !== JSON.stringify(favorites)) {
                    alertUser("Favorites reloaded from config.", 3000);
                }
            } catch (error) {
                const message = String(error);

                if (message !== lastFavoritesLoadError) {
                    alertUser(`Could not load favorites config: ${message}`, 5000);
                    lastFavoritesLoadError = message;
                }
            } finally {
                reloadFavoritesPromise = null;
            }
        })();

        return reloadFavoritesPromise;
    }

    async function persistOptionsToDisk(options, saveOptions = {}) {
        const {showError = true} = saveOptions;

        try {
            await invoke("save_options_config", {
                options: normaliseOptions(options),
            });
        } catch (error) {
            if (showError) {
                alertUser(`Could not save settings config: ${error}`, 5000);
            }
        }
    }

    async function reloadSettingsFromDisk(options = {}) {
        const {notify = false} = options;

        if (reloadSettingsPromise) {
            return reloadSettingsPromise;
        }

        reloadSettingsPromise = (async () => {
            try {
                const settings = normaliseOptions(await invoke("load_options_config"));
                const previousSettings = localStorage.getItem("options");

                lastSettingsLoadError = "";
                localStorage.setItem("options", JSON.stringify(settings));

                if (window.app && window.app.manager && window.app.manager.options) {
                    window.app.manager.options.load(settings);
                }

                if (notify && previousSettings !== JSON.stringify(settings)) {
                    alertUser("Settings reloaded from config.", 3000);
                }
            } catch (error) {
                const message = String(error);

                if (message !== lastSettingsLoadError) {
                    alertUser(`Could not load settings config: ${message}`, 5000);
                    lastSettingsLoadError = message;
                }
            } finally {
                reloadSettingsPromise = null;
            }
        })();

        return reloadSettingsPromise;
    }

    function collectSessionState() {
        if (!window.app || !window.app.manager) return null;

        const recipe = typeof window.app.getRecipeConfig === "function" ?
            window.app.getRecipeConfig() :
            [];
        const input = window.app.manager.input && typeof window.app.manager.input.getInput === "function" ?
            window.app.manager.input.getInput() :
            "";
        const inputChrEnc = window.app.manager.input && typeof window.app.manager.input.getChrEnc === "function" ?
            window.app.manager.input.getChrEnc() :
            0;
        const outputChrEnc = window.app.manager.output && typeof window.app.manager.output.getChrEnc === "function" ?
            window.app.manager.output.getChrEnc() :
            0;
        const inputEol = window.app.manager.input && typeof window.app.manager.input.getEOLSeq === "function" ?
            eolSequenceToCode[window.app.manager.input.getEOLSeq()] || "LF" :
            "LF";
        const outputEol = window.app.manager.output && typeof window.app.manager.output.getEOLSeq === "function" ?
            eolSequenceToCode[window.app.manager.output.getEOLSeq()] || "LF" :
            "LF";

        return {
            recipe,
            input,
            inputChrEnc,
            inputEol,
            outputChrEnc,
            outputEol,
            autoBake: Boolean(window.app.autoBake_),
        };
    }

    async function persistSessionToDisk(session, saveOptions = {}) {
        const {showError = true} = saveOptions;

        try {
            await invoke("save_session_config", {
                session: normaliseSession(session),
            });
        } catch (error) {
            if (showError) {
                alertUser(`Could not save session config: ${error}`, 5000);
            }
        }
    }

    function scheduleSessionSave() {
        if (sessionPersistenceSuspended) return;

        if (sessionSaveTimeout) {
            window.clearTimeout(sessionSaveTimeout);
        }

        sessionSaveTimeout = window.setTimeout(() => {
            sessionSaveTimeout = null;
            const session = collectSessionState();

            if (session) {
                void persistSessionToDisk(session);
            }
        }, 250);
    }

    async function applySessionState(rawSession) {
        const session = normaliseSession(rawSession);
        const savedAutoBake = typeof session.autoBake === "boolean" ? session.autoBake : true;

        if (!window.app || !window.app.manager) return;

        sessionPersistenceSuspended = true;

        try {
            if (window.app.manager.controls && typeof window.app.manager.controls.setAutoBake === "function") {
                window.app.manager.controls.setAutoBake(false);
            }

            if (typeof window.app.setRecipeConfig === "function") {
                window.app.setRecipeConfig(Array.isArray(session.recipe) ? session.recipe : []);
            }

            if (window.app.manager.input) {
                if (typeof session.inputEol === "string" && eolCodeToSequence[session.inputEol]) {
                    window.app.manager.input.eolChange(session.inputEol, true);
                }

                if (typeof session.inputChrEnc === "number") {
                    window.app.manager.input.chrEncChange(session.inputChrEnc, true, true);
                }
            }

            if (typeof session.input === "string" && typeof window.app.setInput === "function") {
                window.app.setInput(session.input);
                await new Promise(resolve => window.setTimeout(resolve, 25));
            }

            if (window.app.manager.output) {
                if (typeof session.outputEol === "string" && eolCodeToSequence[session.outputEol]) {
                    await window.app.manager.output.eolChange(session.outputEol, true);
                }

                if (typeof session.outputChrEnc === "number") {
                    await window.app.manager.output.chrEncChange(session.outputChrEnc, true);
                }
            }

            if (window.app.manager.controls && typeof window.app.manager.controls.setAutoBake === "function") {
                window.app.manager.controls.setAutoBake(savedAutoBake);
            }
        } finally {
            sessionPersistenceSuspended = false;
        }

        if (window.app.manager && window.app.manager.statechange) {
            window.dispatchEvent(window.app.manager.statechange);
        }
    }

    async function reloadSessionFromDisk(options = {}) {
        const {notify = false, force = false} = options;

        if (reloadSessionPromise) {
            return reloadSessionPromise;
        }

        reloadSessionPromise = (async () => {
            try {
                if (!force && (window.location.search || window.location.hash)) {
                    return;
                }

                const session = await invoke("load_session_config");

                lastSessionLoadError = "";
                await applySessionState(session);

                if (notify) {
                    alertUser("Session restored from config.", 3000);
                }
            } catch (error) {
                const message = String(error);

                if (message !== lastSessionLoadError) {
                    alertUser(`Could not load session config: ${message}`, 5000);
                    lastSessionLoadError = message;
                }
            } finally {
                reloadSessionPromise = null;
            }
        })();

        return reloadSessionPromise;
    }

    function installFavoritesBridge() {
        if (!window.app || window.app.__desktopFavoritesBridgeInstalled) return;

        const originalSaveFavourites = window.app.saveFavourites.bind(window.app);

        window.app.saveFavourites = function(favourites) {
            const result = originalSaveFavourites(favourites);
            const currentFavorites = localStorage.getItem("favourites");

            if (currentFavorites) {
                void persistFavoritesToDisk(JSON.parse(currentFavorites));
            }

            return result;
        };

        window.app.__desktopFavoritesBridgeInstalled = true;
    }

    function installOptionsBridge() {
        if (!window.app || window.app.__desktopOptionsBridgeInstalled) return;
        if (!window.app.manager || !window.app.manager.options) return;

        const optionsWaiter = window.app.manager.options;
        const originalUpdateOption = optionsWaiter.updateOption.bind(optionsWaiter);
        const originalResetOptionsClick = optionsWaiter.resetOptionsClick.bind(optionsWaiter);

        optionsWaiter.updateOption = function(option, value) {
            const result = originalUpdateOption(option, value);
            void persistOptionsToDisk(window.app.options);
            return result;
        };

        optionsWaiter.resetOptionsClick = function(...args) {
            const result = originalResetOptionsClick(...args);
            void persistOptionsToDisk(window.app.options);
            return result;
        };

        window.app.__desktopOptionsBridgeInstalled = true;
    }

    function installSessionBridge() {
        if (!window.app || window.app.__desktopSessionBridgeInstalled) return;
        if (!window.app.manager) return;

        window.addEventListener("statechange", scheduleSessionSave);

        if (window.app.manager.controls) {
            const originalAutoBakeChange = window.app.manager.controls.autoBakeChange.bind(window.app.manager.controls);

            window.app.manager.controls.autoBakeChange = function(...args) {
                const result = originalAutoBakeChange(...args);
                scheduleSessionSave();
                return result;
            };
        }

        if (window.app.manager.input) {
            const originalInputChrEncChange = window.app.manager.input.chrEncChange.bind(window.app.manager.input);
            const originalInputEolChange = window.app.manager.input.eolChange.bind(window.app.manager.input);

            window.app.manager.input.chrEncChange = function(...args) {
                const result = originalInputChrEncChange(...args);
                scheduleSessionSave();
                return result;
            };

            window.app.manager.input.eolChange = function(...args) {
                const result = originalInputEolChange(...args);
                scheduleSessionSave();
                return result;
            };
        }

        if (window.app.manager.output) {
            const originalOutputChrEncChange = window.app.manager.output.chrEncChange.bind(window.app.manager.output);
            const originalOutputEolChange = window.app.manager.output.eolChange.bind(window.app.manager.output);

            window.app.manager.output.chrEncChange = async function(...args) {
                const result = await originalOutputChrEncChange(...args);
                scheduleSessionSave();
                return result;
            };

            window.app.manager.output.eolChange = async function(...args) {
                const result = await originalOutputEolChange(...args);
                scheduleSessionSave();
                return result;
            };
        }

        window.app.__desktopSessionBridgeInstalled = true;
    }

    async function initialiseDesktopSettings() {
        await waitForApp();

        installOptionsBridge();
        await reloadSettingsFromDisk();

        if (typeof listen === "function") {
            await listen("desktop://reload-settings", () => {
                void reloadSettingsFromDisk({notify: true});
            });
        }
    }

    async function initialiseDesktopSession() {
        await waitForApp();

        installSessionBridge();
        await reloadSessionFromDisk();
    }

    async function initialiseDesktopFavorites() {
        await waitForApp();

        installFavoritesBridge();
        await reloadFavoritesFromDisk();

        window.addEventListener("focus", () => {
            void reloadFavoritesFromDisk();
        });

        if (typeof listen === "function") {
            await listen("desktop://reload-favorites", () => {
                void reloadFavoritesFromDisk({notify: true});
            });
        }
    }

    async function saveRecipeToFolder(event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const nameField = document.getElementById("save-name");
        const recipeName = nameField ? nameField.value.trim() : "";

        if (!recipeName) {
            alertUser("Please enter a recipe name", 3000);
            return;
        }

        try {
            const savedPath = await invoke("save_recipe_file", {
                recipeName,
                recipeContents: currentSaveText(),
                format: activeSaveFormat(),
            });

            await populateSavedRecipes();
            $("#save-modal").modal("hide");
            alertUser(`Recipe saved to ${savedPath}.`, 3500);
        } catch (error) {
            alertUser(`Could not save recipe: ${error}`, 4000);
        }
    }

    function loadSelectedSavedRecipe(event) {
        event.stopImmediatePropagation();

        const loadText = document.getElementById("load-text");
        const recipe = recipeForSelection(event.target.value);

        if (loadText) {
            loadText.value = recipe ? recipe.recipe : "";
        }
    }

    async function deleteSelectedSavedRecipe(event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const select = document.getElementById("load-name");

        if (!select || !select.value) {
            alertUser("There is no saved recipe to delete.", 3000);
            return;
        }

        try {
            await invoke("delete_recipe_file", {fileName: select.value});
            await populateSavedRecipes();
            alertUser("Saved recipe deleted.", 3000);
        } catch (error) {
            alertUser(`Could not delete saved recipe: ${error}`, 4000);
        }
    }

    async function initialiseDesktopRecipeStorage() {
        recipesDir = await invoke("recipe_storage_dir");

        ensureOpenFolderButton();
        updateFolderHints();

        const saveButton = document.getElementById("save-button");
        const loadTrigger = document.getElementById("load");
        const loadName = document.getElementById("load-name");
        const loadDeleteButton = document.getElementById("load-delete-button");

        if (saveButton) {
            saveButton.textContent = "Save to Folder";
            saveButton.addEventListener("click", saveRecipeToFolder, true);
        }

        if (loadTrigger) {
            loadTrigger.addEventListener("click", () => {
                window.setTimeout(populateSavedRecipes, 0);
            });
        }

        if (loadName) {
            loadName.addEventListener("change", loadSelectedSavedRecipe, true);
        }

        if (loadDeleteButton) {
            loadDeleteButton.addEventListener("click", deleteSelectedSavedRecipe, true);
        }
    }

    async function boot() {
        try {
            await initialiseDesktopSettings();
            await initialiseDesktopFavorites();
            await initialiseDesktopSession();
            await initialiseDesktopRecipeStorage();
        } catch (error) {
            alertUser(`Desktop integration is unavailable: ${error}`, 5000);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, {once: true});
    } else {
        boot();
    }
})();
