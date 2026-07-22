// adjacency-matrix-view.js
// Renders the adjacency matrix as a grid of boxes (not a plain <table>),
// styled consistently with the adjacency list view. Two mount functions:
//   mountAdjacencyMatrixSingle -- one row: selected node vs every node
//   mountAdjacencyMatrix        -- the full N x N matrix

function cellValue(snapshot, rowId, colId) {
  const edge = snapshot.edges.find(
    (e) =>
      (e.source === rowId && e.target === colId) ||
      (!snapshot.directed && e.source === colId && e.target === rowId)
  );
  return edge ? { on: true, edge } : { on: false, edge: null };
}

function headCell(label, selected) {
  const el = document.createElement("div");
  el.className = "mat-cell mat-head" + (selected ? " adj-selected" : "");
  el.textContent = label;
  return el;
}

function dataCell(on, isEdgeSelected, isCrosshair) {
  const el = document.createElement("div");
  el.className =
    "mat-cell mat-data" +
    (on ? " mat-on" : " mat-off") +
    (isCrosshair ? " mat-crosshair" : "") +
    (isEdgeSelected ? " adj-edge-selected" : "");
  el.textContent = on ? "1" : "0";
  return el;
}

/**
 * Single-row widget: header of all node labels, then one row for the
 * currently selected node, cell-by-cell against every other node.
 */
export function mountAdjacencyMatrixSingle(engine, container) {
  container.innerHTML = "";
  container.classList.add("adj-root", "mat-single");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Matrix row for the selected node";
  container.appendChild(heading);

  const body = document.createElement("div");
  body.className = "adj-body";
  container.appendChild(body);

  engine.subscribe((snapshot) => {
    body.innerHTML = "";

    if (!snapshot.selection || snapshot.selection.type !== "node") {
      const hint = document.createElement("p");
      hint.className = "adj-hint";
      hint.textContent = "Select a node on the graph to see its matrix row here.";
      body.appendChild(hint);
      return;
    }

    const rowId = snapshot.selection.id;
    const rowNode = snapshot.nodes.find((n) => n.id === rowId);
    if (!rowNode) return;

    const grid = document.createElement("div");
    grid.className = "mat-grid";
    grid.style.gridTemplateColumns = `repeat(${snapshot.nodes.length + 1}, auto)`;

    grid.appendChild(headCell("", false));
    snapshot.nodes.forEach((n) => grid.appendChild(headCell(n.label, false)));

    grid.appendChild(headCell(rowNode.label, true));
    snapshot.nodes.forEach((n) => {
      const { on } = cellValue(snapshot, rowId, n.id);
      grid.appendChild(dataCell(on, false, n.id === rowId));
    });

    body.appendChild(grid);
  });
}

/**
 * Full N x N adjacency matrix. The row and column of the selected node are
 * both highlighted; a selected edge highlights its specific cell(s).
 */
export function mountAdjacencyMatrix(engine, container) {
  container.innerHTML = "";
  container.classList.add("adj-root", "mat-full");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Full adjacency matrix";
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

    const selectedNodeId =
      snapshot.selection && snapshot.selection.type === "node" ? snapshot.selection.id : null;
    const selectedEdge =
      snapshot.selection && snapshot.selection.type === "edge"
        ? snapshot.edges.find((e) => e.id === snapshot.selection.id)
        : null;

    const grid = document.createElement("div");
    grid.className = "mat-grid";
    grid.style.gridTemplateColumns = `repeat(${snapshot.nodes.length + 1}, auto)`;

    grid.appendChild(headCell("", false));
    snapshot.nodes.forEach((n) => grid.appendChild(headCell(n.label, n.id === selectedNodeId)));

    snapshot.nodes.forEach((rowNode) => {
      grid.appendChild(headCell(rowNode.label, rowNode.id === selectedNodeId));
      snapshot.nodes.forEach((colNode) => {
        const { on, edge } = cellValue(snapshot, rowNode.id, colNode.id);
        const isCrosshair = rowNode.id === selectedNodeId || colNode.id === selectedNodeId;
        const isEdgeSelected = !!(selectedEdge && edge && edge.id === selectedEdge.id);
        grid.appendChild(dataCell(on, isEdgeSelected, isCrosshair));
      });
    });

    body.appendChild(grid);
  });
}
