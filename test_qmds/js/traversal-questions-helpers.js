// traversal-questions-helpers.js
// BFS/DFS traversal-order practice quiz.
//
// Layout per question:
//   LEFT  – static graph (nodes clickable to self-mark)
//   RIGHT – question meta + BFS MCQ + DFS MCQ + nav buttons
//
// MCQ convention:
//   Multiple options may be marked correct: true, because different
//   neighbor-ordering choices produce different-but-equally-valid
//   BFS / DFS sequences.  Any one correct pick solves the section.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { escapeHtml as escHtml } from "./utils/dom-utils.js";
import { renderMcqOptionsHtml, renderMcqFeedbackHtml } from "./utils/guided-quiz-core.js";

// ────────────────────────────────────────────────────────────────────────────
// CSS injection
// ────────────────────────────────────────────────────────────────────────────

const TQ_CSS = `
.tq-quiz-right-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.tq-right-meta {
  font-family: var(--font-mono, monospace);
  font-size: 0.70rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #6d8494;
  margin-bottom: 6px;
}

.tq-convention {
  font-size: 0.74rem;
  color: #6d8494;
  margin-bottom: 10px;
  line-height: 1.45;
}

.tq-hint {
  font-size: 0.74rem;
  color: #6d8494;
  margin-top: 8px;
  font-style: italic;
  text-align: center;
}

.tq-section {
  margin-bottom: 12px;
}

.tq-section-head {
  display: inline-block;
  font-size: 0.70rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 6px;
}
.tq-section-head-bfs { background: #dbeafe; color: #1e40af; }
.tq-section-head-dfs { background: #fed7aa; color: #9a3412; }

.tq-divider {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 10px 0;
}

.tq-note {
  background: #f0f9ff;
  border-left: 3px solid #0ea5e9;
  padding: 7px 11px;
  border-radius: 0 6px 6px 0;
  font-size: 0.83em;
  color: #0c4a6e;
  margin-bottom: 12px;
  line-height: 1.5;
}

.tq-success-banner {
  margin: 8px 0;
  padding: 7px 10px;
  background: #f0fdf4;
  border: 1px solid #22c55e;
  border-radius: 8px;
  font-size: 0.84em;
  color: #14532d;
  font-weight: 600;
  text-align: center;
}

/* Inner controls (inside right panel) */
.tq-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.tq-nav-btn {
  padding: 6px 14px;
  border-radius: 7px;
  border: 1.5px solid #cbd5e1;
  background: #fff;
  cursor: pointer;
  font-size: 0.88em;
  font-family: inherit;
  transition: background 0.15s, border-color 0.15s;
}
.tq-nav-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #64748b;
}
.tq-nav-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.tq-step-indicator {
  font-size: 0.80rem;
  color: #6d8494;
  flex: 1;
  text-align: center;
}

/* Student-click highlight on graph nodes */
.tq-student-hl {
  fill: #fef08a !important;
  stroke: #b45309 !important;
  stroke-width: 2px !important;
}

/* Dim nodes (disconnected component) */
.tq-node-dim .gv-node-circle {
  fill: #e2e8f0 !important;
  stroke: #94a3b8 !important;
}
.tq-node-dim .gv-node-label {
  fill: #64748b !important;
}
`;

let _tqStylesInjected = false;
function injectTqStyles() {
  if (_tqStylesInjected) return;
  const el = document.createElement("style");
  el.id = "tq-injected-styles";
  el.textContent = TQ_CSS;
  document.head.appendChild(el);
  _tqStylesInjected = true;
}

// ────────────────────────────────────────────────────────────────────────────
// Clickable static graph
// ────────────────────────────────────────────────────────────────────────────
//
// The container MUST have the classes "gv-root gv-static" for the shared
// graph.css rules to apply (edge stroke colour etc.).  mountQuizGraph adds
// them automatically.

/**
 * @param {HTMLElement} container
 * @param {{ nodes: {id,label?,x,y}[], edges: {source,target}[] }} data
 * @param {{ width?: number, height?: number, startNode?: string, dimNodes?: string[] }} options
 */
