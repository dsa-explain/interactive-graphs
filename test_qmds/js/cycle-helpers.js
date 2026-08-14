// cycle-helpers.js
// Guided quiz for undirected cycle detection (DFS + parent).
// Uses mountStaticGraphView (default circular nodes) — not the station theme.

import { mountStaticGraphView } from "./static-graph-view.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fixed undirected square with a cycle — used across Part A questions.
 * Positions are pinned so the layout stays stable between steps.
 */
export const CYCLE_DEMO_GRAPH = {
  nodes: [
    { id: "A", label: "A", x: 80, y: 70 },
    { id: "B", label: "B", x: 280, y: 70 },
    { id: "C", label: "C", x: 280, y: 210 },
    { id: "D", label: "D", x: 80, y: 210 },
  ],
  edges: [
    { id: "A—B", source: "A", target: "B" },
    { id: "B—C", source: "B", target: "C" },
    { id: "C—D", source: "C", target: "D" },
    { id: "D—A", source: "D", target: "A" },
  ],
};

function renderChipPanel({
  title,
  items = [],
  emptyText = "—",
  footer = "",
  pick = null,
  pickDone = null,
  chipClass = "ht-track-chip",
}) {
  const chips =
    items.length === 0
      ? `<div class="ht-track-empty">${escapeHtml(emptyText)}</div>`
      : items
          .map((id) => {
            const done = pickDone != null && id === pickDone;
            const picked = !done && pick != null && id === pick;
            const extra = done
              ? " ht-bag-chip-pick-done"
              : picked
                ? " ht-bag-chip-pick"
                : "";
            const check = done
              ? `<span class="ht-bag-chip-check" aria-hidden="true">✓</span>`
              : "";
            return `<span class="${chipClass}${extra}" data-id="${escapeHtml(id)}">${escapeHtml(id)}${check}</span>`;
          })
          .join("");

  return `
    <div class="ht-track" aria-label="${escapeHtml(title)}">
      <div class="ht-track-header">
        <span class="ht-track-title">${escapeHtml(title)}</span>
      </div>
      <div class="ht-track-body">${chips}</div>
      ${footer ? `<div class="ht-track-footer">${escapeHtml(footer)}</div>` : ""}
    </div>
  `;
}

function renderParentPanel(parent = null, parentMap = null) {
  let body;
  if (parentMap && typeof parentMap === "object") {
    const entries = Object.entries(parentMap);
    body =
      entries.length === 0
        ? `<div class="ht-track-empty">no parents yet…</div>`
        : entries
            .map(
              ([node, p]) =>
                `<span class="ht-track-chip">${escapeHtml(node)}←${escapeHtml(p == null ? "∅" : p)}</span>`
            )
            .join("");
  } else if (parent != null && parent !== "") {
    body = `<span class="ht-track-chip">${escapeHtml(parent)}</span>`;
  } else {
    body = `<div class="ht-track-empty">no parent (start)</div>`;
  }

  return `
    <div class="ht-track" aria-label="Parent">
      <div class="ht-track-header">
        <span class="ht-track-title">PARENT</span>
      </div>
      <div class="ht-track-body">${body}</div>
      <div class="ht-track-footer">who we came from</div>
    </div>
  `;
}

function buildNavControls({ prevDisabled, nextDisabled, nextLabel, indicator, onPrev, onNext }) {
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

  wrap.append(prevBtn, ind, nextBtn);
  return wrap;
}

