class AppNav extends HTMLElement {
  connectedCallback() {
    const root = document.documentElement;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

    const savedTheme = localStorage.getItem("theme");
    let isDark = savedTheme
      ? savedTheme === "dark"
      : systemTheme.matches;

    // Назви мов показуємо кожну її ж рідною мовою, щоб користувач
    // міг себе зорієнтувати навіть якщо поточна мова інтерфейсу
    // йому незрозуміла (напр. випадково обрана системна німецька).
    const LANG_LABELS = {
      uk: "Укр",
      en: "Eng",
      de: "Deu",
    };

    const hasI18n = typeof window.I18N !== "undefined";
    const tr = (key, fallback) => (hasI18n ? window.I18N.t(key) : fallback);
    const langs = hasI18n ? window.I18N.SUPPORTED_LANGS : ["uk", "en", "de"];
    let currentLang = hasI18n ? window.I18N.getLang() : "uk";

    const langOptionsHtml = langs
      .map((lang) => `<button type="button" class="lang-dropdown-option" data-lang-option="${lang}">${LANG_LABELS[lang] || lang}</button>`)
      .join("");

    this.innerHTML = `
      <div class="nav-lang-dropdown" id="navLangDropdown">
        <button type="button" class="nav-lang-btn" id="navLangBtn" aria-label="${tr("nav.chooseLang", "Обрати мову")}">
          <span id="navLangLabel">${LANG_LABELS[currentLang] || currentLang}</span>
        </button>
        <div class="nav-lang-list" id="navLangList">
          ${langOptionsHtml}
        </div>
      </div>
      <div class="switch-container" id="themeSwitch">
        <div class="switch-thumb" id="switchThumb">🌙</div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      app-nav {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }

      .nav-lang-dropdown {
        position: relative;
      }

      .nav-lang-btn {
        min-width: 2.6rem;
        padding: 0.35rem 0.6rem;
        border-radius: 10px;
        border: 1.5px solid color-mix(in srgb, var(--text) 25%, transparent);
        background: color-mix(in srgb, var(--text) 6%, transparent);
        color: var(--text);
        font-family: inherit;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: 0.02em;
      }

      .nav-lang-btn:hover,
      .nav-lang-btn:focus-visible {
        background: color-mix(in srgb, var(--text) 12%, transparent);
      }

      .nav-lang-list {
        position: absolute;
        top: calc(100% + 0.3rem);
        right: 0;
        min-width: 90px;
        background: var(--bg);
        border: 1.5px solid color-mix(in srgb, var(--text) 20%, transparent);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        z-index: 30;
        display: none;
        overflow: hidden;
      }

      .nav-lang-dropdown.is-open .nav-lang-list {
        display: block;
      }

      .lang-dropdown-option {
        width: 100%;
        padding: 0.5rem 0.8rem;
        background: none;
        border: none;
        color: var(--text);
        font-family: inherit;
        font-size: 0.85rem;
        text-align: left;
        cursor: pointer;
      }

      .lang-dropdown-option:hover,
      .lang-dropdown-option:focus-visible {
        background: color-mix(in srgb, var(--text) 10%, transparent);
      }

      .lang-dropdown-option.is-selected {
        background: color-mix(in srgb, #4caf50 22%, transparent);
        color: #4caf50;
      }
    `;
    this.appendChild(style);

    const markSelectedLang = () => {
      this.querySelectorAll("[data-lang-option]").forEach((btn) => {
        btn.classList.toggle("is-selected", btn.dataset.langOption === currentLang);
      });
      const label = this.querySelector("#navLangLabel");
      if (label) label.textContent = LANG_LABELS[currentLang] || currentLang;
    };
    markSelectedLang();

    const langDropdown = this.querySelector("#navLangDropdown");
    const langBtn = this.querySelector("#navLangBtn");

    langBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      langDropdown.classList.toggle("is-open");
    });

    this.querySelectorAll("[data-lang-option]").forEach((optionBtn) => {
      optionBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const lang = optionBtn.dataset.langOption;
        if (lang === currentLang) {
          langDropdown.classList.remove("is-open");
          return;
        }
        currentLang = lang;
        markSelectedLang();
        langDropdown.classList.remove("is-open");
        if (hasI18n) {
          window.I18N.setLang(lang);
        }
      });
    });

    // Якщо мову змінили не через цей дропдаун (напр. інша вкладка /
    // інший екземпляр app-nav), тримаємо підпис і aria-label синхронними.
    if (hasI18n) {
      window.I18N.onChange((lang) => {
        if (lang === currentLang) return;
        currentLang = lang;
        markSelectedLang();
        langBtn.setAttribute("aria-label", tr("nav.chooseLang", "Обрати мову"));
      });
    }

    // Клік будь-де поза дропдауном закриває його.
    document.addEventListener("click", () => {
      langDropdown.classList.remove("is-open");
    });

    const applyTheme = () => {
      document.querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", isDark ? "#121212" : "#f4f4f4");
      root.style.setProperty("--bg", isDark ? "#121212" : "#f4f4f4");
      root.style.setProperty("--text", isDark ? "#e0e0e0" : "#222");

      const thumb = this.querySelector("#switchThumb");
      const sw = this.querySelector("#themeSwitch");

      thumb.textContent = isDark ? "🌙" : "🌞";
      thumb.style.transform = isDark
        ? "translateX(0)"
        : "translateX(30px)";

      sw.style.backgroundColor = isDark ? "#444" : "#ccc";
    };

    this.querySelector("#themeSwitch").addEventListener("click", () => {
      isDark = !isDark;
      localStorage.setItem("theme", isDark ? "dark" : "light");
      applyTheme();
    });

    systemTheme.addEventListener("change", (event) => {
      if (localStorage.getItem("theme") === null) {
        isDark = event.matches;
        applyTheme();
      }
    });

    applyTheme();
  }
}

customElements.define("app-nav", AppNav);
