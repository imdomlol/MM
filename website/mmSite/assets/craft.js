import { loadMarks, saveMarks } from "./rightClickMenu.js"
import { applyMarksToAll } from "./rightClickMenu.js";
import { gAllItems, gAllPlayers, gAllRecipes } from "./app.js";
import {
    isRecursiveModeEnabled,
    getCraftRunsForQuantity,
    getRecipeOutputQuantity,
    recomputeRecursiveMarks,
    setRecursiveModeEnabled,
    RECURSIVE_SOURCE_AUTO,
    RECURSIVE_SOURCE_MANUAL,
} from "./recursiveCraft.js";

//HREF AND ID CONSTANTS
const recipePageBaseHref = "recipe.html?recipeId="
const itemPageBaseHref = "recipe.html?itemId="
const pageCraftsId = "craft"

//BUTTONS
const toolbarButtonSaveId = "toolbarSave"
const toolbarButtonRecursiveId = "toolbarRecursive"
const toolbarButtonHideCompletedRecursiveId = "toolbarHideCompletedRecursive"
const toolbarButtonSettingsId = "toolbarSettings"
const toolbarSettingsMenuId = "toolbarSettingsMenu"
const toolbarSettingsListId = "toolbarSettingsList"
const selectedTreeCollapsedStorageKey = "mm_selected_tree_collapsed_v1"
const materialsProgressStorageKey = "mm_materials_progress_v1"
const skillsChecksStorageKey = "mm_skills_checks_v1"
const toolsChecksStorageKey = "mm_tools_checks_v1"
const borrowSettingsStorageKey = "mm_character_borrow_settings_v1"
const askSelectionsStorageKey = "mm_ask_selections_v1"
const hideCompletedRecursiveStorageKey = "mm_hide_completed_recursive_v1"

//STYLES
const pageCraftsCardStyleTracked = "Tracked"
const pageCraftsCardStyleSelected = "Selected"
const pageCraftsCardStyleToolbar = "Toolbar"
const pageCraftsCardStyleCraftingTime = "CraftingTime"
const pageCraftsCardStyleTools = "Tools"
const pageCraftsCardStyleSkills = "Skills"
const pageCraftsCardStyleMaterials = "Materials"
const pageCraftsGridStyleCraftingTimeSpacerLeft = "CraftingTimeSpacerLeft"
const pageCraftsGridStyleCraftingTimeSpacerRight = "CraftingTimeSpacerRight"
const pageCraftsCardStyleQuantity = "qty"

const elementClassCard = "card"
const elementClassCardTitle = "section-title"
const elementClassCardSubtitle = "subtitle"
const elementClassCardKeyValueContainer = "kv"
const elementClassCardKey = "k"
const elementClassCardValue = "v"
const elementClassCardList = "list"
const elementClassButton = "btn";
const elementClassGrid = "grid"

//ITEM COLORS
const itemSkillMandatory = "var(--skillsMandatory)"

//ITEM PROPERTIES
const itemPropertySkills = "requirements"
const itemPropertySkillsName = "skill"
const itemPropertySkillsLevel = "level"
const itemPropertyTools = "tools"
const itemPropertyCraftingTime = "craftingTimeMinutes"
const itemPropertyMaterials = "ingredients"
const itemPropertyMaterialsQuantity = "qty"
const itemPropertyMaterialsName = "item"
const itemPropertyMaterialsItemId = "itemId"
const itemPropertyRecipeId = "recipeId"

//MARKER PROPERTIES
const markerPropertyFavorited = "favorited"
const markerPropertyCategory = "category"
const markerPropertySelected = "selected"
const markerPropertyPinned = "pinned"

//PRESET CARDS
//TRACKED
const pageCraftsTrackedTitle = "Tracked"
const pageCraftsTrackedDropdownId = "trackedDropdown"
const pageCraftsTrackedListId = "trackedList"
const pageCraftsFavoritesProperty = "Favorited"
const pageCraftsCategoryProperty = "category"
const markerTextContentProperty = "textContent"

//SELECTED
const pageCraftsSelectedTitle = "Selected"
const pageCraftsSelectedListId = "selectedList"
const pageCraftsSelectedListItemClass = "selected-item"
const pageCraftsSelectedLabelClass = "selected-item-label"
const pageCraftsSelectedQuantityControlClass = "selected-qty-control"
const pageCraftsSelectedQuantityInputClass = "selected-qty-input"
const pageCraftsSelectedQuantityStepperClass = "selected-qty-stepper"
const pageCraftsSelectedQuantityHoverButtonClass = "selected-qty-hover-button"
const pageCraftsSelectedQuantityHoverButtonMinusClass = "is-minus"
const pageCraftsSelectedQuantityHoverButtonPlusClass = "is-plus"
const pageCraftsSelectedPinButtonClass = "selected-pin-button"
const pageCraftsSelectedRemoveButtonClass = "selected-remove-button"
const pageCraftsSelectedActionsClass = "selected-item-actions"

//SKILLS
const pageCraftsSkillsTitle = "Skills"
const pageCraftsSkillsListId = "skillsList"
const pageCraftsSkillsSubtitleId = "skillsSubtitle"

//TOOLS
const pageCraftsToolsTitle = "Tools"
const pageCraftsToolsListId = "toolsList"
const pageCraftsToolsSubtitleId = "toolsSubtitle"

//RAW MATERIALS
const pageCraftsMaterialsTitle = "Materials"
const pageCraftsMaterialsListId = "materialsList"

//CRAFTING TIME
const pageCraftsCraftingTimeTitle = "Crafting Time"
const pageCraftsCraftingTimeSubtitleId = "craftingTimeSubtitle"
const pageCraftsCraftingTimeRemainingSubtitleId = "craftingTimeRemainingSubtitle"

//ITEM CARD
const itemCardButtonNextRecipeIdSuffix = "_nextRecipe"
const itemCardButtonPrevRecipeIdSuffix = "_prevRecipe"
const itemCardTitleIdSuffix = "_title"
const itemCardSubtitleIdSuffix = "_subtitle"
const itemCardSkillsListIdSuffix = "_skillsList"
const itemCardToolsListIdSuffix = "_toolsList"
const itemCardMaterialsListIdSuffix = "_materialsList"
const itemCardSkillsSubtitleIdSuffix = "_skillsSubtitle"
const itemCardToolsSubtitleIdSuffix = "_toolsSubtitle"
const itemCardCraftingTimeSubtitleIdSuffix = "_craftingTimeSubtitle"
const itemCardCraftingTimeValueIdSuffix = "_craftingTimeValue"
const itemCardMaterialsSubtitleIdSuffix = "_materialsSubtitle"
const itemCardNavContainerIdSuffix = "_navContainer"
const craftCardsDefaultMaxHeight = "75vh"
const craftCardsMinimumHeightPx = 280

let gTrackedItems = {};
let gSelectedItems = [];
let gSelectedTreeCollapsedKeys = new Set();
let gMaterialProgressByKey = {};
let gSkillChecksByKey = {};
let gToolChecksByKey = {};
let gCharacterBorrowSettings = {};
let gAskSelectionsByMaterialAndPlayer = {}; // materialKey -> { playerName -> selectedQty }
let gHideCompletedRecursiveEntries = false;
let gRecursiveAutoVisibilityByItemId = new Map();
let fromScratch = false;
let mainGrid = null;
let gCraftCardHeightSyncResizeHandler = null;

const borrowStateAlways = "always";
const borrowStateAsk = "ask";
const borrowStateNever = "never";
const borrowStates = [borrowStateAlways, borrowStateAsk, borrowStateNever];

function normalizeBorrowState(state) {
    return borrowStates.includes(state) ? state : borrowStateAsk;
}

function loadCharacterBorrowSettings() {
    try {
        const parsed = JSON.parse(localStorage.getItem(borrowSettingsStorageKey) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            gCharacterBorrowSettings = {};
            return;
        }

        const nextSettings = {};
        for (const [playerName, state] of Object.entries(parsed)) {
            if (!playerName) continue;
            nextSettings[playerName] = normalizeBorrowState(state);
        }

        gCharacterBorrowSettings = nextSettings;
    } catch {
        gCharacterBorrowSettings = {};
    }
}

function saveCharacterBorrowSettings() {
    localStorage.setItem(borrowSettingsStorageKey, JSON.stringify(gCharacterBorrowSettings));
}

function loadAskSelections() {
    try {
        const parsed = JSON.parse(localStorage.getItem(askSelectionsStorageKey) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            gAskSelectionsByMaterialAndPlayer = {};
            return;
        }

        const nextSelections = {};
        for (const [materialKey, playerSelections] of Object.entries(parsed)) {
            if (!materialKey || !playerSelections || typeof playerSelections !== "object" || Array.isArray(playerSelections)) {
                continue;
            }

            const playerMap = {};
            for (const [playerName, selectedQty] of Object.entries(playerSelections)) {
                if (!playerName) continue;
                const qty = normalizeMaterialProgressQuantity(selectedQty, 0);
                if (qty > 0) {
                    playerMap[playerName] = qty;
                }
            }

            if (Object.keys(playerMap).length > 0) {
                nextSelections[materialKey] = playerMap;
            }
        }

        gAskSelectionsByMaterialAndPlayer = nextSelections;
    } catch {
        gAskSelectionsByMaterialAndPlayer = {};
    }
}

function saveAskSelections() {
    localStorage.setItem(askSelectionsStorageKey, JSON.stringify(gAskSelectionsByMaterialAndPlayer));
}

function loadHideCompletedRecursiveSetting() {
    try {
        const parsed = JSON.parse(localStorage.getItem(hideCompletedRecursiveStorageKey) || "false");
        gHideCompletedRecursiveEntries = Boolean(parsed);
    } catch {
        gHideCompletedRecursiveEntries = false;
    }
}

function saveHideCompletedRecursiveSetting() {
    localStorage.setItem(hideCompletedRecursiveStorageKey, JSON.stringify(gHideCompletedRecursiveEntries));
}

function isHideCompletedRecursiveEnabled() {
    return Boolean(gHideCompletedRecursiveEntries);
}

function getAskSelectionsForMaterial(materialName = "") {
    const key = normalizeMaterialCheckKey(materialName);
    return gAskSelectionsByMaterialAndPlayer[key] || {};
}

function setAskSelectionForMaterial(materialName = "", playerName = "", selectedQty = 0) {
    const key = normalizeMaterialCheckKey(materialName);
    if (!key || !playerName) return;

    const qty = normalizeMaterialProgressQuantity(selectedQty, 0);

    if (!gAskSelectionsByMaterialAndPlayer[key]) {
        gAskSelectionsByMaterialAndPlayer[key] = {};
    }

    if (qty <= 0) {
        delete gAskSelectionsByMaterialAndPlayer[key][playerName];
        if (Object.keys(gAskSelectionsByMaterialAndPlayer[key]).length === 0) {
            delete gAskSelectionsByMaterialAndPlayer[key];
        }
    } else {
        gAskSelectionsByMaterialAndPlayer[key][playerName] = qty;
    }

    saveAskSelections();
}

function setAskSelectionsForMaterial(materialName = "", nextSelections = {}) {
    const key = normalizeMaterialCheckKey(materialName);
    if (!key) return;

    const currentSelections = getAskSelectionsForMaterial(materialName);
    for (const playerName of Object.keys(currentSelections)) {
        setAskSelectionForMaterial(materialName, playerName, 0);
    }

    for (const [playerName, selectedQty] of Object.entries(nextSelections || {})) {
        if (!playerName) continue;
        setAskSelectionForMaterial(materialName, playerName, selectedQty);
    }
}

function getAutoAskSelectionMap(materialName = "", requiredQty = 0, currentEffectiveQty = 0) {
    const required = normalizeMaterialProgressQuantity(requiredQty, 0);
    const effective = normalizeMaterialProgressQuantity(currentEffectiveQty, 0);
    const targetQty = Math.max(0, required - effective);

    if (targetQty <= 0) return {};

    const askPlayers = getAskPlayersWithInventoryForMaterial(materialName)
        .slice()
        .sort((left, right) => {
            const qtyDelta = right.availableQty - left.availableQty;
            if (qtyDelta !== 0) return qtyDelta;
            return left.playerName.localeCompare(right.playerName);
        });

    const nextSelections = {};
    let remainingQty = targetQty;

    for (const { playerName, availableQty } of askPlayers) {
        if (remainingQty <= 0) break;

        const takeQty = Math.min(normalizeMaterialProgressQuantity(availableQty, 0), remainingQty);
        if (takeQty <= 0) continue;

        nextSelections[playerName] = takeQty;
        remainingQty -= takeQty;
    }

    return nextSelections;
}

function clearAskSelectionsForPlayer(playerName = "") {
    if (!playerName) return;

    let modified = false;
    for (const materialKey in gAskSelectionsByMaterialAndPlayer) {
        if (gAskSelectionsByMaterialAndPlayer[materialKey][playerName]) {
            delete gAskSelectionsByMaterialAndPlayer[materialKey][playerName];
            if (Object.keys(gAskSelectionsByMaterialAndPlayer[materialKey]).length === 0) {
                delete gAskSelectionsByMaterialAndPlayer[materialKey];
            }
            modified = true;
        }
    }

    if (modified) {
        saveAskSelections();
    }
}

// ===== INVENTORY LOOKUP & BORROW STATE FILTERING =====

function getPlayerInventoryForMaterial(playerName = "", materialName = "") {
    if (!playerName || !materialName) return 0;
    if (!gAllPlayers || !Array.isArray(gAllPlayers) || gAllPlayers.length === 0) return 0;

    const materialKeyNormalized = normalizeMaterialCheckKey(materialName);
    if (!materialKeyNormalized) return 0;

    const player = gAllPlayers.find(p => {
        const name = String(p?.name || "").trim();
        return name === playerName;
    });

    if (!player || !Array.isArray(player.items) || player.items.length === 0) return 0;

    const matchingItem = player.items.find(item => {
        const itemKeyNormalized = normalizeMaterialCheckKey(item?.name || "");
        return itemKeyNormalized === materialKeyNormalized;
    });

    const qty = normalizeMaterialProgressQuantity(matchingItem?.qty, 0);
    return Math.max(0, qty);
}

function getPlayersWithBorrowState(targetState = borrowStateAlways) {
    const playerNames = getPlayerNamesFromInventories();
    if (!playerNames || playerNames.length === 0) return [];
    
    return playerNames.filter(playerName => {
        const state = getBorrowStateForPlayer(playerName);
        return state === targetState;
    });
}

function getAlwaysPlayerInventoryForMaterial(materialName = "") {
    if (!materialName) return 0;

    const alwaysPlayers = getPlayersWithBorrowState(borrowStateAlways);
    if (!alwaysPlayers || alwaysPlayers.length === 0) return 0;

    let totalQty = 0;
    for (const playerName of alwaysPlayers) {
        const qty = getPlayerInventoryForMaterial(playerName, materialName);
        if (Number.isFinite(qty) && qty > 0) {
            totalQty += qty;
        }
    }

    return Math.max(0, totalQty);
}

function getAlwaysPlayersWithInventoryForMaterial(materialName = "") {
    if (!materialName) return [];

    const alwaysPlayers = getPlayersWithBorrowState(borrowStateAlways);
    if (!alwaysPlayers || alwaysPlayers.length === 0) return [];

    const result = [];
    for (const playerName of alwaysPlayers) {
        const availableQty = getPlayerInventoryForMaterial(playerName, materialName);
        if (Number.isFinite(availableQty) && availableQty > 0) {
            result.push({ playerName, availableQty });
        }
    }

    return result;
}

function getAskPlayersWithInventoryForMaterial(materialName = "") {
    if (!materialName) return [];

    const askPlayers = getPlayersWithBorrowState(borrowStateAsk);
    if (!askPlayers || askPlayers.length === 0) return [];

    const result = [];
    for (const playerName of askPlayers) {
        const availableQty = getPlayerInventoryForMaterial(playerName, materialName);
        if (Number.isFinite(availableQty) && availableQty > 0) {
            result.push({ playerName, availableQty });
        }
    }

    return result;
}

