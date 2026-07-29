// graph-traversal-helpers.js
// Space-station heat-traversal quiz + live editable playground.
// Visual theme lives here (separate from gv-* chalk/ink graphs):
// square rooms, orthogonal vents, light playful station look, blink highlights.

// ---------------------------------------------------------------------------
// Station graph data (edit-friendly: change nodes/edges here)
// ---------------------------------------------------------------------------

/** Design-space layout (scaled to the canvas by `scaleStationGraph`). */
const STATION_LAYOUT = {
  nodes: [
    { id: "C", label: "Cafeteria", x: 70, y: 150 },
    { id: "M", label: "MedBay", x: 190, y: 70 },
    { id: "CQ", label: "Crew Qtrs", x: 190, y: 230 },
    { id: "A", label: "A", x: 310, y: 50 },
    { id: "G", label: "G", x: 310, y: 230 },
    { id: "P", label: "P", x: 430, y: 70 },
    { id: "S", label: "S", x: 430, y: 210 },
    { id: "AD", label: "Admin", x: 550, y: 140 },
  ],
  edges: [
    { id: "C—M", source: "C", target: "M" },
    { id: "C—CQ", source: "C", target: "CQ" },
    { id: "M—A", source: "M", target: "A" },
    { id: "CQ—G", source: "CQ", target: "G" },
    { id: "A—P", source: "A", target: "P" },
    { id: "A—G", source: "A", target: "G" },
    { id: "G—S", source: "G", target: "S" },
    { id: "P—AD", source: "P", target: "AD" },
    { id: "S—AD", source: "S", target: "AD" },
  ],
};

/**
 * Full ventilation map for the heat-reachability story.
 * @param {{width?: number, height?: number}} [opts]
 */
export function createStationGraphData(opts = {}) {
  return scaleStationGraph(STATION_LAYOUT, opts.width ?? 560, opts.height ?? 280);
}

/** Fit fixed station coordinates into a canvas with padding. */
export function scaleStationGraph(data, width, height, pad = 36) {
  const xs = data.nodes.map((n) => n.x);
  const ys = data.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const nodes = data.nodes.map((n) => ({
    ...n,
    x: pad + ((n.x - minX) / spanX) * (width - pad * 2),
    y: pad + ((n.y - minY) / spanY) * (height - pad * 2),
  }));
  return { nodes, edges: data.edges.map((e) => ({ ...e })) };
}

/** Compact labels for bag / tracking chips. */
export function roomChipLabel(id) {
  const map = {
    C: "Cafeteria",
    M: "MedBay",
    CQ: "Crew Qtrs",
    A: "A",
    G: "G",
    AD: "Admin",
    S: "S",
    P: "P",
  };
  return map[id] ?? id;
}

/**
 * Visibility tiers for the quiz graph.
 * 0 = start+end only, 1 = neighbours revealed, 2 = full map,
 * 3 = full map with every label blanked except the Cafeteria (start room)
 */
