# Interactive Graphs — Walkthrough

This walks through everything in `graph-files/`: a `GraphDisplay` class that owns all
graph-rendering concerns, and a Python code editor ("simulator") that is one of two
interchangeable ways to feed data into it.

```
graph-app.js  (composition root)
   ├── graph-display.js        -> class GraphDisplay        (the viewport + data + highlighting)
   │      └── graph-model.js   -> pure { nodes, edges } helpers, no DOM
   ├── python-editor-input.js  -> "input step" #1: Python code -> GraphDisplay
   │      └── py-graph-engine.js -> Pyodide + a tiny networkx-like `nx` shim
   └── graph-actions-panel.js  -> "input step" #2: buttons/inputs -> GraphDisplay

graph-display.css   -> styles owned by GraphDisplay's own viewport
styles.css           -> layout/chrome for the surrounding widget (editor, buttons, panels)
interactive-graph.qmd -> the Quarto page that mounts one GraphApp instance
```

The key design idea: **GraphDisplay never knows who is calling it.** Both the Python
editor and the button panel are just "input steps" that call the same public methods
(`addNode`, `highlightAdjacent`, `traversePath`, ...). You could add a third input step
(drag-and-drop, a form, voice commands, whatever) without touching `graph-display.js`
at all.

---

## 1. `GraphDisplay` — the class that owns everything display-related

Defined in `graph-display.js`, backed by the pure data helpers in `graph-model.js`.

### 1.1 `current` — the graph as a dictionary of nodes and edges

```js
this.current = { nodes: new Map(), edges: new Map() };
```

- `nodes` is keyed by node id (string) → `{ id, ...attrs }`.
- `edges` is keyed by an order-independent `edgeKey(u, v)` (from `graph-model.js`) →
  `{ source, target, weight, ...attrs }`. Edges are **undirected**, exactly like
  `networkx.Graph` — an edge `"A"-"B"` is the same edge no matter which side you call
  `source` or `target`.
- A separate `_adjacency` map (`id -> Set<neighborId>`) is kept alongside `current` so
  neighbor lookups (used by `highlightAdjacent` and node sizing) are O(1) instead of
  scanning every edge.

This is the "single source of truth". Every mutation method below updates `current`
first, then re-renders, then emits a `"change"` event — so anything (like the JSON
viewer) can stay in sync just by listening.

### 1.2 The viewport

The constructor builds an SVG-based force layout and exposes it as `display.viewport`
— a plain `<div class="gd-viewport">` you can append anywhere:

```js
import { GraphDisplay } from "./graph-display.js";

const display = new GraphDisplay({ d3: window.d3, width: 760, height: 520 });
document.getElementById("some-container").appendChild(display.viewport);
```

Internally it uses D3 v7 (`forceSimulation`, `forceLink`, `forceManyBody`,
`forceCenter`, `forceCollide`) and supports dragging nodes. Node radius and edge
stroke-width scale with degree/weight; an "No nodes yet." empty state shows when the
graph is empty. All of this is implementation detail — callers never touch D3 directly.

### 1.3 Public API

| Category | Method | Notes |
|---|---|---|
| Nodes | `addNode(id, attrs)` | Idempotent — creates or merges `attrs` into an existing node, like `nx.add_node`. |
| | `updateNode(id, attrs)` | Merges `attrs`; **throws** if the node doesn't exist. |
| | `deleteNode(id)` | Removes the node and every edge touching it. |
| Edges / relationships | `addEdge(source, target, attrs)` / `addRelationship(...)` (alias) | Auto-creates missing endpoint nodes; idempotent like nodes. `weight` defaults to `1`. |
| | `updateEdge(source, target, attrs)` | Merges `attrs`; **throws** if the edge doesn't exist. |
| | `deleteEdge(source, target)` | Removes the edge. |
| Bulk | `setGraph(json)` | Clears and rebuilds via `addNode`/`addEdge`, so it goes through the same code path as any manual call. |
| | `clearGraph()` / `toJSON()` | Wipe everything / read the graph back as plain `{ nodes, edges }` JSON. |
| Highlighting | `highlightNode(id, className?)` / `unhighlightNode(id, className?)` | Adds/removes a CSS class (default `hl-active`) on that node. |
| | `highlightEdge(source, target, className?)` / `unhighlightEdge(...)` | Same, for an edge. |
| | `highlightAdjacent(id, opts?)` | **Derived from the two above** — highlights the node plus every neighbor node and connecting edge. Returns the neighbor list. |
| | `clearHighlights(className?)` | Clears one highlight class everywhere, or all of them. |
| Traversal | `traversePath(path, opts?)` | Given `["A", "B", "C", ...]`, highlights each node/edge in sequence with a delay, turning "current" into "visited" as it advances. Returns `{ done: Promise, cancel() }`. |
| Events | `on(event, handler)` / `off(...)` | `"change"` fires with `toJSON()` after any data mutation; `"highlight"` fires with `getHighlights()` after any highlight change. |

