// bfs-dfs-order.js
// DIY traversal sandbox: build a graph on the left, then pop nodes from an
// ordered bag on the right. Popping from the end mimics DFS (stack); popping
// from the start mimics BFS (queue). Neighbours are always appended in
// alphabetical order.

import { GraphEngine } from "./graph-engine.js";
import { mountGraphView } from "./graph-view.js";

const DEFAULT_DATA = {
  nodes: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
    { id: "C", label: "C" },
    { id: "D", label: "D" },
    { id: "E", label: "E" },
    { id: "F", label: "F" },
    { id: "G", label: "G" },
    { id: "H", label: "H" },
  ],
  edges: [
    { id: "e0", source: "A", target: "B", label: "" },
    { id: "e1", source: "A", target: "C", label: "" },
    { id: "e2", source: "B", target: "D", label: "" },
    { id: "e3", source: "C", target: "E", label: "" },
    { id: "e4", source: "E", target: "F", label: "" },
    { id: "e5", source: "F", target: "H", label: "" },
    { id: "e6", source: "G", target: "C", label: "" },
    { id: "e7", source: "G", target: "D", label: "" },
    { id: "e8", source: "G", target: "E", label: "" },
  ],
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeLabel(engine, id) {
  return engine.nodes.get(id)?.label ?? id;
}

