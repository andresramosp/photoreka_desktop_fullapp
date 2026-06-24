import { ref } from "vue";

/**
 * Hides a header when scrolling down and restores it when scrolling up
 * near the top of the scrollable area.
 *
 * Wire `onScrollDirection` to a PhotosGrid `@scroll-direction` event, and bind
 * the returned `headerHidden` / `headerEntering` refs to the header's classes.
 *
 * @param {Object} [options]
 * @param {number} [options.nearTopThreshold=300] px from top to consider "near top"
 * @param {number} [options.hideResizeDelay=50] delay (ms) before firing resize on hide
 * @param {number} [options.showResizeDelay=220] delay (ms) before firing resize on show
 */
export function useHeaderHideOnScroll(options = {}) {
  const {
    nearTopThreshold = 300,
    hideResizeDelay = 50,
    showResizeDelay = 220,
  } = options;

  const headerHidden = ref(false);
  const headerEntering = ref(false);

  const onScrollDirection = ({ direction, scrollTop }) => {
    if (direction === "down") {
      // Always hide header when scrolling down — instant
      if (headerHidden.value) return;
      headerEntering.value = false;
      headerHidden.value = true;
      setTimeout(
        () => window.dispatchEvent(new Event("resize")),
        hideResizeDelay,
      );
    } else {
      // Only restore header when scrolling up AND near the top — with transition
      if (!headerHidden.value || scrollTop > nearTopThreshold) return;
      headerEntering.value = true;
      headerHidden.value = false;
      setTimeout(
        () => window.dispatchEvent(new Event("resize")),
        showResizeDelay,
      );
    }
  };

  return {
    headerHidden,
    headerEntering,
    onScrollDirection,
  };
}
