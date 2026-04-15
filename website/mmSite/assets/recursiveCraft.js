const RECURSIVE_MODE_STORAGE_KEY = "mm_recursive_mode_v1";
const RECURSIVE_SOURCE_MANUAL = "manual";
const RECURSIVE_SOURCE_AUTO = "auto";
const RAW_MATERIALS_FOLDER_PREFIX = "raw materials";

function idsEqual(left, right) {
  return String(left || "").trim() === String(right || "").trim();
}

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
    if (!recipe?.recipeId) continue;
    map.set(String(recipe.recipeId).trim(), recipe);
  }
  return map;
}

function getOutputRecipeIdsByItemId(recipes) {
  const map = new Map();

  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const recipeId = String(recipe?.recipeId || "").trim();
    if (!recipeId) continue;

    const outputItemIds = new Set();
    const directItemId = String(recipe?.itemId || "").trim();
    if (directItemId) outputItemIds.add(directItemId);

    const results = Array.isArray(recipe?.results) ? recipe.results : [];
    for (const result of results) {
      const resultItemId = String(result?.itemId || "").trim();
      if (resultItemId) outputItemIds.add(resultItemId);
    }

    for (const itemId of outputItemIds) {
      const existing = map.get(itemId) || [];
      if (!existing.includes(recipeId)) {
        existing.push(recipeId);
        map.set(itemId, existing);
      }
    }
  }

  return map;
}

function getItemLookup(items) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.itemId) continue;
    map.set(String(item.itemId).trim(), item);
  }
  return map;
}

