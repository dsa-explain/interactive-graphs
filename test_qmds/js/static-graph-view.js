// static-graph-view.js
// Renders a non-interactive force-laid-out graph from plain nodes/edges input.
// Reuses the same gv-* class names as graph-view.js so shared CSS applies;
// add the gv-static modifier for a transparent (inline-friendly) background.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let _markerSeq = 0;

/**
 * @param {HTMLElement} container
 * @param {{nodes: Array<{id: string, label?: string, x?: number, y?: number}>, edges: Array<{id?: string, source: string, target: string, label?: string}>}} data
 * @param {{width?: number, height?: number, directed?: boolean, caption?: string}} options
 */
export function mountStaticGraphView(container, data, options = {}) {
  if (!container) return;

  const width = options.width ?? 320;
  const height = options.height ?? 220;
  const directed = !!options.directed;
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

  const edgeSel = edgeLayer
    .selectAll("g.gv-edge")
    .data(simLinks, (d) => d.id)
    .enter()
    .append("g")
    .attr("class", "gv-edge")
    .attr("data-id", (d) => d.id);

  edgeSel
    .append("line")
    .attr("class", "gv-edge-line")
    .attr("x1", (d) => d.source.x)
    .attr("y1", (d) => d.source.y)
    .attr("x2", (d) => d.target.x)
    .attr("y2", (d) => d.target.y)
    .attr("marker-end", directed ? `url(#${markerId})` : null);

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

  nodeSel.append("circle").attr("r", 20).attr("class", "gv-node-circle");
  nodeSel
    .append("text")
    .attr("class", "gv-node-label")
    .attr("text-anchor", "middle")
    .attr("dy", "0.32em")
    .text((d) => d.label);
}