export function mountQuizGraph(container, data, options = {}) {
  if (!container) return;

  const width     = options.width     ?? 350;
  const height    = options.height    ?? 280;
  const startNode = options.startNode ?? null;
  const dimSet    = new Set(options.dimNodes ?? []);

  // Needed so that .gv-static .gv-edge-line CSS rule applies.
  container.classList.add("gv-root", "gv-static");
  container.innerHTML = "";

  const studentHL = new Set();

  const svg = d3.select(container)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width",   width)
    .attr("height",  height)
    .attr("class",   "gv-svg");

  const byId = new Map(data.nodes.map(n => [n.id, n]));

  // Edges
  svg.append("g")
    .attr("class", "gv-edge-layer")
    .selectAll("line")
    .data(data.edges)
    .enter()
    .append("line")
    .attr("class", "gv-edge-line")
    .attr("x1", d => byId.get(d.source)?.x ?? 0)
    .attr("y1", d => byId.get(d.source)?.y ?? 0)
    .attr("x2", d => byId.get(d.target)?.x ?? 0)
    .attr("y2", d => byId.get(d.target)?.y ?? 0);

  // Nodes
  const nodeSel = svg.append("g")
    .attr("class", "gv-node-layer")
    .selectAll("g.gv-node")
    .data(data.nodes, d => d.id)
    .enter()
    .append("g")
    .attr("class", d => "gv-node" + (dimSet.has(d.id) ? " tq-node-dim" : ""))
    .attr("data-id",   d => d.id)
    .attr("transform", d => `translate(${d.x},${d.y})`)
    .style("cursor",   d => (startNode && d.id === startNode) || dimSet.has(d.id)
      ? "default" : "pointer");

  nodeSel.append("circle")
    .attr("r", 25)   // smaller radius
    .attr("stroke-width", "2")
    .attr("class", d =>
      "gv-node-circle" + (startNode && d.id === startNode ? " gv-start" : "")
    );

  nodeSel.append("text")
    .attr("class",       "gv-node-label")
    .attr("text-anchor", "middle")
    .attr("dy",          "0.43em")
    .attr("font-size",   "20px")
    .text(d => d.label ?? d.id);

  // Click → toggle student yellow-ring mark
  nodeSel.on("click", function (event, d) {
    if ((startNode && d.id === startNode) || dimSet.has(d.id)) return;
    if (studentHL.has(d.id)) studentHL.delete(d.id);
    else studentHL.add(d.id);
    d3.select(this).select("circle").attr("class", () => {
      let cls = "gv-node-circle";
      if (studentHL.has(d.id)) cls += " tq-student-hl";
      return cls;
    });
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Utility
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Questions
// ────────────────────────────────────────────────────────────────────────────
//
// Two options may be marked correct: true (different tie-breaking choices,
// both produce valid BFS/DFS sequences).  Any one correct pick solves the
// section.  Wrong options are sequences that violate the traversal rules
// entirely (neither BFS nor DFS for this graph).
export const TRAVERSAL_ORDER_QUESTIONS = [

    // ══════════════════════════════════════════════════════════════════════════
    // Q1 — Simple binary tree
    //
    //       A  (start)
    //      / \
    //     B   C
    //    /     \
    //   D       E
    //
    // Valid BFS: A B C D E   or   A C B E D
    // Valid DFS: A B D C E   or   A C E B D
    // ══════════════════════════════════════════════════════════════════════════
    {
      prompt: "A simple tree — what order do BFS and DFS visit the nodes from A?",
      startNode: "A",
      graphData: {
        nodes: [
          { id: "A", x: 165, y: 44  },
          { id: "B", x: 62,  y: 140 },
          { id: "C", x: 250, y: 140 },
          { id: "D", x: 50,  y: 238 },
          { id: "E", x: 260, y: 238 },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "A", target: "C" },
          { source: "B", target: "D" },
          { source: "C", target: "E" },
        ],
      },
      graphWidth: 350,
      graphHeight: 280,
      bfs: {
        description: "Queue — level by level",
        options: [
          {
            id: "bfs-1",
            label: "A → B → C → D → E",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "bfs-2",
            label: "A → C → B → E → D",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "bfs-3",
            label: "A → B → D → C → E",
            correct: false,
            feedback: "That is a valid DFS path, not BFS.",
          },
        ],
      },
      dfs: {
        description: "Stack — go deep first",
        options: [
          {
            id: "dfs-1",
            label: "A → B → D → C → E",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "dfs-2",
            label: "A → C → E → B → D",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "dfs-3",
            label: "A → B → C → D → E",
            correct: false,
            feedback: "That is the BFS order.",
          },
        ],
      },
    },
  
    // ══════════════════════════════════════════════════════════════════════════
    // Q2 — Wider tree (3 children from root, 2 with one child each)
    //
    //            A  (start)
    //          / | \
    //         B  C  D
    //        /       \
    //       E          F
    //
    // Valid BFS: A B C D E F   or   A D C B F E
    // Valid DFS: A B E C D F   or   A D F C B E
    // ══════════════════════════════════════════════════════════════════════════
    {
      prompt: "A wider tree — A has three direct neighbors. Try BFS and DFS from A.",
      startNode: "A",
      graphData: {
        nodes: [
          { id: "A", x: 169, y: 31  },
          { id: "B", x: 62,  y: 137 },
          { id: "C", x: 169, y: 137 },
          { id: "D", x: 276, y: 137 },
          { id: "E", x: 26,  y: 241 },
          { id: "F", x: 312, y: 241 },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "A", target: "C" },
          { source: "A", target: "D" },
          { source: "B", target: "E" },
          { source: "D", target: "F" },
        ],
      },
      graphWidth: 340,
      graphHeight: 275,
      bfs: {
        description: "Queue — level by level",
        options: [
          {
            id: "bfs-1",
            label: "A → B → C → D → E → F",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "bfs-2",
            label: "A → D → C → B → F → E",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "bfs-3",
            label: "A → B → E → C → D → F",
            correct: false,
            feedback: "That is a valid DFS path, not BFS.",
          },
        ],
      },
      dfs: {
        description: "Stack — go deep first",
        options: [
          {
            id: "dfs-1",
            label: "A → B → E → C → D → F",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "dfs-2",
            label: "A → D → F → C → B → E",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "dfs-3",
            label: "A → B → C → D → E → F",
            correct: false,
            feedback: "That is the BFS order.",
          },
        ],
      },
    },
  
    // ══════════════════════════════════════════════════════════════════════════
    // Q3 — One cycle (D reachable via two paths)
    //
    //       A  (start)
    //      / \
    //     B   C
    //      \ /
    //       D   ←── reachable via A→B→D  AND  A→C→D
    //       |
    //       E
    //
    // Valid BFS: A B C D E   or   A C B D E
    // Valid DFS: A B D E C   or   A C D E B
    // ══════════════════════════════════════════════════════════════════════════
    {
      prompt: "This graph has a cycle — D can be reached via B or via C. Can you find BFS and DFS from A?",
      note: "We see there is a node (D) which can be reached from 2 different paths: A→B→D and A→C→D. This does not change much in our traversal! We will only make note of this node the first time we encounter it.",
      startNode: "A",
      graphData: {
        nodes: [
          { id: "A", x: 169, y: 29  },
          { id: "B", x: 81,  y: 133 },
          { id: "C", x: 257, y: 133 },
          { id: "D", x: 169, y: 239 },
          { id: "E", x: 169, y: 335 },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "A", target: "C" },
          { source: "B", target: "D" },
          { source: "C", target: "D" }, // second path to D
          { source: "D", target: "E" },
        ],
      },
      graphWidth: 340,
      graphHeight: 370,
      bfs: {
        description: "Queue — level by level",
        options: [
          {
            id: "bfs-1",
            label: "A → B → C → D → E",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "bfs-2",
            label: "A → C → B → D → E",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "bfs-3",
            label: "A → B → D → E → C",
            correct: false,
            feedback: "That is a valid DFS path, not BFS.",
          },
        ],
      },
      dfs: {
        description: "Stack — go deep first",
        options: [
          {
            id: "dfs-1",
            label: "A → B → D → E → C",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "dfs-2",
            label: "A → C → D → E → B",
            correct: true,
            feedback: "Correct! Both B-first and C-first orderings are valid.",
          },
          {
            id: "dfs-3",
            label: "A → B → C → D → E",
            correct: false,
            feedback: "That is the BFS order.",
          },
        ],
      },
    },
  
    // ══════════════════════════════════════════════════════════════════════════
    // Q4 — Multiple cycles
    //
    //   A ── B ── C
    //   |   |
    //   D ── E        D–E creates a back-edge (second cycle)
    //   |
    //   F
    //
    // Valid BFS: A B D C E F   or   A D B E F C
    // Valid DFS: A B C E D F   or   A D F E B C
    // ══════════════════════════════════════════════════════════════════════════
    {
      prompt: "A graph with multiple cycles — trace BFS and DFS carefully from A.",
      startNode: "A",
      graphData: {
        nodes: [
          { id: "A", x: 68,  y: 52  },
          { id: "B", x: 192, y: 52  },
          { id: "C", x: 317, y: 52  },
          { id: "D", x: 68,  y: 166 },
          { id: "E", x: 192, y: 166 },
          { id: "F", x: 68,  y: 270 },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "A", target: "D" },
          { source: "B", target: "C" },
          { source: "B", target: "E" },
          { source: "D", target: "E" }, // back-edge
          { source: "D", target: "F" },
        ],
      },
      graphWidth: 345,
      graphHeight: 302,
      bfs: {
        description: "Queue — level by level",
        options: [
          {
            id: "bfs-1",
            label: "A → B → D → C → E → F",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "bfs-2",
            label: "A → D → B → E → F → C",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "bfs-3",
            label: "A → B → C → E → D → F",
            correct: false,
            feedback: "That is a valid DFS path, not BFS.",
          },
        ],
      },
      dfs: {
        description: "Stack — go deep first",
        options: [
          {
            id: "dfs-1",
            label: "A → B → C → E → D → F",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "dfs-2",
            label: "A → D → F → E → B → C",
            correct: true,
            feedback: "Correct! Both B-first and D-first orderings are valid.",
          },
          {
            id: "dfs-3",
            label: "A → B → D → C → E → F",
            correct: false,
            feedback: "That is the BFS order.",
          },
        ],
      },
    },
  
    // ══════════════════════════════════════════════════════════════════════════
    // Q5 — Disconnected graph
    //
    //   Component 1 (left)   ‖   Component 2 (right — greyed, unreachable)
    //        A  (start)      ‖        D
    //       / \              ‖       / \
    //      B   C             ‖      E   F
    //
    // BFS from A: A B C  or  A C B
    // DFS from A: A B C  or  A C B
    // ══════════════════════════════════════════════════════════════════════════
    {
      prompt: "This graph has two separate components. Starting at A — which nodes can you reach?",
      note: "We cannot traverse the second component (D–E–F) from A. The graph is disconnected — we would have to restart the traversal for the second half.",
      startNode: "A",
      dimNodes: ["D", "E", "F"],
      graphData: {
        nodes: [
          { id: "A", x: 86,  y: 114 },
          { id: "B", x: 36,  y: 221 },
          { id: "C", x: 135, y: 221 },
          { id: "D", x: 257, y: 75  },
          { id: "E", x: 213, y: 192 },
          { id: "F", x: 302, y: 192 },
        ],
        edges: [
          { source: "A", target: "B" },
          { source: "A", target: "C" },
          { source: "D", target: "E" },
          { source: "D", target: "F" },
        ],
      },
      graphWidth: 340,
      graphHeight: 268,
      bfs: {
        description: "Queue from A — what is reachable?",
        options: [
          {
            id: "bfs-1",
            label: "A → B → C",
            correct: true,
            feedback: "Correct! Both orderings are valid — D, E, F aren't reachable from A.",
          },
          {
            id: "bfs-2",
            label: "A → C → B",
            correct: true,
            feedback: "Correct! Both orderings are valid — D, E, F aren't reachable from A.",
          },
          {
            id: "bfs-3",
            label: "A → B → C → D → E → F",
            correct: false,
            feedback: "D, E, F are unreachable from A — they're in a separate component.",
          },
        ],
      },
      dfs: {
        description: "Stack from A — what is reachable?",
        options: [
          {
            id: "dfs-1",
            label: "A → B → C",
            correct: true,
            feedback: "Correct! Both orderings are valid — D, E, F aren't reachable from A.",
          },
          {
            id: "dfs-2",
            label: "A → C → B",
            correct: true,
            feedback: "Correct! Both orderings are valid — D, E, F aren't reachable from A.",
          },
          {
            id: "dfs-3",
            label: "A → B → C → D → E → F",
            correct: false,
            feedback: "D, E, F are unreachable from A — they're in a separate component.",
          },
        ],
      },
    },
  ];
