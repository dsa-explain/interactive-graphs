// graph-traversal-order.js
// Pure BFS/DFS order logic for the "pop from a bag" traversal sandbox
// (bfs-dfs-order.js). No DOM dependency — only reads from a GraphEngine
// instance — so it's split out to keep that file's mount/render code
// focused on the interactive widget itself.

/** Node label lookup, falling back to the raw id if the node is missing. */
export function nodeLabel(engine, id) {
  return engine.nodes.get(id)?.label ?? id;
}

export function compareLabels(engine, a, b) {
  const la = String(nodeLabel(engine, a));
  const lb = String(nodeLabel(engine, b));
  return la.localeCompare(lb, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Unvisited neighbours of `nodeId`, sorted alphabetically by label.
 * @param {import("./graph-engine.js").GraphEngine} engine
 * @param {string} nodeId
 * @param {Set<string>} seen
 */
export function sortedNewNeighbours(engine, nodeId, seen) {
  return engine
    .getNeighbours(nodeId)
    .map((n) => n.id)
    .filter((id) => !seen.has(id))
    .sort((a, b) => compareLabels(engine, a, b));
}

/**
 * Two arrays of ids are "equal" if they contain the same ids in the same order.
 * @param {string[]} a
 * @param {string[]} b
 */
export function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Simulate a pure BFS (popFront=true) or DFS (popFront=false) traversal from
 * `startId`, using the same discovery/seen semantics as the interactive pop
 * loop below, so the result is directly comparable to a student's visit order.
 * @param {import("./graph-engine.js").GraphEngine} engine
 * @param {string} startId
 * @param {boolean} popFront
 * @returns {string[]}
 */
export function simulateTraversal(engine, startId, popFront) {
  const localBag = [startId];
  const localSeen = new Set([startId]);
  const order = [];
  while (localBag.length) {
    const idx = popFront ? 0 : localBag.length - 1;
    const id = localBag.splice(idx, 1)[0];
    order.push(id);
    for (const n of sortedNewNeighbours(engine, id, localSeen)) {
      localSeen.add(n);
      localBag.push(n);
    }
  }
  return order;
}

/**
 * General BFS-order validity check, independent of tie-break order: true if
 * `order` could have resulted from *some* breadth-first traversal starting at
 * `startId` — at each step, the next block of newly discovered nodes in
 * `order` must exactly match the (unordered) set of that node's unvisited
 * neighbours, regardless of how they're arranged within the block.
 * @param {string[]} order
 * @param {import("./graph-engine.js").GraphEngine} engine
 * @param {string} startId
 */
export function isValidBFS(order, engine, startId) {
  if (order.length === 0 || order[0] !== startId) return false;
  const visited = new Set([startId]);
  const queue = [startId];
  let ptr = 1;
  while (queue.length) {
    const u = queue.shift();
    const children = new Set();
    for (const n of engine.getNeighbours(u)) {
      if (!visited.has(n.id)) {
        children.add(n.id);
        visited.add(n.id);
      }
    }
    const cSize = children.size;
    for (let i = 0; i < cSize; i++) {
      const next = order[ptr + i];
      if (next == null || !children.has(next)) return false;
      queue.push(next);
    }
    ptr += cSize;
  }
  return ptr === order.length;
}

/**
 * General DFS-order validity check, independent of tie-break order: true if
 * `order` could have resulted from *some* depth-first traversal starting at
 * `startId`. Uses the classic "backtrack while the top of the stack isn't
 * adjacent to the next node" technique.
 * @param {string[]} order
 * @param {import("./graph-engine.js").GraphEngine} engine
 * @param {string} startId
 */
export function isValidDFS(order, engine, startId) {
  if (order.length === 0 || order[0] !== startId) return false;
  const visited = new Set([startId]);
  const stack = [startId];
  for (let ptr = 1; ptr < order.length; ptr++) {
    const v = order[ptr];
    if (visited.has(v)) return false;
    while (
      stack.length &&
      !engine.getNeighbours(stack[stack.length - 1]).some((n) => n.id === v)
    ) {
      stack.pop();
    }
    if (stack.length === 0) return false;
    visited.add(v);
    stack.push(v);
  }
  return true;
}
