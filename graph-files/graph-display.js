/**
 * graph-display.js
 * ---------------------------------------------------------------------
 * GraphDisplay owns every display-related concern for a graph: the
 * data ("current" nodes/edges), the rendered viewport (an SVG force
 * layout), and highlighting. It knows nothing about *how* changes are
 * decided (Python code, buttons, a block editor, ...) - it only
 * exposes an imperative API (addNode, addEdge, highlightNode, ...)
 * plus a change-notification API (on/off).
 *
 * Anything that wants to drive the graph is an "input step" that
 * simply calls these methods - see python-editor-input.js and
 * graph-actions-panel.js for two interchangeable examples. Swapping
 * one input step for another (e.g. a future drag-and-drop UI) never
 * requires touching this file.
 *
 * Usage:
 *   import { GraphDisplay } from "./graph-display.js";
 *   const display = new GraphDisplay({ d3: window.d3 });
 *   someContainer.appendChild(display.viewport); // embed anywhere
 *   display.addEdge("Alice", "Bob");
 *   display.highlightAdjacent("Alice");
 *   const json = display.toJSON();
 */
import { edgeKey, parseGraphJSON, toGraphJSON } from "./graph-model.js";

const DEFAULT_NODE_HL = "hl-active";
const DEFAULT_EDGE_HL = "hl-active";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Edge endpoints start as id strings but d3.forceLink resolves them to node objects in place. */
function endpointId(endpoint) {
  return typeof endpoint === "object" && endpoint !== null ? endpoint.id : endpoint;
}

