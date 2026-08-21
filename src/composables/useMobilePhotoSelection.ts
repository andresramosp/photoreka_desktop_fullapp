import { ref } from "vue";
import { useIsMobile } from "./useIsMobile";

// Configuration
const LONG_PRESS_DURATION = 500; // milliseconds

// Reference-counted across every mounted card instance: lets app-level UI
// (e.g. the assistant FAB) know "some photo grid is in selection mode on
// mobile" without any single card owning that global truth. Counting (rather
// than a plain boolean flip) means it self-corrects if a card unmounts while
// still selected, instead of getting stuck true.
const activeSelectionCards = new Set<symbol>();
const isSelectionModeActive = ref(false);

/**
 * Long-press / tap-vs-scroll mechanics for photo cards on touch devices.
 *
 * This composable only owns the *timing* (how long is a long-press, how far
 * is a scroll) — it has no opinion on whether a grid is "in selection mode".
 * That's per-grid state owned by the parent (derived from its own selected
 * ids) and passed in as `isSelectionMode` where needed.
 */
export function useMobilePhotoSelection() {
  const { isMobile } = useIsMobile();
  const instanceKey = Symbol();

  // Local state for this instance
  const longPressTimeout = ref<number | null>(null);
  const touchStartTime = ref<number>(0);
  const touchStartPos = ref<{ x: number; y: number } | null>(null);

  /**
   * Lets this card instance report whether its own grid is currently in
   * selection mode, feeding the shared `isSelectionModeActive` flag.
   */
  const reportSelectionMode = (active: boolean) => {
    if (active) {
      activeSelectionCards.add(instanceKey);
    } else {
      activeSelectionCards.delete(instanceKey);
    }
    isSelectionModeActive.value = activeSelectionCards.size > 0;
  };

  /**
   * Handle touch start - initiate long press detection
   */
  const handleTouchStart = (
    event: TouchEvent,
    photoId: string,
    onSelect: (id: string) => void,
    requireLongPress: boolean = true,
    selectable: boolean = true,
  ) => {
    // Only apply mobile logic if it's actually a mobile device
    if (!isMobile.value) return;

    const touch = event.touches[0];
    touchStartTime.value = Date.now();
    touchStartPos.value = { x: touch.clientX, y: touch.clientY };

    // Clear any existing timeouts
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
    }

    // If long press is required, set up detection
    // NOTE: Don't preventDefault here - it blocks scrolling
    // Context menu is prevented via @contextmenu.prevent in the template
    // A non-selectable card still records the touch (touchEnd needs it to tell a
    // tap from a scroll, and to open the info panel) but never arms the long
    // press: there is no selection for it to enter.
    if (requireLongPress && selectable) {
      // Set up long press detection
      longPressTimeout.value = window.setTimeout(() => {
        // Toggle selection — the parent's own selection state naturally
        // flips isSelectionMode to true on the next render.
        onSelect(photoId);

        // Provide haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }, LONG_PRESS_DURATION);
    }
    // If long press is NOT required, we'll handle selection in touchEnd
  };

  /**
   * Handle touch move - cancel long press if user is scrolling
   */
  const handleTouchMove = (event: TouchEvent) => {
    if (!isMobile.value || !touchStartPos.value) return;

    const touch = event.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPos.value.x);
    const deltaY = Math.abs(touch.clientY - touchStartPos.value.y);

    // If user moved more than 10px, they're scrolling - cancel long press
    if (deltaX > 10 || deltaY > 10) {
      if (longPressTimeout.value) {
        clearTimeout(longPressTimeout.value);
        longPressTimeout.value = null;
      }
    }
  };

  /**
   * Handle touch cancel - cleanup
   */
  const handleTouchCancel = () => {
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
      longPressTimeout.value = null;
    }
    touchStartTime.value = 0;
    touchStartPos.value = null;
  };

  /**
   * Handle regular click (for desktop compatibility)
   */
  const handleClick = (
    event: MouseEvent,
    photoId: string,
    onSelect: (id: string, event?: MouseEvent) => void,
    selectable: boolean = true,
  ) => {
    if (!selectable) return;

    // On desktop, always allow regular click-to-select
    if (!isMobile.value) {
      onSelect(photoId, event);
    }
    // On mobile, prevent default click to avoid interference with touch events
    else {
      event.preventDefault();
    }
  };

  /**
   * Cleanup function to be called on unmount
   */
  const cleanup = () => {
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
    }
    reportSelectionMode(false);
  };

  /**
   * Handle touch end - determine if it was a tap or long press
   */
  const handleTouchEnd = (
    event: TouchEvent,
    photoId: string,
    onSelect: (id: string) => void,
    onTap?: () => void,
    requireLongPress: boolean = true,
    selectable: boolean = true,
    isSelectionMode: boolean = false,
  ) => {
    // Only apply mobile logic if it's actually a mobile device
    if (!isMobile.value) return;

    const touchDuration = Date.now() - touchStartTime.value;

    // Check if touch moved (might be a scroll)
    let hasMoved = false;
    if (touchStartPos.value && event.changedTouches[0]) {
      const touch = event.changedTouches[0];
      const deltaX = Math.abs(touch.clientX - touchStartPos.value.x);
      const deltaY = Math.abs(touch.clientY - touchStartPos.value.y);
      hasMoved = deltaX > 10 || deltaY > 10; // 10px threshold
    }

    // Clear the long press timeout
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
      longPressTimeout.value = null;
    }

    // If touch moved, it's a scroll/drag - ignore it
    if (hasMoved) {
      touchStartTime.value = 0;
      touchStartPos.value = null;
      return;
    }

    // Check if the touch target is a button or interactive element
    const target = event.target as HTMLElement;
    const isButton = target.closest(
      "button, a, .action-button, .n-button, .flag-indicator, .selection-circle",
    );

    // If long press is NOT required, allow simple tap selection
    if (!requireLongPress) {
      if (!isButton && selectable) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(photoId);
      }
      touchStartTime.value = 0;
      touchStartPos.value = null;
      return;
    }

    // If touch was shorter than long press duration, it's a tap
    if (touchDuration < LONG_PRESS_DURATION) {
      if (isSelectionMode && selectable) {
        // Selection mode is active - toggle selection with simple tap
        // But allow buttons to work normally
        if (!isButton) {
          event.preventDefault();
          event.stopPropagation();
          onSelect(photoId);
        }
      } else {
        // Selection mode is NOT active. A simple tap triggers onTap (info,
        // or a select fallback when the card has no info destination).
        if (onTap && !isButton) {
          event.preventDefault();
          event.stopPropagation();
          onTap();
        }
      }

      touchStartTime.value = 0;
    }
  };

  return {
    // State
    isMobile,
    isSelectionModeActive,

    // Methods
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleClick,
    reportSelectionMode,
    cleanup,
  };
}
