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
                edges.append({
                    "source": u,
                    "target": v,
                    "label": data.get("label", ""),
                    "weight": data.get("weight", 1),
                })
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
        "edges": [edge for edge in G.edges()]
    }
else:
    result = {"nodes": [], "edges": []}

json.dumps(result)
`;
  }

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
