import {
  EditorView,
  keymap,
  Decoration,
  EditorState,
  Compartment,
  Prec,
  StateEffect,
  StateField,
  indentUnit,
  indentWithTab,
  python,
  basicSetup
} from "../vendor/codemirror-python.js";
import { escapeHtml } from "../utils/dom-utils.js";

const setLineHighlight = StateEffect.define();

const lineHighlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    let lineNumber = null;
    let found = false;
    for (const effect of tr.effects) {
      if (effect.is(setLineHighlight)) {
        found = true;
        lineNumber = effect.value;
      }
    }
    if (!found) return deco.map(tr.changes);
    if (lineNumber == null) return Decoration.none;
    if (lineNumber < 1 || lineNumber > tr.state.doc.lines) return Decoration.none;
    const line = tr.state.doc.line(lineNumber);
    return Decoration.set([
      Decoration.line({ class: "dr-cm-line-active" }).range(line.from)
    ]);
  },
  provide: field => EditorView.decorations.from(field)
});

const editorTheme = EditorView.theme({
  "&": {
    height: "360px",
    fontSize: "13.5px",
    backgroundColor: "#fffdf9",
    color: "#19162b"
  },
  ".cm-scroller": {
    fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", Menlo, Consolas, monospace',
    lineHeight: "1.65",
    overflow: "auto"
  },
  ".cm-content": {
    padding: "10px 0",
    caretColor: "#19162b"
  },
  ".cm-gutters": {
    backgroundColor: "#f7f0e2",
    color: "#6a6986",
    borderRight: "1px solid #e2d6c0"
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#ffe9c3"
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(254, 182, 134, 0.18)"
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(134, 192, 254, 0.35)"
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#19162b"
  }
});

export class PythonEditorInput {
  constructor({ engine, graphDisplay, editor, runButton, resetButton, syncButton, jsonButton, jsonOutput, status, codeDisplay, stdout, root, solutionCode, revealButton }) {
    this.engine = engine;
    this.graphDisplay = graphDisplay;
    this.editor = editor;
    this.runButton = runButton;
    this.syncButton = syncButton;
    this.jsonButton = jsonButton;
    this.jsonOutput = jsonOutput;
    this.status = status;
    this.codeDisplay = codeDisplay ?? null;
    this.stdout = stdout ?? null;
    this.root = root ?? editor?.closest(".dr-editor-root") ?? editor?.parentElement ?? null;
    this.root?.classList.add("dr-editor-root");
    this.revealButton = revealButton ?? this.root?.querySelector('[data-role="reveal-solution"]') ?? null;
    this.resetButton = resetButton ?? this.root?.querySelector('[data-role="reset-code"]') ?? null;
    this.defaultCode = editor?.value ?? "";
    this.solutionCode = solutionCode ?? "";
    this.lastGeneratedCode = editor?.value ?? "";
    this.isDirty = false;
    this.ignoreEditorChange = false;
    this.locked = false;
    this.onClearStdout = null;
    this._activeLine = null;
    this.cm = null;
    this._readOnly = new Compartment();
    this._initCodeMirror();
    this._syncRevealButton();
  }

