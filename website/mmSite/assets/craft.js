import { loadMarks, saveMarks } from "./rightClickMenu.js"
import { applyMarksToAll } from "./rightClickMenu.js";
import { gAllItems, gAllPlayers, gAllRecipes } from "./app.js";
import {
    isRecursiveModeEnabled,
    getCraftRunsForQuantity,
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
const toolbarButtonSettingsId = "toolbarSettings"
const toolbarSettingsMenuId = "toolbarSettingsMenu"
const toolbarSettingsListId = "toolbarSettingsList"
const toolbarSettingsCloseId = "toolbarSettingsClose"
const selectedTreeCollapsedStorageKey = "mm_selected_tree_collapsed_v1"
const materialsProgressStorageKey = "mm_materials_progress_v1"
const borrowSettingsStorageKey = "mm_character_borrow_settings_v1"

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
let gCharacterBorrowSettings = {};
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
    const closeButton = document.getElementById(toolbarSettingsCloseId);
    if (!menu || !openButton || !closeButton) return;

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

    closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
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

            const haveQty = normalizeMaterialProgressQuantity(value.haveQty, 0);
            const originalQty = normalizeMaterialProgressQuantity(value.originalQty, haveQty);
            const isChecked = Boolean(value.isChecked);

            out[key] = { haveQty, originalQty, isChecked };
        }

        gMaterialProgressByKey = out;
    } catch {
        gMaterialProgressByKey = {};
    }
}

function saveMaterialsProgress() {
    localStorage.setItem(materialsProgressStorageKey, JSON.stringify(gMaterialProgressByKey));
}

function normalizeMaterialCheckKey(materialName = "") {
    return String(materialName).trim().toLowerCase();
}

function getMaterialProgress(materialName = "") {
    const key = normalizeMaterialCheckKey(materialName);
    return gMaterialProgressByKey[key] || { haveQty: 0, originalQty: 0, isChecked: false };
}

function setMaterialProgress(materialName = "", nextProgress = {}) {
    const key = normalizeMaterialCheckKey(materialName);
    if (!key) return;

    const current = getMaterialProgress(materialName);
    const haveQty = normalizeMaterialProgressQuantity(nextProgress.haveQty, current.haveQty);
    const originalQty = normalizeMaterialProgressQuantity(nextProgress.originalQty, current.originalQty);
    const isChecked = Boolean(nextProgress.isChecked);

    gMaterialProgressByKey[key] = { haveQty, originalQty, isChecked };
    saveMaterialsProgress();
}

function isMaterialChecked(materialName = "", requiredQty = 0) {
    const progress = getMaterialProgress(materialName);
    const required = normalizeMaterialProgressQuantity(requiredQty, 0);
    if (required > 0 && progress.haveQty >= required) {
        return true;
    }

    return !!progress.isChecked;
}

