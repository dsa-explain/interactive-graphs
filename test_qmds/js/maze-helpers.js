// maze-helpers.js
// Height-map maze widget shared by directed-traversal.qmd:
//   - mountMazeGrid       renders the board itself (coloured cells with
//     start/target markers). Used standalone for illustration, and
//     internally by the two exercise views below.
//   - mountNeighboursMazeView   Q1 "get_neighbours" exercise: click a cell,
//     run the student's assembled Python (via code-blocks-view.js) against
//     it, highlight the returned neighbours, and list them underneath.
//   - mountBfsMazeView          Q2 BFS exercise: run the student's assembled
//     BFS loop, then play/step through the discovered cells one distance
//     layer at a time, finishing with the shortest path lit up in green.
//
// 0/1 coin maze (Man-Pac) used by traversal-undirected-practice.qmd:
//   - mountNotebookMazeGrid     cream notebook-style board (1 = floor, 0 = wall).
//   - mountManpacNeighboursView click a coin cell, run get_neighbours, highlight.
//   - mountManpacTraversalView  BFS/DFS play-step viz: pop from bag, track, bag.
// Both exercise views execute real, student-assembled Python through
// Pyodide (same approach as islands-viz-view.js / graph-traversal-helpers.js)
// so what's on screen reflects what the code actually does.

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/";
const PYODIDE_MODULE = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.mjs";

let _pyodidePromise = null;

function getPyodide() {
  if (!_pyodidePromise) {
    _pyodidePromise = (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_MODULE);
      return loadPyodide({ indexURL: PYODIDE_INDEX });
    })();
  }
  return _pyodidePromise;
}

// ---------------------------------------------------------------------------
// Reference algorithm + shared cell-state vocabulary
// ---------------------------------------------------------------------------

export const CELL_STATE = Object.freeze({
  DEFAULT: "default",
  START: "start",
  TARGET: "target",
  OBSTACLE: "obstacle",
  CURRENT: "current",
  NEIGHBOUR: "neighbour",
  FRONTIER: "frontier",
  VISITED: "visited",
  PATH: "path",
});

// Rendering priority when a cell could match more than one state at once
// (e.g. the target cell is also part of the final path).
const STATE_PRIORITY = [
  CELL_STATE.OBSTACLE,
  CELL_STATE.PATH,
  CELL_STATE.CURRENT,
  CELL_STATE.FRONTIER,
  CELL_STATE.NEIGHBOUR,
  CELL_STATE.VISITED,
  CELL_STATE.TARGET,
  CELL_STATE.START,
  CELL_STATE.DEFAULT,
];

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Reference implementation: legal moves from (row, col) on a height-map
 * maze. A move is legal if the destination is in bounds, is not an
 * obstacle (-1), and is at the same height or lower than the current cell.
 * @param {{matrix: number[][], rows: number, cols: number}} maze
 * @param {number} row
 * @param {number} col
 * @returns {number[][]} array of [row, col] pairs
 */
export function getNeighbours(maze, row, col) {
  const { matrix, rows, cols } = maze;
  const neighbours = [];
  for (const [dr, dc] of DIRECTIONS) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    if (matrix[nr][nc] === -1) continue;
    if (matrix[nr][nc] > matrix[row][col]) continue;
    neighbours.push([nr, nc]);
  }
  return neighbours;
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function resolveCellState(matrix, start, target, overrides, r, c) {
  if (matrix[r][c] === -1) return CELL_STATE.OBSTACLE;
  const override = overrides ? overrides.get(cellKey(r, c)) : null;
  const isStart = !!start && r === start[0] && c === start[1];
  const isTarget = !!target && r === target[0] && c === target[1];
  for (const state of STATE_PRIORITY) {
    if (state === override) return state;
    if (state === CELL_STATE.START && isStart && !override) return state;
    if (state === CELL_STATE.TARGET && isTarget && !override) return state;
  }
  return CELL_STATE.DEFAULT;
}

// ---------------------------------------------------------------------------
// Board renderer
// ---------------------------------------------------------------------------

/**
 * Render a maze board into `container`: a grid of coloured, numbered cells
 * with optional start/target markers.
 * @param {HTMLElement} container
 * @param {number[][]} matrix
 * @param {{
 *   start?: [number, number],
 *   target?: [number, number],
 *   cellSize?: number,
 *   gap?: number,
 *   selectable?: boolean,
 *   isSelectable?: (row: number, col: number) => boolean,
 *   onCellClick?: (row: number, col: number) => void,
 *   caption?: string,
 *   legend?: Array<{state: string, label: string}>,
 * }} [options]
 */
export function mountMazeGrid(container, matrix, options = {}) {
  if (!container) return null;

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const start = options.start ?? null;
  const target = options.target ?? null;
  const cellSize = options.cellSize ?? 48;
  const gap = options.gap ?? 6;
  const selectable = options.selectable ?? false;
  const isSelectable = options.isSelectable ?? (() => true);
  const onCellClick = options.onCellClick ?? null;

  container.innerHTML = "";
  container.classList.add("mz-root");

  if (options.caption) {
    const caption = document.createElement("div");
    caption.className = "mz-caption";
    caption.textContent = options.caption;
    container.appendChild(caption);
  }

  const scene = document.createElement("div");
  scene.className = "mz-scene";
  container.appendChild(scene);

  const board = document.createElement("div");
  board.className = "mz-board";
  board.style.setProperty("--mz-cell-size", `${cellSize}px`);
  board.style.setProperty("--mz-gap", `${gap}px`);
  scene.appendChild(board);

  const cellEls = new Map();

  for (let r = 0; r < rows; r++) {
    const rowEl = document.createElement("div");
    rowEl.className = "mz-row";
    for (let c = 0; c < cols; c++) {
      const cellEl = document.createElement("div");
      cellEl.className = "mz-cell";
      cellEl.textContent = String(matrix[r][c]);
      cellEl.dataset.row = String(r);
      cellEl.dataset.col = String(c);

      if (start && r === start[0] && c === start[1]) {
        cellEl.classList.add("mz-cell-marker");
        cellEl.dataset.marker = "S";
      } else if (target && r === target[0] && c === target[1]) {
        cellEl.classList.add("mz-cell-marker");
        cellEl.dataset.marker = "T";
      }

      if (selectable && matrix[r][c] !== -1 && isSelectable(r, c)) {
        cellEl.classList.add("mz-cell-selectable");
        cellEl.addEventListener("click", () => onCellClick && onCellClick(r, c));
      }

      rowEl.appendChild(cellEl);
      cellEls.set(cellKey(r, c), cellEl);
    }
    board.appendChild(rowEl);
  }

  let overrides = new Map();

  function repaint() {
    cellEls.forEach((el, key) => {
      const [r, c] = key.split(",").map(Number);
      el.dataset.state = resolveCellState(matrix, start, target, overrides, r, c);
    });
  }
  repaint();

  if (options.legend) {
    container.appendChild(renderLegend(options.legend));
  }

  return {
    /** @param {Map<string, string>|Record<string,string>} map "r,c" -> CELL_STATE */
    setOverrides(map) {
      overrides = map instanceof Map ? map : new Map(Object.entries(map || {}));
      repaint();
    },
    clearOverrides() {
      overrides = new Map();
      repaint();
    },
    getOverrides: () => new Map(overrides),
    destroy() {
      container.innerHTML = "";
    },
  };
}

