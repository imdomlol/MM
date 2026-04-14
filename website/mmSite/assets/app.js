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
let gEqualizeCardSizesFunction = null;
let gCurrentRecipeDetailSelection = null;
let gActiveCategories = new Set(); // empty + !gAllCategoriesOff means all enabled categories visible
let gAllCategoriesOff = false;
const RECIPES_FILEPATH = "/api/recipes"
const ITEMS_FILEPATH = "/api/items"
const INVENTORIES_FILEPATH = "/api/player-inventories"
const USER_MARKS_STORAGE_KEY = "mm_user_marks_v1"

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
    const category = document.getElementById("category").value;
    const mode = document.getElementById("sort").value;

    let result = gAllRecipes.length > 0 ? gAllRecipes : [];
    result = filterBySearch(result, term);
    result = Array.from(new Map(result.map(item => [item.name, item])).values());
    result = filterByDropdown(result, category);
    result = sortRecipes(result, mode);

    let contentId = "allRecipes"
    let contentProperty = "name"
    renderHyperlinkList(result, document.getElementById(contentId), contentProperty);
}

// RECIPE.HTML PAGE FUNCTIONS (DETAIL PAGE)
function getQueryParam(name) {
    return new URLSearchParams(location.search).get(name);
}

function renderRecipeDetail(recipe) {
    const tools = Array.isArray(recipe.tools) ? recipe.tools : [];
    const skills = Array.isArray(recipe.requirements) ? recipe.requirements : [];
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const results = Array.isArray(recipe.results) ? recipe.results : [];
    const relatedRecipes = Array.isArray(recipe.relatedRecipes) ? recipe.relatedRecipes : [];

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
    setCardVisibility("requirementsCard", hasRequirements);

    //LINKS
    let recipeNameProperty = "name"
    let recipeIdProperty = "recipeId"
    let recipeIngredientsId = "ingredientsList"
    renderHyperlinkList(ingredients, document.getElementById(recipeIngredientsId), recipeNameProperty);
    setCardVisibility("ingredientsCard", ingredients.length > 0);

    let recipeResultsId = "resultsList"
    renderHyperlinkList(results, document.getElementById(recipeResultsId), recipeNameProperty);
    setCardVisibility("resultsCard", results.length > 0);

    setElementVisibility("ingredientsResultsArrow", ingredients.length > 0 && results.length > 0);

    let recipeRelatedRecipesId = "relatedRecipesList"
    renderHyperlinkList(relatedRecipes, document.getElementById(recipeRelatedRecipesId), recipeNameProperty, recipeIdProperty);
    setCardVisibility("relatedRecipesCard", relatedRecipes.length > 0);

    requestAnimationFrame(equalizeMiddleCardSizes);
}

function getItemInfo(item){
    return fetch(RECIPES_FILEPATH)
        .then(r => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        })
        .then(data => {
            const allRecipes = extractRecipes(data);
            const foundRecipes = allRecipes.filter(r => (item.recipeIds || []).includes(r.recipeId));

            if (foundRecipes.length > 0) {
                return foundRecipes.map(recipe => {
                    const relatedRecipes = allRecipes.filter(r => (item.relatedRecipeIds || []).includes(r.recipeId));
                    return {
                        ...recipe,
                        isRecipe: true,
                        relatedRecipes: relatedRecipes.map(r => ({ recipeId: r.recipeId, name: r.name }))
                    };
                });
            } else {
                const relatedRecipes = allRecipes.filter(r => (item.relatedRecipeIds || []).includes(r.recipeId));
                return [{
                    name: item.name || "Unknown Item",
                    itemId: item.itemId || "",
                    ingredients: [],
                    results: [],
                    category: "Base Material",
                    isRecipe: false,
                    relatedRecipes: relatedRecipes.map(r => ({ recipeId: r.recipeId, name: r.name }))
                }];
            }
        })
        .catch(err => {
            document.getElementById("content").textContent = "Error loading recipe data: " + err.message;
            throw err;
        });
}

