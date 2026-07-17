/**
 * graph-actions-panel.js
 * ---------------------------------------------------------------------
 * A second, independent "input step" - plain buttons/inputs instead of
 * a Python editor. It drives the exact same GraphDisplay instance
 * (highlightAdjacent, traversePath, clearHighlights, addNode, addEdge)
 * with no knowledge of Python or Pyodide at all.
 *
 * It exists to prove out the design goal: swapping the input mechanism
 * (this file) never requires changing GraphDisplay. A future "real" UI
 * (drag-and-drop, a node/edge form, a block editor, ...) would look
 * like this file, not like python-editor-input.js.
 *
 * Usage:
 *   import { GraphActionsPanel } from "./graph-actions-panel.js";
 *   GraphActionsPanel.mount(rootElement, { graphDisplay });
 */
export class GraphActionsPanel {
  constructor({ graphDisplay, nodeInput, pathInput, highlightButton, traverseButton, clearButton, addEdgeFromInput, addEdgeToInput, addEdgeButton, status }) {
    this.graphDisplay = graphDisplay;
    this.nodeInput = nodeInput;
    this.pathInput = pathInput;
    this.highlightButton = highlightButton;
    this.traverseButton = traverseButton;
    this.clearButton = clearButton;
    this.addEdgeFromInput = addEdgeFromInput;
    this.addEdgeToInput = addEdgeToInput;
    this.addEdgeButton = addEdgeButton;
    this.status = status;
    this._activeTraversal = null;
  }

  static mount(root, { graphDisplay }) {
    const byRole = role => root.querySelector(`[data-role="${role}"]`);
    const panel = new GraphActionsPanel({
      graphDisplay,
      nodeInput: byRole("adjacent-node-input"),
      pathInput: byRole("path-input"),
      highlightButton: byRole("highlight-adjacent"),
      traverseButton: byRole("traverse-path"),
      clearButton: byRole("clear-highlights"),
      addEdgeFromInput: byRole("add-edge-from-input"),
      addEdgeToInput: byRole("add-edge-to-input"),
      addEdgeButton: byRole("add-edge"),
      status: byRole("actions-status")
    });
    panel.bindEvents();
    return panel;
  }

  bindEvents() {
    this.highlightButton?.addEventListener("click", () => this.highlightAdjacent());
    this.traverseButton?.addEventListener("click", () => this.traversePath());
    this.clearButton?.addEventListener("click", () => this.clearHighlights());
    this.addEdgeButton?.addEventListener("click", () => this.addEdge());
  }

  highlightAdjacent() {
    const nodeId = this.nodeInput?.value.trim();
    if (!nodeId) return this._setStatus("Enter a node id to highlight.");
    this.graphDisplay.clearHighlights();
    const neighbors = this.graphDisplay.highlightAdjacent(nodeId);
    this._setStatus(`Highlighted "${nodeId}" and ${neighbors.length} neighbor(s).`);
  }

  traversePath() {
    const raw = this.pathInput?.value.trim();
    if (!raw) return this._setStatus("Enter a comma-separated path, e.g. Alice,Bob,Carol.");
    const path = raw.split(",").map(part => part.trim()).filter(Boolean);
    if (path.length < 2) return this._setStatus("Enter at least two node ids.");

    this._activeTraversal?.cancel();
    this._setStatus(`Traversing path: ${path.join(" -> ")}`);
    this._activeTraversal = this.graphDisplay.traversePath(path);
    this._activeTraversal.done.then(() => this._setStatus(`Finished traversing: ${path.join(" -> ")}`));
  }

  clearHighlights() {
    this._activeTraversal?.cancel();
    this.graphDisplay.clearHighlights();
    this._setStatus("Highlights cleared.");
  }

  addEdge() {
    const from = this.addEdgeFromInput?.value.trim();
    const to = this.addEdgeToInput?.value.trim();
    if (!from || !to) return this._setStatus("Enter both a from-node and a to-node to add an edge.");
    this.graphDisplay.addEdge(from, to);
    this._setStatus(`Added edge "${from}" - "${to}".`);
    if (this.addEdgeFromInput) this.addEdgeFromInput.value = "";
    if (this.addEdgeToInput) this.addEdgeToInput.value = "";
  }

  _setStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}
