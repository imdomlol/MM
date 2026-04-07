const RECURSIVE_MODE_STORAGE_KEY = "mm_recursive_mode_v1";
const RECURSIVE_SOURCE_MANUAL = "manual";
const RECURSIVE_SOURCE_AUTO = "auto";

function normalizeQuantity(quantity) {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function normalizeRequirementQuantity(quantity) {
  const parsed = Number(quantity);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.ceil(parsed);
}

function cloneMarks(marks) {
  const source = marks && typeof marks === "object" ? marks : {};
  const output = {};

  for (const key of Object.keys(source)) {
    output[key] = { ...source[key] };
  }

  return output;
}

function isManualSelected(entry) {
  return !!entry?.selected && entry?.recursiveSource !== RECURSIVE_SOURCE_AUTO;
}

function getRecipeLookup(recipes) {
  const map = new Map();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    if (recipe?.recipeId) map.set(recipe.recipeId, recipe);
  }
  return map;
}

function getItemLookup(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.itemId) map.set(item.itemId, item);
  }
  return map;
}

function getRecipeOutputQuantity(recipe, itemId = "") {
  const results = Array.isArray(recipe?.results) ? recipe.results : [];
  if (results.length === 0) return 1;

  if (itemId) {
    const matchingResult = results.find(result => result?.itemId === itemId);
    if (matchingResult) {
      const parsed = Number(matchingResult.qty);
      return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
    }
  }

  const firstResultQty = Number(results[0]?.qty);
  return Number.isFinite(firstResultQty) && firstResultQty > 0 ? Math.floor(firstResultQty) : 1;
}

function getCraftRunsForQuantity(recipe, desiredQuantity, itemId = "") {
  const outputQuantity = getRecipeOutputQuantity(recipe, itemId);
  const parsedDesired = Number(desiredQuantity);
  if (!Number.isFinite(parsedDesired) || parsedDesired <= 0) return 0;
  return Math.ceil(parsedDesired / outputQuantity);
}

function resolveRecipeId(entry, recipeLookup) {
  const recipeIds = Array.isArray(entry?.recipeIds) ? entry.recipeIds.filter(Boolean) : [];
  if (entry?.reqRecipeId && recipeIds.includes(entry.reqRecipeId)) {
    return entry.reqRecipeId;
  }

  for (const recipeId of recipeIds) {
    if (recipeLookup.has(recipeId)) return recipeId;
  }

  return recipeIds[0] || "";
}

function ensureEntryIdentity(entry, itemData) {
  if (!itemData) return entry;

  entry.itemId = entry.itemId || itemData.itemId || "";
  entry.textContent = entry.textContent || itemData.name || "";

  const recipeIds = Array.isArray(itemData.recipeIds) ? itemData.recipeIds : [];
  if (!Array.isArray(entry.recipeIds) || entry.recipeIds.length === 0) {
    entry.recipeIds = recipeIds;
  }

  if (!entry.reqRecipeId && recipeIds.length > 0) {
    entry.reqRecipeId = recipeIds[0];
  }

  return entry;
}

function getParentItemIds(itemData, recipeLookup) {
  const parentItemIds = new Set();
  const relatedRecipeIds = Array.isArray(itemData?.relatedRecipeIds) ? itemData.relatedRecipeIds : [];

  for (const recipeId of relatedRecipeIds) {
    const recipe = recipeLookup.get(recipeId);
    const results = Array.isArray(recipe?.results) ? recipe.results : [];

    for (const result of results) {
      if (result?.itemId) {
        parentItemIds.add(result.itemId);
      }
    }
  }

  return parentItemIds;
}

function hasExpandableIngredients(entry, itemData, recipeLookup) {
  const recipeIds = Array.isArray(entry?.recipeIds) && entry.recipeIds.length > 0
    ? entry.recipeIds
    : Array.isArray(itemData?.recipeIds)
      ? itemData.recipeIds
      : [];

  const itemId = entry?.itemId || itemData?.itemId || "";
  const parentItemIds = getParentItemIds(itemData, recipeLookup);
  let allRecipesIncludeSelf = recipeIds.length > 0;
  let hasExpandableRecipe = false;

  for (const recipeId of recipeIds) {
    const recipe = recipeLookup.get(recipeId);
    if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      allRecipesIncludeSelf = false;
      continue;
    }

    const includesSelfIngredient = recipe.ingredients.some(ingredient => {
      return ingredient?.itemId === itemId;
    });
    if (!includesSelfIngredient) {
      allRecipesIncludeSelf = false;
    }

    const hasNonSelfIngredient = recipe.ingredients.some(ingredient => {
      return ingredient?.itemId && ingredient.itemId !== itemId;
    });

    const isOnlySelfOrParentIngredients = recipe.ingredients.every(ingredient => {
      const ingredientItemId = ingredient?.itemId || "";
      return ingredientItemId && (ingredientItemId === itemId || parentItemIds.has(ingredientItemId));
    });

    if (recipeIds.length === 1 && isOnlySelfOrParentIngredients) {
      continue;
    }

    if (hasNonSelfIngredient) {
      hasExpandableRecipe = true;
    }
  }

  if (allRecipesIncludeSelf) {
    return false;
  }

  return hasExpandableRecipe;
}

