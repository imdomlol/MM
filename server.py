"""
server.py — Local dev server for MM

Serves the static site and exposes a single API endpoint so the browser
can trigger the Google Sheets inventory sync without leaving the page.

Usage:
    python server.py
    # Site available at http://localhost:5000
"""

from flask import Flask, jsonify, send_from_directory
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
SITE_DIR = REPO_ROOT / "website" / "mmSite"

app = Flask(__name__, static_folder=str(SITE_DIR), static_url_path="")


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_static(path):
    target = SITE_DIR / path
    if path and target.exists():
        return send_from_directory(str(SITE_DIR), path)
    return send_from_directory(str(SITE_DIR), "index.html")


@app.route("/api/refresh-inventories", methods=["POST"])
def refresh_inventories():
    script = REPO_ROOT / "website" / "mmSite" / "data" / "scripts" / "buildPlayerInventoriesJSON.py"
    result = subprocess.run(
        [sys.executable, str(script), "--force"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
    )
    if result.returncode == 0:
        return jsonify({"ok": True, "message": result.stdout.strip()})
    return jsonify({"ok": False, "error": result.stderr.strip()}), 500


if __name__ == "__main__":
    print(f"Serving site from: {SITE_DIR}")
    print("Open http://localhost:5000")
    app.run(port=5000, debug=False)
