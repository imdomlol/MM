import argparse
import json
import re
import os
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass, asdict, field
from bs4 import BeautifulSoup
from typing import Optional

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
    itemId: str = None #aka Item.data-uuid or dataEntryId
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
MINUTES_PATTERN = re.compile(r"(\d+)\s*minutes?", re.IGNORECASE)

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
        out.append(RecipeSkillRequirement(skill=skill.strip(), level=level))

    return out

def nowISO() -> str:
    # ISO string with timezone, e.g. 2026-01-06T17:30:00-08:00
    return datetime.now().astimezone().replace(microsecond=0).isoformat()

def writeJSON(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)

def extractBooks(soup) -> list[Book]:
    books: list[Book] = []
    book_nodes = soup.select("li.recipe-book.directory-item.level1[data-book-id]")

    for book in book_nodes:
        bookId = (book.get("data-book-id") or "").strip()
        if not bookId:
            continue
    
        # Extract book name
        bookNameRaw = (book.select_one("span.page-title") or book.select_one("span.recipe-name"))
        bookName = bookNameRaw.get_text(strip=True) if bookNameRaw else "Unknown Book"

        # Extract book description
        bookDescriptionRaw = book.select_one("p.recipe-description")
        bookDescription = bookDescriptionRaw.get_text(strip=True) if bookDescriptionRaw else ""

        # Extract recipes
        recipes: list[Item] = []
        recipe_nodes = book.select("ol.recipe-list > li.recipe.directory-item.level2[data-recipe-id]")

        for recipe in recipe_nodes:
            # Extract recipeId
            recipeId = (recipe.get("data-recipe-id") or "").strip()
            if not recipeId:
                continue

            # Extract recipe name
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
        # Extract item (name)
        itemRaw = (component.get("data-tooltip") or "").strip()
        item = re.sub(r"\s*\(x\d+\)\s*$", "", itemRaw).strip()

        # Extract itemId
        uuid = (component.get("data-uuid") or "").strip()
        itemId = uuid[5:] if uuid.startswith("Item.") else uuid or None
        
        # Extract quantity
        qtyElement = component.select_one("input.mastercrafted-component-amount")
        qty = int(qtyElement.get("value")) if qtyElement and qtyElement.get("value") else 1

        out.append(RecipeComponent(
            item=item,
            qty=qty,
            itemId=itemId,
        ))

    return out

def extractRecipeDetails(soup) -> dict[str, dict]:
    details: dict[str, dict] = {}

    blocks = soup.select(".mastercrafted-recipe[data-recipe-id]")
    for element in blocks:
        recipeId = (element.get("data-recipe-id") or "").strip()
        bookId = (element.get("data-book-id") or "").strip()
        if not recipeId:
            continue
        
        # Extract name
        nameRaw = element.select_one("header h1")
        name = nameRaw.get_text(strip=True) if nameRaw else "Unknown Recipe"

        detailHeaders = element.select("header p")
        lastIndex = len(detailHeaders) - 1

        # Extract crafting time
        craftingTimeText = detailHeaders[lastIndex - 1].select_one("span.tool")
        if craftingTimeText:
            craftingTimeMinutes = parseCraftTime(craftingTimeText.get_text(strip=True))

        # Extract tools
        tools = []
        if (lastIndex - 2 >= 0):
            toolsText = detailHeaders[0].select_one("span.tool")
            if toolsText:
                toolRaw = toolsText.get_text(strip=True)
                tools = [t.strip() for t in re.split(r",| and ", toolRaw) if t.strip()]

        # Extract requirements and text
        requirementsText = detailHeaders[lastIndex].get_text(strip=True)
        requirements = parseSkillRequirements(requirementsText)

        # Extract ingredients and results
        ingredientsContainer = element.select_one(".mastercrafted-ingredients")
        resultsContainer = element.select_one(".mastercrafted-results")

        ingredients = extractComponents(ingredientsContainer) if ingredientsContainer else []
        results = extractComponents(resultsContainer) if resultsContainer else []

        # Determine itemId
        itemId = None
        for result in results:
            if (result.item == name):
                itemId = result.itemId
                break
        
        if itemId is None:
            for ingredient in ingredients:
                if (ingredient.item == name):
                    itemId = ingredient.itemId
                    break
        
        if itemId is None:
            itemId = ""
            print(f"Warning: Could not determine itemId for recipe '{name}'.")

        # Store details
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
            "results": [asdict(r) for r in results]
        }

    return details

def mergeRecipeDetails(payload: dict, detailsByRecipeId: dict[str, dict]) -> dict:
    for book in payload.get("books", []):
        for recipe in book.get("recipes", []):
            recipeId = recipe.get("recipeId")
            if recipeId in detailsByRecipeId:
                detail = detailsByRecipeId[recipeId]
                recipe.update(detail)
    return payload

def main() -> int:
    ap = argparse.ArgumentParser(description="Parse reciperaw.html -> recipes.json (books + recipe items)")
    ap.add_argument("--input", "-i", default="./M&M/Scrape/reciperaw.html")
    ap.add_argument("--output", "-o", default="./M&M/website/mmsite/data/recipes.json")
    args = ap.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)

    html = in_path.read_text(encoding="utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")

    books = extractBooks(soup)
    recipeDetails = extractRecipeDetails(soup)

    payload = {
        "last_updated": nowISO(),
        "books": [asdict(b) for b in books],
    }

    payload = mergeRecipeDetails(payload, recipeDetails)

    total = sum(len(b["recipes"]) for b in payload["books"])
    merged = sum(
        1 for b in payload["books"] for r in b["recipes"]
        if "ingredients" in r
    )
    print("Books:", len(payload["books"]))
    print("Total recipes:", total)
    print("Recipes with details merged:", merged)

    writeJSON(out_path, payload)
    print(f"Wrote: {out_path}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
