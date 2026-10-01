// dominoes-helpers.js
// Typed "can these tiles form a chain?" exercise for count-islands.qmd.
// Numbers are vertices; each domino is an undirected edge. A line of tiles
// is an Eulerian path: the graph must be connected, with 0 or 2 odd-degree
// vertices. Play / Step traces the student's can_form_chain line by line.

import { mountStaticGraphView } from "./qmd-specific-utils/static-graph-view.js";
import { getPyodide } from "./utils/pyodide-loader.js";
import { formatCapturedOutput } from "./utils/py-harness-utils.js";
import { createPlaybackTimer } from "./utils/frame-playback.js";
import { renderChipsHtml, renderChipPanelShell } from "./utils/chip-panels.js";

/** Sample tiles: a triangle with a tail — connected, two odd-degree numbers. */
export const DOMINOES = [
  [1, 2],
  [2, 3],
  [3, 1],
  [1, 4],
];

export function createDominoesGraphData() {
  return {
    nodes: [
      { id: "1", label: "1", x: 90, y: 110 },
      { id: "2", label: "2", x: 220, y: 50 },
      { id: "3", label: "3", x: 220, y: 170 },
      { id: "4", label: "4", x: 90, y: 210 },
    ],
    edges: [
      { id: "1—2", source: "1", target: "2" },
      { id: "2—3", source: "2", target: "3" },
      { id: "3—1", source: "3", target: "1" },
      { id: "1—4", source: "1", target: "4" },
    ],
  };
}

function formatDominoesLiteral(dominoes) {
  const inner = (dominoes ?? []).map(([a, b]) => `(${a}, ${b})`).join(", ");
  return `[${inner}]`;
}

export function referenceCanFormChain(dominoes) {
  if (!dominoes?.length) return true;
  const adj = new Map();
  const degree = new Map();
  const bump = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
    degree.set(a, (degree.get(a) ?? 0) + 1);
  };
  for (const [a, b] of dominoes) {
    const x = String(a);
    const y = String(b);
    bump(x, y);
    bump(y, x);
  }
  const nodes = [...degree.keys()];
  const seen = new Set();
  const stack = [nodes[0]];
  while (stack.length) {
    const u = stack.pop();
    if (seen.has(u)) continue;
    seen.add(u);
    for (const v of adj.get(u) ?? []) {
      if (!seen.has(v)) stack.push(v);
    }
  }
  if (seen.size !== nodes.length) return false;
  const odd = nodes.filter((n) => (degree.get(n) ?? 0) % 2 === 1).length;
  return odd === 0 || odd === 2;
}

export function dominoesStarterCode(dominoes = DOMINOES) {
  return `from collections import defaultdict

dominoes = ${formatDominoesLiteral(dominoes)}

def can_form_chain(dominoes):
    # Return True if the tiles can be laid in a line so touching
    # halves show the same number. Return False otherwise.
    # Think of each number as a node and each tile as an edge.

    pass
`;
}

export function dominoesSolutionCode(dominoes = DOMINOES) {
  return `from collections import defaultdict

dominoes = ${formatDominoesLiteral(dominoes)}

def can_form_chain(dominoes):
    if not dominoes:
        return True

    graph = defaultdict(list)
    degree = defaultdict(int)

    for a, b in dominoes:
        graph[a].append(b)
        graph[b].append(a)
        degree[a] += 1
        degree[b] += 1

    # 1. Connectivity check (only over numbers that actually appear)
    start = next(iter(degree))
    visited = set()

    def dfs(node):
        visited.add(node)
        for nxt in graph[node]:
            if nxt not in visited:
                dfs(nxt)

    dfs(start)
    if visited != set(degree.keys()):
        return False

    # 2. Odd-degree check (an Eulerian path needs 0 or 2 odd-degree vertices)
    odd_count = sum(1 for d in degree.values() if d % 2 == 1)
    return odd_count in (0, 2)
`;
}

function isSkippableLine(src, lineNumber) {
  if (lineNumber == null) return false;
  const line = (src.split("\n")[lineNumber - 1] ?? "").trim();
  return line === "" || line.startsWith("#");
}