function getTotalAskSelectedForMaterial(materialName = "") {
    const selections = getAskSelectionsForMaterial(materialName);
    return Object.values(selections).reduce((sum, qty) => sum + normalizeMaterialProgressQuantity(qty, 0), 0);
}

function applyAutoAskSelectionForMaterial(materialName = "", requiredQty = 0, materialsNeeded = {}) {
    const previousEffectiveQty = getEffectiveMaterialHaveQuantity(materialName);
    const currentEffectiveQty = getEffectiveMaterialHaveQuantity(materialName);
    const autoSelections = getAutoAskSelectionMap(materialName, requiredQty, currentEffectiveQty);
    setAskSelectionsForMaterial(materialName, autoSelections);

    const nextEffectiveQty = getEffectiveMaterialHaveQuantity(materialName);
    const quantityDelta = nextEffectiveQty - previousEffectiveQty;
    if (quantityDelta !== 0) {
        propagateMaterialCompletionToChildren(materialName, quantityDelta, materialsNeeded);
    }
}

// ===== ASK PICKER UI =====

function createAskPickerOverlay(materialName = "", materialsList = null, requiredQty = 0) {
    const overlay = document.createElement("div");
    overlay.classList.add("ask-picker-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", `Choose quantities to borrow from players for ${materialName}`);

    const pickerContent = document.createElement("div");
    pickerContent.classList.add("ask-picker-content");

    const askPlayers = getAskPlayersWithInventoryForMaterial(materialName);
    const alwaysPlayers = getAlwaysPlayersWithInventoryForMaterial(materialName);
    const currentSelections = getAskSelectionsForMaterial(materialName) || {};
    const materialsNeeded = getMaterialListFromSelectedItems(gSelectedItems);

    const pickerTitle = document.createElement("h3");
    pickerTitle.classList.add("ask-picker-title");
    pickerTitle.textContent = `Get ${materialName} from:`;
    pickerContent.appendChild(pickerTitle);

    if (alwaysPlayers.length > 0) {
        const alwaysHeader = document.createElement("p");
        alwaysHeader.classList.add("ask-picker-section-title");
        alwaysHeader.textContent = "Always pulling from:";
        pickerContent.appendChild(alwaysHeader);

        const alwaysList = document.createElement("div");
        alwaysList.classList.add("ask-picker-always-list");

        for (const entry of alwaysPlayers) {
            if (!entry || !entry.playerName) continue;

            const checkedAvailableQty = normalizeMaterialProgressQuantity(entry.availableQty, 0);
            if (checkedAvailableQty <= 0) continue;

            const alwaysRow = document.createElement("div");
            alwaysRow.classList.add("ask-picker-player-row", "ask-picker-player-row-readonly");

            const alwaysLabel = document.createElement("span");
            alwaysLabel.classList.add("ask-picker-player-name");
            alwaysLabel.textContent = `${entry.playerName} (${checkedAvailableQty} available)`;

            const alwaysBadge = document.createElement("span");
            alwaysBadge.classList.add("ask-picker-player-badge");
            alwaysBadge.textContent = "Always";

            alwaysRow.appendChild(alwaysLabel);
            alwaysRow.appendChild(alwaysBadge);
            alwaysList.appendChild(alwaysRow);
        }

        pickerContent.appendChild(alwaysList);
    }

    let playersList = null;
    if (askPlayers.length > 0) {
        const askHeader = document.createElement("p");
        askHeader.classList.add("ask-picker-section-title");
        askHeader.textContent = "You can borrow from:";
        pickerContent.appendChild(askHeader);

        playersList = document.createElement("div");
        playersList.classList.add("ask-picker-players-list");

        for (const entry of askPlayers) {
            if (!entry || !entry.playerName) continue;

            const { playerName, availableQty } = entry;
            const checkedAvailableQty = normalizeMaterialProgressQuantity(availableQty, 0);
            if (checkedAvailableQty <= 0) continue;

            const playerRow = document.createElement("div");
            playerRow.classList.add("ask-picker-player-row");

            const playerLabel = document.createElement("span");
            playerLabel.classList.add("ask-picker-player-name");
            playerLabel.textContent = `${playerName} (${checkedAvailableQty} available)`;

            const selectedQty = normalizeMaterialProgressQuantity(currentSelections[playerName], 0);

            const quantityInput = document.createElement("input");
            quantityInput.type = "number";
            quantityInput.min = "0";
            quantityInput.max = String(checkedAvailableQty);
            quantityInput.step = "1";
            quantityInput.inputMode = "numeric";
            quantityInput.classList.add("ask-picker-input");
            quantityInput.value = String(selectedQty);
            quantityInput.setAttribute("aria-label", `Quantity from ${playerName}`);

            playerRow.appendChild(playerLabel);
            playerRow.appendChild(quantityInput);
            playersList.appendChild(playerRow);

            // Store reference for apply action
            quantityInput.dataset.playerName = playerName;
            quantityInput.dataset.availableQty = String(checkedAvailableQty);
        }

        pickerContent.appendChild(playersList);
    }

    if (alwaysPlayers.length === 0 && askPlayers.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.classList.add("ask-picker-empty-state");
        emptyState.textContent = "No inventories are available to pull from.";
        pickerContent.appendChild(emptyState);
    }

    if (playersList) {
        const buttonContainer = document.createElement("div");
        buttonContainer.classList.add("ask-picker-buttons");

        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.classList.add(elementClassButton, "ask-picker-apply");
        applyButton.textContent = "Apply";
        applyButton.setAttribute("aria-label", "Apply selected quantities");

        const resetButton = document.createElement("button");
        resetButton.type = "button";
        resetButton.classList.add(elementClassButton, "ask-picker-reset");
        resetButton.textContent = "Reset";
        resetButton.setAttribute("aria-label", "Clear all selections");

        const autoButton = document.createElement("button");
        autoButton.type = "button";
        autoButton.classList.add(elementClassButton, "ask-picker-auto");
        autoButton.textContent = "Auto";
        autoButton.setAttribute("aria-label", "Automatically choose quantities");

        buttonContainer.appendChild(applyButton);
        buttonContainer.appendChild(autoButton);
        buttonContainer.appendChild(resetButton);
        pickerContent.appendChild(buttonContainer);

        // Event handlers
        applyButton.addEventListener("click", () => {
            const previousEffectiveQty = getEffectiveMaterialHaveQuantity(materialName);
            const inputs = playersList.querySelectorAll("input");
            for (const input of inputs) {
                const playerName = input.dataset.playerName;
                if (!playerName) continue;

                const selectedQty = normalizeMaterialProgressQuantity(input.value, 0);
                const maxQty = normalizeMaterialProgressQuantity(input.dataset.availableQty, 0);

                // Clamp to available quantity
                const clampedQty = Math.min(Math.max(selectedQty, 0), maxQty);
                setAskSelectionForMaterial(materialName, playerName, clampedQty);
            }

            const nextEffectiveQty = getEffectiveMaterialHaveQuantity(materialName);
            const quantityDelta = nextEffectiveQty - previousEffectiveQty;
            if (quantityDelta !== 0) {
                propagateMaterialCompletionToChildren(materialName, quantityDelta, materialsNeeded);
            }

            // Close picker and refresh materials
            overlay.remove();
            if (materialsList) {
                populateMaterialsList(materialsList, true);
                initCraftingTimeCard();
            }
        });

        autoButton.addEventListener("click", () => {
            applyAutoAskSelectionForMaterial(materialName, requiredQty, materialsNeeded);

            overlay.remove();
            if (materialsList) {
                populateMaterialsList(materialsList, true);
                initCraftingTimeCard();
            }
        });

        resetButton.addEventListener("click", () => {
            const previousEffectiveQty = getEffectiveMaterialHaveQuantity(materialName);
            const inputs = playersList.querySelectorAll("input");
            for (const input of inputs) {
                const playerName = input.dataset.playerName;
                if (!playerName) continue;

                setAskSelectionForMaterial(materialName, playerName, 0);
            }

            const nextEffectiveQty = getEffectiveMaterialHaveQuantity(materialName);
            const quantityDelta = nextEffectiveQty - previousEffectiveQty;
            if (quantityDelta !== 0) {
                propagateMaterialCompletionToChildren(materialName, quantityDelta, materialsNeeded);
            }

            overlay.remove();
            if (materialsList) {
                populateMaterialsList(materialsList, true);
                initCraftingTimeCard();
            }
        });
    }

    overlay.appendChild(pickerContent);

    // Close on outside click
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            overlay.remove();
        }
    });

    // Close on Escape
    const escapeHandler = (event) => {
        if (event.key === "Escape" && overlay.parentNode) {
            overlay.remove();
            document.removeEventListener("keydown", escapeHandler);
        }
    };
    document.addEventListener("keydown", escapeHandler);

    return overlay;
}






function getPlayerNamesFromInventories() {
    const names = (gAllPlayers || [])
        .map(player => String(player?.name || "").trim())
        .filter(Boolean);

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

function getBorrowStateForPlayer(playerName) {
    return normalizeBorrowState(gCharacterBorrowSettings[playerName]);
}

function setBorrowStateForPlayer(playerName, nextState) {
    if (!playerName) return;

    gCharacterBorrowSettings[playerName] = normalizeBorrowState(nextState);
    saveCharacterBorrowSettings();
}

function getNextBorrowState(currentState) {
    const normalizedState = normalizeBorrowState(currentState);
    const stateIndex = borrowStates.indexOf(normalizedState);
    const nextIndex = (stateIndex + 1) % borrowStates.length;
    return borrowStates[nextIndex];
}

function createBorrowStateButton(playerName, state) {
    const button = document.createElement("button");
    button.type = "button";
    button.classList.add(elementClassButton, "borrow-state-button", `is-${state}`);
    button.textContent = state;
    button.setAttribute("aria-label", `Borrow state for ${playerName}: ${state}. Click to cycle.`);
    button.title = "Click to cycle: always -> ask -> never";

    button.addEventListener("click", () => {
        const currentState = getBorrowStateForPlayer(playerName);
        const nextState = getNextBorrowState(currentState);
        setBorrowStateForPlayer(playerName, nextState);

        button.classList.remove(`is-${currentState}`);
        button.classList.add(`is-${nextState}`);
        button.textContent = nextState;
        button.setAttribute("aria-label", `Borrow state for ${playerName}: ${nextState}. Click to cycle.`);

        // If switching to Never, clear this player's Ask selections
        if (nextState === borrowStateNever) {
            clearAskSelectionsForPlayer(playerName);
        }

        // Trigger materials recomputation
        recomputeMaterialsDisplay();
    });

    return button;
}

function renderSettingsMenuRows() {
    const listElement = document.getElementById(toolbarSettingsListId);
    if (!listElement) return;

    listElement.innerHTML = "";
    const playerNames = getPlayerNamesFromInventories();

    if (playerNames.length === 0) {
        const emptyState = document.createElement("p");
        emptyState.classList.add("settings-empty");
        emptyState.textContent = "No character inventories found.";
        listElement.appendChild(emptyState);
        return;
    }

    for (const playerName of playerNames) {
        const row = document.createElement("div");
        row.classList.add("settings-row");

        const label = document.createElement("span");
        label.classList.add("settings-player-name");
        label.textContent = playerName;

        const state = getBorrowStateForPlayer(playerName);
        const stateButton = createBorrowStateButton(playerName, state);

        row.appendChild(label);
        row.appendChild(stateButton);
        listElement.appendChild(row);
    }
}

function setupToolbarSettingsMenu() {
    const menu = document.getElementById(toolbarSettingsMenuId);
    const openButton = document.getElementById(toolbarButtonSettingsId);
    if (!menu || !openButton) return;

    const setOpen = (isOpen) => {
        menu.hidden = !isOpen;
        openButton.classList.toggle("is-active", isOpen);
        openButton.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) {
            renderSettingsMenuRows();
        }
    };

    setOpen(false);

    openButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(menu.hidden);
    });

    menu.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", () => {
        setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            setOpen(false);
        }
    });
}

function normalizeMaterialProgressQuantity(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return Math.floor(parsed);
}

function loadMaterialsProgress() {
    try {
        const parsed = JSON.parse(localStorage.getItem(materialsProgressStorageKey) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            gMaterialProgressByKey = {};
            return;
        }

        const out = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (!key || !value || typeof value !== "object") continue;

            // Migrate legacy "checked off" entries back to baseline quantities.
            const wasChecked = Boolean(value.isChecked);
            const parsedHaveQty = normalizeMaterialProgressQuantity(value.haveQty, 0);
            const originalQty = normalizeMaterialProgressQuantity(value.originalQty, parsedHaveQty);
            const haveQty = wasChecked ? originalQty : parsedHaveQty;

            out[key] = { haveQty, originalQty };
        }

        gMaterialProgressByKey = out;
    } catch {
        gMaterialProgressByKey = {};
    }
}

function saveMaterialsProgress() {
    localStorage.setItem(materialsProgressStorageKey, JSON.stringify(gMaterialProgressByKey));
}

function loadChecklistState(storageKey = "") {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {};
        }

        const out = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (!key) continue;
            out[key] = Boolean(value);
        }

        return out;
    } catch {
        return {};
    }
}

function saveChecklistState(storageKey = "", checklistState = {}) {
    localStorage.setItem(storageKey, JSON.stringify(checklistState));
}

function loadSkillChecks() {
    gSkillChecksByKey = loadChecklistState(skillsChecksStorageKey);
}

function saveSkillChecks() {
    saveChecklistState(skillsChecksStorageKey, gSkillChecksByKey);
}

function loadToolChecks() {
    gToolChecksByKey = loadChecklistState(toolsChecksStorageKey);
}

function saveToolChecks() {
    saveChecklistState(toolsChecksStorageKey, gToolChecksByKey);
}

function normalizeChecklistKey(name = "") {
    return String(name).trim().toLowerCase();
}

function isSkillChecked(skillName = "") {
    const key = normalizeChecklistKey(skillName);
    return !!gSkillChecksByKey[key];
}

function setSkillChecked(skillName = "", nextChecked = false) {
    const key = normalizeChecklistKey(skillName);
    if (!key) return;
    gSkillChecksByKey[key] = Boolean(nextChecked);
    saveSkillChecks();
}

function isToolChecked(toolName = "") {
    const key = normalizeChecklistKey(toolName);
    return !!gToolChecksByKey[key];
}

function setToolChecked(toolName = "", nextChecked = false) {
    const key = normalizeChecklistKey(toolName);
    if (!key) return;
    gToolChecksByKey[key] = Boolean(nextChecked);
    saveToolChecks();
}

function normalizeMaterialCheckKey(materialName = "") {
    return String(materialName).trim().toLowerCase();
}

function getSelectedItemByMaterialName(materialName = "") {
    const materialKey = normalizeMaterialCheckKey(materialName);
    if (!materialKey) return null;

    return gSelectedItems.find(item => {
        const itemName = item?.[markerTextContentProperty] || "";
        return normalizeMaterialCheckKey(itemName) === materialKey;
    }) || null;
}

function getSelectedItemByItemId(itemId = "") {
    const normalizedItemId = String(itemId || "").trim();
    if (!normalizedItemId) return null;

    return gSelectedItems.find(item => String(item?.itemId || "").trim() === normalizedItemId) || null;
}

function getSelectedItemRecipe(item) {
    if (!item) return null;

    const recipeIds = Array.isArray(item.recipeIds) ? item.recipeIds : [];
    const requestedRecipeId = recipeIds.includes(item.reqRecipeId)
        ? item.reqRecipeId
        : recipeIds[0];

    if (!requestedRecipeId) return null;
    return gAllRecipes.find(recipe => recipe.recipeId === requestedRecipeId) || null;
}

