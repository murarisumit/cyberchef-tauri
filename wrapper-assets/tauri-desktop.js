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

    async function refreshRecipeStorageState(options = {}) {
        const {showError = true} = options;

        try {
            recipesDir = await invoke("recipe_storage_dir");
            updateFolderHints();
            await populateSavedRecipes();
        } catch (error) {
            if (showError) {
                alertUser(`Could not refresh recipe folder: ${error}`, 4000);
            }
        }
    }

    function ensureRecipeFolderButtons() {
        const footer = document.getElementById("save-footer");

        if (!footer) return;

        if (!document.getElementById("open-recipes-folder-button")) {
            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "btn btn-secondary";
            openButton.id = "open-recipes-folder-button";
            openButton.textContent = "Open Folder";
            openButton.addEventListener("click", async () => {
                try {
                    const dir = await invoke("open_recipe_storage_dir");
                    recipesDir = dir;
                    updateFolderHints();
                } catch (error) {
                    alertUser(`Could not open recipes folder: ${error}`, 4000);
                }
            });

            footer.insertBefore(openButton, footer.firstChild);
        }

        if (!document.getElementById("choose-recipes-folder-button")) {
            const chooseButton = document.createElement("button");
            chooseButton.type = "button";
            chooseButton.className = "btn btn-secondary";
            chooseButton.id = "choose-recipes-folder-button";
            chooseButton.textContent = "Change Folder";
            chooseButton.addEventListener("click", async () => {
                try {
                    const dir = await invoke("choose_recipe_storage_dir");
                    recipesDir = dir;
                    updateFolderHints();
                    await populateSavedRecipes();
                    alertUser(`Recipe folder changed to ${dir}.`, 3500);
                } catch (error) {
                    alertUser(`Could not change recipe folder: ${error}`, 4000);
                }
            });

            const saveButton = document.getElementById("save-button");
            if (saveButton) {
                footer.insertBefore(chooseButton, saveButton);
            } else {
                footer.appendChild(chooseButton);
            }
        }
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

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer || 0);
        let binary = "";
        const chunkSize = 0x8000;

        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            const chunk = bytes.subarray(offset, offset + chunkSize);
            binary += String.fromCharCode(...chunk);
        }

        return window.btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary = window.atob(base64 || "");
        const bytes = new Uint8Array(binary.length);

        for (let index = 0; index < binary.length; index++) {
            bytes[index] = binary.charCodeAt(index);
        }

        return bytes.buffer;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function defaultSessionTab() {
        return {
            inputBase64: "",
            inputChrEnc: 0,
            inputEol: "LF",
            outputChrEnc: 0,
            outputEol: "LF",
            inputType: "userinput",
            fileName: "",
            stringSample: "",
            inputText: "",
        };
    }

    function normaliseSessionTab(tab) {
        const defaults = defaultSessionTab();
        const candidate = tab && typeof tab === "object" && !Array.isArray(tab) ? tab : {};

        return {
            inputBase64: typeof candidate.inputBase64 === "string" ? candidate.inputBase64 : defaults.inputBase64,
            inputChrEnc: typeof candidate.inputChrEnc === "number" ? candidate.inputChrEnc : defaults.inputChrEnc,
            inputEol: typeof candidate.inputEol === "string" && eolCodeToSequence[candidate.inputEol] ?
                candidate.inputEol :
                defaults.inputEol,
            outputChrEnc: typeof candidate.outputChrEnc === "number" ? candidate.outputChrEnc : defaults.outputChrEnc,
            outputEol: typeof candidate.outputEol === "string" && eolCodeToSequence[candidate.outputEol] ?
                candidate.outputEol :
                defaults.outputEol,
            inputType: typeof candidate.inputType === "string" ? candidate.inputType : defaults.inputType,
            fileName: typeof candidate.fileName === "string" ? candidate.fileName : defaults.fileName,
            stringSample: typeof candidate.stringSample === "string" ? candidate.stringSample : defaults.stringSample,
            inputText: typeof candidate.inputText === "string" ? candidate.inputText : defaults.inputText,
        };
    }

    function normaliseSession(session) {
        if (!session || typeof session !== "object" || Array.isArray(session)) {
            return {
                recipe: [],
                tabs: [defaultSessionTab()],
                activeTab: 1,
                activeOutputTab: 1,
                autoBake: true,
            };
        }

        const legacyTab = {
            inputText: typeof session.input === "string" ? session.input : "",
            inputChrEnc: typeof session.inputChrEnc === "number" ? session.inputChrEnc : 0,
            inputEol: typeof session.inputEol === "string" ? session.inputEol : "LF",
            outputChrEnc: typeof session.outputChrEnc === "number" ? session.outputChrEnc : 0,
            outputEol: typeof session.outputEol === "string" ? session.outputEol : "LF",
            stringSample: typeof session.input === "string" ? session.input.slice(0, 4096) : "",
        };

        const tabs = Array.isArray(session.tabs) && session.tabs.length > 0 ?
            session.tabs.map(normaliseSessionTab) :
            [normaliseSessionTab(legacyTab)];
        const maxTab = tabs.length;
        const activeTab = clamp(
            typeof session.activeTab === "number" ? session.activeTab : 1,
            1,
            maxTab
        );
        const activeOutputTab = clamp(
            typeof session.activeOutputTab === "number" ? session.activeOutputTab : activeTab,
            1,
            maxTab
        );

        return {
            recipe: Array.isArray(session.recipe) ? session.recipe : [],
            tabs,
            activeTab,
            activeOutputTab,
            autoBake: typeof session.autoBake === "boolean" ? session.autoBake : true,
        };
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

    async function getInputTabNumbers() {
        if (!window.app || !window.app.manager || !window.app.manager.input) {
            return [1];
        }

        const result = await window.app.manager.input.getInputNums();
        const inputNums = result && Array.isArray(result.inputNums) ?
            result.inputNums
                .map(inputNum => Number(inputNum))
                .filter(inputNum => Number.isFinite(inputNum) && inputNum > 0)
                .sort((left, right) => left - right) :
            [];

        return inputNums.length > 0 ? inputNums : [1];
    }

    async function waitForTabCount(expectedCount, maxAttempts = 80) {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const inputNums = await getInputTabNumbers();

            if (inputNums.length === expectedCount) {
                return inputNums;
            }

            await new Promise(resolve => window.setTimeout(resolve, 25));
        }

        throw new Error(`Timed out while waiting for ${expectedCount} input tab(s).`);
    }

    async function collectSessionTabs() {
        const inputNums = await getInputTabNumbers();
        const outputTabs = window.app.manager.output && window.app.manager.output.outputs ?
            window.app.manager.output.outputs :
            {};
        const tabs = [];

        const recipe = typeof window.app.getRecipeConfig === "function" ?
            window.app.getRecipeConfig() :
            [];

        for (const inputNum of inputNums) {
            const inputObj = await window.app.manager.input.getInputObj(inputNum);
            const buffer = inputObj && inputObj.buffer instanceof ArrayBuffer ? inputObj.buffer : new ArrayBuffer(0);
            const outputTab = outputTabs[inputNum] || {};

            tabs.push({
                inputBase64: arrayBufferToBase64(buffer),
                inputChrEnc: typeof inputObj?.encoding === "number" ? inputObj.encoding : 0,
                inputEol: eolSequenceToCode[inputObj?.eolSequence] || "LF",
                outputChrEnc: typeof outputTab.encoding === "number" ? outputTab.encoding : 0,
                outputEol: eolSequenceToCode[outputTab.eolSequence] || "LF",
                inputType: typeof inputObj?.type === "string" ? inputObj.type : "userinput",
                fileName: typeof inputObj?.file?.name === "string" ? inputObj.file.name : "",
                stringSample: typeof inputObj?.stringSample === "string" ? inputObj.stringSample : "",
            });
        }

        return {
            recipe,
            inputNums,
            tabs,
        };
    }

    async function collectSessionState() {
        if (!window.app || !window.app.manager) return null;

        const sessionData = await collectSessionTabs();
        const activeInputNum = window.app.manager.tabs && typeof window.app.manager.tabs.getActiveTab === "function" ?
            window.app.manager.tabs.getActiveTab("input") :
            1;
        const activeOutputNum = window.app.manager.tabs && typeof window.app.manager.tabs.getActiveTab === "function" ?
            window.app.manager.tabs.getActiveTab("output") :
            activeInputNum;
        const activeTab = sessionData.inputNums.indexOf(activeInputNum) + 1 || 1;
        const activeOutputTab = sessionData.inputNums.indexOf(activeOutputNum) + 1 || activeTab;

        return {
            recipe: sessionData.recipe,
            tabs: sessionData.tabs,
            activeTab,
            activeOutputTab,
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

    async function persistCurrentSession() {
        const session = await collectSessionState();

        if (session) {
            await persistSessionToDisk(session);
        }
    }

    function scheduleSessionSave() {
        if (sessionPersistenceSuspended) return;

        if (sessionSaveTimeout) {
            window.clearTimeout(sessionSaveTimeout);
        }

        sessionSaveTimeout = window.setTimeout(() => {
            sessionSaveTimeout = null;
            void persistCurrentSession();
        }, 250);
    }

    function sessionTabToArrayBuffer(tab) {
        if (typeof tab.inputBase64 === "string" && tab.inputBase64.length > 0) {
            return base64ToArrayBuffer(tab.inputBase64);
        }

        if (typeof tab.inputText === "string" && tab.inputText.length > 0) {
            return new TextEncoder().encode(tab.inputText).buffer;
        }

        return new ArrayBuffer(0);
    }

    async function restoreSessionTabs(session) {
        const tabs = Array.isArray(session.tabs) && session.tabs.length > 0 ?
            session.tabs :
            [defaultSessionTab()];

        window.app.manager.input.clearAllIoClick();
        await waitForTabCount(1);

        for (let tabCount = 2; tabCount <= tabs.length; tabCount++) {
            window.app.manager.input.addInput(false);
            await waitForTabCount(tabCount);
        }

        for (let index = 0; index < tabs.length; index++) {
            const inputNum = index + 1;
            const tab = tabs[index];
            const buffer = sessionTabToArrayBuffer(tab);
            const stringSample = typeof tab.stringSample === "string" && tab.stringSample.length > 0 ?
                tab.stringSample :
                typeof tab.inputText === "string" ?
                    tab.inputText.slice(0, 4096) :
                    "";

            window.app.manager.input.inputWorker.postMessage({
                action: "updateInputValue",
                data: {
                    inputNum,
                    buffer,
                    stringSample,
                    encoding: tab.inputChrEnc,
                    eolSequence: eolCodeToSequence[tab.inputEol] || "\n",
                },
            }, [buffer]);
            window.app.manager.input.inputWorker.postMessage({
                action: "updateTabHeader",
                data: inputNum,
            });

            if (window.app.manager.output &&
                window.app.manager.output.outputs &&
                window.app.manager.output.outputs[inputNum]) {
                window.app.manager.output.outputs[inputNum].encoding = tab.outputChrEnc;
                window.app.manager.output.outputs[inputNum].eolSequence =
                    eolCodeToSequence[tab.outputEol] || "\n";
            }
        }

        const activeTab = clamp(session.activeTab, 1, tabs.length);
        const activeOutputTab = clamp(session.activeOutputTab, 1, tabs.length);

        window.app.manager.input.changeTab(activeTab, false);

        if (window.app.manager.output) {
            window.app.manager.output.changeTab(activeOutputTab, false);
        }

        await new Promise(resolve => window.setTimeout(resolve, 25));
    }

    async function applySessionState(rawSession) {
        const session = normaliseSession(rawSession);
        const savedAutoBake = session.autoBake;

        if (!window.app || !window.app.manager) return;

        sessionPersistenceSuspended = true;

        try {
            if (window.app.manager.controls && typeof window.app.manager.controls.setAutoBake === "function") {
                window.app.manager.controls.setAutoBake(false);
            }

            if (window.app.manager.recipe && typeof window.app.manager.recipe.clearRecipe === "function") {
                window.app.manager.recipe.clearRecipe();
            }

            await restoreSessionTabs(session);

            if (typeof window.app.setRecipeConfig === "function") {
                window.app.setRecipeConfig(session.recipe);
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
            const originalAddInput = window.app.manager.input.addInput.bind(window.app.manager.input);
            const originalRemoveInput = window.app.manager.input.removeInput.bind(window.app.manager.input);
            const originalChangeInputTab = window.app.manager.input.changeTab.bind(window.app.manager.input);
            const originalInputChrEncChange = window.app.manager.input.chrEncChange.bind(window.app.manager.input);
            const originalInputEolChange = window.app.manager.input.eolChange.bind(window.app.manager.input);

            window.app.manager.input.addInput = function(...args) {
                const result = originalAddInput(...args);
                scheduleSessionSave();
                return result;
            };

            window.app.manager.input.removeInput = function(...args) {
                const result = originalRemoveInput(...args);
                scheduleSessionSave();
                return result;
            };

            window.app.manager.input.changeTab = function(...args) {
                const result = originalChangeInputTab(...args);
                scheduleSessionSave();
                return result;
            };

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
            const originalChangeOutputTab = window.app.manager.output.changeTab.bind(window.app.manager.output);
            const originalOutputChrEncChange = window.app.manager.output.chrEncChange.bind(window.app.manager.output);
            const originalOutputEolChange = window.app.manager.output.eolChange.bind(window.app.manager.output);

            window.app.manager.output.changeTab = function(...args) {
                const result = originalChangeOutputTab(...args);
                scheduleSessionSave();
                return result;
            };

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
            await listen("desktop://config-dir-changed", async event => {
                await reloadSettingsFromDisk();
                await reloadFavoritesFromDisk();
                await reloadSessionFromDisk({force: true});
                await refreshRecipeStorageState({showError: false});

                if (typeof event.payload === "string" && event.payload.length > 0) {
                    alertUser(`Config folder changed to ${event.payload}.`, 3500);
                }
            });
            await listen("desktop://recipe-storage-dir-changed", async event => {
                if (typeof event.payload === "string" && event.payload.length > 0) {
                    recipesDir = event.payload;
                    updateFolderHints();
                } else {
                    await refreshRecipeStorageState({showError: false});
                    return;
                }

                await populateSavedRecipes();
            });
        }
    }

    async function initialiseDesktopSession() {
        await waitForApp();

        installSessionBridge();
        await reloadSessionFromDisk();

        if (typeof listen === "function") {
            await listen("desktop://reload-session", () => {
                void reloadSessionFromDisk({notify: true, force: true});
            });
        }
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
        await refreshRecipeStorageState({showError: false});

        ensureRecipeFolderButtons();
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
