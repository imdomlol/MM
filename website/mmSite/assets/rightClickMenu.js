import { gAllItems, gAllRecipes } from "./app.js";
import { updateView } from "./craft.js";
import {
  isRecursiveModeEnabled,
  recomputeRecursiveMarks,
  RECURSIVE_SOURCE_AUTO,
  RECURSIVE_SOURCE_MANUAL,
  normalizeQuantity,
} from "./recursiveCraft.js";

// CONFIG
const LIST_CONTAINER_SELECTOR = "#allRecipes, #ingredientsList, #resultsList, #relatedRecipesList, #trackedList, #playerInventoryList, #selectedList";
const STORAGE_KEY = "mm_user_marks_v1";
const DEFAULT_MARKS = { };

// STORAGE HELPERS
export function loadMarks(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_MARKS;
  }catch{
    return DEFAULT_MARKS;
  }
}

export function saveMarks(m){ localStorage.setItem(STORAGE_KEY, JSON.stringify(m));}

export function getItemKeyFromInfo(info){
  return info.itemId ? `${info.itemId}` : `${info.textContent.toLowerCase()}`;
}

export function getItemInfo(a){
  let out = {};
  const url = new URL(a.href, window.location.origin);
  const recipeId = url.searchParams.get("recipeId");
  const itemId = url.searchParams.get("itemId");
  const itemName = (a.textContent.trim()).replace(/\s+x\s+\d+$/, "");

  // Check if item exists in dictionary, if it does fill information out
  for (const item of gAllItems)
    if ((item.name == itemName) || (item.itemId == itemId) || ((item.recipeIds).includes(recipeId))){
      out = {
        itemId: item.itemId,
        recipeIds: item.recipeIds,
        textContent: item.name,
      }
    }

  // If item does not exist in dictionary, then just fill out it's displayed name
  if (!out.textContent){
    out = {
        itemId: "",
        recipeIds: "",
        textContent: itemName,
    }
  }

  return out;
}

function applyMarksToLink(a, marks){
  const info = getItemInfo(a)
  const key = getItemKeyFromInfo(info);
  const entry = marks?.[key];
  const isFav = !!entry?.favorited || false;
  const category = entry?.category || "";
  const isSelected = !!entry?.selected || false;

  // favorite
  a.classList.toggle("is-favorited", isFav);

  // selected
  a.classList.toggle("is-selected", isSelected)

  // category tag
  if(category){
    a.dataset.usercategory = category;
  }else{
    a.removeAttribute("data-usercategory");
  }
}

// Apply marks to all links on page load or after you render the list
export function applyMarksToAll(){
  const marks = loadMarks();

  const links = document.querySelectorAll(`:is(${LIST_CONTAINER_SELECTOR}) a`);
  links.forEach(a => applyMarksToLink(a, marks));
}

// CONTEXT MENU
const menu = document.getElementById("ctxMenu");
let currentLink = null;

function openMenu(x, y, link){
  currentLink = link;
  menu.hidden = false;

  // Prevent menu from going off-screen
  const pad = 8;
  const rect = menu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - pad;
  const maxY = window.innerHeight - rect.height - pad;

  menu.style.left = Math.max(pad, Math.min(x, maxX)) + "px";
  menu.style.top  = Math.max(pad, Math.min(y, maxY)) + "px";

  // Update menu text to reflect current state
  const marks = loadMarks();
  const info = getItemInfo(currentLink)
  const key = getItemKeyFromInfo(info);

  const selectedBtn = menu.querySelector('[data-action="toggle-selected"]');
  if (selectedBtn) {
    const isSelected = !!marks[key]?.selected;
    const isAutoSelected = marks[key]?.recursiveSource === RECURSIVE_SOURCE_AUTO;

    if (isSelected && isAutoSelected) {
      selectedBtn.textContent = "Promote (Manual)";
    } else {
      selectedBtn.textContent = isSelected ? "Remove" : "Select";
    }
  }

  const favBtn = menu.querySelector('[data-action="toggle-favorited"]');
  if (favBtn) {
    favBtn.textContent = marks[key]?.favorited ? "⭐ Unfavorite" : "⭐ Favorite";
  }
}

function closeMenu(){
  menu.hidden = true;
  currentLink = null;
}

// Right-click handler (event delegation)
document.addEventListener("contextmenu", (e) => {
  const list = e.target.closest(LIST_CONTAINER_SELECTOR);
  if(!list) return;

  const a = e.target.closest("a");
  if(!a) return;

  e.preventDefault();
  openMenu(e.clientX, e.clientY, a);
});

// Click outside closes
document.addEventListener("click", (e) => {
  if(menu.hidden) return;
  if(e.target.closest("#ctxMenu")) return;
  closeMenu();
});

// Escape closes
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape") closeMenu();
});

// Handle menu actions
menu.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if(!btn || !currentLink) return;

  const action = btn.dataset.action;

  const marks = loadMarks();
  marks ??= {};

  const info = getItemInfo(currentLink)
  const key = getItemKeyFromInfo(info);

  const entry = marks[key] ?? {
    itemId: info.itemId || "",
    recipeIds: Array.isArray(info.recipeIds) ? info.recipeIds : [],
    textContent: info.textContent || "",
    favorited: false,
    category: "",
    selected: false,
    qty: 1,
  }

  if(action === "toggle-favorited"){
    entry.favorited = !entry.favorited;
  }

  if(action === "toggle-selected"){
    if (entry.selected && entry.recursiveSource === RECURSIVE_SOURCE_AUTO) {
      entry.recursiveSource = RECURSIVE_SOURCE_MANUAL;
      entry.selected = true;
      entry.qty = normalizeQuantity(entry.qty);
    } else {
      entry.selected = !entry.selected;

      if (entry.selected) {
        entry.recursiveSource = RECURSIVE_SOURCE_MANUAL;
        entry.qty = normalizeQuantity(entry.qty);
      } else {
        delete entry.recursiveSource;
      }
    }
  }

  if(action === "set-category"){
    entry.category = btn.dataset.category || "";
  }

  if (!entry.favorited && !entry.category && !entry.selected) {
    delete marks[key];
  } else {
    marks[key] = entry;
  }

  if (action === "toggle-selected" && isRecursiveModeEnabled()) {
    const recomputed = recomputeRecursiveMarks(marks, gAllItems, gAllRecipes);
    for (const existingKey of Object.keys(marks)) delete marks[existingKey];
    Object.assign(marks, recomputed);
  }

  saveMarks(marks);
  applyMarksToLink(currentLink, marks);
  closeMenu();

  if (action === "toggle-selected") {
    updateView();
  }
});

// Run once at startup (and call again after you render lists)
applyMarksToAll();

