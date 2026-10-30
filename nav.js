class AppNav extends HTMLElement {
  connectedCallback() {
    const root = document.documentElement;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

    const savedTheme = localStorage.getItem("theme");
    let isDark = savedTheme
      ? savedTheme === "dark"
      : systemTheme.matches;

    this.innerHTML = `
      <div class="switch-container" id="themeSwitch">
        <div class="switch-thumb" id="switchThumb">🌙</div>
      </div>
    `;

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