function applyMaterialProgressDelta(materialName = "", quantityDelta = 0, materialsNeeded = {}) {
    const key = normalizeMaterialCheckKey(materialName);
    if (!key || !Number.isFinite(quantityDelta) || quantityDelta === 0) {
        const currentProgress = getMaterialProgress(materialName);
        return {
            previousHaveQty: normalizeMaterialProgressQuantity(currentProgress.haveQty, 0),
            nextHaveQty: normalizeMaterialProgressQuantity(currentProgress.haveQty, 0),
        };
    }
    if (!materialsNeeded?.[materialName]) {
        const currentProgress = getMaterialProgress(materialName);
        return {
            previousHaveQty: normalizeMaterialProgressQuantity(currentProgress.haveQty, 0),
            nextHaveQty: normalizeMaterialProgressQuantity(currentProgress.haveQty, 0),
        };
    }

    const currentProgress = getMaterialProgress(materialName);
    const previousHaveQty = normalizeMaterialProgressQuantity(currentProgress.haveQty, 0);
    const nextHaveQty = normalizeMaterialProgressQuantity(currentProgress.haveQty + quantityDelta, 0);

    setMaterialProgress(materialName, {
        haveQty: nextHaveQty,
        originalQty: currentProgress.originalQty,
    });

    return { previousHaveQty, nextHaveQty };
}

function getCompletedCraftRunsForMaterialQuantity(materialName = "", haveQty = 0) {
    const selectedItem = getSelectedItemByMaterialName(materialName);
    const recipe = getSelectedItemRecipe(selectedItem);
    if (!selectedItem?.itemId || !recipe) return 0;

    const outputQuantity = getRecipeOutputQuantity(recipe, selectedItem.itemId);
    if (!Number.isFinite(outputQuantity) || outputQuantity <= 0) return 0;

    const normalizedHaveQty = normalizeMaterialProgressQuantity(haveQty, 0);
    return Math.floor(normalizedHaveQty / outputQuantity);
}

function propagateMaterialProgressRunsToChildren(materialName = "", craftRunsDelta = 0, materialsNeeded = {}, path = new Set()) {
    const parentKey = normalizeMaterialCheckKey(materialName);
    const normalizedCraftRunsDelta = Number.isFinite(craftRunsDelta) ? Math.floor(craftRunsDelta) : 0;

    if (!parentKey || normalizedCraftRunsDelta === 0) return;
    if (path.has(parentKey)) return;

    const nextPath = new Set(path);
    nextPath.add(parentKey);

    const selectedItem = getSelectedItemByMaterialName(materialName);
    const recipe = getSelectedItemRecipe(selectedItem);
    if (!selectedItem?.itemId || !recipe || !Array.isArray(recipe[itemPropertyMaterials])) {
        return;
    }

    for (const ingredient of recipe[itemPropertyMaterials]) {
        const childMaterialName = ingredient?.[itemPropertyMaterialsName] || "";
        const ingredientQty = normalizeMaterialProgressQuantity(ingredient?.[itemPropertyMaterialsQuantity], 0);

        if (!childMaterialName || ingredientQty <= 0) continue;
        if (!materialsNeeded?.[childMaterialName]) continue;

        const childDelta = ingredientQty * normalizedCraftRunsDelta;
        const { previousHaveQty, nextHaveQty } = applyMaterialProgressDelta(childMaterialName, childDelta, materialsNeeded);
        const previousRuns = getCompletedCraftRunsForMaterialQuantity(childMaterialName, previousHaveQty);
        const nextRuns = getCompletedCraftRunsForMaterialQuantity(childMaterialName, nextHaveQty);
        const childCraftRunsDelta = nextRuns - previousRuns;

        propagateMaterialProgressRunsToChildren(childMaterialName, childCraftRunsDelta, materialsNeeded, nextPath);
    }
}

function propagateMaterialCompletionToChildren(materialName = "", quantityDelta = 0, materialsNeeded = {}, path = new Set()) {
    const parentKey = normalizeMaterialCheckKey(materialName);
    if (!parentKey || !Number.isFinite(quantityDelta) || quantityDelta === 0) return;
    if (path.has(parentKey)) return;

    const nextPath = new Set(path);
    nextPath.add(parentKey);

    const selectedItem = getSelectedItemByMaterialName(materialName);
    const recipe = getSelectedItemRecipe(selectedItem);
    if (!selectedItem?.itemId || !recipe || !Array.isArray(recipe[itemPropertyMaterials])) {
        return;
    }

    const direction = quantityDelta > 0 ? 1 : -1;
    const craftRuns = getCraftRunsForQuantity(recipe, Math.abs(quantityDelta), selectedItem.itemId);
    if (craftRuns <= 0) return;

    for (const ingredient of recipe[itemPropertyMaterials]) {
        const childMaterialName = ingredient?.[itemPropertyMaterialsName] || "";
        const ingredientQty = normalizeMaterialProgressQuantity(ingredient?.[itemPropertyMaterialsQuantity], 0);
        if (!childMaterialName || ingredientQty <= 0) continue;
        if (!materialsNeeded?.[childMaterialName]) continue;

        const childDelta = direction * ingredientQty * craftRuns;
        applyMaterialProgressDelta(childMaterialName, childDelta, materialsNeeded);
        propagateMaterialCompletionToChildren(childMaterialName, childDelta, materialsNeeded, nextPath);
    }
}

function getMaterialProgress(materialName = "") {
    const key = normalizeMaterialCheckKey(materialName);
    return gMaterialProgressByKey[key] || { haveQty: 0, originalQty: 0 };
}

function getEffectiveMaterialHaveQuantity(materialName = "") {
    const progress = getMaterialProgress(materialName);
    const manualHave = normalizeMaterialProgressQuantity(progress.haveQty, 0);
    const alwaysQty = normalizeMaterialProgressQuantity(getAlwaysPlayerInventoryForMaterial(materialName), 0);
    const askQty = normalizeMaterialProgressQuantity(getTotalAskSelectedForMaterial(materialName), 0);
    
    const total = manualHave + alwaysQty + askQty;
    return Math.max(0, total);
}

function getDerivedBorrowQuantityForMaterial(materialName = "") {
    const alwaysQty = normalizeMaterialProgressQuantity(getAlwaysPlayerInventoryForMaterial(materialName), 0);
    const askQty = normalizeMaterialProgressQuantity(getTotalAskSelectedForMaterial(materialName), 0);
    return Math.max(0, alwaysQty + askQty);
}

function setMaterialProgress(materialName = "", nextProgress = {}) {
    const key = normalizeMaterialCheckKey(materialName);
    if (!key) return;

    const current = getMaterialProgress(materialName);
    const haveQty = normalizeMaterialProgressQuantity(nextProgress.haveQty, current.haveQty);
    const originalQty = normalizeMaterialProgressQuantity(nextProgress.originalQty, current.originalQty);

    gMaterialProgressByKey[key] = { haveQty, originalQty };
    saveMaterialsProgress();
}

function isMaterialChecked(materialName = "", requiredQty = 0) {
    const required = normalizeMaterialProgressQuantity(requiredQty, 0);
    if (required <= 0) return false;
    return getEffectiveMaterialHaveQuantity(materialName) >= required;
}

function rebuildMaterialProgressFromBorrowSources(selectedItems = gSelectedItems) {
    const materialsNeeded = getMaterialListFromSelectedItems(selectedItems);

    // Parent-discount progress is derived from current borrow sources.
    gMaterialProgressByKey = {};

    for (const materialName in materialsNeeded) {
        const requiredQty = normalizeMaterialProgressQuantity(materialsNeeded[materialName]?.qty, 0);
        const sourceQty = Math.min(
            normalizeMaterialProgressQuantity(getDerivedBorrowQuantityForMaterial(materialName), 0),
            requiredQty,
        );
        if (sourceQty <= 0) continue;

        propagateMaterialCompletionToChildren(materialName, sourceQty, materialsNeeded);
    }

    saveMaterialsProgress();
}

function loadSelectedTreeCollapsedKeys() {
    try {
        const parsed = JSON.parse(localStorage.getItem(selectedTreeCollapsedStorageKey) || "[]");
        if (!Array.isArray(parsed)) {
            gSelectedTreeCollapsedKeys = new Set();
            return;
        }

        gSelectedTreeCollapsedKeys = new Set(parsed.filter(v => typeof v === "string" && v.length > 0));
    } catch {
        gSelectedTreeCollapsedKeys = new Set();
    }
}

function saveSelectedTreeCollapsedKeys() {
    localStorage.setItem(selectedTreeCollapsedStorageKey, JSON.stringify(Array.from(gSelectedTreeCollapsedKeys)));
}

function isTreeNodeCollapsed(pathKey) {
    if (!pathKey) return false;
    return gSelectedTreeCollapsedKeys.has(pathKey);
}

function setTreeNodeCollapsed(pathKey, isCollapsed) {
    if (!pathKey) return;

    if (isCollapsed) {
        gSelectedTreeCollapsedKeys.add(pathKey);
    } else {
        gSelectedTreeCollapsedKeys.delete(pathKey);
    }

    saveSelectedTreeCollapsedKeys();
}

const presetCraftGridAreas = [
    pageCraftsCardStyleTracked,
    pageCraftsCardStyleSelected,
    pageCraftsCardStyleToolbar,
    pageCraftsCardStyleCraftingTime,
    pageCraftsCardStyleTools,
    pageCraftsCardStyleSkills,
    pageCraftsCardStyleMaterials
];

function createDebouncedHandler(callback, delay = 120) {
    let timeoutId = null;
    return () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(callback, delay);
    };
}

function getCraftCardByGridArea(gridAreaName) {
    if (!mainGrid) return null;

    return Array.from(mainGrid.getElementsByClassName(elementClassCard)).find(card => card.style.gridArea === gridAreaName) || null;
}

function syncCraftSummaryCardHeights() {
    const selectedCard = getCraftCardByGridArea(pageCraftsCardStyleSelected);
    const trackedCard = getCraftCardByGridArea(pageCraftsCardStyleTracked);
    const skillsCard = getCraftCardByGridArea(pageCraftsCardStyleSkills);
    const toolsCard = getCraftCardByGridArea(pageCraftsCardStyleTools);
    const materialsCard = getCraftCardByGridArea(pageCraftsCardStyleMaterials);
    const craftingTimeCard = getCraftCardByGridArea(pageCraftsCardStyleCraftingTime);
    if (!skillsCard || !toolsCard) return;

    const cardsToReset = [selectedCard, trackedCard, skillsCard, toolsCard, materialsCard, craftingTimeCard];
    for (const card of cardsToReset) {
        if (!card) continue;
        card.style.height = "";
        card.style.maxHeight = "";
    }

    const referenceHeight = Math.max(skillsCard.scrollHeight, toolsCard.scrollHeight);
    const summaryRowHeight = Math.max(referenceHeight, craftCardsMinimumHeightPx);
    const summaryHeightPx = `${summaryRowHeight}px`;

    const summaryCards = [
        skillsCard,
        toolsCard,
        materialsCard
    ];

    for (const card of summaryCards) {
        if (!card) continue;
        card.style.minHeight = `${craftCardsMinimumHeightPx}px`;
        card.style.height = summaryHeightPx;
        card.style.maxHeight = summaryHeightPx;
    }

    if (!selectedCard || !trackedCard || !craftingTimeCard || !mainGrid) {
        return;
    }

    const gridRowGap = Number.parseFloat(getComputedStyle(mainGrid).rowGap || "0") || 0;
    const craftingRowHeight = craftingTimeCard.scrollHeight;
    const sideHeight = Math.max(summaryRowHeight + craftingRowHeight + gridRowGap, craftCardsMinimumHeightPx);
    const sideHeightPx = `${Math.round(sideHeight)}px`;

    for (const card of [selectedCard, trackedCard]) {
        card.style.minHeight = `${craftCardsMinimumHeightPx}px`;
        card.style.height = sideHeightPx;
        card.style.maxHeight = sideHeightPx;
    }
}

function getIndividualRecipeCards() {
    if (!mainGrid) return [];

    return Array.from(mainGrid.getElementsByClassName(elementClassCard)).filter(card => {
        return !presetCraftGridAreas.includes(card.style.gridArea);
    });
}

function syncIndividualRecipeCardSizes() {
    const recipeCards = getIndividualRecipeCards();
    if (recipeCards.length === 0) return;

    for (const card of recipeCards) {
        card.style.height = "";
    }

    const smallestHeight = Math.min(...recipeCards.map(card => card.offsetHeight));
    const targetHeight = `${smallestHeight}px`;

    for (const card of recipeCards) {
        card.style.height = targetHeight;
        card.style.maxHeight = targetHeight;
    }
}

function getSelectedItemMarkKey(selectedItem) {
    if (selectedItem?.__markKey && gTrackedItems[selectedItem.__markKey]?.[markerPropertySelected]) {
        return selectedItem.__markKey;
    }

    for (const key in gTrackedItems) {
        const trackedItem = gTrackedItems[key];
        if (!trackedItem?.[markerPropertySelected]) continue;

        if (selectedItem.itemId && trackedItem.itemId === selectedItem.itemId) {
            return key;
        }

        if (trackedItem[markerTextContentProperty] === selectedItem[markerTextContentProperty]) {
            return key;
        }
    }

    return "";
}

function setPinnedState(markKey, isPinned) {
    if (!markKey || !gTrackedItems[markKey]) return;

    gTrackedItems[markKey][markerPropertyPinned] = isPinned;
    saveMarks(gTrackedItems);
}

function normalizeSelectedQuantity(quantity) {
    const parsedQuantity = Number(quantity);

    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
        return 1;
    }

    return Math.floor(parsedQuantity);
}

function getSelectedItemQuantity(item) {
    return normalizeSelectedQuantity(item?.qty);
}

function setSelectedItemQuantity(item, quantity) {
    const markKey = getSelectedItemMarkKey(item);
    if (!markKey || !gTrackedItems[markKey]) return;

    if (gTrackedItems[markKey].recursiveSource === RECURSIVE_SOURCE_AUTO) {
        return;
    }

    gTrackedItems[markKey].recursiveSource = RECURSIVE_SOURCE_MANUAL;
    gTrackedItems[markKey].qty = normalizeSelectedQuantity(quantity);
    saveMarks(gTrackedItems);
    updateView();
}

function removeSelectedItemByMarkKey(markKey) {
    if (!markKey || !gTrackedItems[markKey]) return;

    const trackedEntry = gTrackedItems[markKey];
    delete trackedEntry[markerPropertySelected];
    delete trackedEntry.recursiveSource;

    if (!trackedEntry.favorited && !trackedEntry.category && !trackedEntry.selected) {
        delete gTrackedItems[markKey];
    }

    saveMarks(gTrackedItems);
    updateView();
}

function createPinToggleButton(item, itemMarkKey, options = {}) {
    const isPinned = !!gTrackedItems[itemMarkKey]?.[markerPropertyPinned];
    const pinButton = document.createElement("button");
    const isCardButton = !!options.cardButton;
    const pinColor = isPinned ? "var(--textYellow)" : "rgba(242,242,242,0.45)";

    pinButton.classList.add(elementClassButton);
    pinButton.type = "button";
    pinButton.setAttribute("aria-label", isPinned ? "Unpin item" : "Pin item");
    pinButton.title = isPinned ? "Unpin item" : "Pin item";
    pinButton.textContent = "⚲";
    pinButton.style.color = pinColor;
    pinButton.style.padding = "0.1rem 0.45rem";
    pinButton.style.fontSize = "0.95rem";
    pinButton.style.whiteSpace = "nowrap";
    pinButton.style.display = "inline-flex";
    pinButton.style.alignItems = "center";
    pinButton.style.justifyContent = "center";
    pinButton.style.alignSelf = "flex-end";

    if (isCardButton) {
        pinButton.style.position = "absolute";
        pinButton.style.top = "0.45rem";
        pinButton.style.right = "0.45rem";
        pinButton.style.zIndex = "2";
        pinButton.style.padding = "0.05rem 0.25rem";
        pinButton.style.fontSize = "0.8rem";
        pinButton.style.lineHeight = "1";
        pinButton.style.alignSelf = "auto";
    }

    pinButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!itemMarkKey) return;
        setPinnedState(itemMarkKey, !isPinned);
        updateView();
    });

    return pinButton;
}

