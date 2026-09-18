import {
  defaultHighlightStyle,
  highlightCode,
  python,
  StyleModule,
} from "../vendor/codemirror-python.js";

let stylesMounted = false;

function ensureHighlightStyles() {
  if (stylesMounted) return;
  stylesMounted = true;
  if (defaultHighlightStyle?.module) {
    StyleModule.mount(document, defaultHighlightStyle.module);
  }
}

/**
 * Fill `el` with CodeMirror-highlighted Python (same token styles as the editor).
 * Falls back to plain text if highlighting fails.
 * @param {HTMLElement} el
 * @param {string} code
 */
export function fillHighlightedPython(el, code) {
  if (!el) return;
  const text = String(code ?? "");
  el.replaceChildren();
  if (!text) return;

  try {
    ensureHighlightStyles();
    const language = python().language;
    const tree = language.parser.parse(text);
    highlightCode(
      text,
      tree,
      defaultHighlightStyle,
      (chunk, classes) => {
        if (classes) {
          const span = document.createElement("span");
          span.className = classes;
          span.textContent = chunk;
          el.appendChild(span);
        } else {
          el.appendChild(document.createTextNode(chunk));
        }
      },
      () => {
        el.appendChild(document.createTextNode("\n"));
      }
    );
  } catch {
    el.textContent = text;
  }
}
