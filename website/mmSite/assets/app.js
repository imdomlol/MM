//GOALS
// implement functions:
// doFetch
// renderDetails

import { applyMarksToAll } from "./rightClickMenu.js";
import { initCraftPage } from "./craft.js";

// GLOBALS
export let gAllRecipes = [];
export let gAllItems = [];
export let gAllPlayers = [];
let gRecipesLastUpdated = "";
let gEqualizeCardSizesFunction = null;
let gCurrentRecipeDetailSelection = null;
let gActiveCategories = new Set(); // empty + !gAllCategoriesOff means all enabled categories visible
let gAllCategoriesOff = false;
let gActiveRecipeCategories = new Set(); // empty + !gAllRecipeCategoriesOff means all visible
let gAllRecipeCategoriesOff = false;
let gInventoriesLastUpdated = "";
let gInventoryLastSyncedByPlayer = {};
const RECIPES_FILEPATH = "/api/recipes"
const ITEMS_FILEPATH = "/api/items"
const INVENTORIES_FILEPATH = "/api/player-inventories"
const RECIPES_FALLBACK_FILEPATH = "./data/recipes.json"
const ITEMS_FALLBACK_FILEPATH = "./data/items.json"
const INVENTORIES_FALLBACK_FILEPATH = "./data/playerInventories.json"
const USER_MARKS_STORAGE_KEY = "mm_user_marks_v1"
const INVENTORY_LAST_SYNC_BY_PLAYER_STORAGE_KEY = "mm_inventory_last_sync_by_player_v1"

function loadInventoryLastSyncedByPlayer() {
    try {
        const parsed = JSON.parse(localStorage.getItem(INVENTORY_LAST_SYNC_BY_PLAYER_STORAGE_KEY) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            gInventoryLastSyncedByPlayer = {};
            return;
        }

        const output = {};
        for (const [playerName, timestamp] of Object.entries(parsed)) {
            if (!playerName || typeof timestamp !== "string") continue;
            output[playerName] = timestamp;
        }
        gInventoryLastSyncedByPlayer = output;
    } catch {
        gInventoryLastSyncedByPlayer = {};
    }
}

function saveInventoryLastSyncedByPlayer() {
    localStorage.setItem(INVENTORY_LAST_SYNC_BY_PLAYER_STORAGE_KEY, JSON.stringify(gInventoryLastSyncedByPlayer));
}

function seedInventoryLastSyncedForPlayers(players = [], fallbackTimestamp = "") {
    const timestamp = typeof fallbackTimestamp === "string" ? fallbackTimestamp : "";
    for (const player of players || []) {
        const playerName = String(player?.name || "").trim();
        if (!playerName) continue;
        if (!gInventoryLastSyncedByPlayer[playerName] && timestamp) {
            gInventoryLastSyncedByPlayer[playerName] = timestamp;
        }
    }
    saveInventoryLastSyncedByPlayer();
}

function updateInventoryLastSyncedLabel() {
    const syncedLabel = document.getElementById("inventoryLastSynced");
    if (!syncedLabel) return;

    const selectedPlayerName = getSelectedPlayerName();
    const selectedPlayerTimestamp = selectedPlayerName ? gInventoryLastSyncedByPlayer[selectedPlayerName] : "";
    const timestamp = selectedPlayerTimestamp || gInventoriesLastUpdated;
    if (!timestamp) {
        syncedLabel.textContent = "";
        return;
    }

    syncedLabel.textContent = "Synced " + new Date(timestamp).toLocaleTimeString();
}

function createDebouncedResizeHandler() {
    let resizeTimeout = null;
    return () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (gEqualizeCardSizesFunction) {
                gEqualizeCardSizesFunction();
            }
        }, 150);
    };
}

const debouncedResizeHandler = createDebouncedResizeHandler();

// SHARED FUNCTIONS
function extractRecipes(data) {
    const out = [];
    for (const book of data.books || []) {
        for (const r of book.recipes || []) {
            out.push({
                ...r,
                category: book.name,
                bookId: book.bookId,
                bookName: book.name
            });
        }
    }
    return out;
}

function renderHyperlinkList(variablesToList, listElement, textProperty = "", linkProperty = "", doClear = true) {
    // Used to render a list of items with links embedded
    variablesToList = Array.isArray(variablesToList) ? variablesToList : [];
    if (!listElement) return;
    if (doClear) listElement.innerHTML = "";

    for (const v of variablesToList) {
        const li = document.createElement("li");

        // Set link destination
        const a = document.createElement("a");
        if (v[linkProperty])
            a.href = "./recipe.html?" + linkProperty + "=" + encodeURIComponent(v[linkProperty]);
        else if (v.recipeId){
            a.href = ("./recipe.html?recipeId=" + encodeURIComponent(v.recipeId));
        }
        else if (v.itemId){
            a.href = ("./recipe.html?itemId=" + encodeURIComponent(v.itemId));
        }

        // Set the text
        const text = v[textProperty] || v.name || v.item || v.recipeName || "(app.js 001) Error - no name/item";
        a.textContent = text;

        if (v.qty) {
            const qtySpan = document.createElement("span");
            qtySpan.classList.add("qty");
            qtySpan.textContent = ` x ${v.qty}`;
            a.appendChild(qtySpan);
        }

        // Push to page
        li.appendChild(a);
        listElement.appendChild(li);
    }

    applyMarksToAll();
}

function populateDropdownFromList(list, elementId = "category", listProperty = "category", numPresetOptions = 1) {
    const select = document.getElementById(elementId);
    const cats = [...new Set(list.map(result => result[listProperty]).filter(Boolean))].sort();

    select.length = numPresetOptions;
    for (const c of cats) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    }
}

async function fetchJsonWithFallback(primaryPath, fallbackPath) {
    try {
        const response = await fetch(primaryPath, { cache: "no-store" });
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        return await response.json();
    } catch (primaryError) {
        if (!fallbackPath) {
            throw primaryError;
        }

        const fallbackResponse = await fetch(fallbackPath, { cache: "no-store" });
        if (!fallbackResponse.ok) {
            throw primaryError;
        }
        return await fallbackResponse.json();
    }
}

