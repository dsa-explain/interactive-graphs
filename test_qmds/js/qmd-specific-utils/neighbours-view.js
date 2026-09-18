// neighbours-view.js
// Lists the neighbours of the currently selected node.

export function mountNeighboursView(engine, container) {
  container.innerHTML = "";
  container.classList.add("nb-root");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = "Neighbours of the selected node";
  container.appendChild(heading);

  const body = document.createElement("div");
  body.className = "adj-body";
  container.appendChild(body);

  engine.subscribe((snapshot) => {
    body.innerHTML = "";

    if (!snapshot.selection || snapshot.selection.type !== "node") {
      const hint = document.createElement("p");
      hint.className = "adj-hint";
      hint.textContent = "Select a node on the graph to see its neighbours here.";
      body.appendChild(hint);
      return;
    }

    const nodeId = snapshot.selection.id;
    const node = snapshot.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const neighbours = engine.getNeighbours(nodeId);

    const summary = document.createElement("p");
    summary.className = "nb-summary";
    summary.innerHTML = `<span class="adj-box adj-key adj-selected">${node.label}</span> has <strong>${neighbours.length}</strong> neighbour${neighbours.length === 1 ? "" : "s"}`;
    body.appendChild(summary);

    const list = document.createElement("div");
    list.className = "nb-list";

    if (neighbours.length === 0) {
      const none = document.createElement("span");
      none.className = "adj-empty";
      none.textContent = "no neighbours";
      list.appendChild(none);
    } else {
      neighbours.forEach(({ id }) => {
        const n = snapshot.nodes.find((x) => x.id === id);
        const chip = document.createElement("span");
        chip.className = "adj-box adj-val nb-chip";
        chip.textContent = n ? n.label : id;
        list.appendChild(chip);
      });
    }

    body.appendChild(list);
  });
}
