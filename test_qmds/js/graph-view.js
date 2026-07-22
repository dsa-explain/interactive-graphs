// graph-view.js
// Renders an interactive force-directed graph bound to a GraphEngine
// instance. This exact module is reused, unmodified, by every document:
// sandbox.qmd, adjacency-list.qmd, adjacency-matrix.qmd and neighbours.qmd.
// It never talks to other views directly -- it only reads/writes the engine.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

/**
 * Custom in-page prompt (replaces window.prompt).
 * Resolves with the trimmed string on submit, or null on cancel.
 * @param {{title: string, message?: string, defaultValue?: string, placeholder?: string, submitLabel?: string}} opts
 * @returns {Promise<string|null>}
 */
function openPromptModal({
  title,
  message = "",
  defaultValue = "",
  placeholder = "",
  submitLabel = "OK",
}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "gv-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", title);

    const dialog = document.createElement("div");
    dialog.className = "gv-modal";

    const heading = document.createElement("h3");
    heading.className = "gv-modal-title";
    heading.textContent = title;
    dialog.appendChild(heading);

    if (message) {
      const msg = document.createElement("p");
      msg.className = "gv-modal-message";
      msg.textContent = message;
      dialog.appendChild(msg);
    }

    const input = document.createElement("input");
    input.className = "gv-modal-input";
    input.type = "text";
    input.value = defaultValue;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    dialog.appendChild(input);

    const actions = document.createElement("div");
    actions.className = "gv-modal-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "gv-btn gv-modal-cancel";
    cancelBtn.textContent = "Cancel";

    const submitBtn = document.createElement("button");
    submitBtn.type = "button";
    submitBtn.className = "gv-btn gv-modal-submit";
    submitBtn.textContent = submitLabel;

    actions.append(cancelBtn, submitBtn);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const previouslyFocused = document.activeElement;

    function close(value) {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      resolve(value);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        close(input.value.trim());
      }
    }

    cancelBtn.addEventListener("click", () => close(null));
    submitBtn.addEventListener("click", () => close(input.value.trim()));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });
    document.addEventListener("keydown", onKeyDown);

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  });
}

/**
 * @param {import("./graph-engine.js").GraphEngine} engine
 * @param {HTMLElement} container
 * @param {{width?: number, height?: number, showToolbar?: boolean, caption?: string, highlightNeighbours?: boolean}} options
 */
