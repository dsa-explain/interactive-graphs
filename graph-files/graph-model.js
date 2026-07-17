/**
 * graph-model.js
 * ---------------------------------------------------------------------
 * Pure data helpers for the graph's { nodes, edges } shape - no DOM, no
 * D3, no Pyodide. Safe to import anywhere (including outside the
 * browser, e.g. in tests) and shared by GraphDisplay and any input
 * module that needs to read/write the same JSON shape.
 *
 * Canonical JSON shape used everywhere in this project:
 *   {
 *     nodes: [{ id: string, ...attrs }],
 *     edges: [{ source: string, target: string, weight?: number, ...attrs }]
 *   }
 *
 * Edges are treated as undirected (like networkx.Graph): an edge
 * between "A" and "B" is the same edge regardless of which side is
 * called `source` or `target`.
 */

/** Stable, order-independent key for an undirected edge. */
export function edgeKey(u, v) {
  const a = String(u);
  const b = String(v);
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/** True if `value` is a plain JSON-ish object (not an array/null). */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses raw graph JSON (as produced by the Python engine, a hand
 * written literal, or GraphDisplay.toJSON()) into the internal
 * dictionary representation GraphDisplay keeps as `current`:
 *   { nodes: Map<id, nodeData>, edges: Map<edgeKey, edgeData> }
 *
 * Accepts `edges` or the older `links` key so existing snippets keep
 * working, and tolerates missing/partial input.
 */
export function parseGraphJSON(raw) {
  const nodes = new Map();
  const edges = new Map();
  if (!isPlainObject(raw)) return { nodes, edges };

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : Array.isArray(raw.links) ? raw.links : [];

  rawNodes.forEach(entry => {
    if (entry === null || entry === undefined) return;
    const node = isPlainObject(entry) ? { ...entry } : { id: entry };
    if (node.id === undefined) return;
    const id = String(node.id);
    node.id = id;
    nodes.set(id, node);
  });

  rawEdges.forEach(entry => {
    if (!isPlainObject(entry)) return;
    const source = entry.source ?? entry.u;
    const target = entry.target ?? entry.v;
    if (source === undefined || target === undefined) return;
    const sourceId = String(source);
    const targetId = String(target);

    if (!nodes.has(sourceId)) nodes.set(sourceId, { id: sourceId });
    if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId });

    const edge = { ...entry, source: sourceId, target: targetId, weight: Number(entry.weight ?? 1) || 1 };
    edges.set(edgeKey(sourceId, targetId), edge);
  });

  return { nodes, edges };
}

/** Serializes the internal { nodes: Map, edges: Map } dictionary back to plain JSON. */
export function toGraphJSON({ nodes, edges }) {
  return {
    nodes: Array.from(nodes.values()).map(node => ({ ...node })),
    edges: Array.from(edges.values()).map(edge => ({ ...edge }))
  };
}
