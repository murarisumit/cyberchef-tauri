(function() {
    const tauri = window.__TAURI__;
    const invoke = tauri && tauri.tauri && tauri.tauri.invoke;

    if (!invoke) return;

    let savedRecipes = [];
    let recipesDir = "";

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
            await initialiseDesktopRecipeStorage();
        } catch (error) {
            alertUser(`Desktop recipe storage is unavailable: ${error}`, 5000);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, {once: true});
    } else {
        boot();
    }
})();
