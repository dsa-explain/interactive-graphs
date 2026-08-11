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
    // TRAVERSAL_LAYOUT (DFS/BFS station map)
    CAF: "Cafeteria",
    MED: "MedBay",
    ELEC: "Electrical",
    STO: "Storage",
    TA: "A",
    TB: "B",
    TG: "G",
    TD: "D",
    TH: "H",
    TF: "F",
    ADMIN: "Admin",
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
 * One shared question shape feeds BOTH quiz styles. `mountTraversalQuiz`
 * (below) looks at `options` to decide how to render:
 *   - `options` present (2-3 {id,label,correct,feedback} entries)  → MCQ
 *     mode: the learner clicks a room instead of a "Reveal" button.
 *   - `options` omitted                                            → plain
 *     reveal-answer mode: a single "Reveal answer" button shows
 *     `answer.text`.
 * You can freely mix the two styles within the same `questions` array —
 * each question is checked independently.
 *
 * Question shape:
 *   {
 *     prompt: string
 *     note?: string             // optional footnote, shown once answered/solved
 *     options?: [{id, label, correct, feedback}]   // omit for reveal-answer mode
 *     question: Panel           // graph/bag/tracking state shown before answering
 *     answer: Panel & { text?: string } // state shown after; `text` is the
 *                                       // reveal-mode answer copy (ignored in MCQ mode,
 *                                       // where each option's own `feedback` is used instead)
 *   }
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
 *   }
 */
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
  const title = opts.title ?? "ENCOUNTERED, NOTED TO BE EXPLORED";
  const emptyText = opts.emptyText ?? "bay empty — awaiting rooms…";
  const footer = opts.footer ?? "unordered";

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
      <div class="ht-bag-footer">${escapeHtml(footer)}</div>
    </div>
  `;
}

/**
 * Render a separate reachable/visited tracking strip.
 * @param {{items?: string[], title?: string, emptyText?: string}} opts
 */
export function renderTrackingPanel(opts = {}) {
  const items = opts.items ?? [];
  const title = opts.title ?? "EXPLORED ROOMS";
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
  const goalId = options.goalId != null ? String(options.goalId) : null;
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
      "ht-edge"
    );
    path.setAttribute("data-id", id);
    edgeLayer.appendChild(path);
  });

  byId.forEach((n) => {
    const classes = ["ht-node"];
    const isCurrent = highlight.current != null && String(highlight.current) === n.id;
    if (isCurrent) classes.push("ht-node-current");
    else if (blink.has(n.id)) classes.push("ht-node-blink");
    if (selectedId === n.id || edgeSource === n.id) classes.push("ht-node-selected");
    if (goalId && n.id === goalId) classes.push("ht-node-goal");

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
 * Interactive Q&A that supports two question styles side by side, chosen
 * per-question by whether `options` is present (see the question-shape
 * doc comment above):
 *   - Reveal mode:  a "Reveal answer" button shows the answer text.
 *   - MCQ mode:     2-3 room buttons; wrong picks get inline feedback and
 *                   stay clickable, the correct pick locks the question in.
 * Either way, the graph/bag/tracking side panels update between the
 * question's "before" and "after" state, and `goalId` (if given) marks the
 * goal room on the graph.
 *
 * @param {HTMLElement} container
 * @param {{width?: number, height?: number, questions?: typeof DFS_QUIZ_QUESTIONS, goalId?: string}} options
 */
export function mountTraversalQuiz(container, options = {}) {
  if (!container) return null;

  const width = options.width ?? 400;
  const height = options.height ?? 260;
  const questions = options.questions ?? DFS_QUIZ_QUESTIONS;
  const goalId = options.goalId ?? TRAVERSAL_GOAL_ID;
  const fullData = createStationGraphData({ width, height });

  let qIndex = 0;
  let revealed = false; // reveal-mode: has the answer been shown
  let solved = questions.map(() => false); // mcq-mode: has the correct room been picked
  let wrongPicks = new Set();

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

  function isMCQ(q) {
    return Array.isArray(q.options) && q.options.length > 0;
  }

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
    const mcq = isMCQ(q);
    const shown = mcq ? solved[qIndex] : revealed;
    const resolved = resolvePanel(shown ? q.answer : q.question);

    mountStationGraphView(graphMount, resolved.graph, {
      width,
      height,
      highlight: resolved.highlight,
      goalId,
    });

    sidePanels.innerHTML =
      renderTrackingPanel({ items: resolved.tracking }) + renderBagPanel({
        items: resolved.bag,
        pick: resolved.bagPick,
        pickDone: resolved.bagPickDone,
      });

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
        feedbackHtml = `<div class="ht-mcq-feedback-hidden">Pick a room to see if you're right.</div>`;
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
      <div class="ht-quiz-meta">Question ${qIndex + 1} of ${questions.length}${mcq && isLast && goalId ? " — reach the goal!" : ""}</div>
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
            ? "Solved! 🎉"
            : "Solve to finish"
          : "Next question →"
        : !revealed
          ? "Reveal answer →"
          : qIndex < questions.length - 1
            ? "Next question →"
            : "Done",
      indicator: mcq ? (shown ? "Solved" : "Pick a room") : revealed ? "Answer shown" : "Think first",
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

