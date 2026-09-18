// py-harness-utils.js
// Small shared helpers for widgets that capture a Pyodide run's stdout/stderr
// and show it in a single "Output" panel (danger-rooms editor, flood fill).

/** Merge captured stdout/stderr into one display string (stdout first). */
export function formatCapturedOutput(stdout, stderr) {
  const out = String(stdout ?? "");
  const err = String(stderr ?? "");
  if (out && err) return `${out}${out.endsWith("\n") ? "" : "\n"}${err}`;
  return out || err;
}
