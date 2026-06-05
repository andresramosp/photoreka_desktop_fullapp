import { ref } from "vue";
import { useIsMobile } from "./useIsMobile";

// Global state for mobile selection mode (shared across all photo card instances)
const isSelectionModeActive = ref(false);
// Internal tracking of selected photos to automatically exit selection mode
const selectedPhotosSet = ref(new Set<string>());

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
   * Toggle photo in internal selection tracking and update selection mode state
   */
  const togglePhotoSelection = (
    photoId: string,
    onSelect: (id: string, event?: MouseEvent) => void,
    event?: MouseEvent,
  ) => {
    // Call the original selection handler
    onSelect(photoId, event);

    // Update internal tracking
    if (selectedPhotosSet.value.has(photoId)) {
      selectedPhotosSet.value.delete(photoId);
    } else {
      selectedPhotosSet.value.add(photoId);
    }

    // Auto-exit selection mode if no photos are selected
    if (selectedPhotosSet.value.size === 0 && isSelectionModeActive.value) {
      exitSelectionMode();
    }
  };

  /**
   * Handle touch start - initiate long press detection
   */
  const handleTouchStart = (
    event: TouchEvent,
    photoId: string,
    onSelect: (id: string) => void,
    requireLongPress: boolean = true,
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
    if (requireLongPress) {
      // Set up long press detection
      longPressTimeout.value = window.setTimeout(() => {
        // Long press detected!
        // 1. Activate selection mode globally
        isSelectionModeActive.value = true;

        // 2. Toggle photo selection with internal tracking
        togglePhotoSelection(photoId, onSelect);

        // 3. Provide haptic feedback if available
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
  ) => {
    // On desktop, always allow regular click-to-select
    if (!isMobile.value) {
      togglePhotoSelection(photoId, onSelect, event);
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
    selectedPhotosSet.value.clear();
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
    requireLongPress: boolean = true,
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

    // If long press is NOT required, allow simple tap selection
    if (!requireLongPress) {
      if (!isButton) {
        event.preventDefault();
        event.stopPropagation();
        togglePhotoSelection(photoId, onSelect);
      }
      touchStartTime.value = 0;
      touchStartPos.value = null;
      return;
    }

    // If touch was shorter than long press duration, it's a tap
    if (touchDuration < LONG_PRESS_DURATION) {
      if (isSelectionModeActive.value) {
        // Selection mode is active - toggle selection with simple tap
        // But allow buttons to work normally
        if (!isButton) {
          event.preventDefault();
          event.stopPropagation();
          togglePhotoSelection(photoId, onSelect);
        }
      } else {
        // Selection mode is NOT active. A simple tap should trigger the info action.
        if (onShowInfo && !isButton) {
          event.preventDefault();
          event.stopPropagation();
          onShowInfo();
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
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleClick,
    exitSelectionMode,
    cleanup,
  };
}