function categoryFromFolderPath(folderPath) {
    const raw = String(folderPath || "");
    if (!raw) return "";
    const parts = raw.split("/").map(p => p.trim()).filter(Boolean);
    return parts.length > 0 ? parts[0] : "";
}

// RECIPES.HTML PAGE FUNCTIONS (LIST PAGE)
function filterBySearch(listToFilter, term, customProperty = "") {
    const t = term.toLowerCase();
    if (!t) return listToFilter;

    return listToFilter.filter(r => 
        (r[customProperty] || "").toLowerCase().includes(t) ||
        (r.name || "").toLowerCase().includes(t) ||
        (r.itemId || "").toLowerCase().includes(t) ||
        (r.recipeId || "").toLowerCase().includes(t) ||
        (r.bookId || "").toLowerCase().includes(t) ||
        (r.requirementsText || "").toLowerCase().includes(t) ||
        (r.tools || []).join(" ").toLowerCase().includes(t) ||
        (r.ingredients || []).some(i => (i.item || "").toLowerCase().includes(t)) ||
        (r.results || []).some(x => (x.item || "").toLowerCase().includes(t))
    )
}

function filterByDropdown(list, dropdownSelection, customProperty = "category") {
    if (!dropdownSelection) return list;
    return list.filter(r => r[customProperty] === dropdownSelection);
}

function sortRecipes(recipes, mode, customProperty = "") {
    const sorted = [...recipes];
    let param = customProperty

    if (mode === "name_asc") {
        if (!customProperty){param = "name"}
        sorted.sort((a, b) => a[param].localeCompare(b[param]));
    } else if (mode === "name_desc") {
        if (!customProperty){param = "name"}
        sorted.sort((a, b) => b[param].localeCompare(a[param]));
    } else if (mode === "timer_asc") {
        if (!customProperty){param = "craftingTimeMinutes"}
        sorted.sort((a, b) => a[param] - b[param]);
    } else if (mode === "timer_desc") {
        if (!customProperty){param = "craftingTimeMinutes"}
        sorted.sort((a, b) => b[param] - a[param]);
    }

    return sorted;
}

function initRecipesPage() {
    const term = document.getElementById("search").value;
    const mode = document.getElementById("sort").value;

    let result = gAllRecipes.length > 0 ? gAllRecipes : [];
    result = filterBySearch(result, term);
    result = Array.from(new Map(result.map(item => [item.name, item])).values());

    if (gAllRecipeCategoriesOff) {
        result = [];
    } else if (gActiveRecipeCategories.size > 0) {
        result = result.filter(r => gActiveRecipeCategories.has(r.category));
    }

    result = sortRecipes(result, mode);
    renderHyperlinkList(result, document.getElementById("allRecipes"), "name");
}

function getAllRecipeCategories() {
    return [...new Set(gAllRecipes.map(r => r.category).filter(Boolean))].sort();
}

