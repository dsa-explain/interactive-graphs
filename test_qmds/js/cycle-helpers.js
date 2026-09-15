// cycle-helpers.js
// Guided step-through quiz for undirected cycle detection.
// Supports progressive graph reveal, edge-status highlighting, and
// a notebook-style three-panel sidebar (VISITED / BAG / EDGES).

import { mountStaticGraphView } from "./static-graph-view.js";
import { GraphEngine } from "./graph-engine.js";
import { mountGraphView } from "./graph-view.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Graph data ────────────────────────────────────────────────────────────────

/**
 * Diamond undirected graph — A connects to B and C; B and C each connect to D.
 * This creates the cycle A→B→D→C→A used in the walk-through questions.
 * All nodes have pinned (x, y) positions for a stable layout.
 */
export const CYCLE_DEMO_GRAPH = {
  nodes: [
    { id: "A", label: "A", x: 180, y: 55  },
    { id: "B", label: "B", x: 75,  y: 170 },
    { id: "C", label: "C", x: 285, y: 170 },
    { id: "D", label: "D", x: 180, y: 285 },
  ],
  edges: [
    { id: "A-B", source: "A", target: "B", label: "A-B" },
    { id: "A-C", source: "A", target: "C", label: "A-C" },
    { id: "B-D", source: "B", target: "D", label: "B-D" },
    { id: "C-D", source: "C", target: "D", label: "C-D" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Filter graph to only the specified visible node/edge sets.
 *  Passing null for either means "show all". */
function filterGraph(graph, visibleNodes, visibleEdges) {
  if (!visibleNodes && !visibleEdges) return graph;
  const nodeSet = visibleNodes ? new Set(visibleNodes) : null;
  const edgeSet  = visibleEdges ? new Set(visibleEdges) : null;
  return {
    nodes: nodeSet ? graph.nodes.filter((n) => nodeSet.has(n.id)) : graph.nodes,
    edges: edgeSet ? graph.edges.filter((e) => edgeSet.has(e.id)) : graph.edges,
  };
}

// ── Panel renderers (notebook-style: no footers/subtitles) ────────────────────

function renderChipPanel({
  title,
  items = [],
  emptyText = "—",
  pick = null,
  pickDone = null,
  chipClass = "ht-track-chip",
}) {
  const chips =
    items.length === 0
      ? `<div class="ht-track-empty">${escapeHtml(emptyText)}</div>`
      : items
          .map((id) => {
            const done   = pickDone != null && id === pickDone;
            const picked = !done && pick != null && id === pick;
            const extra  = done
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
    </div>
  `;
}

/** Parent panel — no arrows, no footer. */
function renderParentPanel(parentMap = null) {
  let body;
  if (parentMap && typeof parentMap === "object") {
    const entries = Object.entries(parentMap);
    body =
      entries.length === 0
        ? `<div class="ht-track-empty">no parents yet…</div>`
        : entries
            .map(
              ([node, p]) =>
                `<span class="ht-track-chip">${escapeHtml(node)}: ${escapeHtml(
                  p == null ? "∅" : p
                )}</span>`
            )
            .join("");
  } else {
    body = `<div class="ht-track-empty">—</div>`;
  }
  return `
    <div class="ht-track" aria-label="Parent">
      <div class="ht-track-header">
        <span class="ht-track-title">PARENT</span>
      </div>
      <div class="ht-track-body">${body}</div>
    </div>
  `;
}

/** EDGES panel — shows used/tracked edges. */
function renderEdgesPanel(usedEdges = []) {
  const chips =
    usedEdges.length === 0
      ? `<div class="ht-track-empty">none yet…</div>`
      : usedEdges
          .map(
            (e) =>
              `<span class="ht-track-chip cy-edge-chip">${escapeHtml(e)}</span>`
          )
          .join("");
  return `
    <div class="ht-track" aria-label="Used Edges">
      <div class="ht-track-header">
        <span class="ht-track-title">EDGES</span>
      </div>
      <div class="ht-track-body">${chips}</div>
    </div>
  `;
}

/** Small inline colour-coded legend for the node/edge statuses. */
function renderLegend() {
  return `
    <div class="cy-legend">
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:var(--coral,#feb686);border-color:var(--line,#19162b)"></span>current
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:#86c0fe;border-color:#e8f2ff"></span>unvisited
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:#d8d4ef;border-color:var(--line,#19162b)"></span>visited nbr
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-line" style="background:#ff9f6b"></span>active edge
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-line" style="background:#86c0fe"></span>used edge
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-line" style="background:#ef4444"></span>cycle edge
      </span>
    </div>
  `;
}

// ── Nav controls ──────────────────────────────────────────────────────────────

function buildNavControls({
  prevDisabled,
  nextDisabled,
  nextLabel,
  indicator,
  onPrev,
  onNext,
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

  wrap.append(prevBtn, ind, nextBtn);
  return wrap;
}

// ── Mount function ────────────────────────────────────────────────────────────

/**
 * Guided step-through quiz for cycle detection.
 *
 * Question shape:
 *   {
 *     prompt:   string
 *     note?:    string
 *     options?: [{id, label, correct, feedback}]   // MCQ when present
 *     question: Panel
 *     answer:   Panel & { text?: string }
 *   }
 *
 * Panel:
 *   {
 *     graph?:             {nodes, edges}       // defaults to CYCLE_DEMO_GRAPH
 *     highlight?:         object               // passed to mountStaticGraphView
 *     visited?:           string[]             // chip panel
 *     bag?/stack?:        string[]             // chip panel
 *     bagPick?/stackPick? string|null
 *     // Progressive reveal (null = show all):
 *     visibleNodes?:      string[]|null
 *     visibleEdges?:      string[]|null
 *     // Edge/node statuses (cycle detection):
 *     usedEdges?:         string[]|null        // shown in EDGES panel + blue on graph
 *     activeEdges?:       string[]             // orange on graph
 *     visitedNeighbours?: string[]             // lavender nodes on graph
 *     cycleEdge?:         string               // red edge on graph
 *   }
 *
 * @param {HTMLElement} container
 * @param {{width?,height?,graph?,questions?,directed?}} options
 */
export function mountCycleQuiz(container, options = {}) {
  if (!container) return null;

  const width        = options.width   ?? 360;
  const height       = options.height  ?? 320;
  const directed     = !!options.directed;
  const questions    = options.questions ?? [];
  const defaultGraph = options.graph ?? CYCLE_DEMO_GRAPH;

  let qIndex   = 0;
  let revealed = false;
  let solved   = questions.map(() => false);
  let wrongPicks = new Set();

  // ── DOM skeleton ────────────────────────────────────────────────────────────

  container.innerHTML = "";
  container.classList.add("ht-quiz", "cy-quiz");

  const layout = document.createElement("div");
  layout.className = "ht-quiz-layout";

  const left = document.createElement("div");
  left.className = "ht-quiz-left";

  const graphMount = document.createElement("div");
  graphMount.className = "ht-quiz-graph cy-quiz-graph";

  const legendMount = document.createElement("div");

  const sidePanels = document.createElement("div");
  sidePanels.className = "ht-quiz-side cy-quiz-side";

  left.append(graphMount, legendMount, sidePanels);

  const right = document.createElement("div");
  right.className = "ht-quiz-right";

  layout.append(left, right);
  container.append(layout);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function isMCQ(q) {
    return Array.isArray(q.options) && q.options.length > 0;
  }

  function resolvePanel(panel = {}) {
    return {
      graph:           panel.graph ?? defaultGraph,
      highlight:       panel.highlight ?? {},
      visited:         panel.visited ?? panel.tracking ?? [],
      stack:           panel.stack ?? panel.bag ?? [],
      stackPick:       panel.stackPick ?? panel.bagPick ?? null,
      stackPickDone:   panel.stackPickDone ?? panel.bagPickDone ?? null,
      parentMap:       panel.parentMap ?? null,
      // Progressive reveal
      visibleNodes:    panel.visibleNodes ?? null,
      visibleEdges:    panel.visibleEdges ?? null,
      // Edge/node statuses
      usedEdges:       panel.usedEdges ?? null,
      activeEdges:     panel.activeEdges ?? null,
      visitedNeighbours: panel.visitedNeighbours ?? null,
      cycleEdge:       panel.cycleEdge ?? null,
    };
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function render() {
    const q = questions[qIndex];
    if (!q) {
      right.innerHTML = `<p class="ht-quiz-note">No questions configured.</p>`;
      return;
    }

    const mcq    = isMCQ(q);
    const shown  = mcq ? solved[qIndex] : revealed;
    const panel  = resolvePanel(shown ? q.answer : q.question);

    // Filter graph for progressive reveal
    const graphData = filterGraph(
      panel.graph,
      panel.visibleNodes,
      panel.visibleEdges
    );

    // Build merged highlight for mountStaticGraphView
    const highlight = { ...panel.highlight };
    if (panel.activeEdges?.length)       highlight.activeEdges      = panel.activeEdges;
    if (panel.usedEdges?.length)         highlight.usedEdges        = panel.usedEdges;
    if (panel.visitedNeighbours?.length) highlight.visitedNeighbours = panel.visitedNeighbours;
    if (panel.cycleEdge)                 highlight.cycleEdge        = panel.cycleEdge;

    mountStaticGraphView(graphMount, graphData, {
      width,
      height,
      directed,
      highlight,
    });

    // Legend: show for edge-tracking questions
    const hasEdgeFeatures =
      panel.usedEdges !== null ||
      (panel.activeEdges && panel.activeEdges.length > 0);
    legendMount.innerHTML = hasEdgeFeatures ? renderLegend() : "";

    // Sidebar: VISITED + BAG + EDGES  OR  VISITED + STACK + PARENT
    const useEdgePanels = panel.usedEdges !== null;
    if (useEdgePanels) {
      sidePanels.innerHTML =
        renderChipPanel({
          title: "VISITED",
          items: panel.visited,
          emptyText: "none yet…",
        }) +
        renderChipPanel({
          title: "BAG",
          items: panel.stack,
          emptyText: "bag empty…",
          pick: panel.stackPick,
          pickDone: panel.stackPickDone,
          chipClass: "ht-bag-chip",
        }) +
        renderEdgesPanel(panel.usedEdges);
    } else {
      sidePanels.innerHTML =
        renderChipPanel({
          title: "VISITED",
          items: panel.visited,
          emptyText: "none yet…",
        }) +
        renderChipPanel({
          title: "STACK",
          items: panel.stack,
          emptyText: "stack empty…",
          pick: panel.stackPick,
          pickDone: panel.stackPickDone,
          chipClass: "ht-bag-chip",
        }) +
        renderParentPanel(panel.parentMap);
    }

    // ── Right panel HTML ────────────────────────────────────────────────────

    const isLast = qIndex === questions.length - 1;
    let bodyHtml;

    if (mcq) {
      const optionsHtml = q.options
        .map((opt) => {
          const classes = ["ht-mcq-btn"];
          if (shown && opt.correct)         classes.push("ht-mcq-btn-correct");
          else if (!shown && wrongPicks.has(opt.id)) classes.push("ht-mcq-btn-incorrect");
          if (shown) classes.push("ht-mcq-btn-disabled");
          return `<button type="button" class="${classes.join(" ")}" data-id="${escapeHtml(
            opt.id
          )}" ${shown ? "disabled" : ""}>${escapeHtml(opt.label)}</button>`;
        })
        .join("");

      let feedbackHtml;
      if (shown) {
        const correct = q.options.find((o) => o.correct);
        feedbackHtml = `
          <div class="ht-mcq-feedback ht-mcq-feedback-correct">
            <span class="ht-mcq-feedback-label">Correct</span>${escapeHtml(
              correct?.feedback ?? ""
            )}
          </div>
          ${q.note ? `<p class="ht-quiz-note">${escapeHtml(q.note)}</p>` : ""}
        `;
      } else if (wrongPicks.size > 0) {
        const lastId = [...wrongPicks][wrongPicks.size - 1];
        const opt    = q.options.find((o) => o.id === lastId);
        feedbackHtml = `
          <div class="ht-mcq-feedback ht-mcq-feedback-incorrect">
            <span class="ht-mcq-feedback-label">Not quite</span>${escapeHtml(
              opt?.feedback ?? ""
            )}
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
              ? `<div class="ht-quiz-answer">
                   <span class="ht-quiz-answer-label">Answer</span>${escapeHtml(
                     q.answer.text ?? ""
                   )}
                 </div>
                 ${q.note ? `<p class="ht-quiz-note">${escapeHtml(q.note)}</p>` : ""}`
              : `<div class="ht-quiz-answer-hidden">Answer hidden — press Reveal to show</div>`
          }
        </div>
      `;
    }

    right.innerHTML = `
      <div class="ht-quiz-meta">Question ${qIndex + 1} of ${questions.length}</div>
      <h4 class="ht-quiz-prompt">${escapeHtml(q.prompt ?? "")}</h4>
      ${bodyHtml}
    `;

    if (mcq) {
      right.querySelectorAll(".ht-mcq-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id  = btn.getAttribute("data-id");
          const opt = q.options.find((o) => o.id === id);
          if (!opt || solved[qIndex]) return;
          if (opt.correct) solved[qIndex] = true;
          else             wrongPicks.add(id);
          render();
        });
      });
    }

    const controls = buildNavControls({
      prevDisabled: mcq
        ? qIndex === 0
        : qIndex === 0 && !revealed,
      nextDisabled: mcq
        ? !shown || isLast
        : shown && qIndex >= questions.length - 1,
      nextLabel: mcq
        ? isLast
          ? shown ? "Done" : "Solve to finish"
          : "Next question →"
        : !revealed
          ? "Reveal answer →"
          : qIndex < questions.length - 1
            ? "Next question →"
            : "Done",
      indicator: mcq
        ? shown ? "Solved" : "Pick one"
        : revealed ? "Answer shown" : "Think first",
      onPrev: () => {
        if (mcq) {
          if (qIndex > 0) { qIndex -= 1; wrongPicks = new Set(); render(); }
          return;
        }
        if (revealed) revealed = false;
        else if (qIndex > 0) { qIndex -= 1; revealed = true; }
        render();
      },
      onNext: () => {
        if (mcq) {
          if (shown && qIndex < questions.length - 1) {
            qIndex += 1; wrongPicks = new Set(); render();
          }
          return;
        }
        if (!revealed) revealed = true;
        else if (qIndex < questions.length - 1) { qIndex += 1; revealed = false; }
        render();
      },
    });
    right.appendChild(controls);
  }

  render();

  return {
    getState: () => ({ qIndex, revealed, solved: [...solved] }),
    goTo: (i, showAnswer = false) => {
      qIndex     = Math.max(0, Math.min(questions.length - 1, i));
      revealed   = !!showAnswer;
      wrongPicks = new Set();
      render();
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════
// ── v2: bag-based cycle-detection step quiz ─────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════
//
// This is a self-contained rewrite that does NOT reuse mountCycleQuiz's data
// model, its Panel shape, or mountStaticGraphView's colour scheme — the
// vocabulary (graphState / glow / visitedNeighbour / unvisitedNeighbour /
// bagPick / activeEdge / usedEdge) is different enough that sharing code with
// the guided quiz above risked bugs in both. Only tiny *generic* UI helpers
// (escapeHtml-alike, nav-button builder) are shared, since they hold no
// quiz-specific state or assumptions.

/**
 * Same node/edge layout as CYCLE_DEMO_GRAPH, kept as an independent copy so
 * edits here can never accidentally affect the original guided quiz above.
 */
export const CYCLE_QUIZ2_GRAPH = {
  nodes: [
    { id: "A", label: "A", x: 180, y: 55  },
    { id: "B", label: "B", x: 75,  y: 170 },
    { id: "C", label: "C", x: 285, y: 170 },
    { id: "D", label: "D", x: 180, y: 285 },
  ],
  edges: [
    { id: "A-B", source: "A", target: "B", label: "A-B" },
    { id: "A-C", source: "A", target: "C", label: "A-C" },
    { id: "B-D", source: "B", target: "D", label: "B-D" },
    { id: "C-D", source: "C", target: "D", label: "C-D" },
  ],
};

/**
 * graphState → which nodes/edges of the graph are revealed so far, so the
 * canvas can be "slowly revealed" as the walk-through progresses.
 * An unknown/omitted graphState reveals the whole graph.
 */
const CYCLE_QUIZ2_REVEALS = {
  1: { nodes: ["A"],                edges: [] },
  2: { nodes: ["A", "B", "C"],      edges: ["A-B", "A-C"] },
  3: { nodes: ["A", "B", "C", "D"], edges: ["A-B", "A-C", "B-D"] },
  4: { nodes: ["A", "B", "C", "D"], edges: ["A-B", "A-C", "B-D", "C-D"] },
};

function cyq2Reveal(graph, graphState) {
  const step = CYCLE_QUIZ2_REVEALS[graphState];
  if (!step) {
    return {
      nodes: new Set(graph.nodes.map((n) => n.id)),
      edges: new Set(graph.edges.map((e) => e.id)),
    };
  }
  return { nodes: new Set(step.nodes), edges: new Set(step.edges) };
}

function cyq2Esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Renders the graph panel as plain SVG (no d3 needed — every node has a
 *  fixed x/y, so there's nothing to simulate). */
function renderCycleQuiz2Graph(container, graph, panel, { width, height }) {
  const SVG_NS = "http://www.w3.org/2000/svg";
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const { nodes: visibleNodes, edges: visibleEdges } = cyq2Reveal(graph, panel.graphState);

  const visited            = new Set(panel.visited ?? []);
  const glow                = new Set(panel.glow ?? []);
  const visitedNeighbour   = new Set(panel.visitedNeighbour ?? []);
  const unvisitedNeighbour = new Set(panel.unvisitedNeighbour ?? []);
  const activeEdges        = new Set(panel.activeEdge ?? []);
  const usedEdges          = new Set(panel.usedEdge ?? []);
  const cycleEdge          = panel.cycleEdge ?? null;
  const current            = panel.bagPick ?? null;

  container.innerHTML = "";
  container.classList.add("cyq2-graph-root");

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("class", "cyq2-svg");

  const edgeLayer = document.createElementNS(SVG_NS, "g");
  const nodeLayer = document.createElementNS(SVG_NS, "g");
  svg.appendChild(edgeLayer);
  svg.appendChild(nodeLayer);
  container.appendChild(svg);

  graph.edges
    .filter((e) => visibleEdges.has(e.id))
    .forEach((e) => {
      const s = nodesById.get(e.source);
      const t = nodesById.get(e.target);
      if (!s || !t) return;

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", s.x);
      line.setAttribute("y1", s.y);
      line.setAttribute("x2", t.x);
      line.setAttribute("y2", t.y);
      let cls = "cyq2-edge";
      if (cycleEdge === e.id)          cls += " cyq2-edge-cycle";
      else if (activeEdges.has(e.id)) cls += " cyq2-edge-active";
      else if (usedEdges.has(e.id))   cls += " cyq2-edge-used";
      line.setAttribute("class", cls);
      edgeLayer.appendChild(line);

      if (e.label) {
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", (s.x + t.x) / 2);
        text.setAttribute("y", (s.y + t.y) / 2 - 7);
        text.setAttribute("class", "cyq2-edge-label");
        text.textContent = e.label;
        edgeLayer.appendChild(text);
      }
    });

  graph.nodes
    .filter((n) => visibleNodes.has(n.id))
    .forEach((n) => {
      const g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "cyq2-node");
      g.setAttribute("transform", `translate(${n.x},${n.y})`);

      // Glow ring: purely additive, never changes the node's own colour.
      if (glow.has(n.id)) {
        const ring = document.createElementNS(SVG_NS, "circle");
        ring.setAttribute("r", 27);
        ring.setAttribute("class", "cyq2-node-glow");
        g.appendChild(ring);
      }

      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", 20);
      let cls = "cyq2-node-circle";
      if (visitedNeighbour.has(n.id))        cls += " cyq2-node-visited-nbr";
      else if (unvisitedNeighbour.has(n.id)) cls += " cyq2-node-unvisited-nbr";
      if (n.id === current)                  cls += " cyq2-node-current";
      if (visited.has(n.id))                 cls += " cyq2-node-visited";
      circle.setAttribute("class", cls);
      g.appendChild(circle);

      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("class", "cyq2-node-label");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dy", "0.32em");
      label.textContent = n.label ?? n.id;
      g.appendChild(label);

      nodeLayer.appendChild(g);
    });
}

/** VISITED / USED-EDGES style panel: a titled box of plain chips. */
function renderCycleQuiz2SetPanel(title, items = [], emptyText = "—") {
  const body =
    items.length === 0
      ? `<div class="cyq2-panel-empty">${cyq2Esc(emptyText)}</div>`
      : items.map((id) => `<span class="cyq2-chip">${cyq2Esc(id)}</span>`).join("");
  return `
    <div class="cyq2-panel">
      <div class="cyq2-panel-header">${cyq2Esc(title)}</div>
      <div class="cyq2-panel-body">${body}</div>
    </div>
  `;
}

/** BAG panel: one of the chips (bagPick) renders as the highlighted "current" pick. */
function renderCycleQuiz2BagPanel(items = [], pick = null) {
  const body =
    items.length === 0
      ? `<div class="cyq2-panel-empty">bag empty…</div>`
      : items
          .map((id) => {
            const cls = id === pick ? "cyq2-chip cyq2-chip-pick" : "cyq2-chip";
            return `<span class="${cls}">${cyq2Esc(id)}</span>`;
          })
          .join("");
  return `
    <div class="cyq2-panel">
      <div class="cyq2-panel-header">BAG</div>
      <div class="cyq2-panel-body">${body}</div>
    </div>
  `;
}

/** Small node-look chip (e.g. "B") + a pill badge (e.g. "unvisited") used to
 *  label each neighbour sub-question. */
function renderCycleQuiz2NbrLabel(nodeId, status) {
  const statusCls = status === "visited" ? "cyq2-nbr-status-visited" : "cyq2-nbr-status-unvisited";
  return `
    <span class="cyq2-nbr-node-chip">${cyq2Esc(nodeId)}</span>
    <span class="cyq2-nbr-status-pill ${statusCls}">${cyq2Esc(status ?? "")}</span>
  `;
}

/**
 * Guided bag-based cycle-detection quiz (v2).
 *
 * Question shape:
 *   {
 *     id:       number|string
 *     prompt:   string
 *     note?:    string
 *     options?:   [{id, label, correct, feedback}]           // MCQ when present
 *     neighbours?: [{node, status, text, highlight: Panel}]   // per-neighbour sub-questions when present
 *     question: Panel
 *     answer?:  { text?: string, highlight: Panel }           // used when neither options nor neighbours is set
 *   }
 *
 * Panel:
 *   {
 *     graphState?:         number     // which reveal step to show (see CYCLE_QUIZ2_REVEALS); omit for "show all"
 *     visited?:            string[]  // node ids — dimmed on graph + listed in VISITED panel
 *     glow?:               string[]  // node ids — glowing ring, independent of node colour
 *     visitedNeighbour?:   string[]  // node ids — coloured orange
 *     unvisitedNeighbour?: string[]  // node ids — coloured purple
 *     bag?:                string[]  // node ids — listed in BAG panel
 *     bagPick?:            string|null // node id — highlighted pick inside BAG, also "current" on the graph
 *     activeEdge?:         string[]  // edge ids — orange edge, currently being explored
 *     usedEdge?:           string[]  // edge ids — blue edge, also listed in USED EDGES panel
 *     cycleEdge?:          string    // edge id — red edge, the back-edge that closes a cycle
 *   }
 *
 * @param {HTMLElement} container
 * @param {{width?, height?, graph?, questions?}} options
 */
export function mountCycleStepQuiz(container, options = {}) {
  if (!container) return null;

  const width     = options.width  ?? 360;
  const height    = options.height ?? 320;
  const questions = options.questions ?? [];
  const graph     = options.graph ?? CYCLE_QUIZ2_GRAPH;

  let qIndex     = 0;
  let revealed   = false;
  let solved     = questions.map(() => false);
  let wrongPicks = new Set();
  // Per-question, per-neighbour reveal state (only used by neighbour-type questions).
  let nbrRevealed = questions.map((q) =>
    Array.isArray(q.neighbours) ? q.neighbours.map(() => false) : []
  );

  // ── DOM skeleton ────────────────────────────────────────────────────────────
  container.innerHTML = "";
  container.classList.add("ht-quiz", "cyq2-quiz");

  const layout = document.createElement("div");
  layout.className = "ht-quiz-layout";

  const left = document.createElement("div");
  left.className = "ht-quiz-left";

  const graphMount = document.createElement("div");
  graphMount.className = "ht-quiz-graph cyq2-quiz-graph";

  const sidePanels = document.createElement("div");
  sidePanels.className = "ht-quiz-side cyq2-quiz-side";

  left.append(graphMount, sidePanels);

  const right = document.createElement("div");
  right.className = "ht-quiz-right";

  layout.append(left, right);
  container.append(layout);

  function isMCQ(q) {
    return Array.isArray(q.options) && q.options.length > 0;
  }

  function isNeighbourQ(q) {
    return Array.isArray(q.neighbours) && q.neighbours.length > 0;
  }

  /** For neighbour-type questions, the graph/side panels reflect the
   *  highest-index revealed neighbour's highlight (each neighbour's highlight
   *  is authored as a full, self-contained panel — not a delta — so the
   *  furthest-revealed one is always the most up-to-date state). Falls back
   *  to the base question panel when nothing has been revealed yet. */
  function resolveNeighbourPanel(q, qi) {
    const flags = nbrRevealed[qi] ?? [];
    let panel = q.question ?? {};
    for (let i = 0; i < q.neighbours.length; i++) {
      if (flags[i]) panel = q.neighbours[i].highlight ?? panel;
    }
    return panel;
  }

  function render() {
    const q = questions[qIndex];
    if (!q) {
      right.innerHTML = `<p class="ht-quiz-note">No questions configured.</p>`;
      return;
    }

    const mcq   = isMCQ(q);
    const nbrQ  = isNeighbourQ(q);
    const shown = mcq ? solved[qIndex] : revealed;
    const panel = nbrQ
      ? resolveNeighbourPanel(q, qIndex)
      : shown
        ? (q.answer?.highlight ?? {})
        : (q.question ?? {});

    renderCycleQuiz2Graph(graphMount, graph, panel, { width, height });

    sidePanels.innerHTML =
      renderCycleQuiz2SetPanel("VISITED", panel.visited ?? [], "none yet…") +
      renderCycleQuiz2BagPanel(panel.bag ?? [], panel.bagPick ?? null) +
      renderCycleQuiz2SetPanel("USED EDGES", panel.usedEdge ?? [], "none yet…");

    // ── Right panel HTML ────────────────────────────────────────────────────
    const isLast = qIndex === questions.length - 1;
    let bodyHtml;

    if (mcq) {
      const optionsHtml = q.options
        .map((opt) => {
          const classes = ["ht-mcq-btn"];
          if (shown && opt.correct)                  classes.push("ht-mcq-btn-correct");
          else if (!shown && wrongPicks.has(opt.id)) classes.push("ht-mcq-btn-incorrect");
          if (shown) classes.push("ht-mcq-btn-disabled");
          return `<button type="button" class="${classes.join(" ")}" data-id="${cyq2Esc(
            opt.id
          )}" ${shown ? "disabled" : ""}>${cyq2Esc(opt.label)}</button>`;
        })
        .join("");

      let feedbackHtml;
      if (shown) {
        const correct = q.options.find((o) => o.correct);
        feedbackHtml = `
          <div class="ht-mcq-feedback ht-mcq-feedback-correct">
            <span class="ht-mcq-feedback-label">Correct</span>${cyq2Esc(correct?.feedback ?? "")}
          </div>
          ${q.note ? `<p class="ht-quiz-note">${cyq2Esc(q.note)}</p>` : ""}
        `;
      } else if (wrongPicks.size > 0) {
        const lastId = [...wrongPicks][wrongPicks.size - 1];
        const opt    = q.options.find((o) => o.id === lastId);
        feedbackHtml = `
          <div class="ht-mcq-feedback ht-mcq-feedback-incorrect">
            <span class="ht-mcq-feedback-label">Not quite</span>${cyq2Esc(opt?.feedback ?? "")}
          </div>
        `;
      } else {
        feedbackHtml = `<div class="ht-mcq-feedback-hidden">Pick an answer to check.</div>`;
      }

      bodyHtml = `<div class="ht-mcq-options">${optionsHtml}</div>${feedbackHtml}`;
    } else if (nbrQ) {
      const flags = nbrRevealed[qIndex];
      const blocksHtml = q.neighbours
        .map((nbr, i) => {
          const isRevealed = !!flags[i];
          return `
            <div class="cyq2-nbr-block">
              <button type="button" class="cyq2-nbr-toggle" data-nbr-idx="${i}" aria-expanded="${isRevealed}">
                ${renderCycleQuiz2NbrLabel(nbr.node, nbr.status)}
                <span class="cyq2-nbr-toggle-label">${isRevealed ? "Hide" : "What do we do next?"}</span>
                <span class="cyq2-nbr-chevron">${isRevealed ? "▾" : "▸"}</span>
              </button>
              <div class="cyq2-nbr-answer ${isRevealed ? "cyq2-nbr-answer-visible" : ""}">
                ${
                  isRevealed
                    ? cyq2Esc(nbr.text ?? "")
                    : `<span class="cyq2-nbr-answer-hidden">Answer hidden — click to reveal</span>`
                }
              </div>
            </div>
          `;
        })
        .join("");
      bodyHtml = `
        <div class="cyq2-nbr-list">${blocksHtml}</div>
        ${q.note ? `<p class="ht-quiz-note">${cyq2Esc(q.note)}</p>` : ""}
      `;
    } else {
      bodyHtml = `
        <div class="ht-quiz-answer-wrap ${shown ? "ht-quiz-answer-visible" : ""}">
          ${
            shown
              ? `<div class="ht-quiz-answer">
                   <span class="ht-quiz-answer-label">Answer</span>${cyq2Esc(
                     q.answer?.text ?? ""
                   )}
                 </div>
                 ${q.note ? `<p class="ht-quiz-note">${cyq2Esc(q.note)}</p>` : ""}`
              : `<div class="ht-quiz-answer-hidden">Answer hidden — press Reveal to show</div>`
          }
        </div>
      `;
    }

    right.innerHTML = `
      <div class="ht-quiz-meta">Question ${qIndex + 1} of ${questions.length}</div>
      <h4 class="ht-quiz-prompt">${cyq2Esc(q.prompt ?? "")}</h4>
      ${bodyHtml}
    `;

    if (mcq) {
      right.querySelectorAll(".ht-mcq-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id  = btn.getAttribute("data-id");
          const opt = q.options.find((o) => o.id === id);
          if (!opt || solved[qIndex]) return;
          if (opt.correct) solved[qIndex] = true;
          else             wrongPicks.add(id);
          render();
        });
      });
    }

    if (nbrQ) {
      right.querySelectorAll(".cyq2-nbr-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = Number(btn.getAttribute("data-nbr-idx"));
          nbrRevealed[qIndex][i] = !nbrRevealed[qIndex][i];
          render();
        });
      });
    }

    const allNbrRevealed = nbrQ && nbrRevealed[qIndex].every(Boolean);

    const controls = buildNavControls({
      prevDisabled: (mcq || nbrQ)
        ? qIndex === 0
        : qIndex === 0 && !revealed,
      nextDisabled: mcq
        ? !shown || isLast
        : nbrQ
          ? !allNbrRevealed || isLast
          : shown && qIndex >= questions.length - 1,
      nextLabel: mcq
        ? isLast
          ? shown ? "Done" : "Solve to finish"
          : "Next question →"
        : nbrQ
          ? isLast
            ? allNbrRevealed ? "Done" : "Reveal both to finish"
            : allNbrRevealed ? "Next question →" : "Reveal both neighbours →"
          : !revealed
            ? "Reveal answer →"
            : qIndex < questions.length - 1
              ? "Next question →"
              : "Done",
      indicator: mcq
        ? shown ? "Solved" : "Pick one"
        : nbrQ
          ? `${nbrRevealed[qIndex].filter(Boolean).length}/${nbrRevealed[qIndex].length} revealed`
          : revealed ? "Answer shown" : "Think first",
      onPrev: () => {
        if (mcq) {
          if (qIndex > 0) { qIndex -= 1; wrongPicks = new Set(); render(); }
          return;
        }
        if (nbrQ) {
          if (qIndex > 0) { qIndex -= 1; render(); }
          return;
        }
        if (revealed) revealed = false;
        else if (qIndex > 0) { qIndex -= 1; revealed = true; }
        render();
      },
      onNext: () => {
        if (mcq) {
          if (shown && qIndex < questions.length - 1) {
            qIndex += 1; wrongPicks = new Set(); render();
          }
          return;
        }
        if (nbrQ) {
          if (allNbrRevealed && qIndex < questions.length - 1) { qIndex += 1; render(); }
          return;
        }
        if (!revealed) revealed = true;
        else if (qIndex < questions.length - 1) { qIndex += 1; revealed = false; }
        render();
      },
    });
    right.appendChild(controls);
  }

  render();

  return {
    getState: () => ({ qIndex, revealed, solved: [...solved], nbrRevealed: nbrRevealed.map((f) => [...f]) }),
    goTo: (i, showAnswer = false) => {
      qIndex     = Math.max(0, Math.min(questions.length - 1, i));
      revealed   = !!showAnswer;
      wrongPicks = new Set();
      render();
    },
  };
}