function saveCurrentRecipeToCraftSelection() {
    const errorEl = document.getElementById("Error");

    if (!gCurrentRecipeDetailSelection?.item) {
        if (errorEl) errorEl.textContent = "Unable to add item yet. Please wait for the recipe to finish loading.";
        return false;
    }

    try {
        const selectedItem = gCurrentRecipeDetailSelection.item;
        const selectedRecipeId = gCurrentRecipeDetailSelection.selectedRecipeId;
        const recipeIds = Array.isArray(selectedItem.recipeIds) ? selectedItem.recipeIds.filter(Boolean) : [];
        const key = selectedItem.itemId ? `${selectedItem.itemId}` : `${(selectedItem.name || "").toLowerCase()}`;

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
        const reqRecipeId = recipeIds.includes(selectedRecipeId) ? selectedRecipeId : (recipeIds[0] || "");
        const existingQty = Number(existingEntry.qty);

        marks[key] = {
            ...existingEntry,
            itemId: selectedItem.itemId || "",
            recipeIds,
            textContent: selectedItem.name || existingEntry.textContent || "Unknown Item",
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

    window.addEventListener("resize", debouncedResizeHandler);

    let pageErrorId = "Error"
    let pageSearchId = "currentRecipeIndex"
    let recipeIndex = (parseInt(document.getElementById(pageSearchId)?.value) - 1) || 0;

    if (!recipeId && !itemId) {
        gCurrentRecipeDetailSelection = null;
        const errorEl = document.getElementById(pageErrorId);
        if (errorEl) errorEl.textContent = "No recipeId or itemId provided.";
        return;
    }
    
    fetch(ITEMS_FILEPATH)
    .then(r => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
    })
    .then(data => {
        const allItemsData = data.items || [];
        const foundItem = allItemsData.find(i => i.itemId === itemId || (i.recipeIds || []).includes(recipeId));
        if (foundItem) {
            getItemInfo(foundItem)
            .then(itemInfo => {
                if (itemInfo.length > 0) {
                    recipeIndex = recipeIndex % itemInfo.length;
                    const recipeIndexInput = document.getElementById(pageSearchId);
                    if (recipeIndexInput) recipeIndexInput.value = (recipeIndex || 0) + 1;
                    const activeRecipe = itemInfo[recipeIndex] || {};
                    const activeRecipeId = activeRecipe.recipeId || recipeId || ((foundItem.recipeIds || [])[0] || "");
                    gCurrentRecipeDetailSelection = {
                        item: foundItem,
                        selectedRecipeId: activeRecipeId
                    };

                    if (itemInfo[recipeIndex].isRecipe) {
                        renderRecipeDetail(itemInfo[recipeIndex]);
                    } else {
                        renderRecipeDetail(itemInfo[recipeIndex]);
                    }
                } else {
                    gCurrentRecipeDetailSelection = null;
                    const errorEl = document.getElementById(pageErrorId);
                    if (errorEl) errorEl.textContent = "No recipes found.";
                }
            });
        }
    })
    .catch(err => {
        gCurrentRecipeDetailSelection = null;
        const errorEl = document.getElementById(pageErrorId);
        if (errorEl) errorEl.textContent = "Error loading item data: " + err.message;
    });
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
    const allRecipes = gAllRecipes;
    const allItems = gAllItems;

    for (const player of players){
        for (const item of player.items){
            const itemData = allItems.find(i => i.itemId === item.itemId);
            if (itemData) {
                const recipeData = allRecipes.find(r => (itemData.recipeIds || []).includes(r.recipeId));
                if (recipeData) {
                    item.category = recipeData.category || "Uncategorized";
                } else {
                    item.category = "Base Material";
                }
            } else {
                item.category = "Unknown Item";
            }
        }
    }
    return players;
}

function getAllInventoryCategories() {
    const recipeCats = [...new Set(gAllRecipes.map(r => r.category).filter(Boolean))].sort();
    return [...new Set([...recipeCats, "Base Material", "Unknown Item"])];
}

function getSelectedPlayerName() {
    const dropdown = document.getElementById("playersInventoryDropdown");
    return dropdown ? dropdown.value : "";
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

    if (btn) {
        btn.disabled = true;
        btn.classList.add("is-loading");
    }

    try {
        // Trigger Google Sheets sync on the server — this takes 2–5 s
        const apiResp = await fetch("/api/refresh-inventories", { method: "POST" });
        if (!apiResp.ok) {
            const err = await apiResp.json().catch(() => ({}));
            throw new Error(err.error || `Server returned ${apiResp.status}`);
        }

        // Re-fetch the freshly written JSON file
        const data = await fetch(INVENTORIES_FILEPATH + "?t=" + Date.now()).then(r => r.json());
        gAllPlayers = data.players || [];
        addCategoryToItems(gAllPlayers);

        const playerDropdown = document.getElementById("playersInventoryDropdown");
        if (typeof window.mmSyncPlayerDropdown === "function") {
            window.mmSyncPlayerDropdown(gAllPlayers);
        } else if (playerDropdown && playerDropdown.options.length === 0) {
            populateDropdownFromList(gAllPlayers, "playersInventoryDropdown", "name", 0);
        }

        rebuildInventoryCategoryPills();
        initInventoriesListPage();

        // Update last-synced label
        const syncedLabel = document.getElementById("inventoryLastSynced");
        if (syncedLabel && data.last_updated) {
            syncedLabel.textContent = "Synced " + new Date(data.last_updated).toLocaleTimeString();
        }

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
    let players = gAllPlayers.length > 0 ? gAllPlayers : [];

    // Mutate first so spread copies in getInventories() include .category
    players = addCategoryToItems(players);
    let items = getSelectedPlayerInventories();

    if (gAllCategoriesOff) {
        items = [];
    } else if (gActiveCategories.size > 0) {
        items = items.filter(i => gActiveCategories.has(i.category));
    }

    items.sort((a, b) => a.name.localeCompare(b.name));
    renderHyperlinkList(items, document.getElementById("playerInventoryList"), "name", "", true);
}

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    Promise.all([
        fetch(RECIPES_FILEPATH).then(r => r.json()).then(data => {
            gAllRecipes = extractRecipes(data);
        }),
        fetch(ITEMS_FILEPATH).then(r => r.json()).then(data => {
            gAllItems = data.items || [];
        }),
        fetch(INVENTORIES_FILEPATH).then(r => r.json()).then(data => {
            gAllPlayers = data.players || [];
        })
    ]).then(() => {

        let pageId = ""
        // RECIPES.HTML PAGE
        pageId = "RecipesPage"
        if (document.getElementById(pageId)) {
            populateDropdownFromList(gAllRecipes);
            initRecipesPage();
            
            let pageSearchId = "search"
            let pageDropdownCategoryId = "category"
            let pageDropdownSortId = "sort"
            document.getElementById(pageSearchId).addEventListener("input", initRecipesPage);
            document.getElementById(pageDropdownCategoryId).addEventListener("change", initRecipesPage);
            document.getElementById(pageDropdownSortId).addEventListener("change", initRecipesPage);
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

            document.getElementById("playersInventoryDropdown").addEventListener("change", () => {
                rebuildInventoryCategoryPills();
                initInventoriesListPage();
            });
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