// CRAFTING.HTML PAGE FUNCTIONS
// - BUTTON FUNCTIONALITY
function setupButtonClear(){
    document.getElementById("testButton").addEventListener("click", () => {
        const marks = loadMarks();
        let changed = false;

        for (const key of Object.keys(marks)) {
            const entry = marks[key];
            if (entry?.selected) {
                delete entry.selected;
                delete entry.recursiveSource;
                changed = true;
            }
            // Remove the entry entirely if nothing worth keeping remains
            if (!entry.favorited && !entry.category && !entry.selected) {
                delete marks[key];
            }
        }

        if (changed) {
            saveMarks(marks);
            updateView();
        }
    });
}

function setupButtonSave(){
    let elementId = ""
    document.getElementById(elementId = "toolbarSave").addEventListener("click", () => {
        const html = document.documentElement.outerHTML;
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `${document.title || "page"}.html`;
        document.body.appendChild(a);
        a.click();

        URL.revokeObjectURL(url);
        a.remove();
    });
}

function updateRecursiveToggleButtonState() {
    const button = document.getElementById(toolbarButtonRecursiveId);
    if (!button) return;

    const enabled = isRecursiveModeEnabled();
    button.textContent = enabled ? "Recursive: ON" : "Recursive: OFF";
    button.classList.toggle("is-active", enabled);
}

function updateHideCompletedRecursiveToggleButtonState() {
    const button = document.getElementById(toolbarButtonHideCompletedRecursiveId);
    if (!button) return;

    const enabled = isHideCompletedRecursiveEnabled();
    button.textContent = enabled ? "Hide Done Recursives: ON" : "Hide Done Recursives: OFF";
    button.classList.toggle("is-active", enabled);
}

function setupRecursiveToggleButton() {
    const button = document.getElementById(toolbarButtonRecursiveId);
    if (!button) return;

    updateRecursiveToggleButtonState();

    button.addEventListener("click", () => {
        const nextState = !isRecursiveModeEnabled();
        setRecursiveModeEnabled(nextState);
        if (nextState) {
            gSelectedTreeCollapsedKeys.clear();
            saveSelectedTreeCollapsedKeys();
        }
        updateView();
    });
}

function setupHideCompletedRecursiveToggleButton() {
    const button = document.getElementById(toolbarButtonHideCompletedRecursiveId);
    if (!button) return;

    updateHideCompletedRecursiveToggleButtonState();

    button.addEventListener("click", () => {
        gHideCompletedRecursiveEntries = !isHideCompletedRecursiveEnabled();
        saveHideCompletedRecursiveSetting();
        updateView();
    });
}

// - CARD
function createCard(baseElement, cardClassName = elementClassCard, cardElementStyle = "", cardElementId = ""){
    const cardBase = document.createElement("div");
    cardBase.classList.add(cardClassName);
    cardBase.id = cardElementId;
    cardBase.style = ("grid-area: " + cardElementStyle) || "";
    cardBase.justifyContent = "center";
    cardBase.style.maxWidth = "None";
    cardBase.style.maxHeight = craftCardsDefaultMaxHeight;
    cardBase.style.overflowY = "auto";

    baseElement.appendChild(cardBase);
    return cardBase;
}

// - BASIC DISPLAY/INTERACT FUNCTIONS
function appendList(baseElement, listClassName, listElementId){
    if (!(listElementId && baseElement)){return;}

    const element = document.createElement("ul");
    element.classList.add(listClassName);
    element.id = listElementId;
    baseElement.appendChild(element)

    return element;
}

function appendText(baseElement, textClassName, textElementId = "", textContent = ""){
    if (!baseElement){return;}

    const element = document.createElement("div");
    element.classList.add(textClassName);
    element.id = textElementId;
    element.textContent = textContent;
    baseElement.appendChild(element)

    return element;
}

function appendTitle(baseElement, titleClassName, titleElementId = "", title = "", isSubtitle = false){
    let element = ""
    if (baseElement && !isSubtitle){
        element = document.createElement("h1");
    } else if (baseElement && isSubtitle) {
        element = document.createElement("div");
    }

    element.classList.add(titleClassName)
    element.id = titleElementId;
    element.textContent = title;

    baseElement.appendChild(element)
}

function appendDropdown(baseElement, dropdownElementId){
    const element = document.createElement("select");
    element.id = dropdownElementId;

    baseElement.appendChild(element);
    return element;
}

function appendButton(baseElement, buttonClassName = elementClassButton, buttonElementId, buttonText, buttonHref = ""){
    let element = ""

    if (!buttonHref){
        element = document.createElement("button");
    } else {
        element = document.createElement("a");
        element.href = buttonHref;
    }

    element.classList.add(buttonClassName)
    element.id = buttonElementId;
    element.textContent = buttonText;

    baseElement.appendChild(element);
    return element;
}

function addEntryToList(baseElement, textContent, textHref = "", textColor = "", subTextContent = "", subTextColor = ""){
    if (!baseElement){return;}
    const li = document.createElement("li");
    const a = document.createElement("a");

    a.textContent = textContent
    a.style.color = textColor;
    if (textHref){
        a.href = textHref
    }

    if (subTextContent){
        const subText = document.createElement("span");
        subText.classList.add(pageCraftsCardStyleQuantity);

        subText.textContent = subTextContent;
        subText.style.color = subTextColor;
        a.appendChild(subText);
    }

    li.appendChild(a);
    baseElement.appendChild(li);
    return { li, a };
}

// - GRIDS
function appendKeyValueGrid(baseElement, kvArray){
    let keys = Object.keys(kvArray)
    let values = Object.values(kvArray)

    if (keys.length > 0){
        const cardSubtitleKeyValueContainer = document.createElement("div");
        cardSubtitleKeyValueContainer.classList.add(elementClassCardKeyValueContainer);

        let index = keys.length
        while (index >= 0){
            let cardKey = document.createElement("div");
            cardKey.classList.add(elementClassCardKey);
            cardKey.textContent = keys[index];

            let cardValue = document.createElement("div");
            cardValue.classList.add(elementClassCardValue);
            cardValue.textContent = values[index];

            cardSubtitleKeyValueContainer.appendChild(cardKey);
            cardSubtitleKeyValueContainer.appendChild(cardValue);

            index--;
        }
    }

    baseElement.appendChild(cardSubtitleKeyValueContainer);
}

function createGrid(id = "grid", baseElement, elementClass = elementClassGrid){
    const gridBase = document.createElement("div");
    gridBase.classList.add(elementClass);
    gridBase.id = id;

    baseElement.appendChild(gridBase);

    return gridBase;
}

// - PRESET GRID BASE
function addGridBase(baseElement, elementClass = elementClassGrid, elementId = "mainGrid"){
    mainGrid = createGrid(elementId, baseElement, elementClass);

    //Arrange Base Grid
    mainGrid.style.gridTemplateAreas = `
    ". Toolbar Toolbar Toolbar ."
    "Selected CraftingTime CraftingTime CraftingTime Tracked"
    "Selected Skills Tools Materials Tracked"
    `;
    mainGrid.style.gridTemplateColumns = "1fr 1fr 1fr 1fr 1fr";
    mainGrid.style.gridTemplateRows = "auto auto auto";
    mainGrid.style.gridAutoRows = "auto";
    mainGrid.style.alignItems = "start";
    mainGrid.style.overflowY = "auto";

    return mainGrid;
}

function addCraftingTimeRowSpacer(baseElement, gridAreaName) {
    const spacer = document.createElement("div");
    spacer.style.gridArea = gridAreaName;
    spacer.style.visibility = "hidden";
    spacer.style.pointerEvents = "none";
    baseElement.appendChild(spacer);
}


// - CARD BASES / CREATORS
function addCardSelected(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleSelected);
    let elementClass = "", elementId = "", title = "";

    // Keep selected card bounded while allowing list interactions to scroll.
    cardBase.style.overflowY = "auto";
    cardBase.style.zIndex = "4";

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsSelectedTitle)
    const selectedList = appendList(cardBase, elementClass = elementClassCardList, elementId = pageCraftsSelectedListId)
    selectedList.style.maxHeight = "calc(75vh - 3.2rem)";
    selectedList.style.overflowY = "auto";
}

function addCardToolbar(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleToolbar);
    cardBase.style.overflowY = "";
    cardBase.style.display = "flex";
    cardBase.style.alignItems = "center";
    cardBase.style.width = "fit-content";
    cardBase.style.maxWidth = "max-content";
    cardBase.style.justifySelf = "center";
    cardBase.style.margin = "0 auto";
    cardBase.style.gap = "0.5rem";
    cardBase.style.padding = "10px 14px";
    cardBase.style.boxShadow = "0 10px 28px rgba(0, 0, 0, 0.25)";
    let elementClass = "", elementId = "", elementText = "", elementHref;

    appendButton(cardBase, elementClass = elementClassButton, elementId = "testButton", elementText = "Clear")
    appendButton(cardBase, elementClass = elementClassButton, elementId = "test2Button", elementText = "Push")
    appendButton(cardBase, elementClass = elementClassButton, elementId = "toolbarSave", elementText = "Save")
    appendButton(cardBase, elementClass = elementClassButton, elementId = "test4Button", elementText = "Load")
    appendDropdown(cardBase, elementId = "testDropdown")
    const settingsButton = appendButton(cardBase, elementClass = elementClassButton, elementId = toolbarButtonSettingsId, elementText = "⚙")
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.setAttribute("aria-controls", toolbarSettingsMenuId);
    settingsButton.setAttribute("aria-label", "Borrow settings");
    settingsButton.title = "Borrow settings";
    settingsButton.style.marginLeft = "auto";

    const settingsMenu = document.createElement("div");
    settingsMenu.id = toolbarSettingsMenuId;
    settingsMenu.classList.add("craft-settings-menu");
    settingsMenu.hidden = true;

    const toggleSection = document.createElement("section");
    toggleSection.classList.add("settings-section");

    const toggleSectionTitle = document.createElement("h2");
    toggleSectionTitle.classList.add("settings-title");
    toggleSectionTitle.textContent = "Toggles";

    const toggleSectionHint = document.createElement("p");
    toggleSectionHint.classList.add("settings-hint");
    toggleSectionHint.textContent = "Configure recursive auto-add and whether completed recursive entries stay visible in Selected and Materials.";

    const toggleSectionActions = document.createElement("div");
    toggleSectionActions.classList.add("settings-actions");
    appendButton(toggleSectionActions, elementClassButton, toolbarButtonRecursiveId, "Recursive: OFF");
    appendButton(toggleSectionActions, elementClassButton, toolbarButtonHideCompletedRecursiveId, "Hide Done Recursives: OFF");

    toggleSection.appendChild(toggleSectionTitle);
    toggleSection.appendChild(toggleSectionHint);
    toggleSection.appendChild(toggleSectionActions);

    const borrowSection = document.createElement("section");
    borrowSection.classList.add("settings-section");

    const settingsHeader = document.createElement("div");
    settingsHeader.classList.add("settings-header");

    const settingsTitle = document.createElement("h2");
    settingsTitle.classList.add("settings-title");
    settingsTitle.textContent = "Borrowing";

    settingsHeader.prepend(settingsTitle);

    const settingsHint = document.createElement("p");
    settingsHint.classList.add("settings-hint");
    settingsHint.textContent = "Determines what inventories to pull from when checking material progress.";

    const settingsList = document.createElement("div");
    settingsList.id = toolbarSettingsListId;
    settingsList.classList.add("settings-list");

    borrowSection.appendChild(settingsHeader);
    borrowSection.appendChild(settingsHint);
    borrowSection.appendChild(settingsList);

    settingsMenu.appendChild(toggleSection);
    settingsMenu.appendChild(borrowSection);
    cardBase.appendChild(settingsMenu);

    cardBase.style.alignContent = "center";
    cardBase.style.justifyContent = "center";
    cardBase.style.position = "relative";
    return cardBase;
}

function addCardCraftingTime(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleCraftingTime);
    cardBase.style.overflowY = "";
    cardBase.style.display = "flex";
    cardBase.style.alignItems = "center";
    cardBase.style.justifyContent = "center";
    cardBase.style.flexWrap = "wrap";
    cardBase.style.columnGap = "16px";
    cardBase.style.rowGap = "4px";
    cardBase.style.padding = "8px 12px";
    let elementClass = "", elementId = "", title = "", isSubtitle = true;

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsCraftingTimeTitle)
    appendTitle(cardBase, elementClass = elementClassCardSubtitle, elementId = pageCraftsCraftingTimeSubtitleId, title = "Total: x minute(s)", isSubtitle = true)
    appendTitle(cardBase, elementClass = elementClassCardSubtitle, elementId = pageCraftsCraftingTimeRemainingSubtitleId, title = "Remaining: x minute(s)", isSubtitle = true)

    const heading = cardBase.querySelector(`.${elementClassCardTitle}`);
    if (heading) {
        heading.style.margin = "0";
        heading.style.fontSize = "1.05rem";
        heading.style.lineHeight = "1.1";
    }

    const subtitles = cardBase.querySelectorAll(`.${elementClassCardSubtitle}`);
    for (const subtitle of subtitles) {
        subtitle.style.margin = "0";
        subtitle.style.fontSize = "0.98rem";
    }
}

function addCardTools(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleTools);
    let elementClass = "", elementId = "", title = "";

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsToolsTitle)
    appendText(cardBase, elementClass = elementClassCardSubtitle, elementId = pageCraftsToolsSubtitleId, "You are going to need the following tools:")
    appendList(cardBase, elementClass = elementClassCardList, elementId = pageCraftsToolsListId)
}

function addCardSkills(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleSkills);
    let elementClass = "", elementId = "", title = "";

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsSkillsTitle)
    appendText(cardBase, elementClass = elementClassCardSubtitle, elementId = pageCraftsSkillsSubtitleId, "You are going to need the following skills")
    appendList(cardBase, elementClass = elementClassCardList, elementId = pageCraftsSkillsListId)
}

function addCardMaterials(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleMaterials);
    cardBase.style.maxHeight = "75vh";
    let elementClass = "", elementId = "", title = "";

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsMaterialsTitle)
    appendText(cardBase, elementClass = elementClassCardSubtitle, elementId = "", "")
    appendList(cardBase, elementClass = elementClassCardList, elementId = pageCraftsMaterialsListId)
}

function addCardTracked(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleTracked);
    let elementClass = "", elementId = "", title = "";

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsTrackedTitle)
    appendDropdown(cardBase, elementId =  pageCraftsTrackedDropdownId)
    appendList(appendList(cardBase, elementClass = elementClassCardList, elementId = pageCraftsTrackedListId))

    return cardBase;
}