function buildRecipeCategoryPills() {
    const container = document.getElementById("recipe-category-pills");
    if (!container) return;
    container.innerHTML = "";

    const categories = getAllRecipeCategories();

    function isAllOn() {
        if (gAllRecipeCategoriesOff) return false;
        if (gActiveRecipeCategories.size === 0) return true;
        return categories.length > 0 && categories.every(cat => gActiveRecipeCategories.has(cat));
    }

    function syncAllPill() {
        const allPill = container.querySelector("[data-category='__all__']");
        if (!allPill) return;
        const allOn = isAllOn();
        allPill.classList.toggle("is-active", allOn);
        allPill.setAttribute("aria-pressed", allOn ? "true" : "false");
    }

    function syncIndividualPills() {
        container.querySelectorAll(".inv-pill:not([data-category='__all__'])").forEach(pill => {
            const cat = pill.dataset.category;
            const isActive = !gAllRecipeCategoriesOff && (gActiveRecipeCategories.size === 0 || gActiveRecipeCategories.has(cat));
            pill.classList.toggle("is-active", isActive);
            pill.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    const allPill = document.createElement("button");
    allPill.type = "button";
    allPill.className = "btn inv-pill";
    allPill.dataset.category = "__all__";
    allPill.textContent = "All";
    allPill.addEventListener("click", () => {
        if (isAllOn()) {
            gAllRecipeCategoriesOff = true;
            gActiveRecipeCategories.clear();
        } else {
            gAllRecipeCategoriesOff = false;
            gActiveRecipeCategories.clear();
        }
        syncIndividualPills();
        syncAllPill();
        initRecipesPage();
    });
    container.appendChild(allPill);

    for (const cat of categories) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "btn inv-pill";
        pill.dataset.category = cat;
        pill.textContent = cat;
        pill.addEventListener("click", () => {
            if (gAllRecipeCategoriesOff) {
                gAllRecipeCategoriesOff = false;
                gActiveRecipeCategories.clear();
                gActiveRecipeCategories.add(cat);
            } else {
                if (gActiveRecipeCategories.size === 0) {
                    for (const c of categories) gActiveRecipeCategories.add(c);
                }
                if (gActiveRecipeCategories.has(cat)) {
                    gActiveRecipeCategories.delete(cat);
                } else {
                    gActiveRecipeCategories.add(cat);
                }
                if (gActiveRecipeCategories.size === 0) {
                    gAllRecipeCategoriesOff = true;
                } else if (gActiveRecipeCategories.size === categories.length) {
                    gAllRecipeCategoriesOff = false;
                    gActiveRecipeCategories.clear();
                }
            }
            syncIndividualPills();
            syncAllPill();
            initRecipesPage();
        });
        container.appendChild(pill);
    }

    syncIndividualPills();
    syncAllPill();
}

function toggleRecipeCategoryPanel() {
    const panel = document.getElementById("recipe-category-panel");
    const btn = document.getElementById("recipe-filter-toggle");
    if (!panel) return;
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) {
        panel.removeAttribute("hidden");
        if (btn) btn.classList.add("is-active");
    } else {
        panel.setAttribute("hidden", "");
        if (btn) btn.classList.remove("is-active");
    }
}

function updateRecipesLastSyncedLabel(lastUpdated) {
    const syncedLabel = document.getElementById("recipesLastSynced");
    if (!syncedLabel || !lastUpdated) return;
    syncedLabel.textContent = "Synced " + new Date(lastUpdated).toLocaleTimeString();
}

async function refreshRecipesData() {
    const btn = document.getElementById("refreshRecipesBtn");
    const icon = btn ? btn.querySelector(".refresh-icon") : null;

    if (btn) {
        btn.disabled = true;
        btn.classList.add("is-loading");
    }

    try {
        const apiResp = await fetch("/api/refresh-recipes", { method: "POST" });
        if (!apiResp.ok) {
            const err = await apiResp.json().catch(() => ({}));
            throw new Error(err.error || `Server returned ${apiResp.status}`);
        }

        const ts = Date.now();
        const [recipesData, itemsData] = await Promise.all([
            fetchJsonWithFallback(RECIPES_FILEPATH + "?t=" + ts, RECIPES_FALLBACK_FILEPATH + "?t=" + ts),
            fetchJsonWithFallback(ITEMS_FILEPATH + "?t=" + ts, ITEMS_FALLBACK_FILEPATH + "?t=" + ts),
        ]);

        gAllRecipes = extractRecipes(recipesData);
        gAllItems = itemsData.items || [];
        gRecipesLastUpdated = recipesData.last_updated || "";

        buildRecipeCategoryPills();
        initRecipesPage();
        updateRecipesLastSyncedLabel(gRecipesLastUpdated);

        if (icon) {
            btn.classList.remove("is-loading");
            icon.textContent = "✓";
            btn.classList.add("is-success");
            setTimeout(() => {
                icon.textContent = "↻";
                btn.classList.remove("is-success");
            }, 2000);
        }
    } catch (e) {
        console.error("Failed to refresh recipes:", e);
        if (icon) {
            icon.textContent = "✗";
            setTimeout(() => { icon.textContent = "↻"; }, 2000);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove("is-loading");
        }
    }
}

// RECIPE.HTML PAGE FUNCTIONS (DETAIL PAGE)
function getQueryParam(name) {
    return new URLSearchParams(location.search).get(name);
}

function normalizeEntityId(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim().replace(/^Item\./, "");
}

function entityIdsEqual(left, right) {
    const a = normalizeEntityId(left);
    const b = normalizeEntityId(right);
    if (!a || !b) return false;
    return a === b;
}

function getRelatedRecipesForItem(foundItem, normalizedItemId) {
    const relatedMap = new Map();

    function addRelatedRecipe(recipe) {
        if (!recipe?.recipeId || relatedMap.has(recipe.recipeId)) return;
        relatedMap.set(recipe.recipeId, {
            recipeId: recipe.recipeId,
            name: recipe.name || "Unknown Recipe",
        });
    }

    if (foundItem) {
        for (const relatedId of (foundItem.relatedRecipeIds || [])) {
            const recipe = gAllRecipes.find(r => entityIdsEqual(r.recipeId, relatedId));
            addRelatedRecipe(recipe);
        }
    }

    const itemIdForLookup = foundItem?.itemId || normalizedItemId;
    const itemNameForLookup = (foundItem?.name || "").trim().toLowerCase();

    for (const recipe of gAllRecipes) {
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const results = Array.isArray(recipe.results) ? recipe.results : [];

        const matchesById = itemIdForLookup && (
            ingredients.some(ing => entityIdsEqual(ing.itemId, itemIdForLookup)) ||
            results.some(result => entityIdsEqual(result.itemId, itemIdForLookup))
        );

        const matchesByName = itemNameForLookup && (
            ingredients.some(ing => String(ing.item || "").trim().toLowerCase() === itemNameForLookup) ||
            results.some(result => String(result.item || "").trim().toLowerCase() === itemNameForLookup)
        );

        if (matchesById || matchesByName) {
            addRelatedRecipe(recipe);
        }
    }

    return Array.from(relatedMap.values());
}

function getItemDisplayNameFallback(foundItem, normalizedItemId) {
    if (foundItem?.name) return foundItem.name;

    if (normalizedItemId) {
        for (const recipe of gAllRecipes) {
            const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
            const results = Array.isArray(recipe.results) ? recipe.results : [];

            const ingMatch = ingredients.find(ing => entityIdsEqual(ing.itemId, normalizedItemId));
            if (ingMatch?.item) return ingMatch.item;

            const resultMatch = results.find(result => entityIdsEqual(result.itemId, normalizedItemId));
            if (resultMatch?.item) return resultMatch.item;
        }
    }

    return normalizedItemId ? `Item ${normalizedItemId}` : "Unknown Item";
}

function renderRecipeDetail(recipe) {
    const tools = Array.isArray(recipe.tools) ? recipe.tools : [];
    const skills = Array.isArray(recipe.requirements) ? recipe.requirements : [];
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const results = Array.isArray(recipe.results) ? recipe.results : [];
    const relatedRecipes = Array.isArray(recipe.relatedRecipes) ? recipe.relatedRecipes : [];
    const descriptionText = String(recipe.descriptionText || "").trim();
    const isDescriptionOnlyMode = !recipe.isRecipe && relatedRecipes.length === 0;
    const recipeStack = document.querySelector(".recipe-stack");

    function setCardVisibility(cardId, hasContent) {
        const el = document.getElementById(cardId);
        if (el) el.style.display = hasContent ? "" : "none";
    }

    function setElementVisibility(elementId, hasContent) {
        const el = document.getElementById(elementId);
        if (el) el.style.display = hasContent ? "" : "none";
    }

    function setTextById(elementId, text) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = text;
    }

    function parseItemDescription(text) {
        const description = String(text || "").trim();
        if (!description) {
            return { attributes: [], lore: "" };
        }

        const attributes = [];
        const loreParts = [];
        const pattern = /\[([^\]]*)\]/g;
        let lastIndex = 0;
        let match;

        while ((match = pattern.exec(description))) {
            if (match.index > lastIndex) {
                loreParts.push(description.slice(lastIndex, match.index));
            }

            const attributeText = String(match[1] || "").trim();
            if (attributeText) {
                attributes.push(attributeText);
            }

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < description.length) {
            loreParts.push(description.slice(lastIndex));
        }

        const lore = loreParts
            .map(part => String(part || "").trim())
            .filter(Boolean)
            .join("\n\n");

        return { attributes, lore };
    }

    function renderTextLines(elementId, lines, fallbackText = "") {
        const el = document.getElementById(elementId);
        if (!el) return false;

        el.innerHTML = "";

        const normalizedLines = (Array.isArray(lines) ? lines : [])
            .map(line => String(line || "").trim())
            .filter(Boolean);

        if (normalizedLines.length === 0) {
            if (fallbackText) {
                el.textContent = fallbackText;
            }
            return false;
        }

        const fragment = document.createDocumentFragment();
        normalizedLines.forEach((line, index) => {
            const entry = document.createElement("div");
            entry.classList.add("description-attribute-line");
            entry.textContent = line;
            fragment.appendChild(entry);

            if (index < normalizedLines.length - 1) {
                const spacer = document.createElement("div");
                spacer.classList.add("description-attribute-spacer");
                fragment.appendChild(spacer);
            }
        });

        el.appendChild(fragment);
        return true;
    }

    function renderDescriptionText(elementId, text, fallbackText = "No description available.") {
        const el = document.getElementById(elementId);
        if (!el) return false;

        el.innerHTML = "";

        const description = String(text || "").trim();
        if (!description) {
            el.textContent = fallbackText;
            return false;
        }

        const fragment = document.createDocumentFragment();
        const paragraphs = description
            .split(/\n{2,}/g)
            .map(part => String(part || "").trim())
            .filter(Boolean);

        if (paragraphs.length === 0) {
            el.textContent = fallbackText;
            return false;
        }

        for (const paragraph of paragraphs) {
            const block = document.createElement("div");
            block.classList.add("description-lore");
            block.textContent = paragraph;
            fragment.appendChild(block);
        }

        el.appendChild(fragment);
        return true;
    }

    function equalizeMiddleCardSizes() {
        const ingredientsCard = document.getElementById("ingredientsCard");
        const resultsCard = document.getElementById("resultsCard");

        if (!ingredientsCard || !resultsCard) return;

        ingredientsCard.style.minWidth = "";
        ingredientsCard.style.minHeight = "";
        resultsCard.style.minWidth = "";
        resultsCard.style.minHeight = "";

        if (ingredientsCard.style.display === "none" || resultsCard.style.display === "none") {
            return;
        }

        const maxWidth = Math.max(ingredientsCard.offsetWidth, resultsCard.offsetWidth);
        ingredientsCard.style.minWidth = `${maxWidth}px`;
        resultsCard.style.minWidth = `${maxWidth}px`;

        requestAnimationFrame(() => {
            const maxHeight = Math.max(ingredientsCard.offsetHeight, resultsCard.offsetHeight);
            ingredientsCard.style.minHeight = `${maxHeight}px`;
            resultsCard.style.minHeight = `${maxHeight}px`;
        });
    }

    gEqualizeCardSizesFunction = equalizeMiddleCardSizes;

    //MAIN INFO
    let recipeNameId = "recipeName"
    setTextById(recipeNameId, recipe.name || "Unknown Recipe");

    let recipeCategoryId = "recipeCategory"
    setTextById(recipeCategoryId, recipe.category || "");

    //REQUIREMENTS
    const craftingTimeColumn = document.getElementById("craftingTimeColumn");
    const craftingTimeItems = document.getElementById("craftingTimeItems");
    const skillsColumn = document.getElementById("skillsColumn");
    const skillsItems = document.getElementById("skillsItems");
    const toolsColumn = document.getElementById("toolsColumn");
    const toolsItems = document.getElementById("toolsItems");

    function setColumnVisibility(columnElement, hasContent) {
        if (columnElement) columnElement.style.display = hasContent ? "" : "none";
    }

    function addRequirementBox(container, label, value) {
        if (!container) return;

        const box = document.createElement("div");
        box.classList.add("requirement-box");

        const val = document.createElement("div");
        val.classList.add("requirement-v");
        val.textContent = value;

        if (label) {
            const key = document.createElement("div");
            key.classList.add("requirement-k");
            key.textContent = label;
            box.appendChild(key);
        }

        box.appendChild(val);
        container.appendChild(box);
    }

    if (craftingTimeItems) craftingTimeItems.innerHTML = "";
    if (skillsItems) skillsItems.innerHTML = "";
    if (toolsItems) toolsItems.innerHTML = "";

    if (recipe.craftingTimeMinutes) {
        addRequirementBox(craftingTimeItems, "", `${recipe.craftingTimeMinutes} minute(s)`);
    }

    if (skills.length > 0) {
        for (const skill of skills) {
            const skillName = skill.skill || "Unknown Skill";
            const skillLevel = skill.level ? `+${skill.level}` : "";
            addRequirementBox(skillsItems, "", `${skillName} ${skillLevel}`.trim());
        }
    } else if (recipe.requirementsText) {
        addRequirementBox(skillsItems, "", recipe.requirementsText.replace(/^Requires\s*/i, ""));
    }

    for (const tool of tools) {
        addRequirementBox(toolsItems, "", tool);
    }

    setColumnVisibility(craftingTimeColumn, Boolean(recipe.craftingTimeMinutes));
    setColumnVisibility(skillsColumn, Boolean(skills.length > 0 || recipe.requirementsText));
    setColumnVisibility(toolsColumn, tools.length > 0);

    const hasRequirements = Boolean(recipe.craftingTimeMinutes || tools.length || skills.length || recipe.requirementsText);
    setCardVisibility("requirementsCard", !isDescriptionOnlyMode && hasRequirements);

    //LINKS
    let recipeNameProperty = "name"
    let recipeIdProperty = "recipeId"
    let recipeIngredientsId = "ingredientsList"
    renderHyperlinkList(ingredients, document.getElementById(recipeIngredientsId), recipeNameProperty);
    setCardVisibility("ingredientsCard", !isDescriptionOnlyMode && ingredients.length > 0);

    let recipeResultsId = "resultsList"
    renderHyperlinkList(results, document.getElementById(recipeResultsId), recipeNameProperty);
    setCardVisibility("resultsCard", !isDescriptionOnlyMode && results.length > 0);

    setElementVisibility("ingredientsResultsArrow", !isDescriptionOnlyMode && ingredients.length > 0 && results.length > 0);

    const descriptionParts = parseItemDescription(descriptionText);
    const hasAttributes = renderTextLines("itemAttributesText", descriptionParts.attributes);
    const hasDescription = renderDescriptionText("itemDescriptionText", descriptionParts.lore);
    setCardVisibility("itemAttributesBlock", hasAttributes);
    setCardVisibility("itemDescriptionBlock", hasDescription);

    const hasItemDetails = Boolean(descriptionText) || isDescriptionOnlyMode;
    setCardVisibility("itemDetailsCard", hasItemDetails);

    let recipeRelatedRecipesId = "relatedRecipesList"
    renderHyperlinkList(relatedRecipes, document.getElementById(recipeRelatedRecipesId), recipeNameProperty, recipeIdProperty);
    const hasRelatedRecipes = !isDescriptionOnlyMode && relatedRecipes.length > 0;
    setCardVisibility("relatedRecipesCard", hasRelatedRecipes);

    // Use split side layout only when both side panels exist and center content exists.
    const hasCenterContent = !isDescriptionOnlyMode && (hasRequirements || ingredients.length > 0 || results.length > 0);
    const useSplitSideLayout = Boolean(descriptionText) && hasRelatedRecipes && hasCenterContent;
    if (recipeStack) {
        recipeStack.classList.toggle("recipe-stack-split", useSplitSideLayout);
    }

    requestAnimationFrame(equalizeMiddleCardSizes);
}


