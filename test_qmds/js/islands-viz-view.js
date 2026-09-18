// islands-viz-view.js
// Right-hand panel for the islands exercise: mounts a graph, runs the
// student's assembled Python (via Pyodide) with instrumentation, and
// animates node / neighbor highlights plus a growing visited set.

import { mountGraphView } from "./utils/graph-view.js";
import { getPyodide } from "./utils/pyodide-loader.js";
import { createPlaybackTimer } from "./utils/frame-playback.js";

/** Build a Python adjacency dict literal from the engine (integer node ids). */
function buildGraphLiteral(engine) {
  const ids = [...engine.nodes.keys()].map(Number).sort((a, b) => a - b);
  const lines = ids.map((id) => {
    const key = String(id);
    const nbs = engine
      .getNeighbours(key)
      .map((n) => Number(n.id))
      .sort((a, b) => a - b);
    return `        ${id}: [${nbs.join(", ")}],`;
  });
  return "{\n" + lines.join("\n") + "\n    }";
}

/**
 * Instrument student Python so visits / focus events are recorded.
 * Known patterns come from the code-blocks vocabulary.
 */
function instrumentPython(src) {
  const lines = src.split("\n");
  const out = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (/^\s*visited\s*=\s*set\(\)\s*$/.test(trimmed)) {
      out.push(trimmed.replace(/set\(\)/, "_TraceSet()"));
      continue;
    }

    if (/^\s*count\s*\+=\s*1\s*$/.test(trimmed)) {
      const indent = trimmed.match(/^(\s*)/)[1];
      out.push(`${indent}count += 1`);
      out.push(`${indent}_bump_count(count)`);
      continue;
    }

    out.push(trimmed);

    const dfs = trimmed.match(/^(\s*)def\s+dfs\s*\(\s*node\s*\)\s*:\s*$/);
    if (dfs) {
      out.push(`${dfs[1]}    _probe_node(node)`);
      continue;
    }

    const forNode = trimmed.match(/^(\s*)for\s+node\s+in\s+range\s*\(\s*n\s*\)\s*:\s*$/);
    if (forNode) {
      out.push(`${forNode[1]}    _probe_node(node)`);
      continue;
    }

    const forNb = trimmed.match(
      /^(\s*)for\s+neighbor\s+in\s+graph\s*\[\s*node\s*\]\s*:\s*$/
    );
    if (forNb) {
      out.push(`${forNb[1]}    _probe_neighbor(neighbor)`);
    }
  }

  return out.join("\n");
}

function buildHarness(engine, userSrc) {
  const n = engine.nodes.size;
  const graphLit = buildGraphLiteral(engine);
  const body = instrumentPython(userSrc);
  const indentedBody = body
    .split("\n")
    .map((l) => (l.length ? "    " + l : l))
    .join("\n");

  return `
import sys
sys.setrecursionlimit(3000)

_events = []
_state = {"count": 0, "node": None, "neighbor": None, "visited": None}

def _norm(x):
    try:
        return int(x)
    except Exception:
        return x

def _snapshot_visited():
    v = _state["visited"]
    return sorted(v) if v is not None else []

class _TraceSet(set):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _state["visited"] = self
    def add(self, item):
        item = _norm(item)
        super().add(item)
        _events.append({
            "type": "visit",
            "node": item,
            "neighbor": _state["neighbor"],
            "visited": _snapshot_visited(),
            "count": _state["count"],
        })

def _probe_node(node):
    node = _norm(node)
    _state["node"] = node
    _state["neighbor"] = None
    _events.append({
        "type": "focus_node",
        "node": node,
        "neighbor": None,
        "visited": _snapshot_visited(),
        "count": _state["count"],
    })

def _probe_neighbor(neighbor):
    neighbor = _norm(neighbor)
    _state["neighbor"] = neighbor
    _events.append({
        "type": "focus_neighbor",
        "node": _state["node"],
        "neighbor": neighbor,
        "visited": _snapshot_visited(),
        "count": _state["count"],
    })

def _bump_count(c):
    _state["count"] = int(c)
    _events.append({
        "type": "count",
        "node": _state["node"],
        "neighbor": _state["neighbor"],
        "visited": _snapshot_visited(),
        "count": _state["count"],
    })

n = ${n}
graph = ${graphLit}
_result = None

try:
${indentedBody}
    _result = count
except NameError:
    _result = _state["count"]
except RecursionError:
    _result = "RECURSION_ERROR"

import json
json.dumps({"result": _result, "events": _events})
`.trim();
}

/**
 * @param {HTMLElement} container
 * @param {import("./graph-engine.js").GraphEngine} engine
 * @param {{getPython: () => string, width?: number, height?: number, stepDelayMs?: number}} options
 */
