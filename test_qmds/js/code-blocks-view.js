// code-blocks-view.js
// Drag-and-drop code-block palette + plan workspace (side by side).
// Click a block to toggle between its plain-language label and its code.
// Container blocks (those whose code ends with ":") accept nested drops.
// Each block may be used at most once — placing it removes it from the palette.

const DEFAULT_BLOCKS = [
  { id: "count0", label: "initialise total count as 0", code: "count = 0" },
  { id: "visited", label: "initialise visited as an empty set", code: "visited = set()" },
  { id: "inc", label: "increment count by 1", code: "count += 1" },
  { id: "def_traverse", label: "define traverse function", code: "def traverse(node):", container: true },
  { id: "mark", label: "record node as visited", code: "visited.add(node)" },
  { id: "for_neighbor", label: "for each neighbor of node", code: "for neighbor in node.neighbors:", container: true },
  { id: "if_unvisited", label: "if neighbor is not visited", code: "if neighbor not in visited:", container: true },
  { id: "recurse", label: "traverse the neighbor", code: "traverse(neighbor)" },
];

const DEFAULT_PREPLACED = ["count0", "visited"];

/** True if a string looks like a Python statement rather than prose. */
function looksLikePython(s) {
  if (!s || typeof s !== "string") return false;
  const t = s.trim();
  return (
    /^(def |for |if |while |with |class |return |pass\b)/.test(t) ||
    /:\s*$/.test(t) ||
    /^(count|visited)\b/.test(t) ||
    /\w+\.\w+\(/.test(t) ||
    /\+\=/.test(t) ||
    /^\w+\s*=/.test(t) ||
    /^\w+\([^)]*\)\s*$/.test(t)
  );
}

/**
 * Resolve the executable Python line for a block definition.
 * Authors may put source in `python`, `code`, or `label` (the qmd page
 * uses label for source and code for the plain-language description).
 */
function pythonSnippet(def) {
  if (def.python) return def.python.trim();
  const labelPy = looksLikePython(def.label);
  const codePy = looksLikePython(def.code);
  if (labelPy && !codePy) return def.code.trim();
  if (codePy) return (def.code || "").trim();
  return (def.code || def.label || "").trim();
}

function headerLine(def) {
  let line = pythonSnippet(def);
  if (def.container && line && !/:\s*$/.test(line)) line += ":";
  return line;
}

/**
 * Convert a getPlan() tree into indented Python source.
 * @param {Array<{python?: string, code?: string, label?: string, children?: Array}>} plan
 * @param {{indent?: number}} [opts]
 * @returns {string}
 */
export function planToPython(plan, opts = {}) {
  const indentSize = opts.indent ?? 4;
  const pad = (depth) => " ".repeat(depth * indentSize);

  function emitNode(node, depth) {
    const def = {
      label: node.label ?? "",
      code: node.code ?? "",
      python: node.python,
      container: Array.isArray(node.children),
    };
    const line = headerLine(def);
    // A block's code may itself span multiple physical lines (e.g. a
    // fixed if/break combo treated as one atomic draggable block) — pad
    // every line, not just the first.
    const lines = line ? line.split("\n").map((l) => pad(depth) + l) : [];
    if (Array.isArray(node.children)) {
      if (node.children.length === 0) {
        lines.push(pad(depth + 1) + "pass");
      } else {
        node.children.forEach((child) => {
          lines.push(...emitNode(child, depth + 1));
        });
      }
    }
    return lines;
  }

  return (plan ?? []).flatMap((n) => emitNode(n, 0)).join("\n");
}

/**
 * @param {HTMLElement} container
 * @param {Array<{id?: string, label: string, code: string, python?: string, container?: boolean}>} [blocks]
 * @param {{
 *   heading?: string,
 *   workspaceLabel?: string,
 *   preplaced?: string[],
 *   solutionOrder?: string[],
 *   lockedBefore?: Array<{code: string, label?: string}>,
 *   lockedContainer?: {code: string, label?: string},
 * }} [options]
 */
