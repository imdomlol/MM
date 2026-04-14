import argparse
import hashlib
import re
import sys
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict, field
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mmdb import get_connection, replace_recipes_payload


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


def parseCraftTime(text: str) -> int | None:
    minutes = re.search(r"(\d+)\s*min?", text, re.I)
    return int(minutes.group(1)) if minutes else None


def parseSkillRequirements(requirementsText: str) -> list[RecipeSkillRequirement]:
    if not requirementsText:
        return []

    requirementsText = re.sub(r"^\s*Requires \s*", "", requirementsText, flags=re.IGNORECASE).strip()
    parts = [part.strip() for part in PART_SPLIT.split(requirementsText) if part.strip()]

    out: list[RecipeSkillRequirement] = []
    for part in parts:
        match = ONE_REQ.match(part)
        if not match:
            continue
        level, skill = match.groups()
        out.append(RecipeSkillRequirement(skill=skill.strip(), level=int(level)))

    return out


def nowISO() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def extractBooks(soup) -> list[Book]:
    books: list[Book] = []
    book_nodes = soup.select("li.recipe-book.directory-item.level1[data-book-id]")

    for book in book_nodes:
        bookId = (book.get("data-book-id") or "").strip()
        if not bookId:
            continue

        bookNameRaw = book.select_one("span.page-title") or book.select_one("span.recipe-name")
        bookName = bookNameRaw.get_text(strip=True) if bookNameRaw else "Unknown Book"

        bookDescriptionRaw = book.select_one("p.recipe-description")
        bookDescription = bookDescriptionRaw.get_text(strip=True) if bookDescriptionRaw else ""

        recipes: list[Item] = []
        recipe_nodes = book.select("ol.recipe-list > li.recipe.directory-item.level2[data-recipe-id]")

        for recipe in recipe_nodes:
            recipeId = (recipe.get("data-recipe-id") or "").strip()
            if not recipeId:
                continue

            recipeNameRaw = recipe.select_one('span.page-title[data-action="toggle-recipe"]') or recipe.select_one("span.page-title")
            recipeName = recipeNameRaw.get_text(strip=True) if recipeNameRaw else "Unknown Recipe"

            recipes.append(Item(recipeId=recipeId, name=recipeName, bookId=bookId))

        books.append(Book(bookId=bookId, name=bookName, description=bookDescription, recipes=recipes))

    return books


def extractComponents(container) -> list[RecipeComponent]:
    out: list[RecipeComponent] = []
    if not container:
        return out

    for component in container.select(".mastercrafted-component"):
        itemRaw = (component.get("data-tooltip") or "").strip()
        item = re.sub(r"\s*\(x\d+\)\s*$", "", itemRaw).strip()

        uuid = (component.get("data-uuid") or "").strip()
        itemId = uuid[5:] if uuid.startswith("Item.") else (uuid or None)

        qtyElement = component.select_one("input.mastercrafted-component-amount")
        qty = int(qtyElement.get("value")) if qtyElement and qtyElement.get("value") else 1

        out.append(RecipeComponent(item=item, qty=qty, itemId=itemId))

    return out


def extractRecipeDetails(soup) -> dict[str, dict]:
    details: dict[str, dict] = {}

    blocks = soup.select(".mastercrafted-recipe[data-recipe-id]")
    for element in blocks:
        recipeId = (element.get("data-recipe-id") or "").strip()
        bookId = (element.get("data-book-id") or "").strip()
        if not recipeId:
            continue

        nameRaw = element.select_one("header h1")
        name = nameRaw.get_text(strip=True) if nameRaw else "Unknown Recipe"

        detailHeaders = element.select("header p")
        craftingTimeMinutes = None
        tools = []
        requirementsText = ""

        if detailHeaders:
            lastIndex = len(detailHeaders) - 1
            if lastIndex - 1 >= 0:
                craftingTimeText = detailHeaders[lastIndex - 1].select_one("span.tool")
                if craftingTimeText:
                    craftingTimeMinutes = parseCraftTime(craftingTimeText.get_text(strip=True))

            if lastIndex - 2 >= 0:
                toolsText = detailHeaders[0].select_one("span.tool")
                if toolsText:
                    toolRaw = toolsText.get_text(strip=True)
                    tools = [t.strip() for t in re.split(r",| and ", toolRaw) if t.strip()]

            requirementsText = detailHeaders[lastIndex].get_text(strip=True)

        requirements = parseSkillRequirements(requirementsText)

        ingredientsContainer = element.select_one(".mastercrafted-ingredients")
        resultsContainer = element.select_one(".mastercrafted-results")

        ingredients = extractComponents(ingredientsContainer) if ingredientsContainer else []
        results = extractComponents(resultsContainer) if resultsContainer else []

        itemId = None
        for result in results:
            if result.item == name:
                itemId = result.itemId
                break

        if itemId is None:
            for ingredient in ingredients:
                if ingredient.item == name:
                    itemId = ingredient.itemId
                    break

        if itemId is None:
            itemId = ""
            print(f"Warning: Could not determine itemId for recipe '{name}'.")

        details[recipeId] = {
            "name": name,
            "itemId": itemId,
            "recipeId": recipeId,
            "bookId": bookId,
            "tools": tools,
            "craftingTimeMinutes": craftingTimeMinutes,
            "requirementsText": requirementsText,
            "requirements": [asdict(r) for r in requirements],
            "ingredients": [asdict(i) for i in ingredients],
            "results": [asdict(r) for r in results],
        }

    return details


