# Myth & Magic Helper (MM)

A web-based companion tool for Myth & Magic that provides comprehensive recipe browsing, item lookup, and player inventory management.

## Overview

Myth & Magic Helper is a single-page web application designed to enhance the Myth & Magic gaming experience. It serves as a central hub for players to explore crafting recipes, trace item relationships, and track player inventories. The tool now uses a static website frontend backed by a local SQLite database and Flask API, enabling fast lookups and intuitive navigation across game content.

## What It Does

**Recipe Discovery & Browsing**
- Browse a complete hub of all available crafting recipes
- View detailed recipe information with item requirements and outputs
- Search and filter recipes by name and ingredients

**Item Intelligence**
- Cross-reference items across recipes
- Understand item relationships and dependencies
- Link items to their crafting recipes and uses

**Inventory Tracking**
- Centralized view of player inventories
- Track items across multiple player accounts
- Monitor available resources for crafting

**Smart Crafting**
- Craft hub for planning multi-step crafting sequences
- Recursive crafting calculations to determine total requirements
- Right-click context menus for quick recipe lookups
- Theme support for comfortable browsing

## Data Pipeline

Core data is stored in `data_pipeline/data/mm.db`.

Pipeline code now lives in `data_pipeline/`:
- `data_pipeline/mmdb.py` — SQLite schema helpers and payload readers/writers.
- `data_pipeline/selenium_utils.py` — shared Selenium login/navigation/fetch.
- `data_pipeline/recipe_scrapers/game_recipes_scraper.py` — fetch, parse, validate, and persist recipes.
- `data_pipeline/builders/items_builder.py` — build item index from recipes payload.
- `data_pipeline/builders/player_inventories_builder.py` — sync inventories from Sheets.
- `data_pipeline/cli_entrypoints/` — script entrypoints used by `build.py` and `server.py`.

The actual top-level runners now live in `scripts/`.

From the repository root, build or refresh all core data tables:

```bash
python -m scripts.build
```

If you need to avoid live recipe fetch for a run, use:

```bash
python -m scripts.build --skip-fetch
```

Note: `--skip-fetch` requires either a previously cached source at `.build_cache/recipes_source.html` or a direct `--input` path passed to the recipe refresh entrypoint.

## Testing & Local Hosting

The frontend now fetches data from `/api/*`, so run the Flask API server while hosting static files.

From the repository root:

```bash
python -m scripts.server
```

API routes:
- `GET /api/recipes`
- `GET /api/items`
- `GET /api/player-inventories`
- `POST /api/refresh-inventories`

`POST /api/refresh-recipes` runs the recipe scraper and item builder pipeline.

The static site can still be served by nginx (recommended for this repo) or any HTTP server.

Windows launcher scripts live in `tools/`:
- `tools/start_server.bat` starts nginx and the Flask API server.
- `tools/stop_server.bat` stops nginx and the Flask API server.

### Using Python

From the repository root:

```bash
cd website/mmSite
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

### Using VS Code Live Server

1. Open `website/mmSite/index.html` in VS Code
2. Right-click and select "Open with Live Server"
3. The site will automatically open in your default browser at `http://localhost:5500`
