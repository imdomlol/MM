import json
import os
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

def colLetter(num: int) -> str:
    """Convert column number to letter(s) (e.g., 1 -> A, 27 -> AA)."""
    result = ""
    while num > 0:
        num -= 1
        result = chr(65 + (num % 26)) + result
        num //= 26
    return result

def main():
    # Load credentials
    credsPath = os.path.expanduser(r"MM\Misc\mythmagic-crafter-2d97b8de3a95.json")
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
        
        # Define initial data range
        startCol = 21  # Column U
        rowStart, rowEnd = 18, 63
        endCol = 100
        invRange = f"{colLetter(startCol)}{rowStart}:{colLetter(endCol)}{rowEnd}"
        
        # Fetch data
        data = worksheet.get(invRange)
        
        # Compute maxCols
        maxCols = max(len(row) for row in data) if data else 0

        if maxCols > endCol - startCol + 1:
            endCol = startCol + maxCols - 1
            invRange = f"{colLetter(startCol)}{rowStart}:{colLetter(endCol)}{rowEnd}"
            data = worksheet.get(invRange)
        
        playerName = worksheet.get("B3")
        
        # Process data: remove empty cells and headers, parse qty+name pairs
        items = []
        for row in data:
            row = [cell for cell in row if cell]
            if not row or (len(row) == 1 and row[0] in ITEM_HEADERS):
                continue
            
            for i in range(0, len(row) - 1, 2):
                try:
                    qty = int(row[i])
                    itemName = row[i + 1]
                    items.append({"name": itemName, "qty": qty, "itemId": None})
                except (ValueError, IndexError):
                    continue
        
        players.append({"sheetId": sheetId, "name": playerName[0][0] if playerName else "Unknown", "items": items})
    
    # Add itemIds from items.json
    try:
        with open(r"MM\website\mmSite\data\items.json", "r", encoding="utf-8") as f:
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
    with open(r"MM\website\mmSite\data\playerInventories.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=4, ensure_ascii=False)
    
    print(f"Wrote {sum(len(player['items']) for player in players)} items to playerInventories.json")

if __name__ == "__main__":
    main()