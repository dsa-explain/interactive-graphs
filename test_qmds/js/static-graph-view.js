// static-graph-view.js
// Renders a non-interactive force-laid-out graph from plain nodes/edges input.
// Reuses the same gv-* class names as graph-view.js so shared CSS applies;
// add the gv-static modifier for a transparent (inline-friendly) background.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let _markerSeq = 0;

/**
 * @typedef {{
 *   start?: string|null,
 *   end?: string|null,
 *   current?: string|null,
 *   previous?: string|null,
 *   next?: string|null,
 *   neighbours?: Iterable<string>,
 *   visited?: Iterable<string>,
 *   pathEdges?: Iterable<string>,
 * }} StaticHighlight
 *
 * @param {HTMLElement} container
 * @param {{nodes: Array<{id: string, label?: string, order?: string|number, x?: number, y?: number}>, edges: Array<{id?: string, source: string, target: string, label?: string}>}} data
 * @param {{width?: number, height?: number, directed?: boolean, caption?: string, highlight?: StaticHighlight}} options
 */
export function mountStaticGraphView(container, data, options = {}) {
  if (!container) return;

  const width = options.width ?? 320;
  const height = options.height ?? 220;
  const directed = !!options.directed;
  const highlight = options.highlight ?? {};
  const visitedList = [...(highlight.visited ?? [])].map(String).filter(Boolean);
  const visited = new Set(visitedList);
  const pathEdges = new Set(
    [...(highlight.pathEdges ?? [])].map(String).filter(Boolean)
  );
  const neighbours = new Set(
    [...(highlight.neighbours ?? [])].map(String).filter(Boolean)
  );
  const startId = highlight.start != null ? String(highlight.start) : null;
  const endId = highlight.end != null ? String(highlight.end) : null;
  const currentId = highlight.current != null ? String(highlight.current) : null;
  const previousId = highlight.previous != null ? String(highlight.previous) : null;
  const nextId = highlight.next != null ? String(highlight.next) : null;
  // Animated edges travel current → each neighbour; previous → current stays solid.
  const nodesIn = data?.nodes ?? [];
  const edgesIn = data?.edges ?? [];
  const pad = 22;
  // Keep forces proportional to the canvas so small inline demos stay in-frame
  // (especially disconnected "island" components that otherwise repel off-screen).
  const shortSide = Math.min(width, height);
  const linkDistance = Math.max(48, shortSide * 0.38);
  const charge = -Math.max(80, shortSide * 0.9);
  const collideR = 22;

  container.innerHTML = "";
  container.classList.add("gv-root", "gv-static");

  if (options.caption) {
    const cap = document.createElement("div");
    cap.className = "gv-caption";
    cap.textContent = options.caption;
    container.appendChild(cap);
  }

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "gv-canvas";
  container.appendChild(canvasWrap);

  const svg = d3
    .select(canvasWrap)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height)
    .attr("class", "gv-svg");

  const markerId = `gv-arrow-static-${_markerSeq++}`;
  if (directed) {
    svg
      .append("defs")
      .append("marker")
      .attr("id", markerId)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 7)
      .attr("markerHeight", 7)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("class", "gv-arrowhead");
  }

  const edgeLayer = svg.append("g").attr("class", "gv-edge-layer");
  const nodeLayer = svg.append("g").attr("class", "gv-node-layer");

  const spawnR = Math.max(24, shortSide * 0.28);
  const simNodes = nodesIn.map((n, i) => {
    const angle = (i / Math.max(1, nodesIn.length)) * 2 * Math.PI;
    return {
      id: n.id,
      label: n.label ?? n.id,
      order: n.order != null && n.order !== "" ? String(n.order) : null,
      x: n.x ?? width / 2 + spawnR * Math.cos(angle),
      y: n.y ?? height / 2 + spawnR * Math.sin(angle),
      fx: n.x != null ? n.x : null,
      fy: n.y != null ? n.y : null,
    };
  });
  const byId = new Map(simNodes.map((n) => [n.id, n]));

  const simLinks = edgesIn
    .map((e, i) => ({
      id: e.id ?? `e${i}`,
      label: e.label ?? "",
      source: byId.get(e.source),
      target: byId.get(e.target),
    }))
    .filter((l) => l.source && l.target);

  const simulation = d3
    .forceSimulation(simNodes)
    .force("charge", d3.forceManyBody().strength(charge))
    .force("center", d3.forceCenter(width / 2, height / 2))
    // Pull components toward the middle so disconnected islands stay visible.
    .force("x", d3.forceX(width / 2).strength(0.07))
    .force("y", d3.forceY(height / 2).strength(0.07))
    .force("collide", d3.forceCollide(collideR))
    .force(
      "link",
      d3
        .forceLink(simLinks)
        .id((d) => d.id)
        .distance(linkDistance)
        .strength(0.55)
    )
    .stop();

  function clamp() {
    simNodes.forEach((d) => {
      d.x = Math.max(pad, Math.min(width - pad, d.x));
      d.y = Math.max(pad, Math.min(height - pad, d.y));
    });
  }

  for (let i = 0; i < 200; i++) {
    simulation.tick();
    clamp();
  }

  const connects = (link, a, b) => {
    if (a == null || b == null) return false;
    const s = link.source.id;
    const t = link.target.id;
    return (s === a && t === b) || (s === b && t === a);
  };

  /** Orient line endpoints current → neighbour (direction of possible next step). */
  const travelCoords = (link) => {
    const s = link.source;
    const t = link.target;
    const forward = { x1: s.x, y1: s.y, x2: t.x, y2: t.y };
    const reverse = { x1: t.x, y1: t.y, x2: s.x, y2: s.y };

    if (currentId != null) {
      if (s.id === currentId && neighbours.has(t.id)) return forward;
      if (t.id === currentId && neighbours.has(s.id)) return reverse;
    }

    return forward;
  };

  const isTravelingEdge = (link) =>
    currentId != null &&
    [...neighbours].some((nb) => connects(link, currentId, nb));

  const edgeSel = edgeLayer
    .selectAll("g.gv-edge")
    .data(simLinks, (d) => d.id)
    .enter()
    .append("g")
    .attr("class", "gv-edge")
    .attr("data-id", (d) => d.id);

  // Base edge line. Path edges (incl. previous→current) stay solid; edges to
  // neighbours get a dim underlay so the marching segment reads on top.
  edgeSel
    .append("line")
    .attr("class", (d) => {
      let cls = "gv-edge-line";
      if (isTravelingEdge(d)) {
        cls += " gv-traversed-edge gv-traversed-edge-active";
      } else if (pathEdges.has(d.id)) {
        cls += " gv-traversed-edge";
      }
      return cls;
    })
    .attr("x1", (d) => d.source.x)
    .attr("y1", (d) => d.source.y)
    .attr("x2", (d) => d.target.x)
    .attr("y2", (d) => d.target.y)
    .attr("marker-end", directed ? `url(#${markerId})` : null);

  // Traveling highlight: short segment marching current → each neighbour.
  edgeSel
    .filter(isTravelingEdge)
    .append("line")
    .attr("class", "gv-edge-line gv-traveling-edge")
    .each(function (d) {
      const c = travelCoords(d);
      d3.select(this)
        .attr("x1", c.x1)
        .attr("y1", c.y1)
        .attr("x2", c.x2)
        .attr("y2", c.y2);
    });

  edgeSel
    .append("text")
    .attr("class", "gv-edge-label")
    .attr("x", (d) => (d.source.x + d.target.x) / 2)
    .attr("y", (d) => (d.source.y + d.target.y) / 2 - 6)
    .text((d) => d.label || "");

  const nodeSel = nodeLayer
    .selectAll("g.gv-node")
    .data(simNodes, (d) => d.id)
    .enter()
    .append("g")
    .attr("class", "gv-node")
    .attr("data-id", (d) => d.id)
    .attr("transform", (d) => `translate(${d.x},${d.y})`);

  nodeSel.append("circle").attr("r", 20).attr("class", (d) => {
    let cls = "gv-node-circle";
    // Role priority: current > previous/next > start/end > visited
    if (currentId != null && d.id === currentId) cls += " gv-selected";
    else if (previousId != null && d.id === previousId) cls += " gv-previous";
    else if (nextId != null && d.id === nextId) cls += " gv-neighbour";
    else if (neighbours.has(d.id)) cls += " gv-neighbour";
    else if (startId != null && d.id === startId) cls += " gv-start";
    else if (endId != null && d.id === endId) cls += " gv-end";
    if (visited.has(d.id)) cls += " gv-visited";
    return cls;
  });
  nodeSel
    .append("text")
    .attr("class", "gv-node-label")
    .attr("text-anchor", "middle")
    .attr("dy", "0.32em")
    .text((d) => d.label);

  // Optional visit-order badge drawn beside the node (does not replace the name).
  nodeSel
    .filter((d) => d.order != null)
    .append("text")
    .attr("class", "gv-order-label")
    .attr("text-anchor", "start")
    .attr("x", 26)
    .attr("dy", "0.32em")
    .text((d) => d.order);

  const roleOf = (d) => {
    if (currentId != null && d.id === currentId) return "current";
    if (previousId != null && d.id === previousId) return "previous";
    if (nextId != null && d.id === nextId) return "next";
    if (neighbours.has(d.id)) return "next";
    if (startId != null && d.id === startId) return "start";
    if (endId != null && d.id === endId) return "end";
    return "";
  };

  nodeSel
    .filter((d) => !!roleOf(d))
    .append("text")
    .attr("class", "gv-role-label")
    .attr("text-anchor", "middle")
    .attr("y", 34)
    .text((d) => roleOf(d));
}