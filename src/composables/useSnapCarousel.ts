import { ref, watch, nextTick, onBeforeUnmount, type Ref } from "vue";

/**
 * State and navigation for a horizontal scroll-snap track whose direct
 * children are the slides. The track must be `position: relative` so the
 * slides' offsetLeft is measured against it.
 */
export function useSnapCarousel(trackRef: Ref<HTMLElement | null>) {
  const canScrollPrev = ref(false);
  const canScrollNext = ref(false);

  const slides = () =>
    Array.from(trackRef.value?.children ?? []) as HTMLElement[];

  const update = () => {
    const el = trackRef.value;
    if (!el) return;
    canScrollPrev.value = el.scrollLeft > 4;
    canScrollNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
  };

  const centerOn = (index: number, behavior: ScrollBehavior = "smooth") => {
    const el = trackRef.value;
    const slide = slides()[index];
    if (!el || !slide) return;
    const left = slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2;
    el.scrollTo({ left: Math.max(0, left), behavior });
  };

  // Only moves when the slide is cut off, so a fully visible one stays put.
  const reveal = (index: number, behavior: ScrollBehavior = "smooth") => {
    const el = trackRef.value;
    const slide = slides()[index];
    if (!el || !slide) return;
    const fullyVisible =
      slide.offsetLeft >= el.scrollLeft - 1 &&
      slide.offsetLeft + slide.offsetWidth <= el.scrollLeft + el.clientWidth + 1;
    if (!fullyVisible) centerOn(index, behavior);
  };

  const scrollByPage = (direction: 1 | -1) => {
    const el = trackRef.value;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth, behavior: "smooth" });
  };

  let resizeObserver: ResizeObserver | null = null;

  watch(trackRef, (el) => {
    resizeObserver?.disconnect();
    if (!el) return;
    resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    nextTick(update);
  });

  onBeforeUnmount(() => resizeObserver?.disconnect());

  return {
    canScrollPrev,
    canScrollNext,
    update,
    reveal,
    scrollByPage,
  };
}
