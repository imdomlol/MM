import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mmdb import get_connection, read_items_payload, read_player_inventories_payload, replace_player_inventories_payload


ITEM_HEADERS = {
    "Jewelcrafting Materials",
    "Random Materials",
    "Unique Items",
    "PROFESSION INVENTORY",
    "GEM INVENTORY",
    "JEWEL INVENTORY",
    "RAW MATS",
    "RAW",
    "REFINED",
    "REFINED MATS",
    "Prof./Misc",
}

SHEET_IDS = {
    "1bD0ovpK7hnwsIQVd1dnSStzWI6dIgQhH82MWnvITKzQ",
    "12c7YrYJY9_sVO_hW85xFSWBkLF1CI51goHHMjTc2xL0",
    "1v6vxHUNjPKW3XJDm0GVLtqF7cPSA_Kod7-7Li0DOHKU",
    "1Rk9iYlQy8qgaV_JNPgyaynb8ZpJwZkh-KALU280zYiQ",
}

CREDS_DIR = REPO_ROOT / "Misc"


def col_letter(num: int) -> str:
    result = ""
    while num > 0:
        num -= 1
        result = chr(65 + (num % 26)) + result
        num //= 26
    return result


def write_payload_to_db(db_path: Path, output: dict, fetched_at: str | None = None) -> None:
    conn = get_connection(db_path)
    try:
        with conn:
            replace_player_inventories_payload(conn, output, fetched_at=fetched_at)
    finally:
        conn.close()


def enrich_item_ids(players: list[dict], db_path: Path) -> None:
    conn = get_connection(db_path)
    try:
        items_data = read_items_payload(conn)
    finally:
        conn.close()

    items_map = {item["name"].lower(): item["itemId"] for item in items_data.get("items", [])}
    for player in players:
        for item in player["items"]:
            matched_id = items_map.get(item["name"].lower())
            if matched_id:
                item["itemId"] = matched_id


def main() -> int:
    ap = argparse.ArgumentParser(description="Sync player inventories from Google Sheets into SQLite")
    ap.add_argument("--db", default=str(REPO_ROOT / "website" / "mmSite" / "data" / "mm.db"))
    ap.add_argument("--force", "-f", action="store_true", help="Refetch even if cache is fresh")
    ap.add_argument("--sheet-id", default="", help="Refresh a single player sheet by sheet ID")
    ap.add_argument("--player-name", default="", help="Optional selected player name for logs")
    ap.add_argument(
        "--max-age",
        type=int,
        default=10,
        metavar="MINUTES",
        help="Use cached data if last fetch was within this many minutes (default: 10)",
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    requested_sheet_id = str(args.sheet_id or "").strip()
    requested_player_name = str(args.player_name or "").strip()
    cache_dir = REPO_ROOT / ".build_cache"
    cache_file = cache_dir / "inventories_cache.json"

    if not args.force and cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            fetched_at = datetime.fromisoformat(cached["fetched_at"])
            age_minutes = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 60
            if age_minutes < args.max_age:
                write_payload_to_db(db_path, cached["data"], fetched_at=cached["fetched_at"])
                print(f"Inventories up to date (cached {age_minutes:.1f}m ago), skipping")
                return 0
        except Exception:
            pass

    creds_matches = sorted(CREDS_DIR.glob("mythmagic-crafter-*.json"))
    if not creds_matches:
        raise FileNotFoundError(f"No service account JSON found in {CREDS_DIR}")

    creds_path = creds_matches[0]
    creds = Credentials.from_service_account_file(
        creds_path,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )

    gc = gspread.authorize(creds)

    target_sheet_ids = [requested_sheet_id] if requested_sheet_id else sorted(SHEET_IDS)

    players = []
    for sheet_id in target_sheet_ids:
        sheet = gc.open_by_key(sheet_id)
        worksheet = sheet.sheet1

        start_col = 21
        row_start, row_end = 18, 63
        end_col = 300
        inv_range = f"{col_letter(start_col)}{row_start}:{col_letter(end_col)}{row_end}"

        data = worksheet.get(inv_range)
        expected_width = end_col - start_col + 1

        for row in data:
            if len(row) < expected_width:
                row.extend([""] * (expected_width - len(row)))

        player_name = worksheet.get("B3")

        def parseable_pairs_count(stride: int) -> int:
            count = 0
            for row in data:
                for i in range(0, expected_width - 2, stride):
                    qty_cell = (row[i] or "").strip()
                    name_cell = (row[i + 2] or "").strip()
                    if not qty_cell or not name_cell:
                        continue
                    if name_cell in ITEM_HEADERS or qty_cell in ITEM_HEADERS:
                        continue
                    try:
                        int(qty_cell)
                    except ValueError:
                        continue
                    try:
                        int(name_cell)
                        continue
                    except ValueError:
                        pass
                    count += 1
            return count

        group_stride = 6 if parseable_pairs_count(6) >= parseable_pairs_count(5) else 5

        items_map = {}
        for row in data:
            for i in range(0, expected_width - 2, group_stride):
                qty_cell = (row[i] or "").strip()
                name_cell = (row[i + 2] or "").strip()

                if not qty_cell or not name_cell:
                    continue
                if name_cell in ITEM_HEADERS or qty_cell in ITEM_HEADERS:
                    continue

                try:
                    qty = int(qty_cell)
                except ValueError:
                    continue

                try:
                    int(name_cell)
                    continue
                except ValueError:
                    pass

                items_map[name_cell] = items_map.get(name_cell, 0) + qty

        items = [{"name": name, "qty": qty, "itemId": None} for name, qty in items_map.items()]

        players.append(
            {
                "sheetId": sheet_id,
                "name": player_name[0][0] if player_name else "Unknown",
                "items": items,
            }
        )

    enrich_item_ids(players, db_path)

    output_players = players
    if requested_sheet_id:
        conn = get_connection(db_path)
        try:
            existing_payload = read_player_inventories_payload(conn)
        finally:
            conn.close()

        existing_players = existing_payload.get("players", []) if isinstance(existing_payload, dict) else []
        merged_players_by_sheet = {
            str(player.get("sheetId") or ""): player
            for player in existing_players
            if str(player.get("sheetId") or "")
        }
        for refreshed_player in players:
            refreshed_sheet_id = str(refreshed_player.get("sheetId") or "")
            if refreshed_sheet_id:
                merged_players_by_sheet[refreshed_sheet_id] = refreshed_player
        output_players = list(merged_players_by_sheet.values())

    output = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "players": output_players,
    }

    fetched_at = datetime.now(timezone.utc).isoformat()
    write_payload_to_db(db_path, output, fetched_at=fetched_at)

    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(
        json.dumps({"fetched_at": fetched_at, "data": output}, ensure_ascii=False),
        encoding="utf-8",
    )

    total_item_count = sum(len(player.get("items", [])) for player in output_players)
    if requested_sheet_id:
        player_label = requested_player_name or next(
            (player.get("name") for player in players if player.get("sheetId") == requested_sheet_id),
            "selected player",
        )
        print(
            f"Refreshed inventory for {player_label} ({requested_sheet_id}); wrote {total_item_count} total items to SQLite inventories"
        )
    else:
        print(f"Wrote {total_item_count} items to SQLite inventories")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