function compareLabels(engine, a, b) {
  const la = String(nodeLabel(engine, a));
  const lb = String(nodeLabel(engine, b));
  return la.localeCompare(lb, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Unvisited neighbours of `nodeId`, sorted alphabetically by label.
 * @param {GraphEngine} engine
 * @param {string} nodeId
 * @param {Set<string>} seen
 */
function sortedNewNeighbours(engine, nodeId, seen) {
  return engine
    .getNeighbours(nodeId)
    .map((n) => n.id)
    .filter((id) => !seen.has(id))
    .sort((a, b) => compareLabels(engine, a, b));
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   data?: {nodes: Array, edges: Array},
 *   directed?: boolean,
 *   width?: number,
 *   height?: number,
 * }} [options]
 */
export function mountBfsDfsOrderView(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 480;
  const height = options.height ?? 380;
  const directed = !!options.directed;
  const initialData = options.data ?? DEFAULT_DATA;

  const engine = new GraphEngine(initialData, { directed });

  container.innerHTML = "";
  container.classList.add("bdo-root");

  const grid = document.createElement("div");
  grid.className = "bdo-grid";
  container.appendChild(grid);

  // ---- left: sandbox graph ----
  const left = document.createElement("div");
  left.className = "bdo-left panel";
  grid.appendChild(left);

  const graphEl = document.createElement("div");
  graphEl.className = "bdo-graph";
  left.appendChild(graphEl);

  mountGraphView(engine, graphEl, {
    width,
    height,
    showToolbar: true,
    caption: "Build your graph, then select a start node",
  });

  // ---- right: bag + visit order ----
  const right = document.createElement("div");
  right.className = "bdo-right";
  grid.appendChild(right);

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Bag (ordered list)";
  right.appendChild(heading);

  const status = document.createElement("div");
  status.className = "bdo-status";
  right.appendChild(status);

  const feedback = document.createElement("div");
  feedback.className = "bdo-feedback bdo-feedback-hidden";
  feedback.setAttribute("role", "status");
  right.appendChild(feedback);

  const bagPanel = document.createElement("div");
  bagPanel.className = "ht-bag";
  bagPanel.setAttribute("aria-label", "Bag");
  right.appendChild(bagPanel);

  const visitPanel = document.createElement("div");
  visitPanel.className = "ht-track";
  visitPanel.setAttribute("aria-label", "Visit order");
  right.appendChild(visitPanel);

  const hint = document.createElement("div");
  hint.className = "bdo-hint";
  hint.innerHTML =
    "Tip: pop from the <strong>right</strong> for DFS (stack), or from the <strong>left</strong> for BFS (queue).";
  right.appendChild(hint);

  const controls = document.createElement("div");
  controls.className = "bdo-controls";
  right.appendChild(controls);

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "gv-btn";
  startBtn.textContent = "Start";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "gv-btn";
  resetBtn.textContent = "Reset";

  controls.append(startBtn, resetBtn);

  // ---- traversal state ----
  /** @type {"idle" | "running" | "done"} */
  let phase = "idle";
  /** @type {string[]} */
  let bag = [];
  /** @type {Set<string>} nodes already encountered (in bag or visited) */
  let seen = new Set();
  /** @type {string[]} nodes popped so far */
  let visitOrder = [];
  /** @type {string|null} */
  let current = null;
  /** @type {("bfs" | "dfs" | "other")[]} pops from a bag with 2+ items */
  let popChoices = [];

  /**
   * Classify a pop. With one item, front and back are the same — skip.
   * @param {number} index
   * @param {number} length
   * @returns {"bfs" | "dfs" | "other" | null}
   */
  function classifyPop(index, length) {
    if (length <= 1) return null;
    if (index === 0) return "bfs";
    if (index === length - 1) return "dfs";
    return "other";
  }

  /** @returns {"dfs" | "bfs" | "mixed" | null} */
  function strategyResult() {
    if (popChoices.length === 0) return null;
    if (popChoices.some((c) => c === "other")) return "mixed";
    const usedBfs = popChoices.some((c) => c === "bfs");
    const usedDfs = popChoices.some((c) => c === "dfs");
    if (usedBfs && usedDfs) return "mixed";
    if (usedDfs) return "dfs";
    if (usedBfs) return "bfs";
    return null;
  }

  function setToolbarEnabled(enabled) {
    const toolbar = graphEl.querySelector(".gv-toolbar");
    if (toolbar) toolbar.classList.toggle("bdo-toolbar-locked", !enabled);
  }

  function syncViz() {
    engine.setViz({
      visited: visitOrder,
      frontier: bag,
      currentNode: current,
      currentNeighbor: null,
      activeEdges: [],
    });
  }

  function renderBag() {
    const header = `<div class="ht-bag-header"><span class="ht-bag-title">TO BE EXPLORED</span></div>`;
    let body;
    if (bag.length === 0) {
      body = `<div class="ht-bag-empty">${
        phase === "idle" ? "start a traversal to fill the bag…" : "bag empty"
      }</div>`;
    } else {
      body = bag
        .map((id, index) => {
          const label = escapeHtml(nodeLabel(engine, id));
          const endHint =
            index === 0
              ? " title=\"Front of list — BFS pops here\""
              : index === bag.length - 1
                ? " title=\"End of list — DFS pops here\""
                : "";
          const endCls =
            index === 0
              ? " bdo-chip-front"
              : index === bag.length - 1
                ? " bdo-chip-back"
                : "";
          return `<button type="button" class="ht-bag-chip bdo-chip${endCls}" data-id="${escapeHtml(id)}"${endHint}>${label}</button>`;
        })
        .join("");
    }
    const footer = `<div class="ht-bag-footer">alphabetical append · click a chip to pop</div>`;
    bagPanel.innerHTML = `${header}<div class="ht-bag-body">${body}</div>${footer}`;

    if (phase === "running") {
      bagPanel.querySelectorAll("button.bdo-chip").forEach((btn) => {
        btn.addEventListener("click", () => popFromBag(btn.getAttribute("data-id")));
      });
    }
  }

  function renderVisitOrder() {
    const header = `<div class="ht-track-header"><span class="ht-track-title">VISIT ORDER</span></div>`;
    const body =
      visitOrder.length === 0
        ? `<div class="ht-track-empty">no nodes visited yet…</div>`
        : visitOrder
            .map(
              (id, i) =>
                `<span class="ht-track-chip" data-id="${escapeHtml(id)}">${i + 1}. ${escapeHtml(nodeLabel(engine, id))}</span>`
            )
            .join("");
    const footer = `<div class="ht-track-footer">order you popped from the bag</div>`;
    visitPanel.innerHTML = `${header}<div class="ht-track-body">${body}</div>${footer}`;
  }

  function renderFeedback() {
    feedback.classList.remove(
      "bdo-feedback-hidden",
      "bdo-feedback-dfs",
      "bdo-feedback-bfs",
      "bdo-feedback-mixed"
    );

    if (phase !== "done") {
      feedback.textContent = "";
      feedback.classList.add("bdo-feedback-hidden");
      return;
    }

    const result = strategyResult();
    if (result === "dfs") {
      feedback.textContent = "Congrats — you got the correct DFS!";
      feedback.classList.add("bdo-feedback-dfs");
    } else if (result === "bfs") {
      feedback.textContent = "Congrats — you got the correct BFS!";
      feedback.classList.add("bdo-feedback-bfs");
    } else if (result === "mixed") {
      feedback.textContent = "Maybe you switched strategies somewhere?";
      feedback.classList.add("bdo-feedback-mixed");
    } else {
      // Only trivial single-item pops — nothing to judge yet.
      feedback.textContent = "";
      feedback.classList.add("bdo-feedback-hidden");
    }
  }

  function renderStatus() {
    if (phase === "idle") {
      const sel = engine.selection;
      if (sel?.type === "node") {
        status.textContent = `Start node selected: ${nodeLabel(engine, sel.id)}. Press Start to begin.`;
      } else {
        status.textContent = "Select a start node on the graph, then press Start.";
      }
      status.classList.remove("bdo-status-done");
    } else if (phase === "running") {
      if (current != null) {
        status.textContent = `Visiting ${nodeLabel(engine, current)}. Click a node in the bag to pop next.`;
      } else {
        status.textContent = "Click a node in the bag to pop it.";
      }
      status.classList.remove("bdo-status-done");
    } else {
      const order = visitOrder.map((id) => nodeLabel(engine, id)).join(" → ");
      const unreachable = visitOrder.length < engine.nodes.size;
      status.textContent = unreachable
        ? `Bag empty. Visit order: ${order || "(empty)"}. Some nodes were unreachable from the start.`
        : `Done! Visit order: ${order || "(empty)"}`;
      status.classList.add("bdo-status-done");
    }

    renderFeedback();
    startBtn.disabled = phase !== "idle";
  }

  function render() {
    renderBag();
    renderVisitOrder();
    renderStatus();
    syncViz();
  }

  function startTraversal() {
    if (phase !== "idle") return;
    const sel = engine.selection;
    if (!sel || sel.type !== "node") {
      status.textContent = "Select a start node on the graph first.";
      return;
    }
    if (!engine.nodes.has(sel.id)) {
      status.textContent = "That start node no longer exists. Select another.";
      return;
    }
    if (engine.nodes.size === 0) {
      status.textContent = "Add some nodes before starting.";
      return;
    }

    phase = "running";
    bag = [sel.id];
    seen = new Set([sel.id]);
    visitOrder = [];
    current = null;
    popChoices = [];
    setToolbarEnabled(false);
    render();
  }

  function popFromBag(id) {
    if (phase !== "running" || id == null) return;
    const index = bag.indexOf(id);
    if (index < 0) return;

    const choice = classifyPop(index, bag.length);
    if (choice) popChoices.push(choice);

    bag.splice(index, 1);
    current = id;
    visitOrder.push(id);

    const newcomers = sortedNewNeighbours(engine, id, seen);
    for (const n of newcomers) {
      seen.add(n);
      bag.push(n);
    }

    if (bag.length === 0) {
      phase = "done";
    }
    render();
  }

  function resetTraversal() {
    phase = "idle";
    bag = [];
    seen = new Set();
    visitOrder = [];
    current = null;
    popChoices = [];
    engine.clearViz();
    setToolbarEnabled(true);
    render();
  }

  startBtn.addEventListener("click", startTraversal);
  resetBtn.addEventListener("click", resetTraversal);

  // Keep status text in sync when the student selects a start node.
  engine.subscribe(() => {
    if (phase === "idle") renderStatus();
  });

  render();

  return {
    engine,
    reset: resetTraversal,
    start: startTraversal,
  };
}
