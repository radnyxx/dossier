(function () {
  var STORAGE_KEY = "theme";
  var root = document.documentElement;

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredTheme(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      /* ignore (private mode etc.) */
    }
  }

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
  }

  // Apply theme as early as possible (this script is loaded in <head> with no defer,
  // so this runs before paint and avoids a flash of the wrong theme).
  var initial = getStoredTheme() || (systemPrefersDark() ? "dark" : "light");
  applyTheme(initial);

  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function toggleTheme(originEvent) {
    var next = currentTheme() === "dark" ? "light" : "dark";

    // Figure out where the toggle button is, so the circular reveal
    // animation expands outward from that point.
    var btn = document.querySelector(".theme-toggle");
    var x = "90%";
    var y = "5%";
    if (btn) {
      var rect = btn.getBoundingClientRect();
      x = rect.left + rect.width / 2 + "px";
      y = rect.top + rect.height / 2 + "px";
    }
    root.style.setProperty("--toggle-x", x);
    root.style.setProperty("--toggle-y", y);

    var supportsViewTransitions = typeof document.startViewTransition === "function";
    var prefersReducedMotion =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (supportsViewTransitions && !prefersReducedMotion) {
      root.setAttribute("data-theme-transition", "true");
      var transition = document.startViewTransition(function () {
        applyTheme(next);
      });
      transition.finished.finally(function () {
        root.removeAttribute("data-theme-transition");
      });
    } else {
      applyTheme(next);
    }

    setStoredTheme(next);
  }

  // Wire up the toggle button once the DOM is ready.
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.querySelector(".theme-toggle");
    if (btn) {
      btn.addEventListener("click", toggleTheme);
    }
  });
})();