function saveCurrentRecipeToCraftSelection() {
    const errorEl = document.getElementById("Error");

    if (!gCurrentRecipeDetailSelection?.item && !gCurrentRecipeDetailSelection?.recipe) {
        if (errorEl) errorEl.textContent = "Unable to add item yet. Please wait for the recipe to finish loading.";
        return false;
    }

    try {
        const selectedItem = gCurrentRecipeDetailSelection.item;
        const selectedRecipe = gCurrentRecipeDetailSelection.recipe;
        const selectedRecipeId = gCurrentRecipeDetailSelection.selectedRecipeId;
        const recipeIds = selectedItem
            ? (Array.isArray(selectedItem.recipeIds) ? selectedItem.recipeIds.filter(Boolean) : [selectedRecipeId].filter(Boolean))
            : [selectedRecipeId].filter(Boolean);
        const itemName = selectedItem?.name || selectedRecipe?.name || "Unknown Item";
        const itemIdValue = selectedItem?.itemId || selectedRecipe?.itemId || "";
        const key = itemIdValue || (selectedRecipeId ? `recipe:${selectedRecipeId}` : itemName.toLowerCase());

        if (!key) {
            if (errorEl) errorEl.textContent = "Unable to add this item to the crafting list.";
            return false;
        }

        let marks = {};
        try {
            marks = JSON.parse(localStorage.getItem(USER_MARKS_STORAGE_KEY)) || {};
        } catch {
            marks = {};
        }

        const existingEntry = marks[key] || {};
        const reqRecipeId = recipeIds.includes(selectedRecipeId) ? selectedRecipeId : (recipeIds[0] || selectedRecipeId || "");
        const existingQty = Number(existingEntry.qty);

        marks[key] = {
            ...existingEntry,
            itemId: itemIdValue,
            recipeIds,
            textContent: itemName || existingEntry.textContent || "Unknown Item",
            favorited: Boolean(existingEntry.favorited),
            category: existingEntry.category || "",
            selected: true,
            reqRecipeId,
            qty: Number.isFinite(existingQty) && existingQty > 0 ? Math.floor(existingQty) : 1
        };

        localStorage.setItem(USER_MARKS_STORAGE_KEY, JSON.stringify(marks));
        if (errorEl) errorEl.textContent = "";
        return true;
    } catch (err) {
        if (errorEl) errorEl.textContent = "Error adding item to crafting list: " + err.message;
        return false;
    }
}

