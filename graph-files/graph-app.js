/**
 * graph-app.js
 * ---------------------------------------------------------------------
 * Top-level composition root for the demo widget. It creates one
 * GraphDisplay, embeds its viewport, and attaches two interchangeable
 * input steps (the Python editor and a plain button panel).
 *
 * Everything is looked up via `data-role` attributes *scoped to a root
 * element* (not global ids), so this is safe to mount more than once
 * on the same page/qmd.
 *
 * Usage:
 *   import { GraphApp } from "./graph-app.js";
 *   GraphApp.mount(document.getElementById("graph-widget-1"), {
 *     d3: window.d3
 *   });
 */
import { GraphDisplay } from "./graph-display.js";
import { PyGraphEngine } from "./py-graph-engine.js";
import { PythonEditorInput } from "./python-editor-input.js";
import { GraphActionsPanel } from "./graph-actions-panel.js";

export class GraphApp {
  constructor({ graphDisplay, pythonInput, actionsPanel }) {
    this.graphDisplay = graphDisplay;
    this.pythonInput = pythonInput;
    this.actionsPanel = actionsPanel;
  }

  static mount(root, { d3, pyodideIndexURL } = {}) {
    if (!root) throw new Error("GraphApp.mount requires a root element");
    if (!d3) throw new Error("GraphApp.mount requires a `d3` reference");

    const graphDisplay = new GraphDisplay({ d3 });
    const viewportContainer = root.querySelector('[data-role="viewport-container"]');
    viewportContainer?.appendChild(graphDisplay.getViewportElement());

    const engine = new PyGraphEngine({ indexURL: pyodideIndexURL });
    const pythonInput = PythonEditorInput.mount(root, { graphDisplay, engine });

    const actionsPanel = GraphActionsPanel.mount(root, { graphDisplay });

    const app = new GraphApp({ graphDisplay, pythonInput, actionsPanel });
    app.start();
    return app;
  }

  async start() {
    await this.pythonInput.start();
  }
}