/**
 * Question set for the "undirected cycle detection" walk-through, matching
 * the diamond graph A-B, A-C, B-D, C-D (CYCLE_QUIZ2_GRAPH).
 */
export const UNDIRECTED_CYCLE_QUIZ_QUESTIONS = [
  {
    id: 1,
    prompt: "Where should we start the DFS for undirected cycle detection?",
    question: {
      graphState: 4,
      visited: [],
      bag: [],
      bagPick: null,
    },
    answer: {
      text:
        'For undirected graphs, we can start from any node. If the graph has multiple "islands" we need to account for each island — but for a fully connected subgraph, we can start from any node.',
      highlight: {
        graphState: 4,
        visited: [],
        bag: [],
        bagPick: null,
      },
    },
  },
  {
    id: 2,
    prompt: "What do we need to track for undirected cycle detection?",
    options: [
      {
        id: "A",
        label: "Visited nodes",
        correct: false,
        feedback:
          "Not quite — visited nodes alone can't tell us whether we've already used the edge we're about to walk again.",
      },
      {
        id: "B",
        label: "Visited edges",
        correct: false,
        feedback:
          "Not quite — without tracking visited nodes too, we wouldn't even know which nodes are already reachable.",
      },
      {
        id: "C",
        label: "Both visited nodes and visited edges",
        correct: true,
        feedback:
          "Exactly — visited nodes tell us who's reachable, and visited edges stop us from mistaking the edge we just walked in on for a brand-new cycle.",
      },
    ],
    question: {
      graphState: 4,
      visited: [],
      bag: [],
      bagPick: null,
    },
    answer: {
      highlight: {
        graphState: 4,
        visited: [],
        bag: [],
        bagPick: null,
      },
    },
  },
  {
    id: 3,
    prompt: "We push A to the bag to initialise the traversal. What do we do next?",
    question: {
      graphState: 1,
      visited: [],
      glow: ["A"],
      bag: ["A"],
      bagPick: "A",
    },
    answer: {
      text: "Pop A from the bag and make it current. Mark A as visited.",
      highlight: {
        graphState: 1,
        visited: ["A"],
        glow: ["A"],
        bag: [],
        bagPick: null,
      },
    },
  },
  {
    id: 4,
    prompt:
      "We pop A, make it current, and mark it visited. We get its neighbours: B (unvisited) and C (unvisited). What do we do with each?",
    question: {
      graphState: 2,
      visited: ["A"],
      glow: ["A"],
      unvisitedNeighbour: ["B", "C"],
      bag: [],
      bagPick: null,
      activeEdge: ["A-B", "A-C"],
    },
    neighbours: [
      {
        node: "B",
        status: "unvisited",
        text: "B is unvisited, so we push it to the bag and note down the edge A-B as used.",
        highlight: {
          graphState: 2,
          visited: ["A"],
          glow: ["A"],
          unvisitedNeighbour: ["B", "C"],
          bag: ["B"],
          bagPick: null,
          usedEdge: ["A-B"],
          activeEdge: ["A-C"],
        },
      },
      {
        node: "C",
        status: "unvisited",
        text: "C is unvisited too, so we push it to the bag and note down the edge A-C as used.",
        highlight: {
          graphState: 2,
          visited: ["A"],
          glow: ["A"],
          unvisitedNeighbour: ["B", "C"],
          bag: ["B", "C"],
          bagPick: null,
          usedEdge: ["A-B", "A-C"],
        },
      },
    ],
  },
  {
    id: 5,
    prompt:
      "We pop B from the bag and make it current. Its neighbours are A (visited) and D (unvisited). What do we do for each neighbour?",
    question: {
      graphState: 3,
      visited: ["A", "B"],
      glow: ["B"],
      visitedNeighbour: ["A"],
      unvisitedNeighbour: ["D"],
      bag: ["C"],
      bagPick: null,
      usedEdge: ["A-B", "A-C"],
      activeEdge: ["B-D"],
    },
    neighbours: [
      {
        node: "A",
        status: "visited",
        text: "A is already visited, and the edge A-B is already used — so we skip A, no cycle there.",
        highlight: {
          graphState: 3,
          visited: ["A", "B"],
          glow: ["B"],
          visitedNeighbour: ["A"],
          unvisitedNeighbour: ["D"],
          bag: ["C"],
          bagPick: null,
          usedEdge: ["A-B", "A-C"],
          activeEdge: ["B-D"],
        },
      },
      {
        node: "D",
        status: "unvisited",
        text: "D is unvisited, so we add it to the bag and note down the edge B-D as used.",
        highlight: {
          graphState: 3,
          visited: ["A", "B"],
          glow: ["B"],
          visitedNeighbour: ["A"],
          unvisitedNeighbour: ["D"],
          bag: ["C", "D"],
          bagPick: null,
          usedEdge: ["A-B", "A-C", "B-D"],
        },
      },
    ],
  },
  {
    id: 6,
    prompt:
      "We pop C from the bag and make it current. Its neighbours are A (visited) and D (visited). What do we do for each?",
    question: {
      graphState: 4,
      visited: ["A", "B", "C"],
      glow: ["C"],
      visitedNeighbour: ["A", "D"],
      bag: ["D"],
      bagPick: null,
      usedEdge: ["A-B", "A-C", "B-D"],
      activeEdge: ["C-D"],
    },
    neighbours: [
      {
        node: "A",
        status: "visited",
        text: "A is already visited and the edge C-A (same as A-C) is already used, so we skip it — no new cycle there.",
        highlight: {
          graphState: 4,
          visited: ["A", "B", "C"],
          glow: ["C"],
          visitedNeighbour: ["A", "D"],
          bag: ["D"],
          bagPick: null,
          usedEdge: ["A-B", "A-C", "B-D"],
          activeEdge: ["C-D"],
        },
      },
      {
        node: "D",
        status: "visited",
        text: "D is already visited too, but the edge C-D has NOT been used yet — so we've found a cycle!",
        highlight: {
          graphState: 4,
          visited: ["A", "B", "C"],
          glow: ["C"],
          visitedNeighbour: ["A", "D"],
          bag: ["D"],
          bagPick: null,
          usedEdge: ["A-B", "A-C", "B-D"],
          cycleEdge: "C-D",
        },
      },
    ],
  },
];

