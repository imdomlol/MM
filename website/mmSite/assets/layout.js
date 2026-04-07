async function loadSharedHeader() {
  const mount = document.getElementById("siteHeader");
  if (!mount) return;

  try {
    const response = await fetch("./partials/header.html");
    if (!response.ok) throw new Error("HTTP " + response.status);

    mount.innerHTML = await response.text();

    const normalizePageName = (href) => {
      if (!href) return "";

      try {
        const url = new URL(href, window.location.href);
        const raw = url.pathname.split("/").pop() || "index.html";
        const page = raw.toLowerCase();

        // Detail pages should keep their parent nav section active.
        if (page === "recipe.html") return "recipes.html";

        return page;
      } catch {
        return "";
      }
    };

    const currentPage = normalizePageName(window.location.href);
    const navLinks = mount.querySelectorAll(".topbar a[href]");

    navLinks.forEach((link) => {
      const linkPage = normalizePageName(link.getAttribute("href"));
      if (linkPage && linkPage === currentPage) {
        link.classList.add("is-active");
      }
    });

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
