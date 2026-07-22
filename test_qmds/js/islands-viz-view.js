// islands-viz-view.js
// Right-hand panel for the islands exercise: mounts a graph, runs the
// student's assembled Python (via Pyodide) with instrumentation, and
// animates node / neighbor highlights plus a growing visited set.

import { mountGraphView } from "./graph-view.js";

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  status.textContent = "Assemble your plan, then Run to animate the traversal.";
  container.appendChild(status);

  const controls = document.createElement("div");
  controls.className = "cb-controls iv-controls";

  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "cb-btn iv-run";
  runBtn.textContent = "Run";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "cb-btn";
  resetBtn.textContent = "Clear highlights";

  controls.append(runBtn, resetBtn);
  container.appendChild(controls);

  // Internal mirror of Python's visited set (grows during playback).
  const visited = new Set();
  let islandCount = 0;
  let cancelPlayback = false;
  let playing = false;

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

  async function playEvents(events) {
    cancelPlayback = false;
    for (const ev of events) {
      if (cancelPlayback) break;
      applyEvent(ev);
      await sleep(stepDelayMs);
    }
  }

  async function run() {
    if (playing) return;
    playing = true;
    runBtn.disabled = true;
    runBtn.textContent = "Loading…";
    status.textContent = "Loading Python runtime…";
    status.className = "iv-status";

    resetVisuals();

    try {
      const userSrc = (getPython() || "").trim();
      if (!userSrc) {
        status.textContent = "Your plan is empty — drag some blocks in first.";
        status.className = "iv-status iv-status-error";
        return;
      }

      const harness = buildHarness(engine, userSrc);
      const pyodide = await getPyodide();
      runBtn.textContent = "Running…";
      status.textContent = "Running your code…";

      const rawJson = await pyodide.runPythonAsync(harness);
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));

      const result = payload?.result;
      const events = Array.isArray(payload?.events) ? payload.events : [];

      runBtn.textContent = "Animating…";
      await playEvents(events);

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
        // Leave final visited highlight; clear transient focus.
        engine.setViz({
          visited: [...visited].map(String),
          currentNode: null,
          currentNeighbor: null,
          activeEdges: [],
        });
        renderVars(null, null);
      }
    } catch (err) {
      console.error(err);
      status.textContent = "Error running code: " + String(err);
      status.className = "iv-status iv-status-error";
    } finally {
      playing = false;
      runBtn.disabled = false;
      runBtn.textContent = "Run";
    }
  }

  runBtn.addEventListener("click", () => {
    cancelPlayback = true;
    run();
  });

  resetBtn.addEventListener("click", () => {
    cancelPlayback = true;
    resetVisuals();
    status.textContent = "Assemble your plan, then Run to animate the traversal.";
    status.className = "iv-status";
  });

  // Warm Pyodide in the background.
  getPyodide().catch(() => {});

  return {
    run,
    reset: resetVisuals,
    getVisited: () => new Set(visited),
  };
}