export function filterStationGraph(data, visibility) {
  const allIds = new Set(data.nodes.map((n) => n.id));
  const tiers = {
    0: new Set(["C", "P"]),
    1: allIds,
    2: allIds,
    3: allIds,
    4: allIds,
  };
  const labelled = {
    1: new Set(["C", "M", "CQ"]),
    2: new Set(["C", "M", "CQ", "A", "P"]),
    3: new Set([findCafeteriaId(data.nodes)]),
    4: new Set(["C", "M", "CQ", "A"]),
  };
  const keep = tiers[visibility] ?? tiers[0];
  const showLabel = labelled[visibility] ?? null;
  const nodes = data.nodes
    .filter((n) => keep.has(n.id))
    .map((n) => (showLabel && !showLabel.has(n.id) ? { ...n, label: "" } : n));
  const edges = data.edges.filter(
    (e) => keep.has(e.source) && keep.has(e.target)
  );
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Quiz question definitions
// ---------------------------------------------------------------------------

/**
 * Each quiz item has two independent panel configs: `question` (shown before
 * reveal) and `answer` (shown after). Each panel config is a standalone
 * input — graph, highlight, bag, and tracking are all specified per panel,
 * not derived from one shared filtered graph. This lets a given question's
 * "before" and "after" states use entirely different graphs if needed, and
 * lets you edit the graph in one panel without touching the other.
 *
 * Panel shape:
 *   {
 *     graph?: {nodes, edges}   // explicit graph for this panel. If omitted,
 *                              // falls back to filterStationGraph(fullData, visibility)
 *     visibility?: 0|1|2       // only used when `graph` is not provided
 *     highlight?: object       // passed straight to mountStationGraphView
 *     bag?: string[]
 *     bagPick?: string|null
 *     bagPickDone?: string|null // picked room fading out of the bag
 *     tracking?: string[]
 *     prompt?: string          // question panel only
 *     text?: string            // answer panel only (the answer copy)
 *     note?: string            // answer panel only (optional footnote)
 *   }
 */
export const HEAT_QUIZ_QUESTIONS = [
  {
    id: 1,
    question: {
      prompt: 'What are the "states" in this problem?',
      visibility: 3,
    },
    answer: {
      text: "The rooms in the space station.",
      visibility: 3,
      highlight: { start: "C", end: "P", visited: ["C", "M", "CQ","A","G","S", "AD", "P"], },
      tracking: [],
      note: "States = rooms the heat (or you) can be in.",
    },
  },
  {
    id: 2,
    question: {
      prompt:
        'What do we "track"?',
      visibility: 3,
      bag: [],
    },
    answer: {
      text: "We track all rooms that the heat can reach. So at the start, the heat can reach the Cafeteria, so we will track the Cafeteria.",
      visibility: 3,
      highlight: {
        start: "C",
        end: "P",
        current: "C",
      },
      bag: [],
      tracking: ["C"],
      trackPick: ["C"],
    },
  },
  {
    id: 3,
    question: {
      prompt: "For our traversal, what is the start state?",
      visibility: 3,
      tracking: ["C"],
    },
    answer: {
      text: "The Cafeteria — that's where the heater is. We want to explore it so we bag it.",
      visibility: 3,
      highlight: { start: "C", end: "P", current: "C" },
      bag: ["C"],
      tracking: ["C"],
      note: "Heat starts spreading from the Cafeteria.",
    },
  },
  {
    id: 4,
    question: {
      prompt:
        "Now we start exploring from the Cafeteria. At this point which rooms can be heated?",
      visibility: 1,
      tracking: ["C"],
      highlight: {
        current: "C",
      },
      bag: ["C"],
      bagPick: "C",
    },
    answer: {
      text: "MedBay and Crew Quarters are the neighbours, thus the heat can reach them, so we will track them.",
      visibility: 1,
      highlight: {
        neighbours: ["M", "CQ"],
      },
      bag: ["C"],
      bagPick: "C",
      tracking: ["C","M", "CQ"],
      trackPick: ["M", "CQ"],
      note: "We can also choose to track these when we put them IN the bag, or pull them OUT of the bag. This is the simplest method: tracking AS SOON AS we encounter them.",
    },
  },
  {
    id: 5,
    question: {
      prompt:
        'Now we\'ve fully explored the Cafeteria. What are the next rooms we need to explore?',
      visibility: 1,
      tracking: ["C","M", "CQ"],
      bag: ["C"],
      bagPickDone: "C",
    },
    answer: {
      text: "We need to explore both MedBay and Crew Quarters. We also remove the Cafeteria from the bag because we have already explored it.",
      visibility: 1,
      highlight: {
        neighbours: ["M", "CQ"],
      },
      bag: ["C","M", "CQ"],
      bagPickDone: "C",
      tracking: ["C","M", "CQ"],
      note: "The bag holds rooms we have not explored yet.",
    },
  },
  {
    id: 6,
    question: {
      prompt:
        "How do we pick the next room to continue the traversal?",
      visibility: 1,
      bag: ["M", "CQ"],
      tracking: ["C","M", "CQ"],
    },
    answer: {
      text: "We randomly pick one room from the bag.",
      visibility: 1,
      highlight: {
        end: "P",
        current: "M",
      },
      bag: ["M", "CQ"],
      bagPick: "M",
      tracking: ["C","M", "CQ"],
      note: "Random pick from the bag = unordered traversal.",
    },
  },
  {
    id: 7,
    question: {
      prompt: "What do we track and bag as we move to the MedBay?",
      visibility: 4,
      bag: ["M","CQ"],
      bagPick: "M",
      tracking: ["C","M", "CQ"],
      highlight: {
        current: "M",
      },
    },
    answer: {
      text: "We track MedBay's neighbours (heat can reach them) and we bag MedBay's neighbours (we need to traverse them). \n\n We notice that Cafeteria has already been tracked so we do not add it to the bag again.",
      visibility: 4,
      highlight: {
        current: "M",
        previous: "C",
        neighbours: ["A"],
      },
      bag: ["M","CQ", "A"],
      bagPickDone: "M",
      tracking: ["C","M", "CQ","A"],
      note: "Tracking = all reachable rooms / Bag = rooms we have to visit in the future",
    },
  },
  {
    id: 8,
    question: {
      prompt: "When do we stop the traversal?",
      visibility: 4,
      bag: ["CQ", "A"],
      bagPick: "A",
      tracking: ["C","M", "CQ","A"],
      highlight: {
        current: "A",
      }
    },
    answer: {
      text: "When we reach room P OR we run out of rooms in the bag",
      visibility: 2,
      highlight: {
        start: "C",
        end: "P",
        current: "P",
        visited: ["C", "M", "A", "P"],
      },
      bag: ["CQ"],
      tracking: ["C", "M", "CQ", "A", "P"],
      note: "Goal reached: stop as soon as P is encountered.",
    },
  },
];

// ---------------------------------------------------------------------------
// Bag + tracking UI (sci-fi station theme)
// ---------------------------------------------------------------------------

/**
 * Render a ventilation "holding bay" bag.
 * @param {{items?: string[], pick?: string|null, pickDone?: string|null, title?: string, emptyText?: string}} opts
 */
export function renderBagPanel(opts = {}) {
  const items = opts.items ?? [];
  const pick = opts.pick ?? null;
  const pickDone = opts.pickDone ?? null;
  const title = opts.title ?? "TO BE EXPLORED";
  const emptyText = opts.emptyText ?? "bay empty — awaiting rooms…";

  const chips =
    items.length === 0
      ? `<div class="ht-bag-empty">${escapeHtml(emptyText)}</div>`
      : items
          .map((id) => {
            const done = pickDone != null && id === pickDone;
            const picked = !done && pick != null && id === pick;
            const cls = done
              ? " ht-bag-chip-pick-done"
              : picked
                ? " ht-bag-chip-pick"
                : "";
            const check = done
              ? `<span class="ht-bag-chip-check" aria-hidden="true">✓</span>`
              : "";
            return `<span class="ht-bag-chip${cls}" data-id="${escapeHtml(id)}">${escapeHtml(roomChipLabel(id))}${check}</span>`;
          })
          .join("");

  return `
    <div class="ht-bag" aria-label="Bag">
      <div class="ht-bag-header">
        <span class="ht-bag-title">${escapeHtml(title)}</span>
      </div>
      <div class="ht-bag-body">${chips}</div>
      <div class="ht-bag-footer">random draw · unordered frontier</div>
    </div>
  `;
}

/**
 * Render a separate reachable/visited tracking strip.
 * @param {{items?: string[], title?: string, emptyText?: string}} opts
 */
export function renderTrackingPanel(opts = {}) {
  const items = opts.items ?? [];
  const title = opts.title ?? "TRACK - HEAT REACHABLE";
  const emptyText = opts.emptyText ?? "no rooms logged yet…";

  const chips =
    items.length === 0
      ? `<div class="ht-track-empty">${escapeHtml(emptyText)}</div>`
      : items
          .map(
            (id) =>
              `<span class="ht-track-chip" data-id="${escapeHtml(id)}">${escapeHtml(roomChipLabel(id))}</span>`
          )
          .join("");

  return `
    <div class="ht-track" aria-label="Tracking">
      <div class="ht-track-header">
        <span class="ht-track-title">${escapeHtml(title)}</span>
      </div>
      <div class="ht-track-body">${chips}</div>
      <div class="ht-track-footer">visited / reachable rooms</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Station graph view (square rooms, right-angle vents, blink highlight)
// ---------------------------------------------------------------------------

const NODE_PAD_X = 12;
const NODE_PAD_Y = 8;
const NODE_MIN_W = 40;
const NODE_MIN_H = 28;
const NODE_MAX_W = 118;
const NODE_MAX_H = 44;
const CHAR_W = 7.1;

/** Estimate square room size from label length (capped). */
export function measureStationNode(label) {
  const text = String(label ?? "");
  const w = Math.min(
    NODE_MAX_W,
    Math.max(NODE_MIN_W, Math.ceil(text.length * CHAR_W) + NODE_PAD_X * 2)
  );
  const h = Math.min(NODE_MAX_H, Math.max(NODE_MIN_H, 14 + NODE_PAD_Y * 2));
  return { w, h };
}

/** Orthogonal (right-angle) vent path between two room centers. */
export function orthogonalVentPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  // Prefer a clean L when nearly axis-aligned; otherwise a mid elbow.
  if (dx < 4) return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (dy < 4) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
}

/**
 * Build the set of node ids that should blink for a highlight payload.
 * Blink is the only highlight treatment in this theme (no role colors).
 */
export function blinkIdsFromHighlight(highlight = {}) {
  const ids = new Set();
  const add = (v) => {
    if (v == null || v === "") return;
    ids.add(String(v));
  };
  add(highlight.current);
  add(highlight.next);
  add(highlight.previous);
  for (const id of highlight.neighbours ?? []) add(id);

  const hasFocus =
    highlight.current != null ||
    highlight.next != null ||
    highlight.previous != null ||
    (highlight.neighbours && [...highlight.neighbours].length > 0);

  // Use visited as the blink set only when there is no sharper focus.
  if (!hasFocus) {
    for (const id of highlight.visited ?? []) add(id);
  }
  if (ids.size === 0) {
    add(highlight.start);
    add(highlight.end);
  }
  return ids;
}

/**
 * Render the station map into `container`.
 * @param {HTMLElement} container
 * @param {{nodes: Array, edges: Array}} data
 * @param {{
 *   width?: number,
 *   height?: number,
 *   highlight?: object,
 *   caption?: string,
 *   selectedId?: string|null,
 *   edgeSource?: string|null,
 * }} options
 */
export function mountStationGraphView(container, data, options = {}) {
  if (!container) return;

  const width = options.width ?? 400;
  const height = options.height ?? 260;
  const highlight = options.highlight ?? {};
  const blink = blinkIdsFromHighlight(highlight);
  const pathEdges = new Set(
    [...(highlight.pathEdges ?? [])].map(String).filter(Boolean)
  );
  const selectedId = options.selectedId != null ? String(options.selectedId) : null;
  const edgeSource = options.edgeSource != null ? String(options.edgeSource) : null;
  const nodesIn = data?.nodes ?? [];
  const edgesIn = data?.edges ?? [];

  container.innerHTML = "";
  container.classList.add("ht-graph-root");

  if (options.caption) {
    const cap = document.createElement("div");
    cap.className = "ht-graph-caption";
    cap.textContent = options.caption;
    container.appendChild(cap);
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("class", "ht-graph-svg");
  container.appendChild(svg);

  const byId = new Map();
  nodesIn.forEach((n) => {
    const label = n.label ?? n.id;
    const { w, h } = measureStationNode(label);
    byId.set(n.id, {
      id: n.id,
      label,
      x: n.x ?? width / 2,
      y: n.y ?? height / 2,
      w,
      h,
    });
  });

  const edgeLayer = document.createElementNS(svgNS, "g");
  edgeLayer.setAttribute("class", "ht-edge-layer");
  svg.appendChild(edgeLayer);

  const nodeLayer = document.createElementNS(svgNS, "g");
  nodeLayer.setAttribute("class", "ht-node-layer");
  svg.appendChild(nodeLayer);

  edgesIn.forEach((e, i) => {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) return;
    const id = e.id ?? `e${i}`;
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", orthogonalVentPath(s.x, s.y, t.x, t.y));
    path.setAttribute(
      "class",
      pathEdges.has(id) ? "ht-edge ht-edge-active" : "ht-edge"
    );
    path.setAttribute("data-id", id);
    edgeLayer.appendChild(path);
  });

  byId.forEach((n) => {
    const classes = ["ht-node"];
    if (blink.has(n.id)) classes.push("ht-node-blink");
    if (selectedId === n.id || edgeSource === n.id) classes.push("ht-node-selected");

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("class", classes.join(" "));
    g.setAttribute("data-id", n.id);
    g.setAttribute("transform", `translate(${n.x},${n.y})`);

    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", String(-n.w / 2));
    rect.setAttribute("y", String(-n.h / 2));
    rect.setAttribute("width", String(n.w));
    rect.setAttribute("height", String(n.h));
    rect.setAttribute("rx", "6");
    rect.setAttribute("ry", "6");
    rect.setAttribute("class", "ht-node-rect");

    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("class", "ht-node-label");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.textContent = n.label;

    g.append(rect, text);
    nodeLayer.appendChild(g);
  });
}

function buildNavControls({ prevDisabled, nextDisabled, nextLabel, indicator, onPrev, onNext, extraButtons = [] }) {
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

// ---------------------------------------------------------------------------
// Guided quiz mount (graph left, questions right)
// ---------------------------------------------------------------------------

/**
 * Interactive Q&A: graph grows with the questions; Next reveals the answer
 * and highlights the matching concept on the left.
 *
 * @param {HTMLElement} container
 * @param {{width?: number, height?: number, questions?: typeof HEAT_QUIZ_QUESTIONS}} options
 */
export function mountHeatQuiz(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 400;
  const height = options.height ?? 260;
  const questions = options.questions ?? HEAT_QUIZ_QUESTIONS;
  const fullData = createStationGraphData({ width, height });

  let qIndex = 0;
  let revealed = false;

  container.innerHTML = "";
  container.classList.add("ht-quiz");

  const layout = document.createElement("div");
  layout.className = "ht-quiz-layout";

  const left = document.createElement("div");
  left.className = "ht-quiz-left";

  const graphMount = document.createElement("div");
  graphMount.className = "ht-quiz-graph";

  const sidePanels = document.createElement("div");
  sidePanels.className = "ht-quiz-side";

  left.append(graphMount, sidePanels);

  const right = document.createElement("div");
  right.className = "ht-quiz-right";

  layout.append(left, right);
  container.append(layout);

  /**
   * Resolve a panel (question or answer) into concrete render inputs.
   * `panel.graph` is used verbatim if provided; otherwise it falls back to
   * the shared station graph filtered by `panel.visibility`. This is what
   * makes the two panels independent: either one can be handed its own
   * fully custom graph without affecting the other.
   */
  function resolvePanel(panel = {}) {
    return {
      graph: panel.graph ?? filterStationGraph(fullData, panel.visibility ?? 0),
      highlight: panel.highlight ?? {},
      bag: panel.bag ?? [],
      bagPick: panel.bagPick ?? null,
      bagPickDone: panel.bagPickDone ?? null,
      tracking: panel.tracking ?? [],
    };
  }

  function render() {
    const q = questions[qIndex];
    const panel = revealed ? q.answer : q.question;
    const resolved = resolvePanel(panel);

    mountStationGraphView(graphMount, resolved.graph, {
      width,
      height,
      highlight: resolved.highlight,
    });

    sidePanels.innerHTML =
      renderTrackingPanel({ items: resolved.tracking }) + renderBagPanel({
        items: resolved.bag,
        pick: resolved.bagPick,
        pickDone: resolved.bagPickDone,
      });

    right.innerHTML = `
      <div class="ht-quiz-meta">Question ${qIndex + 1} of ${questions.length}</div>
      <h4 class="ht-quiz-prompt">${escapeHtml(q.question.prompt)}</h4>
      <div class="ht-quiz-answer-wrap ${revealed ? "ht-quiz-answer-visible" : ""}">
        ${
          revealed
            ? `<div class="ht-quiz-answer"><span class="ht-quiz-answer-label">Answer</span>${escapeHtml(q.answer.text)}</div>
               ${q.answer.note ? `<p class="ht-quiz-note">${escapeHtml(q.answer.note)}</p>` : ""}`
            : `<div class="ht-quiz-answer-hidden">Answer hidden — press Reveal to show</div>`
        }
      </div>
    `;

    const controls = buildNavControls({
      prevDisabled: qIndex === 0 && !revealed,
      nextDisabled: revealed && qIndex >= questions.length - 1,
      nextLabel: !revealed
        ? "Reveal answer →"
        : qIndex < questions.length - 1
          ? "Next question →"
          : "Done",
      indicator: revealed ? "Answer shown" : "Think first",
      onPrev: () => {
        if (revealed) {
          revealed = false;
        } else if (qIndex > 0) {
          qIndex -= 1;
          revealed = true;
        }
        render();
      },
      onNext: () => {
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
    getState: () => ({ qIndex, revealed }),
    goTo: (i, showAnswer = false) => {
      qIndex = Math.max(0, Math.min(questions.length - 1, i));
      revealed = !!showAnswer;
      render();
    },
  };
}

// ---------------------------------------------------------------------------
// Live reachability playground (independent editor + animated traversal)
// ---------------------------------------------------------------------------

/** Find Cafeteria / room P by id or label (case-insensitive). */
export function findCafeteriaId(nodes) {
  for (const n of nodes) {
    const id = String(n.id).toLowerCase();
    const label = String(n.label ?? n.id).toLowerCase().trim();
    if (id === "c" || label === "c" || label === "cafeteria") return n.id;
  }
  return null;
}

export function findRoomPId(nodes) {
  for (const n of nodes) {
    const id = String(n.id).toLowerCase();
    const label = String(n.label ?? n.id).toLowerCase().trim();
    if (id === "p" || label === "p" || label === "room p") return n.id;
  }
  return null;
}

function cloneStationData(data) {
  return {
    nodes: (data.nodes ?? []).map((n) => ({ ...n })),
    edges: (data.edges ?? []).map((e) => ({ ...e })),
  };
}

function neighboursOf(data, nodeId) {
  const out = [];
  for (const e of data.edges) {
    if (e.source === nodeId) out.push({ id: e.target, edgeId: e.id });
    else if (e.target === nodeId) out.push({ id: e.source, edgeId: e.id });
  }
  return out;
}

function edgeIdBetween(a, b) {
  return `${a}—${b}`;
}

/**
 * Build animation frames for a random-bag reachability walk on the live graph.
 * Stops when room P is reached, or the bag is empty.
 */
export function buildReachabilityFrames(data, startId, goalId) {
  const frames = [];
  const visited = new Set([startId]);
  const bag = [];
  const tracking = [startId];
  const activeEdges = [];
  const via = new Map(); // node -> edge used to first reach it

  for (const nb of neighboursOf(data, startId)) {
    if (!visited.has(nb.id) && !bag.includes(nb.id)) {
      bag.push(nb.id);
      via.set(nb.id, nb.edgeId);
    }
  }

  frames.push({
    current: startId,
    bag: [...bag],
    bagPick: null,
    bagPickDone: null,
    tracking: [...tracking],
    visited: [...visited],
    pathEdges: [...activeEdges],
    neighbours: [...bag],
    done: false,
    reached: false,
  });

  while (bag.length > 0) {
    const pickIdx = Math.floor(Math.random() * bag.length);
    const pick = bag.splice(pickIdx, 1)[0];

    frames.push({
      current: startId,
      bag: [...bag, pick],
      bagPick: pick,
      bagPickDone: pick,
      tracking: [...tracking],
      visited: [...visited],
      pathEdges: [...activeEdges],
      neighbours: [pick],
      done: false,
      reached: false,
    });

    visited.add(pick);
    tracking.push(pick);
    const usedEdge = via.get(pick);
    if (usedEdge && !activeEdges.includes(usedEdge)) activeEdges.push(usedEdge);

    const reached = pick === goalId;
    const newNbs = [];
    if (!reached) {
      for (const nb of neighboursOf(data, pick)) {
        if (!visited.has(nb.id) && !bag.includes(nb.id)) {
          bag.push(nb.id);
          via.set(nb.id, nb.edgeId);
          newNbs.push(nb.id);
        }
      }
    }

    frames.push({
      current: pick,
      bag: [...bag],
      bagPick: null,
      bagPickDone: null,
      tracking: [...tracking],
      visited: [...visited],
      pathEdges: [...activeEdges],
      neighbours: newNbs,
      done: reached || bag.length === 0,
      reached,
    });

    if (reached) break;
  }

  if (frames.length === 1) {
    frames[0].done = true;
    frames[0].reached = startId === goalId;
  }

  return frames;
}

// ---------------------------------------------------------------------------
// Heat "Convert it to code" viz — runs the student's assembled blocks via
// Pyodide (same idea as islands-viz-view) and drives graph / bag / tracking
// + code-block highlights with Play / Step / Reset.
// ---------------------------------------------------------------------------

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/";
const PYODIDE_MODULE = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.mjs";

let _heatPyodidePromise = null;

function getHeatPyodide() {
  if (!_heatPyodidePromise) {
    _heatPyodidePromise = (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_MODULE);
      return loadPyodide({ indexURL: PYODIDE_INDEX });
    })();
  }
  return _heatPyodidePromise;
}

/** @typedef {"pick"|"check_goal"|"track_neighbours"|"bag_neighbours"|"remove_node"} HeatStepBlockId */

export const HEAT_STEP_BLOCK_ORDER = [
  "pick",
  "check_goal",
  "track_neighbours",
  "bag_neighbours",
  "remove_node",
];

/** Build a Python adjacency dict keyed by room chip labels (matches student code). */
function buildLabelAdjLiteral(data) {
  const idToLabel = new Map(
    data.nodes.map((n) => [n.id, roomChipLabel(n.id)])
  );
  const adj = new Map();
  data.nodes.forEach((n) => adj.set(idToLabel.get(n.id), []));
  data.edges.forEach((e) => {
    const a = idToLabel.get(e.source);
    const b = idToLabel.get(e.target);
    if (!a || !b) return;
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  });
  const lines = [...adj.entries()].map(([k, v]) => {
    const list = v.map((x) => JSON.stringify(x)).join(", ");
    return `    ${JSON.stringify(k)}: [${list}],`;
  });
  return "{\n" + lines.join("\n") + "\n}";
}

/**
 * Map a Python room label (or raw id) back to the station graph node id.
 * @param {{nodes: Array}} data
 * @param {string|null|undefined} label
 */
export function roomLabelToId(data, label) {
  if (label == null || label === "") return null;
  const s = String(label);
  for (const n of data.nodes) {
    if (n.id === s) return n.id;
    if (String(n.label ?? "") === s) return n.id;
    if (roomChipLabel(n.id) === s) return n.id;
  }
  return null;
}

/**
 * Inject probes that emit one event per recognised block line so the viz
 * can highlight the matching code block and snapshot bag / tracking.
 */
export function instrumentHeatPython(src) {
  const lines = src.split("\n");
  const out = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const indent = (trimmed.match(/^(\s*)/) || ["", ""])[1];

    if (/^\s*bag\s*=\s*set\(\)\s*$/.test(trimmed)) {
      out.push(`${indent}bag = _TraceBag("bag")`);
      continue;
    }
    if (/^\s*tracking\s*=\s*set\(\)\s*$/.test(trimmed)) {
      out.push(`${indent}tracking = _TraceBag("tracking")`);
      continue;
    }

    // Guard infinite loops when the student forgets to remove from the bag.
    if (/^\s*while\s+bag\s*:\s*$/.test(trimmed)) {
      out.push(trimmed);
      out.push(`${indent}    _guard_iter()`);
      continue;
    }

    // Check-goal fires *before* the if so the block highlights even when
    // the condition is false.
    if (/^\s*if\s+node\s*==\s*(["'])P\1\s*:\s*$/.test(trimmed)) {
      out.push(`${indent}_probe("check_goal")`);
      out.push(trimmed);
      continue;
    }

    out.push(trimmed);

    if (/^\s*node\s*=\s*random\.choice\s*\(\s*list\s*\(\s*bag\s*\)\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_state["node"] = node`);
      out.push(`${indent}_probe("pick")`);
    }

    if (/^\s*neighbours\s*=\s*get_neighbours\s*\(\s*node\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_state["neighbours"] = list(neighbours)`);
    }

    // Prefer the pedagogical `tracking.add(neighbours)` line; also accept update().
    if (
      /^\s*tracking\.add\s*\(\s*neighbours\s*\)\s*$/.test(trimmed) ||
      /^\s*tracking\.update\s*\(\s*neighbours\s*\)\s*$/.test(trimmed)
    ) {
      out.push(`${indent}_probe("track_neighbours")`);
    }

    if (
      /^\s*bag\.add\s*\(\s*neighbours\s*\)\s*$/.test(trimmed) ||
      /^\s*bag\.update\s*\(\s*neighbours\s*\)\s*$/.test(trimmed)
    ) {
      out.push(`${indent}_probe("bag_neighbours")`);
    }

    if (/^\s*bag\.remove\s*\(\s*node\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_probe("remove_node")`);
    }

    if (/^\s*heat_reachable\s*=\s*True\s*$/.test(trimmed)) {
      out.push(`${indent}_state["reached"] = True`);
    }
  }

  return out.join("\n");
}