// Back-compat aliases: both old entry points now point at the single
// unified mount function above, which auto-detects the style per question.
export const mountHeatQuiz = mountTraversalQuiz;

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
    // Stack / queue exercises use list() instead of set().
    if (/^\s*bag\s*=\s*list\(\)\s*$/.test(trimmed)) {
      out.push(`${indent}bag = _TraceList("bag")`);
      continue;
    }
    if (/^\s*tracking\s*=\s*list\(\)\s*$/.test(trimmed)) {
      out.push(`${indent}tracking = _TraceList("tracking")`);
      continue;
    }

    // Guard infinite loops when the student forgets to remove from the bag.
    if (/^\s*while\s+bag\s*:\s*$/.test(trimmed)) {
      out.push(trimmed);
      out.push(`${indent}    _guard_iter()`);
      continue;
    }

    // Check-goal fires *before* the if so the block highlights even when
    // the condition is false. Accept heat-story "P" or traversal-story "Admin".
    if (
      /^\s*if\s+node\s*==\s*(["'])P\1\s*:\s*$/.test(trimmed) ||
      /^\s*if\s+node\s*==\s*(["'])Admin\1\s*:\s*$/.test(trimmed)
    ) {
      out.push(`${indent}_probe("check_goal")`);
      out.push(trimmed);
      continue;
    }

    out.push(trimmed);

    if (/^\s*node\s*=\s*random\.choice\s*\(\s*list\s*\(\s*bag\s*\)\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_state["node"] = node`);
      out.push(`${indent}_probe("pick")`);
    }

    // Stack/queue: pop() picks and removes in one step.
    if (/^\s*node\s*=\s*bag\.pop\s*\(\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_state["node"] = node`);
      out.push(`${indent}_probe("pick")`);
    }
    // Queue variant: pop(0) removes from the front.
    if (/^\s*node\s*=\s*bag\.pop\s*\(\s*0\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_state["node"] = node`);
      out.push(`${indent}_probe("pick")`);
    }

    if (/^\s*neighbours\s*=\s*get_neighbours\s*\(\s*node\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_state["neighbours"] = list(neighbours)`);
    }

    // Prefer the pedagogical `tracking.add(neighbours)` line; also accept update()
    // and list concatenation (`tracking += neighbours`).
    if (
      /^\s*tracking\.add\s*\(\s*neighbours\s*\)\s*$/.test(trimmed) ||
      /^\s*tracking\.update\s*\(\s*neighbours\s*\)\s*$/.test(trimmed) ||
      /^\s*tracking\s*\+=\s*neighbours\s*$/.test(trimmed)
    ) {
      out.push(`${indent}_probe("track_neighbours")`);
    }

    if (
      /^\s*bag\.add\s*\(\s*neighbours\s*\)\s*$/.test(trimmed) ||
      /^\s*bag\.update\s*\(\s*neighbours\s*\)\s*$/.test(trimmed) ||
      /^\s*bag\s*\+=\s*neighbours\s*$/.test(trimmed)
    ) {
      out.push(`${indent}_probe("bag_neighbours")`);
    }

    if (/^\s*bag\.remove\s*\(\s*node\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_probe("remove_node")`);
    }

    if (
      /^\s*heat_reachable\s*=\s*True\s*$/.test(trimmed) ||
      /^\s*goal_reached\s*=\s*True\s*$/.test(trimmed)
    ) {
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
_GOAL_LABELS = ("P", "Admin")

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

class _TraceList(list):
    """list() stand-in so bag/tracking stay visible to the probe harness."""
    def __init__(self, role, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _state[role] = self

def _snap(s):
    if s is None:
        return []
    # Preserve stack/queue order for lists; sets stay sorted for stability.
    if isinstance(s, list):
        return list(s)
    return sorted(s)

def _probe(block_id):
    node = _state["node"]
    reached = bool(_state["reached"]) or (
        block_id == "check_goal" and node in _GOAL_LABELS
    )
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
    seen = _state["tracking"] or []
    return [n for n in _GRAPH.get(node, []) if n not in seen]

heat_reachable = False
goal_reached = False
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

_done_reached = bool(_state.get("reached") or heat_reachable or goal_reached)

# Final snapshot so Play ends on a settled bag / tracking state.
_events.append({
    "blockId": None,
    "node": _state["node"],
    "neighbours": [],
    "bag": _snap(_state["bag"]),
    "tracking": _snap(_state["tracking"]),
    "reached": _done_reached,
    "heat_reachable": _done_reached,
    "done": True,
})

json.dumps({"events": _events, "result": _done_reached, "error": _error})
`.trim();
}

/**
 * Keep bag chip order stable when a room is removed: leave a ghost chip in
 * its previous slot, and only append rooms that are brand-new to the bag.
 */
function bagDisplayWithGhost(prevBag, bagIds, ghostId) {
  const bagSet = new Set(bagIds);
  const seen = new Set();
  const out = [];
  for (const id of prevBag) {
    if (seen.has(id)) continue;
    if (id === ghostId || bagSet.has(id)) {
      out.push(id);
      seen.add(id);
    }
  }
  for (const id of bagIds) {
    if (seen.has(id)) continue;
    out.push(id);
    seen.add(id);
  }
  if (ghostId != null && !seen.has(ghostId)) out.push(ghostId);
  return out;
}

/**
 * Turn raw Pyodide events (label-keyed) into viz frames (id-keyed) with
 * path edges and status messages.
 */
export function eventsToHeatFrames(data, events) {
  const frames = [];
  let pathEdges = [];
  let prevNodeId = null;
  let prevBag = [];
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
        ? `${roomChipLabel(nodeId ?? ev.node)} is the goal — stop.`
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
        ? "Done — goal reached from Cafeteria."
        : "Done — bag empty, goal not reached.";
    }

    // Graph blink rules per step (only these nodes pulse):
    //   pick / check_goal / remove_node → current node only
    //   track_neighbours / bag_neighbours → current node + neighbours
    const showNeighbours =
      blockId === "track_neighbours" || blockId === "bag_neighbours";

    // pop()/remove already dropped the chip from `bag`. Keep it in its old
    // slot as pick-done so other chips don't slide (or jump to the end).
    const missingCurrent = nodeId != null && !bagIds.includes(nodeId);
    const showGhost =
      missingCurrent &&
      (blockId === "pick" ||
        blockId === "remove_node" ||
        blockId === "check_goal" ||
        blockId === "track_neighbours" ||
        blockId === "bag_neighbours");

    const displayBag = showGhost
      ? bagDisplayWithGhost(prevBag, bagIds, nodeId)
      : bagIds;

    frames.push({
      blockId,
      node: nodeId,
      neighbours: showNeighbours ? neighbourIds : [],
      bag: displayBag,
      bagPick:
        !showGhost &&
        (blockId === "pick" ||
          blockId === "check_goal" ||
          blockId === "track_neighbours" ||
          blockId === "bag_neighbours")
          ? nodeId
          : null,
      bagPickDone: showGhost ? nodeId : null,
      tracking: trackingIds,
      pathEdges: [...pathEdges],
      reached,
      done,
      message,
    });

    // Keep the ghost in place through the current loop body, then drop it
    // so the next pick doesn't slide later chips left into its slot.
    prevBag =
      blockId === "bag_neighbours" || blockId === "remove_node" || done
        ? bagIds
        : displayBag;
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
 *   bagFooter?: string,
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
  const bagFooter = options.bagFooter ?? "unordered";

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

    // Blink only what this step cares about (see eventsToHeatFrames).
    // Done / idle frames clear focus so nothing keeps pulsing.
    const highlight =
      frame.blockId == null
        ? { pathEdges: frame.pathEdges ?? [] }
        : {
            current: frame.node,
            neighbours: frame.neighbours ?? [],
            pathEdges: frame.pathEdges ?? [],
          };

    mountStationGraphView(graphMount, data, {
      width,
      height,
      highlight,
    });

    panels.innerHTML =
      renderBagPanel({
        items: frame.bag ?? [],
        pick: frame.bagPick ?? null,
        pickDone: frame.bagPickDone ?? null,
        footer: bagFooter,
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
      statusOverride = "The loop body is empty — drop the steps inside `while bag:`.";
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

// ---------------------------------------------------------------------------
// DFS / BFS quiz map + question sets
// ---------------------------------------------------------------------------
// The challenge: starting from the Cafeteria, reach the Admin room — the
// goal room, tucked at the far end of Storage's branch. A few extra rooms
// (G, off of A; H, off of D) give both DFS and BFS a proper third level, so
// there's a real multi-step backtrack (DFS) / multi-level queue (BFS)
// before either algorithm reaches the goal.
//
//        MedBay ── A ── G
//       /
// Cafeteria ── Electrical ── D ── H
//       \
//        Storage ── F ── Admin (GOAL)
//
// Same map, same "assume MedBay first" tie-break, is reused across all
// four quiz exports below (DFS_QUIZ_QUESTIONS / BFS_QUIZ_QUESTIONS in the
// reveal-answer style, and DFS_MCQ_QUESTIONS / BFS_MCQ_QUESTIONS in the
// click-a-button style) so the two styles can be swapped in without
// changing the story.

const TRAVERSAL_LAYOUT = {
  nodes: [
    { id: "CAF", label: "Cafeteria", x: 40, y: 140 },
    { id: "MED", label: "MedBay", x: 180, y: 40 },
    { id: "ELEC", label: "Electrical", x: 180, y: 140 },
    { id: "STO", label: "Storage", x: 180, y: 240 },
    { id: "TA", label: "A", x: 320, y: 10 },
    { id: "TB", label: "B", x: 320, y: 70 },
    { id: "TG", label: "G", x: 460, y: 10 },
    { id: "TD", label: "D", x: 320, y: 140 },
    { id: "TH", label: "H", x: 460, y: 140 },
    { id: "TF", label: "F", x: 320, y: 210 },
    { id: "ADMIN", label: "Admin", x: 460, y: 240 },
  ],
  edges: [
    { id: "CAF—MED", source: "CAF", target: "MED" },
    { id: "CAF—ELEC", source: "CAF", target: "ELEC" },
    { id: "CAF—STO", source: "CAF", target: "STO" },
    { id: "MED—TA", source: "MED", target: "TA" },
    { id: "MED—TB", source: "MED", target: "TB" },
    { id: "TA—TG", source: "TA", target: "TG" },
    { id: "ELEC—TD", source: "ELEC", target: "TD" },
    { id: "TD—TH", source: "TD", target: "TH" },
    { id: "STO—TF", source: "STO", target: "TF" },
    { id: "TF—ADMIN", source: "TF", target: "ADMIN" },
  ],
};

/** Full DFS/BFS station map (edit-friendly, same shape as `createStationGraphData`). */
export function createTraversalGraphData(opts = {}) {
  return scaleStationGraph(TRAVERSAL_LAYOUT, opts.width ?? 400, opts.height ?? 260);
}

const TRAV_W = 400;
const TRAV_H = 260;
const TRAVERSAL_FULL = createTraversalGraphData({ width: TRAV_W, height: TRAV_H });
const TRAVERSAL_GOAL_ID = "ADMIN";

/**
 * Pull a labelled sub-view of the traversal map: only `visibleIds` are kept
 * (everything else isn't drawn at all yet — a room appears once a room
 * next to it has been visited and we "look through its doors").
 */
function travView(visibleIds) {
  const visible = new Set(visibleIds);
  const nodes = TRAVERSAL_FULL.nodes.filter((n) => visible.has(n.id));
  const edges = TRAVERSAL_FULL.edges.filter(
    (e) => visible.has(e.source) && visible.has(e.target)
  );
  return { nodes, edges };
}

/**
 * One step = one question, built into the single unified question shape
 * that `mountTraversalQuiz` consumes (see the doc comment near the top of
 * the file). `options` lists the 2-3 rooms offered as choices; exactly one
 * has `correct: true`. `feedback` is shown for whichever option gets picked
 * (right or wrong) in MCQ mode, and the correct option's `feedback` doubles
 * as the reveal-mode answer text. `note` is an extra teaching aside shown
 * once the question is answered/solved either way.
 *
 * Omit `options` for a plain reveal-answer step instead of MCQ — in that
 * case provide `neighbours` (ids to highlight as candidates before
 * answering), `answerId` (id to highlight after), and `answerText` (the
 * reveal copy) directly on the step.
 */
export function buildQuizQuestions(steps) {
  return steps.map((s) => {
    const correct = s.options?.find((o) => o.correct);
    return {
      prompt: s.prompt,
      note: s.note,
      options: s.options,
      question: {
        graph: travView(s.visible),
        highlight: {
          current: s.current,
          neighbours: s.options ? s.options.map((o) => o.id) : s.neighbours,
          pathEdges: s.pathEdgesBefore,
        },
        bag: s.bagBefore,
        tracking: s.trackingBefore,
      },
      answer: {
        graph: travView(s.visibleAfter ?? s.visible),
        highlight: { current: correct ? correct.id : s.answerId, pathEdges: s.pathEdgesAfter },
        bag: s.bagAfter,
        tracking: s.trackingAfter,
        text: correct ? correct.feedback : s.answerText,
      },
    };
  });
}