/**
 * Guided Q&A for cycle detection. Same UX as mountTraversalQuiz
 * (reveal + optional MCQ), but renders with mountStaticGraphView and
 * shows visited / stack / parent panels instead of station bag/rooms.
 *
 * Question shape (compatible with heat-quiz style):
 *   {
 *     prompt: string
 *     note?: string
 *     options?: [{id, label, correct, feedback}]  // MCQ when present
 *     question: Panel
 *     answer: Panel & { text?: string }
 *   }
 *
 * Panel:
 *   {
 *     graph?: {nodes, edges}   // defaults to CYCLE_DEMO_GRAPH
 *     highlight?: object       // passed to mountStaticGraphView
 *     visited?: string[]
 *     stack?: string[]
 *     stackPick?: string|null
 *     stackPickDone?: string|null
 *     parent?: string|null     // single parent label for current node
 *     parentMap?: object       // optional {node: parent} chips
 *   }
 *
 * @param {HTMLElement} container
 * @param {{width?: number, height?: number, questions?: Array, directed?: boolean}} options
 */
export function mountCycleQuiz(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 360;
  const height = options.height ?? 260;
  const directed = !!options.directed;
  const questions = options.questions ?? [];
  const defaultGraph = options.graph ?? CYCLE_DEMO_GRAPH;

  let qIndex = 0;
  let revealed = false;
  let solved = questions.map(() => false);
  let wrongPicks = new Set();

  container.innerHTML = "";
  container.classList.add("ht-quiz", "cy-quiz");

  const layout = document.createElement("div");
  layout.className = "ht-quiz-layout";

  const left = document.createElement("div");
  left.className = "ht-quiz-left";

  const graphMount = document.createElement("div");
  graphMount.className = "ht-quiz-graph cy-quiz-graph";

  const sidePanels = document.createElement("div");
  sidePanels.className = "ht-quiz-side cy-quiz-side";

  left.append(graphMount, sidePanels);

  const right = document.createElement("div");
  right.className = "ht-quiz-right";

  layout.append(left, right);
  container.append(layout);

  function isMCQ(q) {
    return Array.isArray(q.options) && q.options.length > 0;
  }

  function resolvePanel(panel = {}) {
    return {
      graph: panel.graph ?? defaultGraph,
      highlight: panel.highlight ?? {},
      visited: panel.visited ?? panel.tracking ?? [],
      stack: panel.stack ?? panel.bag ?? [],
      stackPick: panel.stackPick ?? panel.bagPick ?? null,
      stackPickDone: panel.stackPickDone ?? panel.bagPickDone ?? null,
      parent: panel.parent ?? null,
      parentMap: panel.parentMap ?? null,
    };
  }

  function render() {
    const q = questions[qIndex];
    if (!q) {
      right.innerHTML = `<p class="ht-quiz-note">No questions configured.</p>`;
      return;
    }

    const mcq = isMCQ(q);
    const shown = mcq ? solved[qIndex] : revealed;
    const resolved = resolvePanel(shown ? q.answer : q.question);

    mountStaticGraphView(graphMount, resolved.graph, {
      width,
      height,
      directed,
      highlight: resolved.highlight,
    });

    sidePanels.innerHTML =
      renderChipPanel({
        title: "VISITED",
        items: resolved.visited,
        emptyText: "none yet…",
        footer: "nodes already explored",
      }) +
      renderChipPanel({
        title: "STACK",
        items: resolved.stack,
        emptyText: "stack empty…",
        footer: "LIFO — next pop is the rightmost",
        pick: resolved.stackPick,
        pickDone: resolved.stackPickDone,
        chipClass: "ht-bag-chip",
      }) +
      renderParentPanel(resolved.parent, resolved.parentMap);

    const isLast = qIndex === questions.length - 1;
    let bodyHtml;

    if (mcq) {
      const optionsHtml = q.options
        .map((opt) => {
          const classes = ["ht-mcq-btn"];
          if (shown && opt.correct) classes.push("ht-mcq-btn-correct");
          else if (!shown && wrongPicks.has(opt.id)) classes.push("ht-mcq-btn-incorrect");
          if (shown) classes.push("ht-mcq-btn-disabled");
          return `<button type="button" class="${classes.join(" ")}" data-id="${escapeHtml(opt.id)}" ${shown ? "disabled" : ""}>${escapeHtml(opt.label)}</button>`;
        })
        .join("");

      let feedbackHtml;
      if (shown) {
        const correct = q.options.find((o) => o.correct);
        feedbackHtml = `
          <div class="ht-mcq-feedback ht-mcq-feedback-correct">
            <span class="ht-mcq-feedback-label">Correct</span>${escapeHtml(correct.feedback)}
          </div>
          ${q.note ? `<p class="ht-quiz-note">${escapeHtml(q.note)}</p>` : ""}
        `;
      } else if (wrongPicks.size > 0) {
        const lastId = [...wrongPicks][wrongPicks.size - 1];
        const opt = q.options.find((o) => o.id === lastId);
        feedbackHtml = `
          <div class="ht-mcq-feedback ht-mcq-feedback-incorrect">
            <span class="ht-mcq-feedback-label">Not quite</span>${escapeHtml(opt?.feedback ?? "")}
          </div>
        `;
      } else {
        feedbackHtml = `<div class="ht-mcq-feedback-hidden">Pick an answer to check.</div>`;
      }

      bodyHtml = `<div class="ht-mcq-options">${optionsHtml}</div>${feedbackHtml}`;
    } else {
      bodyHtml = `
        <div class="ht-quiz-answer-wrap ${shown ? "ht-quiz-answer-visible" : ""}">
          ${
            shown
              ? `<div class="ht-quiz-answer"><span class="ht-quiz-answer-label">Answer</span>${escapeHtml(q.answer.text ?? "")}</div>
                 ${q.note ? `<p class="ht-quiz-note">${escapeHtml(q.note)}</p>` : ""}`
              : `<div class="ht-quiz-answer-hidden">Answer hidden — press Reveal to show</div>`
          }
        </div>
      `;
    }

    right.innerHTML = `
      <div class="ht-quiz-meta">Question ${qIndex + 1} of ${questions.length}</div>
      <h4 class="ht-quiz-prompt">${escapeHtml(q.prompt ?? q.question?.prompt ?? "")}</h4>
      ${bodyHtml}
    `;

    if (mcq) {
      right.querySelectorAll(".ht-mcq-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          const opt = q.options.find((o) => o.id === id);
          if (!opt || solved[qIndex]) return;
          if (opt.correct) {
            solved[qIndex] = true;
          } else {
            wrongPicks.add(id);
          }
          render();
        });
      });
    }

    const controls = buildNavControls({
      prevDisabled: mcq ? qIndex === 0 : qIndex === 0 && !revealed,
      nextDisabled: mcq ? !shown || isLast : shown && qIndex >= questions.length - 1,
      nextLabel: mcq
        ? isLast
          ? shown
            ? "Done"
            : "Solve to finish"
          : "Next question →"
        : !revealed
          ? "Reveal answer →"
          : qIndex < questions.length - 1
            ? "Next question →"
            : "Done",
      indicator: mcq ? (shown ? "Solved" : "Pick one") : revealed ? "Answer shown" : "Think first",
      onPrev: () => {
        if (mcq) {
          if (qIndex > 0) {
            qIndex -= 1;
            wrongPicks = new Set();
            render();
          }
          return;
        }
        if (revealed) {
          revealed = false;
        } else if (qIndex > 0) {
          qIndex -= 1;
          revealed = true;
        }
        render();
      },
      onNext: () => {
        if (mcq) {
          if (shown && qIndex < questions.length - 1) {
            qIndex += 1;
            wrongPicks = new Set();
            render();
          }
          return;
        }
        if (!revealed) {
          revealed = true;
        } else if (qIndex < questions.length - 1) {
          qIndex += 1;
          revealed = false;
        }
        render();
      },
    });
    right.appendChild(controls);
  }

  render();
  return {
    getState: () => ({ qIndex, revealed, solved: [...solved] }),
    goTo: (i, showAnswer = false) => {
      qIndex = Math.max(0, Math.min(questions.length - 1, i));
      revealed = !!showAnswer;
      wrongPicks = new Set();
      render();
    },
  };
}
