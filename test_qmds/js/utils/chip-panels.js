// chip-panels.js
// Shared "chip strip" rendering used by the various BAG / TRACKING / DANGER
// side-panels (station theme in graph-traversal-helpers.js and maze-helpers.js,
// notebook theme in cycle-helpers.js). Each caller keeps its own CSS class
// names, labels, and per-chip highlight rules (pick / pick-done / fresh) —
// this module only owns the repeated "map items to chip spans, with an
// empty-state fallback" and "wrap chips in a titled panel shell" plumbing.

import { escapeHtml } from "./dom-utils.js";

/**
 * Render a row of chips (or an empty-state message).
 * @param {Array} items
 * @param {{
 *   chipClass: string,
 *   classFor?: (item: any) => string,   // extra class suffix, e.g. " ht-bag-chip-pick"
 *   decorFor?: (item: any) => string,   // extra inline HTML after the label, e.g. a checkmark
 *   labelOf?: (item: any) => string,
 *   dataIdOf?: ((item: any) => string) | null,
 *   emptyClass: string,
 *   emptyText: string,
 * }} cfg
 * @returns {string} HTML
 */
export function renderChipsHtml(items, {
  chipClass,
  classFor = () => "",
  decorFor = () => "",
  labelOf = (item) => String(item),
  dataIdOf = null,
  emptyClass,
  emptyText,
}) {
  if (!items || items.length === 0) {
    return `<div class="${emptyClass}">${escapeHtml(emptyText)}</div>`;
  }
  return items
    .map((item) => {
      const dataAttr = dataIdOf ? ` data-id="${escapeHtml(dataIdOf(item))}"` : "";
      return `<span class="${chipClass}${classFor(item)}"${dataAttr}>${escapeHtml(labelOf(item))}${decorFor(item)}</span>`;
    })
    .join("");
}

/**
 * Wrap pre-rendered chip HTML in the shared panel shell: a wrapper div with
 * an optional aria-label, a header with a title, a body, and an optional
 * footer caption.
 * @param {{
 *   wrapperClass: string,
 *   ariaLabel?: string,
 *   headerClass: string,
 *   titleClass: string,
 *   title: string,
 *   bodyClass: string,
 *   bodyHtml: string,
 *   footerClass?: string,
 *   footerHtml?: string,
 * }} cfg
 * @returns {string} HTML
 */
export function renderChipPanelShell({
  wrapperClass,
  ariaLabel,
  headerClass,
  titleClass,
  title,
  bodyClass,
  bodyHtml,
  footerClass,
  footerHtml,
}) {
  const ariaAttr = ariaLabel != null ? ` aria-label="${escapeHtml(ariaLabel)}"` : "";
  const footer = footerClass ? `<div class="${footerClass}">${footerHtml ?? ""}</div>` : "";
  return `
    <div class="${wrapperClass}"${ariaAttr}>
      <div class="${headerClass}">
        <span class="${titleClass}">${escapeHtml(title)}</span>
      </div>
      <div class="${bodyClass}">${bodyHtml}</div>
      ${footer}
    </div>
  `;
}
