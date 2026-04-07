# Myth & Magic Helper (MM)

A web-based companion tool for Myth & Magic that provides comprehensive recipe browsing, item lookup, and player inventory management.

## Overview

Myth & Magic Helper is a single-page web application designed to enhance the Myth & Magic gaming experience. It serves as a central hub for players to explore crafting recipes, trace item relationships, and track player inventories. The tool uses a static website architecture backed by structured JSON data, enabling fast lookups and intuitive navigation across game content.

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

## Testing & Local Hosting

The application is a static website and can be tested locally with any HTTP server.

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
