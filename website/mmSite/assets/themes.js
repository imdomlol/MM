function initThemes() {
  const KEY_THEME = "mm_theme";
  const KEY_OWNER = "mm_theme_owner";
  const KEY_PLAYER = "mm_selected_player";

  const themeSelect = document.getElementById("themeSelect");
  const playerSelect = document.getElementById("playersInventoryDropdown");
  const SECRET_PREFIX = "secret:";
  const playerDataPath = "/api/player-inventories";

  function getSecretOwner(themeValue) {
    return themeValue.startsWith(SECRET_PREFIX) ? themeValue.slice(SECRET_PREFIX.length) : "";
  }

  function getSavedTheme() {
    return localStorage.getItem(KEY_THEME) || "dark";
  }

  function getSavedPlayer() {
    return localStorage.getItem(KEY_PLAYER) || "";
  }

  function apply(themeValue) {
    if (themeValue.startsWith(SECRET_PREFIX)) {
      const owner = getSecretOwner(themeValue);
      document.documentElement.setAttribute("data-theme", "secret");
      document.documentElement.setAttribute("data-secret-owner", owner);
      localStorage.setItem(KEY_OWNER, owner);
    } else {
      document.documentElement.setAttribute("data-theme", themeValue);
      document.documentElement.removeAttribute("data-secret-owner");
      localStorage.removeItem(KEY_OWNER);
    }

    if (themeSelect) {
      const hasOption = [...themeSelect.options].some(o => o.value === themeValue);
      if (hasOption) themeSelect.value = themeValue;
    }
  }

  function syncSecretOption(player) {
    if (!themeSelect || !player) return;

    const value = `${SECRET_PREFIX}${player}`;
    const label = player.trim().split(/\s+/)[0];

    let opt = themeSelect.querySelector(`option[value="${CSS.escape(value)}"]`);
    if (!opt) {
      opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      themeSelect.appendChild(opt);
    } else {
      opt.textContent = label;
    }
  }

  function syncPlayerDropdown(players) {
    if (!playerSelect) return "";

    const names = (players || []).map(player => player.name).filter(Boolean);
    const previousValue = playerSelect.value;
    const savedPlayer = getSavedPlayer();
    const savedOwner = getSecretOwner(getSavedTheme());

    const preferredPlayer = names.includes(previousValue)
      ? previousValue
      : (names.includes(savedPlayer)
        ? savedPlayer
        : (names.includes(savedOwner) ? savedOwner : (names[0] || "")));

    playerSelect.innerHTML = "";
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      playerSelect.appendChild(opt);
    }

    if (preferredPlayer) {
      playerSelect.value = preferredPlayer;
      localStorage.setItem(KEY_PLAYER, preferredPlayer);
      syncSecretOption(preferredPlayer);

      if (preferredPlayer !== previousValue) {
        playerSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    return preferredPlayer;
  }

  window.mmSyncPlayerDropdown = syncPlayerDropdown;

  apply(getSavedTheme());

  if (playerSelect) {
    fetch(playerDataPath)
      .then(response => response.json())
      .then(data => syncPlayerDropdown(data.players || []))
      .catch(error => console.error("Failed to load player dropdown:", error));

    playerSelect.addEventListener("change", () => {
      const player = playerSelect.value;
      if (!player) return;

      localStorage.setItem(KEY_PLAYER, player);
      syncSecretOption(player);

      const currentTheme = themeSelect ? themeSelect.value : "";
      if (currentTheme.startsWith(SECRET_PREFIX)) {
        const nextTheme = `${SECRET_PREFIX}${player}`;
        if (themeSelect) {
          let opt = themeSelect.querySelector(`option[value="${CSS.escape(nextTheme)}"]`);
          if (!opt) {
            opt = document.createElement("option");
            opt.value = nextTheme;
            opt.textContent = player.trim().split(/\s+/)[0];
            themeSelect.appendChild(opt);
          }
          themeSelect.value = nextTheme;
        }
        localStorage.setItem(KEY_THEME, nextTheme);
        localStorage.setItem(KEY_OWNER, player);
        apply(nextTheme);
      }
    });
  }

  if (themeSelect) {
    themeSelect.addEventListener("change", () => {
      const chosen = themeSelect.value;
      localStorage.setItem(KEY_THEME, chosen);
      if (chosen.startsWith(SECRET_PREFIX)) {
        localStorage.setItem(KEY_OWNER, getSecretOwner(chosen));
      }
      apply(chosen);
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initThemes);
} else {
  initThemes();
}