function initRecipeDetailPage() {
    const recipeId = getQueryParam("recipeId");
    const itemId = getQueryParam("itemId");
    const normalizedRecipeId = normalizeEntityId(recipeId);
    const normalizedItemId = normalizeEntityId(itemId);

    window.addEventListener("resize", debouncedResizeHandler);

    const pageErrorId = "Error";
    const pageSearchId = "currentRecipeIndex";
    let recipeIndex = (parseInt(document.getElementById(pageSearchId)?.value) - 1) || 0;

    if (!recipeId && !itemId) {
        gCurrentRecipeDetailSelection = null;
        const errorEl = document.getElementById(pageErrorId);
        if (errorEl) errorEl.textContent = "No recipeId or itemId provided.";
        return;
    }

    // gAllItems and gAllRecipes are guaranteed populated before this is ever called
    const foundItem = gAllItems.find(i =>
        (normalizedItemId && entityIdsEqual(i.itemId, normalizedItemId)) ||
        (normalizedRecipeId && (i.recipeIds || []).some(id => entityIdsEqual(id, normalizedRecipeId)))
    ) || null;

    const relatedRecipes = getRelatedRecipesForItem(foundItem, normalizedItemId);

    // Collect all recipe variants for this item. Primary path uses recipeIds from /api/items,
    // fallback path matches recipe.itemId to tolerate temporarily stale link tables.
    let itemInfo = foundItem
        ? gAllRecipes
            .filter(r => (foundItem.recipeIds || []).includes(r.recipeId))
            .map(r => ({
                ...r,
                isRecipe: true,
                relatedRecipes,
                descriptionText: foundItem.descriptionText || "",
            }))
        : [];

    if (foundItem && itemInfo.length === 0 && foundItem.itemId) {
        itemInfo = gAllRecipes
            .filter(r => r.itemId === foundItem.itemId)
            .map(r => ({
                ...r,
                isRecipe: true,
                relatedRecipes,
                descriptionText: foundItem.descriptionText || "",
            }));
    }

    if (itemInfo.length === 0) {
        const directRecipe = gAllRecipes.find(r => entityIdsEqual(r.recipeId, normalizedRecipeId));
        if (directRecipe) {
            const directItem = gAllItems.find(i => entityIdsEqual(i.itemId, directRecipe.itemId));
            itemInfo = [{
                ...directRecipe,
                isRecipe: true,
                relatedRecipes,
                descriptionText: directItem?.descriptionText || "",
            }];
        }
    }

    // Fallback when items table is stale/out-of-sync but recipes still contain itemId links.
    if (itemInfo.length === 0 && normalizedItemId) {
        itemInfo = gAllRecipes
            .filter(r => entityIdsEqual(r.itemId, normalizedItemId))
            .map(r => ({
                ...r,
                isRecipe: true,
                relatedRecipes,
                descriptionText: foundItem?.descriptionText || "",
            }));
    }

    if (itemInfo.length === 0 && (foundItem || normalizedItemId)) {
        const itemOnlyName = getItemDisplayNameFallback(foundItem, normalizedItemId);
        const itemOnlyCategory = foundItem?.category || categoryFromFolderPath(foundItem?.folderPath) || "Base Material";

        itemInfo = [{
            name: itemOnlyName,
            category: itemOnlyCategory,
            itemId: foundItem?.itemId || normalizedItemId || "",
            recipeId: "",
            tools: [],
            craftingTimeMinutes: null,
            requirementsText: "",
            requirements: [],
            ingredients: [],
            results: [],
            relatedRecipes,
            descriptionText: foundItem?.descriptionText || "",
            isRecipe: false,
        }];

        const errorEl = document.getElementById(pageErrorId);
        if (errorEl) {
            errorEl.textContent = "";
        }
    } else {
        const errorEl = document.getElementById(pageErrorId);
        if (errorEl) {
            errorEl.textContent = "";
        }
    }

    if (itemInfo.length === 0) {
        gCurrentRecipeDetailSelection = null;
        const errorEl = document.getElementById(pageErrorId);
        if (errorEl) errorEl.textContent = "Recipe not found.";
        return;
    }

    recipeIndex = recipeIndex % itemInfo.length;
    const recipeIndexInput = document.getElementById(pageSearchId);
    if (recipeIndexInput) recipeIndexInput.value = recipeIndex + 1;

    gCurrentRecipeDetailSelection = {
        item: foundItem,
        recipe: itemInfo[recipeIndex],
        selectedRecipeId: itemInfo[recipeIndex].recipeId || recipeId || ""
    };

    renderRecipeDetail(itemInfo[recipeIndex]);
}