function renderLegend(items) {
  const legend = document.createElement("div");
  legend.className = "mz-legend";
  items.forEach(({ state, label }) => {
    const item = document.createElement("span");
    item.className = "mz-legend-item";
    item.innerHTML = `<span class="mz-legend-swatch" data-state="${state}"></span>${label}`;
    legend.appendChild(item);
  });
  return legend;
}

// ---------------------------------------------------------------------------
// Q1 — get_neighbours exercise
// ---------------------------------------------------------------------------

export const NEIGHBOURS_CODE_BLOCKS = [
  { id: "init_list", code: "neighbours = []", label: "initialise neighbours as an empty list" },
  {
    id: "for_dir",
    code: "for dr, dc in DIRECTIONS:",
    label: "for each of the 4 directions (up, down, left, right)",
    container: true,
  },
  { id: "compute_coords", code: "nr, nc = row + dr, col + dc", label: "compute the neighbour's row and column" },
  {
    id: "in_bounds",
    code: "if 0 <= nr < rows and 0 <= nc < cols:",
    label: "if the neighbour is inside the grid",
    container: true,
  },
  {
    id: "legal_move",
    code: "if matrix[nr][nc] != -1 and matrix[nr][nc] <= matrix[row][col]:",
    label: "if it isn't blocked and isn't higher than the current cell",
    container: true,
  },
  { id: "add_neighbour", code: "neighbours.append((nr, nc))", label: "add it to the neighbours list" },
];

export const NEIGHBOURS_CODE_OPTIONS = {
  heading: "get_neighbours steps",
  workspaceLabel: "Your plan",
  preplaced: ["init_list", "for_dir"],
  lockedBefore: [{ code: "DIRECTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]" }],
};

function buildNeighboursHarness(matrix, row, col, userSrc) {
  const indented = userSrc
    .split("\n")
    .map((l) => (l.length ? "    " + l : l))
    .join("\n");

  return `
import json

matrix = ${JSON.stringify(matrix)}
rows = len(matrix)
cols = len(matrix[0]) if rows else 0
row = ${row}
col = ${col}
neighbours = []

_error = None
try:
${indented}
except Exception as e:
    _error = type(e).__name__ + ": " + str(e)

json.dumps({
    "neighbours": [list(n) for n in neighbours] if isinstance(neighbours, list) else [],
    "error": _error,
})
`.trim();
}

/**
 * Q1 right-hand panel: a clickable maze board. Clicking any open cell runs
 * the student's assembled `get_neighbours` code (via `getPython`) against
 * that cell, highlights the returned neighbours on the board, and lists
 * them underneath.
 * @param {HTMLElement} container
 * @param {number[][]} matrix
 * @param {{start: [number,number], target: [number,number], getPython: () => string, cellSize?: number}} options
 */
export function mountNeighboursMazeView(container, matrix, options = {}) {
  if (!container) return null;

  const start = options.start ?? [0, 0];
  const target = options.target ?? [matrix.length - 1, matrix[0].length - 1];
  const getPython = options.getPython ?? (() => "");

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("mz-panel");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Try it";
  container.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "adj-hint";
  hint.textContent = "Click any open cell to run your get_neighbours code from that cell.";
  container.appendChild(hint);

  const gridMount = document.createElement("div");
  container.appendChild(gridMount);

  const grid = mountMazeGrid(gridMount, matrix, {
    start,
    target,
    cellSize: options.cellSize,
    selectable: true,
    onCellClick: (r, c) => {
      selected = [r, c];
      run();
    },
    legend: [
      { state: CELL_STATE.CURRENT, label: "selected cell" },
      { state: CELL_STATE.NEIGHBOUR, label: "returned neighbour" },
      { state: CELL_STATE.OBSTACLE, label: "obstacle" },
      { state: CELL_STATE.TARGET, label: "target" },
    ],
  });

  const status = document.createElement("div");
  status.className = "iv-status mz-status";
  status.textContent = "Click a cell above to see the neighbours your code finds.";
  container.appendChild(status);

  const listPanel = document.createElement("div");
  listPanel.className = "iv-visited";
  listPanel.innerHTML = `<div class="cb-section-label">Neighbours returned</div><div class="nb-list mz-list-body"><span class="adj-empty">no cell selected yet</span></div>`;
  container.appendChild(listPanel);
  const listBody = listPanel.querySelector(".mz-list-body");

  const controls = document.createElement("div");
  controls.className = "cb-controls";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "cb-btn";
  clearBtn.textContent = "Clear selection";
  controls.appendChild(clearBtn);
  container.appendChild(controls);

  let selected = null;
  let running = false;

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = "iv-status mz-status" + (kind ? ` iv-status-${kind}` : "");
  }

  function resetView() {
    selected = null;
    grid.clearOverrides();
    setStatus("Click a cell above to see the neighbours your code finds.");
    listBody.innerHTML = `<span class="adj-empty">no cell selected yet</span>`;
  }

  async function run() {
    if (!selected || running) return;
    running = true;
    const [r, c] = selected;

    grid.setOverrides(new Map([[cellKey(r, c), CELL_STATE.CURRENT]]));
    listBody.innerHTML = `<span class="adj-empty">computing…</span>`;

    const userSrc = (getPython() || "").trim();
    if (!userSrc) {
      setStatus("Your plan is empty — drag the blocks into place first.", "error");
      listBody.innerHTML = `<span class="adj-empty">no blocks placed yet</span>`;
      running = false;
      return;
    }

    setStatus("Running your code…");

    try {
      const pyodide = await getPyodide();
      const harness = buildNeighboursHarness(matrix, r, c, userSrc);
      const rawJson = await pyodide.runPythonAsync(harness);
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));

      if (payload.error) {
        setStatus("Error running your code: " + payload.error, "error");
        listBody.innerHTML = `<span class="adj-empty">fix the error above and try again</span>`;
      } else {
        const neighbours = Array.isArray(payload.neighbours) ? payload.neighbours : [];
        const overrides = new Map([[cellKey(r, c), CELL_STATE.CURRENT]]);
        neighbours.forEach(([nr, nc]) => overrides.set(cellKey(nr, nc), CELL_STATE.NEIGHBOUR));
        grid.setOverrides(overrides);

        if (neighbours.length === 0) {
          setStatus(`(${r}, ${c}) → no legal neighbours.`, "ok");
          listBody.innerHTML = `<span class="adj-empty">empty list</span>`;
        } else {
          setStatus(
            `(${r}, ${c}) → ${neighbours.length} neighbour${neighbours.length === 1 ? "" : "s"} found.`,
            "ok"
          );
          listBody.innerHTML = "";
          neighbours.forEach(([nr, nc]) => {
            const chip = document.createElement("span");
            chip.className = "adj-box adj-val nb-chip";
            chip.textContent = `(${nr}, ${nc})`;
            listBody.appendChild(chip);
          });
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Error: " + String(err), "error");
    } finally {
      running = false;
    }
  }

  clearBtn.addEventListener("click", resetView);
  getPyodide().catch(() => {});

  return { run, reset: resetView };
}

// ---------------------------------------------------------------------------
// Q2 — BFS shortest-path exercise
// ---------------------------------------------------------------------------

