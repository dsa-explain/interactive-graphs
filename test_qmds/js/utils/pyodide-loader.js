// pyodide-loader.js
// Single shared Pyodide singleton used by every widget that runs
// student-assembled Python in the browser (maze/manpac traversal, heat
// station playground, flood fill, islands visualisation, etc.). Loading
// Pyodide is somewhat expensive, so every caller shares the same lazily
// created promise instead of booting a separate runtime per widget.

const PYODIDE_INDEX = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/";
const PYODIDE_MODULE = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.mjs";

let _pyodidePromise = null;

export function getPyodide() {
  if (!_pyodidePromise) {
    _pyodidePromise = (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_MODULE);
      return loadPyodide({ indexURL: PYODIDE_INDEX });
    })();
  }
  return _pyodidePromise;
}