// INVENTORIES.HTML PAGE FUNCTIONS (INVENTORY SELECTOR)
function getInventories() {
    const out = [];
    for (const players of gAllPlayers || []) {
        for (const item of players.items || []) {
            if (item.qty > 0) {
                out.push({
                    ...item,
                    playerName: players.name || "Unknown Player"
                });
            }
        }
    }
    return out;
}

function addCategoryToItems(players) {
    const allItems = gAllItems;

    for (const player of players){
        for (const item of player.items){
            const itemData = allItems.find(i => i.itemId === item.itemId);
            if (itemData) {
                item.category = itemData.category || categoryFromFolderPath(itemData.folderPath) || "Base Material";
            } else {
                item.category = "Unknown Item";
            }
        }
    }
    return players;
}

function getAllInventoryCategories() {
    const itemCats = [...new Set((gAllItems || []).map(i => i?.category).filter(Boolean))].sort();
    return [...new Set([...itemCats, "Base Material", "Unknown Item"])];
}

function getSelectedPlayerName() {
    const dropdown = document.getElementById("playersInventoryDropdown");
    return dropdown ? dropdown.value : "";
}

function getSelectedPlayerSheetId() {
    const selectedPlayerName = getSelectedPlayerName();
    if (!selectedPlayerName) return "";

    const selectedPlayer = (gAllPlayers || []).find(player => player?.name === selectedPlayerName);
    return selectedPlayer?.sheetId || "";
}

function getSelectedPlayerInventories() {
    const selectedPlayerName = getSelectedPlayerName();
    const allInventories = getInventories();
    if (!selectedPlayerName) return allInventories;
    return allInventories.filter(i => i.playerName === selectedPlayerName);
}

function getAvailableCategoriesForSelectedPlayer(categories) {
    const items = getSelectedPlayerInventories();
    const available = new Set(items.map(i => i.category).filter(Boolean));
    return categories.filter(cat => available.has(cat));
}

function rebuildInventoryCategoryPills() {
    buildCategoryPills(getAllInventoryCategories());
}

