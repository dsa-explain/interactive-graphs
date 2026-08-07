export class PythonEditorInput {
  constructor({ engine, graphDisplay, graphEngine, editor, runButton, resetButton, jsonButton, jsonOutput, status }) {
    this.engine = engine;
    this.graphDisplay = graphDisplay;
    this.graphEngine = graphEngine;
    this.editor = editor;
    this.runButton = runButton;
    this.resetButton = resetButton;
    this.jsonButton = jsonButton;
    this.jsonOutput = jsonOutput;
    this.status = status;
    this.defaultCode = editor.value.trim();
    this.lastGeneratedCode = editor.value;
    this.isDirty = false;
    this.ignoreEditorChange = false;
    this.editorRunTimer = null;
  }

  static mount(root, { graphDisplay, engine, graphEngine }) {
    const byRole = role => root.querySelector(`[data-role="${role}"]`);
    const input = new PythonEditorInput({
      engine,
      graphDisplay,
      graphEngine,
      editor: byRole("python-editor"),
      runButton: byRole("run-code"),
      resetButton: byRole("reset-code"),
      jsonButton: byRole("show-json"),
      jsonOutput: byRole("json-output"),
      status: byRole("status")
    });
    input.bindEvents();
    return input;
  }

  bindEvents() {
    this.runButton?.addEventListener("click", () => this.runAndApply());
    this.resetButton?.addEventListener("click", () => this.reset());
    this.jsonButton?.addEventListener("click", () => this.toggleJSON());
    this.editor?.addEventListener("input", () => {
      if (this.ignoreEditorChange) return;
      this.isDirty = this.editor.value !== this.lastGeneratedCode;
      this._scheduleEditorRun();
    });
  }

  async start() {
    this._setStatus("Loading Pyodide…");
    await this.engine.init();
    this._setStatus("Pyodide ready. Run Python to render the graph.");
    await this.runAndApply();
    if (this.graphEngine) {
      this.graphEngine.subscribe(() => this._onGraphUpdate());
    }
  }

  async runAndApply() {
    try {
      this._setStatus("Running Python…");
      const rawGraph = await this.engine.run(this.editor.value);
      this.graphDisplay.setGraph(rawGraph);
      this._setStatus("Python executed and graph rendered.");
      if (this.jsonOutput && !this.jsonOutput.hidden) this._renderJSON();
      if (!this.isDirty) {
        this._syncGraphToCode();
      }
    } catch (error) {
      this._setStatus(`Error: ${error}`);
    } finally {
      this.editorRunTimer = null;
    }
  }

  reset() {
    this.editor.value = this.defaultCode;
    if (this.editorRunTimer) {
      clearTimeout(this.editorRunTimer);
      this.editorRunTimer = null;
    }
    this.isDirty = this.editor.value !== this.lastGeneratedCode;
    this._setStatus("Code reset. Run Python to update the graph.");
  }

  toggleJSON() {
    if (!this.jsonOutput) return;
    this.jsonOutput.hidden = !this.jsonOutput.hidden;
    if (!this.jsonOutput.hidden) this._renderJSON();
    if (this.jsonButton) this.jsonButton.textContent = this.jsonOutput.hidden ? "Show current JSON" : "Hide current JSON";
  }

  _onGraphUpdate() {
    if (this.isDirty) return;
    this._syncGraphToCode();
  }

  _scheduleEditorRun() {
    if (this.editorRunTimer) clearTimeout(this.editorRunTimer);
    this.editorRunTimer = setTimeout(() => this.runAndApply(), 500);
  }

  _syncGraphToCode() {
    if (!this.editor) return;
    const graph = this.graphDisplay.toJSON();
    const code = this._generatePythonCode(graph);
    if (code === this.editor.value) {
      this.lastGeneratedCode = code;
      this.isDirty = false;
      return;
    }
    this.ignoreEditorChange = true;
    this.editor.value = code;
    this.ignoreEditorChange = false;
    this.lastGeneratedCode = code;
    this.isDirty = false;
    if (this.jsonOutput && !this.jsonOutput.hidden) this._renderJSON();
  }

  _generatePythonCode(graph) {
    const parts = ["G = nx.Graph()"];
    const nodeLines = [];
    const edgeLines = [];

    for (const node of graph.nodes || []) {
      const id = JSON.stringify(node.id);
      if (node.label !== undefined && node.label !== node.id) {
        nodeLines.push(`G.add_node(${JSON.stringify(node.label)})`);
      } else {
        nodeLines.push(`G.add_node(${id})`);
      }
    }

    for (const edge of graph.edges || []) {
      const source = JSON.stringify(edge.source);
      const target = JSON.stringify(edge.target);
      const attrs = [];
      if (edge.label !== undefined && edge.label !== "") {
        attrs.push(`label=${JSON.stringify(edge.label)}`);
      }
      if (edge.weight !== undefined && edge.weight !== 1) {
        attrs.push(`weight=${edge.weight}`);
      }
      const attrText = attrs.length > 0 ? `, ${attrs.join(", ")}` : "";
      edgeLines.push(`G.add_edge(${source}, ${target}${attrText})`);
    }

    return [...parts, ...nodeLines, ...edgeLines, ""].join("\n");
  }

  _renderJSON() {
    this.jsonOutput.textContent = JSON.stringify(this.graphDisplay.toJSON(), null, 2);
  }

  _setStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}
