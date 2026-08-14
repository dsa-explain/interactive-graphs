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
