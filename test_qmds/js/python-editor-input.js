function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class PythonEditorInput {
  constructor({ engine, graphDisplay, editor, runButton, resetButton, syncButton, jsonButton, jsonOutput, status, codeDisplay, stdout, root }) {
    this.engine = engine;
    this.graphDisplay = graphDisplay;
    this.editor = editor;
    this.runButton = runButton;
    this.resetButton = resetButton;
    this.syncButton = syncButton;
    this.jsonButton = jsonButton;
    this.jsonOutput = jsonOutput;
    this.status = status;
    this.codeDisplay = codeDisplay ?? null;
    this.stdout = stdout ?? null;
    this.root = root ?? editor?.closest(".dr-editor-root") ?? editor?.parentElement ?? null;
    this.defaultCode = editor?.value?.trim() ?? "";
    this.lastGeneratedCode = editor?.value ?? "";
    this.isDirty = false;
    this.ignoreEditorChange = false;
    this.locked = false;
  }

  static mount(root, { graphDisplay, engine }) {
    const byRole = role => root.querySelector(`[data-role="${role}"]`);
    const input = new PythonEditorInput({
      engine,
      graphDisplay,
      editor: byRole("python-editor"),
      runButton: byRole("run-code"),
      resetButton: byRole("reset-code"),
      syncButton: byRole("sync-code"),
      jsonButton: byRole("show-json"),
      jsonOutput: byRole("json-output"),
      status: byRole("status"),
      codeDisplay: byRole("python-code-display"),
      stdout: byRole("python-stdout"),
      root
    });
    input.bindEvents();
    return input;
  }

  /**
   * Type-friendly editor used by play/pause exercises. Builds the textarea +
   * locked line-highlight view inside `root`. No graph engine required.
   */
  static mountPlayable(root, { defaultCode = "", heading = "Python" } = {}) {
    if (!root) return null;
    root.classList.add("dr-editor-root");
    root.innerHTML = `
      <h3>${escapeHtml(heading)}</h3>
      <textarea data-role="python-editor" class="dr-textarea" rows="18" spellcheck="false"></textarea>
      <pre data-role="python-code-display" class="dr-code-display" hidden></pre>
      <div class="dr-stdout-wrap">
        <div class="dr-stdout-header">
          <div class="dr-stdout-label">Output</div>
          <button type="button" data-role="clear-stdout" class="ht-nav-btn ht-nav-btn-ghost dr-stdout-clear">Clear output</button>
        </div>
        <pre data-role="python-stdout" class="dr-stdout dr-stdout-empty">print() output will appear here.</pre>
      </div>
      <div data-role="status" class="dr-editor-status"></div>
    `;
    const editor = root.querySelector('[data-role="python-editor"]');
    editor.value = defaultCode;
    const input = new PythonEditorInput({
      editor,
      codeDisplay: root.querySelector('[data-role="python-code-display"]'),
      stdout: root.querySelector('[data-role="python-stdout"]'),
      status: root.querySelector('[data-role="status"]'),
      root
    });
    input.defaultCode = defaultCode;
    input.lastGeneratedCode = defaultCode;
    input.bindEvents();
    root.querySelector('[data-role="clear-stdout"]')?.addEventListener("click", () => {
      input.requestClearStdout();
    });
    return input;
  }

  bindEvents() {
    this.runButton?.addEventListener("click", () => this.runAndApply());
    this.resetButton?.addEventListener("click", () => this.reset());
    this.syncButton?.addEventListener("click", () => this._syncGraphToCode());
    this.jsonButton?.addEventListener("click", () => this.toggleJSON());
    this.editor?.addEventListener("input", () => {
      if (this.ignoreEditorChange || this.locked) return;
      this.isDirty = this.editor.value !== this.lastGeneratedCode;
    });
    this.editor?.addEventListener("keydown", (event) => {
      if (this.locked) event.preventDefault();
    });
  }

  getCode() {
    return this.editor?.value ?? "";
  }

  setCode(code) {
    if (!this.editor) return;
    this.ignoreEditorChange = true;
    this.editor.value = code;
    this.ignoreEditorChange = false;
    this.isDirty = code !== this.lastGeneratedCode;
    if (this.locked) this._syncCodeDisplay();
  }

  lock() {
    this.locked = true;
    this.root?.classList.add("dr-editor-locked");
    if (this.editor) {
      this.editor.readOnly = true;
      this.editor.setAttribute("aria-readonly", "true");
    }
    if (this.codeDisplay) {
      this._syncCodeDisplay();
      this.codeDisplay.hidden = false;
      if (this.editor) this.editor.hidden = true;
    }
    this._setStatus("Editor locked while playing.");
  }

  unlock() {
    this.locked = false;
    this.root?.classList.remove("dr-editor-locked");
    this.clearLineHighlight();
    if (this.codeDisplay) this.codeDisplay.hidden = true;
    if (this.editor) {
      this.editor.hidden = false;
      this.editor.readOnly = false;
      this.editor.removeAttribute("aria-readonly");
    }
    this._setStatus("");
  }

  /** 1-based line number; pass null to clear. */
  highlightLine(lineNumber) {
    if (!this.locked) this.lock();
    this._syncCodeDisplay(lineNumber);
  }

  clearLineHighlight() {
    if (!this.codeDisplay || this.codeDisplay.hidden) return;
    this._syncCodeDisplay(null);
  }

  /** Show captured stdout/stderr in the Output panel. */
  setStdout(text, { isError = false } = {}) {
    if (!this.stdout) return;
    const empty = !text;
    this.stdout.textContent = empty ? "print() output will appear here." : text;
    this.stdout.classList.toggle("dr-stdout-empty", empty);
    this.stdout.classList.toggle("dr-stdout-error", !empty && isError);
    if (!empty) this.stdout.scrollTop = this.stdout.scrollHeight;
  }

  clearStdout() {
    this.setStdout("");
  }

  requestClearStdout() {
    this.clearStdout();
    this.onClearStdout?.();
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
    if (this.locked) this.unlock();
    if (this.editor) this.editor.value = this.defaultCode;
    this.isDirty = this.editor && this.editor.value !== this.lastGeneratedCode;
    this.clearStdout();
    this._setStatus("Code reset.");
  }

  toggleJSON() {
    if (!this.jsonOutput) return;
    this.jsonOutput.hidden = !this.jsonOutput.hidden;
    if (!this.jsonOutput.hidden) this._renderJSON();
    if (this.jsonButton) this.jsonButton.textContent = this.jsonOutput.hidden ? "Show current JSON" : "Hide current JSON";
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

  _syncCodeDisplay(activeLine = null) {
    if (!this.codeDisplay) return;
    const lines = this.getCode().split("\n");
    this.codeDisplay.innerHTML = lines
      .map((line, i) => {
        const n = i + 1;
        const cls = n === activeLine ? "dr-line dr-line-active" : "dr-line";
        const text = line.length ? escapeHtml(line) : " ";
        return `<span class="${cls}" data-line="${n}">${text}</span>`;
      })
      .join("");
    const active = this.codeDisplay.querySelector(".dr-line-active");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  _setStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}