Example, using nothing but the class itself:

```js
display.addEdge("Alice", "Bob");
display.addEdge("Bob", "Carol");
display.highlightAdjacent("Bob");         // highlights Bob, Alice, Carol + both edges
display.traversePath(["Alice", "Bob", "Carol"]); // animates a walk across the path
console.log(display.toJSON());            // { nodes: [...], edges: [...] }
```

### 1.4 The two existing "input steps"

- **`python-editor-input.js`** — wires a `<textarea>` + Run/Reset/Show-JSON buttons to
  `PyGraphEngine.run()` + `graphDisplay.setGraph()`.
- **`graph-actions-panel.js`** — wires plain text inputs + buttons directly to
  `highlightAdjacent`, `traversePath`, `addEdge`, `clearHighlights`. No Python involved.

Both drive the *same* `GraphDisplay` instance (wired up in `graph-app.js`), which is
why edits made through the Python editor immediately show up when you use the button
panel (and vice versa) — there is only one `current` graph.

---

## 2. The Python code editor simulator

This is `py-graph-engine.js` + `python-editor-input.js`. It lets you write ordinary
Python in the browser (via [Pyodide](https://pyodide.org)) and turns whatever graph
you build into the exact JSON that `GraphDisplay` renders.

### 2.1 How it works

1. `PyGraphEngine.init()` loads Pyodide once (from the jsdelivr CDN by default).
2. `PyGraphEngine.run(code)` injects your code as `code_input`, then executes
   `runnerSource` (see below), which defines a tiny `nx`-like shim, runs your code
   against it, and serializes the result to JSON with `json.dumps`.
3. `PythonEditorInput.runAndApply()` calls `engine.run(...)` and feeds the result
   straight into `graphDisplay.setGraph(rawGraph)` — so **whatever your Python script
   produces becomes the graph on screen**.
4. The "Show current JSON" button (`toggleJSON`) doesn't re-run anything — it just
   calls `graphDisplay.toJSON()` and pretty-prints it, so you can always verify the
   JSON exactly matches what's rendered.

### 2.2 The supported `nx`-like API

Only a small subset of `networkx` is shimmed (see `PyGraphEngine.runnerSource` in
`py-graph-engine.js`):

```python
G = nx.Graph()
G.add_node(name, **attrs)        # idempotent, merges attrs if it already exists
G.add_edge(u, v, weight=1, **attrs)  # auto-adds endpoints; undirected
G.nodes()                        # -> list of node ids
G.edges()                        # -> list of (u, v, weight) tuples, deduped
G.degree(node=None)              # -> int for one node, or {node: degree} for all
```

There is **no** `shortest_path`, `bfs_tree`, `connected_components`, etc. — this is a
minimal shim, not real NetworkX. Anything beyond the four methods above (searches,
shortest paths, cycle detection, ...) you write yourself in plain Python, using
`G.nodes()`/`G.edges()`/`G.degree()` as your only primitives (see recipes below).

### 2.3 How the result is picked up

After your code runs, the runner decides what to render using this precedence:

```python
if "graph_output" in globals():
    result = graph_output                      # 1) explicit override wins
elif "G" in globals() and hasattr(G, "edges") and hasattr(G, "nodes"):
    result = {                                  # 2) otherwise, serialize G
        "nodes": [...],
        "edges": [...]
    }
else:
    result = {"nodes": [], "edges": []}         # 3) fallback: empty graph
```

So you normally just build `G = nx.Graph()` and let the runner serialize it — but you
can also skip `G` entirely and assign `graph_output` yourself as a plain dict matching
the canonical shape:

```json
{ "nodes": [{ "id": "A", "...": "any extra attrs" }],
  "edges": [{ "source": "A", "target": "B", "weight": 2 }] }
```

`graph-model.js`'s `parseGraphJSON` also accepts the older key `links` instead of
`edges`, and tolerates missing/partial input, in case you're pasting in JSON from
elsewhere.

### 2.4 Recipes — using the simulator for specific things

**a) A basic unweighted graph**

```python
G = nx.Graph()
G.add_edge("Alice", "Bob")
G.add_edge("Bob", "Carol")
G.add_edge("Carol", "Dave")
G.add_edge("Alice", "Dave")
```
Click **Run Python** → four nodes, four edges appear in the viewport. Click **Show
current JSON** to confirm:

```json
{
  "nodes": [{"id": "Alice"}, {"id": "Bob"}, {"id": "Carol"}, {"id": "Dave"}],
  "edges": [
    {"source": "Alice", "target": "Bob", "weight": 1},
    {"source": "Bob", "target": "Carol", "weight": 1},
    {"source": "Carol", "target": "Dave", "weight": 1},
    {"source": "Alice", "target": "Dave", "weight": 1}
  ]
}
```

**b) A weighted graph (edges get thicker with weight)**