function buildHeatHarness(data, userSrc) {
  const adjLit = buildLabelAdjLiteral(data);
  const body = instrumentHeatPython(userSrc);
  const indentedBody = body
    .split("\n")
    .map((l) => (l.length ? "    " + l : l))
    .join("\n");

  return `
import random
import json

_events = []
_state = {
    "node": None,
    "neighbours": [],
    "reached": False,
    "bag": None,
    "tracking": None,
    "iters": 0,
}
_MAX_ITERS = 80

class _TraceBag(set):
    """set() stand-in: .add(iterable) expands like .update (pedagogical code)."""
    def __init__(self, role, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _state[role] = self

    def add(self, item):
        if isinstance(item, (list, tuple, set, frozenset)):
            for x in item:
                super().add(x)
            return
        super().add(item)

def _snap(s):
    return sorted(s) if s is not None else []

def _probe(block_id):
    node = _state["node"]
    reached = bool(_state["reached"]) or (block_id == "check_goal" and node == "P")
    if reached:
        _state["reached"] = True
    _events.append({
        "blockId": block_id,
        "node": node,
        "neighbours": list(_state["neighbours"] or []),
        "bag": _snap(_state["bag"]),
        "tracking": _snap(_state["tracking"]),
        "reached": reached,
        "heat_reachable": reached,
    })

def _guard_iter():
    _state["iters"] += 1
    if _state["iters"] > _MAX_ITERS:
        raise RuntimeError("TOO_MANY_ITERS")

_GRAPH = ${adjLit}

def get_neighbours(node):
    # Only return rooms not yet tracked — matches the quiz rule that we
    # do not re-bag rooms we have already encountered.
    seen = _state["tracking"] or set()
    return [n for n in _GRAPH.get(node, []) if n not in seen]

heat_reachable = False
_error = None

try:
${indentedBody}
except RuntimeError as e:
    if str(e) == "TOO_MANY_ITERS":
        _error = "TOO_MANY_ITERS"
    else:
        raise
except Exception as e:
    _error = type(e).__name__ + ": " + str(e)

# Final snapshot so Play ends on a settled bag / tracking state.
_events.append({
    "blockId": None,
    "node": _state["node"],
    "neighbours": [],
    "bag": _snap(_state["bag"]),
    "tracking": _snap(_state["tracking"]),
    "reached": bool(_state.get("reached") or heat_reachable),
    "heat_reachable": bool(_state.get("reached") or heat_reachable),
    "done": True,
})

json.dumps({"events": _events, "result": bool(_state.get("reached") or heat_reachable), "error": _error})
`.trim();
}