function buildDominoesHarness(dominoes, userSrc) {
  const srcLit = JSON.stringify(userSrc ?? "");
  const tilesLit = JSON.stringify(dominoes);

  return `
import json
import sys
import io
import traceback

_user_src = ${srcLit}
_MAX_EVENTS = 400
_frames = []
_error = None
_pending_line = None
_result = None
_stdout = io.StringIO()
_stderr = io.StringIO()

def _as_visited(val):
    if val is None:
        return []
    try:
        return [str(x) for x in list(val)]
    except Exception:
        return []

def _as_degree(val):
    out = {}
    if val is None:
        return out
    try:
        items = val.items() if hasattr(val, "items") else []
        for k, v in items:
            try:
                out[str(k)] = int(v)
            except Exception:
                continue
    except Exception:
        return {}
    return out

def _as_cell(val):
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, (int, float)):
        return str(int(val))
    if isinstance(val, (list, dict, set, tuple)):
        return None
    s = str(val)
    return s if s else None

def _ns_of(frame):
    merged = {}
    merged.update(frame.f_globals)
    chain = []
    f = frame
    while f is not None:
        if f.f_code.co_filename == "<user>":
            chain.append(f)
        f = f.f_back
    for f in reversed(chain):
        merged.update(f.f_locals)
    return merged

def _json_result(val):
    if isinstance(val, bool):
        return val
    if val is None:
        return None
    return str(val)

def _snapshot(ns, line, done=False, loc=None):
    degree = _as_degree(ns.get("degree"))
    show_odd = done or "odd_count" in ns
    odd = [k for k, d in degree.items() if d % 2 == 1] if show_odd else []
    # node / nxt must come from the innermost frame only — otherwise a recursive
    # dfs() inherits the caller's nxt and paints an already-visited neighbour.
    loc = loc if loc is not None else ns
    current = _as_cell(loc.get("node"))
    neighbor = _as_cell(loc.get("nxt"))
    if neighbor is None:
        neighbor = _as_cell(loc.get("neighbor"))
    if neighbor is not None and neighbor == current:
        neighbor = None
    return {
        "line": line,
        "visited": _as_visited(ns.get("visited")),
        "degree": degree,
        "odd": odd,
        "odd_count": ns["odd_count"] if "odd_count" in ns and isinstance(ns.get("odd_count"), int) else None,
        "current": current,
        "neighbor": neighbor,
        "done": bool(done),
        "result": _json_result(_result),
        "stdout": _stdout.getvalue(),
        "stderr": _stderr.getvalue(),
    }

def _emit(line, ns, done=False, loc=None):
    _frames.append(_snapshot(ns, line, done, loc))

def _tracer(frame, event, arg):
    global _pending_line, _result
    if event == "call":
        return _tracer if frame.f_code.co_filename == "<user>" else None
    if frame.f_code.co_filename != "<user>":
        return None
    if event == "return":
        if frame.f_code.co_name == "can_form_chain":
            _result = arg
        if _pending_line is not None:
            _emit(_pending_line, _ns_of(frame), loc=frame.f_locals)
            _pending_line = None
        return _tracer
    if event != "line":
        return _tracer
    if len(_frames) >= _MAX_EVENTS:
        raise RuntimeError("TOO_MANY_ITERS")
    ns = _ns_of(frame)
    if _pending_line is not None:
        _emit(_pending_line, ns, loc=frame.f_locals)
    _pending_line = frame.f_lineno
    return _tracer

_tiles = ${tilesLit}
_old_out, _old_err = sys.stdout, sys.stderr
_ns = {"dominoes": [tuple(t) for t in _tiles], "__name__": "__main__"}
try:
    sys.stdout = _stdout
    sys.stderr = _stderr
    _code = compile(_user_src, "<user>", "exec")
    exec(_code, _ns)
    fn = _ns.get("can_form_chain")
    if not callable(fn):
        raise RuntimeError("Define a can_form_chain(dominoes) function.")
    tiles = [tuple(t) for t in _tiles]
    sys.settrace(_tracer)
    try:
        try:
            _result = fn(tiles)
        except TypeError:
            _result = fn()
    finally:
        sys.settrace(None)
    if _frames:
        last = dict(_frames[-1])
        last["line"] = None
        last["done"] = True
        last["current"] = None
        last["neighbor"] = None
        last["result"] = _json_result(_result)
        last["stdout"] = _stdout.getvalue()
        last["stderr"] = _stderr.getvalue()
        degree = last.get("degree") or {}
        last["odd"] = [k for k, d in degree.items() if int(d) % 2 == 1]
        _frames.append(last)
    else:
        _emit(None, _ns, done=True)
except RuntimeError as e:
    if str(e) == "TOO_MANY_ITERS":
        _error = "TOO_MANY_ITERS"
        _emit(None, _ns, done=True)
    else:
        _error = type(e).__name__ + ": " + str(e)
        traceback.print_exc(file=_stderr)
except Exception as e:
    _error = type(e).__name__ + ": " + str(e)
    traceback.print_exc(file=_stderr)
    if _pending_line is not None:
        _emit(_pending_line, _ns)
finally:
    sys.stdout = _old_out
    sys.stderr = _old_err

json.dumps({
    "frames": _frames,
    "error": _error,
    "result": _json_result(_result),
    "stdout": _stdout.getvalue(),
    "stderr": _stderr.getvalue(),
})
`.trim();
}