export const BFS_CODE_BLOCKS = [
  { id: "pop", code: "current = queue.pop(0)", label: "take the next cell from the front of the queue" },
  {
    id: "check_target",
    code: 'if current == target:\n    found = True\n    break',
    label: "stop if we've reached the target",
  },
  {
    id: "neighbours",
    code: "neighbours = get_neighbours(matrix, current[0], current[1])",
    label: "find the current cell's legal neighbours",
  },
  {
    id: "enqueue",
    code:
      "for n in neighbours:\n" +
      "    if n not in visited:\n" +
      "        visited.add(n)\n" +
      "        parent[n] = current\n" +
      "        distance[n] = distance[current] + 1\n" +
      "        queue.append(n)",
    label: "mark new neighbours visited and add them to the back of the queue",
  },
];

export const BFS_CODE_OPTIONS = {
  heading: "BFS steps",
  workspaceLabel: "Loop body — while queue:",
  preplaced: [],
  solutionOrder: ["pop", "check_target", "neighbours", "enqueue"],
  lockedBefore: [
    { code: "queue = [start]\nvisited = {start}\ndistance = {start: 0}\nparent = {}\nfound = False" },
  ],
  lockedContainer: { code: "while queue:" },
};

function withIterationGuard(src) {
  return src.replace(/while queue:\n/, "while queue:\n    _guard_iter()\n");
}

function buildBfsHarness(matrix, start, target, userSrc) {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const maxIters = rows * cols * 4 + 20;
  const guarded = withIterationGuard(userSrc);
  const indented = guarded
    .split("\n")
    .map((l) => (l.length ? "    " + l : l))
    .join("\n");

  return `
import json

def get_neighbours(matrix, row, col):
    rows = len(matrix)
    cols = len(matrix[0]) if rows else 0
    result = []
    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nr, nc = row + dr, col + dc
        if 0 <= nr < rows and 0 <= nc < cols:
            if matrix[nr][nc] != -1 and matrix[nr][nc] <= matrix[row][col]:
                result.append((nr, nc))
    return result

matrix = ${JSON.stringify(matrix)}
start = (${start[0]}, ${start[1]})
target = (${target[0]}, ${target[1]})

_iters = 0
_MAX_ITERS = ${maxIters}
def _guard_iter():
    global _iters
    _iters += 1
    if _iters > _MAX_ITERS:
        raise RuntimeError("TOO_MANY_ITERS")

found = False
queue = []
visited = set()
distance = {}
parent = {}
_error = None
try:
${indented}
except RuntimeError as e:
    _error = str(e)
except Exception as e:
    _error = type(e).__name__ + ": " + str(e)

path = []
if found and target in distance:
    node = target
    while node in parent:
        path.append(node)
        node = parent[node]
    path.append(start)
    path.reverse()

json.dumps({
    "distance": {("%d,%d" % (r, c)): d for (r, c), d in distance.items()},
    "found": bool(found),
    "path": [list(p) for p in path],
    "error": _error,
})
`.trim();
}

/**
 * Q2 right-hand panel: runs the student's assembled BFS loop through
 * Pyodide, then lets them Play / Step / Reset through the resulting search
 * one distance-layer at a time, finishing with the shortest path in green.
 * @param {HTMLElement} container
 * @param {number[][]} matrix
 * @param {{start: [number,number], target: [number,number], getPython: () => string, cellSize?: number, stepDelayMs?: number}} options
 */