```python
G = nx.Graph()
G.add_edge("A", "B", weight=1)
G.add_edge("B", "C", weight=4)
G.add_edge("A", "C", weight=2)
```
`GraphDisplay._renderStructure` clamps stroke width to `Math.min(4, weight)`, so `B-C`
renders visibly thicker than `A-B`.

**c) Custom per-node attributes (e.g. a "group" or "label")**

```python
G = nx.Graph()
G.add_node("Alice", label="Team Lead", group="eng")
G.add_node("Bob", label="Engineer", group="eng")
G.add_edge("Alice", "Bob")
```
`node.label` is used as the on-screen text (`nodeSel.select("text").text(d => d.label
?? d.id)`); any other attrs (like `group`) ride along in the JSON for your own use
(e.g. later coloring by group via a CSS class you add).

**d) Computing a BFS order in Python, then visualizing it with "Traverse path"**

The `nx` shim has no search algorithms, so write BFS yourself using `G.edges()`:

```python
from collections import deque

G = nx.Graph()
G.add_edge("Alice", "Bob")
G.add_edge("Bob", "Carol")
G.add_edge("Carol", "Dave")
G.add_edge("Alice", "Dave")
G.add_edge("Bob", "Eve")

adj = {}
for u, v, _w in G.edges():
    adj.setdefault(u, []).append(v)
    adj.setdefault(v, []).append(u)

def bfs_order(start):
    seen, order, q = {start}, [], deque([start])
    while q:
        node = q.popleft()
        order.append(node)
        for nbr in adj.get(node, []):
            if nbr not in seen:
                seen.add(nbr)
                q.append(nbr)
    return order

print("BFS order:", bfs_order("Alice"))  # e.g. Alice, Bob, Dave, Carol, Eve
```
Run this once to build the graph *and* print the BFS order to the browser console/
Pyodide stdout. Then copy that order (comma-separated) into the **Path** field in the
button panel and click **Traverse path** — `GraphDisplay.traversePath` will step
through exactly that order, turning each node "current" then "visited" as it advances.

**e) Highlighting a node's neighbors (degree inspection)**

```python
G = nx.Graph()
G.add_edge("Bob", "Alice")
G.add_edge("Bob", "Carol")
G.add_edge("Bob", "Eve")
print("Bob's degree:", G.degree("Bob"))   # 3
```
Run it, then type `Bob` into the **Node** field and click **Highlight adjacent** —
this calls `graphDisplay.highlightAdjacent("Bob")` directly (no Python involved for
the highlight step itself; the editor only ever produces graph *data*, highlighting is
always driven through the button panel or your own code against the `GraphDisplay`
instance).

**f) Rebuilding from scratch vs. incrementally editing**

- Re-running the editor calls `setGraph()`, which **clears and rebuilds** the whole
  graph from your script's output — so it's safe to iterate on the script and re-run.
- `G.add_node` / `G.add_edge` are idempotent within one run (calling them twice with
  the same id just merges attrs), matching `GraphDisplay.addNode`/`addEdge` semantics.

**g) Bypassing `nx` entirely with `graph_output`**

Useful when you want structure Python's `nx` shim can't express (e.g. hand-placed
attributes per edge, or you're transforming some other Python data structure):

```python
edges = [("root", "left"), ("root", "right"), ("left", "left.left")]
graph_output = {
    "nodes": [{"id": n} for n in {"root", "left", "right", "left.left"}],
    "edges": [{"source": u, "target": v, "weight": 1} for u, v in edges]
}
```
Because `graph_output` is checked first, this wins even if a `G` also exists in scope.

### 2.5 Verifying editor output matches the display

Every recipe above can be double-checked the same way:

1. Click **Run Python**.
2. Click **Show current JSON**.
3. Compare against what `graphDisplay.toJSON()` prints — this is *not* a re-serialization
   of your Python, it's a read of the live `current` Map inside `GraphDisplay`, so it
   proves the display and the data are in sync.

---

## 3. Embedding `GraphDisplay` without the Python editor

If a page only needs the visualization (no editor, no buttons), import just
`graph-display.js`:

```html
<script type="module">
  import { GraphDisplay } from "./graph-display.js";
  const display = new GraphDisplay({ d3: window.d3 });
  document.getElementById("some-container").appendChild(display.viewport);
  display.addEdge("Alice", "Bob");
</script>
```

## 4. Adding a third input step

To add a new way of driving the graph (drag-and-drop, a node/edge form, voice
commands, ...), write a new file modeled on `graph-actions-panel.js` (plain UI ->
`GraphDisplay` calls) or `python-editor-input.js` (some external
process -> `graphDisplay.setGraph()`), then wire it up in `graph-app.js`'s
`GraphApp.mount()`. `graph-display.js` itself never needs to change.
