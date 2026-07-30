export class PythonEditorInput {
  constructor({ engine, graphDisplay, editor, runButton, resetButton, jsonButton, jsonOutput, status }) {
    this.engine = engine;
    this.graphDisplay = graphDisplay;
    this.editor = editor;
    this.runButton = runButton;
    this.resetButton = resetButton;
    this.jsonButton = jsonButton;
    this.jsonOutput = jsonOutput;
    this.status = status;
    this.defaultCode = editor.value.trim();
  }

  static mount(root, { graphDisplay, engine }) {
    const byRole = role => root.querySelector(`[data-role="${role}"]`);
    const input = new PythonEditorInput({
      engine,
      graphDisplay,
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
  }

  async start() {
    this._setStatus("Loading Pyodide…");
    await this.engine.init();
    this._setStatus("Pyodide ready. Run Python to render the graph.");
    await this.runAndApply();
  }

  async runAndApply() {
    try {
      this._setStatus("Running Python…");
      const rawGraph = await this.engine.run(this.editor.value);
      this.graphDisplay.setGraph(rawGraph);
      this._setStatus("Python executed and graph rendered.");
      if (this.jsonOutput && !this.jsonOutput.hidden) this._renderJSON();
    } catch (error) {
      this._setStatus(`Error: ${error}`);
    }
  }

  reset() {
    this.editor.value = this.defaultCode;
    this._setStatus("Code reset. Run Python to update the graph.");
  }

  toggleJSON() {
    if (!this.jsonOutput) return;
    this.jsonOutput.hidden = !this.jsonOutput.hidden;
    if (!this.jsonOutput.hidden) this._renderJSON();
    if (this.jsonButton) this.jsonButton.textContent = this.jsonOutput.hidden ? "Show current JSON" : "Hide current JSON";
  }

  _renderJSON() {
    this.jsonOutput.textContent = JSON.stringify(this.graphDisplay.toJSON(), null, 2);
  }

  _setStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}