// ═════════════════════════════════════════════════════════════════════════
// ── find_cycle code-block exercise + play/step visualisation ─────────────
// ═════════════════════════════════════════════════════════════════════════

export const FIND_CYCLE_CODE_BLOCKS = [
  {
    id: "pop",
    code: "current = bag.pop(0)",
    label: "take the next node from the front of the bag",
  },
  {
    id: "mark",
    code: "visited_nodes.add(current)",
    label: "mark the current node as visited",
  },
  {
    id: "scan",
    code:
      "for neighbour in G[current]:\n" +
      "    if neighbour in visited_nodes:\n" +
      "        if (neighbour, current) not in visited_edges:\n" +
      "            return True\n" +
      "    else:\n" +
      "        bag.append(neighbour)\n" +
      "        visited_nodes.add(neighbour)\n" +
      "        visited_edges.add((current, neighbour))",
    label:
      "for each neighbour: unused back-edge is a cycle; otherwise bag it and record the edge",
  },
];

export const FIND_CYCLE_CODE_OPTIONS = {
  heading: "Cycle-detection steps",
  workspaceLabel: "Loop body — while bag:",
  preplaced: [],
  solutionOrder: ["pop", "mark", "scan"],
  showSolutionButton: false,
  lockedBefore: [
    {
      code:
        "visited_nodes = set()\n" +
        "visited_edges = set()\n" +
        "bag = []\n" +
        "\n" +
        "bag.append(node)\n" +
        "visited_nodes.add(node)",
    },
  ],
  lockedContainer: { code: "while bag:" },
  lockedAfter: [{ code: "return False" }],
};

