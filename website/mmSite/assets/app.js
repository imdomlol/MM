//GOALS
// implement functions:
// doFetch
// renderDetails

import { applyMarksToAll } from "./rightClickMenu.js";
import { initCraftPage } from "./craft.js";

// GLOBALS
export let gAllRecipes = [];
export let gAllItems = [];
let gAllPlayers = [];
const RECIPES_FILEPATH = "./data/recipes.json"
const ITEMS_FILEPATH = "./data/items.json"
const INVENTORIES_FILEPATH = "./data/playerInventories.json"

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
    const tools = (recipe.tools || []).join(", ");
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const results = Array.isArray(recipe.results) ? recipe.results : [];
    const relatedRecipes = Array.isArray(recipe.relatedRecipes) ? recipe.relatedRecipes : [];

    function setCardVisibility(cardId, hasContent) {
        const el = document.getElementById(cardId);
        if (el) el.style.display = hasContent ? "" : "none";
    }

    //MAIN INFO
    let recipeNameId = "recipeName"
    document.getElementById(recipeNameId).textContent = recipe.name || "Unknown Recipe";

    let recipeCategoryId = "recipeCategory"
    document.getElementById(recipeCategoryId).textContent = recipe.category || "";

    //REQUIREMENTS
    let recipeCraftingTimeId = "craftTime"
    document.getElementById(recipeCraftingTimeId).textContent = recipe.craftingTimeMinutes || "";

    let recipeToolsId = "tools"
    document.getElementById(recipeToolsId).textContent = tools || "";

    let recipeSkillsId = "skills"
    document.getElementById(recipeSkillsId).textContent = recipe.requirementsText || "";

    const hasRequirements = Boolean(recipe.craftingTimeMinutes || tools || recipe.requirementsText);
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

    let recipeRelatedRecipesId = "relatedRecipesList"
    renderHyperlinkList(relatedRecipes, document.getElementById(recipeRelatedRecipesId), recipeNameProperty, recipeIdProperty);
    setCardVisibility("relatedRecipesCard", relatedRecipes.length > 0);
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

function initRecipeDetailPage() {
    const recipeId = getQueryParam("recipeId");
    const itemId = getQueryParam("itemId");

    let pageErrorId = "Error"
    let pageSearchId = "currentRecipeIndex"
    let recipeIndex = (parseInt(document.getElementById(pageSearchId)?.value) - 1) || 0;

    if (!recipeId && !itemId) {
        document.getElementById(pageErrorId).textContent = "No recipeId or itemId provided.";
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
                    document.getElementById(pageSearchId).value = (recipeIndex || 0) + 1;
                    if (itemInfo[recipeIndex].isRecipe) {
                        renderRecipeDetail(itemInfo[recipeIndex]);
                    } else {
                        renderRecipeDetail(itemInfo[recipeIndex]);
                    }
                } else {
                    document.getElementById(pageErrorId).textContent = "No recipes found.";
                }
            });
        }
    })
    .catch(err => {
        document.getElementById(pageErrorId).textContent = "Error loading item data: " + err.message;
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

function sortItemsByCategory(players) {
    for (const player of players){
        player.items.sort((a, b) => a.category.localeCompare(b.category));
    }
    return players;
}

function initInventoriesListPage(){
    let players = gAllPlayers.length > 0 ? gAllPlayers : [];
    let items = [];
    const allInventories = getInventories();

    players = addCategoryToItems(players);
    players = sortItemsByCategory(players);

    let pageDropdownId = "playersInventoryDropdown"
    const selectedPlayerName = (document.getElementById(pageDropdownId).value);
    if (selectedPlayerName) {
        items = allInventories.filter(player => player.playerName === selectedPlayerName);
    }

    let pageDropdownCategoryId = "playersInventoryCategoryDropdown"
    const selectedCategory = (document.getElementById(pageDropdownCategoryId).value);
    if (selectedCategory === "All Categories"){
        // Do nothing
    } else if (selectedCategory){
        items = items.filter(i => i.category == selectedCategory);
    }

    items = items.sort((a, b) => a.name.localeCompare(b.name));

    let contentId = "playerInventoryList"
    let textProperty = "name"


    let currentCategory = items.category;
    const header = document.createElement("h3");
    header.textContent = currentCategory;
    document.getElementById(contentId).appendChild(header);

    renderHyperlinkList(items, document.getElementById(contentId), textProperty, "", true);
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
        }

        // INVENTORIES.HTML PAGE
        pageId = "playerInventoryList"
        if (document.getElementById(pageId)) {

            let pageDropdownPlayerId = "playersInventoryDropdown"
            let pageDropdownCategoryId = "playersInventoryCategoryDropdown"
            let playerIdProperty = "name"
            let recipeCategoryId = "category"
            let numPresetOptions = 0;

            populateDropdownFromList(gAllPlayers, pageDropdownPlayerId, playerIdProperty, numPresetOptions);

            numPresetOptions = 3;
            populateDropdownFromList(gAllRecipes, pageDropdownCategoryId, recipeCategoryId, numPresetOptions);

            initInventoriesListPage();
                
            document.getElementById(pageDropdownPlayerId).addEventListener("change", initInventoriesListPage);
            document.getElementById(pageDropdownCategoryId).addEventListener("change", initInventoriesListPage);
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
