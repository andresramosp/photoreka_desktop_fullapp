import { ref } from "vue";
import { useIsMobile } from "./useIsMobile";

// Global state for mobile selection mode (shared across all photo card instances)
const isSelectionModeActive = ref(false);

// Configuration
const LONG_PRESS_DURATION = 500; // milliseconds
const HOVER_DISPLAY_DURATION = 2000; // milliseconds to show hover overlay on mobile tap

export function useMobilePhotoSelection() {
  const { isMobile } = useIsMobile();

  // Local state for this instance
  const longPressTimeout = ref<number | null>(null);
  const touchStartTime = ref<number>(0);
  const touchStartPos = ref<{ x: number; y: number } | null>(null);
  const hoverTimeout = ref<number | null>(null);
  const showHoverOverlay = ref(false);

  /**
   * Handle touch start - initiate long press detection
   */
  const handleTouchStart = (
    event: TouchEvent,
    photoId: string,
    onSelect: (id: string) => void,
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

    // Set up long press detection
    longPressTimeout.value = window.setTimeout(() => {
      // Long press detected!
      // 1. Select the photo
      onSelect(photoId);

      // 2. Activate selection mode globally
      isSelectionModeActive.value = true;

      // 3. Provide haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, LONG_PRESS_DURATION);
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
    onSelect: (id: string) => void,
  ) => {
    // On desktop, always allow regular click-to-select
    if (!isMobile.value) {
      onSelect(photoId);
    }
    // On mobile, prevent default click to avoid interference with touch events
    else {
      event.preventDefault();
    }
  };

  /**
   * Exit selection mode and cleanup
   */
  const exitSelectionMode = () => {
    isSelectionModeActive.value = false;
    showHoverOverlay.value = false;

    if (hoverTimeout.value) {
      clearTimeout(hoverTimeout.value);
      hoverTimeout.value = null;
    }

    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
      longPressTimeout.value = null;
    }

    touchStartTime.value = 0;
    touchStartPos.value = null;
  };

  /**
   * Cleanup function to be called on unmount
   */
  const cleanup = () => {
    if (longPressTimeout.value) {
      clearTimeout(longPressTimeout.value);
    }
    if (hoverTimeout.value) {
      clearTimeout(hoverTimeout.value);
    }
  };

  /**
   * Handle touch end - determine if it was a tap or long press
   */
  const handleTouchEnd = (
    event: TouchEvent,
    photoId: string,
    onSelect: (id: string) => void,
    onShowInfo?: () => void,
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
    const isButton = target.closest("button, a, .action-button, .n-button");

    // If touch was shorter than long press duration, it's a tap
    if (touchDuration < LONG_PRESS_DURATION) {
      if (isSelectionModeActive.value) {
        // Selection mode is active - toggle selection with simple tap
        // But allow buttons to work normally
        if (!isButton) {
          event.preventDefault();
          event.stopPropagation();
          onSelect(photoId);
        }
      } else {
        // Selection mode is NOT active - show hover overlay temporarily
        // But don't prevent default on buttons
        if (!isButton) {
          event.preventDefault();
          event.stopPropagation();

          showHoverOverlay.value = true;

          // Clear any existing hover timeout
          if (hoverTimeout.value) {
            clearTimeout(hoverTimeout.value);
          }

          // Hide hover overlay after duration
          hoverTimeout.value = window.setTimeout(() => {
            showHoverOverlay.value = false;
          }, HOVER_DISPLAY_DURATION);
        }
      }

      touchStartTime.value = 0;
    }
  };

  return {
    // State
    isSelectionModeActive,
    showHoverOverlay,
    isMobile,

    // Methods
    handleTouchStart,
    handleTouchEnd,
    handleTouchCancel,
    handleClick,
    exitSelectionMode,
    cleanup,
  };
}
