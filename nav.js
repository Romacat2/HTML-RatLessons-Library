if (sessionStorage.getItem("theme") === "light") {
  document.documentElement.style.setProperty("--bg", "#f4f4f4");
  document.documentElement.style.setProperty("--text", "#222");
}
class AppNav extends HTMLElement {
  connectedCallback() {
    let isDark = sessionStorage.getItem("theme") !== "light";
    this.innerHTML = `
  <div class="switch-container" id="themeSwitch">
      <div class="switch-thumb" id="switchThumb">🌙</div>
  </div>
`;
    const applyTheme = () => {
      const root = document.documentElement;
      root.style.setProperty("--bg", isDark ? "#121212" : "#f4f4f4");
      root.style.setProperty("--text", isDark ? "#e0e0e0" : "#222");
      sessionStorage.setItem("theme", isDark ? "dark" : "light");
      const thumb = this.querySelector("#switchThumb");
      const sw = this.querySelector("#themeSwitch");
      thumb.textContent = isDark ? "🌙" : "🌞";
      thumb.style.transform = isDark ? "translateX(0)" : "translateX(30px)";
      sw.style.backgroundColor = isDark ? "#444" : "#ccc";
    };
    this.querySelector("#themeSwitch").addEventListener("click", () => {
      isDark = !isDark;
      applyTheme();
    });
    applyTheme();
  }
}
customElements.define("app-nav", AppNav);
