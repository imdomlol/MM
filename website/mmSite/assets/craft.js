import { loadMarks, saveMarks } from "./rightClickMenu.js"
import { applyMarksToAll } from "./rightClickMenu.js";
import { gAllRecipes } from "./app.js";

//HREF AND ID CONSTANTS
const recipePageBaseHref = "recipe.html?recipeId="
const itemPageBaseHref = "recipe.html?itemId="
const pageCraftsId = "craft"

//BUTTONS
const toolbarButtonSaveId = "toolbarSave"

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

let gTrackedItems = {};
let gSelectedItems = [];
let fromScratch = false;
let mainGrid = null;
let gCraftCardHeightSyncResizeHandler = null;

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
    const maxHeight = referenceHeight > 0 ? `${referenceHeight}px` : craftCardsDefaultMaxHeight;

    const syncedCards = [
        getCraftCardByGridArea(pageCraftsCardStyleSelected),
        getCraftCardByGridArea(pageCraftsCardStyleSkills),
        getCraftCardByGridArea(pageCraftsCardStyleTools),
        getCraftCardByGridArea(pageCraftsCardStyleTracked),
        getCraftCardByGridArea(pageCraftsCardStyleMaterials)
    ];

    for (const card of syncedCards) {
        if (!card) continue;
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
    appendButton(cardBase, elementClass = elementClassButton, elementId = "toolbarSave", elementText = "Save")
    appendButton(cardBase, elementClass = elementClassButton, elementId = "test4Button", elementText = "Load")
    appendDropdown(cardBase, elementId = "testDropdown")

    cardBase.style.alignContent = "center";
    cardBase.style.justifyContent = "center";
    return cardBase;
}

function addCardCraftingTime(baseElement){
    const cardBase = createCard(baseElement, elementClassCard, pageCraftsCardStyleCraftingTime);
    cardBase.style.overflowY = "";
    let elementClass = "", elementId = "", title = "", isSubtitle = true;

    appendTitle(cardBase, elementClass = elementClassCardTitle, elementId = "", title = pageCraftsCraftingTimeTitle)
    appendTitle(cardBase, elementClass = elementClassCardSubtitle, elementId = pageCraftsCraftingTimeSubtitleId, title = "You are going to need x minute(s)", isSubtitle = true)
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

        item.qty = normalizeSelectedQuantity(previouslySelectedItem?.qty ?? item.qty ?? 1);

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
                totalTime += (recipe[itemPropertyCraftingTime] || 0) * itemQuantity;
            }
        }
    }

    return totalTime;
}

function getMaterialListFromSelectedItems(selectedItems = getSelectedItems()){
    let output = {};
    //only uses the first recipe in recipeIds for now for each item

    for (const item of selectedItems){
        const itemQuantity = getSelectedItemQuantity(item);
        let recipeId = item.reqRecipeId;
        const recipe = gAllRecipes.find(r => r.recipeId === recipeId);
        if (recipe){
            for (const material of recipe[itemPropertyMaterials]){
                let materialName = material[itemPropertyMaterialsName];
                let materialQuantity = material[itemPropertyMaterialsQuantity];

                output[materialName] = output[materialName] || {qty: 0};
                output[materialName].qty += materialQuantity * itemQuantity;
                output[materialName].recipeId = recipeId;
            }
        }
    }

    return output;
}

// - CARD LIST POPULATION FUNCTIONS
function populateSelectedList(){
    let selectedListElement = document.getElementById(pageCraftsSelectedListId)
    selectedListElement.innerHTML = "";

    for (const item of gSelectedItems){
        const itemQuantity = getSelectedItemQuantity(item);
        const itemMarkKey = getSelectedItemMarkKey(item);
        const quantityControlIdBase = (itemMarkKey || item.itemId || item[markerTextContentProperty] || "selected").toString().replace(/\s+/g, "_");

        const listEntry = document.createElement("li");
        listEntry.classList.add(pageCraftsSelectedListItemClass);

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
        let qty = materialsNeeded[materialName].qty || 0;
        let textContent = `${materialName}`;
        let subtextContent = `x ${qty}`;
        let textHref = `${recipePageBaseHref}${materialsNeeded[materialName].recipeId}`;
        addEntryToList(materialsList, textContent, textHref, undefined, subtextContent, pageCraftsCardStyleQuantity);
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
    // TO DO: Calculate crafting time based on selected items
    let craftingTimeSubtitle = document.getElementById(pageCraftsCraftingTimeSubtitleId)
    let totalTime = getCraftingTime(gSelectedItems)

    if (totalTime === 0){
        craftingTimeSubtitle.textContent = `You need no crafting time!`
        return;
    } else if (totalTime === 1){
        craftingTimeSubtitle.textContent = `You need ${totalTime} minute of crafting time. `;
        return;
    } else {
        craftingTimeSubtitle.textContent = `You need ${totalTime} minutes of crafting time. `;
        return;
    }
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
    gSelectedItems = getSelectedItems();

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