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
    // Optional traversal / algorithm overlay (used by islands viz, etc.)
    this.viz = {
      visited: new Set(), // node ids
      currentNode: null,
      currentNeighbor: null,
      activeEdges: new Set(), // edge ids currently highlighted as traversed
    };
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
      weight: edge.weight !== undefined ? edge.weight : 1,
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
      viz: {
        visited: new Set(this.viz.visited),
        currentNode: this.viz.currentNode,
        currentNeighbor: this.viz.currentNeighbor,
        activeEdges: new Set(this.viz.activeEdges),
      },
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

  /**
   * Update algorithm highlight overlay. Pass a partial state; omitted keys
   * are left unchanged. Use `clearViz()` to wipe everything.
   * @param {{visited?: Iterable, currentNode?: string|null, currentNeighbor?: string|null, activeEdges?: Iterable}} patch
   */
  setViz(patch = {}) {
    if (patch.visited !== undefined) {
      this.viz.visited = new Set(patch.visited);
    }
    if (patch.currentNode !== undefined) {
      this.viz.currentNode = patch.currentNode;
    }
    if (patch.currentNeighbor !== undefined) {
      this.viz.currentNeighbor = patch.currentNeighbor;
    }
    if (patch.activeEdges !== undefined) {
      this.viz.activeEdges = new Set(patch.activeEdges);
    }
    this._notify();
  }

  clearViz() {
    this.viz.visited = new Set();
    this.viz.currentNode = null;
    this.viz.currentNeighbor = null;
    this.viz.activeEdges = new Set();
    this._notify();
  }

  /** Find an edge id between a and b (undirected-aware), or null. */
  findEdgeId(a, b) {
    for (const e of this.edges.values()) {
      if (e.source === a && e.target === b) return e.id;
      if (!this.directed && e.source === b && e.target === a) return e.id;
    }
    return null;
  }
}
