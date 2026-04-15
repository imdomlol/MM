import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from packages.data_pipeline.selenium_utils import fetch_recipe_page_and_item_catalog_with_selenium
from packages.data_pipeline.mmdb import DEFAULT_DB_PATH, get_connection, replace_item_catalog_payload, replace_recipes_payload


@dataclass
class RecipeSkillRequirement:
    skill: str
    level: int


@dataclass
class RecipeComponent:
    item: str
    qty: float
    itemId: str


@dataclass
class Item:
    name: str
    itemId: str = None
    recipeId: str = None
    bookId: str = None

    tools: list[str] = field(default_factory=list)
    craftingTimeMinutes: int = None
    requirementsText: str = ""
    requirements: list[RecipeSkillRequirement] = field(default_factory=list)
    ingredients: list[RecipeComponent] = field(default_factory=list)
    results: list[RecipeComponent] = field(default_factory=list)


@dataclass
class Book:
    bookId: str
    name: str
    description: str = ""
    recipes: list[Item] = field(default_factory=list)


PART_SPLIT = re.compile(r"\s*(?:,|and)\s*", re.IGNORECASE)
ONE_REQ = re.compile(r"^\+(\d+)\s+(.+?)\s*$")


def parse_craft_time(text: str) -> int | None:
    minutes = re.search(r"(\d+)\s*min?", text, re.I)
    return int(minutes.group(1)) if minutes else None


def parse_skill_requirements(requirements_text: str) -> list[RecipeSkillRequirement]:
    if not requirements_text:
        return []

    requirements_text = re.sub(r"^\s*Requires \s*", "", requirements_text, flags=re.IGNORECASE).strip()
    parts = [part.strip() for part in PART_SPLIT.split(requirements_text) if part.strip()]

    out: list[RecipeSkillRequirement] = []
    for part in parts:
        match = ONE_REQ.match(part)
        if not match:
            continue
        level, skill = match.groups()
        out.append(RecipeSkillRequirement(skill=skill.strip(), level=int(level)))

    return out


def now_iso() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def extract_books(soup) -> list[Book]:
    books: list[Book] = []
    book_nodes = soup.select("li.recipe-book.directory-item.level1[data-book-id]")

    for book in book_nodes:
        book_id = (book.get("data-book-id") or "").strip()
        if not book_id:
            continue

        book_name_raw = book.select_one("span.page-title") or book.select_one("span.recipe-name")
        book_name = book_name_raw.get_text(strip=True) if book_name_raw else "Unknown Book"

        book_description_raw = book.select_one("p.recipe-description")
        book_description = book_description_raw.get_text(strip=True) if book_description_raw else ""

        recipes: list[Item] = []
        recipe_nodes = book.select("ol.recipe-list > li.recipe.directory-item.level2[data-recipe-id]")

        for recipe in recipe_nodes:
            recipe_id = (recipe.get("data-recipe-id") or "").strip()
            if not recipe_id:
                continue

            recipe_name_raw = recipe.select_one('span.page-title[data-action="toggle-recipe"]') or recipe.select_one("span.page-title")
            recipe_name = recipe_name_raw.get_text(strip=True) if recipe_name_raw else "Unknown Recipe"

            recipes.append(Item(recipeId=recipe_id, name=recipe_name, bookId=book_id))

        books.append(Book(bookId=book_id, name=book_name, description=book_description, recipes=recipes))

    return books


def extract_components(container) -> list[RecipeComponent]:
    out: list[RecipeComponent] = []
    if not container:
        return out

    for component in container.select(".mastercrafted-component"):
        item_raw = (component.get("data-tooltip") or "").strip()
        item = re.sub(r"\s*\(x\d+\)\s*$", "", item_raw).strip()

        uuid = (component.get("data-uuid") or "").strip()
        item_id = uuid[5:] if uuid.startswith("Item.") else (uuid or None)

        qty_element = component.select_one("input.mastercrafted-component-amount")
        qty = int(qty_element.get("value")) if qty_element and qty_element.get("value") else 1

        out.append(RecipeComponent(item=item, qty=qty, itemId=item_id))

    return out


def extract_recipe_details(soup) -> dict[str, dict]:
    details: dict[str, dict] = {}

    blocks = soup.select(".mastercrafted-recipe[data-recipe-id]")
    for element in blocks:
        recipe_id = (element.get("data-recipe-id") or "").strip()
        book_id = (element.get("data-book-id") or "").strip()
        if not recipe_id:
            continue

        name_raw = element.select_one("header h1")
        name = name_raw.get_text(strip=True) if name_raw else "Unknown Recipe"

        detail_headers = element.select("header p")
        crafting_time_minutes = None
        tools = []
        requirements_text = ""

        if detail_headers:
            last_index = len(detail_headers) - 1
            if last_index - 1 >= 0:
                crafting_time_text = detail_headers[last_index - 1].select_one("span.tool")
                if crafting_time_text:
                    crafting_time_minutes = parse_craft_time(crafting_time_text.get_text(strip=True))

            if last_index - 2 >= 0:
                tools_text = detail_headers[0].select_one("span.tool")
                if tools_text:
                    tool_raw = tools_text.get_text(strip=True)
                    tools = [t.strip() for t in re.split(r",| and ", tool_raw) if t.strip()]

            requirements_text = detail_headers[last_index].get_text(strip=True)

        requirements = parse_skill_requirements(requirements_text)

        ingredients_container = element.select_one(".mastercrafted-ingredients")
        results_container = element.select_one(".mastercrafted-results")

        ingredients = extract_components(ingredients_container) if ingredients_container else []
        results = extract_components(results_container) if results_container else []

        item_id = None
        for result in results:
            if result.item == name:
                item_id = result.itemId
                break

        if item_id is None:
            for ingredient in ingredients:
                if ingredient.item == name:
                    item_id = ingredient.itemId
                    break

        if item_id is None:
            item_id = ""
            print(f"Warning: Could not determine itemId for recipe '{name}'.")

        details[recipe_id] = {
            "name": name,
            "itemId": item_id,
            "recipeId": recipe_id,
            "bookId": book_id,
            "tools": tools,
            "craftingTimeMinutes": crafting_time_minutes,
            "requirementsText": requirements_text,
            "requirements": [asdict(r) for r in requirements],
            "ingredients": [asdict(i) for i in ingredients],
            "results": [asdict(r) for r in results],
        }

    return details


