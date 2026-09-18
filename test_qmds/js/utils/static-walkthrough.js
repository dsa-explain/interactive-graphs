// static-walkthrough.js
// Shared "static graph + step copy + Previous/Next" panel used by the
// traversal intro and directed-cycle walkthroughs. Pages supply graph +
// steps; chip rows and an extra side column are optional.

import { mountStaticGraphView } from "../qmd-specific-utils/static-graph-view.js";

/**
 * Default info rows for a step that uses the traversal chip convention:
 * `node` / `possibleNext` / `visited` / `highlight.pathEdges`.
 * Returns [] when none of those fields are present, so other walkthroughs
 * can keep a title + description only.
 *
 * @param {object} step
 * @returns {Array<{key: string, values: Array<string>, chipClass?: string, always?: boolean}>}
 */
export function defaultWalkthroughInfoRows(step = {}) {
  const pathEdges = step.visitedEdges ?? step.highlight?.pathEdges;
  if (
    step.node == null &&
    !step.possibleNext &&
    !step.visited &&
    !pathEdges
  ) {
    return [];
  }
  return [
    {
      key: step.nodeLabel ?? "Current node",
      values: step.node != null ? [step.node] : [],
      always: true,
    },
    {
      key: "Possible next",
      values: step.possibleNext ?? [],
      chipClass: "gt-chip-next",
    },
    {
      key: "Visited nodes",
      values: step.visited ?? [],
      chipClass: "gt-chip-visited",
    },
    {
      key: "Visited edges",
      values: pathEdges ?? [],
      chipClass: "gt-chip-visited",
    },
  ];
}

function fillDescription(el, text) {
  el.textContent = "";
  const src = String(text ?? "");
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) {
      el.appendChild(document.createTextNode(src.slice(last, m.index)));
    }
    const strong = document.createElement("strong");
    strong.textContent = m[1];
    el.appendChild(strong);
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    el.appendChild(document.createTextNode(src.slice(last)));
  }
}

function renderChip(value, chipClass) {
  const chip = document.createElement("span");
  chip.className = chipClass;
  chip.textContent = String(value);
  return chip;
}

function renderInfoPanel(infoEl, step, rows) {
  infoEl.innerHTML = "";

  const title = document.createElement("h4");
  title.textContent = step.title ?? "";

  const desc = document.createElement("p");
  desc.className = "gt-desc";
  fillDescription(desc, step.description ?? "");
  infoEl.append(title, desc);

  for (const row of rows) {
    const values = [...(row.values ?? [])].filter(
      (v) => v != null && v !== ""
    );
    const wrap = document.createElement("div");
    wrap.className = "gt-info-row";
    if (!values.length && !row.always) wrap.style.visibility = "hidden";

    const key = document.createElement("span");
    key.className = "gt-info-key";
    key.textContent = `${row.key}:`;
    if (!values.length) key.style.visibility = "hidden";
    wrap.appendChild(key);

    if (values.length) {
      const chipClass = row.chipClass
        ? `gt-node-chip ${row.chipClass}`
        : "gt-node-chip";
      for (const v of values) wrap.appendChild(renderChip(v, chipClass));
    } else {
      const placeholder = document.createElement("span");
      placeholder.style.visibility = "hidden";
      placeholder.textContent = "—";
      wrap.appendChild(placeholder);
    }
    infoEl.appendChild(wrap);
  }
}

function addClasses(el, className) {
  String(className || "")
    .split(/\s+/)
    .filter(Boolean)
    .forEach((c) => el.classList.add(c));
}

/**
 * Mount a step-through walkthrough: static graph, title/description, optional
 * chip rows, optional extra column, and Previous / Next controls.
 *
 * Minimal page usage:
 * ```
 * mountStaticWalkthrough(el, { graph: { nodes, edges }, steps })
 * ```
 * Each step may include `title`, `description`, `highlight`, and the chip
 * fields above. Pass `renderSide` for a second column (stack, legend, …).
 *
 * @param {HTMLElement} container
 * @param {{
 *   graph: {nodes?: object[], edges?: object[]},
 *   steps: object[],
 *   width?: number,
 *   height?: number,
 *   directed?: boolean,
 *   highlight?: (step: object, ctx: object) => object,
 *   infoRows?: (step: object, ctx: object) => object[],
 *   renderSide?: (sideEl: HTMLElement, step: object, ctx: object) => void,
 *   className?: string,
 *   bodyClass?: string,
 *   mainClass?: string,
 *   sideClass?: string,
 *   graphOptions?: object,
 * }} [options]
 */
export function mountStaticWalkthrough(container, options = {}) {
  if (!container) return null;

  const graph = options.graph ?? { nodes: [], edges: [] };
  const steps = options.steps ?? [];
  const width = options.width ?? 360;
  const height = options.height ?? 260;
  const directed = !!options.directed;
  const highlightOf =
    options.highlight ?? ((step) => step.highlight ?? {});
  const infoRowsOf = options.infoRows ?? defaultWalkthroughInfoRows;
  const renderSide =
    typeof options.renderSide === "function" ? options.renderSide : null;
  const graphOptions = options.graphOptions ?? {};

  let stepIndex = 0;

  container.innerHTML = "";
  container.classList.add("gt-panel-wrap");
  addClasses(container, options.className);

  const hasSide = !!renderSide;
  const body = document.createElement("div");
  body.className = hasSide
    ? options.bodyClass ?? "gt-walk-body"
    : "gt-panel";
  container.appendChild(body);

  const main = hasSide ? document.createElement("div") : body;
  if (hasSide) {
    main.className = options.mainClass ?? "gt-walk-main";
    body.appendChild(main);
  }

  const graphMount = document.createElement("div");
  graphMount.className = "gt-graph-mount";
  main.appendChild(graphMount);

  const info = document.createElement("div");
  info.className = "gt-info";
  main.appendChild(info);

  let sideEl = null;
  if (hasSide) {
    sideEl = document.createElement("div");
    sideEl.className = options.sideClass ?? "gt-walk-side";
    body.appendChild(sideEl);
  }

  const controls = document.createElement("div");
  controls.className = "gt-controls";
  container.appendChild(controls);

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "gt-nav-btn";
  prevBtn.textContent = "← Previous";

  const indicator = document.createElement("span");
  indicator.className = "gt-step-indicator";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "gt-nav-btn";
  nextBtn.textContent = "Next →";

  controls.append(prevBtn, indicator, nextBtn);

  function render() {
    const step = steps[stepIndex] ?? {};
    const ctx = { graph, index: stepIndex, steps };

    mountStaticGraphView(graphMount, graph, {
      width,
      height,
      directed,
      ...graphOptions,
      highlight: highlightOf(step, ctx),
    });

    renderInfoPanel(info, step, infoRowsOf(step, ctx) ?? []);
    if (sideEl) renderSide(sideEl, step, ctx);

    prevBtn.disabled = stepIndex <= 0;
    nextBtn.disabled = steps.length === 0 || stepIndex >= steps.length - 1;
    indicator.textContent = steps.length
      ? `Step ${stepIndex + 1} of ${steps.length}`
      : "Step 0 of 0";
  }

  prevBtn.addEventListener("click", () => {
    stepIndex = Math.max(0, stepIndex - 1);
    render();
  });
  nextBtn.addEventListener("click", () => {
    stepIndex = Math.min(Math.max(0, steps.length - 1), stepIndex + 1);
    render();
  });

  render();
  return {
    next: () => nextBtn.click(),
    prev: () => prevBtn.click(),
  };
}