function findCycleEdgeId(graph, a, b) {
  const e = graph.edges.find(
    (x) => (x.source === a && x.target === b) || (x.source === b && x.target === a)
  );
  return e?.id ?? `${a}-${b}`;
}

function findCycleAdjacency(graph) {
  const adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }
  return adj;
}

function findCycleUsedEdgeIds(graph, tuples) {
  const ids = [];
  const seen = new Set();
  for (const t of tuples) {
    const [a, b] = String(t).split("|");
    const id = findCycleEdgeId(graph, a, b);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Walk `find_cycle` on an undirected graph and emit one frame per code block.
 * The scan frame highlights current + every neighbour together.
 */
export function buildFindCycleFrames(graph, startId) {
  const adj = findCycleAdjacency(graph);
  const visitedNodes = new Set();
  const visitedEdgeTuples = [];
  const visitedEdgeSet = new Set();
  const bag = [];
  const frames = [];

  function snap(extra) {
    return {
      visited: [...visitedNodes],
      bag: [...bag],
      usedEdge: findCycleUsedEdgeIds(graph, visitedEdgeTuples),
      glow: extra.current ? [extra.current] : [],
      bagPick: extra.current ?? null,
      visitedNeighbour: extra.visitedNeighbour ?? [],
      unvisitedNeighbour: extra.unvisitedNeighbour ?? [],
      activeEdge: extra.activeEdge ?? [],
      cycleEdge: extra.cycleEdge ?? null,
      blockId: extra.blockId ?? null,
      done: !!extra.done,
      message: extra.message ?? "",
    };
  }

  bag.push(startId);
  visitedNodes.add(startId);

  let guard = 0;
  while (bag.length && guard++ < 50) {
    const current = bag.shift();
    visitedNodes.add(current);
    const neighbours = [...(adj.get(current) ?? [])];

    frames.push(
      snap({
        blockId: "pop",
        current,
        message: `Popped ${current} from the bag — it is now current.`,
      })
    );

    frames.push(
      snap({
        blockId: "mark",
        current,
        message: `Marked ${current} as visited.`,
      })
    );

    const visNbrs = neighbours.filter((n) => visitedNodes.has(n));
    const unvisNbrs = neighbours.filter((n) => !visitedNodes.has(n));
    let cycleEdge = null;
    let cycleNeighbour = null;

    for (const neighbour of neighbours) {
      if (visitedNodes.has(neighbour)) {
        if (!visitedEdgeSet.has(`${neighbour}|${current}`)) {
          cycleEdge = findCycleEdgeId(graph, current, neighbour);
          cycleNeighbour = neighbour;
          break;
        }
      } else {
        bag.push(neighbour);
        visitedNodes.add(neighbour);
        const tuple = `${current}|${neighbour}`;
        visitedEdgeSet.add(tuple);
        visitedEdgeTuples.push(tuple);
      }
    }

    const found = cycleEdge != null;
    const nbrList = neighbours.length ? neighbours.join(", ") : "none";
    frames.push(
      snap({
        blockId: "scan",
        current,
        visitedNeighbour: visNbrs,
        unvisitedNeighbour: unvisNbrs,
        activeEdge: neighbours.map((n) => findCycleEdgeId(graph, current, n)),
        cycleEdge,
        done: found,
        message: found
          ? `${cycleNeighbour} is already visited and ${cycleEdge} was not used — cycle found!`
          : `Looked at every neighbour of ${current} together: ${nbrList}.`,
      })
    );

    if (found) break;
  }

  if (!frames.length || !frames[frames.length - 1].done) {
    frames.push(
      snap({
        done: true,
        message: "Bag empty — no cycle from this start node.",
      })
    );
  }

  return frames;
}

function renderFindCycleLegend() {
  return `
    <div class="cy-legend">
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:var(--coral,#feb686);border-color:#fdfeff"></span>current
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:#c4b5fd;border-color:var(--line,#19162b)"></span>unvisited nbr
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:#fb923c;border-color:var(--line,#19162b)"></span>visited nbr
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-line" style="background:#ff9f6b"></span>active edge
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-line" style="background:#86c0fe"></span>used edge
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-line" style="background:#ef4444"></span>cycle edge
      </span>
    </div>
  `;
}

/**
 * Play / Pause / Next step visualisation for the find_cycle code-block exercise.
 * Uses the same diamond graph and chip panels as the cycle step quiz.
 *
 * @param {HTMLElement} container
 * @param {{
 *   width?: number, height?: number, stepDelayMs?: number,
 *   graph?: {nodes: Array, edges: Array},
 *   startId?: string,
 *   onStep?: (frame: object|null) => void,
 *   onRevealSolution?: () => void,
 * }} [options]
 */
export function mountFindCycleCodeViz(container, options = {}) {
  if (!container) return null;
  if (typeof container._findCycleDestroy === "function") {
    container._findCycleDestroy();
  }

  const width = options.width ?? 360;
  const height = options.height ?? 320;
  const stepDelayMs = options.stepDelayMs ?? 900;
  const graph = options.graph ?? CYCLE_QUIZ2_GRAPH;
  const startId = options.startId ?? graph.nodes[0]?.id ?? "A";
  const onStep = options.onStep ?? (() => {});
  const onRevealSolution = options.onRevealSolution ?? null;

  const frames = buildFindCycleFrames(graph, startId);

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("iv-root", "cy-code-viz");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "find_cycle";
  container.appendChild(heading);

  const graphMount = document.createElement("div");
  graphMount.className = "cyq2-quiz-graph";
  container.appendChild(graphMount);

  const legendMount = document.createElement("div");
  legendMount.innerHTML = renderFindCycleLegend();
  container.appendChild(legendMount);

  const sidePanels = document.createElement("div");
  sidePanels.className = "ht-quiz-side cyq2-quiz-side";
  container.appendChild(sidePanels);

  const status = document.createElement("div");
  status.className = "ht-play-status";
  container.appendChild(status);

  const controls = document.createElement("div");
  controls.className = "ht-quiz-controls";
  container.appendChild(controls);

  let frameIndex = -1;
  let playing = false;
  let playTimer = null;

  function idleState() {
    return {
      blockId: null,
      current: null,
      visited: [startId],
      bag: [startId],
      bagPick: null,
      usedEdge: [],
      glow: [],
      visitedNeighbour: [],
      unvisitedNeighbour: [],
      activeEdge: [],
      cycleEdge: null,
      done: false,
      message: "Assemble the loop body, then press Play or Next step.",
    };
  }

  function clearPlayTimer() {
    if (playTimer != null) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  }

  function stopPlayback() {
    playing = false;
    clearPlayTimer();
  }

  function currentFrame() {
    if (frameIndex < 0 || frameIndex >= frames.length) return null;
    return frames[frameIndex];
  }

  function render() {
    const frame = currentFrame() ?? idleState();
    const panel = {
      visited: frame.visited ?? [],
      bag: frame.bag ?? [],
      bagPick: frame.bagPick ?? frame.current ?? null,
      glow: frame.glow ?? (frame.current ? [frame.current] : []),
      visitedNeighbour: frame.visitedNeighbour ?? [],
      unvisitedNeighbour: frame.unvisitedNeighbour ?? [],
      activeEdge: frame.activeEdge ?? [],
      usedEdge: frame.usedEdge ?? [],
      cycleEdge: frame.cycleEdge ?? null,
    };

    renderCycleQuiz2Graph(graphMount, graph, panel, { width, height });

    sidePanels.innerHTML =
      renderCycleQuiz2SetPanel("VISITED NODES", panel.visited, "none yet…") +
      renderCycleQuiz2BagPanel(panel.bag, panel.bagPick) +
      renderCycleQuiz2SetPanel("VISITED EDGES", panel.usedEdge, "none yet…");

    status.textContent = frame.message ?? "";
    status.classList.toggle("ht-play-status-ok", !!frame.cycleEdge);
    status.classList.toggle("ht-play-status-warn", false);

    onStep(currentFrame());
    renderControls();
  }

  function stepForward() {
    if (frameIndex < frames.length - 1) {
      frameIndex += 1;
    } else {
      stopPlayback();
    }
    render();
  }

  function play() {
    clearPlayTimer();
    if (frameIndex < 0 || frameIndex >= frames.length - 1) {
      frameIndex = 0;
    }
    playing = true;
    render();

    const tick = () => {
      if (!playing) return;
      if (frameIndex >= frames.length - 1) {
        stopPlayback();
        render();
        return;
      }
      frameIndex += 1;
      render();
      if (playing && frameIndex < frames.length - 1) {
        playTimer = setTimeout(tick, stepDelayMs);
      } else {
        stopPlayback();
        render();
      }
    };
    playTimer = setTimeout(tick, stepDelayMs);
  }

  function reset() {
    stopPlayback();
    frameIndex = -1;
    render();
  }

  function renderControls() {
    controls.innerHTML = "";

    if (onRevealSolution) {
      const revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "ht-nav-btn";
      revealBtn.textContent = "Reveal solution";
      revealBtn.onclick = () => {
        stopPlayback();
        onRevealSolution();
        reset();
      };
      controls.appendChild(revealBtn);
    }

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "ht-nav-btn";
    playBtn.textContent = playing ? "Pause" : "Play";
    playBtn.onclick = () => {
      if (playing) {
        stopPlayback();
        render();
      } else {
        play();
      }
    };

    const stepBtn = document.createElement("button");
    stepBtn.type = "button";
    stepBtn.className = "ht-nav-btn";
    stepBtn.textContent = "Next step";
    stepBtn.disabled = frameIndex >= frames.length - 1 && frameIndex >= 0;
    stepBtn.onclick = () => {
      stopPlayback();
      stepForward();
    };

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ht-nav-btn ht-nav-btn-ghost";
    resetBtn.textContent = "Reset";
    resetBtn.onclick = () => reset();

    const indicator = document.createElement("span");
    indicator.className = "ht-step-indicator";
    indicator.textContent =
      frameIndex < 0 ? "Ready" : `${frameIndex + 1} / ${frames.length}`;

    controls.append(playBtn, stepBtn, resetBtn, indicator);
  }

  render();

  const api = {
    play,
    step: stepForward,
    reset,
    destroy: () => stopPlayback(),
  };
  container._findCycleDestroy = api.destroy;
  return api;
}

// ── Directed 3-colour DFS sandbox ─────────────────────────────────────────────

export const DIRECTED_CYCLE_SANDBOX_GRAPH = {
  nodes: [
    { id: "A", label: "A" },
    { id: "B", label: "B" },
    { id: "C", label: "C" },
    { id: "D", label: "D" },
    { id: "E", label: "E" },
  ],
  edges: [
    { id: "e0", source: "A", target: "B", label: "" },
    { id: "e1", source: "B", target: "C", label: "" },
    { id: "e2", source: "C", target: "D", label: "" },
    { id: "e3", source: "D", target: "B", label: "" },
    { id: "e4", source: "A", target: "E", label: "" },
  ],
};

/** Same directed graph, pinned so the walkthrough layout stays stable. */
export const DIRECTED_CYCLE_WALKTHROUGH_GRAPH = {
  nodes: [
    { id: "A", label: "A", x: 70, y: 150 },
    { id: "B", label: "B", x: 190, y: 70 },
    { id: "C", label: "C", x: 310, y: 70 },
    { id: "D", label: "D", x: 310, y: 200 },
    { id: "E", label: "E", x: 190, y: 230 },
  ],
  edges: [
    { id: "e0", source: "A", target: "B", label: "" },
    { id: "e1", source: "B", target: "C", label: "" },
    { id: "e2", source: "C", target: "D", label: "" },
    { id: "e3", source: "D", target: "B", label: "" },
    { id: "e4", source: "A", target: "E", label: "" },
  ],
};

const DCW_MESSAGES = {
  white:
    "This neighbour is white (incomplete). Recurse: start a DFS from it.",
  blue:
    "This neighbour is still blue (active). That is a directed cycle.",
  black:
    "This neighbour is black (complete), or there are no neighbours left. Mark the current node complete and pop it from the stack.",
};

/**
 * Step-through of 3-colour DFS. Neighbour order from A is E then B so a
 * completed (black) node appears before the cycle is found.
 */
export const DIRECTED_CYCLE_WALKTHROUGH_STEPS = [
  {
    title: "Start at a white node",
    description:
      "Every node starts white (incomplete). Pick A and begin a DFS. The recursion stack is still empty.",
    messageKind: "white",
    message: "A is white (incomplete). Start a DFS from A.",
    colors: {},
    stack: [],
    current: "A",
    neighbours: ["E", "B"],
    focusNeighbour: null,
  },
  {
    title: "Mark A active",
    description:
      "Push A onto the stack and colour it blue. A's outgoing neighbours are E and B, both still white. Recurse into E first.",
    messageKind: "white",
    message: "E is white — start a DFS from E.",
    colors: { A: "blue" },
    stack: ["A"],
    current: "A",
    neighbours: ["E", "B"],
    focusNeighbour: "E",
    activeEdges: ["e4"],
  },
  {
    title: "E has no neighbours",
    description:
      "E is now active. It has no outgoing edges, so every neighbour is vacuously complete. We can finish E.",
    messageKind: "black",
    message:
      "E has no neighbours. Mark it black (complete) and pop it from the stack.",
    colors: { A: "blue", E: "blue" },
    stack: ["A", "E"],
    current: "E",
    neighbours: [],
    focusNeighbour: null,
  },
  {
    title: "Pop E, back to A",
    description:
      "E is complete and gone from the stack. A is still active. Its remaining neighbour B is white, so we recurse into B.",
    messageKind: "white",
    message: "B is white — start a DFS from B.",
    colors: { A: "blue", E: "black" },
    stack: ["A"],
    current: "A",
    neighbours: ["E", "B"],
    focusNeighbour: "B",
    activeEdges: ["e0"],
  },
  {
    title: "Follow B → C",
    description:
      "B is active. Its only neighbour C is still white, so the DFS continues into C.",
    messageKind: "white",
    message: "C is white — start a DFS from C.",
    colors: { A: "blue", B: "blue", E: "black" },
    stack: ["A", "B"],
    current: "B",
    neighbours: ["C"],
    focusNeighbour: "C",
    activeEdges: ["e1"],
  },
  {
    title: "Follow C → D",
    description:
      "C is active. Its neighbour D is white, so we recurse one more level.",
    messageKind: "white",
    message: "D is white — start a DFS from D.",
    colors: { A: "blue", B: "blue", C: "blue", E: "black" },
    stack: ["A", "B", "C"],
    current: "C",
    neighbours: ["D"],
    focusNeighbour: "D",
    activeEdges: ["e2"],
  },
  {
    title: "D points at an active node",
    description:
      "D's only neighbour is B, which is still on the stack (blue). An edge into an active node closes a directed cycle. Every remaining active node turns orange.",
    messageKind: "blue",
    message: "B is still blue (active). That is a directed cycle.",
    colors: {
      A: "orange",
      B: "orange",
      C: "orange",
      D: "orange",
      E: "black",
    },
    stack: ["A", "B", "C", "D"],
    current: "D",
    neighbours: ["B"],
    focusNeighbour: "B",
    activeEdges: ["e3"],
    cycle: true,
  },
];

const WHITE = "white";
const BLUE = "blue";
const BLACK = "black";
const ORANGE = "orange";

function cloneGraphData(data) {
  return {
    nodes: (data.nodes || []).map((n) => ({ ...n })),
    edges: (data.edges || []).map((e) => ({ ...e })),
  };
}

function outgoingNeighbours(engine, nodeId) {
  return engine.getNeighbours(nodeId);
}

function allNeighboursBlack(engine, nodeId, colors) {
  return outgoingNeighbours(engine, nodeId).every(
    (n) => colors.get(n.id) === BLACK
  );
}

function whiteColorMap(engine) {
  const colors = new Map();
  for (const id of engine.nodes.keys()) colors.set(id, WHITE);
  return colors;
}

function isActiveColor(c) {
  return c === BLUE || c === ORANGE;
}

function cycleNodesOnPath(path, backToId) {
  const i = path.lastIndexOf(backToId);
  if (i < 0) return [...path];
  return path.slice(i);
}

function cycleEdgeIds(engine, cycleNodes) {
  const ids = [];
  if (cycleNodes.length < 1) return ids;
  for (let i = 0; i < cycleNodes.length; i++) {
    const a = cycleNodes[i];
    const b = cycleNodes[(i + 1) % cycleNodes.length];
    const eid = engine.findEdgeId(a, b);
    if (eid) ids.push(eid);
  }
  return ids;
}

/** Active-path cycle if `clickedId` closes a back-edge, otherwise null. */
function cycleFromActiveClick(engine, colors, activePath, clickedId) {
  const clickIdx = activePath.lastIndexOf(clickedId);
  if (clickIdx < 0) return null;

  for (const n of outgoingNeighbours(engine, clickedId)) {
    if (!isActiveColor(colors.get(n.id))) continue;
    const nIdx = activePath.lastIndexOf(n.id);
    if (nIdx >= 0 && nIdx <= clickIdx) {
      return activePath.slice(nIdx, clickIdx + 1);
    }
  }

  for (let i = clickIdx + 1; i < activePath.length; i++) {
    if (engine.hasEdge(activePath[i], clickedId)) {
      return activePath.slice(clickIdx, i + 1);
    }
  }
  return null;
}

function paintAllActive(colors) {
  for (const [id, c] of colors) {
    if (c === BLUE || c === ORANGE) colors.set(id, ORANGE);
  }
}

function computeDirectedColorFrames(engine) {
  const colors = whiteColorMap(engine);
  const frames = [];
  const nodeIds = [...engine.nodes.keys()];
  const stack = [];

  const labelOf = (id) => engine.nodes.get(id)?.label ?? id;

  function push(message, extra = {}) {
    frames.push({
      colors: new Map(colors),
      message,
      currentNode: extra.currentNode ?? null,
      activeEdges: extra.activeEdges ?? [],
      kind: extra.kind ?? "idle",
    });
  }

  push("All nodes start white (incomplete).");

  function dfs(node) {
    stack.push(node);
    colors.set(node, BLUE);
    push(`Mark ${labelOf(node)} active (blue).`, {
      currentNode: node,
      kind: "idle",
    });

    for (const { id: nxt, via } of outgoingNeighbours(engine, node)) {
      const c = colors.get(nxt);
      if (c === BLUE) {
        const cycleNodes = cycleNodesOnPath(stack, nxt);
        paintAllActive(colors);
        push(
          `Neighbour ${labelOf(nxt)} is still active — that is a directed cycle.`,
          {
            currentNode: nxt,
            activeEdges: cycleEdgeIds(engine, cycleNodes),
            kind: "cycle",
          }
        );
        return true;
      }
      if (c === WHITE) {
        push(`Follow ${labelOf(node)} → ${labelOf(nxt)}.`, {
          currentNode: nxt,
          activeEdges: [via],
          kind: "idle",
        });
        if (dfs(nxt)) return true;
      }
    }

    stack.pop();
    colors.set(node, BLACK);
    push(
      `All neighbours of ${labelOf(node)} are complete — mark it black.`,
      { currentNode: node, kind: "ok" }
    );
    return false;
  }

  for (const start of nodeIds) {
    if (colors.get(start) !== WHITE) continue;
    push(`Start a DFS from ${labelOf(start)}.`, {
      currentNode: start,
      kind: "idle",
    });
    if (dfs(start)) return frames;
  }

  push("Every node is complete. No directed cycle.", { kind: "ok" });
  return frames;
}

function dcwTile(label, color, { focus = false } = {}) {
  const el = document.createElement("div");
  el.className = `dcw-tile dcw-tile-${color || "white"}`;
  if (focus) el.classList.add("dcw-tile-focus");
  el.textContent = label;
  return el;
}

function dcwColorOf(colors, id) {
  return colors?.[id] || "white";
}

/**
 * Step-through 3-colour DFS with recursion stack and neighbour strip.
 *
 * @param {HTMLElement} container
 * @param {{width?: number, height?: number, graph?, steps?}} [options]
 */
export function mountDirectedCycleWalkthrough(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 360;
  const height = options.height ?? 280;
  const graph = options.graph ?? DIRECTED_CYCLE_WALKTHROUGH_GRAPH;
  const steps = options.steps ?? DIRECTED_CYCLE_WALKTHROUGH_STEPS;
  let stepIndex = 0;

  container.innerHTML = "";
  container.classList.add("gt-panel-wrap", "dcw-root");

  const body = document.createElement("div");
  body.className = "dcw-body";
  container.appendChild(body);

  const left = document.createElement("div");
  left.className = "dcw-left";
  body.appendChild(left);

  const graphMount = document.createElement("div");
  graphMount.className = "gt-graph-mount";
  left.appendChild(graphMount);

  const info = document.createElement("div");
  info.className = "gt-info";
  left.appendChild(info);

  const side = document.createElement("div");
  side.className = "dcw-side";
  body.appendChild(side);

  const activeLabel = document.createElement("div");
  activeLabel.className = "dcw-active-label";
  activeLabel.textContent = "Current → neighbours";
  side.appendChild(activeLabel);

  const activeRow = document.createElement("div");
  activeRow.className = "dcw-active-row";
  side.appendChild(activeRow);

  const messageEl = document.createElement("div");
  messageEl.className = "dcw-message dcw-message-white";
  messageEl.setAttribute("role", "status");
  side.appendChild(messageEl);

  const stackWrap = document.createElement("div");
  stackWrap.className = "dcw-stack-wrap";
  side.appendChild(stackWrap);

  const stackLabel = document.createElement("div");
  stackLabel.className = "dcw-stack-label";
  stackLabel.textContent = "Recursion stack";
  stackWrap.appendChild(stackLabel);

  const stackEl = document.createElement("div");
  stackEl.className = "dcw-stack";
  stackWrap.appendChild(stackEl);

  const controls = document.createElement("div");
  controls.className = "gt-controls";
  container.appendChild(controls);

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "gt-nav-btn";
  prevBtn.textContent = "← Previous";

  const indicator = document.createElement("span");
  indicator.className = "gt-step-indicator";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "gt-nav-btn";
  nextBtn.textContent = "Next →";

  controls.append(prevBtn, indicator, nextBtn);

  function render() {
    const step = steps[stepIndex];
    if (!step) return;

    const colors = { ...(step.colors || {}) };
    for (const n of graph.nodes || []) {
      if (!colors[n.id]) colors[n.id] = "white";
    }
    const neighbours = step.neighbours || [];
    const current = step.current || null;
    const stack = step.stack || [];

    mountStaticGraphView(graphMount, graph, {
      width,
      height,
      directed: true,
      highlight: {
        current,
        neighbours,
        nodeColors: colors,
        activeEdges: step.activeEdges || [],
        cycleEdge: step.cycle ? (step.activeEdges || [])[0] : null,
      },
    });

    activeRow.innerHTML = "";
    if (current) {
      const curColor = dcwColorOf(colors, current);
      activeRow.appendChild(
        dcwTile(current, curColor, { focus: true })
      );
      if (neighbours.length) {
        const arrow = document.createElement("span");
        arrow.className = "dcw-arrow";
        arrow.textContent = "→";
        activeRow.appendChild(arrow);
        const nbrWrap = document.createElement("div");
        nbrWrap.className = "dcw-nbrs";
        neighbours.forEach((id) => {
          nbrWrap.appendChild(
            dcwTile(id, dcwColorOf(colors, id), {
              focus: id === step.focusNeighbour,
            })
          );
        });
        activeRow.appendChild(nbrWrap);
      }
    }

    const kind = step.messageKind || "white";
    messageEl.className = `dcw-message dcw-message-${kind}`;
    messageEl.textContent = step.message || DCW_MESSAGES[kind] || "";

    stackEl.innerHTML = "";
    if (!stack.length) {
      const empty = document.createElement("div");
      empty.className = "dcw-stack-empty";
      empty.textContent = "empty";
      stackEl.appendChild(empty);
    } else {
      // Newest frame on top, matching the sample (C above B above A).
      for (let i = stack.length - 1; i >= 0; i--) {
        const id = stack[i];
        stackEl.appendChild(
          dcwTile(id, dcwColorOf(colors, id), { focus: id === current })
        );
      }
    }

    info.innerHTML = "";
    const title = document.createElement("h4");
    title.textContent = step.title || "";
    const desc = document.createElement("p");
    desc.className = "gt-desc";
    desc.textContent = step.description || "";
    info.append(title, desc);

    prevBtn.disabled = stepIndex === 0;
    nextBtn.disabled = stepIndex === steps.length - 1;
    indicator.textContent = `Step ${stepIndex + 1} of ${steps.length}`;
  }

  prevBtn.addEventListener("click", () => {
    stepIndex = Math.max(0, stepIndex - 1);
    render();
  });
  nextBtn.addEventListener("click", () => {
    stepIndex = Math.min(steps.length - 1, stepIndex + 1);
    render();
  });

  render();
  return {
    next: () => nextBtn.click(),
    prev: () => prevBtn.click(),
  };
}

export const DIRECTED_CYCLE_CODE_BLOCKS = [
  {
    id: "mark_blue",
    code: "color[node] = BLUE",
    label: "mark the current node active (blue)",
  },
  {
    id: "scan",
    code:
      "for nxt in G[node]:\n" +
      "    if color[nxt] == BLUE:\n" +
      "        return True\n" +
      "    if color[nxt] == WHITE:\n" +
      "        if dfs(nxt):\n" +
      "            return True\n" +
      "    if color[nxt] == BLACK:\n" +
      "        continue",
    label:
      "for each neighbour: blue is a cycle, white → recurse, black → skip",
  },
  {
    id: "mark_black",
    code: "color[node] = BLACK",
    label: "mark the current node complete (black)",
  },
  {
    id: "return_false",
    code: "return False",
    label: "no cycle in this subtree — return to the caller",
  },
];

export const DIRECTED_CYCLE_CODE_OPTIONS = {
  heading: "Directed cycle DFS",
  workspaceLabel: "dfs(node) body",
  preplaced: [],
  solutionOrder: ["mark_blue", "scan", "mark_black", "return_false"],
  showSolutionButton: false,
  lockedBefore: [
    {
      code:
        "def directed_cycle(G):\n" +
        "    WHITE, BLUE, BLACK = \"incomplete\", \"active\", \"complete\"\n" +
        "    color = {node: WHITE for node in G}",
    },
  ],
  lockedContainer: { code: "def dfs(node):" },
  lockedAfter: [
    {
      code:
        "for start in G:\n" +
        "    if color[start] == WHITE:\n" +
        "        if dfs(start):\n" +
        "            return True\n" +
        "return False",
    },
  ],
};

/** Same nodes as the walkthrough; A lists E before B so a complete/pop happens first. */
export const DIRECTED_CYCLE_CODE_GRAPH = {
  nodes: [
    { id: "A", label: "A", x: 70, y: 150 },
    { id: "B", label: "B", x: 190, y: 70 },
    { id: "C", label: "C", x: 310, y: 70 },
    { id: "D", label: "D", x: 310, y: 200 },
    { id: "E", label: "E", x: 190, y: 230 },
  ],
  edges: [
    { id: "e4", source: "A", target: "E", label: "" },
    { id: "e0", source: "A", target: "B", label: "" },
    { id: "e1", source: "B", target: "C", label: "" },
    { id: "e2", source: "C", target: "D", label: "" },
    { id: "e3", source: "D", target: "B", label: "" },
  ],
};

function directedAdjList(graph) {
  const adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) adj.get(e.source)?.push(e.target);
  return adj;
}

function directedEdgeId(graph, a, b) {
  const e = graph.edges.find((x) => x.source === a && x.target === b);
  return e?.id ?? `${a}-${b}`;
}

/**
 * 3-colour DFS frames aligned with DIRECTED_CYCLE_CODE_BLOCKS ids.
 */
export function buildDirectedCycleCodeFrames(graph) {
  const adj = directedAdjList(graph);
  const nodeIds = graph.nodes.map((n) => n.id);
  const color = new Map(nodeIds.map((id) => [id, WHITE]));
  const stack = [];
  const frames = [];

  function colorsObj() {
    const o = {};
    for (const [id, c] of color) o[id] = c;
    return o;
  }

  function snap(extra) {
    return {
      colors: colorsObj(),
      stack: [...stack],
      current: extra.current ?? (stack.length ? stack[stack.length - 1] : null),
      neighbour: extra.neighbour ?? null,
      neighbours: extra.neighbours ?? [],
      activeEdges: extra.activeEdges ?? [],
      blockId: extra.blockId ?? null,
      done: !!extra.done,
      cycle: !!extra.cycle,
      message: extra.message ?? "",
    };
  }

  function dfs(node) {
    stack.push(node);
    color.set(node, BLUE);
    frames.push(
      snap({
        blockId: "mark_blue",
        current: node,
        message: `Mark ${node} active (blue) and push it on the stack.`,
      })
    );

    const nbrs = [...(adj.get(node) ?? [])];
    for (const nxt of nbrs) {
      const c = color.get(nxt);
      const via = directedEdgeId(graph, node, nxt);
      frames.push(
        snap({
          blockId: "scan",
          current: node,
          neighbour: nxt,
          neighbours: nbrs,
          activeEdges: [via],
          message:
            c === BLUE
              ? `${nxt} is still active (blue) — cycle found.`
              : c === WHITE
                ? `${nxt} is white — recurse with dfs(${nxt}).`
                : `${nxt} is black — skip.`,
          cycle: c === BLUE,
          done: c === BLUE,
        })
      );
      if (c === BLUE) {
        paintAllActive(color);
        frames[frames.length - 1] = snap({
          blockId: "scan",
          current: node,
          neighbour: nxt,
          neighbours: nbrs,
          activeEdges: [via],
          cycle: true,
          done: true,
          message: `${nxt} is still active (blue) — cycle found. All active nodes turn orange.`,
        });
        return true;
      }
      if (c === WHITE) {
        if (dfs(nxt)) return true;
      }
    }

    color.set(node, BLACK);
    frames.push(
      snap({
        blockId: "mark_black",
        current: node,
        neighbours: nbrs,
        message: `All neighbours of ${node} are done — mark it complete (black).`,
      })
    );
    stack.pop();
    frames.push(
      snap({
        blockId: "return_false",
        current: stack.length ? stack[stack.length - 1] : null,
        message: `dfs(${node}) found no cycle — pop ${node} and return False.`,
      })
    );
    return false;
  }

  frames.push(
    snap({
      message: "All nodes start white. Call dfs on the first incomplete node.",
    })
  );

  for (const start of nodeIds) {
    if (color.get(start) !== WHITE) continue;
    frames.push(
      snap({
        current: start,
        message: `${start} is still white — start dfs(${start}).`,
      })
    );
    if (dfs(start)) return frames;
  }

  frames.push(
    snap({
      done: true,
      message: "Every node is complete. No directed cycle.",
    })
  );
  return frames;
}

function renderDirectedCycleCodeLegend() {
  return `
    <div class="cy-legend">
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:#ffffff;border-color:var(--line,#19162b)"></span>white
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:#86c0fe;border-color:#e8f2ff"></span>blue / active
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:#19162b;border-color:#fdfeff"></span>black / complete
      </span>
      <span class="cy-leg-item">
        <span class="cy-leg-swatch" style="background:var(--coral,#feb686);border-color:var(--line,#19162b)"></span>orange / cycle
      </span>
    </div>
  `;
}

/**
 * Play / Pause / Next step visualisation for the directed-cycle code-block exercise.
 *
 * @param {HTMLElement} container
 * @param {{
 *   width?: number, height?: number, stepDelayMs?: number,
 *   graph?: {nodes: Array, edges: Array},
 *   onStep?: (frame: object|null) => void,
 *   onRevealSolution?: () => void,
 * }} [options]
 */
export function mountDirectedCycleCodeViz(container, options = {}) {
  if (!container) return null;
  if (typeof container._directedCycleCodeDestroy === "function") {
    container._directedCycleCodeDestroy();
  }

  const width = options.width ?? 360;
  const height = options.height ?? 280;
  const stepDelayMs = options.stepDelayMs ?? 900;
  const graph = options.graph ?? DIRECTED_CYCLE_CODE_GRAPH;
  const onStep = options.onStep ?? (() => {});
  const onRevealSolution = options.onRevealSolution ?? null;
  const frames = buildDirectedCycleCodeFrames(graph);

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("iv-root", "cy-code-viz");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "directed_cycle";
  container.appendChild(heading);

  const graphMount = document.createElement("div");
  graphMount.className = "cyq2-quiz-graph";
  container.appendChild(graphMount);

  const legendMount = document.createElement("div");
  legendMount.innerHTML = renderDirectedCycleCodeLegend();
  container.appendChild(legendMount);

  const stackHost = document.createElement("div");
  stackHost.className = "dcw-code-stack-host";
  container.appendChild(stackHost);

  const status = document.createElement("div");
  status.className = "ht-play-status";
  container.appendChild(status);

  const controls = document.createElement("div");
  controls.className = "ht-quiz-controls";
  container.appendChild(controls);

  let frameIndex = -1;
  let playing = false;
  let playTimer = null;

  function idleState() {
    const colors = {};
    for (const n of graph.nodes) colors[n.id] = WHITE;
    return {
      blockId: null,
      colors,
      stack: [],
      current: null,
      neighbour: null,
      neighbours: [],
      activeEdges: [],
      done: false,
      cycle: false,
      message: "Assemble the dfs body, then press Play or Next step.",
    };
  }

  function clearPlayTimer() {
    if (playTimer != null) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  }

  function stopPlayback() {
    playing = false;
    clearPlayTimer();
  }

  function currentFrame() {
    if (frameIndex < 0 || frameIndex >= frames.length) return null;
    return frames[frameIndex];
  }

  function renderStack(frame) {
    stackHost.innerHTML = "";
    const label = document.createElement("div");
    label.className = "dcw-stack-label";
    label.style.color = "var(--graphite)";
    label.textContent = "Recursion stack";
    stackHost.appendChild(label);
    const stackEl = document.createElement("div");
    stackEl.className = "dcw-stack dcw-stack-row";
    const stack = frame.stack || [];
    if (!stack.length) {
      const empty = document.createElement("div");
      empty.className = "dcw-stack-empty";
      empty.style.color = "var(--muted-on-paper)";
      empty.textContent = "empty";
      stackEl.appendChild(empty);
    } else {
      for (let i = stack.length - 1; i >= 0; i--) {
        const id = stack[i];
        stackEl.appendChild(
          dcwTile(id, frame.colors?.[id] || WHITE, {
            focus: id === frame.current,
          })
        );
      }
    }
    stackHost.appendChild(stackEl);
  }

  function render() {
    const frame = currentFrame() ?? idleState();
    mountStaticGraphView(graphMount, graph, {
      width,
      height,
      directed: true,
      highlight: {
        current: frame.current,
        neighbours: frame.neighbour
          ? [frame.neighbour]
          : frame.neighbours || [],
        nodeColors: frame.colors || {},
        activeEdges: frame.activeEdges || [],
        cycleEdge: frame.cycle ? (frame.activeEdges || [])[0] : null,
      },
    });
    renderStack(frame);
    status.textContent = frame.message ?? "";
    status.classList.toggle("ht-play-status-ok", !!frame.cycle);
    onStep(currentFrame());
    renderControls();
  }

  function stepForward() {
    if (frameIndex < frames.length - 1) {
      frameIndex += 1;
    } else {
      stopPlayback();
    }
    render();
  }

  function play() {
    clearPlayTimer();
    if (frameIndex < 0 || frameIndex >= frames.length - 1) {
      frameIndex = 0;
    }
    playing = true;
    render();

    const tick = () => {
      if (!playing) return;
      if (frameIndex >= frames.length - 1) {
        stopPlayback();
        render();
        return;
      }
      frameIndex += 1;
      render();
      if (playing && frameIndex < frames.length - 1) {
        playTimer = setTimeout(tick, stepDelayMs);
      } else {
        stopPlayback();
        render();
      }
    };
    playTimer = setTimeout(tick, stepDelayMs);
  }

  function reset() {
    stopPlayback();
    frameIndex = -1;
    render();
  }

  function renderControls() {
    controls.innerHTML = "";

    if (onRevealSolution) {
      const revealBtn = document.createElement("button");
      revealBtn.type = "button";
      revealBtn.className = "ht-nav-btn";
      revealBtn.textContent = "Reveal solution";
      revealBtn.onclick = () => {
        stopPlayback();
        onRevealSolution();
        reset();
      };
      controls.appendChild(revealBtn);
    }

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "ht-nav-btn";
    playBtn.textContent = playing ? "Pause" : "Play";
    playBtn.onclick = () => {
      if (playing) {
        stopPlayback();
        render();
      } else {
        play();
      }
    };

    const stepBtn = document.createElement("button");
    stepBtn.type = "button";
    stepBtn.className = "ht-nav-btn";
    stepBtn.textContent = "Next step";
    stepBtn.disabled = frameIndex >= frames.length - 1 && frameIndex >= 0;
    stepBtn.onclick = () => {
      stopPlayback();
      stepForward();
    };

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ht-nav-btn ht-nav-btn-ghost";
    resetBtn.textContent = "Reset";
    resetBtn.onclick = () => reset();

    const indicator = document.createElement("span");
    indicator.className = "ht-step-indicator";
    indicator.textContent =
      frameIndex < 0 ? "Ready" : `${frameIndex + 1} / ${frames.length}`;

    controls.append(playBtn, stepBtn, resetBtn, indicator);
  }

  render();

  const api = {
    play,
    step: stepForward,
    reset,
    destroy: () => stopPlayback(),
  };
  container._directedCycleCodeDestroy = api.destroy;
  return api;
}

/**
 * Interactive 3-colour DFS sandbox for directed cycle detection.
 * Uses GraphEngine + mountGraphView (same canvas/toolbar as the main sandbox).
 *
 * @param {HTMLElement} container
 * @param {{data?: {nodes: Array, edges: Array}, width?: number, height?: number, stepDelayMs?: number}} [options]
 */
export function mountDirectedCycleSandbox(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 640;
  const height = options.height ?? 400;
  const stepDelayMs = options.stepDelayMs ?? 900;
  const initialData = cloneGraphData(options.data ?? DIRECTED_CYCLE_SANDBOX_GRAPH);

  if (container._directedCycleDestroy) {
    container._directedCycleDestroy();
  }

  const engine = new GraphEngine(initialData, { directed: true });
  let colors = whiteColorMap(engine);
  let activePath = [];
  let playing = false;
  let playTimer = null;
  let frameIndex = -1;
  let frames = [];

  container.innerHTML = "";
  container.classList.add("dcs-root");

  const graphEl = document.createElement("div");
  container.appendChild(graphEl);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "gv-btn";
  resetBtn.textContent = "Reset";
  resetBtn.setAttribute("aria-label", "Reset colours");
  resetBtn.title = "Reset colours";

  const solutionBtn = document.createElement("button");
  solutionBtn.type = "button";
  solutionBtn.className = "gv-btn";
  solutionBtn.textContent = "Show solution";
  solutionBtn.setAttribute("aria-label", "Show solution");
  solutionBtn.title = "Show solution";

  const INITIAL_MESSAGE =
    "Click a white node to mark it active, then follow a path. Click a blue node to complete it once every neighbour is black.";

  let setFeedback = () => {};

  function syncColors(extra = {}) {
    engine.setViz({
      nodeColors: colors,
      currentNode: extra.currentNode ?? null,
      currentNeighbor: extra.currentNeighbor ?? null,
      activeEdges: extra.activeEdges ?? [],
    });
  }

  function stopPlayback() {
    playing = false;
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    solutionBtn.textContent = "Show solution";
  }

  function applyFrame(frame) {
    colors = new Map(frame.colors);
    syncColors({
      currentNode: frame.currentNode,
      activeEdges: frame.activeEdges,
    });
    setFeedback(frame.message, frame.kind || "idle");
  }

  function ensureNodeColors() {
    let changed = false;
    for (const id of engine.nodes.keys()) {
      if (!colors.has(id)) {
        colors.set(id, WHITE);
        changed = true;
      }
    }
    for (const id of [...colors.keys()]) {
      if (!engine.nodes.has(id)) {
        colors.delete(id);
        changed = true;
      }
    }
    const nextPath = activePath.filter((id) => engine.nodes.has(id));
    if (nextPath.length !== activePath.length) {
      activePath = nextPath;
      changed = true;
    }
    if (changed) syncColors();
  }

  function onNodeClick(id) {
    if (playing) return;
    ensureNodeColors();
    if (!engine.nodes.has(id)) return;

    const state = colors.get(id) || WHITE;
    const label = engine.nodes.get(id)?.label ?? id;

    if (state === BLACK) {
      setFeedback(`${label} is already complete.`, "idle");
      return;
    }

    if (state === ORANGE) {
      setFeedback(`${label} is on the active path of a found cycle.`, "cycle");
      return;
    }

    if (state === WHITE) {
      colors.set(id, BLUE);
      activePath.push(id);
      const blueNbr = outgoingNeighbours(engine, id).find((n) =>
        isActiveColor(colors.get(n.id))
      );
      if (blueNbr) {
        const cycleNodes = cycleNodesOnPath(activePath, blueNbr.id);
        paintAllActive(colors);
        const nbrLabel = engine.nodes.get(blueNbr.id)?.label ?? blueNbr.id;
        syncColors({
          currentNode: id,
          activeEdges: cycleEdgeIds(engine, cycleNodes),
        });
        setFeedback(
          `${label} has an outgoing edge to active node ${nbrLabel} — that is a cycle.`,
          "cycle"
        );
      } else {
        syncColors({ currentNode: id });
        setFeedback(
          `${label} is active. Follow a white neighbour, or complete it when every neighbour is black.`,
          "idle"
        );
      }
      return;
    }

    // Blue → black, but only at the end of the path.
    const closedCycle = cycleFromActiveClick(engine, colors, activePath, id);
    if (closedCycle && closedCycle.length) {
      paintAllActive(colors);
      syncColors({
        currentNode: id,
        activeEdges: cycleEdgeIds(engine, closedCycle),
      });
      setFeedback(
        `Active nodes on this path close a directed cycle.`,
        "cycle"
      );
      return;
    }

    if (!allNeighboursBlack(engine, id, colors)) {
      const unfinished = outgoingNeighbours(engine, id)
        .filter((n) => colors.get(n.id) !== BLACK)
        .map((n) => engine.nodes.get(n.id)?.label ?? n.id);
      setFeedback(
        `Not yet: ${label} still has unfinished neighbour${unfinished.length === 1 ? "" : "s"} (${unfinished.join(", ")}). Complete a node only when every neighbour is black.`,
        "warn"
      );
      syncColors({ currentNode: id });
      return;
    }

    colors.set(id, BLACK);
    activePath = activePath.filter((n) => n !== id);
    syncColors({ currentNode: id });
    setFeedback(`${label} is complete.`, "ok");
  }

  const graphView = mountGraphView(engine, graphEl, {
    width,
    height,
    showToolbar: true,
    caption: INITIAL_MESSAGE,
    toolbarEnd: [resetBtn, solutionBtn],
    onNodeClick,
  });

  setFeedback = (message, kind = "idle") => {
    graphView.setCaption(message, kind === "idle" ? "" : kind);
  };

  syncColors();

  engine.subscribe(() => {
    if (playing) return;
    ensureNodeColors();
  });

  resetBtn.addEventListener("click", () => {
    stopPlayback();
    frameIndex = -1;
    frames = [];
    colors = whiteColorMap(engine);
    activePath = [];
    engine.clearSelection();
    syncColors();
    setFeedback(INITIAL_MESSAGE, "idle");
  });

  function playSolution() {
    if (playing) {
      stopPlayback();
      return;
    }

    const resuming =
      frameIndex >= 0 && frames.length > 0 && frameIndex < frames.length - 1;
    if (!resuming) {
      frames = computeDirectedColorFrames(engine);
      if (!frames.length) return;
      frameIndex = 0;
      applyFrame(frames[0]);
    }

    playing = true;
    solutionBtn.textContent = "Pause";

    const tick = () => {
      if (!playing) return;
      if (frameIndex >= frames.length - 1) {
        stopPlayback();
        return;
      }
      frameIndex += 1;
      applyFrame(frames[frameIndex]);
      if (playing && frameIndex < frames.length - 1) {
        playTimer = setTimeout(tick, stepDelayMs);
      } else {
        stopPlayback();
      }
    };
    playTimer = setTimeout(tick, stepDelayMs);
  }

  solutionBtn.addEventListener("click", playSolution);

  const api = {
    reset: () => resetBtn.click(),
    playSolution,
    destroy: () => {
      stopPlayback();
    },
  };
  container._directedCycleDestroy = api.destroy;
  return api;
}
