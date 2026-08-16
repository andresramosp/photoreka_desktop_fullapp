import { ref } from "vue";

/**
 * Hides a header when scrolling down and restores it when scrolling up.
 *
 * Mirrors the `collapsed` flag PhotosGrid computes for its own scroll-hide
 * panels (scores toolbar, filters) instead of re-deriving a threshold here,
 * so every "hide on scroll" surface reveals together on the same gesture
 * rather than each header picking its own moment.
 *
 * Wire `onScrollDirection` to a PhotosGrid `@scroll-direction` event, and bind
 * the returned `headerHidden` / `headerEntering` refs to the header's classes.
 *
 * @param {Object} [options]
 * @param {number} [options.hideResizeDelay=360] delay (ms) before firing resize on hide
 * @param {number} [options.showResizeDelay=220] delay (ms) before firing resize on show
 */
export function useHeaderHideOnScroll(options = {}) {
  const { hideResizeDelay = 360, showResizeDelay = 220 } = options;

  const headerHidden = ref(false);
  const headerEntering = ref(false);

  const onScrollDirection = ({ collapsed }) => {
    if (collapsed === headerHidden.value) return;
    headerEntering.value = true;
    headerHidden.value = collapsed;
    setTimeout(
      () => window.dispatchEvent(new Event("resize")),
      collapsed ? hideResizeDelay : showResizeDelay,
    );
  };

  return {
    headerHidden,
    headerEntering,
    onScrollDirection,
  };
}