/**
 * Turn raw Pyodide events (label-keyed) into viz frames (id-keyed) with
 * path edges and status messages.
 */
export function eventsToHeatFrames(data, events) {
  const frames = [];
  let pathEdges = [];
  let prevNodeId = null;
  const via = new Map();

  // Seed via-map from the full undirected edge list for path highlighting.
  data.edges.forEach((e) => {
    via.set(`${e.source}|${e.target}`, e.id);
    via.set(`${e.target}|${e.source}`, e.id);
  });

  for (const ev of events ?? []) {
    const nodeId = roomLabelToId(data, ev.node);
    const neighbourIds = (ev.neighbours ?? [])
      .map((n) => roomLabelToId(data, n))
      .filter(Boolean);
    const bagIds = (ev.bag ?? [])
      .map((n) => roomLabelToId(data, n) ?? n);
    const trackingIds = (ev.tracking ?? [])
      .map((n) => roomLabelToId(data, n) ?? n);

    if (nodeId && prevNodeId && nodeId !== prevNodeId) {
      const eid = via.get(`${prevNodeId}|${nodeId}`);
      if (eid && !pathEdges.includes(eid)) pathEdges = [...pathEdges, eid];
    }
    if (nodeId) prevNodeId = nodeId;

    const blockId = ev.blockId ?? null;
    const reached = !!(ev.reached || ev.heat_reachable);
    const done = !!ev.done;
    let message = "";
    if (blockId === "pick") {
      message = `Picked ${roomChipLabel(nodeId ?? ev.node)} from the bag.`;
    } else if (blockId === "check_goal") {
      message = reached
        ? `${roomChipLabel(nodeId ?? ev.node)} is the goal — heat_reachable = True.`
        : `${roomChipLabel(nodeId ?? ev.node)} is not the goal — keep going.`;
    } else if (blockId === "track_neighbours") {
      message = neighbourIds.length
        ? `Tracked neighbours: ${neighbourIds.map(roomChipLabel).join(", ")}.`
        : "No new neighbours to track.";
    } else if (blockId === "bag_neighbours") {
      message = "Added neighbours to the bag.";
    } else if (blockId === "remove_node") {
      message = `Removed ${roomChipLabel(nodeId ?? ev.node)} from the bag.`;
    } else if (done) {
      message = reached
        ? "Done — heat_reachable = True (path from Cafeteria to P)."
        : "Done — bag empty, heat_reachable stays False.";
    }

    frames.push({
      blockId,
      node: nodeId,
      neighbours: neighbourIds,
      bag: bagIds,
      bagPick: blockId === "pick" || blockId === "check_goal" || blockId === "track_neighbours" || blockId === "bag_neighbours"
        ? nodeId
        : null,
      bagPickDone: blockId === "remove_node" ? nodeId : null,
      tracking: trackingIds,
      pathEdges: [...pathEdges],
      reached,
      done,
      message,
    });
  }
  return frames;
}

