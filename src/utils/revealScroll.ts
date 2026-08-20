/**
 * Reveal scroll
 *
 * A reply lands as one block, so snapping to its end skips past everything the
 * answer actually said. This walks down to the bottom instead, fast enough not
 * to be in the way but slow enough that the reply is seen going by.
 *
 * It yields the moment the user does anything: wheel, touch, pointer or key
 * cancels it, so it never fights whoever is driving.
 */

export interface RevealScrollOptions {
  /** Reading pace. */
  pxPerSec?: number;
  /** A beat before moving, so the opening lines can be read in place. */
  leadInMs?: number;
  /** However tall the reply, the reveal never outlasts this. */
  maxMs?: number;
}

const DEFAULTS: Required<RevealScrollOptions> = {
  pxPerSec: 760,
  leadInMs: 300,
  maxMs: 8000,
};

/** Photos landing late still grow the reply, so the loop waits this long at the
 *  bottom before giving up on more arriving. */
const SETTLE_MS = 1200;

/** Scrolls `el` to its bottom gradually. Returns a cancel function. */
export function revealScrollToBottom(
  el: HTMLElement,
  options: RevealScrollOptions = {},
): () => void {
  const { pxPerSec, leadInMs, maxMs } = { ...DEFAULTS, ...options };

  let frame = 0;
  let cancelled = false;
  let lastFrameAt = performance.now();
  let reachedBottomAt = 0;
  const startedAt = lastFrameAt;

  const stop = () => {
    if (cancelled) return;
    cancelled = true;
    cancelAnimationFrame(frame);
    el.removeEventListener("wheel", stop);
    el.removeEventListener("touchstart", stop);
    el.removeEventListener("pointerdown", stop);
    window.removeEventListener("keydown", stop);
  };

  const step = (now: number) => {
    if (cancelled) return;
    // Capped so a backgrounded tab doesn't resume with one giant jump.
    const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
    lastFrameAt = now;

    const elapsed = now - startedAt;
    if (elapsed < leadInMs) {
      frame = requestAnimationFrame(step);
      return;
    }

    const target = el.scrollHeight - el.clientHeight;
    const remaining = target - el.scrollTop;

    if (remaining <= 1) {
      if (!reachedBottomAt) reachedBottomAt = now;
      if (now - reachedBottomAt > SETTLE_MS) stop();
      else frame = requestAnimationFrame(step);
      return;
    }
    reachedBottomAt = 0;

    // Steady pace by default, faster only when the reply is too tall to finish
    // within the budget.
    const budgetLeft = Math.max(0, (maxMs - elapsed) / 1000);
    const speed = budgetLeft
      ? Math.max(pxPerSec, remaining / budgetLeft)
      : Infinity;
    el.scrollTop = Math.min(target, el.scrollTop + speed * dt);
    frame = requestAnimationFrame(step);
  };

  el.addEventListener("wheel", stop, { passive: true });
  el.addEventListener("touchstart", stop, { passive: true });
  el.addEventListener("pointerdown", stop);
  window.addEventListener("keydown", stop);
  frame = requestAnimationFrame(step);
  return stop;
}
