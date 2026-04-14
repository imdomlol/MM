from __future__ import annotations

from flask import Flask, jsonify, request
import subprocess
import sys
from pathlib import Path

from data_pipeline.mmdb import DEFAULT_DB_PATH, get_connection, read_items_payload, read_player_inventories_payload, read_recipes_payload

REPO_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = DEFAULT_DB_PATH

app = Flask(__name__)


def _read_payload(reader):
    conn = get_connection(DB_PATH)
    try:
        return reader(conn)
    finally:
        conn.close()


@app.route("/api/recipes", methods=["GET"])
def get_recipes():
    return jsonify(_read_payload(read_recipes_payload))


@app.route("/api/items", methods=["GET"])
def get_items():
    return jsonify(_read_payload(read_items_payload))


@app.route("/api/player-inventories", methods=["GET"])
def get_player_inventories():
    return jsonify(_read_payload(read_player_inventories_payload))


@app.route("/api/refresh-inventories", methods=["POST"])
def refresh_inventories():
    script = REPO_ROOT / "data_pipeline" / "cli_entrypoints" / "refresh_inventories.py"
    payload = request.get_json(silent=True) or {}
    selected_sheet_id = str(payload.get("sheetId") or "").strip()
    selected_player_name = str(payload.get("playerName") or "").strip()

    script_args = [sys.executable, str(script), "--force", "--db", str(DB_PATH)]
    if selected_sheet_id:
        script_args.extend(["--sheet-id", selected_sheet_id])
    if selected_player_name:
        script_args.extend(["--player-name", selected_player_name])

    result = subprocess.run(
        script_args,
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    if result.returncode == 0:
        return jsonify({"ok": True, "message": result.stdout.strip()})
    return jsonify({"ok": False, "error": result.stderr.strip()}), 500


@app.route("/api/refresh-recipes", methods=["POST"])
def refresh_recipes():
    scripts_dir = REPO_ROOT / "data_pipeline" / "cli_entrypoints"
    recipe_script = scripts_dir / "refresh_recipes.py"
    items_script = scripts_dir / "refresh_items.py"

    recipe_result = subprocess.run(
        [sys.executable, str(recipe_script), "--force", "--db", str(DB_PATH), "--strict-live-fetch"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    if recipe_result.returncode != 0:
        return jsonify(
            {
                "ok": False,
                "step": "refresh_recipes.py",
                "error": (recipe_result.stderr or recipe_result.stdout).strip(),
            }
        ), 500

    items_result = subprocess.run(
        [sys.executable, str(items_script), "--force", "--db", str(DB_PATH)],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    if items_result.returncode != 0:
        return jsonify(
            {
                "ok": False,
                "step": "refresh_items.py",
                "error": (items_result.stderr or items_result.stdout).strip(),
            }
        ), 500

    return jsonify(
        {
            "ok": True,
            "message": "Recipes and items refreshed.",
            "recipeLog": recipe_result.stdout.strip(),
            "itemsLog": items_result.stdout.strip(),
        }
    )


def main() -> int:
    print("API server running on http://127.0.0.1:5000")
    print("Proxy /api/ to this from nginx — do not expose port 5000 directly.")
    app.run(host="127.0.0.1", port=5000, debug=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
