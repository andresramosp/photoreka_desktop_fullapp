import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";

const VALID_PLACEMENTS = ["top", "right", "left", "bottom"];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const intersectsArea = (rect, bounds) => {
  const x1 = Math.max(rect.x1, bounds.x1);
  const y1 = Math.max(rect.y1, bounds.y1);
  const x2 = Math.min(rect.x2, bounds.x2);
  const y2 = Math.min(rect.y2, bounds.y2);
  const w = Math.max(0, x2 - x1);
  const h = Math.max(0, y2 - y1);
  return w * h;
};

const getCandidateRect = (anchor, size, placement, offset) => {
  const halfW = size.width / 2;
  const halfH = size.height / 2;

  if (placement === "top") {
    return {
      left: anchor.x - halfW,
      top: anchor.y - size.height - offset,
    };
  }

  if (placement === "right") {
    return {
      left: anchor.x + offset,
      top: anchor.y - halfH,
    };
  }

  if (placement === "left") {
    return {
      left: anchor.x - size.width - offset,
      top: anchor.y - halfH,
    };
  }

  return {
    left: anchor.x - halfW,
    top: anchor.y + offset,
  };
};

export function useSmartTooltipPosition(options) {
  const {
    containerRef,
    tooltipRef,
    offset = 12,
    margin = 8,
    preferredOrder = ["top", "right", "left", "bottom"],
  } = options || {};

  const tooltipPosition = ref({ x: 0, y: 0 });
  const tooltipPlacement = ref("top");
  const lastAnchor = ref(null);

  const getTooltipSize = () => {
    const el = tooltipRef?.value;
    if (!el) return { width: 180, height: 80 };

    const rect = el.getBoundingClientRect();
    return {
      width: rect.width || 180,
      height: rect.height || 80,
    };
  };

  const getContainerBounds = () => {
    const el = containerRef?.value;
    if (!el) return null;

    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      x1: margin,
      y1: margin,
      x2: Math.max(margin, rect.width - margin),
      y2: Math.max(margin, rect.height - margin),
    };
  };

  const normalizeOrder = () => {
    const sanitized = preferredOrder.filter((p) =>
      VALID_PLACEMENTS.includes(p),
    );
    if (sanitized.length === 0) return VALID_PLACEMENTS;

    const missing = VALID_PLACEMENTS.filter((p) => !sanitized.includes(p));
    return [...sanitized, ...missing];
  };

  const placeTooltipAt = (anchor) => {
    if (!anchor) return;

    const bounds = getContainerBounds();
    if (!bounds) return;

    lastAnchor.value = { x: anchor.x, y: anchor.y };
    const size = getTooltipSize();
    const order = normalizeOrder();

    let best = null;

    for (const placement of order) {
      const candidate = getCandidateRect(
        lastAnchor.value,
        size,
        placement,
        offset,
      );
      const candidateRect = {
        x1: candidate.left,
        y1: candidate.top,
        x2: candidate.left + size.width,
        y2: candidate.top + size.height,
      };

      const fullyVisible =
        candidateRect.x1 >= bounds.x1 &&
        candidateRect.y1 >= bounds.y1 &&
        candidateRect.x2 <= bounds.x2 &&
        candidateRect.y2 <= bounds.y2;

      const visibleArea = intersectsArea(candidateRect, bounds);
      const totalArea = size.width * size.height;

      if (fullyVisible) {
        best = {
          placement,
          left: candidate.left,
          top: candidate.top,
          score: 1,
        };
        break;
      }

      const score = totalArea > 0 ? visibleArea / totalArea : 0;
      if (!best || score > best.score) {
        best = {
          placement,
          left: candidate.left,
          top: candidate.top,
          score,
        };
      }
    }

    if (!best) return;

    const clampedLeft = clamp(
      best.left,
      bounds.x1,
      Math.max(bounds.x1, bounds.x2 - size.width),
    );
    const clampedTop = clamp(
      best.top,
      bounds.y1,
      Math.max(bounds.y1, bounds.y2 - size.height),
    );

    tooltipPlacement.value = best.placement;
    tooltipPosition.value = { x: clampedLeft, y: clampedTop };
  };

  const repositionTooltip = () => {
    if (!lastAnchor.value) return;
    placeTooltipAt(lastAnchor.value);
  };

  const clearTooltipAnchor = () => {
    lastAnchor.value = null;
  };

  const onResize = () => {
    repositionTooltip();
  };

  onMounted(() => {
    window.addEventListener("resize", onResize);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", onResize);
  });

  const placeTooltipAtNextTick = async (anchor) => {
    lastAnchor.value = anchor;
    await nextTick();
    placeTooltipAt(anchor);
  };

  return {
    tooltipPosition,
    tooltipPlacement,
    placeTooltipAt,
    placeTooltipAtNextTick,
    repositionTooltip,
    clearTooltipAnchor,
  };
}
