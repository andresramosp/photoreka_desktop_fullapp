/**
 * Demo mode
 *
 * Everything the app does differently while a demo is being recorded, in one
 * place:
 *   - a paste into the chat composer is written out character by character
 *     instead of landing at once, so no one has to be seen typing;
 *   - the reply's reveal scroll runs at a slower, more filmable pace than the
 *     one the app normally uses;
 *   - replies show fewer, single-row photo groups, which frame better than a
 *     wall of thumbnails.
 *
 * Off unless asked for, so the app behaves exactly as it always has for
 * everyone else. Two ways in, both usable against production:
 *
 *   - `?demo=1` on any URL (`?demo=0` turns it back off). The flag outlives the
 *     query — the router rewrites the URL as soon as a conversation gets an id
 *     — so it's kept for the rest of the tab's life, and dies with the tab.
 *   - Ctrl/Cmd + Alt + D toggles it mid-session, for when the recording is
 *     already rolling.
 */
import { ref } from "vue";
import type { RevealScrollOptions } from "@/utils/revealScroll";

const STORAGE_KEY = "photoreka_demo_mode";
const QUERY_KEY = "demo";

function readInitialState(): boolean {
  try {
    const requested = new URLSearchParams(window.location.search).get(
      QUERY_KEY,
    );
    if (requested === null)
      return window.sessionStorage.getItem(STORAGE_KEY) === "true";
    return requested !== "0" && requested !== "false";
  } catch {
    return false;
  }
}

/** Master switch. Read it as `demoMode.value` — it flips at runtime. */
export const demoMode = ref(readInitialState());

export function setDemoMode(on: boolean): boolean {
  demoMode.value = !!on;
  try {
    // Per tab: a demo link shouldn't leave the app in demo mode forever.
    window.sessionStorage.setItem(STORAGE_KEY, String(demoMode.value));
  } catch {
    // Storage disabled — the flag simply won't survive the next navigation.
  }
  return demoMode.value;
}

export function toggleDemoMode(): boolean {
  return setDemoMode(!demoMode.value);
}

// Persist whatever the query asked for, and install the shortcut. Module scope
// on purpose: the switch is global, so nothing should have to mount for it to
// work, and there is nothing to tear down before the tab closes.
if (typeof window !== "undefined") {
  setDemoMode(demoMode.value);
  // Alt rather than Shift: Chrome keeps Ctrl+Shift+D for "bookmark all tabs"
  // and won't let the page have it.
  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.shiftKey || !e.altKey || !(e.ctrlKey || e.metaKey))
      return;
    if ((e.key || "").toLowerCase() !== "d" && e.code !== "KeyD") return;
    e.preventDefault();
    toggleDemoMode();
  });
}

/** Photo groups kept per reply. The rest are dropped from the render. */
export const DEMO_MAX_PHOTO_GROUPS = 2;

/** Photos kept per group — enough to fill one row, never enough to wrap. */
export const DEMO_MAX_PHOTOS_PER_GROUP = 5;

/** Average milliseconds per character. Punctuation pauses are added on top. */
const MS_PER_CHAR = 40;

/**
 * How long to wait before writing the next character, given the one just
 * written. Real typing isn't metronomic: the jitter keeps it from looking
 * machine-generated, and the pauses after punctuation are what actually sell it
 * as someone thinking while they write.
 */
export function demoTypingDelay(justTyped: string): number {
  let delay = MS_PER_CHAR * (0.55 + Math.random() * 0.95);
  if (justTyped === "\n") delay += 160 + Math.random() * 120;
  else if (/[.!?]/.test(justTyped)) delay += 220 + Math.random() * 180;
  else if (/[,;:]/.test(justTyped)) delay += 120 + Math.random() * 100;
  // An occasional hesitation between words, never mid-word.
  else if (justTyped === " " && Math.random() < 0.12)
    delay += 90 + Math.random() * 130;
  return delay;
}

/**
 * The reveal scroll, slowed down for the camera. Everyone else gets the
 * defaults in @/utils/revealScroll.
 */
export const DEMO_REVEAL_SCROLL: RevealScrollOptions = {
  pxPerSec: 560,
  leadInMs: 700,
  maxMs: 14000,
};

/**
 * The reply, cut down to its first and last block for the camera.
 *
 * Replies open by framing what was searched and close with the offer to keep
 * going; everything between the two is the per-group commentary, which reads
 * as a wall of text on screen and says nothing the photos below it don't. So
 * demo mode keeps the two ends and drops the middle.
 *
 * Blocks are split on blank lines, which is what the markdown renderer treats
 * as a paragraph break too — so a list stays whole instead of losing its tail.
 * Replies of two blocks or fewer are already short enough and pass through
 * untouched. Outside demo mode the reply is returned as it came.
 */
export function demoTrimReply(content: string): string {
  if (!demoMode.value) return content;
  // The server sometimes sends newlines escaped; the renderer undoes this too,
  // and doing it here first is what makes the blank lines findable.
  const blocks = content
    .replace(/\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length <= 2) return content;
  // A leading heading is a label, not the opening line — keep what it labels.
  const head = /^#{1,6}\s/.test(blocks[0]) ? blocks.slice(0, 2) : [blocks[0]];
  return [...head, blocks[blocks.length - 1]].join("\n\n");
}