function updateItemCard(baseElement, item, recipeId = item.reqRecipeId){
    //Variable Declarations
    let cardElementId = item.itemId || "";
    let recipe = gAllRecipes.find(r => r.recipeId === recipeId);
    let cardBase = document.getElementById(cardElementId) || createCard(baseElement, elementClassCard, undefined, cardElementId);
    cardBase.style.maxHeight = "50vh";
    let isSubtitle = "", elementClass = "", elementId = "", title = "", numRecipes = item.recipeIds.length, buttonText = "";

    if (!item.itemId){
        if (!document.getElementById(`${item.itemId}${itemCardTitleIdSuffix}`)){
            appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = `${item.itemId}${itemCardTitleIdSuffix}`, title = "Default Card")
            appendTitle(cardBase, elementClass = elementClassCardSubtitle, elementId = `${item.itemId}${itemCardSubtitleIdSuffix}`, title = "Default text.", isSubtitle = true)
        } else {
            document.getElementById(`${item.itemId}${itemCardTitleIdSuffix}`).textContent = "Error"
            document.getElementById(`${item.itemId}${itemCardSubtitleIdSuffix}`).textContent = "Item ID is missing"
        }
        return;
    }

    const itemMarkKey = getSelectedItemMarkKey(item);
    if (itemMarkKey) {
        const existingPinButton = document.getElementById(`${item.itemId}_pinToggle`);
        if (existingPinButton) existingPinButton.remove();
    }

    // Title with Recipe Navigation
    if (numRecipes > 1) {
        if (!document.getElementById(`${item.itemId}${itemCardNavContainerIdSuffix}`)){
            const navContainer = document.createElement("div");
            navContainer.style.display = "flex";
            navContainer.style.justifyContent = "space-between";
            navContainer.style.width = "100%";
            navContainer.id = `${item.itemId}${itemCardNavContainerIdSuffix}`;

            appendButton(navContainer, elementClass = elementClassButton, elementId = `${item.itemId}${itemCardButtonPrevRecipeIdSuffix}`, buttonText = "<")
            appendTitle(navContainer, elementClass = elementClassCardTitle, elementId = `${item.itemId}${itemCardTitleIdSuffix}`, title = item.textContent)
            appendButton(navContainer, elementClass = elementClassButton, elementId = `${item.itemId}${itemCardButtonNextRecipeIdSuffix}`, buttonText = ">")

            cardBase.appendChild(navContainer);
        }

        document.getElementById(`${item.itemId}${itemCardTitleIdSuffix}`).textContent = `${item.textContent} (${item.recipeIds.indexOf(recipeId) + 1}/${numRecipes})`

        if (itemMarkKey && !document.getElementById(`${item.itemId}_pinToggle`)) {
            cardBase.style.position = "relative";
            const pinButton = createPinToggleButton(item, itemMarkKey, { cardButton: true });
            pinButton.id = `${item.itemId}_pinToggle`;
            cardBase.appendChild(pinButton);
        }

        // Remove existing event listeners by replacing the buttons with clones
        const prevBtnId = `${item.itemId}${itemCardButtonPrevRecipeIdSuffix}`;
        const nextBtnId = `${item.itemId}${itemCardButtonNextRecipeIdSuffix}`;

        const prevBtnOld = document.getElementById(prevBtnId);
        const nextBtnOld = document.getElementById(nextBtnId);

        if (prevBtnOld) {
            const newPrevBtn = prevBtnOld.cloneNode(true);
            prevBtnOld.parentNode.replaceChild(newPrevBtn, prevBtnOld);
            // Remove all event listeners by replacing, then add the new one
            newPrevBtn.addEventListener("click", function handler() {
                let currentRecipeIndex = item.recipeIds.indexOf(recipeId);
                let prevRecipeIndex = (currentRecipeIndex - 1 + numRecipes) % numRecipes;
                let prevRecipeId = item.recipeIds[prevRecipeIndex];

                for (const selectedItem of gSelectedItems){
                    if (selectedItem.itemId === item.itemId){
                        selectedItem.reqRecipeId = prevRecipeId;
                    }
                }

                if (itemMarkKey && gTrackedItems[itemMarkKey]) {
                    gTrackedItems[itemMarkKey].reqRecipeId = prevRecipeId;
                    saveMarks(gTrackedItems);
                }
                
                updateView();
            });
        }

        if (nextBtnOld) {
            const newNextBtn = nextBtnOld.cloneNode(true);
            nextBtnOld.parentNode.replaceChild(newNextBtn, nextBtnOld);
            // Remove all event listeners by replacing, then add the new one
            newNextBtn.addEventListener("click", function handler() {
                let currentRecipeIndex = item.recipeIds.indexOf(recipeId);
                let nextRecipeIndex = (currentRecipeIndex + 1) % numRecipes;
                let nextRecipeId = item.recipeIds[nextRecipeIndex];

                for (const selectedItem of gSelectedItems){
                    if (selectedItem.itemId === item.itemId){
                        selectedItem.reqRecipeId = nextRecipeId;
                    }
                }

                if (itemMarkKey && gTrackedItems[itemMarkKey]) {
                    gTrackedItems[itemMarkKey].reqRecipeId = nextRecipeId;
                    saveMarks(gTrackedItems);
                }

                updateView();
            });
        }
    } else {
        if (!document.getElementById(`${item.itemId}${itemCardTitleIdSuffix}`)){
            appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = `${item.itemId}${itemCardTitleIdSuffix}`, title = item.textContent)
        }

        if (itemMarkKey && !document.getElementById(`${item.itemId}_pinToggle`)) {
            cardBase.style.position = "relative";
            const pinButton = createPinToggleButton(item, itemMarkKey, { cardButton: true });
            pinButton.id = `${item.itemId}_pinToggle`;
            cardBase.appendChild(pinButton);
        }
    }

    //Crafting Time
    let craftingTime = recipe[itemPropertyCraftingTime] || 0;
    if (!document.getElementById(`${item.itemId}${itemCardCraftingTimeSubtitleIdSuffix}`)){
        appendText(cardBase, elementClass = elementClassCardSubtitle, elementId = `${item.itemId}${itemCardCraftingTimeSubtitleIdSuffix}`, title = `Crafting Time ${craftingTime}`, isSubtitle = true)
    }
    document.getElementById(`${item.itemId}${itemCardCraftingTimeSubtitleIdSuffix}`).textContent = `Crafting Time: ${craftingTime}m`

    // Skills
    if (!document.getElementById(`${item.itemId}${itemCardSkillsSubtitleIdSuffix}`)){
        appendText(cardBase, elementClass = elementClassCardSubtitle, elementId = `${item.itemId}${itemCardSkillsSubtitleIdSuffix}`, title = `Skills`, isSubtitle = true)
    }
    let skillsList = document.getElementById(`${item.itemId}${itemCardSkillsListIdSuffix}`) || appendList(cardBase, elementClass = elementClassCardList, elementId = `${item.itemId}${itemCardSkillsListIdSuffix}`);
    skillsList.innerHTML = "";
    for (const skill of recipe[itemPropertySkills]){
        let skillName = skill[itemPropertySkillsName];
        let skillLevel = skill[itemPropertySkillsLevel];
        let textContent = `${skillName} ${skillLevel}`;
        addEntryToList(skillsList, textContent);
    }

    // Tools
    if (!document.getElementById(`${item.itemId}${itemCardToolsSubtitleIdSuffix}`)){
        appendText(cardBase, elementClass = elementClassCardSubtitle, elementId = `${item.itemId}${itemCardToolsSubtitleIdSuffix}`, title = `Tools`, isSubtitle = true)
    }    
    let toolsList = document.getElementById(`${item.itemId}${itemCardToolsListIdSuffix}`) || appendList(cardBase, elementClass = elementClassCardList, elementId = `${item.itemId}${itemCardToolsListIdSuffix}`);
    toolsList.innerHTML = "";
    for (const tool of recipe[itemPropertyTools]){
        let toolName = tool;
        addEntryToList(toolsList, toolName);
    }

    //Mats
    if (!document.getElementById(`${item.itemId}${itemCardMaterialsSubtitleIdSuffix}`)){
        appendText(cardBase, elementClass = elementClassCardSubtitle, elementId = `${item.itemId}${itemCardMaterialsSubtitleIdSuffix}`, title = `Materials`, isSubtitle = true)
    }
    let materialsList = document.getElementById(`${item.itemId}${itemCardMaterialsListIdSuffix}`) || appendList(cardBase, elementClass = elementClassCardList, elementId = `${item.itemId}${itemCardMaterialsListIdSuffix}`);
    materialsList.innerHTML = "";
    for (const material of recipe[itemPropertyMaterials]){
        let materialName = material[itemPropertyMaterialsName];
        let qty = material[itemPropertyMaterialsQuantity];
        let textContent = `${materialName}`;
        let subtextContent = `x ${qty}`;
        let textHref = buildRecipeDetailHrefForItem(material[itemPropertyMaterialsItemId]);
        addEntryToList(materialsList, textContent, textHref, "", subtextContent, pageCraftsCardStyleQuantity);
    }
}

// - LOGIC FUNCTIONS
function getSelectedItems(){
    //Variable declarations
    let output = [];

    for (const key in gTrackedItems){
        let item = gTrackedItems[key];
        let isSelected = item[markerPropertySelected];

        const previouslySelectedItem = gSelectedItems.find(i => i.itemId === item.itemId);
        const itemRecipeIds = Array.isArray(item.recipeIds) ? item.recipeIds : [];

        if (previouslySelectedItem?.reqRecipeId) {
            item.reqRecipeId = previouslySelectedItem.reqRecipeId;
        } else if (item.reqRecipeId && itemRecipeIds.includes(item.reqRecipeId)) {
            item.reqRecipeId = item.reqRecipeId;
        } else {
            item.reqRecipeId = itemRecipeIds.length > 0 ? itemRecipeIds[0] : undefined;
        }

        // Prioritize the persisted mark quantity so recursive recomputes are reflected immediately.
        item.qty = normalizeSelectedQuantity(item.qty ?? previouslySelectedItem?.qty ?? 1);

        if (isSelected){
            output.push({
                ...item,
                __markKey: key,
            });
        }
    }

    return output;

}

function getGreatestSkillLevels(selectedItems = getSelectedItems()){
    let output = {};
    let skillName = "", skillLevel = 0, isMandatory = true;

    for (const item of selectedItems){
        for (const recipeId of item.recipeIds){
            const recipe = gAllRecipes.find(r => r.recipeId === recipeId);

            isMandatory = true
            if (item.recipeIds.length > 1){
                isMandatory = false;
                if (item.reqRecipeId !== recipeId){
                    continue;
                }
            }

            if (recipe){
                for (const skill of recipe[itemPropertySkills]){
                    skillName = skill[itemPropertySkillsName];
                    skillLevel = skill[itemPropertySkillsLevel];
                    
                    // Skip if skill level is 0 (only happens for XP, not a real requirement)
                    if (skillLevel <= 0) {continue;}
                    
                    output[skillName] = output[skillName] || {level: skillLevel, mandatory: isMandatory, recipeId: recipeId};

                    if (skillLevel > output[skillName].level){
                        output[skillName].level = skillLevel;
                        output[skillName].recipeId = recipeId;

                        if (output[skillName].mandatory === false){
                            output[skillName].mandatory = isMandatory;
                        }
                    }
                }
            }
        }
    }
    return output;
}

function populateDropdownWithList(data, elementId = "category", numPresetOptions = 1) {
    const dropdown = document.getElementById(elementId);
    const dropdownOriginalValue = dropdown.value;

    dropdown.length = numPresetOptions;
    for (const entry of data) {
        const option = document.createElement("option");
        option.value = entry;
        option.textContent = entry;
        dropdown.appendChild(option);
    }

    if (dropdownOriginalValue) {
        dropdown.value = dropdownOriginalValue;
    }
}

function getAllUniquePropertyValues(data, listProperty = "categories"){
    const result = new Map();

    for (const entry of Object.values(data)){
        if (!entry[listProperty]) continue;

        const property = entry[listProperty].toLowerCase();
        if (!result.has(property)) {
            result.set(property, entry[listProperty]);
        }
    }
    return [...result.values()];
}

function getToolsNeeded(selectedItems = getSelectedItems()){
    let output = {};
    let toolName = "", isMandatory = true;

    for (const item of selectedItems){
        for (const recipeId of item.recipeIds){
            const recipe = gAllRecipes.find(r => r.recipeId === recipeId);

            isMandatory = true
            if (item.recipeIds.length > 1){
                isMandatory = false;
                if (item.reqRecipeId !== recipeId){
                    continue;
                }
            }

            if (recipe){
                for (const tool of recipe[itemPropertyTools]){
                    toolName = tool;

                    output[toolName] = output[toolName] || {mandatory: isMandatory, recipeId: recipeId};
                    output[toolName].recipeId = recipeId;

                    if (output[toolName].mandatory === false){
                        output[toolName].mandatory = isMandatory;
                    }
                }
            }
        }
    }
    return output;
}

function getFunFactFromCraftingTime(){
    let totalTime = getCraftingTime();
    let potatoesPeeled = totalTime*2; // 2 potatoes peeled per minute
    return `In that time, you could peel ~${potatoesPeeled} potatoes!`;
}

function getCraftingTime(selectedItems = getSelectedItems()){
    let totalTime = 0;
    
    for (const item of selectedItems){
        const itemQuantity = getSelectedItemQuantity(item);

        for (const recipeId of item.recipeIds){
            const recipe = gAllRecipes.find(r => r.recipeId === recipeId);

            if (item.recipeIds.length > 1){
                if (item.reqRecipeId !== recipeId){
                    continue;
                }
            }

            if (recipe){
                totalTime += (recipe[itemPropertyCraftingTime] || 0) * getCraftRunsForQuantity(recipe, itemQuantity, item.itemId);
            }
        }
    }

    return totalTime;
}

function getCraftingTimeBreakdown(selectedItems = getSelectedItems(), mode = "total") {
    const entries = [];
    let totalMinutes = 0;

    for (const item of selectedItems) {
        const itemName = item[markerTextContentProperty] || "Unknown Item";
        const itemQuantity = getSelectedItemQuantity(item);
        const itemIsChecked = isMaterialChecked(itemName, itemQuantity);

        if (mode === "remaining" && itemIsChecked) {
            continue;
        }

        for (const recipeId of item.recipeIds) {
            const recipe = gAllRecipes.find(r => r.recipeId === recipeId);
            if (!recipe) continue;

            if (item.recipeIds.length > 1 && item.reqRecipeId !== recipeId) {
                continue;
            }

            const runs = getCraftRunsForQuantity(recipe, itemQuantity, item.itemId);
            const minutesPerRun = Number(recipe[itemPropertyCraftingTime]) || 0;
            const minutes = minutesPerRun * runs;

            if (runs <= 0 || minutes <= 0) {
                continue;
            }

            entries.push({
                itemName,
                itemQuantity,
                recipeName: getRecipeDisplayName(recipeId),
                minutesPerRun,
                runs,
                minutes,
            });

            totalMinutes += minutes;
        }
    }

    return { entries, totalMinutes };
}

function formatCraftingTimeBreakdownTooltip(selectedItems = getSelectedItems(), mode = "total") {
    const breakdown = getCraftingTimeBreakdown(selectedItems, mode);
    const title = mode === "remaining" ? "Remaining crafting time" : "Total crafting time";
    const lines = [`${title}: ${breakdown.totalMinutes} minute${breakdown.totalMinutes === 1 ? "" : "s"}`];

    if (breakdown.entries.length === 0) {
        lines.push("No contributing items.");
        return lines.join("\n");
    }

    lines.push("Breakdown:");
    for (const entry of breakdown.entries) {
        lines.push(
            `- ${entry.itemName} x ${entry.itemQuantity} (${entry.recipeName}): ${entry.minutesPerRun}m x ${entry.runs} run${entry.runs === 1 ? "" : "s"} = ${entry.minutes}m`,
        );
    }

    return lines.join("\n");
}

function getCheckedMaterialsCraftingTime(selectedItems = getSelectedItems()) {
    let checkedTime = 0;

    for (const item of selectedItems) {
        const itemName = item[markerTextContentProperty] || "";
        const requiredQty = getSelectedItemQuantity(item);
        if (!isMaterialChecked(itemName, requiredQty)) {
            continue;
        }

        const itemQuantity = getSelectedItemQuantity(item);

        for (const recipeId of item.recipeIds) {
            const recipe = gAllRecipes.find(r => r.recipeId === recipeId);

            if (item.recipeIds.length > 1 && item.reqRecipeId !== recipeId) {
                continue;
            }

            if (recipe) {
                checkedTime += (recipe[itemPropertyCraftingTime] || 0) * getCraftRunsForQuantity(recipe, itemQuantity, item.itemId);
            }
        }
    }

    return checkedTime;
}

