import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mmdb import get_connection, get_meta, read_item_catalog_payload, read_recipes_payload, replace_items_payload


def category_from_folder_path(folder_path: str) -> str:
    if not folder_path:
        return ""
    for segment in str(folder_path).split("/"):
        cleaned = segment.strip()
        if cleaned:
            return cleaned
    return ""


def build_items_payload(recipes_payload: dict) -> dict:
    books_property = "books"
    recipes_property = "recipes"
    recipe_name_property = "name"
    recipe_id_property = "recipeId"
    item_id_property = "itemId"
    item_name_property = "item"

    recipe_inputs_property = "ingredients"
    recipe_outputs_property = "results"

    output_item_name_property = "name"
    output_item_id_property = "itemId"
    output_item_recipe_id_property = "recipeIds"
    output_item_related_recipe_ids_property = "relatedRecipeIds"

    items = {}

    catalog_items = recipes_payload.get("_itemCatalog", [])
    for catalog_item in catalog_items:
        item_id = catalog_item.get(output_item_id_property)
        if not item_id:
            continue
        items[item_id] = {
            output_item_name_property: catalog_item.get(output_item_name_property) or "",
            output_item_id_property: item_id,
            output_item_recipe_id_property: [],
            output_item_related_recipe_ids_property: [],
            "folderPath": catalog_item.get("folderPath") or "",
            "descriptionText": catalog_item.get("descriptionText") or "",
            "imagePath": catalog_item.get("imagePath") or "",
            "category": category_from_folder_path(catalog_item.get("folderPath") or ""),
        }

    for book in recipes_payload.get(books_property, []):
        for recipe in book.get(recipes_property, []):
            recipe_id = recipe.get(recipe_id_property)
            recipe_name = recipe.get(recipe_name_property)

            for ingredient in recipe.get(recipe_inputs_property, []):
                item_id = ingredient.get(item_id_property)
                item_name = ingredient.get(item_name_property)
                if not item_id:
                    continue
                if item_id not in items:
                    items[item_id] = {
                        output_item_name_property: item_name,
                        output_item_id_property: item_id,
                        output_item_recipe_id_property: [recipe_id] if recipe_id and recipe_name == item_name else [],
                        output_item_related_recipe_ids_property: [recipe_id] if recipe_id and recipe_name != item_name else [],
                        "folderPath": "",
                        "descriptionText": "",
                        "imagePath": "",
                        "category": "",
                    }
                elif recipe_id and recipe_id not in items[item_id][output_item_related_recipe_ids_property]:
                    if not items[item_id].get(output_item_name_property):
                        items[item_id][output_item_name_property] = item_name
                    if recipe_name == item_name:
                        if recipe_id not in items[item_id][output_item_recipe_id_property]:
                            items[item_id][output_item_recipe_id_property].append(recipe_id)
                    elif recipe_id not in items[item_id][output_item_recipe_id_property]:
                        items[item_id][output_item_related_recipe_ids_property].append(recipe_id)

            for result in recipe.get(recipe_outputs_property, []):
                item_id = result.get(item_id_property)
                item_name = result.get(item_name_property)
                if not item_id:
                    continue
                if item_id not in items:
                    items[item_id] = {
                        output_item_name_property: item_name,
                        output_item_id_property: item_id,
                        output_item_recipe_id_property: [recipe_id] if recipe_id and recipe_name == item_name else [],
                        output_item_related_recipe_ids_property: [recipe_id] if recipe_id and recipe_name != item_name else [],
                        "folderPath": "",
                        "descriptionText": "",
                        "imagePath": "",
                        "category": "",
                    }
                elif (
                    recipe_id
                    and recipe_id not in items[item_id][output_item_related_recipe_ids_property]
                    and recipe_id not in items[item_id][output_item_recipe_id_property]
                ):
                    if not items[item_id].get(output_item_name_property):
                        items[item_id][output_item_name_property] = item_name
                    if recipe_name == item_name:
                        items[item_id][output_item_recipe_id_property].append(recipe_id)
                    else:
                        items[item_id][output_item_related_recipe_ids_property].append(recipe_id)

    return {"items": list(items.values())}


def build_items_data(db_path: Path, force: bool = False) -> None:
    conn = get_connection(db_path)
    try:
        source_hash = get_meta(conn, "recipes_source_hash")
        if not force and source_hash and get_meta(conn, "items_source_hash") == source_hash:
            print("items data up to date, skipping")
            return

        recipes_payload = read_recipes_payload(conn)
        item_catalog_payload = read_item_catalog_payload(conn)
        recipes_payload["_itemCatalog"] = item_catalog_payload.get("items", [])
        items_payload = build_items_payload(recipes_payload)

        with conn:
            replace_items_payload(conn, items_payload, source_hash=source_hash)

        print(f"Generated items data with {len(items_payload['items'])} unique items")
    finally:
        conn.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Build items data from recipes data in SQLite")
    ap.add_argument("--db", default=str(REPO_ROOT / "website" / "mmSite" / "data" / "mm.db"))
    ap.add_argument("--force", "-f", action="store_true", help="Rebuild even if source is unchanged")
    args = ap.parse_args()

    build_items_data(Path(args.db), force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
