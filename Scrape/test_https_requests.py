import argparse
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


@dataclass
class ProbeResult:
    ok: bool
    base_url: str
    game_url: str
    login_url: str
    selected_user: str
    login_post_status: int | None
    game_get_status: int | None
    has_join_form_after_login: bool
    has_recipe_markers: bool
    discovered_recipe_markers: list[str]
    notes: list[str]


def normalize_base_url(base_url: str) -> str:
    trimmed = base_url.strip()
    if not trimmed.startswith("http://") and not trimmed.startswith("https://"):
        trimmed = "https://" + trimmed
    return trimmed.rstrip("/")


def find_join_form(soup: BeautifulSoup):
    return soup.select_one("form#join-game-form") or soup.select_one("form[action*='join']")


def parse_form_payload(form) -> dict[str, str]:
    payload: dict[str, str] = {}
    if not form:
        return payload

    for inp in form.select("input[name]"):
        name = (inp.get("name") or "").strip()
        if not name:
            continue
        payload[name] = inp.get("value") or ""
    return payload


def choose_user(form, requested_user: str | None) -> str:
    select = form.select_one("select[name='userid']") if form else None
    if not select:
        return requested_user or ""

    options = select.select("option")
    visible_names = [(opt.get_text(strip=True), opt.get("value") or "") for opt in options]

    if requested_user:
        requested_norm = requested_user.strip().lower()
        for label, value in visible_names:
            if label.strip().lower() == requested_norm:
                return value or label

    for label, value in visible_names:
        if value:
            return value
        if label:
            return label

    return requested_user or ""


def detect_recipe_markers(html_text: str) -> tuple[bool, list[str]]:
    soup = BeautifulSoup(html_text, "html.parser")
    markers: list[str] = []

    checks = {
        "mastercrafted_recipe_blocks": bool(soup.select(".mastercrafted-recipe[data-recipe-id]")),
        "recipe_app_container": bool(soup.select_one("#mastercrafted-recipeApp")),
        "recipe_manager_button": bool(soup.select_one("button.mastercrafted-open-recipe-app")),
        "recipe_list_entries": bool(soup.select("li.recipe.directory-item.level2[data-recipe-id]")),
    }

    for key, matched in checks.items():
        if matched:
            markers.append(key)

    return (len(markers) > 0), markers


def main() -> int:
    ap = argparse.ArgumentParser(description="Test whether recipe data can be fetched via HTTPS requests without Selenium")
    ap.add_argument("--base-url", default="https://173.29.198.65:30000", help="Base Foundry URL")
    ap.add_argument("--game-path", default="/game", help="Game path to fetch")
    ap.add_argument("--login-path", default="/join", help="Join/login POST path")
    ap.add_argument("--user", default="Caine", help="Display name to select from user dropdown")
    ap.add_argument("--insecure", action="store_true", help="Disable TLS certificate verification")
    ap.add_argument("--timeout", type=int, default=20, help="HTTP timeout in seconds")
    args = ap.parse_args()

    base_url = normalize_base_url(args.base_url)
    game_url = urljoin(base_url + "/", args.game_path.lstrip("/"))
    login_url = urljoin(base_url + "/", args.login_path.lstrip("/"))

    repo_root = Path(__file__).resolve().parents[1]
    out_dir = repo_root / ".build_cache"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "https_requests_game.html"
    report_path = out_dir / "https_requests_probe.json"

    notes: list[str] = []
    session = requests.Session()

    initial_status = None
    login_status = None
    final_status = None
    selected_user = ""
    has_join_form_after = False
    has_recipe_markers = False
    marker_names: list[str] = []

    try:
        initial_resp = session.get(game_url, timeout=args.timeout, verify=not args.insecure)
        initial_status = initial_resp.status_code
        initial_resp.raise_for_status()

        initial_html = initial_resp.text
        initial_soup = BeautifulSoup(initial_html, "html.parser")
        join_form = find_join_form(initial_soup)

        if not join_form:
            notes.append("No join form was found on the initial game page response.")
            final_html = initial_html
        else:
            payload = parse_form_payload(join_form)
            selected_user = choose_user(join_form, args.user)
            if selected_user:
                payload["userid"] = selected_user
            if "join" not in payload:
                payload["join"] = "Join Game Session"

            action = (join_form.get("action") or "").strip()
            post_target = urljoin(game_url, action) if action else login_url

            login_resp = session.post(
                post_target,
                data=payload,
                timeout=args.timeout,
                verify=not args.insecure,
                allow_redirects=True,
            )
            login_status = login_resp.status_code

            # Fetch game view after login attempt
            final_resp = session.get(game_url, timeout=args.timeout, verify=not args.insecure)
            final_status = final_resp.status_code
            final_resp.raise_for_status()
            final_html = final_resp.text

        html_path.write_text(final_html, encoding="utf-8")

        final_soup = BeautifulSoup(final_html, "html.parser")
        has_join_form_after = find_join_form(final_soup) is not None
        has_recipe_markers, marker_names = detect_recipe_markers(final_html)

        if has_join_form_after:
            notes.append("Join form still present after login attempt; session may not be authenticated.")
        if not has_recipe_markers:
            notes.append("No recipe markers in HTML. Data may be loaded only after client-side websocket events.")

        ok = has_recipe_markers and not has_join_form_after

    except requests.RequestException as exc:
        notes.append(f"HTTP request failed: {exc}")
        ok = False
    except Exception as exc:  # keep diagnostics robust for exploratory probing
        notes.append(f"Unexpected failure: {exc}")
        ok = False

    result = ProbeResult(
        ok=ok,
        base_url=base_url,
        game_url=game_url,
        login_url=login_url,
        selected_user=selected_user,
        login_post_status=login_status,
        game_get_status=final_status or initial_status,
        has_join_form_after_login=has_join_form_after,
        has_recipe_markers=has_recipe_markers,
        discovered_recipe_markers=marker_names,
        notes=notes,
    )

    report_path.write_text(json.dumps(asdict(result), indent=2), encoding="utf-8")

    print(f"Probe report: {report_path}")
    print(f"HTML snapshot: {html_path}")
    print(f"ok={result.ok} | recipe_markers={result.discovered_recipe_markers}")
    if result.notes:
        print("Notes:")
        for note in result.notes:
            print(f"- {note}")

    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
