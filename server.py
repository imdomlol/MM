"""
server.py — API server for MM

Exposes the Google Sheets inventory sync as an HTTP endpoint so the
browser Refresh button can trigger it. Static files are served by nginx.

nginx config (add inside your existing server block):
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

Usage:
    python server.py
"""

from flask import Flask, jsonify
import subprocess
import sys
from pathlib import Path

from mmdb import get_connection, read_items_payload, read_player_inventories_payload, read_recipes_payload

REPO_ROOT = Path(__file__).resolve().parent
DB_PATH = REPO_ROOT / "website" / "mmSite" / "data" / "mm.db"

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
    script = REPO_ROOT / "website" / "mmSite" / "data" / "scripts" / "buildPlayerInventoriesJSON.py"
    result = subprocess.run(
        [sys.executable, str(script), "--force", "--db", str(DB_PATH)],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    if result.returncode == 0:
        return jsonify({"ok": True, "message": result.stdout.strip()})
    return jsonify({"ok": False, "error": result.stderr.strip()}), 500


if __name__ == "__main__":
    print("API server running on http://127.0.0.1:5000")
    print("Proxy /api/ to this from nginx — do not expose port 5000 directly.")
    app.run(host="127.0.0.1", port=5000, debug=False)