function getMaterialListFromSelectedItems(selectedItems = getSelectedItems()){
    let output = {};
    //only uses the first recipe in recipeIds for now for each item

    for (const item of selectedItems){
        const itemQuantity = getSelectedItemQuantity(item);
        let recipeId = item.reqRecipeId;
        const recipe = gAllRecipes.find(r => r.recipeId === recipeId);
        if (recipe){
            const craftRuns = getCraftRunsForQuantity(recipe, itemQuantity, item.itemId);
            for (const material of recipe[itemPropertyMaterials]){
                let materialName = material[itemPropertyMaterialsName];
                let materialQuantity = material[itemPropertyMaterialsQuantity];
                const materialContribution = materialQuantity * craftRuns;
                const consumerName = item[markerTextContentProperty] || "Unknown Item";

                output[materialName] = output[materialName] || {qty: 0, breakdown: []};
                output[materialName].qty += materialContribution;
                output[materialName].recipeId = recipeId;

                const existingBreakdown = output[materialName].breakdown.find(entry => {
                    return entry.itemId === item.itemId && entry.recipeId === recipeId;
                });

                if (existingBreakdown) {
                    existingBreakdown.qty += materialContribution;
                } else {
                    output[materialName].breakdown.push({
                        itemId: item.itemId || "",
                        recipeId,
                        itemName: consumerName,
                        qty: materialContribution,
                    });
                }
            }
        }
    }

    return output;
}

function getRecipeDisplayName(recipeId = "") {
    if (!recipeId) return "Unknown Recipe";

    const recipe = gAllRecipes.find(r => r.recipeId === recipeId);
    return recipe?.name || recipeId;
}

function getToolListFromSelectedItems(selectedItems = getSelectedItems()) {
    const output = {};

    for (const item of selectedItems) {
        const recipeId = item.reqRecipeId;
        const recipe = gAllRecipes.find(r => r.recipeId === recipeId);
        if (!recipe) continue;

        const consumerName = item[markerTextContentProperty] || "Unknown Item";

        for (const tool of recipe[itemPropertyTools]) {
            const toolName = tool;

            output[toolName] = output[toolName] || { recipeId, breakdown: [] };

            const existingBreakdown = output[toolName].breakdown.find(entry => {
                return entry.itemId === item.itemId && entry.recipeId === recipeId;
            });

            if (!existingBreakdown) {
                output[toolName].breakdown.push({
                    itemId: item.itemId || "",
                    recipeId,
                    itemName: consumerName,
                });
            }
        }
    }

    return output;
}

function getSkillListFromSelectedItems(selectedItems = getSelectedItems()) {
    const output = {};

    for (const item of selectedItems) {
        const recipeId = item.reqRecipeId;
        const recipe = gAllRecipes.find(r => r.recipeId === recipeId);
        if (!recipe) continue;

        const consumerName = item[markerTextContentProperty] || "Unknown Item";

        for (const skill of recipe[itemPropertySkills]) {
            const skillName = skill[itemPropertySkillsName];
            const skillLevel = Number(skill[itemPropertySkillsLevel]) || 0;

            // Skip if skill level is 0 (only happens for XP, not a real requirement)
            if (skillLevel <= 0) {
                continue;
            }

            output[skillName] = output[skillName] || { level: skillLevel, recipeId, breakdown: [] };

            if (skillLevel > output[skillName].level) {
                output[skillName].level = skillLevel;
                output[skillName].recipeId = recipeId;
            }

            const existingBreakdown = output[skillName].breakdown.find(entry => {
                return entry.itemId === item.itemId && entry.recipeId === recipeId;
            });

            if (!existingBreakdown) {
                output[skillName].breakdown.push({
                    itemId: item.itemId || "",
                    recipeId,
                    itemName: consumerName,
                    level: skillLevel,
                });
            }
        }
    }

    return output;
}

function formatMaterialBreakdownTooltip(materialName, materialInfo = {}) {
    const breakdown = Array.isArray(materialInfo.breakdown) ? materialInfo.breakdown : [];
    const totalQty = Math.max(0, Math.floor(Number(materialInfo.qty) || 0));

    function formatQty(value) {
        return Math.max(0, Math.floor(Number(value) || 0));
    }

    const lines = [
        `${materialName} x ${totalQty}`,
        "Used by:",
    ];

    for (const entry of breakdown) {
        lines.push(`- ${entry.itemName} x ${formatQty(entry.qty)}`);
    }

    return lines.join("\n");
}

function formatToolBreakdownTooltip(toolName, toolInfo = {}) {
    const breakdown = Array.isArray(toolInfo.breakdown) ? toolInfo.breakdown : [];

    const lines = [
        `${toolName}`,
    ];

    if (breakdown.length > 0) {
        lines.push("Used by:");
        for (const entry of breakdown) {
            lines.push(`- ${entry.itemName} (${getRecipeDisplayName(entry.recipeId)})`);
        }
    }

    return lines.join("\n");
}

function formatSkillBreakdownTooltip(skillName, skillInfo = {}) {
    const breakdown = Array.isArray(skillInfo.breakdown) ? skillInfo.breakdown : [];

    const lines = [
        `${skillName}`,
        `Highest level needed: ${Number(skillInfo.level) || 0}`,
    ];

    if (breakdown.length > 0) {
        lines.push("Used by:");
        for (const entry of breakdown) {
            lines.push(`- ${entry.itemName} (${getRecipeDisplayName(entry.recipeId)}) lvl ${entry.level}`);
        }
    }

    return lines.join("\n");
}

function getTrackedEntryByItemId(itemId) {
    if (!itemId) return { key: "", entry: null };

    if (gTrackedItems[itemId]?.itemId === itemId) {
        return { key: itemId, entry: gTrackedItems[itemId] };
    }

    for (const key in gTrackedItems) {
        const entry = gTrackedItems[key];
        if (entry?.itemId === itemId) {
            return { key, entry };
        }
    }

    return { key: "", entry: null };
}

function getDisplayNameForItem(itemId, fallback = "Unknown Item") {
    if (!itemId) return fallback;

    const tracked = getTrackedEntryByItemId(itemId).entry;
    if (tracked?.[markerTextContentProperty]) return tracked[markerTextContentProperty];

    const itemData = gAllItems.find(i => i.itemId === itemId);
    return itemData?.name || fallback;
}

function getRecipeForTreeNode(itemId, preferredRecipeId = "") {
    const tracked = getTrackedEntryByItemId(itemId).entry;
    const recipeIds = Array.isArray(tracked?.recipeIds)
        ? tracked.recipeIds
        : (gAllItems.find(i => i.itemId === itemId)?.recipeIds || []);

    const chosenRecipeId = (preferredRecipeId && recipeIds.includes(preferredRecipeId))
        ? preferredRecipeId
        : (tracked?.reqRecipeId && recipeIds.includes(tracked.reqRecipeId))
            ? tracked.reqRecipeId
            : (recipeIds[0] || "");

    if (!chosenRecipeId) return null;
    return gAllRecipes.find(r => r.recipeId === chosenRecipeId) || null;
}

function buildRecipeDetailHrefForItem(itemId = "", markKey = "") {
    const normalizedItemId = String(itemId || "").trim();
    const trackedEntry = markKey ? gTrackedItems[markKey] : null;

    if (normalizedItemId) {
        const hasItemRecord = gAllItems.some(item => item?.itemId === normalizedItemId);
        if (hasItemRecord) {
            return `${itemPageBaseHref}${encodeURIComponent(normalizedItemId)}`;
        }

        const recipeByOutput = gAllRecipes.find(recipe => recipe?.itemId === normalizedItemId);
        if (recipeByOutput?.recipeId) {
            return `${recipePageBaseHref}${encodeURIComponent(recipeByOutput.recipeId)}`;
        }
    }

    const preferredRecipeId = trackedEntry?.reqRecipeId
        || (Array.isArray(trackedEntry?.recipeIds) ? trackedEntry.recipeIds.find(Boolean) : "")
        || "";

    if (preferredRecipeId) {
        return `${recipePageBaseHref}${encodeURIComponent(preferredRecipeId)}`;
    }

    return normalizedItemId
        ? `${itemPageBaseHref}${encodeURIComponent(normalizedItemId)}`
        : "";
}

function buildRecursiveTreeNode(itemId, qty, depth = 0, path = new Set(), parentNodeId = "", nodeIdFactory = null, pathKey = "") {
    const nodeId = nodeIdFactory ? nodeIdFactory(itemId, depth) : `${itemId || "node"}_${depth}`;
    const effectivePathKey = pathKey || `${itemId || "node"}:root`;
    const normalizedQty = normalizeSelectedQuantity(qty);
    const { key: markKey, entry } = getTrackedEntryByItemId(itemId);
    const isAutoAdded = entry?.recursiveSource === RECURSIVE_SOURCE_AUTO;

    const node = {
        nodeId,
        parentNodeId,
        pathKey: effectivePathKey,
        itemId,
        textContent: getDisplayNameForItem(itemId),
        qty: normalizedQty,
        depth,
        markKey,
        isAutoAdded,
        children: [],
    };

    if (itemId && path.has(itemId)) {
        return node;
    }

    const nextPath = new Set(path);
    if (itemId) nextPath.add(itemId);

    const recipe = getRecipeForTreeNode(itemId, entry?.reqRecipeId);
    if (!recipe || !Array.isArray(recipe[itemPropertyMaterials])) {
        return node;
    }

    for (let materialIndex = 0; materialIndex < recipe[itemPropertyMaterials].length; materialIndex++) {
        const material = recipe[itemPropertyMaterials][materialIndex];
        const childItemId = material[itemPropertyMaterialsItemId];
        const materialQty = Number(material[itemPropertyMaterialsQuantity]);
        if (!childItemId || !Number.isFinite(materialQty) || materialQty <= 0) continue;

        const childTrackedEntry = getTrackedEntryByItemId(childItemId).entry;
        if (!childTrackedEntry?.[markerPropertySelected]) {
            continue;
        }

        const childRequiredQty = Math.ceil(materialQty * normalizedQty);
        const childNode = buildRecursiveTreeNode(
            childItemId,
            childRequiredQty,
            depth + 1,
            nextPath,
            nodeId,
            nodeIdFactory,
            `${effectivePathKey}>${childItemId}:${materialIndex}`,
        );

        node.children.push(childNode);
    }

    return node;
}

function buildRecursiveSelectedTrees() {
    let treeNodeCounter = 0;
    const nodeIdFactory = (itemId, depth) => {
        treeNodeCounter += 1;
        return `${itemId || "node"}_${depth}_${treeNodeCounter}`;
    };

    const manualRoots = gSelectedItems.filter(item => {
        const markKey = item?.__markKey || getSelectedItemMarkKey(item);
        return gTrackedItems[markKey]?.recursiveSource !== RECURSIVE_SOURCE_AUTO;
    });

    return manualRoots.map(item => {
        const rootQty = getSelectedItemQuantity(item);
        const rootPathKey = `${item.itemId || "root"}:root`;
        return buildRecursiveTreeNode(item.itemId, rootQty, 0, new Set(), "", nodeIdFactory, rootPathKey);
    });
}

function renderSelectedListEntry(selectedListElement, node) {
    const itemMarkKey = node.markKey;
    const itemQuantity = normalizeSelectedQuantity(node.qty);
    const quantityControlIdBase = (itemMarkKey || node.itemId || node.textContent || "selected").toString().replace(/\s+/g, "_");

    const listEntry = document.createElement("li");
    listEntry.classList.add(pageCraftsSelectedListItemClass);
    listEntry.dataset.treeNodeId = node.nodeId || "";
    listEntry.dataset.treeParentNodeId = node.parentNodeId || "";
    listEntry.style.setProperty("--selected-tree-depth", String(node.depth));
    if (node.depth > 0) {
        listEntry.classList.add("selected-item-tree");
    } else {
        listEntry.classList.add("selected-item-root");
        listEntry.classList.add("selected-item-flat");
    }
    if (node.isAutoAdded) {
        listEntry.classList.add("selected-item-auto");
        listEntry.classList.add("selected-item-no-qty");
        listEntry.title = `${node.textContent || "Unknown Item"} x ${itemQuantity}`;
    }

    if (node.depth > 0) {
        listEntry.style.paddingLeft = `${0.55 + (node.depth * 0.6)}rem`;
    }

    const isPinned = !!gTrackedItems[itemMarkKey]?.[markerPropertyPinned];
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const showTreeToggle = hasChildren && node.depth > 0;
    const isCollapsed = showTreeToggle && isTreeNodeCollapsed(node.pathKey);

    let treeToggleButton = null;
    if (node.depth > 0) {
        treeToggleButton = document.createElement("button");
        treeToggleButton.classList.add(elementClassButton, "selected-tree-toggle-button");
        treeToggleButton.type = "button";

        if (showTreeToggle) {
            treeToggleButton.textContent = isCollapsed ? "▸" : "▾";
            treeToggleButton.setAttribute("aria-label", isCollapsed ? "Expand children" : "Collapse children");
            treeToggleButton.title = isCollapsed ? "Show children" : "Hide children";
            treeToggleButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                setTreeNodeCollapsed(node.pathKey, !isCollapsed);
                updateView();
            });
        } else {
            treeToggleButton.classList.add("is-empty");
            treeToggleButton.setAttribute("aria-hidden", "true");
            treeToggleButton.tabIndex = -1;
            treeToggleButton.disabled = true;
            treeToggleButton.textContent = "";
        }
    }

    const pinButton = document.createElement("button");
    pinButton.classList.add(elementClassButton, pageCraftsSelectedPinButtonClass);
    pinButton.type = "button";
    pinButton.setAttribute("aria-label", isPinned ? "Unpin item" : "Pin item");
    pinButton.title = isPinned ? "Unpin item" : "Pin item";
    pinButton.textContent = "⚲";
    pinButton.style.color = isPinned ? "var(--textYellow)" : "rgba(242,242,242,0.45)";
    pinButton.style.visibility = itemMarkKey ? "visible" : "hidden";

    pinButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!itemMarkKey) return;
        setPinnedState(itemMarkKey, !isPinned);
        updateView();
    });

    let quantityControl = null;

    const itemLink = document.createElement("a");
    itemLink.classList.add(pageCraftsSelectedLabelClass);
    itemLink.classList.add("is-selected");
    itemLink.textContent = node.textContent || "Unknown Item";
    const selectedItemHref = buildRecipeDetailHrefForItem(node.itemId, itemMarkKey);
    if (selectedItemHref) {
        itemLink.href = selectedItemHref;
    }

    if (node.isAutoAdded) {
        itemLink.title = `${node.textContent || "Unknown Item"} x ${itemQuantity}`;
    }

    if (node.isAutoAdded) {
        const qtyText = document.createElement("span");
        qtyText.classList.add(pageCraftsCardStyleQuantity);
        qtyText.textContent = `x ${itemQuantity}`;
        itemLink.appendChild(qtyText);
    }

    const showEditableQuantity = !node.isAutoAdded && !!itemMarkKey;
    const showRemoveButton = !node.isAutoAdded && !!itemMarkKey;

    let removeButton = null;
    if (showRemoveButton) {
        removeButton = document.createElement("button");
        removeButton.classList.add(elementClassButton, pageCraftsSelectedRemoveButtonClass);
        removeButton.type = "button";
        removeButton.setAttribute("aria-label", `Remove ${node.textContent || "item"} from selected list`);
        removeButton.title = "Remove from selected";
        removeButton.textContent = "✕";

        removeButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeSelectedItemByMarkKey(itemMarkKey);
        });
    }

    if (showEditableQuantity) {
        quantityControl = document.createElement("div");
        quantityControl.classList.add(pageCraftsSelectedQuantityControlClass);

        const quantityInput = document.createElement("input");
        quantityInput.classList.add(pageCraftsSelectedQuantityInputClass);
        quantityInput.id = `${quantityControlIdBase}_qty`;
        quantityInput.type = "number";
        quantityInput.min = "1";
        quantityInput.step = "1";
        quantityInput.inputMode = "numeric";
        quantityInput.value = String(itemQuantity);
        quantityInput.setAttribute("aria-label", `Quantity for ${node.textContent || "selected item"}`);

        quantityInput.addEventListener("change", () => {
            const trackedItem = gTrackedItems[itemMarkKey];
            if (!trackedItem) return;
            setSelectedItemQuantity(trackedItem, quantityInput.value);
        });

        const quantityStepper = document.createElement("div");
        quantityStepper.classList.add(pageCraftsSelectedQuantityStepperClass);

        const decrementButton = document.createElement("button");
        decrementButton.classList.add(
            elementClassButton,
            pageCraftsSelectedQuantityHoverButtonClass,
            pageCraftsSelectedQuantityHoverButtonMinusClass,
        );
        decrementButton.type = "button";
        decrementButton.setAttribute("aria-label", `Decrease quantity for ${node.textContent || "selected item"}`);
        decrementButton.textContent = "-";

        const incrementButton = document.createElement("button");
        incrementButton.classList.add(
            elementClassButton,
            pageCraftsSelectedQuantityHoverButtonClass,
            pageCraftsSelectedQuantityHoverButtonPlusClass,
        );
        incrementButton.type = "button";
        incrementButton.setAttribute("aria-label", `Increase quantity for ${node.textContent || "selected item"}`);
        incrementButton.textContent = "+";

        decrementButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const trackedItem = gTrackedItems[itemMarkKey];
            if (!trackedItem) return;
            setSelectedItemQuantity(trackedItem, normalizeSelectedQuantity(quantityInput.value) - 1);
        });

        incrementButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const trackedItem = gTrackedItems[itemMarkKey];
            if (!trackedItem) return;
            setSelectedItemQuantity(trackedItem, normalizeSelectedQuantity(quantityInput.value) + 1);
        });

        quantityStepper.appendChild(decrementButton);
        quantityStepper.appendChild(incrementButton);
        quantityControl.appendChild(quantityInput);
        quantityControl.appendChild(quantityStepper);
    }

    if (quantityControl) {
        listEntry.appendChild(quantityControl);
    }
    if (treeToggleButton) {
        listEntry.appendChild(treeToggleButton);
    }
    listEntry.appendChild(itemLink);

    const actionsContainer = document.createElement("div");
    actionsContainer.classList.add(pageCraftsSelectedActionsClass);
    actionsContainer.appendChild(pinButton);
    if (removeButton) {
        actionsContainer.appendChild(removeButton);
    }
    listEntry.appendChild(actionsContainer);
    selectedListElement.appendChild(listEntry);
}