function normalizeChainResult(value) {
  if (value === true || value === false) return value;
  if (value === "True" || value === "true") return true;
  if (value === "False" || value === "false") return false;
  return null;
}

function sameList(a, b) {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}

function sameDegree(a, b) {
  return JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
}

function renderVisitedPanel(items) {
  const sorted = [...(items ?? [])]
    .map(String)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
  const chips = renderChipsHtml(sorted, {
    chipClass: "adj-box adj-val iv-visited-chip",
    labelOf: (id) => String(id),
    emptyClass: "adj-empty",
    emptyText: "empty set()",
  });
  return renderChipPanelShell({
    wrapperClass: "iv-visited",
    ariaLabel: "Visited",
    headerClass: "cb-section-label",
    titleClass: "cb-section-label",
    title: "visited",
    bodyClass: "iv-visited-body",
    bodyHtml: chips,
  });
}

function renderDegreePanel(degree, oddIds) {
  const odd = oddIds instanceof Set ? oddIds : new Set(oddIds ?? []);
  const items = Object.entries(degree ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]) || String(a[0]).localeCompare(String(b[0])))
    .map(([id, deg]) => ({ id, deg, odd: odd.has(id) }));
  const chips = renderChipsHtml(items, {
    chipClass: "adj-box adj-key",
    classFor: (item) => (item.odd ? " dm-odd-chip" : ""),
    labelOf: (item) => `${item.id}:${item.deg}`,
    emptyClass: "adj-empty",
    emptyText: "no degrees yet",
  });
  return renderChipPanelShell({
    wrapperClass: "iv-visited",
    ariaLabel: "Degree",
    headerClass: "cb-section-label",
    titleClass: "cb-section-label",
    title: "degree",
    bodyClass: "iv-visited-body",
    bodyHtml: chips,
  });
}

/**
 * Right-hand viz for the typed dominoes exercise: number graph, visited /
 * degree chips, and Play / Pause. Locks the Python editor while playing.
 *
 * @param {HTMLElement} container
 * @param {{
 *   editor?: object,
 *   dominoes?: number[][],
 *   graph?: {nodes: Array, edges: Array},
 *   getCode?: () => string,
 *   width?: number, height?: number,
 *   stepDelayMs?: number, skipDelayMs?: number,
 * }} [options]
 */
