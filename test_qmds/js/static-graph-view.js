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
 *   nodeColors?: Record<string, string>|Map<string, string>,
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
  // Explicit edge-status sets (cycle quiz).
  const activeEdgeSet = new Set([...(highlight.activeEdges ?? [])].map(String).filter(Boolean));
  const usedEdgeSet = new Set([...(highlight.usedEdges ?? [])].map(String).filter(Boolean));
  const visitedNeighboursHl = new Set([...(highlight.visitedNeighbours ?? [])].map(String).filter(Boolean));
  const cycleEdgeSet = new Set(highlight.cycleEdge ? [String(highlight.cycleEdge)] : []);
  const nodeColors =
    highlight.nodeColors instanceof Map
      ? highlight.nodeColors
      : new Map(Object.entries(highlight.nodeColors || {}));
  // When explicit edge sets are provided suppress the auto traveling-edge animation.
  const explicitEdgeMode = activeEdgeSet.size > 0 || usedEdgeSet.size > 0 || cycleEdgeSet.size > 0;
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
      weight: e.weight !== undefined ? e.weight : 1,
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

  // Base edge line. Explicit sets (activeEdges/usedEdges/cycleEdge) take
  // priority; otherwise fall back to the auto traveling-edge logic.
  edgeSel
    .append("line")
    .attr("class", (d) => {
      let cls = "gv-edge-line";
      if (cycleEdgeSet.has(d.id)) {
        cls += " gv-edge-cycle";
      } else if (activeEdgeSet.has(d.id)) {
        cls += " gv-edge-active";
      } else if (usedEdgeSet.has(d.id) || pathEdges.has(d.id)) {
        cls += " gv-traversed-edge";
      } else if (!explicitEdgeMode && isTravelingEdge(d)) {
        cls += " gv-traversed-edge gv-traversed-edge-active";
      }
      return cls;
    })
    .attr("x1", (d) => d.source.x)
    .attr("y1", (d) => d.source.y)
    .attr("x2", (d) => d.target.x)
    .attr("y2", (d) => d.target.y)
    .attr("marker-end", directed ? `url(#${markerId})` : null);

  // Traveling highlight: short segment marching current → each neighbour.
  // Suppressed when explicit edge sets are provided (cycle quiz step mode).
  edgeSel
    .filter((d) => !explicitEdgeMode && isTravelingEdge(d))
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
    .text((d) => {
      if (d.label && d.label !== "") {
        return d.weight !== undefined && d.weight !== null && d.weight !== 1
          ? `${d.label} (${d.weight})`
          : d.label;
      }
      return d.weight !== undefined && d.weight !== null && d.weight !== 1
        ? String(d.weight)
        : "";
    });

  const nodeSel = nodeLayer
    .selectAll("g.gv-node")
    .data(simNodes, (d) => d.id)
    .enter()
    .append("g")
    .attr("class", "gv-node")
    .attr("data-id", (d) => d.id)
    .attr("transform", (d) => `translate(${d.x},${d.y})`);

  nodeSel.append("circle").attr("r", 20).attr("class", (d) => {
    const color = nodeColors.get(d.id);
    if (color) {
      let cls = `gv-node-circle gv-color-${color}`;
      if (currentId != null && d.id === currentId) cls += " gv-color-focus";
      return cls;
    }
    let cls = "gv-node-circle";
    // Role priority: current > visitedNeighbour > previous/next > start/end > visited
    if (currentId != null && d.id === currentId) cls += " gv-selected";
    else if (visitedNeighboursHl.has(d.id)) cls += " gv-visited-neighbour";
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
    if (visitedNeighboursHl.has(d.id)) return "visited";
    if (previousId != null && d.id === previousId) return "previous";
    if (nextId != null && d.id === nextId) return "next";
    if (neighbours.has(d.id)) return "unvisited";
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

///animation for bfs/dfs

// Shared tree data + BFS/DFS order computation + frame builder + renderer.
// d3 and html are passed in from OJS since this is a plain ES module
// and doesn't have access to Observable's implicit stdlib.

export const treeNodes = {
  A: { children: ["B", "C"], color: "#FCB686", pos: [40, 120] },
  B: { children: ["D"],      color: "#A8D5BA", pos: [160, 60] },
  C: { children: ["E"],      color: "#A8D5BA", pos: [160, 180] },
  D: { children: ["F"],      color: "#A9CBE8", pos: [280, 60] },
  E: { children: ["G"],      color: "#A9CBE8", pos: [280, 180] },
  F: { children: [],        color: "#F6D58A", pos: [400, 60] },
  G: { children: [],        color: "#F6D58A", pos: [400, 180] }
};

// Given a pop order, build the step-by-step frames:
// step 1: encounter=[A], traversal=[]
// each subsequent step pops the next node in `order`, dims it (and all previous),
// appends it to traversal, and appends its children to encounter.
function buildFrames(order, nodes) {
  const frames = [];
  let encounterList = ["A"];
  let traversal = [];

  frames.push({ encounter: [...encounterList], traversal: [...traversal], dim: new Set() });

  for (let i = 0; i < order.length; i++) {
    const current = order[i];
    traversal = [...traversal, current];
    encounterList = [...encounterList, ...nodes[current].children];
    const dim = new Set(order.slice(0, i + 1));
    frames.push({ encounter: [...encounterList], traversal: [...traversal], dim });
  }

  return frames;
}

export function computeBFSFrames(nodes = treeNodes) {
  const order = [];
  const queue = ["A"];
  while (queue.length) {
    const n = queue.shift();
    order.push(n);
    for (const c of nodes[n].children) queue.push(c);
  }
  return buildFrames(order, nodes);
}

export function computeDFSFrames(nodes = treeNodes) {
  const order = [];
  const stack = ["A"];
  while (stack.length) {
    const n = stack.pop();
    order.push(n);
    const children = nodes[n].children;
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]); // leftmost pops first
  }
  return buildFrames(order, nodes);
}