function buildCategoryPills(categories) {
    const container = document.getElementById("inv-category-pills");
    if (!container) return;
    container.innerHTML = "";

    const enabledCategories = getAvailableCategoriesForSelectedPlayer(categories);
    const enabledSet = new Set(enabledCategories);

    for (const cat of [...gActiveCategories]) {
        if (!enabledSet.has(cat)) gActiveCategories.delete(cat);
    }

    function isAllOn() {
        if (gAllCategoriesOff) return false;
        if (gActiveCategories.size === 0) return true;
        return enabledCategories.length > 0 && enabledCategories.every(cat => gActiveCategories.has(cat));
    }

    function syncAllPill() {
        const allPill = container.querySelector("[data-category='__all__']");
        if (!allPill) return;
        const allOn = isAllOn();
        allPill.classList.toggle("is-active", allOn);
        allPill.setAttribute("aria-pressed", allOn ? "true" : "false");
    }

    function syncIndividualPills() {
        container.querySelectorAll(".inv-pill:not([data-category='__all__'])").forEach(pill => {
            const cat = pill.dataset.category;
            const isEnabled = enabledSet.has(cat);
            const isActive = isEnabled && !gAllCategoriesOff && (gActiveCategories.size === 0 || gActiveCategories.has(cat));

            pill.disabled = !isEnabled;
            pill.classList.toggle("is-disabled", !isEnabled);
            pill.classList.toggle("is-active", isActive);
            pill.setAttribute("aria-pressed", isActive ? "true" : "false");
            pill.setAttribute("aria-disabled", !isEnabled ? "true" : "false");
        });
    }

    const allPill = document.createElement("button");
    allPill.type = "button";
    allPill.className = "btn inv-pill";
    allPill.dataset.category = "__all__";
    allPill.textContent = "All";
    allPill.addEventListener("click", () => {
        if (isAllOn()) {
            gAllCategoriesOff = true;
            gActiveCategories.clear();
        } else {
            gAllCategoriesOff = false;
            gActiveCategories.clear();
        }

        syncIndividualPills();
        syncAllPill();
        initInventoriesListPage();
    });
    container.appendChild(allPill);

    for (const cat of categories) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "btn inv-pill";
        pill.dataset.category = cat;
        pill.textContent = cat;
        pill.addEventListener("click", () => {
            if (!enabledSet.has(cat)) return;

            if (gAllCategoriesOff) {
                gAllCategoriesOff = false;
                gActiveCategories.clear();
                gActiveCategories.add(cat);
            } else {
                if (gActiveCategories.size === 0) {
                    for (const enabledCategory of enabledCategories) {
                        gActiveCategories.add(enabledCategory);
                    }
                }

                if (gActiveCategories.has(cat)) {
                    gActiveCategories.delete(cat);
                } else {
                    gActiveCategories.add(cat);
                }

                if (gActiveCategories.size === 0) {
                    gAllCategoriesOff = true;
                } else if (gActiveCategories.size === enabledCategories.length) {
                    gAllCategoriesOff = false;
                    gActiveCategories.clear();
                }
            }

            syncIndividualPills();
            syncAllPill();
            initInventoriesListPage();
        });
        container.appendChild(pill);
    }

    syncIndividualPills();
    syncAllPill();
}

function toggleCategoryPanel() {
    const panel = document.getElementById("inv-category-panel");
    const btn = document.getElementById("inv-filter-toggle");
    if (!panel) return;
    const isHidden = panel.hasAttribute("hidden");
    if (isHidden) {
        panel.removeAttribute("hidden");
        if (btn) btn.classList.add("is-active");
    } else {
        panel.setAttribute("hidden", "");
        if (btn) btn.classList.remove("is-active");
    }
}

