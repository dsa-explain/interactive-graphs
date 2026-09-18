// quiz-nav.js
// Shared "← Previous / step N of M / Next →" control bar used by the
// station-theme guided quizzes (graph-traversal-helpers.js, cycle-helpers.js).
// Builds a fresh wrap each call; callers re-invoke it on every render.

/**
 * @param {{
 *   prevDisabled?: boolean,
 *   nextDisabled?: boolean,
 *   nextLabel: string,
 *   indicator: string,
 *   onPrev: () => void,
 *   onNext: () => void,
 *   extraButtons?: HTMLElement[],
 * }} opts
 * @returns {HTMLElement}
 */
export function buildNavControls({
  prevDisabled,
  nextDisabled,
  nextLabel,
  indicator,
  onPrev,
  onNext,
  extraButtons = [],
}) {
  const wrap = document.createElement("div");
  wrap.className = "ht-quiz-controls";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "ht-nav-btn";
  prevBtn.textContent = "← Previous";
  prevBtn.disabled = !!prevDisabled;
  prevBtn.onclick = onPrev;

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "ht-nav-btn";
  nextBtn.textContent = nextLabel;
  nextBtn.disabled = !!nextDisabled;
  nextBtn.onclick = onNext;

  const ind = document.createElement("span");
  ind.className = "ht-step-indicator";
  ind.textContent = indicator;

  wrap.append(prevBtn, ind, nextBtn, ...extraButtons);
  return wrap;
}
