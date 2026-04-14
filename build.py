"""
build.py — MM data pipeline runner

Runs the full pipeline in order:
  1. Fetch recipe HTML via Selenium (optional, skip with --skip-scrape)
  2. buildRecipesJSON  — parse reciperaw.html → recipes.json
  3. buildItemsJSON    — derive items.json from recipes.json
  4. buildPlayerInventoriesJSON — sync inventories from Google Sheets

All steps respect their individual caches unless --force is passed.

Usage examples:
  python build.py                         # full pipeline (Selenium + all builds)
  python build.py --skip-scrape           # skip Selenium, rebuild from existing HTML
  python build.py --skip-scrape --force   # force-rebuild all JSON, ignore caches
  python build.py --max-age 0             # always refetch inventories from Sheets
"""

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = REPO_ROOT / "website" / "mmSite" / "data" / "scripts"
SCRAPE_SCRIPT = REPO_ROOT / "Scrape" / "scrape.py"


def run_step(label: str, cmd: list[str]) -> bool:
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    result = subprocess.run(cmd, cwd=str(REPO_ROOT))
    if result.returncode != 0:
        print(f"\n[FAILED] {label} exited with code {result.returncode}")
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description="MM data pipeline runner")
    ap.add_argument("--skip-scrape", action="store_true",
                    help="Skip Selenium fetch; use existing reciperaw.html")
    ap.add_argument("--force", "-f", action="store_true",
                    help="Ignore all caches and rebuild everything")
    ap.add_argument("--max-age", type=int, default=10, metavar="MINUTES",
                    help="Inventory cache TTL in minutes (default: 10)")
    args = ap.parse_args()

    force_flag = ["--force"] if args.force else []

    steps: list[tuple[str, list[str]]] = []

    if not args.skip_scrape:
        steps.append(("Scrape: fetch recipe HTML", [sys.executable, str(SCRAPE_SCRIPT)]))

    steps += [
        (
            "Build: recipes.json",
            [sys.executable, str(SCRIPTS_DIR / "buildRecipesJSON.py")] + force_flag,
        ),
        (
            "Build: items.json",
            [sys.executable, str(SCRIPTS_DIR / "buildItemsJSON.py")] + force_flag,
        ),
        (
            "Build: playerInventories.json",
            [sys.executable, str(SCRIPTS_DIR / "buildPlayerInventoriesJSON.py"),
             "--max-age", str(args.max_age)] + force_flag,
        ),
    ]

    for label, cmd in steps:
        if not run_step(label, cmd):
            return 1

    print(f"\n{'='*60}")
    print("  All steps complete.")
    print(f"{'='*60}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
