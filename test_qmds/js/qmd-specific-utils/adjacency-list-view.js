// adjacency-list-view.js
// Renders the adjacency list as rows of boxes: [A]: [B] [C]
// Two mount functions are exported:
//   mountAdjacencyListSingle -- shows only the row for the selected node
//                                (the "ease in" widget)
//   mountAdjacencyList        -- shows the full adjacency list

function neighbourIds(snapshot, nodeId, directed) {
  const out = [];
  snapshot.edges.forEach((e) => {
    if (e.source === nodeId) out.push({ id: e.target, weight: e.weight, edgeId: e.id });
    else if (!directed && e.target === nodeId)
      out.push({ id: e.source, weight: e.weight, edgeId: e.id });
  });
  return out;
}

function keyBox(label, selected) {
  const el = document.createElement("span");
  el.className = "adj-box adj-key" + (selected ? " adj-selected" : "");
  el.textContent = label;
  return el;
}

function valBox(label) {
  const el = document.createElement("span");
  el.className = "adj-box adj-val";
  el.textContent = label;
  return el;
}

/**
 * Single-row widget: only ever draws the row for the currently selected
 * node. Meant as a gentle first step before the full list is introduced.
 */
export function mountAdjacencyListSingle(engine, container) {
  container.innerHTML = "";
  container.classList.add("adj-root", "adj-single");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Adjacency row for the selected node";
  container.appendChild(heading);

  const body = document.createElement("div");
  body.className = "adj-body";
  container.appendChild(body);

  engine.subscribe((snapshot) => {
    body.innerHTML = "";

    if (!snapshot.selection || snapshot.selection.type !== "node") {
      const hint = document.createElement("p");
      hint.className = "adj-hint";
      hint.textContent = "Select a node on the graph to see its row here.";
      body.appendChild(hint);
      return;
    }

    const nodeId = snapshot.selection.id;
    const node = snapshot.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const row = document.createElement("div");
    row.className = "adj-row adj-row-single";
    row.appendChild(keyBox(node.label, true));

    const colon = document.createElement("span");
    colon.className = "adj-colon";
    colon.textContent = "\u2192";
    row.appendChild(colon);

    const neighbours = neighbourIds(snapshot, nodeId, snapshot.directed);
    if (neighbours.length === 0) {
      const none = document.createElement("span");
      none.className = "adj-empty";
      none.textContent = "no neighbours";
      row.appendChild(none);
    } else {
      neighbours.forEach((neighbor) => {
        const n = snapshot.nodes.find((x) => x.id === neighbor.id);
        const label = n ? n.label : neighbor.id;
        row.appendChild(
          valBox(
            neighbor.weight !== undefined && neighbor.weight !== 1
              ? `${label} (${neighbor.weight})`
              : label
          )
        );
      });
    }

    body.appendChild(row);
  });
}

/**
 * Full adjacency list: one row per node, in insertion order. The row for
 * the currently selected node is highlighted; a selected edge highlights
 * both the row it belongs to and the specific value box on that row.
 */
export function mountAdjacencyList(engine, container) {
  container.innerHTML = "";
  container.classList.add("adj-root", "adj-full");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Full adjacency list";
  container.appendChild(heading);

  const body = document.createElement("div");
  body.className = "adj-body";
  container.appendChild(body);

  engine.subscribe((snapshot) => {
    body.innerHTML = "";

    if (snapshot.nodes.length === 0) {
      const hint = document.createElement("p");
      hint.className = "adj-hint";
      hint.textContent = "Add a node on the graph to get started.";
      body.appendChild(hint);
      return;
    }

    const selectedEdge =
      snapshot.selection && snapshot.selection.type === "edge"
        ? snapshot.edges.find((e) => e.id === snapshot.selection.id)
        : null;

    const selectedNodeId =
      snapshot.selection && snapshot.selection.type === "node"
        ? snapshot.selection.id
        : null;

    snapshot.nodes.forEach((node) => {
      const isRowSelected = selectedNodeId === node.id;

      const row = document.createElement("div");
      row.className = "adj-row" + (isRowSelected ? " adj-row-selected" : "");
      row.appendChild(keyBox(node.label, isRowSelected));

      const colon = document.createElement("span");
      colon.className = "adj-colon";
      colon.textContent = ":";
      row.appendChild(colon);

      const neighbours = neighbourIds(snapshot, node.id, snapshot.directed);
      if (neighbours.length === 0) {
        const none = document.createElement("span");
        none.className = "adj-empty";
        none.textContent = "\u2013";
        row.appendChild(none);
      } else {
        neighbours.forEach((neighbor) => {
          const n = snapshot.nodes.find((x) => x.id === neighbor.id);
          const label = n ? n.label : neighbor.id;
          const box = valBox(
            neighbor.weight !== undefined && neighbor.weight !== 1
              ? `${label} (${neighbor.weight})`
              : label
          );

          const belongsToSelectedEdge =
            selectedEdge &&
            ((selectedEdge.source === node.id && selectedEdge.target === neighbor.id) ||
              (!snapshot.directed && selectedEdge.target === node.id && selectedEdge.source === neighbor.id));
          if (belongsToSelectedEdge) box.classList.add("adj-edge-selected");

          if (selectedNodeId !== null && neighbor.id === selectedNodeId) {
            box.classList.add("adj-node-selected");
          }

          row.appendChild(box);
        });
      }

      body.appendChild(row);
    });
  });
}
