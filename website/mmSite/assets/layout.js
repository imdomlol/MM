async function loadSharedHeader() {
  const mount = document.getElementById("siteHeader");
  if (!mount) return;

  try {
    const response = await fetch("./partials/header.html");
    if (!response.ok) throw new Error("HTTP " + response.status);

    mount.innerHTML = await response.text();

    // Themes are shared UI state; load once after header markup exists.
    if (!document.querySelector('script[data-mm-theme="1"]')) {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "./assets/themes.js";
      script.dataset.mmTheme = "1";
      document.body.appendChild(script);
    }
  } catch (error) {
    console.error("Failed to load shared header:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadSharedHeader);
} else {
  loadSharedHeader();
}