// ────────────────────────────────────────────────────────────────────────────
// Quiz mount
// ────────────────────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} container
 * @param {{ questions?: object[], defaultGraphWidth?: number, defaultGraphHeight?: number }} options
 */
export function mountTraversalOrderQuiz(container, options = {}) {
  if (!container) return null;
  injectTqStyles();

  const questions = options.questions ?? TRAVERSAL_ORDER_QUESTIONS;
  const total     = questions.length;

  // Per-question state
  const bfsTried  = questions.map(() => new Set());
  const dfsTried  = questions.map(() => new Set());
  const bfsSolved = questions.map(() => false);
  const dfsSolved = questions.map(() => false);

  let qIdx = 0;

  // ── DOM skeleton ──────────────────────────────────────────────────────────

  container.innerHTML = "";
  container.classList.add("ht-quiz");

  const layout = document.createElement("div");
  layout.className = "ht-quiz-layout";

  // LEFT: graph only
  const left = document.createElement("div");
  left.className = "ht-quiz-left";

  const graphMount = document.createElement("div");
  graphMount.className = "tq-graph-mount";   // gv-root / gv-static added by mountQuizGraph

  const hint = document.createElement("div");
  hint.className = "tq-hint";

  left.append(graphMount, hint);

  // RIGHT: meta + note + MCQ sections + controls
  const right = document.createElement("div");
  right.className = "ht-quiz-right";
  right.style.cssText = "display:flex;flex-direction:column;min-width:260px;";

  layout.append(left, right);
  container.append(layout);

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    const q        = questions[qIdx];
    const bs       = bfsSolved[qIdx];
    const ds       = dfsSolved[qIdx];
    const bothDone = bs && ds;

    // Graph (node toggles reset on navigation — intentional)
    mountQuizGraph(graphMount, q.graphData, {
      width:     q.graphWidth  ?? options.defaultGraphWidth  ?? 350,
      height:    q.graphHeight ?? options.defaultGraphHeight ?? 280,
      startNode: q.startNode,
      dimNodes:  q.dimNodes ?? [],
    });

    // Right panel: rebuild HTML
    right.innerHTML = buildRightHtml(q, qIdx);

    // Wire MCQ buttons
    right.querySelectorAll("[data-mcq-section]").forEach(btn => {
      btn.addEventListener("click", () => {
        const section = btn.getAttribute("data-mcq-section");
        const optId   = btn.getAttribute("data-opt-id");
        if (!optId || !section) return;
        if (section === "bfs" && bfsSolved[qIdx]) return;
        if (section === "dfs" && dfsSolved[qIdx]) return;

        const opt = q[section].options.find(o => o.id === optId);
        if (!opt) return;
        if (opt.correct) {
          if (section === "bfs") bfsSolved[qIdx] = true;
          else                   dfsSolved[qIdx] = true;
        } else {
          if (section === "bfs") bfsTried[qIdx].add(optId);
          else                   dfsTried[qIdx].add(optId);
        }
        render();
      });
    });

    // Wire nav buttons (rendered inside right panel)
    const prevBtn = right.querySelector("[data-tq-nav=prev]");
    const nextBtn = right.querySelector("[data-tq-nav=next]");
    if (prevBtn) prevBtn.addEventListener("click", () => { qIdx--; render(); });
    if (nextBtn) nextBtn.addEventListener("click", () => { qIdx++; render(); });
  }

  // ── HTML builders ─────────────────────────────────────────────────────────

  function buildRightHtml(q, idx) {
    const bs = bfsSolved[idx];
    const ds = dfsSolved[idx];
    const bothDone = bs && ds;
    const isFirst  = idx === 0;
    const isLast   = idx === total - 1;

    const metaHtml = `
      <div class="tq-right-meta">
        Question ${idx + 1} of ${total}</strong>
      </div>`;

    const noteHtml = q.note
      ? `<div class="tq-note">${escHtml(q.note)}</div>`
      : "";

    const successHtml = bothDone
      ? `<div class="tq-success-banner">Both correct! Press Next to continue.</div>`
      : "";

    const indText = bothDone
      ? (isLast ? "All done! 🎉" : "Solved ✓")
      : "Answer both to continue";

    const controlsHtml = `
      <div class="tq-controls">
        <button class="tq-nav-btn" data-tq-nav="prev" ${isFirst ? "disabled" : ""}>← Prev</button>
        <span class="tq-step-indicator">${escHtml(indText)}</span>
        <button class="tq-nav-btn" data-tq-nav="next"
          ${(!bothDone || isLast) ? "disabled" : ""}>Next →</button>
      </div>`;

    return `
      ${metaHtml}
      ${noteHtml}
      ${buildSectionHtml("bfs", q, idx)}
      <hr class="tq-divider">
      ${buildSectionHtml("dfs", q, idx)}
      ${successHtml}
      ${controlsHtml}
    `;
  }

  function buildSectionHtml(section, q, idx) {
    const solved   = section === "bfs" ? bfsSolved[idx] : dfsSolved[idx];
    const tried    = section === "bfs" ? bfsTried[idx]  : dfsTried[idx];
    const info     = q[section];
    const badgeCls = section === "bfs" ? "tq-section-head-bfs" : "tq-section-head-dfs";
    const label    = section === "bfs" ? "BFS" : "DFS";

    const optionsHtml = renderMcqOptionsHtml(info.options, {
      shown: solved,
      wrongPicks: tried,
      dataAttrsFor: (opt) => `data-mcq-section="${section}" data-opt-id="${escHtml(opt.id)}"`,
    });

    // Find which correct option the student actually clicked (last non-tried correct)
    const picked = info.options.find(o => o.correct && !tried.has(o.id)) ??
                   info.options.find(o => o.correct);
    const lastWrongId = tried.size > 0 ? [...tried][tried.size - 1] : null;
    const lastWrongOpt = lastWrongId ? info.options.find(o => o.id === lastWrongId) : null;

    const feedbackHtml = renderMcqFeedbackHtml({
      shown: solved,
      correctLabelHtml: "✓ Correct&ensp;",
      correctFeedback: picked?.feedback,
      hasWrongPick: tried.size > 0,
      incorrectLabelHtml: "✗ Not quite&ensp;",
      incorrectFeedback: lastWrongOpt?.feedback,
      emptyHtml: `<div class="ht-mcq-feedback-hidden">Pick an answer to check.</div>`,
    });

    return `
      <div class="tq-section">
        <span class="tq-section-head ${badgeCls}">${escHtml(label)} — ${escHtml(info.description)}</span>
        <div class="ht-mcq-options">${optionsHtml}</div>
        ${feedbackHtml}
      </div>
    `;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────

  render();

  return {
    getState: () => ({ qIdx, bfsSolved: [...bfsSolved], dfsSolved: [...dfsSolved] }),
    goTo: (i) => { qIdx = Math.max(0, Math.min(total - 1, i)); render(); },
  };
}
