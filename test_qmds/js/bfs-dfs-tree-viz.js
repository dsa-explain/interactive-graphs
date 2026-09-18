// bfs-dfs-tree-viz.js
// Shared tree data + BFS/DFS order computation + frame builder + renderer,
// used by graph-traversal-2.qmd's OJS cells to animate BFS vs DFS pop order
// on a fixed sample tree. d3 and html are passed in from OJS since this is
// a plain ES module and doesn't have access to Observable's implicit stdlib.
//
// (Originally lived inline in static-graph-view.js under a stray
// "///animation for bfs/dfs" comment, unrelated to that file's force-layout
// graph rendering; moved here verbatim.)

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