export function mountBfsMazeView(container, matrix, options = {}) {
  if (!container) return null;

  const start = options.start ?? [0, 0];
  const target = options.target ?? [matrix.length - 1, matrix[0].length - 1];
  const getPython = options.getPython ?? (() => "");
  const stepDelayMs = options.stepDelayMs ?? 700;

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("mz-panel");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "BFS traversal";
  container.appendChild(heading);

  const gridMount = document.createElement("div");
  container.appendChild(gridMount);

  const grid = mountMazeGrid(gridMount, matrix, {
    start,
    target,
    cellSize: options.cellSize,
    selectable: false,
    legend: [
      { state: CELL_STATE.FRONTIER, label: "current layer" },
      { state: CELL_STATE.VISITED, label: "earlier layer" },
      { state: CELL_STATE.PATH, label: "shortest path" },
      { state: CELL_STATE.OBSTACLE, label: "obstacle" },
    ],
  });

  const status = document.createElement("div");
  status.className = "iv-status mz-status";
  container.appendChild(status);

  const controls = document.createElement("div");
  controls.className = "cb-controls";
  const playBtn = mkBtn("Play");
  const stepBtn = mkBtn("Step \u2192");
  const resetBtn = mkBtn("Reset");
  controls.append(playBtn, stepBtn, resetBtn);
  container.appendChild(controls);

  function mkBtn(text) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cb-btn";
    b.textContent = text;
    return b;
  }

  let layers = []; // layers[d] = [[r,c], ...] cells at BFS distance d
  let path = [];
  let found = false;
  let frameIndex = -1; // -1 = idle
  let playing = false;
  let playTimer = null;
  let compiling = false;
  let hasCompiled = false;

  function totalSteps() {
    return layers.length + (found ? 1 : 0);
  }

  function stopPlayback() {
    playing = false;
    if (playTimer != null) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  }

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = "iv-status mz-status" + (kind ? ` iv-status-${kind}` : "");
  }

  function renderControls() {
    playBtn.textContent = compiling ? "Loading\u2026" : playing ? "Pause" : "Play";
    playBtn.disabled = compiling;
    stepBtn.disabled = compiling;
  }

  function render() {
    const overrides = new Map();
    if (frameIndex >= 0) {
      const revealed = Math.min(frameIndex + 1, layers.length);
      for (let d = 0; d < revealed; d++) {
        const state = d === frameIndex ? CELL_STATE.FRONTIER : CELL_STATE.VISITED;
        (layers[d] || []).forEach(([r, c]) => overrides.set(cellKey(r, c), state));
      }
      if (frameIndex >= layers.length) {
        path.forEach(([r, c]) => overrides.set(cellKey(r, c), CELL_STATE.PATH));
      }
    }
    grid.setOverrides(overrides);

    if (frameIndex < 0) {
      setStatus("Assemble the loop body, then press Play or Step to run BFS.");
    } else if (frameIndex < layers.length) {
      const count = layers[frameIndex].length;
      setStatus(`Layer ${frameIndex} — ${count} cell${count === 1 ? "" : "s"} at distance ${frameIndex} from the start.`);
    } else if (found) {
      setStatus(`Target found! Shortest path length = ${Math.max(path.length - 1, 0)} step(s).`, "ok");
    } else {
      setStatus("Search finished — no path to the target.", "error");
    }
    renderControls();
  }

  async function compile() {
    const userSrc = (getPython() || "").trim();
    if (!userSrc || /while queue:\s*\n\s*pass\s*$/.test(userSrc)) {
      setStatus("Your plan is empty — drag the steps into the loop first.", "error");
      layers = [];
      path = [];
      found = false;
      frameIndex = -1;
      return false;
    }

    compiling = true;
    setStatus("Loading Python runtime\u2026");
    renderControls();

    try {
      const pyodide = await getPyodide();
      setStatus("Running your BFS code\u2026");
      const harness = buildBfsHarness(matrix, start, target, userSrc);
      const rawJson = await pyodide.runPythonAsync(harness);
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));

      if (payload.error === "TOO_MANY_ITERS") {
        setStatus("Loop ran too long — did you forget to mark cells visited, or break on the target?", "error");
        layers = [];
        path = [];
        found = false;
        frameIndex = -1;
        return false;
      }
      if (payload.error) {
        setStatus("Error running your code: " + payload.error, "error");
        layers = [];
        path = [];
        found = false;
        frameIndex = -1;
        return false;
      }

      const distanceMap = payload.distance || {};
      const maxDistance = Object.values(distanceMap).reduce((m, d) => Math.max(m, d), 0);
      layers = Array.from({ length: maxDistance + 1 }, () => []);
      Object.entries(distanceMap).forEach(([key, d]) => {
        const [r, c] = key.split(",").map(Number);
        layers[d].push([r, c]);
      });
      found = !!payload.found;
      path = Array.isArray(payload.path) ? payload.path : [];
      return true;
    } catch (err) {
      console.error(err);
      setStatus("Error: " + String(err), "error");
      layers = [];
      path = [];
      found = false;
      frameIndex = -1;
      return false;
    } finally {
      compiling = false;
    }
  }

  async function ensureCompiled({ restart = false } = {}) {
    if (compiling) return layers.length > 0;
    if (restart || !hasCompiled) {
      stopPlayback();
      const ok = await compile();
      hasCompiled = true;
      return ok;
    }
    return layers.length > 0;
  }

  async function stepForward() {
    const atEnd = frameIndex !== -1 && frameIndex >= totalSteps() - 1;
    const needsFreshRun = frameIndex === -1 || atEnd;
    const ok = await ensureCompiled({ restart: atEnd || !hasCompiled });
    if (!ok) {
      frameIndex = -1;
      render();
      return;
    }
    if (needsFreshRun) frameIndex = 0;
    else if (frameIndex < totalSteps() - 1) frameIndex += 1;
    render();
  }

  async function play() {
    const ok = await ensureCompiled({ restart: true });
    if (!ok) {
      frameIndex = -1;
      render();
      return;
    }
    frameIndex = 0;
    playing = true;
    render();

    const tick = () => {
      if (!playing) return;
      if (frameIndex >= totalSteps() - 1) {
        stopPlayback();
        render();
        return;
      }
      frameIndex += 1;
      render();
      if (playing && frameIndex < totalSteps() - 1) {
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
    layers = [];
    path = [];
    found = false;
    frameIndex = -1;
    hasCompiled = false;
    render();
  }

  playBtn.addEventListener("click", () => {
    if (playing) {
      stopPlayback();
      render();
    } else {
      play();
    }
  });
  stepBtn.addEventListener("click", () => {
    stopPlayback();
    stepForward();
  });
  resetBtn.addEventListener("click", reset);

  render();
  getPyodide().catch(() => {});

  return { play, step: stepForward, reset, destroy: () => stopPlayback() };
}

// ---------------------------------------------------------------------------
// Man-Pac 0/1 coin maze (notebook formatting)
// Used by traversal-undirected-practice.qmd. 1 = coin / walkable, 0 = wall.
// ---------------------------------------------------------------------------

/** Same layout as test_qmds/samples/notebook-maze.html */
export const MANPAC_MAZE = [
  [1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
  [1, 0, 1, 0, 1, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
  [0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 1, 0, 1, 1, 1],
  [1, 1, 1, 0, 0, 1, 1, 1, 0, 1],
];

export const MANPAC_START = [0, 0];
export const MANPAC_TARGET = [
  MANPAC_MAZE.length - 1,
  MANPAC_MAZE[0].length - 1,
];

function isWallCell(matrix, r, c) {
  return matrix[r]?.[c] === 0;
}

function asCell(n) {
  if (Array.isArray(n) && n.length >= 2) return [Number(n[0]), Number(n[1])];
  if (typeof n === "string" && n.includes(",")) {
    const [r, c] = n.split(",").map(Number);
    return [r, c];
  }
  return null;
}

function cellLabel(cell) {
  if (!cell) return "?";
  return `(${cell[0]}, ${cell[1]})`;
}

function sameCell(a, b) {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveNotebookState(matrix, overrides, r, c) {
  const override = overrides ? overrides.get(cellKey(r, c)) : null;
  if (override) return override;
  if (isWallCell(matrix, r, c)) return CELL_STATE.OBSTACLE;
  return CELL_STATE.DEFAULT;
}

/**
 * Cream notebook-style 0/1 maze board (formatting from notebook-maze.html).
 * @param {HTMLElement} container
 * @param {number[][]} matrix
 * @param {{
 *   start?: [number, number],
 *   target?: [number, number],
 *   cellSize?: number,
 *   selectable?: boolean,
 *   isSelectable?: (row: number, col: number) => boolean,
 *   onCellClick?: (row: number, col: number) => void,
 *   caption?: string,
 *   legend?: Array<{state: string, label: string}>,
 * }} [options]
 */
export function mountNotebookMazeGrid(container, matrix, options = {}) {
  if (!container) return null;

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const start = options.start ?? null;
  const target = options.target ?? null;
  const cellSize = options.cellSize ?? 32;
  const selectable = options.selectable ?? false;
  const isSelectable = options.isSelectable ?? ((r, c) => !isWallCell(matrix, r, c));
  const onCellClick = options.onCellClick ?? null;

  container.innerHTML = "";
  container.classList.add("nbz-root");

  if (options.caption) {
    const caption = document.createElement("div");
    caption.className = "nbz-caption";
    caption.textContent = options.caption;
    container.appendChild(caption);
  }

  const scene = document.createElement("div");
  scene.className = "nbz-scene";
  container.appendChild(scene);

  const board = document.createElement("div");
  board.className = "nbz-board";
  board.style.setProperty("--nbz-cell-size", `${cellSize}px`);
  board.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  scene.appendChild(board);

  const cellEls = new Map();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellEl = document.createElement("div");
      cellEl.className = "nbz-cell" + (isWallCell(matrix, r, c) ? " nbz-wall" : "");
      cellEl.textContent = String(matrix[r][c]);
      cellEl.dataset.row = String(r);
      cellEl.dataset.col = String(c);

      if (start && r === start[0] && c === start[1]) {
        cellEl.classList.add("nbz-cell-marker");
        cellEl.dataset.marker = "S";
      } else if (target && r === target[0] && c === target[1]) {
        cellEl.classList.add("nbz-cell-marker");
        cellEl.dataset.marker = "T";
      }

      if (selectable && isSelectable(r, c)) {
        cellEl.classList.add("nbz-cell-selectable");
        cellEl.addEventListener("click", () => onCellClick && onCellClick(r, c));
      }

      board.appendChild(cellEl);
      cellEls.set(cellKey(r, c), cellEl);
    }
  }

  let overrides = new Map();
  let labels = new Map();

  function repaint() {
    cellEls.forEach((el, key) => {
      const [r, c] = key.split(",").map(Number);
      const state = resolveNotebookState(matrix, overrides, r, c);
      if (state === CELL_STATE.DEFAULT || state === CELL_STATE.OBSTACLE) {
        delete el.dataset.state;
      } else {
        el.dataset.state = state;
      }
      const label = labels.get(key);
      el.textContent = label != null ? String(label) : String(matrix[r][c]);
    });
  }
  repaint();

  if (options.legend) {
    const legend = document.createElement("div");
    legend.className = "nbz-legend";
    options.legend.forEach(({ state, label }) => {
      const item = document.createElement("span");
      item.className = "nbz-legend-item";
      item.innerHTML = `<span class="nbz-legend-swatch" data-state="${state}"></span>${label}`;
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }

  return {
    setOverrides(map) {
      overrides = map instanceof Map ? map : new Map(Object.entries(map || {}));
      repaint();
    },
    setLabels(map) {
      labels = map instanceof Map ? map : new Map(Object.entries(map || {}));
      repaint();
    },
    clearOverrides() {
      overrides = new Map();
      labels = new Map();
      repaint();
    },
    getOverrides: () => new Map(overrides),
    destroy() {
      container.innerHTML = "";
    },
  };
}

export const MANPAC_NEIGHBOURS_CODE_BLOCKS = [
  { id: "init_list", code: "neighbours = []", label: "initialise neighbours as an empty list" },
  {
    id: "for_dir",
    code: "for dr, dc in DIRECTIONS:",
    label: "for each of the 4 directions (up, down, left, right)",
    container: true,
  },
  { id: "compute_coords", code: "nr, nc = row + dr, col + dc", label: "compute the neighbour's row and column" },
  {
    id: "in_bounds",
    code: "if 0 <= nr < rows and 0 <= nc < cols:",
    label: "if the neighbour is inside the grid",
    container: true,
  },
  {
    id: "legal_move",
    code: "if matrix[nr][nc] == 1:",
    label: "if the neighbour is a coin cell (1), not a wall (0)",
    container: true,
  },
  { id: "add_neighbour", code: "neighbours.append((nr, nc))", label: "add it to the neighbours list" },
];

export const MANPAC_NEIGHBOURS_CODE_OPTIONS = {
  heading: "get_neighbours steps",
  workspaceLabel: "Your plan",
  preplaced: ["init_list", "for_dir"],
  lockedBefore: [{ code: "DIRECTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]" }],
};

/**
 * Click a coin cell to run the student's assembled get_neighbours code
 * and highlight the returned neighbours (notebook maze styling).
 */
export function mountManpacNeighboursView(container, matrix, options = {}) {
  if (!container) return null;

  const start = options.start ?? [0, 0];
  const target = options.target ?? [matrix.length - 1, matrix[0].length - 1];
  const getPython = options.getPython ?? (() => "");

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("nbz-panel");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Try it";
  container.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "adj-hint";
  hint.textContent = "Click any coin cell (1) to run your get_neighbours code from that cell.";
  container.appendChild(hint);

  const gridMount = document.createElement("div");
  container.appendChild(gridMount);

  const grid = mountNotebookMazeGrid(gridMount, matrix, {
    start,
    target,
    cellSize: options.cellSize ?? 30,
    selectable: true,
    onCellClick: (r, c) => {
      selected = [r, c];
      run();
    },
    legend: [
      { state: CELL_STATE.CURRENT, label: "selected cell" },
      { state: CELL_STATE.NEIGHBOUR, label: "returned neighbour" },
      { state: CELL_STATE.OBSTACLE, label: "wall" },
    ],
  });

  const status = document.createElement("div");
  status.className = "iv-status mz-status";
  status.textContent = "Click a coin cell above to see the neighbours your code finds.";
  container.appendChild(status);

  const listPanel = document.createElement("div");
  listPanel.className = "iv-visited";
  listPanel.innerHTML = `<div class="cb-section-label">Neighbours returned</div><div class="nb-list mz-list-body"><span class="adj-empty">no cell selected yet</span></div>`;
  container.appendChild(listPanel);
  const listBody = listPanel.querySelector(".mz-list-body");

  const controls = document.createElement("div");
  controls.className = "cb-controls";
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "cb-btn";
  clearBtn.textContent = "Clear selection";
  controls.appendChild(clearBtn);
  container.appendChild(controls);

  let selected = null;
  let running = false;

  function setStatus(text, kind) {
    status.textContent = text;
    status.className = "iv-status mz-status" + (kind ? ` iv-status-${kind}` : "");
  }

  function resetView() {
    selected = null;
    grid.clearOverrides();
    setStatus("Click a coin cell above to see the neighbours your code finds.");
    listBody.innerHTML = `<span class="adj-empty">no cell selected yet</span>`;
  }

  async function run() {
    if (!selected || running) return;
    running = true;
    const [r, c] = selected;

    grid.setOverrides(new Map([[cellKey(r, c), CELL_STATE.CURRENT]]));
    listBody.innerHTML = `<span class="adj-empty">computing…</span>`;

    const userSrc = (getPython() || "").trim();
    if (!userSrc) {
      setStatus("Your plan is empty — drag the blocks into place first.", "error");
      listBody.innerHTML = `<span class="adj-empty">no blocks placed yet</span>`;
      running = false;
      return;
    }

    setStatus("Running your code…");

    try {
      const pyodide = await getPyodide();
      const harness = buildNeighboursHarness(matrix, r, c, userSrc);
      const rawJson = await pyodide.runPythonAsync(harness);
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));

      if (payload.error) {
        setStatus("Error running your code: " + payload.error, "error");
        listBody.innerHTML = `<span class="adj-empty">fix the error above and try again</span>`;
      } else {
        const neighbours = Array.isArray(payload.neighbours) ? payload.neighbours : [];
        const overrides = new Map([[cellKey(r, c), CELL_STATE.CURRENT]]);
        neighbours.forEach((n) => {
          const cell = asCell(n);
          if (cell) overrides.set(cellKey(cell[0], cell[1]), CELL_STATE.NEIGHBOUR);
        });
        grid.setOverrides(overrides);

        if (neighbours.length === 0) {
          setStatus(`${cellLabel([r, c])} → no valid neighbours.`, "ok");
          listBody.innerHTML = `<span class="adj-empty">empty list</span>`;
        } else {
          setStatus(
            `${cellLabel([r, c])} → ${neighbours.length} neighbour${neighbours.length === 1 ? "" : "s"} found.`,
            "ok"
          );
          listBody.innerHTML = "";
          neighbours.forEach((n) => {
            const cell = asCell(n);
            const chip = document.createElement("span");
            chip.className = "adj-box adj-val nb-chip";
            chip.textContent = cell ? cellLabel(cell) : String(n);
            listBody.appendChild(chip);
          });
        }
      }
    } catch (err) {
      console.error(err);
      setStatus("Error: " + String(err), "error");
    } finally {
      running = false;
    }
  }

  clearBtn.addEventListener("click", resetView);
  getPyodide().catch(() => {});

  return { run, reset: resetView };
}

function manpacLoopBlocks(popFromFront) {
  const pickCode = popFromFront ? "node = bag.pop(0)" : "node = bag.pop()";
  const pickLabel = popFromFront
    ? "pick the first cell from the bag AND remove it simultaneously"
    : "pick the last cell from the bag AND remove it simultaneously";
  return [
    { id: "pick", code: pickCode, label: pickLabel },
    {
      id: "track_neighbours",
      code:
        "neighbours = get_neighbours(node)\n" +
        "for n in neighbours:\n" +
        "    tracking[n] = tracking[node] + 1",
      label: "find unvisited neighbours and record each one's distance from start",
    },
    {
      id: "check_goal",
      code:
        "if node == target or target in neighbours:\n" +
        "    goal_reached = True\n" +
        "    path_distance = tracking[target]\n" +
        "    break",
      label: "if we popped the target or just found it next door, record the distance and stop",
    },
    { id: "bag_neighbours", code: "bag += neighbours", label: "add the neighbours to the bag" },
  ];
}

function manpacLoopOptions(heading, start, target) {
  return {
    heading,
    workspaceLabel: "Loop body — while bag:",
    preplaced: [],
    solutionOrder: ["pick", "track_neighbours", "check_goal", "bag_neighbours"],
    lockedBefore: [
      {
        code:
          `start = (${start[0]}, ${start[1]})\n` +
          `target = (${target[0]}, ${target[1]})\n` +
          "bag = list()\ntracking = dict()\n\n" +
          "tracking[start] = 0\nbag.append(start)\n" +
          "goal_reached = False\npath_distance = None",
      },
    ],
    lockedContainer: { code: "while bag:" },
  };
}

export const MANPAC_BFS_CODE_BLOCKS = manpacLoopBlocks(true);
export const MANPAC_BFS_CODE_OPTIONS = manpacLoopOptions(
  "BFS steps",
  MANPAC_START,
  MANPAC_TARGET
);

export const MANPAC_DFS_CODE_BLOCKS = manpacLoopBlocks(false);
export const MANPAC_DFS_CODE_OPTIONS = manpacLoopOptions(
  "DFS steps",
  MANPAC_START,
  MANPAC_TARGET
);

function instrumentManpacPython(src) {
  const lines = src.split("\n");
  const out = [];
  let pendingTrackProbeIndent = null;

  function flushTrackProbe(nextIndent) {
    if (pendingTrackProbeIndent == null) return;
    if (nextIndent.length <= pendingTrackProbeIndent.length) {
      const ind = pendingTrackProbeIndent;
      out.push(`${ind}_probe("track_neighbours")`);
      out.push(`${ind}if _found_target(node, neighbours):`);
      out.push(`${ind}    _mark_found(node, neighbours)`);
      out.push(`${ind}    break`);
      pendingTrackProbeIndent = null;
    }
  }

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const indent = (trimmed.match(/^(\s*)/) || ["", ""])[1];
    if (trimmed.trim()) flushTrackProbe(indent);

    if (/^\s*bag\s*=\s*list\(\)\s*$/.test(trimmed)) {
      out.push(`${indent}bag = _TraceList("bag")`);
      continue;
    }
    if (/^\s*tracking\s*=\s*(dict\(\)|{})\s*$/.test(trimmed)) {
      out.push(`${indent}tracking = _TraceDict("tracking")`);
      continue;
    }
    if (/^\s*tracking\s*=\s*list\(\)\s*$/.test(trimmed)) {
      out.push(`${indent}tracking = _TraceList("tracking")`);
      continue;
    }
    if (/^\s*while\s+bag\s*:\s*$/.test(trimmed)) {
      out.push(trimmed);
      out.push(`${indent}    _guard_iter()`);
      continue;
    }
    if (/^\s*if\s+node\s*==\s*target(\s+or\s+target\s+in\s+neighbours)?\s*:\s*$/.test(trimmed)) {
      out.push(`${indent}_probe("check_goal")`);
      out.push(`${indent}if _found_target(node, neighbours):`);
      continue;
    }
    if (/^\s*for n in neighbours:\s*$/.test(trimmed)) {
      out.push(trimmed);
      pendingTrackProbeIndent = indent;
      continue;
    }

    out.push(trimmed);

    if (
      /^\s*node\s*=\s*bag\.pop\s*\(\s*\)\s*$/.test(trimmed) ||
      /^\s*node\s*=\s*bag\.pop\s*\(\s*0\s*\)\s*$/.test(trimmed)
    ) {
      out.push(`${indent}node = tuple(node)`);
      out.push(`${indent}_state["node"] = node`);
      out.push(`${indent}_state["neighbours"] = []`);
      out.push(`${indent}_probe("pick")`);
      out.push(`${indent}if _found_target(node, []):`);
      out.push(`${indent}    _mark_found(node, [])`);
      out.push(`${indent}    break`);
    }

    if (/^\s*neighbours\s*=\s*get_neighbours\s*\(\s*node\s*\)\s*$/.test(trimmed)) {
      out.push(`${indent}_state["neighbours"] = list(neighbours)`);
    }

    if (/^\s*tracking\s*\+=\s*neighbours\s*$/.test(trimmed)) {
      out.push(`${indent}_probe("track_neighbours")`);
    }

    if (/^\s*bag\s*\+=\s*neighbours\s*$/.test(trimmed)) {
      out.push(`${indent}_probe("bag_neighbours")`);
    }

    if (/^\s*goal_reached\s*=\s*True\s*$/.test(trimmed)) {
      out.push(`${indent}_state["reached"] = True`);
    }

    if (/^\s*path_distance\s*=\s*tracking\[(node|target)\](\s+if\s+target\s+in\s+tracking\s+else\s+tracking\[node\])?\s*$/.test(trimmed)) {
      out.push(`${indent}_state["path_distance"] = path_distance`);
    }
  }

    if (pendingTrackProbeIndent != null) {
      const ind = pendingTrackProbeIndent;
      out.push(`${ind}_probe("track_neighbours")`);
      out.push(`${ind}if _found_target(node, neighbours):`);
      out.push(`${ind}    _mark_found(node, neighbours)`);
      out.push(`${ind}    break`);
    }

  return out.join("\n");
}

function buildManpacTraversalHarness(matrix, start, target, userSrc) {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const maxIters = rows * cols * 8 + 20;
  const body = instrumentManpacPython(userSrc);
  const indented = body
    .split("\n")
    .map((l) => (l.length ? "    " + l : l))
    .join("\n");

  return `
import json

matrix = ${JSON.stringify(matrix)}
start = (${start[0]}, ${start[1]})
target = (${target[0]}, ${target[1]})

_events = []
_state = {
    "node": None,
    "neighbours": [],
    "reached": False,
    "bag": None,
    "tracking": None,
    "path_distance": None,
    "iters": 0,
}
_MAX_ITERS = ${maxIters}

class _TraceList(list):
    def __init__(self, role, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _state[role] = self

class _TraceDict(dict):
    def __init__(self, role, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _state[role] = self

def _as_cell(n):
    if n is None:
        return None
    if isinstance(n, (list, tuple)) and len(n) >= 2:
        return [int(n[0]), int(n[1])]
    return None

def _cells_equal(a, b):
    ca, cb = _as_cell(a), _as_cell(b)
    return ca is not None and ca == cb

def _found_target(node, neighbours=None):
    if _cells_equal(node, target):
        return True
    for n in neighbours or []:
        if _cells_equal(n, target):
            return True
    return False

def _mark_found(node=None, neighbours=None):
    _state["reached"] = True
    tracking = _state["tracking"]
    dist = _state.get("path_distance")
    if dist is None and isinstance(tracking, dict):
        for key in (tuple(target), target):
            if key in tracking:
                dist = tracking[key]
                break
        if dist is None and node is not None:
            cell = _as_cell(node)
            if cell is not None:
                dist = tracking.get(tuple(cell), tracking.get(node))
    _state["path_distance"] = dist

def _cells(seq):
    out = []
    if seq is None:
        return out
    for n in seq:
        cell = _as_cell(n)
        if cell is not None:
            out.append(cell)
    return out

def _tracking_snap(t):
    if t is None:
        return []
    if isinstance(t, dict):
        out = []
        for k, d in t.items():
            cell = _as_cell(k)
            if cell is None:
                continue
            try:
                dist = int(d)
            except (TypeError, ValueError):
                dist = None
            out.append({"cell": cell, "dist": dist})
        return out
    return [{"cell": c, "dist": None} for c in _cells(t)]

def _probe(block_id):
    node = _as_cell(_state["node"])
    found = _found_target(
        _state["node"],
        [] if block_id == "pick" else _state["neighbours"],
    )
    reached = bool(_state["reached"]) or (
        block_id in ("check_goal", "track_neighbours", "pick") and found
    )
    if reached:
        _state["reached"] = True
    tracking = _state["tracking"]
    path_distance = _state.get("path_distance")
    if path_distance is None and reached and isinstance(tracking, dict):
        key = tuple(target)
        if key in tracking:
            path_distance = tracking[key]
        elif target in tracking:
            path_distance = tracking[target]
        _state["path_distance"] = path_distance
    _events.append({
        "blockId": block_id,
        "node": node,
        "neighbours": _cells(_state["neighbours"]),
        "bag": _cells(_state["bag"]),
        "tracking": _tracking_snap(tracking),
        "reached": reached,
        "pathDistance": path_distance,
    })

def _guard_iter():
    _state["iters"] += 1
    if _state["iters"] > _MAX_ITERS:
        raise RuntimeError("TOO_MANY_ITERS")

def _is_seen(n):
    tracking = _state["tracking"]
    if tracking is None:
        return False
    key = tuple(n) if isinstance(n, (list, tuple)) else n
    if isinstance(tracking, dict):
        return key in tracking or n in tracking
    for item in tracking:
        if _cells_equal(item, n):
            return True
    return False

def get_neighbours(node):
    row, col = node[0], node[1]
    rows = len(matrix)
    cols = len(matrix[0]) if rows else 0
    result = []
    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nr, nc = row + dr, col + dc
        if 0 <= nr < rows and 0 <= nc < cols and matrix[nr][nc] == 1:
            n = (nr, nc)
            if not _is_seen(n):
                result.append(n)
    return result

goal_reached = False
path_distance = None
neighbours = []
_error = None
try:
${indented}
except RuntimeError as e:
    _error = str(e)
except Exception as e:
    _error = type(e).__name__ + ": " + str(e)

_done_reached = bool(_state.get("reached") or goal_reached)
if _state.get("path_distance") is None:
    _state["path_distance"] = path_distance
if _state.get("path_distance") is None and _done_reached:
    tracking = _state["tracking"]
    if isinstance(tracking, dict):
        key = tuple(target)
        if key in tracking:
            _state["path_distance"] = tracking[key]
        elif target in tracking:
            _state["path_distance"] = tracking[target]

_events.append({
    "blockId": None,
    "node": _as_cell(_state["node"]),
    "neighbours": [],
    "bag": _cells(_state["bag"]),
    "tracking": _tracking_snap(_state["tracking"]),
    "reached": _done_reached,
    "pathDistance": _state.get("path_distance"),
    "done": True,
})

json.dumps({"events": _events, "result": _done_reached, "pathDistance": _state.get("path_distance"), "error": _error})
`.trim();
}

function bagDisplayWithGhostCells(prevBag, bagCells, ghost) {
  const bagSet = new Set(bagCells.map((c) => cellKey(c[0], c[1])));
  const seen = new Set();
  const out = [];
  for (const id of prevBag) {
    const cell = asCell(id);
    const key = cell ? cellKey(cell[0], cell[1]) : String(id);
    if (seen.has(key)) continue;
    const isGhost = ghost && cell && sameCell(cell, ghost);
    if (isGhost || bagSet.has(key)) {
      out.push(cell || id);
      seen.add(key);
    }
  }
  for (const cell of bagCells) {
    const key = cellKey(cell[0], cell[1]);
    if (seen.has(key)) continue;
    out.push(cell);
    seen.add(key);
  }
  if (ghost) {
    const gKey = cellKey(ghost[0], ghost[1]);
    if (!seen.has(gKey)) out.push(ghost);
  }
  return out;
}

function parseTrackingItems(raw) {
  const items = [];
  if (raw == null) return items;
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (entry && typeof entry === "object" && !Array.isArray(entry) && entry.cell) {
        const cell = asCell(entry.cell);
        if (cell) items.push({ cell, dist: entry.dist ?? null });
        return;
      }
      const cell = asCell(entry);
      if (cell) items.push({ cell, dist: null });
    });
    return items;
  }
  if (typeof raw === "object") {
    Object.entries(raw).forEach(([key, dist]) => {
      const cell = asCell(key);
      if (cell) items.push({ cell, dist: dist ?? null });
    });
  }
  return items;
}