function clearSelectedTreePathState(selectedListElement) {
    const pathNodes = selectedListElement.querySelectorAll(
        ".selected-item-tree-path, .selected-item-tree-parent, .selected-item-tree-sibling, .selected-item-tree-ancestor",
    );
    for (const pathNode of pathNodes) {
        pathNode.classList.remove(
            "selected-item-tree-path",
            "selected-item-tree-parent",
            "selected-item-tree-sibling",
            "selected-item-tree-ancestor",
        );
    }
}

function updateSelectedTreePathState(selectedListElement, hoveredTreeNode) {
    clearSelectedTreePathState(selectedListElement);

    if (!hoveredTreeNode || !hoveredTreeNode.classList.contains("selected-item-tree")) {
        return;
    }

    hoveredTreeNode.classList.add("selected-item-tree-path");

    const parentNodeId = hoveredTreeNode.dataset.treeParentNodeId || "";
    if (!parentNodeId) return;

    const siblingNodes = selectedListElement.querySelectorAll(
        `li.selected-item-tree[data-tree-parent-node-id="${parentNodeId}"]`,
    );
    for (const siblingNode of siblingNodes) {
        siblingNode.classList.add("selected-item-tree-sibling");
    }

    const parentNode = selectedListElement.querySelector(`[data-tree-node-id="${parentNodeId}"]`);
    if (parentNode) {
        parentNode.classList.add("selected-item-tree-parent");

        if (parentNode.classList.contains("selected-item-tree")) {
            parentNode.classList.add("selected-item-tree-path");
        }
    }
}

function setupSelectedTreeHoverGuides(selectedListElement) {
    if (!selectedListElement || selectedListElement.dataset.treeHoverBound === "1") {
        return;
    }

    selectedListElement.dataset.treeHoverBound = "1";

    selectedListElement.addEventListener("mousemove", (event) => {
        const hoveredTreeNode = event.target.closest("li.selected-item-tree");
        updateSelectedTreePathState(selectedListElement, hoveredTreeNode);
    });

    selectedListElement.addEventListener("mouseleave", () => {
        clearSelectedTreePathState(selectedListElement);
    });
}

function isSelectedItemCompleteByItem(item = null) {
    if (!item) return false;

    const itemName = item[markerTextContentProperty] || "";
    const requiredQty = getSelectedItemQuantity(item);
    return isMaterialChecked(itemName, requiredQty);
}

function shouldHideRecursiveSelectedTreeNode(node = {}) {
    if (!isHideCompletedRecursiveEnabled()) return false;
    if (!node?.isAutoAdded) return false;

    const hasCompletedAncestor = Boolean(node?.__hasCompletedAncestor);
    const hasSuppressedAncestor = Boolean(node?.__hasSuppressedAncestor);

    const requiredQty = normalizeSelectedQuantity(node.qty);
    if (requiredQty <= 0) return false;

    const nodeIsComplete = isMaterialChecked(node.textContent || "", requiredQty);
    return hasCompletedAncestor || hasSuppressedAncestor || nodeIsComplete;
}

function recomputeRecursiveAutoVisibilityByItemId() {
    gRecursiveAutoVisibilityByItemId = new Map();

    if (!isHideCompletedRecursiveEnabled() || !isRecursiveModeEnabled()) {
        return;
    }

    const trees = buildRecursiveSelectedTrees();

    const walkNode = (node, hasCompletedAncestor = false, hasSuppressedAncestor = false) => {
        if (!node) return;

        const requiredQty = normalizeSelectedQuantity(node.qty);
        const nodeIsComplete = requiredQty > 0 && isMaterialChecked(node.textContent || "", requiredQty);
        const nodeIsSuppressed = !!node.isAutoAdded && (hasCompletedAncestor || hasSuppressedAncestor || nodeIsComplete);

        if (node.isAutoAdded && node.itemId) {
            const itemId = String(node.itemId || "").trim();
            if (itemId) {
                const visibility = gRecursiveAutoVisibilityByItemId.get(itemId) || { total: 0, visible: 0 };
                visibility.total += 1;
                if (!nodeIsSuppressed) {
                    visibility.visible += 1;
                }
                gRecursiveAutoVisibilityByItemId.set(itemId, visibility);
            }
        }

        const nextHasCompletedAncestor = hasCompletedAncestor || nodeIsComplete;
        const nextHasSuppressedAncestor = hasSuppressedAncestor || nodeIsSuppressed;

        for (const childNode of (Array.isArray(node.children) ? node.children : [])) {
            walkNode(childNode, nextHasCompletedAncestor, nextHasSuppressedAncestor);
        }
    };

    for (const rootNode of trees) {
        walkNode(rootNode, false, false);
    }
}

function shouldHideRecursiveSelectedItemEntry(item = {}) {
    if (!isHideCompletedRecursiveEnabled()) return false;

    const itemMarkKey = getSelectedItemMarkKey(item);
    const isAutoAdded = gTrackedItems[itemMarkKey]?.recursiveSource === RECURSIVE_SOURCE_AUTO;
    if (!isAutoAdded) return false;

    const itemId = String(item?.itemId || "").trim();
    if (itemId) {
        const visibility = gRecursiveAutoVisibilityByItemId.get(itemId);
        if (visibility?.total > 0) {
            return visibility.visible <= 0;
        }
    }

    const requiredQty = getSelectedItemQuantity(item);
    if (requiredQty <= 0) return false;

    return isMaterialChecked(item[markerTextContentProperty] || "", requiredQty);
}

function getSummaryVisibleSelectedItems(selectedItems = gSelectedItems) {
    if (!isHideCompletedRecursiveEnabled()) {
        return selectedItems;
    }

    return selectedItems.filter(item => !shouldHideRecursiveSelectedItemEntry(item));
}

function isAutoSelectedBreakdownEntry(entry = {}) {
    if (!entry) return false;
    const { entry: trackedEntry } = getTrackedEntryByItemId(entry.itemId);
    return trackedEntry?.recursiveSource === RECURSIVE_SOURCE_AUTO;
}

function isBreakdownEntryParentComplete(entry = {}) {
    if (!entry) return false;

    const selectedParentItem = getSelectedItemByItemId(entry.itemId)
        || getSelectedItemByMaterialName(entry.itemName || "");

    return isSelectedItemCompleteByItem(selectedParentItem);
}

function shouldHideRecursiveMaterialRow(materialName = "", materialInfo = {}) {
    if (!isHideCompletedRecursiveEnabled()) return false;

    const totalRequiredQty = normalizeMaterialProgressQuantity(materialInfo?.qty || 0, 0);
    if (!isMaterialChecked(materialName, totalRequiredQty)) return false;

    const breakdown = Array.isArray(materialInfo?.breakdown) ? materialInfo.breakdown : [];
    if (breakdown.length === 0) return false;

    return breakdown.every(entry => {
        return isAutoSelectedBreakdownEntry(entry) && isBreakdownEntryParentComplete(entry);
    });
}

function renderTreeDepthFirst(selectedListElement, node) {
    const requiredQty = normalizeSelectedQuantity(node.qty);
    const nodeIsComplete = requiredQty > 0 && isMaterialChecked(node.textContent || "", requiredQty);
    const nodeIsSuppressed = shouldHideRecursiveSelectedTreeNode(node);

    if (!nodeIsSuppressed) {
        renderSelectedListEntry(selectedListElement, node);
    }

    const nextAncestorComplete = nodeIsComplete;
    const nextAncestorSuppressed = nodeIsSuppressed;

    if (isTreeNodeCollapsed(node.pathKey)) {
        return;
    }

    for (const child of node.children) {
        renderTreeDepthFirst(selectedListElement, {
            ...child,
            __hasCompletedAncestor: (node.__hasCompletedAncestor || false) || nextAncestorComplete,
            __hasSuppressedAncestor: (node.__hasSuppressedAncestor || false) || nextAncestorSuppressed,
        });
    }
}

// - CARD LIST POPULATION FUNCTIONS
function populateSelectedList(){
    let selectedListElement = document.getElementById(pageCraftsSelectedListId)
    selectedListElement.innerHTML = "";

    if (isRecursiveModeEnabled()) {
        setupSelectedTreeHoverGuides(selectedListElement);

        const trees = buildRecursiveSelectedTrees();
        for (const rootNode of trees) {
            renderTreeDepthFirst(selectedListElement, {
                ...rootNode,
                __hasCompletedAncestor: false,
                __hasSuppressedAncestor: false,
            });
        }

        applyMarksToAll();
        return;
    }

    for (const item of gSelectedItems){
        const itemQuantity = getSelectedItemQuantity(item);
        const itemMarkKey = getSelectedItemMarkKey(item);
        const quantityControlIdBase = (itemMarkKey || item.itemId || item[markerTextContentProperty] || "selected").toString().replace(/\s+/g, "_");

        const listEntry = document.createElement("li");
        listEntry.classList.add(pageCraftsSelectedListItemClass);
        listEntry.classList.add("selected-item-flat");

        const isAutoAdded = gTrackedItems[itemMarkKey]?.recursiveSource === RECURSIVE_SOURCE_AUTO;
        if (isAutoAdded) {
            listEntry.classList.add("selected-item-auto");
            listEntry.title = "Auto-added by recursive crafting";
        }

        const isPinned = !!gTrackedItems[itemMarkKey]?.[markerPropertyPinned];

        const pinButton = document.createElement("button");
        pinButton.classList.add(elementClassButton, pageCraftsSelectedPinButtonClass);
        pinButton.type = "button";
        pinButton.setAttribute("aria-label", isPinned ? "Unpin item" : "Pin item");
        pinButton.title = isPinned ? "Unpin item" : "Pin item";
        pinButton.textContent = "⚲";
        pinButton.style.color = isPinned ? "var(--textYellow)" : "rgba(242,242,242,0.45)";

        pinButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (!itemMarkKey) return;
            setPinnedState(itemMarkKey, !isPinned);
            updateView();
        });

        const quantityControl = document.createElement("div");
        quantityControl.classList.add(pageCraftsSelectedQuantityControlClass);

        const itemLink = document.createElement("a");
        itemLink.classList.add(pageCraftsSelectedLabelClass);
        itemLink.classList.add("is-selected");
        itemLink.textContent = item[markerTextContentProperty] || "Unknown Item";

        let removeButton = null;
        if (!isAutoAdded) {
            removeButton = document.createElement("button");
            removeButton.classList.add(elementClassButton, pageCraftsSelectedRemoveButtonClass);
            removeButton.type = "button";
            removeButton.setAttribute("aria-label", `Remove ${item[markerTextContentProperty] || "item"} from selected list`);
            removeButton.title = "Remove from selected";
            removeButton.textContent = "✕";

            removeButton.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (!itemMarkKey) return;
                removeSelectedItemByMarkKey(itemMarkKey);
            });
        }

        const quantityInput = document.createElement("input");
        quantityInput.classList.add(pageCraftsSelectedQuantityInputClass);
        quantityInput.id = `${quantityControlIdBase}_qty`;
        quantityInput.type = "number";
        quantityInput.min = "1";
        quantityInput.step = "1";
        quantityInput.inputMode = "numeric";
        quantityInput.value = String(itemQuantity);
        quantityInput.setAttribute("aria-label", `Quantity for ${item[markerTextContentProperty] || "selected item"}`);

        quantityInput.addEventListener("change", () => {
            setSelectedItemQuantity(item, quantityInput.value);
        });

        const quantityStepper = document.createElement("div");
        quantityStepper.classList.add(pageCraftsSelectedQuantityStepperClass);

        const decrementButton = document.createElement("button");
        decrementButton.classList.add(
            elementClassButton,
            pageCraftsSelectedQuantityHoverButtonClass,
            pageCraftsSelectedQuantityHoverButtonMinusClass,
        );
        decrementButton.type = "button";
        decrementButton.setAttribute("aria-label", `Decrease quantity for ${item[markerTextContentProperty] || "selected item"}`);
        decrementButton.textContent = "-";

        const incrementButton = document.createElement("button");
        incrementButton.classList.add(
            elementClassButton,
            pageCraftsSelectedQuantityHoverButtonClass,
            pageCraftsSelectedQuantityHoverButtonPlusClass,
        );
        incrementButton.type = "button";
        incrementButton.setAttribute("aria-label", `Increase quantity for ${item[markerTextContentProperty] || "selected item"}`);
        incrementButton.textContent = "+";

        decrementButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedItemQuantity(item, normalizeSelectedQuantity(quantityInput.value) - 1);
        });

        incrementButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedItemQuantity(item, normalizeSelectedQuantity(quantityInput.value) + 1);
        });

        if (isAutoAdded) {
            quantityInput.disabled = true;
            quantityInput.setAttribute("aria-label", `${item[markerTextContentProperty] || "selected item"} quantity is locked by recursive mode`);
            quantityStepper.style.display = "none";
        }

        quantityStepper.appendChild(decrementButton);
        quantityStepper.appendChild(incrementButton);
        quantityControl.appendChild(quantityInput);
        quantityControl.appendChild(quantityStepper);
        listEntry.appendChild(quantityControl);
        listEntry.appendChild(itemLink);

        const actionsContainer = document.createElement("div");
        actionsContainer.classList.add(pageCraftsSelectedActionsClass);
        actionsContainer.appendChild(pinButton);
        if (removeButton) {
            actionsContainer.appendChild(removeButton);
        }
        listEntry.appendChild(actionsContainer);
        selectedListElement.appendChild(listEntry);
    }

    applyMarksToAll();
}