export class GraphDisplay {
  /**
   * @param {object} options
   * @param {object} options.d3 - a D3 (v7) namespace reference.
   * @param {number} [options.width]
   * @param {number} [options.height]
   */
  constructor({ d3, width = 760, height = 520 } = {}) {
    if (!d3) throw new Error("GraphDisplay requires a `d3` reference");
    this.d3 = d3;
    this.width = width;
    this.height = height;

    /** The single source of truth: a dictionary of nodes and edges. */
    this.current = { nodes: new Map(), edges: new Map() };
    this._adjacency = new Map();

    /** Highlight state, kept separate from graph data on purpose. */
    this._nodeHighlights = new Map(); // id -> Set<className>
    this._edgeHighlights = new Map(); // edgeKey -> Set<className>

    this._listeners = new Map(); // event -> Set<handler>
    this._simulation = null;
    this._traversalToken = 0;

    this.viewport = this._buildViewport();
    this._selection = this._initD3();
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------

  /** Subscribes to "change" (graph data) or "highlight" (highlight state) events. */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  _emit(event, payload) {
    this._listeners.get(event)?.forEach(handler => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`GraphDisplay listener for "${event}" threw`, err);
      }
    });
  }

  // ------------------------------------------------------------------
  // CRUD: nodes
  // ------------------------------------------------------------------

  /** Creates a node, or merges `attrs` into it if it already exists (idempotent, like nx.add_node). */
  addNode(id, attrs = {}) {
    const nodeId = String(id);
    const existing = this.current.nodes.get(nodeId);
    if (existing) {
      Object.assign(existing, attrs, { id: nodeId });
    } else {
      this.current.nodes.set(nodeId, { ...attrs, id: nodeId });
      this._adjacency.set(nodeId, new Set());
    }
    this._render({ structural: true });
    this._emit("change", this.toJSON());
    return this.current.nodes.get(nodeId);
  }

  /** Merges `attrs` into an existing node. Throws if the node does not exist. */
  updateNode(id, attrs = {}) {
    const nodeId = String(id);
    const node = this.current.nodes.get(nodeId);
    if (!node) throw new Error(`GraphDisplay.updateNode: node "${nodeId}" does not exist`);
    Object.assign(node, attrs, { id: nodeId });
    this._render({ structural: false });
    this._emit("change", this.toJSON());
    return node;
  }

  /** Removes a node and every edge attached to it. No-op (with a warning) if it does not exist. */
  deleteNode(id) {
    const nodeId = String(id);
    if (!this.current.nodes.has(nodeId)) {
      console.warn(`GraphDisplay.deleteNode: node "${nodeId}" does not exist`);
      return false;
    }
    Array.from(this._adjacency.get(nodeId) ?? []).forEach(neighborId => this.deleteEdge(nodeId, neighborId, { silent: true }));
    this.current.nodes.delete(nodeId);
    this._adjacency.delete(nodeId);
    this._nodeHighlights.delete(nodeId);
    this._render({ structural: true });
    this._emit("change", this.toJSON());
    return true;
  }

  // ------------------------------------------------------------------
  // CRUD: edges (aka relationships)
  // ------------------------------------------------------------------

  /** Creates an edge (auto-creating endpoint nodes), or merges `attrs` if it already exists. */
  addEdge(source, target, attrs = {}) {
    const sourceId = String(source);
    const targetId = String(target);
    if (!this.current.nodes.has(sourceId)) this.addNode(sourceId);
    if (!this.current.nodes.has(targetId)) this.addNode(targetId);

    const key = edgeKey(sourceId, targetId);
    const existing = this.current.edges.get(key);
    if (existing) {
      Object.assign(existing, attrs);
    } else {
      const weight = Number(attrs.weight ?? 1) || 1;
      this.current.edges.set(key, { ...attrs, source: sourceId, target: targetId, weight });
      this._adjacency.get(sourceId).add(targetId);
      this._adjacency.get(targetId).add(sourceId);
    }
    this._render({ structural: true });
    this._emit("change", this.toJSON());
    return this.current.edges.get(key);
  }

  /** Alias for addEdge - reads better when the domain is "relationships" rather than "edges". */
  addRelationship(source, target, attrs = {}) {
    return this.addEdge(source, target, attrs);
  }

  /** Merges `attrs` into an existing edge. Throws if the edge does not exist. */
  updateEdge(source, target, attrs = {}) {
    const key = edgeKey(source, target);
    const edge = this.current.edges.get(key);
    if (!edge) throw new Error(`GraphDisplay.updateEdge: edge "${source}-${target}" does not exist`);
    Object.assign(edge, attrs, { source: edge.source, target: edge.target });
    this._render({ structural: false });
    this._emit("change", this.toJSON());
    return edge;
  }

  /** Removes an edge. No-op (with a warning, unless `silent`) if it does not exist. */
  deleteEdge(source, target, { silent = false } = {}) {
    const sourceId = String(source);
    const targetId = String(target);
    const key = edgeKey(sourceId, targetId);
    if (!this.current.edges.has(key)) {
      if (!silent) console.warn(`GraphDisplay.deleteEdge: edge "${sourceId}-${targetId}" does not exist`);
      return false;
    }
    this.current.edges.delete(key);
    this._edgeHighlights.delete(key);
    this._adjacency.get(sourceId)?.delete(targetId);
    this._adjacency.get(targetId)?.delete(sourceId);
    this._render({ structural: true });
    this._emit("change", this.toJSON());
    return true;
  }

  // ------------------------------------------------------------------
  // Bulk load / export
  // ------------------------------------------------------------------

  /** Removes every node and edge (keeps the viewport, listeners, etc). */
  clearGraph() {
    this.current.nodes.clear();
    this.current.edges.clear();
    this._adjacency.clear();
    this._nodeHighlights.clear();
    this._edgeHighlights.clear();
    this._render({ structural: true });
    this._emit("change", this.toJSON());
  }

  /**
   * Replaces the whole graph with `graphJSON` ({ nodes, edges }), going
   * through the same addNode/addEdge primitives as any other input step.
   */
  setGraph(graphJSON) {
    const { nodes, edges } = parseGraphJSON(graphJSON);
    this.clearGraph();
    nodes.forEach(node => this.addNode(node.id, node));
    edges.forEach(edge => this.addEdge(edge.source, edge.target, edge));
    return this.toJSON();
  }

  /** Returns the graph currently shown in the viewport as plain JSON. */
  toJSON() {
    return toGraphJSON(this.current);
  }

  // ------------------------------------------------------------------
  // Highlighting
  // ------------------------------------------------------------------

  highlightNode(id, className = DEFAULT_NODE_HL) {
    const nodeId = String(id);
    if (!this.current.nodes.has(nodeId)) {
      console.warn(`GraphDisplay.highlightNode: node "${nodeId}" does not exist`);
      return;
    }
    if (!this._nodeHighlights.has(nodeId)) this._nodeHighlights.set(nodeId, new Set());
    this._nodeHighlights.get(nodeId).add(className);
    this._applyHighlightClasses();
    this._emit("highlight", this.getHighlights());
  }

  unhighlightNode(id, className = null) {
    const nodeId = String(id);
    if (className) this._nodeHighlights.get(nodeId)?.delete(className);
    else this._nodeHighlights.delete(nodeId);
    this._applyHighlightClasses();
    this._emit("highlight", this.getHighlights());
  }

  highlightEdge(source, target, className = DEFAULT_EDGE_HL) {
    const key = edgeKey(source, target);
    if (!this.current.edges.has(key)) {
      console.warn(`GraphDisplay.highlightEdge: edge "${source}-${target}" does not exist`);
      return;
    }
    if (!this._edgeHighlights.has(key)) this._edgeHighlights.set(key, new Set());
    this._edgeHighlights.get(key).add(className);
    this._applyHighlightClasses();
    this._emit("highlight", this.getHighlights());
  }

  unhighlightEdge(source, target, className = null) {
    const key = edgeKey(source, target);
    if (className) this._edgeHighlights.get(key)?.delete(className);
    else this._edgeHighlights.delete(key);
    this._applyHighlightClasses();
    this._emit("highlight", this.getHighlights());
  }

  /**
   * Highlights a node together with its incident edges and neighbors.
   * Derived entirely from highlightNode + highlightEdge, as requested -
   * it adds no new rendering logic of its own.
   */
  highlightAdjacent(id, { className = "hl-adjacent", selfClassName = DEFAULT_NODE_HL, includeSelf = true } = {}) {
    const nodeId = String(id);
    if (!this.current.nodes.has(nodeId)) {
      console.warn(`GraphDisplay.highlightAdjacent: node "${nodeId}" does not exist`);
      return [];
    }
    if (includeSelf) this.highlightNode(nodeId, selfClassName);
    const neighbors = Array.from(this._adjacency.get(nodeId) ?? []);
    neighbors.forEach(neighborId => {
      this.highlightNode(neighborId, className);
      this.highlightEdge(nodeId, neighborId, className);
    });
    return neighbors;
  }

  /** Clears highlight `className` everywhere, or every highlight if omitted. */
  clearHighlights(className = null) {
    if (className) {
      this._nodeHighlights.forEach(set => set.delete(className));
      this._edgeHighlights.forEach(set => set.delete(className));
    } else {
      this._nodeHighlights.clear();
      this._edgeHighlights.clear();
    }
    this._applyHighlightClasses();
    this._emit("highlight", this.getHighlights());
  }

  getHighlights() {
    return {
      nodes: Array.from(this._nodeHighlights.entries()).map(([id, classes]) => ({ id, classes: Array.from(classes) })),
      edges: Array.from(this._edgeHighlights.entries()).map(([key, classes]) => ({ key, classes: Array.from(classes) }))
    };
  }

  // ------------------------------------------------------------------
  // Traversal
  // ------------------------------------------------------------------

  /**
   * Highlights `path` (a list of node ids) one step at a time, turning
   * each visited node/edge from "current" into "visited" as it moves on.
   * Returns a controller: { done: Promise<void>, cancel(): void }.
   */
  traversePath(path, { delayMs = 650, clearBefore = true, currentClass = "hl-path-current", visitedClass = "hl-path-visited" } = {}) {
    const token = ++this._traversalToken;
    if (clearBefore) this.clearHighlights();

    const run = async () => {
      for (let i = 0; i < path.length; i++) {
        if (token !== this._traversalToken) return; // cancelled/superseded
        const nodeId = String(path[i]);
        if (!this.current.nodes.has(nodeId)) {
          console.warn(`GraphDisplay.traversePath: node "${nodeId}" does not exist, skipping`);
          continue;
        }
        if (i > 0) {
          const prevId = String(path[i - 1]);
          this.unhighlightNode(prevId, currentClass);
          this.highlightNode(prevId, visitedClass);
          this.unhighlightEdge(prevId, nodeId, currentClass);
          this.highlightEdge(prevId, nodeId, visitedClass);
        }
        this.highlightNode(nodeId, currentClass);
        await sleep(delayMs);
      }
    };

    return { done: run(), cancel: () => { this._traversalToken += 1; } };
  }

  // ------------------------------------------------------------------
  // Rendering (private)
  // ------------------------------------------------------------------

  getViewportElement() {
    return this.viewport;
  }

  _buildViewport() {
    const wrapper = document.createElement("div");
    wrapper.className = "gd-viewport";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "gd-svg");
    svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("aria-label", "Network graph");
    wrapper.appendChild(svg);
    this._svgElement = svg;
    return wrapper;
  }

  _initD3() {
    const svg = this.d3.select(this._svgElement);
    const empty = svg.append("text")
      .attr("class", "gd-empty-state")
      .attr("x", this.width / 2)
      .attr("y", this.height / 2)
      .attr("text-anchor", "middle")
      .text("No nodes yet.");

    const edgeLayer = svg.append("g").attr("class", "gd-edges");
    const nodeLayer = svg.append("g").attr("class", "gd-nodes");
    return { svg, empty, edgeLayer, nodeLayer };
  }

  /** Node objects are reused across renders so D3's simulation keeps stable x/y positions. */
  _nodesArray() {
    return Array.from(this.current.nodes.values());
  }

  _edgesArray() {
    return Array.from(this.current.edges.values());
  }

  _render({ structural }) {
    const nodes = this._nodesArray();
    this._selection.empty.style("display", nodes.length ? "none" : null);
    if (structural) this._renderStructure(nodes, this._edgesArray());
    this._applyHighlightClasses();
  }

  _renderStructure(nodes, edges) {
    const { d3, width, height } = this;
    const { edgeLayer, nodeLayer } = this._selection;

    const edgeSel = edgeLayer.selectAll("line.gd-edge")
      .data(edges, d => edgeKey(endpointId(d.source), endpointId(d.target)))
      .join(
        enter => enter.append("line").attr("class", "gd-edge"),
        update => update,
        exit => exit.remove()
      )
      .attr("stroke-width", d => Math.max(1, Math.min(4, d.weight || 1)));

    const nodeSel = nodeLayer.selectAll("g.gd-node")
      .data(nodes, d => d.id)
      .join(enter => this._enterNodes(enter), update => update, exit => exit.remove());
    this._selection.node = nodeSel;
    this._selection.edge = edgeSel;

    this._runSimulation(nodes, edges, nodeSel, edgeSel, width, height);
  }

  _enterNodes(enter) {
    const g = enter.append("g").attr("class", "gd-node").call(this._dragBehavior());
    g.append("circle");
    g.append("text").attr("x", 12).attr("y", 4);
    g.append("title");
    return g;
  }

  _dragBehavior() {
    const d3 = this.d3;
    const display = this;
    return d3.drag()
      .on("start", (event, d) => {
        if (!event.active && display._simulation) display._simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active && display._simulation) display._simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  _runSimulation(nodes, edges, nodeSel, edgeSel, width, height) {
    const d3 = this.d3;
    const adjacency = this._adjacency;

    nodeSel.select("circle").attr("r", d => 8 + Math.min((adjacency.get(d.id)?.size ?? 0) * 2, 14));
    nodeSel.select("text").text(d => d.label ?? d.id);
    nodeSel.select("title").text(d => `${d.id}: degree ${adjacency.get(d.id)?.size ?? 0}`);

    if (!this._simulation) {
      this._simulation = d3.forceSimulation();
    }
    const simulation = this._simulation;

    simulation.nodes(nodes)
      .force("link", d3.forceLink(edges).id(d => d.id).distance(120).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius(d => 16 + Math.min((adjacency.get(d.id)?.size ?? 0) * 2, 12)))
      .alpha(0.9)
      .restart();

    simulation.on("tick", () => {
      edgeSel
        .attr("x1", d => clamp(d.source.x, 0, width))
        .attr("y1", d => clamp(d.source.y, 0, height))
        .attr("x2", d => clamp(d.target.x, 0, width))
        .attr("y2", d => clamp(d.target.y, 0, height));

      nodeSel.attr("transform", d => {
        d.x = clamp(d.x, 16, width - 16);
        d.y = clamp(d.y, 16, height - 16);
        return `translate(${d.x},${d.y})`;
      });
    });
  }

  _applyHighlightClasses() {
    if (this._selection.node) {
      this._selection.node.attr("class", d => {
        const classes = ["gd-node", ...(this._nodeHighlights.get(d.id) ?? [])];
        return classes.join(" ");
      });
    }
    if (this._selection.edge) {
      this._selection.edge.attr("class", d => {
        const key = edgeKey(endpointId(d.source), endpointId(d.target));
        const classes = ["gd-edge", ...(this._edgeHighlights.get(key) ?? [])];
        return classes.join(" ");
      });
    }
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