/**
 * Manual play/step/reset viz for the heat-code exercise. Runs the student's
 * assembled Python (via `getPython`) through Pyodide, then steps through the
 * resulting events — highlighting the matching code block each time.
 *
 * @param {HTMLElement} container
 * @param {{
 *   getPython: () => string,
 *   width?: number, height?: number, stepDelayMs?: number,
 *   data?: {nodes: Array, edges: Array},
 *   onStep?: (frame: object|null) => void,
 * }} options
 */
export function mountHeatCodeViz(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 420;
  const height = options.height ?? 280;
  const stepDelayMs = options.stepDelayMs ?? 900;
  const onStep = options.onStep ?? (() => {});
  const getPython = options.getPython ?? (() => "");

  const data = options.data ?? createStationGraphData({ width, height });
  const startId = findCafeteriaId(data.nodes);

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("iv-root");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Traversal";
  container.appendChild(heading);

  const graphMount = document.createElement("div");
  graphMount.className = "ht-code-graph";
  container.appendChild(graphMount);

  const panels = document.createElement("div");
  panels.className = "ht-anim-panels";
  container.appendChild(panels);

  const status = document.createElement("div");
  status.className = "ht-play-status";
  container.appendChild(status);

  const controls = document.createElement("div");
  controls.className = "ht-quiz-controls";
  container.appendChild(controls);

  let frames = [];
  let frameIndex = -1; // -1 = idle (init state, no highlight)
  let playing = false;
  let playTimer = null;
  let compiling = false;
  let statusOverride = null;

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

  function idleState() {
    return {
      blockId: null,
      node: null,
      neighbours: [],
      bag: startId ? [startId] : [],
      bagPick: null,
      bagPickDone: null,
      tracking: startId ? [startId] : [],
      pathEdges: [],
      reached: false,
      done: false,
      message: "Assemble the loop body, then press Play or Step to run your code.",
    };
  }

  function render() {
    const frame = currentFrame() ?? idleState();

    mountStationGraphView(graphMount, data, {
      width,
      height,
      highlight: {
        current: frame.node,
        neighbours: frame.neighbours ?? [],
        pathEdges: frame.pathEdges ?? [],
      },
    });

    panels.innerHTML =
      renderBagPanel({
        items: frame.bag ?? [],
        pick: frame.bagPick ?? null,
        pickDone: frame.bagPickDone ?? null,
      }) +
      renderTrackingPanel({
        items: frame.tracking ?? [],
      });

    if (statusOverride) {
      status.textContent = statusOverride;
      status.classList.toggle("ht-play-status-warn", true);
    } else {
      status.textContent = frame.message;
      status.classList.toggle("ht-play-status-warn", false);
    }

    onStep(currentFrame());
    renderControls();
  }

  async function compileFrames() {
    const userSrc = (getPython() || "").trim();
    if (!userSrc) {
      statusOverride = "Your plan is empty — drag the steps into the loop first.";
      frames = [];
      frameIndex = -1;
      return false;
    }

    // Heuristic: empty loop body is just `while bag:\n    pass`
    if (/while\s+bag\s*:\s*\n\s*pass\s*$/.test(userSrc) || /while\s+bag\s*:\s*$/.test(userSrc)) {
      statusOverride = "The loop body is empty — drop the 5 steps inside `while bag:`.";
      frames = [];
      frameIndex = -1;
      return false;
    }

    compiling = true;
    statusOverride = null;
    status.textContent = "Loading Python runtime…";
    status.classList.remove("ht-play-status-warn");
    renderControls();

    try {
      const pyodide = await getHeatPyodide();
      status.textContent = "Running your code…";
      const harness = buildHeatHarness(data, userSrc);
      const rawJson = await pyodide.runPythonAsync(harness);
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));

      if (payload?.error === "TOO_MANY_ITERS") {
        statusOverride =
          "Loop ran too long — did you forget to remove the current node from the bag?";
        frames = eventsToHeatFrames(data, payload.events ?? []);
        frameIndex = frames.length ? 0 : -1;
        return frames.length > 0;
      }
      if (payload?.error) {
        statusOverride = "Error running code: " + payload.error;
        frames = [];
        frameIndex = -1;
        return false;
      }

      frames = eventsToHeatFrames(data, payload.events ?? []);
      frameIndex = -1;
      statusOverride = null;
      return frames.length > 0;
    } catch (err) {
      console.error(err);
      statusOverride = "Error running code: " + String(err);
      frames = [];
      frameIndex = -1;
      return false;
    } finally {
      compiling = false;
    }
  }

  async function ensureFrames({ restart = false } = {}) {
    if (compiling) return false;
    if (restart || !frames.length) {
      stopPlayback();
      return compileFrames();
    }
    return true;
  }

  async function stepForward() {
    const atEnd = frames.length > 0 && frameIndex >= frames.length - 1;
    const ok = await ensureFrames({ restart: atEnd });
    if (!ok && !frames.length) {
      render();
      return;
    }
    if (frameIndex < frames.length - 1) {
      frameIndex += 1;
    } else {
      stopPlayback();
    }
    render();
  }

  async function play() {
    // Always re-run the student's current plan so block edits are reflected.
    const ok = await ensureFrames({ restart: true });
    if (!ok || !frames.length) {
      render();
      return;
    }
    frameIndex = 0;
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
    frames = [];
    frameIndex = -1;
    statusOverride = null;
    render();
  }

  function renderControls() {
    controls.innerHTML = "";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "ht-nav-btn";
    playBtn.textContent = compiling ? "Loading…" : playing ? "Pause" : "Play";
    playBtn.disabled = compiling;
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
    stepBtn.textContent = "Step →";
    stepBtn.disabled = compiling;
    stepBtn.onclick = () => {
      stopPlayback();
      stepForward();
    };

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ht-nav-btn ht-nav-btn-ghost";
    resetBtn.textContent = "Reset";
    resetBtn.onclick = () => reset();

    controls.append(playBtn, stepBtn, resetBtn);
  }

  render();
  getHeatPyodide().catch(() => {});

  return {
    play,
    step: stepForward,
    reset,
    destroy: () => stopPlayback(),
  };
}

