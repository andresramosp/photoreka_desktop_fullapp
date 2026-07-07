import { onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { RouteLocationNormalized } from "vue-router";

type ScrollEntry = { el: Element; top: number };

/**
 * Preserves per-view scroll position across <KeepAlive> deactivation.
 *
 * Vue's <KeepAlive> detaches a deactivated view's DOM into an off-document
 * container, which makes the browser reset scrollTop on every scroll container
 * inside it — the outer page scroller as well as inner ones like a chat message
 * list or a photo grid. KeepAlive PRESERVES the actual DOM nodes, so we snapshot
 * the scrollTop of every scrolled element in the outgoing view (keyed by its
 * stable view key) right before navigating, then re-apply those exact values to
 * those same nodes once the view is reactivated and repainted.
 *
 * This is the same snapshot/restore pattern the router's own `scrollBehavior`
 * uses for window scroll — extended to arbitrary inner scroll containers, which
 * `scrollBehavior` cannot reach. It works for every keep-alive view without
 * touching any of them, and does not interfere with scroll resets driven by
 * in-view interactions (e.g. PhotosGrid's filter-driven scrollToTop), which fire
 * on state changes rather than on navigation.
 *
 * @param getViewKey Maps a route to the same stable key used for KeepAlive
 *   caching, so instance tabs (e.g. collection detail) don't collide.
 * @param rootSelector CSS selector for the scroll root that wraps the router
 *   view. Defaults to ".main-content".
 */
export function useScrollRestoration(
  getViewKey: (route: RouteLocationNormalized) => string,
  rootSelector = ".main-content",
): void {
  const route = useRoute();
  const router = useRouter();
  const scrollMemory = new Map<string, ScrollEntry[]>();

  const getActiveScrollRoot = (): Element | null => {
    const roots = document.querySelectorAll(rootSelector);
    for (const r of roots) {
      const el = r as HTMLElement;
      // Pick the visible layout (desktop vs mobile); hidden ones have no box.
      if (el.offsetParent !== null || el.offsetHeight > 0) return r;
    }
    return roots[0] ?? null;
  };

  const save = (key: string): void => {
    if (!key) return;
    const root = getActiveScrollRoot();
    if (!root) return;
    const entries: ScrollEntry[] = [];
    if (root.scrollTop > 0) entries.push({ el: root, top: root.scrollTop });
    root.querySelectorAll("*").forEach((node) => {
      if (node.scrollTop > 0) entries.push({ el: node, top: node.scrollTop });
    });
    scrollMemory.set(key, entries);
  };

  const restore = (key: string): void => {
    const entries = scrollMemory.get(key);
    if (!entries || entries.length === 0) return;
    // Wait for KeepAlive to reattach the DOM (nextTick) and for the browser to
    // lay it out and paint (double rAF) before writing scrollTop, otherwise the
    // value is clamped against a not-yet-sized box and collapses back to 0.
    nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          for (const { el, top } of entries) {
            if (el.isConnected) el.scrollTop = top;
          }
        });
      });
    });
  };

  let removeGuard: (() => void) | null = null;

  onMounted(() => {
    // Runs before the DOM swaps, while the outgoing view still holds its scroll.
    removeGuard = router.beforeEach((_to, from) => {
      save(getViewKey(from));
      return true;
    });
  });

  onUnmounted(() => {
    removeGuard?.();
  });

  // Restore the incoming view's scroll once its route becomes active.
  watch(
    () => route.fullPath,
    () => {
      restore(getViewKey(route));
    },
  );
}