// Auto-looping animation driver
export async function* makeFrameGenerator(frames, delay = 1100) {
  let i = 0;
  while (true) {
    yield frames[i % frames.length];
    await new Promise(resolve => setTimeout(resolve, delay));
    i++;
  }
}

// Renders the tree + the two box-list rows for a given frame.
// d3 and html must be passed in from the OJS cell that calls this.
export function renderViz(frame, nodes, d3, html) {
  const revealed = new Set(frame.encounter);

  const activeIdx = frame.encounter
    .map((d, i) => ({ d, i }))
    .filter(x => !frame.dim.has(x.d))
    .map(x => x.i);
  const firstActive = activeIdx.length ? activeIdx[0] : -1;
  const lastActive = activeIdx.length ? activeIdx[activeIdx.length - 1] : -1;

  const w = 460, h = 240;
  const tree = d3.create("svg").attr("viewBox", [0, 0, w, h]).attr("width", w).attr("height", h);

  const edges = [];
  for (const [name, node] of Object.entries(nodes))
    for (const c of node.children) edges.push([name, c]);

  tree.append("g")
    .selectAll("line")
    .data(edges)
    .join("line")
      .attr("x1", d => nodes[d[0]].pos[0])
      .attr("y1", d => nodes[d[0]].pos[1])
      .attr("x2", d => nodes[d[1]].pos[0])
      .attr("y2", d => nodes[d[1]].pos[1])
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 2);

  tree.append("g")
    .selectAll("circle")
    .data(Object.entries(nodes))
    .join("circle")
      .attr("cx", d => d[1].pos[0])
      .attr("cy", d => d[1].pos[1])
      .attr("r", 16)
      .attr("fill", d => revealed.has(d[0]) ? d[1].color : "#d1d5db")
      .attr("stroke", d => d3.color(revealed.has(d[0]) ? d[1].color : "#d1d5db").darker(1))
      .attr("stroke-width", 2);

  const boxSize = 26, gap = 6;

  // leftIdx/rightIdx (optional) get a half-open bracket outline ("[" and "]")
  // instead of a full box border, marking the start/end of the active window.
  function row(items, dimSet, leftIdx = -1, rightIdx = -1) {
    const svg = d3.create("svg")
      .attr("width", Math.max(1, items.length) * (boxSize + gap))
      .attr("height", boxSize + 4);

    svg.selectAll("rect")
      .data(items)
      .join("rect")
        .attr("x", (d, i) => i * (boxSize + gap) + 2)
        .attr("y", 2)
        .attr("width", boxSize)
        .attr("height", boxSize)
        .attr("rx", 4)
        .attr("fill", d => nodes[d].color)
        .attr("stroke", d => d3.color(nodes[d].color).darker(1))
        .attr("stroke-width", 1.5)
        .attr("opacity", d => dimSet.has(d) ? 0.3 : 1);

    const bracketArm = 6;
    const brackets = [];
    if (leftIdx >= 0) brackets.push({ i: leftIdx, side: "left" });
    if (rightIdx >= 0) brackets.push({ i: rightIdx, side: "right" });

    svg.append("g")
      .selectAll("path")
      .data(brackets)
      .join("path")
        .attr("d", d => {
          const y = 2;
          if (d.side === "left") {
            const x = d.i * (boxSize + gap) + 2;
            return `M ${x + bracketArm} ${y} L ${x} ${y} L ${x} ${y + boxSize} L ${x + bracketArm} ${y + boxSize}`;
          } else {
            const xr = d.i * (boxSize + gap) + boxSize + 2;
            return `M ${xr - bracketArm} ${y} L ${xr} ${y} L ${xr} ${y + boxSize} L ${xr - bracketArm} ${y + boxSize}`;
          }
        })
        .attr("fill", "none")
        .attr("stroke", "#111827")
        .attr("stroke-width", 2.5);

    return svg.node();
  }

  return html`<div style="display:flex; gap:40px; align-items:center; flex-wrap:wrap; font-family:'Cascadia Code','Cascadia Mono',monospace;">
    <div>${tree.node()}</div>
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <div style="font-size:12px; color:#374151; margin-bottom:4px;">encounter</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:11px; color:#6b7280;">start</span>
          ${row(frame.encounter, frame.dim, firstActive, lastActive)}
          <span style="font-size:11px; color:#6b7280;">end</span>
        </div>
      </div>
      <div>
        <div style="font-size:12px; color:#374151; margin-bottom:4px;">traversal (pop order)</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:11px; color:#6b7280;">start</span>
          ${row(frame.traversal, new Set())}
          <span style="font-size:11px; color:#6b7280;">end</span>
        </div>
      </div>
    </div>
  </div>`;
}