async function refreshInventories() {
    const btn = document.getElementById("refreshInventoryBtn");
    const icon = btn ? btn.querySelector(".refresh-icon") : null;
    const selectedPlayerName = getSelectedPlayerName();
    const selectedPlayerSheetId = getSelectedPlayerSheetId();

    if (btn) {
        btn.disabled = true;
        btn.classList.add("is-loading");
    }

    try {
        // Trigger inventory sync for the selected player when possible.
        const requestBody = {
            playerName: selectedPlayerName,
            sheetId: selectedPlayerSheetId,
        };
        const apiResp = await fetch("/api/refresh-inventories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });
        if (!apiResp.ok) {
            const err = await apiResp.json().catch(() => ({}));
            throw new Error(err.error || `Server returned ${apiResp.status}`);
        }

        // Re-fetch the freshly written inventory payload
        const data = await fetchJsonWithFallback(
            INVENTORIES_FILEPATH + "?t=" + Date.now(),
            INVENTORIES_FALLBACK_FILEPATH + "?t=" + Date.now(),
        );
        const itemsData = await fetchJsonWithFallback(
            ITEMS_FILEPATH + "?t=" + Date.now(),
            ITEMS_FALLBACK_FILEPATH + "?t=" + Date.now(),
        );
        gAllItems = itemsData.items || [];
        gAllPlayers = data.players || [];
        addCategoryToItems(gAllPlayers);

        const playerDropdown = document.getElementById("playersInventoryDropdown");
        if (typeof window.mmSyncPlayerDropdown === "function") {
            window.mmSyncPlayerDropdown(gAllPlayers);
        } else if (playerDropdown && playerDropdown.options.length === 0) {
            populateDropdownFromList(gAllPlayers, "playersInventoryDropdown", "name", 0);
        }

        // Preserve selected character after refresh when it still exists.
        if (playerDropdown && selectedPlayerName && gAllPlayers.some(player => player?.name === selectedPlayerName)) {
            playerDropdown.value = selectedPlayerName;
            localStorage.setItem("mm_selected_player", selectedPlayerName);
        }

        rebuildInventoryCategoryPills();
        initInventoriesListPage();

        if (data.last_updated) {
            gInventoriesLastUpdated = data.last_updated;
            const refreshedPlayerName = selectedPlayerName || getSelectedPlayerName();
            if (refreshedPlayerName) {
                gInventoryLastSyncedByPlayer[refreshedPlayerName] = data.last_updated;
                saveInventoryLastSyncedByPlayer();
            }
        }
        updateInventoryLastSyncedLabel();

        // Brief success flash on the icon
        if (icon) {
            btn.classList.remove("is-loading");
            icon.textContent = "✓";
            btn.classList.add("is-success");
            setTimeout(() => {
                icon.textContent = "↻";
                btn.classList.remove("is-success");
            }, 2000);
        }
    } catch (e) {
        console.error("Failed to refresh inventories:", e);
        if (icon) {
            icon.textContent = "✗";
            setTimeout(() => { icon.textContent = "↻"; }, 2000);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove("is-loading");
        }
    }
}

function initInventoriesListPage() {
    const term = document.getElementById("inv-search")?.value || "";
    const mode = document.getElementById("inv-sort")?.value || "name_asc";
    let players = gAllPlayers.length > 0 ? gAllPlayers : [];

    // Mutate first so spread copies in getInventories() include .category
    players = addCategoryToItems(players);
    let items = getSelectedPlayerInventories();

    if (gAllCategoriesOff) {
        items = [];
    } else if (gActiveCategories.size > 0) {
        items = items.filter(i => gActiveCategories.has(i.category));
    }

    items = filterBySearch(items, term, "category");

    if (mode === "name_desc") {
        items.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
    } else if (mode === "qty_asc") {
        items.sort((a, b) => (a.qty || 0) - (b.qty || 0) || (a.name || "").localeCompare(b.name || ""));
    } else if (mode === "qty_desc") {
        items.sort((a, b) => (b.qty || 0) - (a.qty || 0) || (a.name || "").localeCompare(b.name || ""));
    } else {
        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    renderHyperlinkList(items, document.getElementById("playerInventoryList"), "name", "", true);
}

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    loadInventoryLastSyncedByPlayer();
    const startupTs = Date.now();

    Promise.all([
        fetchJsonWithFallback(RECIPES_FILEPATH + "?t=" + startupTs, RECIPES_FALLBACK_FILEPATH + "?t=" + startupTs).then(data => {
            gAllRecipes = extractRecipes(data);
            gRecipesLastUpdated = data.last_updated || "";
        }),
        fetchJsonWithFallback(ITEMS_FILEPATH + "?t=" + startupTs, ITEMS_FALLBACK_FILEPATH + "?t=" + startupTs).then(data => {
            gAllItems = data.items || [];
        }),
        fetchJsonWithFallback(INVENTORIES_FILEPATH + "?t=" + startupTs, INVENTORIES_FALLBACK_FILEPATH + "?t=" + startupTs).then(data => {
            gAllPlayers = data.players || [];
            gInventoriesLastUpdated = data.last_updated || "";
            seedInventoryLastSyncedForPlayers(gAllPlayers, gInventoriesLastUpdated);
        })
    ]).then(() => {

        let pageId = ""
        // RECIPES.HTML PAGE
        pageId = "RecipesPage"
        if (document.getElementById(pageId)) {
            buildRecipeCategoryPills();
            initRecipesPage();
            updateRecipesLastSyncedLabel(gRecipesLastUpdated);
            
            let pageSearchId = "search"
            let pageDropdownSortId = "sort"
            document.getElementById(pageSearchId).addEventListener("input", initRecipesPage);
            document.getElementById(pageDropdownSortId).addEventListener("change", initRecipesPage);
            document.getElementById("recipe-filter-toggle").addEventListener("click", toggleRecipeCategoryPanel);
            document.getElementById("refreshRecipesBtn").addEventListener("click", refreshRecipesData);
        }

        // RECIPE.HTML PAGE
        pageId = "recipePage"
        if (document.getElementById(pageId)) {
            initRecipeDetailPage();

            let pageSearchId = "currentRecipeIndex"
            let pageButtonPreviousRecipe = "prevBtn"
            let pageButtonNextRecipe = "nextBtn"
            let pageButtonAddToCraft = "addToCraftBtn"
            document.getElementById(pageSearchId).addEventListener("input", initRecipeDetailPage);
            document.getElementById(pageButtonPreviousRecipe).addEventListener("click", () => {
                const input = document.getElementById(pageSearchId);
                const current = parseInt(input.value) || 1;
                input.value = Math.max(1, current - 1);
                initRecipeDetailPage();
            });
            
            document.getElementById(pageButtonNextRecipe).addEventListener("click", () => {
                const input = document.getElementById(pageSearchId);
                const current = parseInt(input.value) || 1;
                input.value = current + 1;
                initRecipeDetailPage();
            });

            document.getElementById(pageButtonAddToCraft).addEventListener("click", () => {
                if (saveCurrentRecipeToCraftSelection()) {
                    window.location.href = "./craft.html";
                }
            });
        }

        // INVENTORIES.HTML PAGE
        pageId = "playerInventoryList"
        if (document.getElementById(pageId)) {
            addCategoryToItems(gAllPlayers);

            const playerDropdown = document.getElementById("playersInventoryDropdown");
            if (typeof window.mmSyncPlayerDropdown === "function") {
                window.mmSyncPlayerDropdown(gAllPlayers);
            } else if (playerDropdown && playerDropdown.options.length === 0) {
                populateDropdownFromList(gAllPlayers, "playersInventoryDropdown", "name", 0);
            }

            rebuildInventoryCategoryPills();

            initInventoriesListPage();
            updateInventoryLastSyncedLabel();

            document.getElementById("playersInventoryDropdown").addEventListener("change", () => {
                rebuildInventoryCategoryPills();
                initInventoriesListPage();
                updateInventoryLastSyncedLabel();
            });
            document.getElementById("inv-search")?.addEventListener("input", initInventoriesListPage);
            document.getElementById("inv-sort")?.addEventListener("change", initInventoriesListPage);
            document.getElementById("inv-filter-toggle").addEventListener("click", toggleCategoryPanel);
            document.getElementById("refreshInventoryBtn").addEventListener("click", refreshInventories);
        }

        // CRAFTING.HTML PAGE
        pageId = "craft"
        if (document.getElementById(pageId)) {
            initCraftPage();
        }
    }).catch(err => {
        console.error("Error loading data:", err);
    });
});

applyMarksToAll();
