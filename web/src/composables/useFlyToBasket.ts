import { onUnmounted } from "vue";

/**
 * "Flies" a photo towards the selection basket when it's added.
 *
 * The ghost only travels a short, fixed distance in the basket's direction
 * before dissolving — enough to read as "it went that way" without the cost (or
 * the awkward path) of animating all the way across a scrolling transcript.
 *
 * Built imperatively: these are throwaway nodes that live for half a second and
 * never re-render, so putting them through Vue's reactivity would buy nothing.
 */

export interface Flyer {
  /** Where the photo is on screen right now, in viewport coordinates. */
  rect: DOMRect;
  /** Thumbnail to show in the ghost. */
  src: string;
}

const FLIGHT_DISTANCE_PX = 640;
const FLIGHT_DURATION_MS = 850;
/** Group adds fan out instead of moving as one block. */
const STAGGER_MS = 45;

export function useFlyToBasket() {
  const inFlight = new Set<HTMLElement>();

  const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const spawn = (flyer: Flyer, target: DOMRect | null, delay: number) => {
    const { rect, src } = flyer;

    const ghost = document.createElement("div");
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      zIndex: "9998",
      pointerEvents: "none",
      borderRadius: "12px",
      overflow: "hidden",
      backgroundColor: "var(--bg-surface)",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
      willChange: "transform, opacity",
    } satisfies Partial<CSSStyleDeclaration>);

    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    // Mirrors how the card renders it, so the ghost lifts off looking identical.
    Object.assign(img.style, {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      display: "block",
    } satisfies Partial<CSSStyleDeclaration>);
    ghost.appendChild(img);

    document.body.appendChild(ghost);
    inFlight.add(ghost);

    // Direction only — the magnitude is fixed, so a basket that's far away
    // doesn't turn into a long flight.
    const fromX = rect.left + rect.width / 2;
    const fromY = rect.top + rect.height / 2;
    const toX = target ? target.left + target.width / 2 : window.innerWidth;
    const toY = target ? target.top + target.height / 2 : 0;
    const rawX = toX - fromX;
    const rawY = toY - fromY;
    const length = Math.hypot(rawX, rawY) || 1;
    const dx = (rawX / length) * FLIGHT_DISTANCE_PX;
    const dy = (rawY / length) * FLIGHT_DISTANCE_PX;

    // Size stays put: the photo is meant to drift off and dissolve, not shrink
    // into the distance. Only position and opacity move.
    const animation = ghost.animate(
      [
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
        {
          transform: `translate3d(${dx * 0.6}px, ${dy * 0.6}px, 0)`,
          opacity: 0.45,
          offset: 0.5,
        },
        { transform: `translate3d(${dx}px, ${dy}px, 0)`, opacity: 0 },
      ],
      {
        duration: FLIGHT_DURATION_MS,
        delay,
        // Fast off the mark, easing out as it dissolves — reads as launched
        // towards the basket rather than drifting away.
        easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        fill: "both",
      },
    );

    const remove = () => {
      inFlight.delete(ghost);
      ghost.remove();
    };
    animation.onfinish = remove;
    animation.oncancel = remove;
  };

  /**
   * @param flyers  One per photo actually being added — callers filter out the
   *                ones already in the basket, so nothing flies for a no-op.
   * @param target  The basket toggle. Only its position is used; a missing one
   *                falls back to the top-right corner.
   */
  const launch = (flyers: Flyer[], target?: Element | null) => {
    if (flyers.length === 0 || prefersReducedMotion()) return;
    const targetRect = target?.getBoundingClientRect() ?? null;
    flyers.forEach((flyer, index) =>
      spawn(flyer, targetRect, index * STAGGER_MS),
    );
  };

  onUnmounted(() => {
    for (const ghost of inFlight) ghost.remove();
    inFlight.clear();
  });

  return { launch };
}