export function mountGraphView(engine, container, options = {}) {
  const width = options.width ?? 520;
  const height = options.height ?? 440;
  const showToolbar = options.showToolbar ?? true;
  const highlightNeighbours = options.highlightNeighbours ?? false;

  container.innerHTML = "";
  container.classList.add("gv-root");

  let pendingEdgeSource = null; // node id chosen while in "add edge" mode
  let addEdgeMode = false;
  let addEdgeBtn = null;

  // ---------- toolbar ----------
  let statusEl;
  if (showToolbar) {
    const toolbar = document.createElement("div");
    toolbar.className = "gv-toolbar";

    const addNodeBtn = mkButton("Node", "Add Node", async () => {
      const label = await openPromptModal({
        title: "Add node",
        message: "Leave blank to use an auto-generated id.",
        placeholder: "Node label",
        submitLabel: "Add",
      });
      if (label == null) return;
      engine.addNode(label ? { label } : {});
    });

    addEdgeBtn = mkButton("Edge", "Add Edge", () => {
      addEdgeMode = !addEdgeMode;
      pendingEdgeSource = null;
      addEdgeBtn.classList.toggle("gv-btn-active", addEdgeMode);
      updateStatus();
    });

    const updateNodeBtn = mkButton("Node", "Update Node", async () => {
      const sel = engine.selection;
      if (!sel || sel.type !== "node") {
        flash("Select a node first, then Update Node.");
        return;
      }
      const current = engine.nodes.get(sel.id);
      const label = await openPromptModal({
        title: "Update node",
        message: "Enter a new label for this node.",
        defaultValue: current?.label ?? "",
        placeholder: "Node label",
        submitLabel: "Update",
      });
      if (label != null) engine.updateNode(sel.id, { label });
    });

    const updateEdgeBtn = mkButton("Edge", "Update Edge", async () => {
      const sel = engine.selection;
      if (!sel || sel.type !== "edge") {
        flash("Select an edge first, then Update Edge.");
        return;
      }
      const current = engine.edges.get(sel.id);
      const label = await openPromptModal({
        title: "Update edge",
        message: "Enter a new label or weight for this edge.",
        defaultValue: current?.label ?? "",
        placeholder: "Edge label / weight",
        submitLabel: "Update",
      });
      if (label != null) engine.updateEdge(sel.id, { label });
    });

    const deleteNodeBtn = mkButton("Node", "Delete Node", () => {
      const sel = engine.selection;
      if (!sel || sel.type !== "node") {
        flash("Select a node first, then Delete Node.");
        return;
      }
      engine.deleteNode(sel.id);
    });

    const deleteEdgeBtn = mkButton("Edge", "Delete Edge", () => {
      const sel = engine.selection;
      if (!sel || sel.type !== "edge") {
        flash("Select an edge first, then Delete Edge.");
        return;
      }
      engine.deleteEdge(sel.id);
    });

    toolbar.appendChild(
      mkGroup(
        "Add",
        `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
        [addNodeBtn, addEdgeBtn]
      )
    );
    toolbar.appendChild(
      mkGroup(
        "Update",
        `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12H4v-2l7.5-7.5zM3 13.5h10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        [updateNodeBtn, updateEdgeBtn]
      )
    );
    toolbar.appendChild(
      mkGroup(
        "Delete",
        `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 5h9M6 5V3.5h4V5M5.5 5l.5 8h4l.5-8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        [deleteNodeBtn, deleteEdgeBtn]
      )
    );

    statusEl = document.createElement("div");
    statusEl.className = "gv-status";
    toolbar.appendChild(statusEl);

    container.appendChild(toolbar);

    function mkButton(text, ariaLabel, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "gv-btn";
      b.textContent = text;
      b.setAttribute("aria-label", ariaLabel);
      b.title = ariaLabel;
      b.addEventListener("click", onClick);
      return b;
    }

    function mkGroup(label, iconSvg, buttons) {
      const group = document.createElement("div");
      group.className = "gv-btn-group";
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", label);

      const badge = document.createElement("span");
      badge.className = "gv-btn-group-badge";
      badge.innerHTML = iconSvg + `<span class="gv-btn-group-label">${label}</span>`;
      group.appendChild(badge);

      const cluster = document.createElement("div");
      cluster.className = "gv-btn-cluster";
      buttons.forEach((b) => cluster.appendChild(b));
      group.appendChild(cluster);

      return group;
    }
  }

  function updateStatus() {
    if (!statusEl) return;
    if (addEdgeMode && !pendingEdgeSource) {
      statusEl.textContent = "Add Edge: click the source node";
    } else if (addEdgeMode && pendingEdgeSource) {
      statusEl.textContent = `Add Edge: click the target node (source = ${pendingEdgeSource})`;
    } else {
      statusEl.textContent = "";
    }
  }

  function flash(msg) {
    if (!statusEl) return;
    const prev = statusEl.textContent;
    statusEl.textContent = msg;
    statusEl.classList.add("gv-status-flash");
    setTimeout(() => {
      statusEl.classList.remove("gv-status-flash");
      updateStatus();
    }, 1400);
  }

  if (options.caption) {
    const cap = document.createElement("div");
    cap.className = "gv-caption";
    cap.textContent = options.caption;
    container.appendChild(cap);
  }

  // ---------- canvas ----------
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "gv-canvas";
  container.appendChild(canvasWrap);

  const svg = d3
    .select(canvasWrap)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "gv-svg");

  // arrow marker for directed graphs
  svg
    .append("defs")
    .append("marker")
    .attr("id", "gv-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 22)
    .attr("refY", 0)
    .attr("markerWidth", 7)
    .attr("markerHeight", 7)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("class", "gv-arrowhead");

  const edgeLayer = svg.append("g").attr("class", "gv-edge-layer");
  const nodeLayer = svg.append("g").attr("class", "gv-node-layer");

  svg.on("click", (event) => {
    if (event.target === svg.node()) {
      engine.clearSelection();
    }
  });

  // Stable simulation-node objects keyed by id, so positions survive re-renders.
  const simNodes = new Map();
  let simLinks = [];

  const simulation = d3
    .forceSimulation()
    .force("charge", d3.forceManyBody().strength(-320))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collide",
      d3.forceCollide().radius((d) => 16 + Math.min((d.degree || 0) * 2, 12))
    )
    .force(
      "link",
      d3
        .forceLink()
        .id((d) => d.id)
        .distance(120)
        .strength(0.4)
    )
    .on("tick", ticked);

  engine.subscribe(render);

  function render(snapshot) {
    // reconcile simNodes map with engine nodes, preserving x/y for existing ones
    const liveIds = new Set(snapshot.nodes.map((n) => n.id));
    for (const id of [...simNodes.keys()]) {
      if (!liveIds.has(id)) simNodes.delete(id);
    }
    const degreeById = new Map(snapshot.nodes.map((n) => [n.id, 0]));
    snapshot.edges.forEach((e) => {
      degreeById.set(e.source, (degreeById.get(e.source) || 0) + 1);
      degreeById.set(e.target, (degreeById.get(e.target) || 0) + 1);
    });

    snapshot.nodes.forEach((n, i) => {
      const degree = degreeById.get(n.id) || 0;
      if (simNodes.has(n.id)) {
        Object.assign(simNodes.get(n.id), { label: n.label, degree });
      } else {
        const angle = (i / Math.max(1, snapshot.nodes.length)) * 2 * Math.PI;
        simNodes.set(n.id, {
          id: n.id,
          label: n.label,
          degree,
          x: width / 2 + 80 * Math.cos(angle) + (Math.random() - 0.5) * 20,
          y: height / 2 + 80 * Math.sin(angle) + (Math.random() - 0.5) * 20,
        });
      }
    });

    simLinks = snapshot.edges.map((e) => ({
      id: e.id,
      label: e.label,
      source: simNodes.get(e.source),
      target: simNodes.get(e.target),
    }));

    drawEdges(snapshot);
    drawNodes(snapshot);

    simulation.nodes([...simNodes.values()]);
    simulation.force("link").links(simLinks);
    simulation.alpha(0.5).restart();

    updateStatus();
  }

  function drawEdges(snapshot) {
    const neighbourEdgeIds = neighbourEdgeIdSet(snapshot);
    const sel = edgeLayer.selectAll("g.gv-edge").data(simLinks, (d) => d.id);
    sel.exit().remove();

    const enter = sel.enter().append("g").attr("class", "gv-edge");
    enter.append("line").attr("class", "gv-edge-line");
    enter.append("text").attr("class", "gv-edge-label");

    const merged = enter.merge(sel);
    merged.attr("data-id", (d) => d.id);
    merged
      .select("line")
      .attr("class", (d) => {
        let cls = "gv-edge-line";
        if (isSelected(snapshot, "edge", d.id)) cls += " gv-selected";
        else if (neighbourEdgeIds.has(d.id)) cls += " gv-neighbour-edge";
        return cls;
      })
      .attr("marker-end", engine.directed ? "url(#gv-arrow)" : null)
      .on("click", (event, d) => {
        event.stopPropagation();
        if (addEdgeMode) return;
        engine.select("edge", d.id);
      });
    merged.select("text").text((d) => d.label || "");
  }

  function drawNodes(snapshot) {
    const neighbourIds = neighbourIdSet(snapshot);
    const sel = nodeLayer.selectAll("g.gv-node").data([...simNodes.values()], (d) => d.id);
    sel.exit().remove();

    const enter = sel.enter().append("g").attr("class", "gv-node").call(drag(simulation));
    enter.append("circle").attr("r", 20);
    enter.append("text").attr("class", "gv-node-label").attr("text-anchor", "middle").attr("dy", "0.32em");

    const merged = enter.merge(sel);
    merged.attr("data-id", (d) => d.id);
    merged
      .select("circle")
      .attr("class", (d) => {
        let cls = "gv-node-circle";
        if (isSelected(snapshot, "node", d.id)) cls += " gv-selected";
        else if (neighbourIds.has(d.id)) cls += " gv-neighbour";
        if (addEdgeMode && pendingEdgeSource === d.id) cls += " gv-pending";
        return cls;
      });
    merged.select("text.gv-node-label").text((d) => d.label);

    merged.on("click", (event, d) => {
      event.stopPropagation();
      if (addEdgeMode) {
        if (!pendingEdgeSource) {
          pendingEdgeSource = d.id;
          updateStatus();
          return;
        }
        const source = pendingEdgeSource;
        const target = d.id;
        pendingEdgeSource = null;
        if (source === target) {
          flash("Source and target can't be the same node.");
          return;
        }
        if (engine.hasEdge(source, target)) {
          flash("That edge already exists.");
          return;
        }
        const sourceLabel = engine.nodes.get(source)?.label ?? source;
        const targetLabel = engine.nodes.get(target)?.label ?? target;
        openPromptModal({
          title: "Add edge",
          message: `Connect ${sourceLabel} → ${targetLabel}. Label / weight is optional.`,
          placeholder: "Edge label / weight",
          submitLabel: "Add",
        }).then((label) => {
          if (label == null) {
            updateStatus();
            return;
          }
          engine.addEdge({ source, target, label: label || "" });
          addEdgeMode = false;
          if (addEdgeBtn) addEdgeBtn.classList.remove("gv-btn-active");
          updateStatus();
        });
        return;
      }
      engine.select("node", d.id);
    });
  }

  function isSelected(snapshot, type, id) {
    return snapshot.selection && snapshot.selection.type === type && snapshot.selection.id === id;
  }

  function neighbourIdSet(snapshot) {
    if (!highlightNeighbours || !snapshot.selection || snapshot.selection.type !== "node") {
      return new Set();
    }
    return new Set(engine.getNeighbours(snapshot.selection.id).map((n) => n.id));
  }

  function neighbourEdgeIdSet(snapshot) {
    if (!highlightNeighbours || !snapshot.selection || snapshot.selection.type !== "node") {
      return new Set();
    }
    return new Set(engine.getNeighbours(snapshot.selection.id).map((n) => n.via));
  }

  function ticked() {
    const pad = 16;
    edgeLayer
      .selectAll("g.gv-edge")
      .select("line")
      .attr("x1", (d) => Math.max(0, Math.min(width, d.source.x)))
      .attr("y1", (d) => Math.max(0, Math.min(height, d.source.y)))
      .attr("x2", (d) => Math.max(0, Math.min(width, d.target.x)))
      .attr("y2", (d) => Math.max(0, Math.min(height, d.target.y)));
    edgeLayer
      .selectAll("g.gv-edge")
      .select("text")
      .attr("x", (d) => (d.source.x + d.target.x) / 2)
      .attr("y", (d) => (d.source.y + d.target.y) / 2 - 6);
    nodeLayer.selectAll("g.gv-node").attr("transform", (d) => {
      d.x = Math.max(pad, Math.min(width - pad, d.x));
      d.y = Math.max(pad, Math.min(height - pad, d.y));
      return `translate(${d.x},${d.y})`;
    });
  }

  function drag(sim) {
    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      // release so the force layout can settle again (same feel as old-qmd)
      d.fx = null;
      d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }
}
