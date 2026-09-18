// frame-playback.js
// Shared "playing" flag + setTimeout-based tick timer used by every
// Play/Step/Reset frame-by-frame animation in this project (heat traversal,
// danger rooms, BFS/Man-Pac mazes, cycle-detection code visualisers, flood
// fill). Each widget still owns its own frame array, compiling logic, and
// rendering — this factory only owns the tiny bit of bookkeeping that was
// copy-pasted identically everywhere: whether playback is currently running,
// and the single pending setTimeout used to advance to the next frame.

export function createPlaybackTimer() {
  let playing = false;
  let timer = null;

  function clear() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** Stop playback (idempotent) and cancel any pending tick. */
  function stop() {
    playing = false;
    clear();
  }

  /** Mark playback as running (does not schedule anything by itself). */
  function start() {
    playing = true;
  }

  function isPlaying() {
    return playing;
  }

  /** Schedule `fn` to run in `delayMs`, replacing any previously scheduled tick. */
  function schedule(fn, delayMs) {
    clear();
    timer = setTimeout(fn, delayMs);
  }

  return { start, stop, isPlaying, schedule };
}