function eventsToManpacFrames(events, start, target) {
  const frames = [];
  let prevBag = start ? [start] : [];
  let stopAfterReach = false;

  for (const ev of events ?? []) {
    const done = !!ev.done;
    if (stopAfterReach && !done) continue;

    const node = asCell(ev.node);
    const neighbours = (ev.neighbours ?? []).map(asCell).filter(Boolean);
    const bagCells = (ev.bag ?? []).map(asCell).filter(Boolean);
    const tracking = parseTrackingItems(ev.tracking);
    const blockId = ev.blockId ?? null;
    const reached = !!ev.reached;
    const pathDistance =
      ev.pathDistance == null || ev.pathDistance === "" ? null : Number(ev.pathDistance);

    const distOf = (cell) => {
      if (!cell) return null;
      const hit = tracking.find((t) => sameCell(t.cell, cell));
      return hit && hit.dist != null ? hit.dist : null;
    };

    const distLabel = (cell) => {
      const d = distOf(cell);
      return d == null ? "" : ` (distance ${d})`;
    };

    let message = "";
    if (blockId === "pick") {
      message = `Picked ${cellLabel(node)} from the bag${distLabel(node)}.`;
    } else if (blockId === "check_goal") {
      message = reached
        ? `Found the target — path distance = ${pathDistance ?? distOf(target) ?? distOf(node) ?? "?"}. Stop.`
        : `${cellLabel(node)} is not the target — keep going.`;
    } else if (blockId === "track_neighbours") {
      const foundT = target && neighbours.some((n) => sameCell(n, target));
      if (foundT) {
        message = `Target is a neighbour${distLabel(target)}. Path distance = ${pathDistance ?? distOf(target) ?? "?"}. Stop.`;
      } else if (neighbours.length) {
        message = `Tracked neighbours: ${neighbours
          .map((n) => `${cellLabel(n)}${distLabel(n)}`)
          .join(", ")}.`;
      } else {
        message = "No new neighbours to track.";
      }
    } else if (blockId === "bag_neighbours") {
      message = "Added neighbours to the bag.";
    } else if (done) {
      const dist = pathDistance ?? distOf(target);
      message = reached
        ? `Done — reached the bottom right. Path distance = ${dist ?? "?"}.`
        : "Done — bag empty, target not reached.";
    }

    const showNeighbours =
      blockId === "track_neighbours" || blockId === "bag_neighbours";

    const nodeKey = node ? cellKey(node[0], node[1]) : null;
    const missingCurrent =
      node != null && !bagCells.some((c) => sameCell(c, node));
    const showGhost =
      missingCurrent &&
      (blockId === "pick" ||
        blockId === "check_goal" ||
        blockId === "track_neighbours" ||
        blockId === "bag_neighbours");

    const displayBag = showGhost
      ? bagDisplayWithGhostCells(prevBag, bagCells, node)
      : bagCells;

    frames.push({
      blockId,
      node,
      neighbours: showNeighbours ? neighbours : [],
      bag: displayBag,
      bagPick: !showGhost && nodeKey ? node : null,
      bagPickDone: showGhost ? node : null,
      tracking,
      reached,
      done,
      pathDistance,
      message,
    });

    prevBag =
      blockId === "bag_neighbours" || done ? bagCells : displayBag;

    const hitTarget =
      (node && target && sameCell(node, target)) ||
      neighbours.some((n) => target && sameCell(n, target));
    if (hitTarget || (reached && (blockId === "check_goal" || blockId === "track_neighbours" || blockId === "pick"))) {
      stopAfterReach = true;
    }
  }
  return frames;
}