  static mount(root, { graphDisplay, engine, solutionCode = "" } = {}) {
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
      revealButton: byRole("reveal-solution"),
      solutionCode,
      root
    });
    input.bindEvents();
    return input;
  }

  /**
   * Type-friendly editor used by play/pause exercises. Builds the textarea +
   * locked line-highlight view inside `root`. No graph engine required.
   * Pass `solutionCode` to show a Reveal solution button that replaces the
   * editor contents with that code.
   */
  static mountPlayable(root, { defaultCode = "", solutionCode = "", heading = "Python" } = {}) {
    if (!root) return null;
    root.classList.add("dr-editor-root");
    root.innerHTML = `
      <div class="dr-editor-toolbar">
        <h3>${escapeHtml(heading)}</h3>
        <div class="dr-editor-toolbar-actions">
          <button type="button" data-role="reset-code" class="ht-nav-btn ht-nav-btn-ghost dr-reset-btn">Reset</button>
          <button type="button" data-role="reveal-solution" class="ht-nav-btn dr-reveal-btn" hidden>Reveal solution</button>
        </div>
      </div>
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
      resetButton: root.querySelector('[data-role="reset-code"]'),
      revealButton: root.querySelector('[data-role="reveal-solution"]'),
      solutionCode,
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
    this.revealButton?.addEventListener("click", () => this.revealSolution());
    this.editor?.addEventListener("input", () => {
      if (this.cm || this.ignoreEditorChange || this.locked) return;
      this.isDirty = this.editor.value !== this.lastGeneratedCode;
    });
    this.editor?.addEventListener("keydown", (event) => {
      if (this.locked) event.preventDefault();
      if (this.cm) return;
      this._handlePlainTextTab(event);
    });
  }

  getCode() {
    if (this.cm) return this.cm.state.doc.toString();
    return this.editor?.value ?? "";
  }

  setCode(code) {
    const next = code ?? "";
    this.ignoreEditorChange = true;
    if (this.cm) {
      this.cm.dispatch({
        changes: { from: 0, to: this.cm.state.doc.length, insert: next }
      });
    }
    if (this.editor) this.editor.value = next;
    this.ignoreEditorChange = false;
    this.isDirty = next !== this.lastGeneratedCode;
    if (this.locked) this._syncCodeDisplay();
  }

  setSolutionCode(code) {
    this.solutionCode = code ?? "";
    this._syncRevealButton();
  }

  /** Replace the editor contents with `code`, or the configured solution. */
  revealSolution(code) {
    const next = code ?? this.solutionCode ?? "";
    if (!next) return;
    if (this.locked) this.unlock();
    this.setCode(next);
    this._setStatus("Solution revealed.");
  }

  lock() {
    this.locked = true;
    this._activeLine = null;
    this.root?.classList.add("dr-editor-locked");
    if (this.revealButton) this.revealButton.disabled = true;
    if (this.resetButton) this.resetButton.disabled = true;
    this._setReadOnly(true);
    if (this.editor) {
      this.editor.readOnly = true;
      this.editor.setAttribute("aria-readonly", "true");
    }
    if (this.cm) {
      if (this.editor) this.editor.hidden = true;
      if (this.codeDisplay) this.codeDisplay.hidden = true;
    } else if (this.codeDisplay) {
      this._syncCodeDisplay();
      this.codeDisplay.hidden = false;
      if (this.editor) this.editor.hidden = true;
    }
    this._setStatus("Editor locked while playing.");
  }

  unlock() {
    this.locked = false;
    this._activeLine = null;
    this.root?.classList.remove("dr-editor-locked");
    this.clearLineHighlight();
    if (this.revealButton) this.revealButton.disabled = false;
    if (this.resetButton) this.resetButton.disabled = false;
    this._setReadOnly(false);
    if (this.codeDisplay) this.codeDisplay.hidden = true;
    if (this.editor) {
      this.editor.hidden = Boolean(this.cm);
      this.editor.readOnly = false;
      this.editor.removeAttribute("aria-readonly");
    }
    this._setStatus("");
  }

  /** 1-based line number; pass null to clear. */
  highlightLine(lineNumber) {
    if (!this.locked) this.lock();
    if (this._activeLine === lineNumber) return;
    this._activeLine = lineNumber;
    if (this.cm) this._highlightCmLine(lineNumber);
    else this._syncCodeDisplay(lineNumber);
  }

  clearLineHighlight() {
    this._activeLine = null;
    if (this.cm) this._highlightCmLine(null);
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
      const rawGraph = await this.engine.run(this.getCode());
      this.graphDisplay.setGraph(rawGraph);
      this._setStatus("Python executed and graph rendered.");
      if (this.jsonOutput && !this.jsonOutput.hidden) this._renderJSON();
    } catch (error) {
      this._setStatus(`Error: ${error}`);
    }
  }

  reset() {
    if (this.locked) this.unlock();
    this.setCode(this.defaultCode);
    this.isDirty = this.getCode() !== this.lastGeneratedCode;
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
    if (!this.editor && !this.cm) return;
    const graph = this.graphDisplay.toJSON();
    const code = this._generatePythonCode(graph);
    if (code === this.getCode()) {
      this.lastGeneratedCode = code;
      this.isDirty = false;
      return;
    }
    this.setCode(code);
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

  _initCodeMirror() {
    if (!this.editor || this.cm) return;
    const host = document.createElement("div");
    host.className = "dr-cm-host";
    host.setAttribute("data-role", "python-editor-host");
    this.editor.insertAdjacentElement("beforebegin", host);
    this.editor.hidden = true;
    this.editor.setAttribute("aria-hidden", "true");
    this.editor.tabIndex = -1;
    this.editor.classList.add("dr-textarea-hidden");

    const onUpdate = EditorView.updateListener.of(update => {
      if (!update.docChanged) return;
      if (this.editor) this.editor.value = update.state.doc.toString();
      if (this.ignoreEditorChange || this.locked) return;
      this.isDirty = update.state.doc.toString() !== this.lastGeneratedCode;
    });

    this.cm = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: this.editor.value ?? "",
        extensions: [
          basicSetup,
          python(),
          editorTheme,
          indentUnit.of("    "),
          Prec.high(keymap.of([indentWithTab])),
          this._readOnly.of(EditorState.readOnly.of(false)),
          lineHighlightField,
          onUpdate
        ]
      })
    });
  }

  _setReadOnly(readOnly) {
    if (!this.cm) return;
    this.cm.dispatch({
      effects: this._readOnly.reconfigure(EditorState.readOnly.of(readOnly))
    });
  }

  _highlightCmLine(lineNumber) {
    if (!this.cm) return;
    const effects = [setLineHighlight.of(lineNumber)];
    if (lineNumber != null && lineNumber >= 1 && lineNumber <= this.cm.state.doc.lines) {
      const line = this.cm.state.doc.line(lineNumber);
      effects.push(EditorView.scrollIntoView(line.from, { y: "nearest" }));
    }
    this.cm.dispatch({ effects });
  }

  _syncRevealButton() {
    if (!this.revealButton) return;
    this.revealButton.hidden = !String(this.solutionCode ?? "").trim();
  }

  _handlePlainTextTab(event) {
    if (event.key !== "Tab" || this.locked) return;
    event.preventDefault();
    const textarea = this.editor;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const indent = "    ";
    if (event.shiftKey) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const prefix = value.slice(lineStart, start);
      const remove = prefix.startsWith(indent) ? indent.length : prefix.startsWith("\t") ? 1 : 0;
      if (!remove) return;
      textarea.setRangeText("", lineStart, lineStart + remove, "end");
    } else {
      textarea.setRangeText(indent, start, end, "end");
    }
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
