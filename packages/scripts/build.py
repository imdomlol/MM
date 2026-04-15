from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from packages.data_pipeline.mmdb import DEFAULT_DB_PATH

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "packages" / "data_pipeline" / "cli_entrypoints"
DB_PATH = DEFAULT_DB_PATH


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

    recipe_step_cmd = [sys.executable, str(SCRIPTS_DIR / "refresh_recipes.py"), "--db", str(DB_PATH), "--strict-live-fetch"] + force_flag
    if args.skip_fetch:
        recipe_step_cmd.append("--no-fetch")

    steps: list[tuple[str, list[str]]] = [
        (
            "Build: recipes tables",
            recipe_step_cmd,
        ),
        (
            "Build: items tables",
            [sys.executable, str(SCRIPTS_DIR / "refresh_items.py"), "--db", str(DB_PATH)] + force_flag,
        ),
        (
            "Build: player inventories tables",
            [sys.executable, str(SCRIPTS_DIR / "refresh_inventories.py"),
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