function nextAutoRoomId(nodes) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let n = 0;
  while (n < 200) {
    const cycle = Math.floor(n / letters.length) + 1;
    const letter = letters[n % letters.length];
    const id = cycle === 1 ? letter : `${letter}${cycle}`;
    if (!nodes.some((node) => node.id === id)) return id;
    n += 1;
  }
  return `R${Date.now()}`;
}

function promptLabel(title, defaultValue = "") {
  const value = window.prompt(title, defaultValue);
  return value == null ? null : value.trim();
}

/**
 * Independent station map editor + animated heat reachability.
 * Does not use GraphEngine / graph-view — owns its own graph state.
 *
 * @param {HTMLElement} container
 * @param {{width?: number, height?: number, initialData?: object, stepDelayMs?: number}} options
 */
export function mountHeatPlayground(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 520;
  const height = options.height ?? 320;
  const stepDelayMs = options.stepDelayMs ?? 900;

  let data = cloneStationData(
    options.initialData ?? createStationGraphData({ width, height })
  );
  let mode = "select"; // select | add-node | add-edge | delete
  let selectedId = null;
  let edgeSource = null;
  let frames = [];
  let frameIndex = 0;
  let playing = false;
  let playTimer = null;
  let statusMsg = "";
  let drag = null; // { id, ox, oy }

  container.innerHTML = "";
  container.classList.add("ht-anim", "ht-play");

  const toolbar = document.createElement("div");
  toolbar.className = "ht-play-toolbar";

  const graphHost = document.createElement("div");
  graphHost.className = "ht-anim-graph";

  const panels = document.createElement("div");
  panels.className = "ht-anim-panels";

  const status = document.createElement("div");
  status.className = "ht-play-status";

  const controls = document.createElement("div");
  controls.className = "ht-quiz-controls";

  container.append(toolbar, graphHost, panels, status, controls);

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
    return frames[frameIndex] ?? null;
  }

  function playHighlight(frame) {
    if (!frame) return {};
    return {
      current: frame.current,
      next: frame.bagPick,
      neighbours: frame.bagPick ? [] : frame.neighbours ?? [],
      pathEdges: frame.pathEdges ?? [],
    };
  }

  function validateEndpoints() {
    const startId = findCafeteriaId(data.nodes);
    const goalId = findRoomPId(data.nodes);
    if (!startId || !goalId) {
      const missing = [];
      if (!startId) missing.push("Cafeteria");
      if (!goalId) missing.push("room P");
      statusMsg = `Add ${missing.join(" and ")} before starting the heat traversal.`;
      return null;
    }
    statusMsg = "";
    return { startId, goalId };
  }

  function startTraversal() {
    const ends = validateEndpoints();
    if (!ends) {
      frames = [];
      frameIndex = 0;
      stopPlayback();
      render();
      return;
    }
    frames = buildReachabilityFrames(data, ends.startId, ends.goalId);
    frameIndex = 0;
    stopPlayback();
    render();
  }

  function stepForward() {
    if (!frames.length) {
      startTraversal();
      if (!frames.length) return;
    }
    if (frameIndex < frames.length - 1) {
      frameIndex += 1;
      render();
    } else {
      stopPlayback();
      render();
    }
  }

  function play() {
    const ends = validateEndpoints();
    if (!ends) {
      frames = [];
      frameIndex = 0;
      render();
      return;
    }
    if (!frames.length || frameIndex >= frames.length - 1) {
      frames = buildReachabilityFrames(data, ends.startId, ends.goalId);
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

  function resetTraversal() {
    stopPlayback();
    frames = [];
    frameIndex = 0;
    statusMsg = "";
    render();
  }

  function invalidateTraversal() {
    stopPlayback();
    frames = [];
    frameIndex = 0;
  }

  function mkTool(label, modeName) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ht-nav-btn";
    btn.textContent = label;
    btn.onclick = () => {
      mode = mode === modeName ? "select" : modeName;
      edgeSource = null;
      render();
    };
    return btn;
  }

  function renderToolbar() {
    toolbar.innerHTML = "";
    const tools = [
      mkTool("Add room", "add-node"),
      mkTool("Connect", "add-edge"),
      mkTool("Delete", "delete"),
    ];
    tools.forEach((b) => {
      if (
        (b.textContent === "Add room" && mode === "add-node") ||
        (b.textContent === "Connect" && mode === "add-edge") ||
        (b.textContent === "Delete" && mode === "delete")
      ) {
        b.classList.add("ht-nav-btn-active");
      }
    });

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "ht-nav-btn";
    renameBtn.textContent = "Rename";
    renameBtn.onclick = () => {
      if (!selectedId) {
        statusMsg = "Select a room first, then Rename.";
        render();
        return;
      }
      const node = data.nodes.find((n) => n.id === selectedId);
      const label = promptLabel("Room name", node?.label ?? "");
      if (label == null || !label) return;
      node.label = label;
      invalidateTraversal();
      render();
    };

    toolbar.append(...tools, renameBtn);

    const hint = document.createElement("span");
    hint.className = "ht-play-hint";
    hint.textContent =
      mode === "add-node"
        ? "Click the map to place a room"
        : mode === "add-edge"
          ? edgeSource
            ? "Click the other room to connect"
            : "Click the first room, then the second"
          : mode === "delete"
            ? "Click a room or vent to delete"
            : "Drag rooms · click to select";
    toolbar.appendChild(hint);
  }

  function svgPoint(evt) {
    const svg = graphHost.querySelector("svg");
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function paintGraph() {
    mountStationGraphView(graphHost, data, {
      width,
      height,
      highlight: playHighlight(currentFrame()),
      selectedId,
      edgeSource,
    });
  }

  // Single delegated listener set — survives SVG redraws inside graphHost.
  graphHost.addEventListener("click", (evt) => {
    if (drag?.moved) {
      drag = null;
      return;
    }
    const nodeEl = evt.target.closest(".ht-node");
    const edgeEl = evt.target.closest(".ht-edge");

    if (mode === "add-node" && !nodeEl) {
      const { x, y } = svgPoint(evt);
      const id = nextAutoRoomId(data.nodes);
      const label = promptLabel("Room name (e.g. Cafeteria or P)", id);
      if (label == null) return;
      data.nodes.push({ id, label: label || id, x, y });
      selectedId = id;
      invalidateTraversal();
      render();
      return;
    }

    if (mode === "delete") {
      if (nodeEl) {
        const id = nodeEl.getAttribute("data-id");
        data.nodes = data.nodes.filter((n) => n.id !== id);
        data.edges = data.edges.filter((e) => e.source !== id && e.target !== id);
        if (selectedId === id) selectedId = null;
        invalidateTraversal();
        render();
        return;
      }
      if (edgeEl) {
        const id = edgeEl.getAttribute("data-id");
        data.edges = data.edges.filter((e) => e.id !== id);
        invalidateTraversal();
        render();
        return;
      }
    }

    if (mode === "add-edge" && nodeEl) {
      const id = nodeEl.getAttribute("data-id");
      if (!edgeSource) {
        edgeSource = id;
        selectedId = id;
        render();
        return;
      }
      if (edgeSource !== id) {
        const exists = data.edges.some(
          (e) =>
            (e.source === edgeSource && e.target === id) ||
            (e.source === id && e.target === edgeSource)
        );
        if (!exists) {
          data.edges.push({
            id: edgeIdBetween(edgeSource, id),
            source: edgeSource,
            target: id,
          });
          invalidateTraversal();
        }
      }
      edgeSource = null;
      render();
      return;
    }

    if (mode === "select") {
      if (nodeEl) {
        selectedId = nodeEl.getAttribute("data-id");
        render();
      } else if (!edgeEl) {
        selectedId = null;
        edgeSource = null;
        render();
      }
    }
  });

  graphHost.addEventListener("pointerdown", (evt) => {
    if (mode !== "select") return;
    const nodeEl = evt.target.closest(".ht-node");
    if (!nodeEl) return;
    const id = nodeEl.getAttribute("data-id");
    const node = data.nodes.find((n) => n.id === id);
    if (!node) return;
    const { x, y } = svgPoint(evt);
    drag = { id, ox: x - node.x, oy: y - node.y, moved: false };
    selectedId = id;
    graphHost.setPointerCapture?.(evt.pointerId);
    evt.preventDefault();
  });

  graphHost.addEventListener("pointermove", (evt) => {
    if (!drag) return;
    const node = data.nodes.find((n) => n.id === drag.id);
    if (!node) return;
    const { x, y } = svgPoint(evt);
    const nx = Math.max(24, Math.min(width - 24, x - drag.ox));
    const ny = Math.max(24, Math.min(height - 24, y - drag.oy));
    if (Math.hypot(nx - node.x, ny - node.y) > 2) drag.moved = true;
    node.x = nx;
    node.y = ny;
    paintGraph();
  });

  graphHost.addEventListener("pointerup", () => {
    if (drag?.moved) invalidateTraversal();
    drag = null;
  });

  function renderPanels() {
    const frame = currentFrame();
    panels.innerHTML =
      renderBagPanel({
        items: frame?.bag ?? [],
        pick: frame?.bagPick ?? null,
        pickDone: frame?.bagPickDone ?? null,
        title: "TO BE EXPLORED",
      }) +
      renderTrackingPanel({
        items: frame?.tracking ?? [],
        title: "TRACK - HEAT REACHABLE",
      });
  }

  function renderStatus() {
    const ends = {
      start: findCafeteriaId(data.nodes),
      goal: findRoomPId(data.nodes),
    };
    let msg = statusMsg;
    if (!msg && (!ends.start || !ends.goal)) {
      const missing = [];
      if (!ends.start) missing.push("Cafeteria");
      if (!ends.goal) missing.push("room P");
      msg = `Need ${missing.join(" and ")} on the map before heat can spread.`;
    } else if (!msg && frames.length && frameIndex === frames.length - 1) {
      const last = frames[frames.length - 1];
      msg = last.reached
        ? "Heat reached room P — there is a path from the Cafeteria."
        : "Bag empty — heat never reached room P from the Cafeteria.";
    } else if (!msg && frames.length) {
      msg = `Traversal step ${frameIndex + 1} / ${frames.length}`;
    } else if (!msg) {
      msg = "Edit the map, then press Play or Step to spread heat.";
    }
    status.textContent = msg;
    status.classList.toggle("ht-play-status-warn", !ends.start || !ends.goal);
  }

  function renderControls() {
    controls.innerHTML = "";

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
    stepBtn.textContent = "Step →";
    stepBtn.onclick = () => {
      stopPlayback();
      stepForward();
    };

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "ht-nav-btn ht-nav-btn-ghost";
    resetBtn.textContent = "Reset";
    resetBtn.onclick = () => resetTraversal();

    controls.append(playBtn, stepBtn, resetBtn);
  }

  function render() {
    renderToolbar();
    paintGraph();
    renderPanels();
    renderStatus();
    renderControls();
  }

  render();

  return {
    getData: () => cloneStationData(data),
    setData: (next) => {
      data = cloneStationData(next);
      invalidateTraversal();
      render();
    },
    destroy: () => stopPlayback(),
  };
}

/** @deprecated use mountHeatPlayground */
export function mountHeatTraversalAnimation(container, _engine, options = {}) {
  return mountHeatPlayground(container, options);
}

/** @deprecated frames are generated live from the editable graph */
export function createHeatTraversalSteps() {
  return [];
}