def merge_recipe_details(payload: dict, details_by_recipe_id: dict[str, dict]) -> dict:
    for book in payload.get("books", []):
        for recipe in book.get("recipes", []):
            recipe_id = recipe.get("recipeId")
            if recipe_id in details_by_recipe_id:
                recipe.update(details_by_recipe_id[recipe_id])
    return payload


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def resolve_html_source(args, cache_dir: Path) -> tuple[str, str, list[dict], list[str]]:
    cache_html = cache_dir / "recipes_source.html"
    cache_item_catalog = cache_dir / "items_catalog.json"
    warnings: list[str] = []

    def read_cached_item_catalog() -> list[dict]:
        if not cache_item_catalog.exists():
            return []
        try:
            payload = json.loads(cache_item_catalog.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                return [row for row in payload if isinstance(row, dict) and row.get("itemId")]
        except Exception as exc:
            warnings.append(f"Failed to read cached item catalog: {exc}")
        return []

    if args.input:
        in_path = Path(args.input)
        html = in_path.read_text(encoding="utf-8", errors="replace")
        return html, str(in_path), read_cached_item_catalog(), warnings

    if not args.no_fetch:
        try:
            html, item_catalog, live_warnings = fetch_recipe_page_and_item_catalog_with_selenium(args.recipe_url)
            warnings.extend(live_warnings)
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_html.write_text(html, encoding="utf-8")
            if item_catalog:
                cache_item_catalog.write_text(json.dumps(item_catalog, ensure_ascii=False), encoding="utf-8")
            elif live_warnings:
                warnings.append("Live fetch succeeded but item catalog extraction was empty; keeping previous catalog.")
            return html, args.recipe_url, item_catalog, warnings
        except Exception as exc:
            if getattr(args, "strict_live_fetch", False):
                raise RuntimeError(f"Live recipe fetch failed and strict mode is enabled: {exc}") from exc
            if cache_html.exists():
                print(f"Live fetch failed ({exc}); using cached HTML from {cache_html}")
                html = cache_html.read_text(encoding="utf-8", errors="replace")
                warnings.append(f"Live fetch failed; used cached HTML: {exc}")
                return html, str(cache_html), read_cached_item_catalog(), warnings
            raise

    if cache_html.exists():
        html = cache_html.read_text(encoding="utf-8", errors="replace")
        return html, str(cache_html), read_cached_item_catalog(), warnings

    raise FileNotFoundError("No recipe HTML source available. Run without --no-fetch or pass --input.")


def build_payload_from_html(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    books = extract_books(soup)
    recipe_details = extract_recipe_details(soup)

    payload = {
        "last_updated": now_iso(),
        "books": [asdict(b) for b in books],
    }
    payload = merge_recipe_details(payload, recipe_details)

    total = sum(len(book["recipes"]) for book in payload["books"])
    merged = sum(1 for book in payload["books"] for recipe in book["recipes"] if "ingredients" in recipe)
    print("Books:", len(payload["books"]))
    print("Total recipes:", total)
    print("Recipes with details merged:", merged)

    if total == 0:
        raise ValueError("No recipes extracted from source HTML. Refresh aborted to protect existing DB data.")

    return payload


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch+parse recipe HTML -> SQLite recipes tables")
    ap.add_argument("--input", "-i", default="", help="Optional local HTML source path (skips live fetch)")
    ap.add_argument("--recipe-url", default="http://173.29.198.65:30000/game", help="Game URL used for live fetch")
    ap.add_argument("--no-fetch", action="store_true", help="Do not fetch live HTML; use --input or cached .build_cache/recipes_source.html")
    ap.add_argument("--strict-live-fetch", action="store_true", help="Fail immediately if live fetch fails instead of falling back to cached HTML")
    ap.add_argument("--db", default=str(DEFAULT_DB_PATH))
    ap.add_argument("--force", "-f", action="store_true", help="Rebuild even if source is unchanged")
    args = ap.parse_args()

    db_path = Path(args.db)
    cache_dir = REPO_ROOT / ".build_cache"
    hash_file = cache_dir / "recipes_source.sha256"

    html, source_label, item_catalog, warnings = resolve_html_source(args, cache_dir)

    current_hash = sha256_text(html)
    if not args.force and hash_file.exists() and hash_file.read_text().strip() == current_hash:
        print(f"recipes data up to date, skipping (source: {source_label})")
        return 0

    payload = build_payload_from_html(html)

    conn = get_connection(db_path)
    try:
        with conn:
            replace_recipes_payload(conn, payload, source_hash=current_hash)
            if item_catalog:
                replace_item_catalog_payload(conn, {"items": item_catalog}, source_hash=current_hash)
            else:
                print("Warning: Full item catalog not updated; preserving previously stored catalog.")
    finally:
        conn.close()

    cache_dir.mkdir(parents=True, exist_ok=True)
    hash_file.write_text(current_hash)
    for warning in warnings:
        print(f"Warning: {warning}")
    print(f"Wrote recipes to DB: {db_path} (source: {source_label})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
