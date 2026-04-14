from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = REPO_ROOT / "data_pipeline" / "data" / "mm.db"


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
                    "INSERT INTO item_recipe_links(item_id, recipe_id, is_primary) VALUES(?, ?, 1)",
                    (item_id, recipe_id),
                )

        for recipe_id in item.get("relatedRecipeIds") or []:
            if recipe_id:
                conn.execute(
                    "INSERT INTO item_recipe_links(item_id, recipe_id, is_primary) VALUES(?, ?, 0)",
                    (item_id, recipe_id),
                )

    if payload.get("last_updated"):
        set_meta(conn, "items_last_updated", str(payload["last_updated"]))
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


def replace_player_inventories_payload(conn: sqlite3.Connection, payload: dict[str, Any], fetched_at: str | None = None) -> None:
    init_schema(conn)
    conn.execute("DELETE FROM player_inventory_items")
    conn.execute("DELETE FROM players")

    for player in payload.get("players", []):
        sheet_id = (player.get("sheetId") or "").strip()
        if not sheet_id:
            continue
        conn.execute(
            "INSERT INTO players(sheet_id, name) VALUES(?, ?)",
            (sheet_id, player.get("name") or "Unknown"),
        )
        for item in player.get("items", []):
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
        set_meta(conn, "inventories_last_fetched", str(fetched_at))


def read_recipes_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    books: list[dict[str, Any]] = []
    for book_row in conn.execute("SELECT book_id, name, description FROM books ORDER BY name").fetchall():
        recipes: list[dict[str, Any]] = []
        for recipe_row in conn.execute(
            "SELECT * FROM recipes WHERE book_id = ? ORDER BY name",
            (book_row["book_id"],),
        ).fetchall():
            recipe_id = recipe_row["recipe_id"]
            requirements = [dict(r) for r in conn.execute(
                "SELECT skill, level FROM recipe_requirements WHERE recipe_id = ? ORDER BY position",
                (recipe_id,),
            ).fetchall()]
            ingredients = [dict(r) for r in conn.execute(
                "SELECT item_name AS item, qty, item_id AS itemId FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position",
                (recipe_id,),
            ).fetchall()]
            results = [dict(r) for r in conn.execute(
                "SELECT item_name AS item, qty, item_id AS itemId FROM recipe_results WHERE recipe_id = ? ORDER BY position",
                (recipe_id,),
            ).fetchall()]
            data = dict(recipe_row)
            data["tools"] = json.loads(data.pop("tools_json") or "[]")
            data["requirements"] = requirements
            data["ingredients"] = ingredients
            data["results"] = results
            recipes.append(data)
        books.append({
            "bookId": book_row["book_id"],
            "name": book_row["name"],
            "description": book_row["description"],
            "recipes": recipes,
        })
    return {
        "last_updated": get_meta(conn, "recipes_last_updated") or "",
        "books": books,
    }


def read_items_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    items: list[dict[str, Any]] = []
    for row in conn.execute("SELECT item_id, name, folder_path, description_text, image_path, category FROM items ORDER BY name").fetchall():
        recipe_ids = [r[0] for r in conn.execute(
            "SELECT recipe_id FROM item_recipe_links WHERE item_id = ? AND is_primary = 1 ORDER BY recipe_id",
            (row["item_id"],),
        ).fetchall()]
        related_recipe_ids = [r[0] for r in conn.execute(
            "SELECT recipe_id FROM item_recipe_links WHERE item_id = ? AND is_primary = 0 ORDER BY recipe_id",
            (row["item_id"],),
        ).fetchall()]
        items.append({
            "itemId": row["item_id"],
            "name": row["name"],
            "folderPath": row["folder_path"],
            "descriptionText": row["description_text"],
            "imagePath": row["image_path"],
            "category": row["category"],
            "recipeIds": recipe_ids,
            "relatedRecipeIds": related_recipe_ids,
        })
    return {
        "last_updated": get_meta(conn, "items_last_updated") or "",
        "items": items,
    }


def read_item_catalog_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    items: list[dict[str, Any]] = []
    for row in conn.execute("SELECT item_id, name, folder_path, description_text, image_path FROM item_catalog ORDER BY name").fetchall():
        items.append({
            "itemId": row["item_id"],
            "name": row["name"],
            "folderPath": row["folder_path"],
            "descriptionText": row["description_text"],
            "imagePath": row["image_path"],
        })
    return {"items": items}


def read_player_inventories_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    players: list[dict[str, Any]] = []
    for player_row in conn.execute("SELECT sheet_id, name FROM players ORDER BY name").fetchall():
        items = [dict(r) for r in conn.execute(
            "SELECT item_name AS name, qty, item_id AS itemId FROM player_inventory_items WHERE sheet_id = ? ORDER BY item_name",
            (player_row["sheet_id"],),
        ).fetchall()]
        players.append({
            "sheetId": player_row["sheet_id"],
            "name": player_row["name"],
            "items": items,
        })
    return {
        "last_updated": get_meta(conn, "inventories_last_updated") or "",
        "players": players,
    }