function renderManpacBagPanel({ items, pick, pickDone, footer }) {
  const chips =
    items.length === 0
      ? `<div class="ht-bag-empty">bag empty — awaiting cells…</div>`
      : items
          .map((cell) => {
            const done = pickDone && sameCell(cell, pickDone);
            const picked = !done && pick && sameCell(cell, pick);
            const cls = done
              ? " ht-bag-chip-pick-done"
              : picked
                ? " ht-bag-chip-pick"
                : "";
            const check = done
              ? `<span class="ht-bag-chip-check" aria-hidden="true">✓</span>`
              : "";
            return `<span class="ht-bag-chip${cls}">${escapeHtml(cellLabel(cell))}${check}</span>`;
          })
          .join("");

  return `
    <div class="ht-bag" aria-label="Bag">
      <div class="ht-bag-header">
        <span class="ht-bag-title">ENCOUNTERED, NOTED TO BE EXPLORED</span>
      </div>
      <div class="ht-bag-body">${chips}</div>
      <div class="ht-bag-footer">${escapeHtml(footer)}</div>
    </div>
  `;
}

function renderManpacTrackingPanel(items) {
  const chips =
    items.length === 0
      ? `<div class="ht-track-empty">no cells logged yet…</div>`
      : items
          .map((item) => {
            const cell = item.cell ?? item;
            const dist = item.dist;
            const label =
              dist == null ? cellLabel(cell) : `${cellLabel(cell)}:${dist}`;
            return `<span class="ht-track-chip">${escapeHtml(label)}</span>`;
          })
          .join("");

  return `
    <div class="ht-track" aria-label="Tracking">
      <div class="ht-track-header">
        <span class="ht-track-title">TRACKING</span>
      </div>
      <div class="ht-track-body">${chips}</div>
      <div class="ht-track-footer">visited cells — distance from start</div>
    </div>
  `;
}

