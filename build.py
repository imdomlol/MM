"""
build.py — MM data pipeline runner

Runs the full pipeline in order:
    1. buildRecipesJSON  — fetch+parse recipe HTML into SQLite recipes tables
    2. buildItemsJSON    — derive SQLite item index from recipes tables
    3. buildPlayerInventoriesJSON — sync inventories from Google Sheets into SQLite

All steps respect their individual caches unless --force is passed.

Usage examples:
    python build.py                         # full pipeline (fetch + all DB builds)
    python build.py --skip-fetch            # skip live fetch, use cached HTML
    python build.py --skip-fetch --force    # force-rebuild all DB tables, ignore caches
    python build.py --max-age 0             # always refetch inventories from Sheets
"""

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
SCRIPTS_DIR = REPO_ROOT / "website" / "mmSite" / "data" / "scripts"
DB_PATH = REPO_ROOT / "website" / "mmSite" / "data" / "mm.db"


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
    ap.add_argument("--skip-fetch", "--skip-scrape", dest="skip_fetch", action="store_true",
                    help="Skip live recipe fetch; use cached recipe HTML")
    ap.add_argument("--force", "-f", action="store_true",
                    help="Ignore all caches and rebuild everything")
    ap.add_argument("--max-age", type=int, default=10, metavar="MINUTES",
                    help="Inventory cache TTL in minutes (default: 10)")
    args = ap.parse_args()

    force_flag = ["--force"] if args.force else []

    recipe_step_cmd = [sys.executable, str(SCRIPTS_DIR / "buildRecipesJSON.py"), "--db", str(DB_PATH)] + force_flag
    if args.skip_fetch:
        recipe_step_cmd.append("--no-fetch")

    steps: list[tuple[str, list[str]]] = [
        (
            "Build: recipes tables",
            recipe_step_cmd,
        ),
        (
            "Build: items tables",
            [sys.executable, str(SCRIPTS_DIR / "buildItemsJSON.py"), "--db", str(DB_PATH)] + force_flag,
        ),
        (
            "Build: player inventories tables",
            [sys.executable, str(SCRIPTS_DIR / "buildPlayerInventoriesJSON.py"),
             "--max-age", str(args.max_age), "--db", str(DB_PATH)] + force_flag,
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
