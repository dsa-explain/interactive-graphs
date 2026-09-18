// guided-quiz-core.js
// Shared MCQ option-button + reveal/feedback rendering for the "guided quiz"
// family (mountTraversalQuiz, mountCycleStepQuiz, mountTraversalOrderQuiz).
// All three build an MCQ section with the same `ht-mcq-*` CSS states
// (correct / incorrect / disabled) and a feedback line below it; only the
// exact button data-attributes, escaping helper, and feedback copy differ
// per caller, so those stay as parameters instead of being hardcoded here.

import { escapeHtml } from "./dom-utils.js";

/**
 * Render the `ht-mcq-btn` option row for one MCQ.
 * @param {Array<{id: string, label: string, correct?: boolean}>} options
 * @param {{
 *   shown: boolean,
 *   wrongPicks: Set<string>,
 *   dataAttrsFor?: (opt: object) => string,
 * }} cfg
 * @returns {string} HTML
 */
export function renderMcqOptionsHtml(options, { shown, wrongPicks, dataAttrsFor }) {
  const attrsFor = dataAttrsFor ?? ((opt) => `data-id="${escapeHtml(opt.id)}"`);
  return options
    .map((opt) => {
      const classes = ["ht-mcq-btn"];
      if (shown && opt.correct) classes.push("ht-mcq-btn-correct");
      else if (!shown && wrongPicks.has(opt.id)) classes.push("ht-mcq-btn-incorrect");
      if (shown) classes.push("ht-mcq-btn-disabled");
      return `<button type="button" class="${classes.join(" ")}" ${attrsFor(opt)} ${shown ? "disabled" : ""}>${escapeHtml(opt.label)}</button>`;
    })
    .join("");
}

/**
 * Render the `ht-mcq-feedback` block shown below an MCQ options row.
 * The exact label text (e.g. "Correct" vs "✓ Correct&ensp;") is passed in
 * by the caller so each quiz keeps its own copy verbatim.
 * @param {{
 *   shown: boolean,
 *   correctLabelHtml: string,
 *   correctFeedback?: string,
 *   correctNoteHtml?: string,
 *   hasWrongPick: boolean,
 *   incorrectLabelHtml: string,
 *   incorrectFeedback?: string,
 *   emptyHtml: string,
 * }} cfg
 * @returns {string} HTML
 */
export function renderMcqFeedbackHtml({
  shown,
  correctLabelHtml,
  correctFeedback,
  correctNoteHtml = "",
  hasWrongPick,
  incorrectLabelHtml,
  incorrectFeedback,
  emptyHtml,
}) {
  if (shown) {
    return `
      <div class="ht-mcq-feedback ht-mcq-feedback-correct">
        <span class="ht-mcq-feedback-label">${correctLabelHtml}</span>${escapeHtml(correctFeedback ?? "")}
      </div>
      ${correctNoteHtml}
    `;
  }
  if (hasWrongPick) {
    return `
      <div class="ht-mcq-feedback ht-mcq-feedback-incorrect">
        <span class="ht-mcq-feedback-label">${incorrectLabelHtml}</span>${escapeHtml(incorrectFeedback ?? "")}
      </div>
    `;
  }
  return emptyHtml;
}