export function mountCodeBlocksView(container, blocks = DEFAULT_BLOCKS, options = {}) {
  if (!container) return;

  const defs = (blocks?.length ? blocks : DEFAULT_BLOCKS).map((b, i) => {
    const base = {
      id: b.id ?? `blk_${i}`,
      label: b.label,
      code: b.code,
      python: b.python,
    };
    const snippet = pythonSnippet(base);
    return {
      ...base,
      container: b.container ?? /:\s*$/.test(snippet),
    };
  });
  const defById = new Map(defs.map((d) => [d.id, d]));
  const preplaced = options.preplaced ?? DEFAULT_PREPLACED;
  const solutionOrder = options.solutionOrder ?? null;
  const lockedBefore = options.lockedBefore ?? [];
  const lockedContainer = options.lockedContainer ?? null;

  // Stable shuffle order for the palette (re-applied after each render).
  const paletteOrder = defs.map((d) => d.id);
  for (let i = paletteOrder.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paletteOrder[i], paletteOrder[j]] = [paletteOrder[j], paletteOrder[i]];
  }

  const used = new Set();

  container.innerHTML = "";
  container.classList.add("cb-root");

  const heading = document.createElement("div");
  heading.className = "adj-heading";
  heading.textContent = options.heading ?? "Available Code Blocks";
  container.appendChild(heading);

  const hint = document.createElement("p");
  hint.className = "adj-hint cb-hint";
  hint.textContent = "Click a block to toggle code. Drag from the left into your plan on the right.";
  container.appendChild(hint);

  const columns = document.createElement("div");
  columns.className = "cb-columns";
  container.appendChild(columns);

  const leftCol = document.createElement("div");
  leftCol.className = "cb-col cb-col-palette";
  columns.appendChild(leftCol);

  const paletteLabel = document.createElement("div");
  paletteLabel.className = "cb-section-label";
  paletteLabel.textContent = "Blocks";
  leftCol.appendChild(paletteLabel);

  const palette = document.createElement("div");
  palette.className = "cb-palette";
  leftCol.appendChild(palette);

  const rightCol = document.createElement("div");
  rightCol.className = "cb-col cb-col-workspace";
  columns.appendChild(rightCol);

  const workspaceLabel = document.createElement("div");
  workspaceLabel.className = "cb-section-label";
  workspaceLabel.textContent = options.workspaceLabel ?? "Your plan";
  rightCol.appendChild(workspaceLabel);

  /** A fixed, non-interactive block: no drag handle, no delete button. */
  function createLockedBlockElement(def, { isContainer = false, slotEl = null } = {}) {
    const el = document.createElement("div");
    el.className = "cb-block cb-locked" + (isContainer ? " cb-container" : "");
    const row = document.createElement("div");
    row.className = "cb-block-row";
    const label = document.createElement("span");
    label.className = "cb-block-label";
    label.textContent = def.code ?? def.label ?? "";
    row.appendChild(label);
    el.appendChild(row);
    if (isContainer && slotEl) el.appendChild(slotEl);
    return el;
  }

  lockedBefore.forEach((def) => {
    rightCol.appendChild(createLockedBlockElement(def));
  });

  const workspace = document.createElement("div");
  workspace.className = "cb-slot cb-workspace";
  workspace.dataset.slot = "root";

  if (lockedContainer) {
    workspace.classList.add("cb-loop-slot");
    rightCol.appendChild(
      createLockedBlockElement(lockedContainer, { isContainer: true, slotEl: workspace })
    );
  } else {
    rightCol.appendChild(workspace);
  }

  const controls = document.createElement("div");
  controls.className = "cb-controls";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "cb-btn";
  resetBtn.textContent = "Reset";
  controls.appendChild(resetBtn);

  let solutionBtn = null;
  if (solutionOrder) {
    solutionBtn = document.createElement("button");
    solutionBtn.type = "button";
    solutionBtn.className = "cb-btn cb-btn-solution";
    solutionBtn.textContent = "Get Solution";
    controls.appendChild(solutionBtn);
  }
  container.appendChild(controls);

  let draggedEl = null;
  let draggedFromPalette = null;
  let instanceSeq = 0;

  function clearIndicators() {
    container.querySelectorAll(".cb-drop-indicator").forEach((el) => el.remove());
  }

  function computeInsertBefore(slotEl, clientY) {
    const children = Array.from(slotEl.children).filter((c) => c.classList.contains("cb-block"));
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return child;
    }
    return null;
  }

  function updateLabel(blockEl) {
    const def = defById.get(blockEl.dataset.type);
    if (!def) return;
    const labelEl = blockEl.querySelector(":scope > .cb-block-row > .cb-block-label");
    if (!labelEl) return;
    const showLabel = blockEl.dataset.showLabel === "1";
    labelEl.textContent = showLabel ? def.label : def.code;   // was: showLabel ? def.code : def.label
    blockEl.classList.toggle("cb-showing-code", showLabel);   // was: blockEl.classList.toggle("cb-showing-code", showLabel);
  }

  function createBlockElement(typeId) {
    const def = defById.get(typeId);
    if (!def) return null;

    const el = document.createElement("div");
    el.className = "cb-block" + (def.container ? " cb-container" : "");
    el.draggable = true;
    el.dataset.type = typeId;
    el.dataset.id = `inst_${++instanceSeq}`;
    el.dataset.showLabel = "0";

    const row = document.createElement("div");
    row.className = "cb-block-row";

    const label = document.createElement("span");
    label.className = "cb-block-label";
    label.textContent = def.code;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "cb-block-delete";
    del.setAttribute("aria-label", "Remove block");
    del.textContent = "\u00d7";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      const nestedTypes = Array.from(el.querySelectorAll(".cb-block[data-type]")).map(
        (n) => n.dataset.type
      );
      el.remove();
      used.delete(typeId);
      nestedTypes.forEach((id) => used.delete(id));
      renderPalette();
    });

    row.appendChild(label);
    row.appendChild(del);
    el.appendChild(row);

    if (def.container) {
      const inner = document.createElement("div");
      inner.className = "cb-slot cb-inner-slot";
      inner.dataset.slot = el.dataset.id;
      initSlot(inner);
      el.appendChild(inner);
    }

    el.addEventListener("click", (e) => {
      if (e.target.closest(".cb-block-delete")) return;
      if (e.target.classList.contains("cb-slot")) return;
      const target = e.target.closest(".cb-block");
      if (target !== el) return;
      el.dataset.showLabel = el.dataset.showLabel === "1" ? "0" : "1";
      updateLabel(el);
    });

    el.addEventListener("dragstart", (e) => {
      draggedEl = el;
      draggedFromPalette = null;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", el.dataset.id);
      requestAnimationFrame(() => el.classList.add("cb-dragging"));
    });

    el.addEventListener("dragend", () => {
      el.classList.remove("cb-dragging");
      draggedEl = null;
      clearIndicators();
      container.querySelectorAll(".cb-drag-over").forEach((s) => s.classList.remove("cb-drag-over"));
    });

    return el;
  }

  function initSlot(slotEl) {
    slotEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      slotEl.classList.add("cb-drag-over");

      clearIndicators();
      const before = computeInsertBefore(slotEl, e.clientY);
      const indicator = document.createElement("div");
      indicator.className = "cb-drop-indicator";
      if (before) slotEl.insertBefore(indicator, before);
      else slotEl.appendChild(indicator);
    });

    slotEl.addEventListener("dragleave", (e) => {
      if (!slotEl.contains(e.relatedTarget)) {
        slotEl.classList.remove("cb-drag-over");
      }
    });

    slotEl.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      slotEl.classList.remove("cb-drag-over");
      clearIndicators();

      const before = computeInsertBefore(slotEl, e.clientY);

      if (draggedFromPalette) {
        const typeId = draggedFromPalette;
        draggedFromPalette = null;
        if (used.has(typeId)) return;
        const newBlock = createBlockElement(typeId);
        if (!newBlock) return;
        if (before) slotEl.insertBefore(newBlock, before);
        else slotEl.appendChild(newBlock);
        used.add(typeId);
        renderPalette();
      } else if (draggedEl) {
        if (draggedEl.contains(slotEl)) return;
        if (before) slotEl.insertBefore(draggedEl, before);
        else slotEl.appendChild(draggedEl);
      }
    });
  }

  function renderPalette() {
    palette.innerHTML = "";
    const remaining = paletteOrder.filter((id) => !used.has(id));

    if (remaining.length === 0) {
      const empty = document.createElement("p");
      empty.className = "adj-empty";
      empty.textContent = "All blocks used";
      palette.appendChild(empty);
      return;
    }

    remaining.forEach((typeId) => {
      const def = defById.get(typeId);
      if (!def) return;

      const chip = document.createElement("div");
      chip.className = "cb-block cb-palette-block" + (def.container ? " cb-container" : "");
      chip.draggable = true;
      chip.dataset.type = def.id;
      chip.dataset.showLabel = "0";

      const row = document.createElement("div");
      row.className = "cb-block-row";
      const label = document.createElement("span");
      label.className = "cb-block-label";
      label.textContent = def.code;
      row.appendChild(label);
      chip.appendChild(row);

      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        chip.dataset.showLabel = chip.dataset.showLabel === "1" ? "0" : "1";
        const showLabel = chip.dataset.showLabel === "1";
        label.textContent = showLabel ? def.label : def.code;
        chip.classList.toggle("cb-showing-code", showLabel);
      });

      chip.addEventListener("dragstart", (e) => {
        draggedEl = null;
        draggedFromPalette = def.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", def.id);
        requestAnimationFrame(() => chip.classList.add("cb-dragging"));
      });

      chip.addEventListener("dragend", () => {
        chip.classList.remove("cb-dragging");
        draggedFromPalette = null;
        clearIndicators();
        container.querySelectorAll(".cb-drag-over").forEach((s) => s.classList.remove("cb-drag-over"));
      });

      palette.appendChild(chip);
    });
  }

  function applyDefaultArrangement() {
    workspace.innerHTML = "";
    used.clear();
    preplaced.forEach((typeId) => {
      if (!defById.has(typeId) || used.has(typeId)) return;
      const block = createBlockElement(typeId);
      if (!block) return;
      workspace.appendChild(block);
      used.add(typeId);
    });
    renderPalette();
  }

  function applySolutionArrangement() {
    if (!solutionOrder) return;
    workspace.innerHTML = "";
    used.clear();
    solutionOrder.forEach((typeId) => {
      if (!defById.has(typeId) || used.has(typeId)) return;
      const block = createBlockElement(typeId);
      if (!block) return;
      workspace.appendChild(block);
      used.add(typeId);
    });
    renderPalette();
  }

  function clearHighlight() {
    workspace.querySelectorAll(".cb-block-highlight").forEach((el) => {
      el.classList.remove("cb-block-highlight");
    });
  }

  /** Highlight the placed block(s) of a given type (no-op if not placed). */
  function highlight(typeId) {
    clearHighlight();
    if (!typeId) return false;
    const els = workspace.querySelectorAll(`.cb-block[data-type="${typeId}"]`);
    els.forEach((el) => el.classList.add("cb-block-highlight"));
    return els.length > 0;
  }

  initSlot(workspace);
  applyDefaultArrangement();

  resetBtn.addEventListener("click", () => {
    clearHighlight();
    applyDefaultArrangement();
  });

  if (solutionBtn) {
    solutionBtn.addEventListener("click", () => {
      clearHighlight();
      applySolutionArrangement();
    });
  }

  function getPlan() {
    function readSlot(slotEl) {
      return Array.from(slotEl.children)
        .filter((c) => c.classList.contains("cb-block"))
        .map((blockEl) => {
          const def = defById.get(blockEl.dataset.type);
          const node = {
            id: def?.id ?? blockEl.dataset.type,
            label: def?.label ?? "",
            code: def?.code ?? "",
            python: def ? pythonSnippet(def) : "",
          };
          const inner = blockEl.querySelector(":scope > .cb-inner-slot");
          if (inner) node.children = readSlot(inner);
          return node;
        });
    }
    return readSlot(workspace);
  }

  return {
    reset() {
      clearHighlight();
      applyDefaultArrangement();
    },
    /** Arrange the workspace into the correct `solutionOrder` (no-op if none was given). */
    applySolution() {
      applySolutionArrangement();
    },
    /** Highlight the placed block(s) matching a type id; returns false if not placed. */
    highlight,
    clearHighlight,
    /** Nested tree of { id, label, code, python, children? } from the workspace. */
    getPlan,
    /**
     * Full runnable Python: locked preamble + (optional) locked container
     * wrapping the workspace body. Empty container bodies become `pass`.
     * @param {{indent?: number}} [opts]
     * @returns {string}
     */
    toPython(opts = {}) {
      const indentSize = opts.indent ?? 4;
      const parts = [];

      lockedBefore.forEach((def) => {
        const src = (def.code || def.label || "").trim();
        if (src) parts.push(src);
      });

      const body = planToPython(getPlan(), opts);

      if (lockedContainer) {
        let header = (lockedContainer.code || lockedContainer.label || "").trim();
        if (header && !/:\s*$/.test(header)) header += ":";
        const pad = " ".repeat(indentSize);
        const indented = body
          ? body.split("\n").map((l) => (l.length ? pad + l : l)).join("\n")
          : pad + "pass";
        parts.push(header ? `${header}\n${indented}` : indented);
      } else if (body) {
        parts.push(body);
      }

      return parts.join("\n\n");
    },
  };
}