export function mountDominoesViz(container, options = {}) {
  if (!container) return null;

  const editor = options.editor ?? null;
  const getCode = options.getCode ?? (() => editor?.getCode?.() ?? "");
  const dominoes = options.dominoes ?? DOMINOES;
  const graph = options.graph ?? createDominoesGraphData();
  const width = options.width ?? 400;
  const height = options.height ?? 260;
  const stepDelayMs = options.stepDelayMs ?? 550;
  const skipDelayMs = options.skipDelayMs ?? 160;
  const expected = referenceCanFormChain(dominoes);

  container.innerHTML = "";
  container.classList.remove("cb-viz-placeholder");
  container.classList.add("iv-root", "dm-viz-root");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Domino graph";
  container.appendChild(heading);

  const graphMount = document.createElement("div");
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
  let frameIndex = -1;
  const playback = createPlaybackTimer();
  let compiling = false;
  let statusOverride = null;
  let lastOutput = { text: "", isError: false };

  function stopPlayback() {
    playback.stop();
  }

  function currentFrame() {
    if (frameIndex < 0 || frameIndex >= frames.length) return null;
    return frames[frameIndex];
  }

  function idleState() {
    return {
      line: null,
      visited: [],
      degree: {},
      odd: [],
      current: null,
      neighbor: null,
      done: false,
      result: null,
      correct: null,
      unchanged: false,
      stdout: "",
      stderr: "",
      message: "Write can_form_chain, then press Play or Step.",
    };
  }

  function nodeColorsFor(frame) {
    if (!frame.done && !(frame.odd ?? []).length) return {};
    const colors = {};
    const visited = new Set((frame.visited ?? []).map(String));
    const odd = new Set((frame.odd ?? []).map(String));
    for (const n of graph.nodes) {
      if (odd.has(n.id)) colors[n.id] = "orange";
      else if (visited.has(n.id)) colors[n.id] = "black";
      else colors[n.id] = "white";
    }
    return colors;
  }

  function render() {
    const frame = currentFrame() ?? idleState();
    const colors = nodeColorsFor(frame);
    const visitedSet = new Set((frame.visited ?? []).map(String));
    const neighbor =
      frame.neighbor != null && String(frame.neighbor) !== String(frame.current ?? "")
        ? String(frame.neighbor)
        : null;
    const unvisitedNeighbour =
      neighbor != null && !visitedSet.has(neighbor) ? [neighbor] : [];
    const visitedNeighbour =
      neighbor != null && visitedSet.has(neighbor) ? [neighbor] : [];
    mountStaticGraphView(graphMount, graph, {
      width,
      height,
      directed: false,
      caption: "Each number is a node; each tile is an edge.",
      highlight: {
        visited: frame.visited ?? [],
        current: frame.current,
        neighbours: unvisitedNeighbour,
        visitedNeighbours: visitedNeighbour,
        nodeColors: colors,
      },
    });

    panels.innerHTML =
      renderVisitedPanel(frame.visited ?? []) +
      renderDegreePanel(frame.degree ?? {}, frame.odd ?? []);

    if (statusOverride) {
      status.textContent = statusOverride;
      status.classList.toggle("ht-play-status-warn", true);
      status.classList.toggle("ht-play-status-ok", false);
    } else {
      status.textContent = frame.message;
      status.classList.toggle("ht-play-status-warn", frame.correct === false);
      status.classList.toggle("ht-play-status-ok", frame.correct === true);
    }

    if (editor) {
      if (frame.line != null) editor.highlightLine(frame.line);
      else editor.clearLineHighlight?.();
      const hasFrame = currentFrame() != null;
      const live = formatCapturedOutput(frame.stdout, frame.stderr);
      if (hasFrame) {
        editor.setStdout?.(live, { isError: !!frame.stderr });
      } else if (lastOutput.text) {
        editor.setStdout?.(lastOutput.text, { isError: lastOutput.isError });
      } else {
        editor.clearStdout?.();
      }
    }

    renderControls();
  }

  function toVizFrames(src, rawFrames, result) {
    const out = [];
    let prev = { visited: [], degree: {}, odd: [], current: null, neighbor: null };
    const answer = normalizeChainResult(result);
    const correct = answer === expected;

    for (const ev of rawFrames ?? []) {
      if (isSkippableLine(src, ev.line)) continue;
      const visited = ev.visited ?? [];
      const degree = ev.degree ?? {};
      const odd = ev.odd ?? [];
      const current = ev.current ?? null;
      const neighbor = ev.neighbor ?? null;
      const done = !!ev.done;
      const unchanged =
        !done &&
        sameList(visited, prev.visited) &&
        sameDegree(degree, prev.degree) &&
        sameList(odd, prev.odd) &&
        current === prev.current &&
        neighbor === prev.neighbor;

      let message;
      if (done) {
        if (answer == null) {
          message = "Finished — return True or False.";
        } else if (correct) {
          message = answer
            ? "Congratulations — these tiles can form a chain."
            : "Correct — these tiles cannot form a chain.";
        } else {
          message = "The output doesn't look correct.";
        }
      } else if (odd.length) {
        message =
          odd.length === 1
            ? `Odd degree at ${odd[0]}.`
            : `Odd-degree numbers: ${odd.join(", ")}.`;
      } else if (neighbor != null && current != null) {
        message = `From ${current} looking at ${neighbor}.`;
      } else if (current != null) {
        message = `Visiting ${current}.`;
      } else if (visited.length) {
        message = `Visited ${visited.length} number${visited.length === 1 ? "" : "s"}.`;
      } else if (Object.keys(degree).length) {
        message = "Building the graph of numbers.";
      } else if (ev.line != null) {
        message = `Running line ${ev.line}…`;
      } else {
        message = "";
      }

      out.push({
        line: ev.line ?? null,
        visited,
        degree,
        odd,
        current,
        neighbor,
        done,
        result: answer,
        correct: done ? correct : null,
        unchanged,
        stdout: ev.stdout ?? "",
        stderr: ev.stderr ?? "",
        message,
      });
      prev = { visited, degree, odd, current, neighbor };
    }
    return out;
  }

  async function compileFrames() {
    const userSrc = (getCode() || "").trim();
    if (!userSrc) {
      statusOverride = "The editor is empty — write can_form_chain first.";
      frames = [];
      frameIndex = -1;
      return false;
    }
    if (!/\bdef\s+can_form_chain\s*\(/.test(userSrc)) {
      statusOverride = "Define a can_form_chain(dominoes) function.";
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
      const rawJson = await pyodide.runPythonAsync(buildDominoesHarness(dominoes, userSrc));
      const payload = JSON.parse(typeof rawJson === "string" ? rawJson : String(rawJson));
      const captured = formatCapturedOutput(payload.stdout, payload.stderr);
      lastOutput = { text: captured, isError: !!payload?.error };

      if (payload?.error === "TOO_MANY_ITERS") {
        statusOverride = "Loop ran too long — did the DFS forget to mark nodes visited?";
        frames = toVizFrames(userSrc, payload.frames ?? [], payload.result);
        frameIndex = frames.length ? 0 : -1;
        if (!frames.length && captured) editor?.setStdout?.(captured, { isError: true });
        return frames.length > 0;
      }
      if (payload?.error) {
        statusOverride = "Error running code: " + payload.error;
        frames = toVizFrames(userSrc, payload.frames ?? [], payload.result);
        frameIndex = frames.length ? 0 : -1;
        if (!frames.length) editor?.setStdout?.(captured || payload.error, { isError: true });
        return frames.length > 0;
      }

      frames = toVizFrames(userSrc, payload.frames ?? [], payload.result);
      frameIndex = -1;
      statusOverride = null;
      if (!frames.length) {
        statusOverride = "Nothing to play — add a body to can_form_chain.";
        if (captured) editor?.setStdout?.(captured);
        return false;
      }
      return true;
    } catch (err) {
      console.error(err);
      statusOverride = "Error running code: " + String(err);
      frames = [];
      frameIndex = -1;
      lastOutput = { text: String(err), isError: true };
      editor?.setStdout?.(String(err), { isError: true });
      return false;
    } finally {
      compiling = false;
    }
  }

  function delayForFrame(frame) {
    return frame?.unchanged ? skipDelayMs : stepDelayMs;
  }

  async function play() {
    const atEnd = frames.length > 0 && frameIndex >= frames.length - 1;
    const needCompile = !frames.length || atEnd || frameIndex < 0;
    if (needCompile) {
      editor?.lock();
      const ok = await compileFrames();
      if (!ok) {
        editor?.unlock();
        render();
        return;
      }
      frameIndex = 0;
    }
    editor?.lock();
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
        playback.schedule(tick, delayForFrame(frames[frameIndex]));
      } else {
        stopPlayback();
        render();
      }
    };
    playback.schedule(tick, delayForFrame(currentFrame()));
  }

  function pause() {
    stopPlayback();
    render();
  }

  async function stepForward() {
    const atEnd = frames.length > 0 && frameIndex >= frames.length - 1;
    const needCompile = !frames.length || atEnd || frameIndex < 0;
    if (needCompile) {
      editor?.lock();
      const ok = await compileFrames();
      if (!ok) {
        editor?.unlock();
        render();
        return;
      }
      frameIndex = 0;
      render();
      return;
    }
    editor?.lock();
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
    editor?.unlock();
    editor?.clearLineHighlight?.();
    render();
  }

  function renderControls() {
    controls.innerHTML = "";

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "ht-nav-btn";
    playBtn.textContent = compiling ? "Loading…" : playback.isPlaying() ? "Pause" : "Play";
    playBtn.disabled = compiling;
    playBtn.onclick = () => {
      if (playback.isPlaying()) pause();
      else play();
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

  return {
    play,
    pause,
    step: stepForward,
    reset,
    destroy: () => stopPlayback(),
  };
}
