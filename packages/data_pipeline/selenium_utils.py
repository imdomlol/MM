from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait


DEFAULT_PLAYER_NAME = "Caine"


def _find_first_present(context, timeout_seconds: int, locators, logger=print, label: str = "element"):
    last_error = None
    for locator in locators:
        try:
            logger(f"Waiting for {label}: {locator[1]}")
            return WebDriverWait(context, timeout_seconds).until(
                EC.presence_of_element_located(locator)
            )
        except Exception as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise TimeoutError(f"Unable to locate {label}.")


def _click_with_fallback(driver, element, label: str, logger=print) -> None:
    try:
        element.click()
        logger(f"{label} clicked.")
        return
    except Exception as click_exc:
        logger(f"{label} normal click failed: {click_exc}; retrying with JavaScript click.")

    driver.execute_script("arguments[0].click();", element)
    logger(f"{label} clicked via JavaScript.")


def _extract_item_catalog_from_game(driver) -> list[dict]:
    script = """
        const stripHtml = (value) => {
            if (!value) return "";
            const div = document.createElement("div");
            div.innerHTML = String(value);
            return (div.textContent || div.innerText || "").trim();
        };

        const pathForFolder = (folder) => {
            const names = [];
            let current = folder || null;
            while (current) {
                names.push(current.name || "");
                current = current.folder || null;
            }
            return names.reverse().filter(Boolean).join("/");
        };

        const items = Array.from(game?.items?.contents || []);
        return items.map((item) => {
            const descriptionRaw = item?.system?.description?.value ?? item?.system?.description ?? "";
            return {
                itemId: item?.id || "",
                name: item?.name || "",
                folderPath: pathForFolder(item?.folder || null),
                descriptionText: stripHtml(descriptionRaw),
                imagePath: item?.img || "",
            };
        });
    """
    result = driver.execute_script(script)
    if not isinstance(result, list):
        return []
    return [row for row in result if isinstance(row, dict) and row.get("itemId")]


def fetch_recipe_page_and_item_catalog_with_selenium(
    recipe_page_url: str,
    player_name: str = DEFAULT_PLAYER_NAME,
    timeout_seconds: int = 15,
    headless: bool = False,
    logger=print,
) -> tuple[str, list[dict], list[str]]:
    """Load game UI and return recipe page HTML plus full item catalog from game.items."""
    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")

    driver = webdriver.Chrome(options=options)
    warnings: list[str] = []
    try:
        driver.get(recipe_page_url)

        WebDriverWait(driver, timeout_seconds).until(
            EC.presence_of_element_located((By.ID, "join-game-form"))
        )
        logger("Login form loaded.")

        select_element = driver.find_element(By.NAME, "userid")
        target_player = select_element.find_element(By.XPATH, f".//option[text()='{player_name}']")
        driver.execute_script("arguments[0].disabled = false;", target_player)
        Select(select_element).select_by_visible_text(player_name)

        join_button = driver.find_element(By.XPATH, "//button[@name='join']")
        _click_with_fallback(driver, join_button, "Join button", logger=logger)

        WebDriverWait(driver, timeout_seconds).until(lambda d: "game" in d.current_url)
        logger("Game interface loaded.")

        WebDriverWait(driver, timeout_seconds).until(
            EC.presence_of_element_located(
                (
                    By.XPATH,
                    "//body[contains(@class, 'vtt') and contains(@class, 'game') and contains(@class, 'system-worldbuilding') and contains(@class, 'theme-dark')]",
                )
            )
        )
        logger("Game body ready.")
        logger("Waiting for UI-right section.")
        ui_right_section = _find_first_present(
            driver,
            timeout_seconds,
            [
                (By.XPATH, "//div[@id='interface']//section[@id='ui-right']"),
                (By.CSS_SELECTOR, "#ui-right"),
            ],
            logger=logger,
            label="UI-right section",
        )
        logger("UI-right section loaded.")
        logger("Waiting for sidebar container.")
        _find_first_present(
            ui_right_section,
            timeout_seconds,
            [
                (By.ID, "sidebar"),
                (By.CSS_SELECTOR, "#sidebar.app"),
                (By.CSS_SELECTOR, "div.sidebar"),
            ],
            logger=logger,
            label="sidebar container",
        )
        logger("Sidebar loaded.")

        logger("Waiting for Items tab.")
        items_xpath = (
            "//*[@id='sidebar']//*[self::a or self::button]["
            "contains(translate(@aria-label, 'ITEMS', 'items'), 'items') "
            "or contains(translate(@title, 'ITEMS', 'items'), 'items') "
            "or @data-tab='items' "
            "or normalize-space()='Items' "
            "or contains(translate(normalize-space(.), 'ITEMS', 'items'), 'items')"
            "]"
        )
        logger(f"Waiting for Items tab: {items_xpath}")
        items_tab = WebDriverWait(driver, timeout_seconds).until(
            EC.element_to_be_clickable((By.XPATH, items_xpath))
        )
        _click_with_fallback(driver, items_tab, "Items tab", logger=logger)

        logger("Waiting for recipe manager button.")
        recipe_manager_button = WebDriverWait(driver, timeout_seconds).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "button.mastercrafted-open-recipe-app"))
        )
        _click_with_fallback(driver, recipe_manager_button, "Recipe manager button", logger=logger)

        logger("Waiting for recipe manager content.")
        WebDriverWait(driver, timeout_seconds).until(
            EC.presence_of_element_located((By.ID, "mastercrafted-recipeApp"))
        )
        logger("Recipe manager content loaded.")

        item_catalog: list[dict] = []
        try:
            item_catalog = _extract_item_catalog_from_game(driver)
            logger(f"Extracted {len(item_catalog)} items from game catalog.")
        except Exception as exc:
            warnings.append(f"Failed to extract live item catalog: {exc}")

        return driver.page_source, item_catalog, warnings
    finally:
        driver.quit()


def fetch_recipe_page_with_selenium(
    recipe_page_url: str,
    player_name: str = DEFAULT_PLAYER_NAME,
    timeout_seconds: int = 15,
    headless: bool = False,
    logger=print,
) -> str:
    """Load the game page, open the recipe manager UI, and return page HTML."""
    html, _, _ = fetch_recipe_page_and_item_catalog_with_selenium(
        recipe_page_url=recipe_page_url,
        player_name=player_name,
        timeout_seconds=timeout_seconds,
        headless=headless,
        logger=logger,
    )
    return html
