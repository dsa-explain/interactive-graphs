/**
 * py-graph-engine.js
 * ---------------------------------------------------------------------
 * Wraps Pyodide plus a small "networkx"-like shim so arbitrary user
 * Python can build a graph and hand back plain { nodes, edges } JSON.
 *
 * This module knows nothing about GraphDisplay - it just runs Python
 * and returns data. The wiring that feeds the result into a
 * GraphDisplay instance lives in python-editor-input.js, which is the
 * piece you would swap out (not this file) if the input mechanism
 * changed from "Python code" to something else.
 *
 * Usage:
 *   import { PyGraphEngine } from "./py-graph-engine.js";
 *   const engine = new PyGraphEngine({ indexURL: ".../pyodide/v0.25.0/full/" });
 *   await engine.init();
 *   const graph = await engine.run(pythonCode); // -> { nodes, edges }
 */
export class PyGraphEngine {
  constructor({ indexURL, pyodideModuleURL } = {}) {
    this.indexURL = indexURL || "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/";
    this.pyodideModuleURL = pyodideModuleURL || "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.mjs";
    this.pyodide = null;
  }

  async init() {
    if (this.pyodide) return this.pyodide;
    const { loadPyodide } = await import(/* @vite-ignore */ this.pyodideModuleURL);
    this.pyodide = await loadPyodide({ indexURL: this.indexURL });
    return this.pyodide;
  }

  /** Python source that defines the `nx`-like shim and the run/serialize logic. */
  static get runnerSource() {
    return `
import json

class Graph:
    def __init__(self):
        self.adj = {}
        self.node_attrs = {}

    def add_node(self, node, **attrs):
        self.adj.setdefault(node, {})
        self.node_attrs.setdefault(node, {}).update(attrs)

    def add_edge(self, u, v, weight=1, **attrs):
        self.add_node(u)
        self.add_node(v)
        data = {"weight": weight, **attrs}
        self.adj[u][v] = data
        self.adj[v][u] = data

    def nodes(self):
        return list(self.adj.keys())

    def edges(self):
        seen = set()
        edges = []
        for u, nbrs in self.adj.items():
            for v, data in nbrs.items():
                if (v, u) in seen:
                    continue
                seen.add((u, v))
                edges.append((u, v, data.get("weight", 1)))
        return edges

    def degree(self, node=None):
        if node is None:
            return {n: len(self.adj[n]) for n in self.adj}
        return len(self.adj.get(node, {}))

class NX:
    Graph = Graph

nx = NX()

globals().update({"code_input": code_input})
exec(code_input, globals())

if "graph_output" in globals():
    result = graph_output
elif "G" in globals() and hasattr(G, "edges") and hasattr(G, "nodes"):
    result = {
        "nodes": [{"id": n, **G.node_attrs.get(n, {})} for n in G.nodes()],
        "edges": [{"source": u, "target": v, "weight": w} for u, v, w in G.edges()]
    }
else:
    result = {"nodes": [], "edges": []}

json.dumps(result)
`;
  }

  /**
   * Runs arbitrary user Python `code` against the graph shim and
   * returns the parsed { nodes, edges } JSON it produced.
   */
  async run(code) {
    if (!this.pyodide) {
      throw new Error("PyGraphEngine.init() must complete before run()");
    }
    this.pyodide.globals.set("code_input", code);
    try {
      const result = await this.pyodide.runPythonAsync(PyGraphEngine.runnerSource);
      return JSON.parse(result.trim());
    } finally {
      this.pyodide.globals.delete("code_input");
    }
  }
}
