(function initializeReleaseCountdown(globalScope) {
  "use strict";

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  let intervalId = null;

  function parseReleaseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function formatRemaining(milliseconds) {
    const remaining = Math.max(0, Number(milliseconds) || 0);
    const days = Math.floor(remaining / DAY);
    const hours = Math.floor((remaining % DAY) / HOUR);
    const minutes = Math.floor((remaining % HOUR) / MINUTE);
    const seconds = Math.floor((remaining % MINUTE) / SECOND);
    return {
      days,
      hours,
      minutes,
      seconds,
      text: `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
    };
  }

  function formatReleaseDate(date) {
    return new Intl.DateTimeFormat("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function updateElement(element, now = Date.now()) {
    const releaseDate = parseReleaseDate(element.dataset.releaseCountdown);
    const value = element.querySelector("[data-countdown-value]");
    const dateLabel = element.querySelector("[data-countdown-date]");
    if (!value) return;

    if (!releaseDate) {
      element.dataset.countdownState = "unknown";
      value.textContent = "Data a confirmar";
      if (dateLabel) dateLabel.textContent = "A editora ainda n\u00e3o anunciou a data";
      return;
    }

    if (dateLabel) {
      dateLabel.dateTime = element.dataset.releaseCountdown;
      dateLabel.textContent = formatReleaseDate(releaseDate);
    }

    const remaining = releaseDate.getTime() - now;
    if (remaining <= 0) {
      element.dataset.countdownState = "released";
      value.textContent = "J\u00e1 dispon\u00edvel";
      return;
    }

    element.dataset.countdownState = "counting";
    value.textContent = formatRemaining(remaining).text;
  }

  function refresh(root) {
    if (typeof document === "undefined") return;
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    const elements = [];
    if (scope.matches?.("[data-release-countdown]")) elements.push(scope);
    elements.push(...scope.querySelectorAll("[data-release-countdown]"));
    elements.forEach((element) => updateElement(element));

    if (elements.length && intervalId === null) {
      intervalId = globalScope.setInterval(() => {
        document.querySelectorAll("[data-release-countdown]").forEach((element) => updateElement(element));
      }, SECOND);
    }
  }

  const api = { parseReleaseDate, formatRemaining, updateElement, refresh };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) {
    globalScope.GalaxyCountdown = api;
    if (typeof globalScope.dispatchEvent === "function" && typeof globalScope.CustomEvent === "function") {
      globalScope.dispatchEvent(new globalScope.CustomEvent("galaxy-countdown-ready"));
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => refresh(document), { once: true });
    } else {
      refresh(document);
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh(document);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