function pruneAutoEntries(marks) {
  for (const key of Object.keys(marks)) {
    const entry = marks[key];
    if (!entry?.selected || entry?.recursiveSource !== RECURSIVE_SOURCE_AUTO) continue;

    entry.selected = false;
    delete entry.recursiveSource;

    // Keep pinned auto entries so child recipe overrides survive recomputes.
    if (!entry.favorited && !entry.category && !entry.pinned && !entry.selected) {
      delete marks[key];
    }
  }
}

function collectManualRoots(marks) {
  const roots = [];
  const manualByItemId = new Map();

  for (const key of Object.keys(marks)) {
    const entry = marks[key];
    if (!isManualSelected(entry)) continue;

    entry.recursiveSource = RECURSIVE_SOURCE_MANUAL;
    entry.qty = normalizeQuantity(entry.qty);

    roots.push({ key, entry });
    if (entry.itemId) {
      manualByItemId.set(entry.itemId, entry);
    }
  }

  return { roots, manualByItemId };
}

function expandFromEntry(entry, quantityMultiplier, marks, recipeLookup, manualByItemId, itemLookup, totalsByItemId, path) {
  if (!entry?.itemId) return;

  const pathKey = entry.itemId;
  if (path.has(pathKey)) return;

  const nextPath = new Set(path);
  nextPath.add(pathKey);

  const recipeId = resolveRecipeId(entry, recipeLookup);
  if (!recipeId) return;

  const recipe = recipeLookup.get(recipeId);
  if (!recipe || !Array.isArray(recipe.ingredients)) return;

  const craftRuns = getCraftRunsForQuantity(recipe, quantityMultiplier, entry.itemId);
  if (craftRuns <= 0) return;

  for (const ingredient of recipe.ingredients) {
    const childItemId = ingredient?.itemId;
    const baseQty = normalizeRequirementQuantity(ingredient?.qty);

    if (!childItemId || baseQty <= 0) continue;

    const requiredQty = normalizeRequirementQuantity(baseQty * craftRuns);
    if (requiredQty <= 0) continue;

    const existingChildEntry = marks[childItemId] || {};
    const childItemData = itemLookup.get(childItemId);
    const childEntry = ensureEntryIdentity({ ...existingChildEntry, itemId: childItemId }, childItemData);

    if (!hasExpandableIngredients(childEntry, childItemData, recipeLookup)) {
      continue;
    }

    if (!manualByItemId.has(childItemId)) {
      totalsByItemId.set(childItemId, (totalsByItemId.get(childItemId) || 0) + requiredQty);
    }

    if (manualByItemId.has(childItemId)) {
      continue;
    }

    expandFromEntry(
      childEntry,
      requiredQty,
      marks,
      recipeLookup,
      manualByItemId,
      itemLookup,
      totalsByItemId,
      nextPath,
    );
  }
}

export function isRecursiveModeEnabled() {
  return localStorage.getItem(RECURSIVE_MODE_STORAGE_KEY) === "1";
}

export function setRecursiveModeEnabled(isEnabled) {
  localStorage.setItem(RECURSIVE_MODE_STORAGE_KEY, isEnabled ? "1" : "0");
}

export function recomputeRecursiveMarks(marks, allItems, allRecipes) {
  const nextMarks = cloneMarks(marks);
  const recipeLookup = getRecipeLookup(allRecipes);
  const itemLookup = getItemLookup(allItems);

  pruneAutoEntries(nextMarks);

  const { roots, manualByItemId } = collectManualRoots(nextMarks);
  const totalsByItemId = new Map();

  for (const root of roots) {
    const itemData = root.entry.itemId ? itemLookup.get(root.entry.itemId) : null;
    ensureEntryIdentity(root.entry, itemData);

    const qty = normalizeQuantity(root.entry.qty);
    root.entry.qty = qty;
    expandFromEntry(root.entry, qty, nextMarks, recipeLookup, manualByItemId, itemLookup, totalsByItemId, new Set());
    nextMarks[root.key] = root.entry;
  }

  for (const [childItemId, qty] of totalsByItemId.entries()) {
    if (!childItemId) continue;
    if (manualByItemId.has(childItemId)) continue;

    const itemData = itemLookup.get(childItemId);
    const existingEntry = nextMarks[childItemId] || {};

    const entry = ensureEntryIdentity({ ...existingEntry }, itemData);
    entry.itemId = entry.itemId || childItemId;
    entry.selected = true;
    entry.recursiveSource = RECURSIVE_SOURCE_AUTO;
    entry.qty = normalizeQuantity(qty);

    if (!Array.isArray(entry.recipeIds)) {
      entry.recipeIds = [];
    }

    if (!entry.reqRecipeId && entry.recipeIds.length > 0) {
      entry.reqRecipeId = entry.recipeIds[0];
    }

    nextMarks[childItemId] = entry;
  }

  return nextMarks;
}

export { RECURSIVE_MODE_STORAGE_KEY, RECURSIVE_SOURCE_MANUAL, RECURSIVE_SOURCE_AUTO, normalizeQuantity, getRecipeOutputQuantity, getCraftRunsForQuantity };