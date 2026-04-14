from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent
DEFAULT_DB_PATH = REPO_ROOT / "website" / "mmSite" / "data" / "mm.db"


def get_connection(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path else DEFAULT_DB_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS books (
            book_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS recipes (
            recipe_id TEXT PRIMARY KEY,
            book_id TEXT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            item_id TEXT,
            tools_json TEXT NOT NULL DEFAULT '[]',
            crafting_time_minutes INTEGER,
            requirements_text TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS recipe_requirements (
            recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            skill TEXT NOT NULL,
            level INTEGER,
            PRIMARY KEY (recipe_id, position)
        );

        CREATE TABLE IF NOT EXISTS recipe_ingredients (
            recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            qty REAL NOT NULL,
            item_id TEXT,
            PRIMARY KEY (recipe_id, position)
        );

        CREATE TABLE IF NOT EXISTS recipe_results (
            recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            qty REAL NOT NULL,
            item_id TEXT,
            PRIMARY KEY (recipe_id, position)
        );

        CREATE TABLE IF NOT EXISTS items (
            item_id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS item_recipe_links (
            item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
            recipe_id TEXT NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
            is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
            PRIMARY KEY (item_id, recipe_id, is_primary)
        );

        CREATE TABLE IF NOT EXISTS item_catalog (
            item_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            folder_path TEXT DEFAULT '',
            description_text TEXT DEFAULT '',
            image_path TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS players (
            sheet_id TEXT PRIMARY KEY,
            name TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS player_inventory_items (
            sheet_id TEXT NOT NULL REFERENCES players(sheet_id) ON DELETE CASCADE,
            item_name TEXT NOT NULL,
            qty INTEGER NOT NULL,
            item_id TEXT,
            PRIMARY KEY (sheet_id, item_name)
        );

        CREATE INDEX IF NOT EXISTS idx_recipes_book ON recipes(book_id);
        CREATE INDEX IF NOT EXISTS idx_item_links_item ON item_recipe_links(item_id);
        CREATE INDEX IF NOT EXISTS idx_item_links_recipe ON item_recipe_links(recipe_id);
        CREATE INDEX IF NOT EXISTS idx_inventory_sheet ON player_inventory_items(sheet_id);
        """
    )

    existing_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(items)").fetchall()
    }
    if "folder_path" not in existing_columns:
        conn.execute("ALTER TABLE items ADD COLUMN folder_path TEXT DEFAULT ''")
    if "description_text" not in existing_columns:
        conn.execute("ALTER TABLE items ADD COLUMN description_text TEXT DEFAULT ''")
    if "image_path" not in existing_columns:
        conn.execute("ALTER TABLE items ADD COLUMN image_path TEXT DEFAULT ''")
    if "category" not in existing_columns:
        conn.execute("ALTER TABLE items ADD COLUMN category TEXT DEFAULT ''")

    # attributes_text is deprecated and should be removed where SQLite supports DROP COLUMN.
    item_catalog_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(item_catalog)").fetchall()
    }
    if "attributes_text" in existing_columns:
        try:
            conn.execute("ALTER TABLE items DROP COLUMN attributes_text")
        except sqlite3.OperationalError:
            pass
    if "attributes_text" in item_catalog_columns:
        try:
            conn.execute("ALTER TABLE item_catalog DROP COLUMN attributes_text")
        except sqlite3.OperationalError:
            pass


def set_meta(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO metadata(key, value)
        VALUES(?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )


def get_meta(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM metadata WHERE key = ?", (key,)).fetchone()
    return row[0] if row else None


def replace_recipes_payload(conn: sqlite3.Connection, payload: dict[str, Any], source_hash: str | None = None) -> None:
    init_schema(conn)
    conn.execute("DELETE FROM recipe_requirements")
    conn.execute("DELETE FROM recipe_ingredients")
    conn.execute("DELETE FROM recipe_results")
    conn.execute("DELETE FROM recipes")
    conn.execute("DELETE FROM books")

    for book in payload.get("books", []):
        book_id = (book.get("bookId") or "").strip()
        if not book_id:
            continue
        conn.execute(
            "INSERT INTO books(book_id, name, description) VALUES(?, ?, ?)",
            (book_id, book.get("name") or "Unknown Book", book.get("description") or ""),
        )

        for recipe in book.get("recipes", []):
            recipe_id = (recipe.get("recipeId") or "").strip()
            if not recipe_id:
                continue

            conn.execute(
                """
                INSERT INTO recipes(recipe_id, book_id, name, item_id, tools_json, crafting_time_minutes, requirements_text)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    recipe_id,
                    book_id,
                    recipe.get("name") or "Unknown Recipe",
                    recipe.get("itemId"),
                    json.dumps(recipe.get("tools") or [], ensure_ascii=False),
                    recipe.get("craftingTimeMinutes"),
                    recipe.get("requirementsText") or "",
                ),
            )

            for idx, req in enumerate(recipe.get("requirements") or []):
                conn.execute(
                    """
                    INSERT INTO recipe_requirements(recipe_id, position, skill, level)
                    VALUES(?, ?, ?, ?)
                    """,
                    (recipe_id, idx, req.get("skill") or "", req.get("level")),
                )

            for idx, ing in enumerate(recipe.get("ingredients") or []):
                conn.execute(
                    """
                    INSERT INTO recipe_ingredients(recipe_id, position, item_name, qty, item_id)
                    VALUES(?, ?, ?, ?, ?)
                    """,
                    (
                        recipe_id,
                        idx,
                        ing.get("item") or "",
                        ing.get("qty") or 0,
                        ing.get("itemId"),
                    ),
                )

            for idx, result in enumerate(recipe.get("results") or []):
                conn.execute(
                    """
                    INSERT INTO recipe_results(recipe_id, position, item_name, qty, item_id)
                    VALUES(?, ?, ?, ?, ?)
                    """,
                    (
                        recipe_id,
                        idx,
                        result.get("item") or "",
                        result.get("qty") or 0,
                        result.get("itemId"),
                    ),
                )

    if payload.get("last_updated"):
        set_meta(conn, "recipes_last_updated", str(payload["last_updated"]))
    if source_hash:
        set_meta(conn, "recipes_source_hash", source_hash)


def replace_items_payload(conn: sqlite3.Connection, payload: dict[str, Any], source_hash: str | None = None) -> None:
    init_schema(conn)
    conn.execute("DELETE FROM item_recipe_links")
    conn.execute("DELETE FROM items")

    for item in payload.get("items", []):
        item_id = item.get("itemId")
        if not item_id:
            continue
        conn.execute(
            """
            INSERT INTO items(item_id, name, folder_path, description_text, image_path, category)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                item.get("name") or "",
                item.get("folderPath") or "",
                item.get("descriptionText") or "",
                item.get("imagePath") or "",
                item.get("category") or "",
            ),
        )

        for recipe_id in item.get("recipeIds") or []:
            if recipe_id:
                conn.execute(
                    "INSERT OR IGNORE INTO item_recipe_links(item_id, recipe_id, is_primary) VALUES(?, ?, 1)",
                    (item_id, recipe_id),
                )

        for recipe_id in item.get("relatedRecipeIds") or []:
            if recipe_id:
                conn.execute(
                    "INSERT OR IGNORE INTO item_recipe_links(item_id, recipe_id, is_primary) VALUES(?, ?, 0)",
                    (item_id, recipe_id),
                )

    if source_hash:
        set_meta(conn, "items_source_hash", source_hash)


def replace_item_catalog_payload(conn: sqlite3.Connection, payload: dict[str, Any], source_hash: str | None = None) -> None:
    init_schema(conn)
    conn.execute("DELETE FROM item_catalog")

    for item in payload.get("items", []):
        item_id = item.get("itemId")
        if not item_id:
            continue

        conn.execute(
            """
            INSERT INTO item_catalog(item_id, name, folder_path, description_text, image_path)
            VALUES(?, ?, ?, ?, ?)
            """,
            (
                item_id,
                item.get("name") or "",
                item.get("folderPath") or "",
                item.get("descriptionText") or "",
                item.get("imagePath") or "",
            ),
        )

    if source_hash:
        set_meta(conn, "item_catalog_source_hash", source_hash)


def read_item_catalog_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    rows = conn.execute(
        """
        SELECT item_id, name, folder_path, description_text, image_path
        FROM item_catalog
        ORDER BY name
        """
    ).fetchall()

    items = []
    for row in rows:
        items.append(
            {
                "itemId": row["item_id"],
                "name": row["name"],
                "folderPath": row["folder_path"] or "",
                "descriptionText": row["description_text"] or "",
                "imagePath": row["image_path"] or "",
            }
        )

    return {"items": items}


def replace_player_inventories_payload(conn: sqlite3.Connection, payload: dict[str, Any], fetched_at: str | None = None) -> None:
    init_schema(conn)
    conn.execute("DELETE FROM player_inventory_items")
    conn.execute("DELETE FROM players")

    for player in payload.get("players", []):
        sheet_id = player.get("sheetId") or ""
        if not sheet_id:
            continue
        conn.execute(
            "INSERT INTO players(sheet_id, name) VALUES(?, ?)",
            (sheet_id, player.get("name") or "Unknown"),
        )

        for item in player.get("items") or []:
            conn.execute(
                """
                INSERT INTO player_inventory_items(sheet_id, item_name, qty, item_id)
                VALUES(?, ?, ?, ?)
                """,
                (
                    sheet_id,
                    item.get("name") or "",
                    int(item.get("qty") or 0),
                    item.get("itemId"),
                ),
            )

    if payload.get("last_updated"):
        set_meta(conn, "inventories_last_updated", str(payload["last_updated"]))
    if fetched_at:
        set_meta(conn, "inventories_fetched_at", fetched_at)


def read_recipes_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    rows = conn.execute(
        """
        SELECT r.recipe_id, r.book_id, b.name AS book_name, b.description, r.name, r.item_id,
               r.tools_json, r.crafting_time_minutes, r.requirements_text
        FROM recipes r
        JOIN books b ON b.book_id = r.book_id
        ORDER BY b.name, r.name
        """
    ).fetchall()

    requirements = conn.execute(
        "SELECT recipe_id, position, skill, level FROM recipe_requirements ORDER BY recipe_id, position"
    ).fetchall()
    ingredients = conn.execute(
        "SELECT recipe_id, position, item_name, qty, item_id FROM recipe_ingredients ORDER BY recipe_id, position"
    ).fetchall()
    results = conn.execute(
        "SELECT recipe_id, position, item_name, qty, item_id FROM recipe_results ORDER BY recipe_id, position"
    ).fetchall()

    req_map: dict[str, list[dict[str, Any]]] = {}
    for req in requirements:
        req_map.setdefault(req["recipe_id"], []).append({"skill": req["skill"], "level": req["level"]})

    ing_map: dict[str, list[dict[str, Any]]] = {}
    for ing in ingredients:
        ing_map.setdefault(ing["recipe_id"], []).append(
            {"item": ing["item_name"], "qty": ing["qty"], "itemId": ing["item_id"]}
        )

    res_map: dict[str, list[dict[str, Any]]] = {}
    for result in results:
        res_map.setdefault(result["recipe_id"], []).append(
            {"item": result["item_name"], "qty": result["qty"], "itemId": result["item_id"]}
        )

    books: dict[str, dict[str, Any]] = {}
    for row in rows:
        book_id = row["book_id"]
        if book_id not in books:
            books[book_id] = {
                "bookId": book_id,
                "name": row["book_name"],
                "description": row["description"] or "",
                "recipes": [],
            }
        tools = []
        try:
            tools = json.loads(row["tools_json"] or "[]")
        except json.JSONDecodeError:
            tools = []
        books[book_id]["recipes"].append(
            {
                "name": row["name"],
                "itemId": row["item_id"],
                "recipeId": row["recipe_id"],
                "bookId": row["book_id"],
                "tools": tools,
                "craftingTimeMinutes": row["crafting_time_minutes"],
                "requirementsText": row["requirements_text"] or "",
                "requirements": req_map.get(row["recipe_id"], []),
                "ingredients": ing_map.get(row["recipe_id"], []),
                "results": res_map.get(row["recipe_id"], []),
            }
        )

    return {
        "last_updated": get_meta(conn, "recipes_last_updated"),
        "books": list(books.values()),
    }


def read_items_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    rows = conn.execute(
        """
        SELECT item_id, name, folder_path, description_text, image_path, category
        FROM items
        ORDER BY name
        """
    ).fetchall()
    link_rows = conn.execute(
        "SELECT item_id, recipe_id, is_primary FROM item_recipe_links ORDER BY item_id, recipe_id"
    ).fetchall()

    links: dict[str, dict[str, list[str]]] = {}
    for lr in link_rows:
        bucket = links.setdefault(lr["item_id"], {"primary": [], "related": []})
        if lr["is_primary"] == 1:
            bucket["primary"].append(lr["recipe_id"])
        else:
            bucket["related"].append(lr["recipe_id"])

    items = []
    for row in rows:
        item_id = row["item_id"]
        item_links = links.get(item_id, {"primary": [], "related": []})
        items.append(
            {
                "name": row["name"],
                "itemId": item_id,
                "folderPath": row["folder_path"] or "",
                "descriptionText": row["description_text"] or "",
                "imagePath": row["image_path"] or "",
                "category": row["category"] or "",
                "recipeIds": item_links["primary"],
                "relatedRecipeIds": item_links["related"],
            }
        )

    return {"items": items}


def read_player_inventories_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    players = conn.execute("SELECT sheet_id, name FROM players ORDER BY name").fetchall()
    rows = conn.execute(
        "SELECT sheet_id, item_name, qty, item_id FROM player_inventory_items ORDER BY sheet_id, item_name"
    ).fetchall()

    items_by_sheet: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        items_by_sheet.setdefault(row["sheet_id"], []).append(
            {
                "name": row["item_name"],
                "qty": row["qty"],
                "itemId": row["item_id"],
            }
        )

    output_players = []
    for player in players:
        output_players.append(
            {
                "sheetId": player["sheet_id"],
                "name": player["name"],
                "items": items_by_sheet.get(player["sheet_id"], []),
            }
        )

    return {
        "last_updated": get_meta(conn, "inventories_last_updated"),
        "players": output_players,
    }