/**
 * Play / Step viz for Man-Pac BFS or DFS. Runs the student's assembled loop
 * through Pyodide, then highlights pop / check-goal / track / bag steps on
 * the notebook maze, with bag and tracking panels underneath.
 *
 * @param {HTMLElement} container
 * @param {number[][]} matrix
 * @param {{
 *   start?: [number, number],
 *   target?: [number, number],
 *   getPython: () => string,
 *   heading?: string,
 *   bagFooter?: string,
 *   cellSize?: number,
 *   stepDelayMs?: number,
 *   onStep?: (frame: object|null) => void,
 * }} options
 */
export function mountManpacTraversalView(container, matrix, options = {}) {
  if (!container) return null;

  const start = options.start ?? [0, 0];
  const target = options.target ?? [matrix.length - 1, matrix[0].length - 1];
  const getPython = options.getPython ?? (() => "");
  const onStep = options.onStep ?? (() => {});
  const bagFooter = options.bagFooter ?? "ordered list";
  const stepDelayMs = options.stepDelayMs ?? 900;

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("nbz-panel");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = options.heading ?? "Traversal";
  container.appendChild(heading);

  const gridMount = document.createElement("div");
  container.appendChild(gridMount);

  const grid = mountNotebookMazeGrid(gridMount, matrix, {
    start,
    target,
    cellSize: options.cellSize ?? 28,
    selectable: false,
    legend: [
      { state: CELL_STATE.CURRENT, label: "current cell" },
      { state: CELL_STATE.NEIGHBOUR, label: "neighbours this step" },
      { state: CELL_STATE.VISITED, label: "tracked" },
      { state: CELL_STATE.OBSTACLE, label: "wall" },
    ],
  });

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
  let frameIndex = -1;
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
      bag: [start],
      bagPick: null,
      bagPickDone: null,
      tracking: [{ cell: start, dist: 0 }],
      reached: false,
      done: false,
      pathDistance: null,
      message: "Assemble the loop body, then press Play or Step to run your code.",
    };
  }

  function render() {
    const frame = currentFrame() ?? idleState();
    const overrides = new Map();
    const labels = new Map();
    const trackingItems = parseTrackingItems(frame.tracking);

    trackingItems.forEach(({ cell, dist }) => {
      overrides.set(cellKey(cell[0], cell[1]), CELL_STATE.VISITED);
      if (dist != null) labels.set(cellKey(cell[0], cell[1]), String(dist));
    });
    (frame.neighbours ?? []).forEach((cell) => {
      overrides.set(cellKey(cell[0], cell[1]), CELL_STATE.NEIGHBOUR);
    });
    if (frame.node) {
      overrides.set(cellKey(frame.node[0], frame.node[1]), CELL_STATE.CURRENT);
    }
    if (frame.reached && frame.done && target) {
      overrides.set(cellKey(target[0], target[1]), CELL_STATE.PATH);
    }
    grid.setOverrides(overrides);
    if (typeof grid.setLabels === "function") grid.setLabels(labels);

    panels.innerHTML =
      renderManpacBagPanel({
        items: frame.bag ?? [],
        pick: frame.bagPick ?? null,
        pickDone: frame.bagPickDone ?? null,
        footer: bagFooter,
      }) + renderManpacTrackingPanel(trackingItems);

    if (statusOverride) {
      status.textContent = statusOverride;
      status.classList.toggle("ht-play-status-warn", true);
      status.classList.toggle("ht-play-status-ok", false);
    } else {
      status.textContent = frame.message;
      status.classList.toggle("ht-play-status-warn", false);
      status.classList.toggle("ht-play-status-ok", !!frame.reached && !!frame.done);
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
    if (/while\s+bag\s*:\s*\n\s*pass\s*$/.test(userSrc) || /while\s+bag\s*:\s*$/.test(userSrc)) {
      statusOverride = "The loop body is empty — drop the steps inside `while bag:`.";
      frames = [];
      frameIndex = -1;
      return false;
    }

    compiling = true;
    statusOverride = null;
    status.textContent = "Loading Python runtime…";
    status.classList.remove("ht-play-status-warn", "ht-play-status-ok");
    renderControls();

    try {
      const pyodide = await getPyodide();
      status.textContent = "Running your code…";
      const harness = buildManpacTraversalHarness(matrix, start, target, userSrc);
      const rawJson = await pyodide.runPythonAsync(harness);
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));

      if (payload?.error === "TOO_MANY_ITERS") {
        statusOverride =
          "Loop ran too long — did you forget to track cells, or break on the target?";
        frames = eventsToManpacFrames(payload.events ?? [], start, target);
        frameIndex = frames.length ? 0 : -1;
        return frames.length > 0;
      }
      if (payload?.error) {
        statusOverride = "Error running code: " + payload.error;
        frames = [];
        frameIndex = -1;
        return false;
      }

      frames = eventsToManpacFrames(payload.events ?? [], start, target);
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
  getPyodide().catch(() => {});

  return { play, step: stepForward, reset, destroy: () => stopPlayback() };
}
