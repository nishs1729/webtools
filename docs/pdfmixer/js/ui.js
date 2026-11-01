/* Small UI helpers shared by the other modules. */

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  zoom: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  grip: '<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  reader: '<rect x="6" y="2" width="12" height="9" rx="1"/><rect x="6" y="13" width="12" height="9" rx="1"/>',
};

export const icon = (name) => Site.svg(ICONS[name]);

// Shared SortableJS options. The fallback (pointer-based) drag works the same with mouse and touch;
// on touch a short press starts a drag, so plain swipes still scroll.
export const DRAG = {
  animation: 150,
  forceFallback: true,
  fallbackTolerance: 4,
  delay: 180,
  delayOnTouchOnly: true,
  ghostClass: "is-ghost",
};

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const toastEl = document.getElementById("toast");
let toastTimer;

/** kind: "info" | "warn" | "error" */
export function toast(message, kind = "info") {
  toastEl.textContent = message;
  toastEl.className = `pm-toast is-${kind} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), kind === "info" ? 3500 : 7000);
}
