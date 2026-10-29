/*
 * Shared site chrome: theme handling, <site-header> and <site-footer>.
 * Load as a classic (non-module) script in <head>, after tools.js:
 *
 *   <script src="../assets/js/tools.js"></script>
 *   <script src="../assets/js/site.js"></script>
 *
 * Then in <body>:  <site-header tool="slug"></site-header> … <site-footer></site-footer>
 */
(function () {
  const THEME_KEY = "webtools-theme";

  // Site root, derived from this script's own URL (…/assets/js/site.js → …/),
  // so links work at any folder depth, on GitHub Pages and from file://.
  const ROOT = new URL("../../", document.currentScript.src).href;

  // file:// shows a directory listing for folder URLs, so point at index.html there.
  const INDEX = location.protocol === "file:" ? "index.html" : "";
  const toolUrl = (slug) => `${ROOT}${slug}/${INDEX}`;

  /* ---------- Theme: "system" (default) | "light" | "dark" ---------- */

  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || "system";
    } catch {
      return "system";
    }
  }

  function applyTheme(theme) {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  function setTheme(theme) {
    applyTheme(theme);
    try {
      if (theme === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {}
  }

  // Apply before first paint to avoid a light/dark flash.
  applyTheme(getTheme());

  const THEME_ORDER = ["system", "light", "dark"];
  const THEME_ICONS = {
    system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  };

  const svg = (inner) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

  /* ---------- <site-header tool="slug"> ---------- */

  class SiteHeader extends HTMLElement {
    connectedCallback() {
      const slug = this.getAttribute("tool");
      const tool = (window.TOOLS || []).find((t) => t.slug === slug);

      if (tool) document.title = `${tool.name} · Webtools`;

      this.innerHTML = `
        <div class="site-header__inner">
          <nav class="crumbs" aria-label="Breadcrumb">
            <a class="brand" href="${ROOT}${INDEX}">
              <span class="brand__mark" aria-hidden="true"></span>Webtools
            </a>
            ${tool ? `<span class="crumbs__sep" aria-hidden="true">/</span>
                      <span class="crumbs__current" aria-current="page">${tool.name}</span>` : ""}
          </nav>
          <button class="icon-btn theme-toggle" type="button"></button>
        </div>`;

      const btn = this.querySelector(".theme-toggle");
      const render = () => {
        const theme = getTheme();
        btn.innerHTML = svg(THEME_ICONS[theme]);
        btn.title = `Theme: ${theme}`;
        btn.setAttribute("aria-label", `Theme: ${theme}. Click to change.`);
      };
      btn.addEventListener("click", () => {
        const next = THEME_ORDER[(THEME_ORDER.indexOf(getTheme()) + 1) % THEME_ORDER.length];
        setTheme(next);
        render();
      });
      render();
    }
  }

  /* ---------- <site-footer> ---------- */

  class SiteFooter extends HTMLElement {
    connectedCallback() {
      this.innerHTML = `
        <div class="site-footer__inner">
          <span>Small tools, made for myself.</span>
        </div>`;
    }
  }

  customElements.define("site-header", SiteHeader);
  customElements.define("site-footer", SiteFooter);

  window.Site = { ROOT, svg, toolUrl };
})();
