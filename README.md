# Myth & Magic Helper (MM)

This repository contains a small web app and data scripts for browsing Myth & Magic recipes, item links, and player inventories.

## What This Project Includes

- Static website under `website/mmSite` with pages for:
  - Recipe hub and recipe detail lookups
  - Inventory hub
  - Craft hub
- Data JSON files used by the site:
  - `recipes.json`
  - `items.json`
  - `playerInventories.json`
- Python scripts to build or enrich those data files from source content.

## Project Structure

```text
MM/
  Misc/
    mythmagic-crafter-<id>.json      # local Google service account credentials (ignored)
  Scrape/
    reciperaw.html                    # source HTML for recipe parsing
  website/
    mmSite/
      index.html
      recipes.html
      recipe.html
      inventories.html
      craft.html
      assets/
        app.js
        app.css
        craft.js
        rightClickMenu.js
      data/
        recipes.json
        items.json
        playerInventories.json
        scripts/
          buildRecipesJSON.py
          buildItemsJSON.py
          buildPlayerInventoriesJSON.py
      partials/
        header.html
```

## Local Website Run

You can run the site with any static file server from the repo root.

### Option 1: Python

```powershell
cd website/mmSite
python -m http.server 8080
```

Then open:

- `http://localhost:8080`

### Option 2: VS Code Live Server

Open `website/mmSite/index.html` and start Live Server.

## Python Data Scripts

Install dependencies:

```powershell
python -m pip install -r requirements.txt
```

### 1) Build recipes JSON from scraped HTML

Script: `website/mmSite/data/scripts/buildRecipesJSON.py`

```powershell
python website/mmSite/data/scripts/buildRecipesJSON.py --input Scrape/reciperaw.html --output website/mmSite/data/recipes.json
```

### 2) Build items JSON from recipes JSON

Script: `website/mmSite/data/scripts/buildItemsJSON.py`

Run:

```powershell
python website/mmSite/data/scripts/buildItemsJSON.py
```

The script now resolves paths from the repo root, so it works from any machine as long as the repo layout stays the same.

### 3) Build player inventories JSON from Google Sheets

Script: `website/mmSite/data/scripts/buildPlayerInventoriesJSON.py`

Requirements:

- A Google service account JSON key in `Misc/` named like `mythmagic-crafter-<id>.json`
- Access granted to target Sheets for that service account

Run:

```powershell
python website/mmSite/data/scripts/buildPlayerInventoriesJSON.py
```

The script automatically looks for the local service account file in `Misc/` with the `mythmagic-crafter-*.json` pattern.

## Security Notes

- Credential files like `Misc/mythmagic-crafter-*.json` should remain local only.
- `.gitignore` is configured to ignore those secret files and common env/key artifacts.
- If secrets were ever committed previously, rotate them and consider cleaning git history.

## Troubleshooting

- `FileNotFoundError` in data scripts:
  - Confirm `Scrape/reciperaw.html` and `website/mmSite/data/recipes.json` exist for the recipe/item builders.
  - Confirm the service account JSON exists under `Misc/` for the inventory builder.
- Google Sheets auth errors:
  - Verify the credential JSON path and file name.
  - Confirm spreadsheet sharing permissions for the service account email.

## Next Improvements (Optional)

- Refactor all script paths to be repo-relative.
- Add an npm-based dev server with a one-command start workflow.
