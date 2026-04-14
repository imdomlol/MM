import argparse
import json
import os
from pathlib import Path
from datetime import datetime, timezone
import gspread
from google.oauth2.service_account import Credentials

# Constants for item headers
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
    "Prof./Misc"
}

SHEET_IDS = {
    "1bD0ovpK7hnwsIQVd1dnSStzWI6dIgQhH82MWnvITKzQ",
    "12c7YrYJY9_sVO_hW85xFSWBkLF1CI51goHHMjTc2xL0",
    "1v6vxHUNjPKW3XJDm0GVLtqF7cPSA_Kod7-7Li0DOHKU",
    "1Rk9iYlQy8qgaV_JNPgyaynb8ZpJwZkh-KALU280zYiQ"
}

REPO_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = REPO_ROOT / "website" / "mmSite" / "data"
CREDS_DIR = REPO_ROOT / "Misc"

def colLetter(num: int) -> str:
    """Convert column number to letter(s) (e.g., 1 -> A, 27 -> AA)."""
    result = ""
    while num > 0:
        num -= 1
        result = chr(65 + (num % 26)) + result
        num //= 26
    return result

def main():
    ap = argparse.ArgumentParser(description="Sync player inventories from Google Sheets")
    ap.add_argument("--force", "-f", action="store_true", help="Refetch even if cache is fresh")
    ap.add_argument("--max-age", type=int, default=10, metavar="MINUTES",
                    help="Use cached data if last fetch was within this many minutes (default: 10)")
    args = ap.parse_args()

    cache_dir = REPO_ROOT / ".build_cache"
    cache_file = cache_dir / "inventories_cache.json"
    out_file = DATA_DIR / "playerInventories.json"

    if not args.force and cache_file.exists():
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            fetched_at = datetime.fromisoformat(cached["fetched_at"])
            age_minutes = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 60
            if age_minutes < args.max_age:
                out_file.write_text(
                    json.dumps(cached["data"], indent=4, ensure_ascii=False),
                    encoding="utf-8",
                )
                print(f"Inventories up to date (cached {age_minutes:.1f}m ago), skipping")
                return
        except Exception:
            pass  # Corrupt or missing cache — fall through to a real fetch

    # Load credentials
    credsMatches = sorted(CREDS_DIR.glob("mythmagic-crafter-*.json"))
    if not credsMatches:
        raise FileNotFoundError(f"No service account JSON found in {CREDS_DIR}")

    credsPath = credsMatches[0]
    creds = Credentials.from_service_account_file(
        credsPath,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    
    # Authorize and open spreadsheet
    gc = gspread.authorize(creds)

    players = []
    for sheetId in SHEET_IDS:
        sheet = gc.open_by_key(sheetId)
        worksheet = sheet.sheet1
        
        # Define data range — use a generous endCol so the sheet can expand freely
        # without requiring a second fetch. Empty columns cost nothing.
        startCol = 21  # Column U
        rowStart, rowEnd = 18, 63
        endCol = 300
        invRange = f"{colLetter(startCol)}{rowStart}:{colLetter(endCol)}{rowEnd}"

        # Fetch data
        data = worksheet.get(invRange)
        expected_width = endCol - startCol + 1

        # gspread can trim trailing empty cells, which hides later 5-column
        # inventory groups on sparse rows. Pad rows to the requested width so
        # every group can be evaluated consistently.
        for row in data:
            if len(row) < expected_width:
                row.extend([""] * (expected_width - len(row)))

        playerName = worksheet.get("B3")

        # Detect whether inventory groups repeat every 5 or 6 columns. Some sheets
        # include a separator column between groups, which shifts the stride to 6.
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

        # Process data: each inventory entry stores qty at offset 0 and name at
        # offset 2 inside each repeating column group.
        items_map = {}  # name -> qty, used to merge duplicate entries
        for row in data:
            for i in range(0, expected_width - 2, group_stride):
                qty_cell = (row[i] or "").strip()
                name_cell = (row[i + 2] or "").strip()

                # Skip empty pairs
                if not qty_cell or not name_cell:
                    continue

                # Skip section header labels
                if name_cell in ITEM_HEADERS or qty_cell in ITEM_HEADERS:
                    continue

                # qty must be a valid integer
                try:
                    qty = int(qty_cell)
                except ValueError:
                    continue

                # name must not be purely numeric — guards against stray numbers
                # landing in the name column
                try:
                    int(name_cell)
                    continue  # it's a number, not an item name
                except ValueError:
                    pass

                items_map[name_cell] = items_map.get(name_cell, 0) + qty

        items = [{"name": name, "qty": qty, "itemId": None} for name, qty in items_map.items()]

        players.append({"sheetId": sheetId, "name": playerName[0][0] if playerName else "Unknown", "items": items})
    
    # Add itemIds from items.json
    try:
        with open(DATA_DIR / "items.json", "r", encoding="utf-8") as f:
            itemsData = json.load(f)
        itemsMap = {item['name'].lower(): item['itemId'] for item in itemsData.get('items', [])}
        for player in players:
            for item in player['items']:
                matchedId = itemsMap.get(item['name'].lower())
                if matchedId:
                    item['itemId'] = matchedId
    except Exception as e:
        print(f"Error enriching inventories with itemIds: {e}")
    
    # Prepare output
    output = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "players": players,
    }

    # Write to file
    out_file.write_text(json.dumps(output, indent=4, ensure_ascii=False), encoding="utf-8")

    # Update cache
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(
        json.dumps({"fetched_at": datetime.now(timezone.utc).isoformat(), "data": output},
                   ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Wrote {sum(len(player['items']) for player in players)} items to playerInventories.json")

if __name__ == "__main__":
    main()