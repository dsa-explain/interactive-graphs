// dom-utils.js
// Tiny shared DOM/string helpers used across the graph/maze/cycle helper
// modules. Kept intentionally dependency-free so any module can import it.

/** Escape a string for safe insertion into HTML markup. */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
