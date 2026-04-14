import argparse
import hashlib
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
recipesPath = REPO_ROOT / "website" / "mmSite" / "data" / "recipes.json"
outPath = REPO_ROOT / "website" / "mmSite" / "data" / "items.json"
booksProperty = 'books'
recipesProperty = 'recipes'
recipesNameProperty = 'name'
recipeIdProperty = 'recipeId'
itemIdProperty = 'itemId'
itemNameProperty = 'item'

recipeInputsProperty = 'ingredients'
recipeOutputsProperty = 'results'

outputItemNameProperty = 'name'
outputItemIdProperty = 'itemId'
outputItemRecipeIdProperty = 'recipeIds'
outputItemRelatedRecipeIdsProperty = 'relatedRecipeIds'

def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def build_items_json(force: bool = False):
    cache_dir = REPO_ROOT / ".build_cache"
    hash_file = cache_dir / "recipes_json.sha256"

    if not force and outPath.exists() and recipesPath.exists():
        current_hash = _sha256(recipesPath)
        if hash_file.exists() and hash_file.read_text().strip() == current_hash:
            print("items.json up to date, skipping")
            return

    with open(recipesPath, 'r', encoding='utf-8') as f:
        books = json.load(f)
    
    items = {}
    itemCount = 1
    
    # Extract unique items from recipes
    for book in books.get(booksProperty, []):
        for recipe in book.get(recipesProperty, []):
            recipeId = recipe.get(recipeIdProperty)
            recipeName = recipe.get(recipesNameProperty)
            
            # Check inputs
            for ingredient in recipe.get(recipeInputsProperty, []):
                itemId = ingredient.get(itemIdProperty)
                itemName = ingredient.get(itemNameProperty)
                if itemId and itemId not in items:
                    items[itemId] = {
                        outputItemNameProperty: itemName,
                        outputItemIdProperty: itemId,
                        outputItemRecipeIdProperty: [recipeId] if recipeId and recipeName == itemName else [],
                        outputItemRelatedRecipeIdsProperty: [recipeId] if recipeId and recipeName != itemName else []
                    }
                    itemCount += 1
                elif itemId and recipeId and recipeId not in items[itemId][outputItemRelatedRecipeIdsProperty]:
                    items[itemId][outputItemRecipeIdProperty].append(recipeId) if recipeName == itemName else None
                    items[itemId][outputItemRelatedRecipeIdsProperty].append(recipeId) if recipeId not in items[itemId][outputItemRecipeIdProperty] else None
            
            # Check outputs
            for result in recipe.get(recipeOutputsProperty, []):
                itemId = result.get(itemIdProperty)
                itemName = result.get(itemNameProperty)
                if itemId and itemId not in items:
                    items[itemId] = {
                        outputItemNameProperty: itemName,
                        outputItemIdProperty: itemId,
                        outputItemRecipeIdProperty: [recipeId] if recipeId and recipeName == itemName else [],
                        outputItemRelatedRecipeIdsProperty: [recipeId] if recipeId and recipeName != itemName else []
                    }
                    itemCount += 1
                elif itemId and recipeId and recipeId not in items[itemId][outputItemRelatedRecipeIdsProperty] and recipeId not in items[itemId][outputItemRecipeIdProperty]:
                    items[itemId][outputItemRecipeIdProperty].append(recipeId) if recipeName == itemName else None
                    items[itemId][outputItemRelatedRecipeIdsProperty].append(recipeId) if recipeId not in items[itemId][outputItemRecipeIdProperty] else None
    
    # Write items.json
    itemsList = list(items.values())
    
    with open(outPath, 'w', encoding='utf-8') as f:
        json.dump({'items': itemsList}, f, indent=2)

    cache_dir.mkdir(parents=True, exist_ok=True)
    hash_file.write_text(_sha256(recipesPath))

    print(f"Generated items.json with {len(itemsList)} unique items")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build items.json from recipes.json")
    ap.add_argument("--force", "-f", action="store_true", help="Rebuild even if source is unchanged")
    args = ap.parse_args()
    build_items_json(force=args.force)