def mergeRecipeDetails(payload: dict, detailsByRecipeId: dict[str, dict]) -> dict:
    for book in payload.get("books", []):
        for recipe in book.get("recipes", []):
            recipeId = recipe.get("recipeId")
            if recipeId in detailsByRecipeId:
                recipe.update(detailsByRecipeId[recipeId])
    return payload


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def fetch_recipe_page_with_selenium(recipe_page_url: str) -> str:
    options = webdriver.ChromeOptions()
    driver = webdriver.Chrome(options=options)
    try:
        driver.get(recipe_page_url)

        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "join-game-form")))

        select_element = driver.find_element(By.NAME, "userid")
        caine_option = select_element.find_element(By.XPATH, ".//option[text()='Caine']")
        driver.execute_script("arguments[0].disabled = false;", caine_option)

        select = Select(select_element)
        select.select_by_visible_text("Caine")

        join_button = driver.find_element(By.XPATH, "//button[@name='join']")
        join_button.click()

        WebDriverWait(driver, 10).until(lambda d: "game" in d.current_url)

        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located(
                (
                    By.XPATH,
                    "//body[contains(@class, 'vtt') and contains(@class, 'game') and contains(@class, 'system-worldbuilding') and contains(@class, 'theme-dark')]",
                )
            )
        )
        ui_right_section = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.XPATH, "//div[@id='interface']//section[@id='ui-right']"))
        )
        sidebar_app = WebDriverWait(ui_right_section, 15).until(
            EC.presence_of_element_located((By.XPATH, ".//div[@id='sidebar' and contains(@class, 'app')]"))
        )
        items_tab = WebDriverWait(sidebar_app, 15).until(
            EC.element_to_be_clickable((By.XPATH, "//nav[@id='sidebar-tabs']//a[@data-tab='items']"))
        )
        try:
            items_tab.click()
        except Exception:
            driver.execute_script("arguments[0].click();", items_tab)

        recipe_manager_button = WebDriverWait(driver, 15).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "button.mastercrafted-open-recipe-app"))
        )
        try:
            recipe_manager_button.click()
        except Exception:
            driver.execute_script("arguments[0].click();", recipe_manager_button)

        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "mastercrafted-recipeApp")))
        return driver.page_source
    finally:
        driver.quit()


def resolve_html_source(args, cache_dir: Path) -> tuple[str, str]:
    cache_html = cache_dir / "recipes_source.html"

    if args.input:
        in_path = Path(args.input)
        html = in_path.read_text(encoding="utf-8", errors="replace")
        return html, str(in_path)

    if not args.no_fetch:
        try:
            html = fetch_recipe_page_with_selenium(args.recipe_url)
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_html.write_text(html, encoding="utf-8")
            return html, args.recipe_url
        except Exception as exc:
            if cache_html.exists():
                print(f"Live fetch failed ({exc}); using cached HTML from {cache_html}")
                html = cache_html.read_text(encoding="utf-8", errors="replace")
                return html, str(cache_html)
            raise

    if cache_html.exists():
        html = cache_html.read_text(encoding="utf-8", errors="replace")
        return html, str(cache_html)

    raise FileNotFoundError("No recipe HTML source available. Run without --no-fetch or pass --input.")


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch+parse recipe HTML -> SQLite recipes tables")
    ap.add_argument("--input", "-i", default="", help="Optional local HTML source path (skips live fetch)")
    ap.add_argument("--recipe-url", default="http://173.29.198.65:30000/game", help="Game URL used for live fetch")
    ap.add_argument("--no-fetch", action="store_true", help="Do not fetch live HTML; use --input or cached .build_cache/recipes_source.html")
    ap.add_argument("--db", default=str(REPO_ROOT / "website" / "mmSite" / "data" / "mm.db"))
    ap.add_argument("--force", "-f", action="store_true", help="Rebuild even if source is unchanged")
    args = ap.parse_args()

    db_path = Path(args.db)

    cache_dir = REPO_ROOT / ".build_cache"
    hash_file = cache_dir / "recipes_source.sha256"

    html, source_label = resolve_html_source(args, cache_dir)

    current_hash = _sha256_text(html)
    if not args.force and hash_file.exists() and hash_file.read_text().strip() == current_hash:
        print(f"recipes data up to date, skipping (source: {source_label})")
        return 0

    soup = BeautifulSoup(html, "html.parser")

    books = extractBooks(soup)
    recipeDetails = extractRecipeDetails(soup)

    payload = {
        "last_updated": nowISO(),
        "books": [asdict(b) for b in books],
    }
    payload = mergeRecipeDetails(payload, recipeDetails)

    total = sum(len(b["recipes"]) for b in payload["books"])
    merged = sum(1 for b in payload["books"] for r in b["recipes"] if "ingredients" in r)
    print("Books:", len(payload["books"]))
    print("Total recipes:", total)
    print("Recipes with details merged:", merged)

    conn = get_connection(db_path)
    try:
        with conn:
            replace_recipes_payload(conn, payload, source_hash=current_hash)
    finally:
        conn.close()

    cache_dir.mkdir(parents=True, exist_ok=True)
    hash_file.write_text(current_hash)
    print(f"Wrote recipes to DB: {db_path} (source: {source_label})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
