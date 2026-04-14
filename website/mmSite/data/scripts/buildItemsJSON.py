import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mmdb import get_connection, get_meta, read_recipes_payload, replace_items_payload


def build_items_payload(recipes_payload: dict) -> dict:
    booksProperty = "books"
    recipesProperty = "recipes"
    recipesNameProperty = "name"
    recipeIdProperty = "recipeId"
    itemIdProperty = "itemId"
    itemNameProperty = "item"

    recipeInputsProperty = "ingredients"
    recipeOutputsProperty = "results"

    outputItemNameProperty = "name"
    outputItemIdProperty = "itemId"
    outputItemRecipeIdProperty = "recipeIds"
    outputItemRelatedRecipeIdsProperty = "relatedRecipeIds"

    items = {}

    for book in recipes_payload.get(booksProperty, []):
        for recipe in book.get(recipesProperty, []):
            recipeId = recipe.get(recipeIdProperty)
            recipeName = recipe.get(recipesNameProperty)

            for ingredient in recipe.get(recipeInputsProperty, []):
                itemId = ingredient.get(itemIdProperty)
                itemName = ingredient.get(itemNameProperty)
                if not itemId:
                    continue
                if itemId not in items:
                    items[itemId] = {
                        outputItemNameProperty: itemName,
                        outputItemIdProperty: itemId,
                        outputItemRecipeIdProperty: [recipeId] if recipeId and recipeName == itemName else [],
                        outputItemRelatedRecipeIdsProperty: [recipeId] if recipeId and recipeName != itemName else [],
                    }
                elif recipeId and recipeId not in items[itemId][outputItemRelatedRecipeIdsProperty]:
                    if recipeName == itemName:
                        if recipeId not in items[itemId][outputItemRecipeIdProperty]:
                            items[itemId][outputItemRecipeIdProperty].append(recipeId)
                    elif recipeId not in items[itemId][outputItemRecipeIdProperty]:
                        items[itemId][outputItemRelatedRecipeIdsProperty].append(recipeId)

            for result in recipe.get(recipeOutputsProperty, []):
                itemId = result.get(itemIdProperty)
                itemName = result.get(itemNameProperty)
                if not itemId:
                    continue
                if itemId not in items:
                    items[itemId] = {
                        outputItemNameProperty: itemName,
                        outputItemIdProperty: itemId,
                        outputItemRecipeIdProperty: [recipeId] if recipeId and recipeName == itemName else [],
                        outputItemRelatedRecipeIdsProperty: [recipeId] if recipeId and recipeName != itemName else [],
                    }
                elif recipeId and recipeId not in items[itemId][outputItemRelatedRecipeIdsProperty] and recipeId not in items[itemId][outputItemRecipeIdProperty]:
                    if recipeName == itemName:
                        items[itemId][outputItemRecipeIdProperty].append(recipeId)
                    else:
                        items[itemId][outputItemRelatedRecipeIdsProperty].append(recipeId)

    return {"items": list(items.values())}


def build_items_data(db_path: Path, force: bool = False):
    conn = get_connection(db_path)
    try:
        source_hash = get_meta(conn, "recipes_source_hash")
        if not force and source_hash and get_meta(conn, "items_source_hash") == source_hash:
            print("items data up to date, skipping")
            return

        recipes_payload = read_recipes_payload(conn)
        items_payload = build_items_payload(recipes_payload)

        with conn:
            replace_items_payload(conn, items_payload, source_hash=source_hash)

        print(f"Generated items data with {len(items_payload['items'])} unique items")
    finally:
        conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build items data from recipes data in SQLite")
    ap.add_argument("--db", default=str(REPO_ROOT / "website" / "mmSite" / "data" / "mm.db"))
    ap.add_argument("--force", "-f", action="store_true", help="Rebuild even if source is unchanged")
    args = ap.parse_args()
    build_items_data(Path(args.db), force=args.force)