function getRecipeOutputQuantity(recipe, itemId = "") {
  const results = Array.isArray(recipe?.results) ? recipe.results : [];
  if (results.length === 0) return 1;

  if (itemId) {
    const matchingResult = results.find(result => idsEqual(result?.itemId, itemId));
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

function getCandidateRecipeIds(entry, itemData, outputRecipeIdsByItemId) {
  const recipeIds = getResolvedRecipeIds(entry, itemData);
  if (recipeIds.length > 0) return recipeIds;

  const itemId = String(entry?.itemId || itemData?.itemId || "").trim();
  if (!itemId || !outputRecipeIdsByItemId) return [];

  return (outputRecipeIdsByItemId.get(itemId) || []).map(id => String(id || "").trim()).filter(Boolean);
}

function normalizeFolderPath(folderPath = "") {
  return String(folderPath || "").trim().toLowerCase();
}

function isRawMaterialItem(itemData = null) {
  if (!itemData || typeof itemData !== "object") return false;

  const folderPath = normalizeFolderPath(itemData.folderPath || "");
  const category = normalizeFolderPath(itemData.category || "");

  if (folderPath === RAW_MATERIALS_FOLDER_PREFIX) return true;
  if (folderPath.startsWith(`${RAW_MATERIALS_FOLDER_PREFIX}/`)) return true;
  if (category === RAW_MATERIALS_FOLDER_PREFIX) return true;

  return false;
}

function isSelfReferentialSingleIngredientRecipe(recipe, outputItemId = "") {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  if (ingredients.length !== 1) return false;

  const normalizedOutputItemId = String(outputItemId || "").trim();
  if (!normalizedOutputItemId) return false;

  const onlyIngredientItemId = String(ingredients[0]?.itemId || "").trim();
  return !!onlyIngredientItemId && idsEqual(onlyIngredientItemId, normalizedOutputItemId);
}

function getRecursiveCandidateRecipeIds(entry, itemData, recipeLookup, outputRecipeIdsByItemId) {
  const recipeIds = getCandidateRecipeIds(entry, itemData, outputRecipeIdsByItemId);
  const itemId = String(entry?.itemId || itemData?.itemId || "").trim();

  return recipeIds.filter(recipeId => {
    const recipe = recipeLookup.get(String(recipeId || "").trim());
    if (!recipe) return false;
    return !isSelfReferentialSingleIngredientRecipe(recipe, itemId);
  });
}

function resolveRecipeId(entry, recipeLookup, itemData = null, outputRecipeIdsByItemId = null) {
  const recipeIds = getRecursiveCandidateRecipeIds(entry, itemData, recipeLookup, outputRecipeIdsByItemId);
  const requestedRecipeId = String(entry?.reqRecipeId || "").trim();

  if (requestedRecipeId && recipeIds.some(id => idsEqual(id, requestedRecipeId))) {
    return requestedRecipeId;
  }

  for (const recipeId of recipeIds) {
    if (recipeLookup.has(recipeId)) return recipeId;
  }

  return recipeIds[0] || "";
}

function getRecipeOutputItemId(recipe) {
  const recipeItemId = String(recipe?.itemId || "").trim();
  if (recipeItemId) return recipeItemId;

  const results = Array.isArray(recipe?.results) ? recipe.results : [];
  const firstResultItemId = String(results[0]?.itemId || "").trim();
  return firstResultItemId;
}

function getResolvedRecipeIds(entry, itemData) {
  const entryRecipeIds = Array.isArray(entry?.recipeIds)
    ? entry.recipeIds.map(id => String(id || "").trim()).filter(Boolean)
    : [];

  if (entryRecipeIds.length > 0) return entryRecipeIds;

  return Array.isArray(itemData?.recipeIds)
    ? itemData.recipeIds.map(id => String(id || "").trim()).filter(Boolean)
    : [];
}

function hasCraftableRecipe(entry, itemData, recipeLookup, outputRecipeIdsByItemId) {
  if (isRawMaterialItem(itemData)) return false;

  const recipeIds = getRecursiveCandidateRecipeIds(entry, itemData, recipeLookup, outputRecipeIdsByItemId);
  return recipeIds.length > 0;
}

function ensureEntryIdentity(entry, itemData, outputRecipeIdsByItemId = null) {
  if (!itemData) return entry;

  entry.itemId = String(entry.itemId || itemData.itemId || "").trim();
  entry.textContent = entry.textContent || itemData.name || "";

  const recipeIds = Array.isArray(itemData.recipeIds)
    ? itemData.recipeIds.map(id => String(id || "").trim()).filter(Boolean)
    : [];

  let resolvedRecipeIds = recipeIds;
  if (resolvedRecipeIds.length === 0 && outputRecipeIdsByItemId) {
    resolvedRecipeIds = (outputRecipeIdsByItemId.get(entry.itemId) || []).map(id => String(id || "").trim()).filter(Boolean);
  }

  if (!Array.isArray(entry.recipeIds) || entry.recipeIds.length === 0) {
    entry.recipeIds = resolvedRecipeIds;
  }

  if (!entry.reqRecipeId && resolvedRecipeIds.length > 0) {
    entry.reqRecipeId = resolvedRecipeIds[0];
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

function hasExpandableIngredients(entry, itemData, recipeLookup, outputRecipeIdsByItemId) {
  if (isRawMaterialItem(itemData)) return false;

  const recipeIds = getRecursiveCandidateRecipeIds(entry, itemData, recipeLookup, outputRecipeIdsByItemId);

  const itemId = String(entry?.itemId || itemData?.itemId || "").trim();

  for (const recipeId of recipeIds) {
    const recipe = recipeLookup.get(String(recipeId || "").trim());
    if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      continue;
    }

    const hasNonSelfIngredient = recipe.ingredients.some(ingredient => {
      const ingredientItemId = String(ingredient?.itemId || "").trim();
      return ingredientItemId && !idsEqual(ingredientItemId, itemId);
    });

    if (hasNonSelfIngredient) {
      return true;
    }
  }

  return false;
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
      manualByItemId.set(String(entry.itemId).trim(), entry);
    }
  }

  return { roots, manualByItemId };
}

function expandFromEntry(entry, quantityMultiplier, marks, recipeLookup, manualByItemId, itemLookup, totalsByItemId, path, outputRecipeIdsByItemId) {
  if (!entry) return;

  const itemData = entry.itemId ? itemLookup.get(String(entry.itemId).trim()) : null;
  if (isRawMaterialItem(itemData)) return;

  const recipeId = resolveRecipeId(entry, recipeLookup, itemData, outputRecipeIdsByItemId);
  if (!recipeId) return;

  const recipe = recipeLookup.get(recipeId);
  if (!recipe || !Array.isArray(recipe.ingredients)) return;

  if (!entry.itemId) {
    const derivedItemId = getRecipeOutputItemId(recipe);
    if (derivedItemId) {
      entry.itemId = derivedItemId;
      const derivedItemData = itemLookup.get(derivedItemId);
      ensureEntryIdentity(entry, derivedItemData, outputRecipeIdsByItemId);
    }
  }

  if (!entry.itemId) return;

  const pathKey = String(entry.itemId || "").trim();
  if (path.has(pathKey)) return;

  const nextPath = new Set(path);
  nextPath.add(pathKey);

  const craftRuns = getCraftRunsForQuantity(recipe, quantityMultiplier, entry.itemId);
  if (craftRuns <= 0) return;

  for (const ingredient of recipe.ingredients) {
    const childItemId = String(ingredient?.itemId || "").trim();
    const baseQty = normalizeRequirementQuantity(ingredient?.qty);

    if (!childItemId || baseQty <= 0) continue;

    const requiredQty = normalizeRequirementQuantity(baseQty * craftRuns);
    if (requiredQty <= 0) continue;

    const existingChildEntry = marks[childItemId] || {};
    const childItemData = itemLookup.get(childItemId);
    const childEntry = ensureEntryIdentity({ ...existingChildEntry, itemId: childItemId }, childItemData, outputRecipeIdsByItemId);

    if (!hasCraftableRecipe(childEntry, childItemData, recipeLookup, outputRecipeIdsByItemId)) {
      continue;
    }

    totalsByItemId.set(childItemId, (totalsByItemId.get(childItemId) || 0) + requiredQty);

    if (manualByItemId.has(childItemId)) {
      continue;
    }

    if (!hasExpandableIngredients(childEntry, childItemData, recipeLookup, outputRecipeIdsByItemId)) {
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
      outputRecipeIdsByItemId,
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
  const outputRecipeIdsByItemId = getOutputRecipeIdsByItemId(allRecipes);

  pruneAutoEntries(nextMarks);

  const { roots, manualByItemId } = collectManualRoots(nextMarks);
  const totalsByItemId = new Map();

  for (const root of roots) {
    const itemData = root.entry.itemId ? itemLookup.get(root.entry.itemId) : null;
    ensureEntryIdentity(root.entry, itemData, outputRecipeIdsByItemId);

    const qty = normalizeQuantity(root.entry.qty);
    root.entry.qty = qty;
    expandFromEntry(root.entry, qty, nextMarks, recipeLookup, manualByItemId, itemLookup, totalsByItemId, new Set(), outputRecipeIdsByItemId);
    nextMarks[root.key] = root.entry;
  }

  for (const [childItemId, qty] of totalsByItemId.entries()) {
    if (!childItemId) continue;
    if (manualByItemId.has(childItemId)) continue;

    const itemData = itemLookup.get(childItemId);
    const existingEntry = nextMarks[childItemId] || {};

    const entry = ensureEntryIdentity({ ...existingEntry }, itemData, outputRecipeIdsByItemId);
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