function toggleMaterialChecked(materialName = "", requiredQty = 0) {
    const key = normalizeMaterialCheckKey(materialName);
    if (!key) return getMaterialProgress(materialName);

    const progress = getMaterialProgress(materialName);
    const required = normalizeMaterialProgressQuantity(requiredQty, 0);

    if (!progress.isChecked) {
        const next = {
            haveQty: required,
            originalQty: progress.haveQty,
            isChecked: true,
        };
        setMaterialProgress(materialName, next);
        return next;
    }

    const restoredQty = normalizeMaterialProgressQuantity(progress.originalQty, 0);
    const next = {
        haveQty: restoredQty,
        originalQty: restoredQty,
        isChecked: false,
    };
    setMaterialProgress(materialName, next);
    return next;
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
    const skillsCard = getCraftCardByGridArea(pageCraftsCardStyleSkills);
    const toolsCard = getCraftCardByGridArea(pageCraftsCardStyleTools);
    if (!skillsCard || !toolsCard) return;

    const referenceHeight = Math.max(skillsCard.scrollHeight, toolsCard.scrollHeight);
    const clampedHeight = Math.max(referenceHeight, craftCardsMinimumHeightPx);
    const maxHeight = `${clampedHeight}px`;

    const syncedCards = [
        getCraftCardByGridArea(pageCraftsCardStyleSelected),
        getCraftCardByGridArea(pageCraftsCardStyleSkills),
        getCraftCardByGridArea(pageCraftsCardStyleTools),
        getCraftCardByGridArea(pageCraftsCardStyleTracked),
        getCraftCardByGridArea(pageCraftsCardStyleMaterials)
    ];

    for (const card of syncedCards) {
        if (!card) continue;
        card.style.minHeight = `${craftCardsMinimumHeightPx}px`;
        card.style.height = maxHeight;
        card.style.maxHeight = maxHeight;
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
    return (li, a);
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
    "Selected Toolbar Toolbar Toolbar Tracked"
    "Selected Skills Tools Materials Tracked"
    "Selected CraftingTimeSpacerLeft CraftingTime CraftingTimeSpacerRight Tracked"
    `;
    mainGrid.style.gridTemplateColumns = "1fr 1fr 1fr 1fr 1fr";
    mainGrid.style.gridTemplateRows = "5rem auto auto";
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

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsSelectedTitle)
    appendList(cardBase, elementClass = elementClassCardList, elementId = pageCraftsSelectedListId)
}

function addCardToolbar(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleToolbar);
    cardBase.style.overflowY = "";
    let elementClass = "", elementId = "", elementText = "", elementHref;

    appendButton(cardBase, elementClass = elementClassButton, elementId = "testButton", elementText = "Clear")
    appendButton(cardBase, elementClass = elementClassButton, elementId = "test2Button", elementText = "Push")
    appendButton(cardBase, elementClass = elementClassButton, elementId = toolbarButtonRecursiveId, elementText = "Recursive: OFF")
    appendButton(cardBase, elementClass = elementClassButton, elementId = "toolbarSave", elementText = "Save")
    const settingsButton = appendButton(cardBase, elementClass = elementClassButton, elementId = toolbarButtonSettingsId, elementText = "Settings")
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.setAttribute("aria-controls", toolbarSettingsMenuId);
    appendButton(cardBase, elementClass = elementClassButton, elementId = "test4Button", elementText = "Load")
    appendDropdown(cardBase, elementId = "testDropdown")

    const settingsMenu = document.createElement("div");
    settingsMenu.id = toolbarSettingsMenuId;
    settingsMenu.classList.add("craft-settings-menu");
    settingsMenu.hidden = true;

    const settingsHeader = document.createElement("div");
    settingsHeader.classList.add("settings-header");

    const settingsTitle = document.createElement("h2");
    settingsTitle.classList.add("settings-title");
    settingsTitle.textContent = "Character Borrow Defaults";

    const settingsCloseButton = appendButton(settingsHeader, elementClassButton, toolbarSettingsCloseId, "Close");
    settingsCloseButton.classList.add("ghost");

    settingsHeader.prepend(settingsTitle);

    const settingsHint = document.createElement("p");
    settingsHint.classList.add("settings-hint");
    settingsHint.textContent = "Cosmetic only for now. Cycle each character state: always, ask, never.";

    const settingsList = document.createElement("div");
    settingsList.id = toolbarSettingsListId;
    settingsList.classList.add("settings-list");

    settingsMenu.appendChild(settingsHeader);
    settingsMenu.appendChild(settingsHint);
    settingsMenu.appendChild(settingsList);
    cardBase.appendChild(settingsMenu);

    cardBase.style.alignContent = "center";
    cardBase.style.justifyContent = "center";
    cardBase.style.position = "relative";
    return cardBase;
}

function addCardCraftingTime(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleCraftingTime);
    cardBase.style.overflowY = "";
    let elementClass = "", elementId = "", title = "", isSubtitle = true;

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsCraftingTimeTitle)
    appendTitle(cardBase, elementClass = elementClassCardSubtitle, elementId = pageCraftsCraftingTimeSubtitleId, title = "Total: x minute(s)", isSubtitle = true)
    appendTitle(cardBase, elementClass = elementClassCardSubtitle, elementId = pageCraftsCraftingTimeRemainingSubtitleId, title = "Remaining: x minute(s)", isSubtitle = true)
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
        let textHref = `${itemPageBaseHref}${material[itemPropertyMaterialsItemId]}`;
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
            output.push(
                item,
            );
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

function formatMaterialBreakdownTooltip(materialName, materialInfo = {}) {
    const breakdown = Array.isArray(materialInfo.breakdown) ? materialInfo.breakdown : [];
    const totalQty = Math.max(0, Math.floor(Number(materialInfo.qty) || 0));

    function formatQty(value) {
        return Math.max(0, Math.floor(Number(value) || 0));
    }

    const lines = [
        `${materialName}`,
        `Total needed: x ${totalQty}`,
    ];

    if (breakdown.length > 0) {
        lines.push("Used by:");
        for (const entry of breakdown) {
            lines.push(`- ${entry.itemName} x ${formatQty(entry.qty)}`);
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
        const markKey = getSelectedItemMarkKey(item);
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

    const treeToggleButton = document.createElement("button");
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
    itemLink.textContent = node.textContent || "Unknown Item";
    if (node.itemId) {
        itemLink.href = `${itemPageBaseHref}${node.itemId}`;
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
    listEntry.appendChild(treeToggleButton);
    listEntry.appendChild(itemLink);
    listEntry.appendChild(pinButton);
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

function renderTreeDepthFirst(selectedListElement, node) {
    renderSelectedListEntry(selectedListElement, node);

    if (isTreeNodeCollapsed(node.pathKey)) {
        return;
    }

    for (const child of node.children) {
        renderTreeDepthFirst(selectedListElement, child);
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
            renderTreeDepthFirst(selectedListElement, rootNode);
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
        itemLink.textContent = item[markerTextContentProperty] || "Unknown Item";

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
        listEntry.appendChild(pinButton);
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

function populateSkillList(skillList = document.getElementById(pageCraftsSkillsListId)) {
    skillList.innerHTML = "";

    let skillsRequired = getGreatestSkillLevels(gSelectedItems);
    for (const skillName in skillsRequired){
        let skillLevel = skillsRequired[skillName].level
        let skillColor = skillsRequired[skillName].mandatory ? "" : itemSkillMandatory;

        let textContent = `${skillName} ${skillLevel}`;
        let textHref = `${recipePageBaseHref}${skillsRequired[skillName].recipeId}`;
        addEntryToList(skillList, textContent, textHref, skillColor);
    }
}

function populateToolsList(toolsList = document.getElementById(pageCraftsToolsListId)){
    toolsList.innerHTML = "";

    let toolsNeeded = getToolsNeeded(gSelectedItems);
    for (const toolName in toolsNeeded){
        let textContent = toolName;
        let textHref = `${recipePageBaseHref}${toolsNeeded[toolName].recipeId}`;
        addEntryToList(toolsList, textContent, textHref);
    }
}

function populateMaterialsList(materialsList = document.getElementById(pageCraftsMaterialsListId), doClear = true){
    if (doClear){
        materialsList.innerHTML = "";
    }

    let materialsNeeded = getMaterialListFromSelectedItems(gSelectedItems);
    for (const materialName in materialsNeeded){
        let qty = normalizeMaterialProgressQuantity(materialsNeeded[materialName].qty || 0, 0);
        const materialProgress = getMaterialProgress(materialName);
        const isChecked = isMaterialChecked(materialName, qty);

        const listItem = document.createElement("li");
        const materialRow = document.createElement("div");
        materialRow.classList.add("materials-check-item");
        materialRow.title = formatMaterialBreakdownTooltip(materialName, materialsNeeded[materialName]);

        const nameSpan = document.createElement("span");
        nameSpan.classList.add("materials-check-name");
        nameSpan.textContent = materialName;
        nameSpan.setAttribute("role", "button");
        nameSpan.tabIndex = 0;
        nameSpan.setAttribute("aria-label", `Toggle completion for ${materialName}`);
        nameSpan.setAttribute("aria-pressed", isChecked ? "true" : "false");

        const haveInput = document.createElement("input");
        haveInput.type = "number";
        haveInput.min = "0";
        haveInput.step = "1";
        haveInput.inputMode = "numeric";
        haveInput.classList.add("materials-have-input");
        haveInput.value = String(normalizeMaterialProgressQuantity(materialProgress.haveQty, 0));
        haveInput.setAttribute("aria-label", `Quantity you have for ${materialName}`);

        const quantityPrefix = document.createElement("span");
        quantityPrefix.classList.add(pageCraftsCardStyleQuantity, "materials-qty-prefix");
        quantityPrefix.textContent = "x";

        const quantityDivider = document.createElement("span");
        quantityDivider.classList.add(pageCraftsCardStyleQuantity, "materials-qty-divider");
        quantityDivider.textContent = "/";

        const totalQty = document.createElement("span");
        totalQty.classList.add(pageCraftsCardStyleQuantity, "materials-qty-total");
        totalQty.textContent = String(qty);

        const haveWrapper = document.createElement("div");
        haveWrapper.classList.add("materials-have-wrapper");

        const haveInputShell = document.createElement("div");
        haveInputShell.classList.add("materials-have-input-shell");
        haveInputShell.appendChild(haveInput);

        const haveStepper = document.createElement("div");
        haveStepper.classList.add("materials-have-stepper");

        const haveDecrementButton = document.createElement("button");
        haveDecrementButton.type = "button";
        haveDecrementButton.classList.add("materials-have-hover-button", "is-minus", elementClassButton);
        haveDecrementButton.setAttribute("aria-label", `Decrease have quantity for ${materialName}`);
        haveDecrementButton.textContent = "-";

        const haveIncrementButton = document.createElement("button");
        haveIncrementButton.type = "button";
        haveIncrementButton.classList.add("materials-have-hover-button", "is-plus", elementClassButton);
        haveIncrementButton.setAttribute("aria-label", `Increase have quantity for ${materialName}`);
        haveIncrementButton.textContent = "+";

        haveStepper.appendChild(haveDecrementButton);
        haveStepper.appendChild(haveIncrementButton);
        haveInputShell.appendChild(haveStepper);

        haveWrapper.appendChild(quantityPrefix);
        haveWrapper.appendChild(haveInputShell);
        haveWrapper.appendChild(quantityDivider);
        haveWrapper.appendChild(totalQty);

        if (isChecked) {
            materialRow.classList.add("is-checked");
        }

        const applyMaterialHaveQuantity = (nextHaveQtyRaw) => {
            const nextHaveQty = normalizeMaterialProgressQuantity(nextHaveQtyRaw, 0);
            haveInput.value = String(nextHaveQty);

            const nextCheckedState = nextHaveQty >= qty;
            setMaterialProgress(materialName, {
                haveQty: nextHaveQty,
                originalQty: nextHaveQty,
                isChecked: nextCheckedState,
            });

            materialRow.classList.toggle("is-checked", nextCheckedState);
            nameSpan.setAttribute("aria-pressed", nextCheckedState ? "true" : "false");
            initCraftingTimeCard();
        };

        const toggleMaterialCompletion = () => {
            const nextProgress = toggleMaterialChecked(materialName, qty);
            haveInput.value = String(nextProgress.haveQty);
            const nextCheckedState = isMaterialChecked(materialName, qty);
            materialRow.classList.toggle("is-checked", nextCheckedState);
            nameSpan.setAttribute("aria-pressed", nextCheckedState ? "true" : "false");
            initCraftingTimeCard();
        };

        nameSpan.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMaterialCompletion();
        });

        nameSpan.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleMaterialCompletion();
            }
        });

        haveInput.addEventListener("change", () => {
            applyMaterialHaveQuantity(haveInput.value);
        });

        haveDecrementButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            applyMaterialHaveQuantity(normalizeMaterialProgressQuantity(haveInput.value, 0) - 1);
        });

        haveIncrementButton.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            applyMaterialHaveQuantity(normalizeMaterialProgressQuantity(haveInput.value, 0) + 1);
        });

        materialRow.appendChild(nameSpan);
        materialRow.appendChild(haveWrapper);
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
    populateSkillList();

    let skillsSubtitle = document.getElementById(pageCraftsSkillsSubtitleId)
    let numSkillsRequired = Object.keys(getGreatestSkillLevels(gSelectedItems)).length

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
    // Populate tools list
    populateToolsList();

    // Tools text logic "x tool(s) needed" etc
    let toolsSubtitle = document.getElementById(pageCraftsToolsSubtitleId)
    let numToolsNeeded = Object.keys(getToolsNeeded(gSelectedItems)).length

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
    let craftingTimeSubtitle = document.getElementById(pageCraftsCraftingTimeSubtitleId)
    let craftingTimeRemainingSubtitle = document.getElementById(pageCraftsCraftingTimeRemainingSubtitleId)
    let totalTime = getCraftingTime(gSelectedItems)
    let checkedTime = getCheckedMaterialsCraftingTime(gSelectedItems)
    let remainingTime = Math.max(0, totalTime - checkedTime)

    craftingTimeSubtitle.textContent = `Total: ${totalTime} minute${totalTime === 1 ? "" : "s"}`;
    craftingTimeRemainingSubtitle.textContent = `Remaining: ${remainingTime} minute${remainingTime === 1 ? "" : "s"}`;
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
    updateRecursiveToggleButtonState();

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

export function initCraftPage() {
    //Variable declarations
    let baseElement = document.getElementById(pageCraftsId), elementClass = "";
    gTrackedItems = loadMarks()
    gSelectedItems = getSelectedItems(gTrackedItems);
    loadSelectedTreeCollapsedKeys();
    loadMaterialsProgress();
    loadCharacterBorrowSettings();

    //Base Grid Setup
    mainGrid = addGridBase(baseElement)

    //Preset Cards Creation
    addCardSelected(mainGrid)
    addCardToolbar(mainGrid)
    addCardCraftingTime(mainGrid)
    addCraftingTimeRowSpacer(mainGrid, pageCraftsGridStyleCraftingTimeSpacerLeft)
    addCraftingTimeRowSpacer(mainGrid, pageCraftsGridStyleCraftingTimeSpacerRight)
    addCardTools(mainGrid)
    addCardSkills(mainGrid)
    addCardMaterials(mainGrid)
    addCardTracked(mainGrid)

    //Button Functionality Setup
    setupButtonSave();
    setupRecursiveToggleButton();
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