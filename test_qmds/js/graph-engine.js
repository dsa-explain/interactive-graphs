// graph-engine.js
// Framework-agnostic graph data model with pub/sub. Every view (canvas,
// adjacency list, adjacency matrix, neighbours panel) subscribes to an
// instance of GraphEngine and re-renders whenever it changes. All mutations
// -- whether triggered from the canvas toolbar or a click on a side panel --
// flow through the engine, so every view for a given instance stays in sync
// automatically.

export class GraphEngine {
  /**
   * @param {{nodes: Array, edges: Array}} initialData
   * @param {{directed?: boolean}} options
   */
  constructor(initialData = { nodes: [], edges: [] }, options = {}) {
    this.directed = !!options.directed;
    this.nodes = new Map();
    this.edges = new Map();
    this.selection = null; // { type: 'node' | 'edge', id }
    this._listeners = new Set();
    this._nodeSeq = 0;
    this._edgeSeq = 0;

    (initialData.nodes || []).forEach((n) => this._insertNode(n));
    (initialData.edges || []).forEach((e) => this._insertEdge(e));
  }

  // ---------- internal helpers ----------

  _insertNode(node) {
    const id = node.id ?? this._nextNodeId();
    this.nodes.set(id, { id, label: node.label ?? id, x: node.x, y: node.y });
    return id;
  }

  _insertEdge(edge) {
    const id = edge.id ?? this._nextEdgeId();
    this.edges.set(id, {
      id,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? "",
    });
    return id;
  }

  _nextNodeId() {
    // A, B, C, ... Z, A2, B2, ... style auto ids
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let n = this._nodeSeq++;
    const cycle = Math.floor(n / letters.length) + 1;
    const letter = letters[n % letters.length];
    const candidate = cycle === 1 ? letter : `${letter}${cycle}`;
    if (this.nodes.has(candidate)) return this._nextNodeId();
    return candidate;
  }

  _nextEdgeId() {
    let id;
    do {
      id = `e${this._edgeSeq++}`;
    } while (this.edges.has(id));
    return id;
  }

  _notify() {
    const snap = this.snapshot();
    this._listeners.forEach((fn) => fn(snap));
  }

  // ---------- public read API ----------

  snapshot() {
    return {
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()],
      selection: this.selection,
      directed: this.directed,
    };
  }

  subscribe(fn) {
    this._listeners.add(fn);
    // fire immediately so a newly-mounted view gets current state
    fn(this.snapshot());
    return () => this._listeners.delete(fn);
  }

  hasEdge(a, b) {
    for (const e of this.edges.values()) {
      if (e.source === a && e.target === b) return true;
      if (!this.directed && e.source === b && e.target === a) return true;
    }
    return false;
  }

  getNeighbours(nodeId) {
    const out = [];
    for (const e of this.edges.values()) {
      if (e.source === nodeId) out.push({ id: e.target, via: e.id });
      else if (!this.directed && e.target === nodeId)
        out.push({ id: e.source, via: e.id });
    }
    return out;
  }

  // ---------- mutation API ----------

  addNode(node = {}) {
    const id = this._insertNode(node);
    this._notify();
    return id;
  }

  addEdge(edge) {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error("Both endpoints must exist before adding an edge");
    }
    const id = this._insertEdge(edge);
    this._notify();
    return id;
  }

  deleteNode(id) {
    if (!this.nodes.has(id)) return;
    this.nodes.delete(id);
    for (const [eid, e] of this.edges) {
      if (e.source === id || e.target === id) this.edges.delete(eid);
    }
    if (this.selection && this.selection.type === "node" && this.selection.id === id) {
      this.selection = null;
    }
    this._notify();
  }

  deleteEdge(id) {
    if (!this.edges.has(id)) return;
    this.edges.delete(id);
    if (this.selection && this.selection.type === "edge" && this.selection.id === id) {
      this.selection = null;
    }
    this._notify();
  }

  updateNode(id, patch) {
    const n = this.nodes.get(id);
    if (!n) return;
    Object.assign(n, patch);
    this._notify();
  }

  updateEdge(id, patch) {
    const e = this.edges.get(id);
    if (!e) return;
    Object.assign(e, patch);
    this._notify();
  }

  select(type, id) {
    this.selection = type && id != null ? { type, id } : null;
    this._notify();
  }

  clearSelection() {
    this.selection = null;
    this._notify();
  }
}
