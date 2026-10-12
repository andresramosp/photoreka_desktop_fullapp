import { ref, onMounted, onBeforeUnmount } from "vue";

/**
 * Composable for auto-refreshing data at a fixed interval.
 * Prevents overlap: if a fetch is still running when the next tick fires, it waits.
 *
 * @param fetchFn - async function that fetches data
 * @param intervalMs - refresh interval in milliseconds (default 3000)
 */
export function useAutoRefresh(
  fetchFn: () => Promise<void>,
  intervalMs = 3000,
) {
  const isRefreshing = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let active = true;

  async function tick() {
    if (!active || isRefreshing.value) return;
    isRefreshing.value = true;
    try {
      await fetchFn();
    } finally {
      isRefreshing.value = false;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(tick, intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function pause() {
    stop();
  }

  function resume() {
    start();
  }

  onMounted(() => {
    start();
  });

  onBeforeUnmount(() => {
    active = false;
    stop();
  });

  return { isRefreshing, start, stop, pause, resume };
}