export function mountIslandsVizView(container, engine, options = {}) {
  if (!container) return;

  const getPython = options.getPython ?? (() => "");
  const stepDelayMs = options.stepDelayMs ?? 750;
  const width = options.width ?? 420;
  const height = options.height ?? 280;

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("iv-root");

  // ---- header: island counter (top right) ----
  const header = document.createElement("div");
  header.className = "iv-header";

  const title = document.createElement("div");
  title.className = "adj-heading";
  title.textContent = "Traversal";
  header.appendChild(title);

  const counter = document.createElement("div");
  counter.className = "iv-counter";
  counter.innerHTML = `<span class="iv-counter-label">islands</span><span class="iv-counter-value">0</span>`;
  header.appendChild(counter);
  container.appendChild(header);

  // ---- graph ----
  const graphEl = document.createElement("div");
  graphEl.className = "iv-graph";
  container.appendChild(graphEl);

  mountGraphView(engine, graphEl, {
    width,
    height,
    showToolbar: false,
    caption: "Watch node / neighbor as the code runs",
  });

  // ---- current variables ----
  const varsEl = document.createElement("div");
  varsEl.className = "iv-vars";
  varsEl.innerHTML = `
    <div class="iv-var">
      <span class="iv-var-name">node</span>
      <span class="iv-var-value iv-var-node adj-box adj-key">—</span>
    </div>
    <div class="iv-var">
      <span class="iv-var-name">neighbor</span>
      <span class="iv-var-value iv-var-neighbor adj-box adj-val">—</span>
    </div>
  `;
  container.appendChild(varsEl);

  // ---- visited set display ----
  const visitedPanel = document.createElement("div");
  visitedPanel.className = "iv-visited";
  const visitedHeading = document.createElement("div");
  visitedHeading.className = "cb-section-label";
  visitedHeading.textContent = "visited";
  visitedPanel.appendChild(visitedHeading);
  const visitedBody = document.createElement("div");
  visitedBody.className = "iv-visited-body";
  visitedBody.innerHTML = `<span class="adj-empty">empty set()</span>`;
  visitedPanel.appendChild(visitedBody);
  container.appendChild(visitedPanel);

  // ---- status + controls ----
  const status = document.createElement("div");
  status.className = "iv-status";
  status.textContent = "Assemble your plan, then press Play or Step to animate the traversal.";
  container.appendChild(status);

  const controls = document.createElement("div");
  controls.className = "cb-controls iv-controls";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "cb-btn iv-run";
  playBtn.textContent = "Play";

  const stepBtn = document.createElement("button");
  stepBtn.type = "button";
  stepBtn.className = "cb-btn";
  stepBtn.textContent = "Step \u2192";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "cb-btn";
  resetBtn.textContent = "Reset";

  controls.append(playBtn, stepBtn, resetBtn);
  container.appendChild(controls);

  // Internal mirror of Python's visited set, rendered per-frame — every
  // recorded event already carries a full snapshot (see buildHarness), so
  // any frame can be rendered directly without replaying prior ones.
  const visited = new Set();
  let islandCount = 0;
  let frames = [];
  let frameIndex = -1; // -1 = idle (nothing run yet)
  const playback = createPlaybackTimer();
  let compiling = false;
  let statusOverride = null;

  const nodeValueEl = varsEl.querySelector(".iv-var-node");
  const neighborValueEl = varsEl.querySelector(".iv-var-neighbor");
  const counterValueEl = counter.querySelector(".iv-counter-value");

  function labelOf(id) {
    if (id == null) return "—";
    const key = String(id);
    return engine.nodes.get(key)?.label ?? key;
  }

  function renderVisited() {
    visitedBody.innerHTML = "";
    if (visited.size === 0) {
      const empty = document.createElement("span");
      empty.className = "adj-empty";
      empty.textContent = "empty set()";
      visitedBody.appendChild(empty);
      return;
    }
    [...visited]
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((id) => {
        const chip = document.createElement("span");
        chip.className = "adj-box adj-val iv-visited-chip";
        chip.textContent = labelOf(id);
        visitedBody.appendChild(chip);
      });
  }

  function renderVars(node, neighbor) {
    nodeValueEl.textContent = labelOf(node);
    neighborValueEl.textContent = labelOf(neighbor);
    nodeValueEl.classList.toggle("adj-selected", node != null);
    neighborValueEl.classList.toggle("iv-neighbor-active", neighbor != null);
  }

  function renderCounter() {
    counterValueEl.textContent = String(islandCount);
  }

  function syncEngineViz(node, neighbor) {
    const activeEdges = new Set();
    if (node != null && neighbor != null) {
      const eid = engine.findEdgeId(String(node), String(neighbor));
      if (eid) activeEdges.add(eid);
    }
    engine.setViz({
      visited: [...visited].map(String),
      currentNode: node != null ? String(node) : null,
      currentNeighbor: neighbor != null ? String(neighbor) : null,
      activeEdges,
    });
  }

  function resetVisuals() {
    visited.clear();
    islandCount = 0;
    renderVisited();
    renderVars(null, null);
    renderCounter();
    engine.clearViz();
    engine.clearSelection();
  }

  /** Apply one recorded event's full snapshot (idempotent — safe to call for any frame in isolation). */
  function applyEvent(ev) {
    if (Array.isArray(ev.visited)) {
      visited.clear();
      ev.visited.forEach((id) => visited.add(String(id)));
    }
    if (typeof ev.count === "number") {
      islandCount = ev.count;
    }

    const node = ev.node != null ? ev.node : null;
    const neighbor = ev.neighbor != null ? ev.neighbor : null;

    if (ev.type === "visit" && ev.node != null) {
      visited.add(String(ev.node));
    }

    renderVisited();
    renderVars(node, neighbor);
    renderCounter();
    syncEngineViz(node, neighbor);
  }

  function stopPlayback() {
    playback.stop();
  }

  function currentFrame() {
    if (frameIndex < 0 || frameIndex >= frames.length) return null;
    return frames[frameIndex];
  }

  /** Run the student's current plan through Pyodide and record every step as a frame. */
  async function compileFrames() {
    const userSrc = (getPython() || "").trim();
    if (!userSrc) {
      statusOverride = "Your plan is empty — drag some blocks in first.";
      frames = [];
      frameIndex = -1;
      return false;
    }

    compiling = true;
    statusOverride = null;
    status.textContent = "Loading Python runtime…";
    status.className = "iv-status";
    renderControls();

    try {
      const harness = buildHarness(engine, userSrc);
      const pyodide = await getPyodide();
      status.textContent = "Running your code…";

      const rawJson = await pyodide.runPythonAsync(harness);
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));

      const result = payload?.result;
      const events = Array.isArray(payload?.events) ? payload.events : [];

      frames = events.map((ev) => ({ ...ev, done: false }));
      frames.push({ done: true, result });
      frameIndex = -1;
      statusOverride = null;
      return true;
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

  function render() {
    const frame = currentFrame();

    if (frameIndex < 0) {
      resetVisuals();
    } else if (frame && !frame.done) {
      applyEvent(frame);
    } else if (frame?.done) {
      renderVars(null, null);
      engine.setViz({
        visited: [...visited].map(String),
        currentNode: null,
        currentNeighbor: null,
        activeEdges: [],
      });
    }

    if (statusOverride) {
      status.textContent = statusOverride;
      status.className = "iv-status iv-status-error";
    } else if (frameIndex < 0) {
      status.textContent = "Assemble your plan, then press Play or Step to animate the traversal.";
      status.className = "iv-status";
    } else if (frame?.done) {
      const result = frame.result;
      if (result === "RECURSION_ERROR") {
        status.innerHTML =
          "Infinite recursion — did you forget to mark the node visited, or skip the <code>if neighbor not in visited</code> guard?";
        status.className = "iv-status iv-status-error";
      } else if (result == null) {
        status.textContent = "Finished, but no count was produced.";
        status.className = "iv-status iv-status-error";
      } else {
        islandCount = Number(result);
        renderCounter();
        status.innerHTML = `Done — your code returned <strong>${result}</strong> island${
          Number(result) === 1 ? "" : "s"
        }.`;
        status.className = "iv-status iv-status-ok";
      }
    } else {
      status.textContent = "Running your code…";
      status.className = "iv-status";
    }

    renderControls();
  }

  async function play() {
    const atEnd = frames.length > 0 && frameIndex >= frames.length - 1;
    const needCompile = !frames.length || atEnd || frameIndex < 0;
    if (needCompile) {
      const ok = await compileFrames();
      if (!ok || !frames.length) {
        render();
        return;
      }
      frameIndex = 0;
    }
    playback.start();
    render();

    const tick = () => {
      if (!playback.isPlaying()) return;
      if (frameIndex >= frames.length - 1) {
        stopPlayback();
        render();
        return;
      }
      frameIndex += 1;
      render();
      if (playback.isPlaying() && frameIndex < frames.length - 1) {
        playback.schedule(tick, stepDelayMs);
      } else {
        stopPlayback();
        render();
      }
    };
    playback.schedule(tick, stepDelayMs);
  }

  function pause() {
    stopPlayback();
    render();
  }

  async function stepForward() {
    const atEnd = frames.length > 0 && frameIndex >= frames.length - 1;
    const needCompile = !frames.length || atEnd || frameIndex < 0;
    if (needCompile) {
      const ok = await compileFrames();
      if (!ok) {
        render();
        return;
      }
      frameIndex = 0;
      render();
      return;
    }
    if (frameIndex < frames.length - 1) {
      frameIndex += 1;
    }
    render();
  }

  function reset() {
    stopPlayback();
    frames = [];
    frameIndex = -1;
    statusOverride = null;
    render();
  }

  function renderControls() {
    playBtn.textContent = compiling ? "Loading…" : playback.isPlaying() ? "Pause" : "Play";
    playBtn.disabled = compiling;
    stepBtn.disabled = compiling;
  }

  playBtn.addEventListener("click", () => {
    if (playback.isPlaying()) pause();
    else play();
  });

  stepBtn.addEventListener("click", () => {
    stopPlayback();
    stepForward();
  });

  resetBtn.addEventListener("click", () => reset());

  render();

  // Warm Pyodide in the background.
  getPyodide().catch(() => {});

  return {
    play,
    pause,
    step: stepForward,
    reset,
    getVisited: () => new Set(visited),
  };
}
