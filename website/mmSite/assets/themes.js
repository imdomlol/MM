document.addEventListener("DOMContentLoaded", () => {
  const KEY_THEME = "mm_theme";
  const KEY_OWNER = "mm_theme_owner";

  const themeSelect = document.getElementById("themeSelect");
  const isInventoriesPage = window.location.pathname.endsWith("inventories.html");
  const playerSelect = document.getElementById("playersInventoryDropdown");
  const SECRET_PREFIX = "secret:";

  function apply(themeValue) {
    if (themeValue.startsWith(SECRET_PREFIX)) {
      const owner = themeValue.slice(SECRET_PREFIX.length);
      document.documentElement.setAttribute("data-theme", "secret");
      document.documentElement.setAttribute("data-secret-owner", owner);
    } else {
      document.documentElement.setAttribute("data-theme", themeValue);
      document.documentElement.removeAttribute("data-secret-owner");
    }

    // Only set dropdown value if option exists on this page
    if (themeSelect) {
      const hasOption = [...themeSelect.options].some(o => o.value === themeValue);
      if (hasOption) themeSelect.value = themeValue;
    }
  }

  function getSavedTheme() {
    return localStorage.getItem(KEY_THEME) || "dark";
  }

  function getSavedOwner() {
    return localStorage.getItem(KEY_OWNER) || "";
  }

  // Update the secret option
  function syncSecretOption() {
    if (!isInventoriesPage || !themeSelect || !playerSelect) return;

    const player = playerSelect.value;
    if (!player) return;

    const value = `${SECRET_PREFIX}${player}`;
    const label = player.trim().split(/\s+/)[0];

    // Add this player's secret option if missing
    let opt = themeSelect.querySelector(`option[value="${CSS.escape(value)}"]`);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      themeSelect.appendChild(opt);
    } else {
      opt.textContent = label; // keep label fresh just in case
    }
  }


  apply(localStorage.getItem(KEY_THEME) || "dark");

  if (isInventoriesPage && themeSelect && playerSelect) {
    syncSecretOption();
    playerSelect.addEventListener("change", () => {
      syncSecretOption();
    });
  }

  // ---- Theme dropdown change handler ----
  if (themeSelect) {
    themeSelect.addEventListener("change", () => {
      const chosen = themeSelect.value;
      localStorage.setItem(KEY_THEME, chosen);
      apply(chosen);
    });
  }
});