function populateTrackedList(){
    let dropdownValue = document.getElementById(pageCraftsTrackedDropdownId).value
    let listElement = document.getElementById(pageCraftsTrackedListId)
    listElement.innerHTML = "";

    for (const key in gTrackedItems){
        let item = gTrackedItems[key]
        let favorited = item[pageCraftsFavoritesProperty.toLowerCase()]
        let category = item[pageCraftsCategoryProperty];
        
        if ((favorited && dropdownValue === pageCraftsFavoritesProperty) || (category && dropdownValue === category)){
            addEntryToList(listElement, item[markerTextContentProperty])
        }
    }

    applyMarksToAll();
}

function populateSkillList(skillList = document.getElementById(pageCraftsSkillsListId), selectedItems = gSelectedItems) {
    skillList.innerHTML = "";

    let skillsRequired = getGreatestSkillLevels(selectedItems);
    let skillsBreakdown = getSkillListFromSelectedItems(selectedItems);
    for (const skillName in skillsRequired){
        let skillLevel = skillsRequired[skillName].level
        let textContent = `${skillName} ${skillLevel}`;

        const li = document.createElement("li");
        const skillRow = document.createElement("div");
        const nameSpan = document.createElement("span");
        const tooltipText = formatSkillBreakdownTooltip(skillName, skillsBreakdown[skillName]);

        skillRow.classList.add("materials-check-item");
        skillRow.title = tooltipText;
        nameSpan.classList.add("materials-check-name");
        nameSpan.textContent = textContent;

        if (!skillsRequired[skillName].mandatory) {
            nameSpan.style.color = itemSkillMandatory;
        }

        const checked = isSkillChecked(skillName);
        if (checked) {
            skillRow.classList.add("is-checked");
        }

        skillRow.setAttribute("role", "button");
        skillRow.tabIndex = 0;
        skillRow.setAttribute("aria-label", `Toggle completion for ${textContent}`);
        skillRow.setAttribute("aria-pressed", checked ? "true" : "false");

        const toggleSkillChecked = () => {
            const nextChecked = !isSkillChecked(skillName);
            setSkillChecked(skillName, nextChecked);
            skillRow.classList.toggle("is-checked", nextChecked);
            skillRow.setAttribute("aria-pressed", nextChecked ? "true" : "false");
        };

        skillRow.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleSkillChecked();
        });

        skillRow.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleSkillChecked();
            }
        });

        skillRow.appendChild(nameSpan);
        li.appendChild(skillRow);
        skillList.appendChild(li);
    }
}

function populateToolsList(toolsList = document.getElementById(pageCraftsToolsListId), selectedItems = gSelectedItems){
    toolsList.innerHTML = "";

    let toolsNeeded = getToolsNeeded(selectedItems);
    let toolsBreakdown = getToolListFromSelectedItems(selectedItems);
    for (const toolName in toolsNeeded){
        const li = document.createElement("li");
        const toolRow = document.createElement("div");
        const nameSpan = document.createElement("span");
        const tooltipText = formatToolBreakdownTooltip(toolName, toolsBreakdown[toolName]);

        toolRow.classList.add("materials-check-item");
        toolRow.title = tooltipText;
        nameSpan.classList.add("materials-check-name");
        nameSpan.textContent = toolName;

        const checked = isToolChecked(toolName);
        if (checked) {
            toolRow.classList.add("is-checked");
        }

        toolRow.setAttribute("role", "button");
        toolRow.tabIndex = 0;
        toolRow.setAttribute("aria-label", `Toggle completion for ${toolName}`);
        toolRow.setAttribute("aria-pressed", checked ? "true" : "false");

        const toggleToolChecked = () => {
            const nextChecked = !isToolChecked(toolName);
            setToolChecked(toolName, nextChecked);
            toolRow.classList.toggle("is-checked", nextChecked);
            toolRow.setAttribute("aria-pressed", nextChecked ? "true" : "false");
        };

        toolRow.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleToolChecked();
        });

        toolRow.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleToolChecked();
            }
        });

        toolRow.appendChild(nameSpan);
        li.appendChild(toolRow);
        toolsList.appendChild(li);
    }
}

function populateMaterialsList(materialsList = document.getElementById(pageCraftsMaterialsListId), doClear = true){
    if (doClear){
        materialsList.innerHTML = "";
    }

    const visibleSelectedItems = getSummaryVisibleSelectedItems(gSelectedItems);
    let materialsNeeded = getMaterialListFromSelectedItems(visibleSelectedItems);
    for (const materialName in materialsNeeded){
        let qty = normalizeMaterialProgressQuantity(materialsNeeded[materialName].qty || 0, 0);
        const isChecked = isMaterialChecked(materialName, qty);

        if (shouldHideRecursiveMaterialRow(materialName, materialsNeeded[materialName])) {
            continue;
        }

        const listItem = document.createElement("li");
        const materialRow = document.createElement("div");
        materialRow.classList.add("materials-check-item");
        materialRow.title = formatMaterialBreakdownTooltip(materialName, materialsNeeded[materialName]);

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("materials-check-name");
        nameSpan.textContent = materialName;

        const haveValue = document.createElement("span");
        haveValue.classList.add("materials-have-value");
        const displayedHaveQty = getEffectiveMaterialHaveQuantity(materialName);
        haveValue.textContent = String(displayedHaveQty);
        haveValue.setAttribute("aria-label", `Quantity you have for ${materialName}`);

        const quantityPrefix = document.createElement("span");
        quantityPrefix.classList.add(pageCraftsCardStyleQuantity, "materials-qty-prefix");
        quantityPrefix.textContent = "x";

        const quantityDivider = document.createElement("span");
        quantityDivider.classList.add(pageCraftsCardStyleQuantity, "materials-qty-divider");
        quantityDivider.textContent = "/";

        const totalQty = document.createElement("span");
        totalQty.classList.add(pageCraftsCardStyleQuantity, "materials-qty-total");
        totalQty.textContent = String(qty);

        const askPlayersWithInventory = getAskPlayersWithInventoryForMaterial(materialName);
        const hasAskPlayers = askPlayersWithInventory.length > 0;
        const baseHaveQty = normalizeMaterialProgressQuantity(getMaterialProgress(materialName).haveQty, 0)
            + normalizeMaterialProgressQuantity(getAlwaysPlayerInventoryForMaterial(materialName), 0);
        const needsAskToMeetRequirement = baseHaveQty < qty;
        const canAskForNeededMaterial = hasAskPlayers && needsAskToMeetRequirement;

        const haveWrapper = document.createElement("div");
        haveWrapper.classList.add("materials-have-wrapper");

        haveWrapper.appendChild(quantityPrefix);
        haveWrapper.appendChild(haveValue);
        haveWrapper.appendChild(quantityDivider);
        haveWrapper.appendChild(totalQty);

        if (isChecked) {
            materialRow.classList.add("is-checked");
        }

        if (canAskForNeededMaterial) {
            materialRow.classList.add("has-ask-available");
        }

        materialRow.appendChild(nameSpan);
        materialRow.appendChild(haveWrapper);

        materialRow.tabIndex = 0;
        materialRow.setAttribute("role", "button");
        materialRow.setAttribute("aria-label", `View inventory sources for ${materialName}`);

        const openAskPicker = (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }

            const picker = createAskPickerOverlay(materialName, materialsList, qty);
            document.body.appendChild(picker);
        };

        materialRow.addEventListener("click", (event) => {
            openAskPicker(event);
        });

        materialRow.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                openAskPicker(event);
            }
        });

        listItem.appendChild(materialRow);
        materialsList.appendChild(listItem);
    }
}

// - CARD INIT FUNCTIONS

function initSelectedCard() {
    populateSelectedList();
}

function initTrackedCard() {
    //Variable declarations
    let elementId = "", data = "";
    
    //Fill Dropdown Logic
    let dropdownList = (getAllUniquePropertyValues(gTrackedItems, "category"));
    dropdownList.splice(0, 0, pageCraftsFavoritesProperty)

    populateDropdownWithList(data = dropdownList, elementId = pageCraftsTrackedDropdownId, 0)
    document.getElementById(elementId = pageCraftsTrackedDropdownId).addEventListener("change", populateTrackedList);
    populateTrackedList();
}

function initSkillCard() {
    const visibleSelectedItems = getSummaryVisibleSelectedItems(gSelectedItems);
    populateSkillList(undefined, visibleSelectedItems);

    let skillsSubtitle = document.getElementById(pageCraftsSkillsSubtitleId)
    let numSkillsRequired = Object.keys(getGreatestSkillLevels(visibleSelectedItems)).length

    if (numSkillsRequired === 0){
        skillsSubtitle.textContent = `You need no skills!`
        return;
    } else if (numSkillsRequired === 1){
        skillsSubtitle.textContent = `You need ${numSkillsRequired} skill:`
    } else {
        skillsSubtitle.textContent = `You need ${numSkillsRequired} skills:`
    }
}

function initToolsCard(){
    const visibleSelectedItems = getSummaryVisibleSelectedItems(gSelectedItems);

    // Populate tools list
    populateToolsList(undefined, visibleSelectedItems);

    // Tools text logic "x tool(s) needed" etc
    let toolsSubtitle = document.getElementById(pageCraftsToolsSubtitleId)
    let numToolsNeeded = Object.keys(getToolsNeeded(visibleSelectedItems)).length

    if (numToolsNeeded === 0){
        toolsSubtitle.textContent = `You need no tools!`
        return;
    } else if (numToolsNeeded === 1){
        toolsSubtitle.textContent = `You need ${numToolsNeeded} tool:`
    } else {
        toolsSubtitle.textContent = `You need ${numToolsNeeded} tools:`
    }
}

function initCraftingTimeCard(){
    const visibleSelectedItems = getSummaryVisibleSelectedItems(gSelectedItems);

    let craftingTimeSubtitle = document.getElementById(pageCraftsCraftingTimeSubtitleId)
    let craftingTimeRemainingSubtitle = document.getElementById(pageCraftsCraftingTimeRemainingSubtitleId)
    let totalTime = getCraftingTime(visibleSelectedItems)
    let checkedTime = getCheckedMaterialsCraftingTime(visibleSelectedItems)
    let remainingTime = Math.max(0, totalTime - checkedTime)

    craftingTimeSubtitle.textContent = `Total ${totalTime}m`;
    craftingTimeRemainingSubtitle.textContent = `Remaining ${remainingTime}m`;
    craftingTimeSubtitle.title = formatCraftingTimeBreakdownTooltip(visibleSelectedItems, "total");
    craftingTimeRemainingSubtitle.title = formatCraftingTimeBreakdownTooltip(visibleSelectedItems, "remaining");
}

function initMaterialsCard(){
    populateMaterialsList();
}

function initIndividualItemCards(){
    const pinnedSelectedItems = gSelectedItems.filter(item => {
        const markKey = getSelectedItemMarkKey(item);
        return !!gTrackedItems[markKey]?.[markerPropertyPinned];
    });

    //Generic Card Creation
    //Clear existing cards
    let existingCards = Array.from(mainGrid.getElementsByClassName(elementClassCard)).filter(card => {
        return !presetCraftGridAreas.includes(card.style.gridArea);
    });

    for (const card of existingCards){
        if (!(pinnedSelectedItems.map(i => i.itemId).includes(card.id))){
            card.remove();
        }
    }

    for (const item of pinnedSelectedItems){
        updateItemCard(mainGrid, item);
    }



    //What does an individual item card need?
    // Recipe #
    // Recipe Navigation Arrows (Selector)
    // Item/Recipe Name
    // Skills Required
    // Tools Required
    // Crafting Time
    // Materials Required
}

// MAIN FUNCTIONS
export function updateView() {
    //Update globals
    gTrackedItems = loadMarks()

    if (isRecursiveModeEnabled()) {
        gTrackedItems = recomputeRecursiveMarks(gTrackedItems, gAllItems, gAllRecipes);
        saveMarks(gTrackedItems);
    } else {
        let didRemoveAutoItems = false;

        for (const key of Object.keys(gTrackedItems)) {
            const entry = gTrackedItems[key];
            if (entry?.recursiveSource === RECURSIVE_SOURCE_AUTO) {
                delete gTrackedItems[key];
                didRemoveAutoItems = true;
            }
        }

        if (didRemoveAutoItems) {
            saveMarks(gTrackedItems);
        }
    }

    gSelectedItems = getSelectedItems();
    rebuildMaterialProgressFromBorrowSources(gSelectedItems);
    recomputeRecursiveAutoVisibilityByItemId();

    const summaryVisibleSelectedItems = getSummaryVisibleSelectedItems(gSelectedItems);
    if (summaryVisibleSelectedItems.length !== gSelectedItems.length) {
        rebuildMaterialProgressFromBorrowSources(summaryVisibleSelectedItems);
        recomputeRecursiveAutoVisibilityByItemId();
    }

    updateRecursiveToggleButtonState();
    updateHideCompletedRecursiveToggleButtonState();

    //Tracked Card Setup
    initTrackedCard();

    //Selected Card Setup
    initSelectedCard();

    //Skill Card Setup
    initSkillCard();

    //Tools Card Setup
    initToolsCard();

    //Crafting Time Card Setup
    initCraftingTimeCard();

    //Materials Card Setup
    initMaterialsCard();

    //Individual Item Cards Setup
    initIndividualItemCards();

    requestAnimationFrame(() => {
        syncCraftSummaryCardHeights();
        syncIndividualRecipeCardSizes();
    });
}

function recomputeMaterialsDisplay() {
    // Lightweight recomputation that only updates materials and crafting time
    // without forcing churn on other cards
    rebuildMaterialProgressFromBorrowSources();
    initMaterialsCard();
    initCraftingTimeCard();
    requestAnimationFrame(() => {
        syncCraftSummaryCardHeights();
    });
}

export function initCraftPage() {
    //Variable declarations
    let baseElement = document.getElementById(pageCraftsId), elementClass = "";
    gTrackedItems = loadMarks()
    gSelectedItems = getSelectedItems(gTrackedItems);
    loadSelectedTreeCollapsedKeys();
    loadMaterialsProgress();
    loadSkillChecks();
    loadToolChecks();
    loadCharacterBorrowSettings();
    loadAskSelections();
    loadHideCompletedRecursiveSetting();

    //Base Grid Setup
    mainGrid = addGridBase(baseElement)

    //Preset Cards Creation
    addCardSelected(mainGrid)
    addCardToolbar(mainGrid)
    addCardCraftingTime(mainGrid)
    addCardTools(mainGrid)
    addCardSkills(mainGrid)
    addCardMaterials(mainGrid)
    addCardTracked(mainGrid)

    //Button Functionality Setup
    setupButtonClear();
    setupButtonSave();
    setupRecursiveToggleButton();
    setupHideCompletedRecursiveToggleButton();
    setupToolbarSettingsMenu();

    //Update Viewport
    updateView();

    if (!gCraftCardHeightSyncResizeHandler) {
        gCraftCardHeightSyncResizeHandler = createDebouncedHandler(() => {
            requestAnimationFrame(() => {
                syncCraftSummaryCardHeights();
                syncIndividualRecipeCardSizes();
            });
        });
        window.addEventListener("resize", gCraftCardHeightSyncResizeHandler);
    }

    

    //TO DO:
    // Skills
    // Tools
    // Crafting Time
    // Materials
    // Individual Item Cards
    // Skills multiple buttons
    // Toolbar buttons functionality
}