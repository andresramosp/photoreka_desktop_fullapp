import { onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  GRID_QUERY_PARAMS,
  parseGridFiltersFromQuery,
} from "@/utils/photosGridQuery.js";

/**
 * One-shot consumption of the PhotosGrid deep-link query (?sort/&dir/&genre/&score/&aspects),
 * written by ChatLab action suggestions. Same contract as SearchView's `?q=`.
 *
 * The views that host a PhotosGrid live inside <KeepAlive> tabs, and a deactivated
 * kept-alive component still re-renders when its reactive deps change. `useRoute()`
 * is the *global* current route, so anything derived from it flips to the other tab's
 * values the moment you switch tabs. Deriving the grid's `:key` from the query did
 * exactly that: the grid was torn down on leave and rebuilt on return, dropping its
 * filters, sorting and scroll. So:
 *
 *   - the seed key only moves when a new deep link actually arrives, never when the
 *     route changes underneath a cached view;
 *   - the params are stripped as soon as they're consumed, so the tab's URL stops
 *     dictating the grid from there on.
 *
 * @param {(route: import("vue-router").RouteLocationNormalizedLoaded) => boolean} isOwnRoute
 *   Whether the given route is the one this view instance owns. Guards against a
 *   kept-alive instance reacting to another tab's navigation.
 */
export function usePhotosGridDeepLink(isOwnRoute) {
  const route = useRoute();
  const router = useRouter();

  // Setup runs while this view's route is the current one, so the query here is ours.
  const initialGridFilters = ref(parseGridFiltersFromQuery(route.query));
  const gridSeedKey = ref(0);

  const stripQuery = () => {
    const rest = { ...route.query };
    if (!GRID_QUERY_PARAMS.some((key) => key in rest)) return;
    GRID_QUERY_PARAMS.forEach((key) => delete rest[key]);
    router.replace({ query: rest });
  };

  // Deep link arriving at an already-mounted (kept-alive) view: re-seed and re-key,
  // since PhotosGridControls only hydrates from `initialState` on mount.
  watch(
    () => route.fullPath,
    () => {
      if (!isOwnRoute(route)) return;
      const filters = parseGridFiltersFromQuery(route.query);
      if (!filters) return;
      initialGridFilters.value = filters;
      gridSeedKey.value += 1;
      stripQuery();
    },
  );

  // First mount is already seeded above; just clean the URL.
  onMounted(stripQuery);

  return { initialGridFilters, gridSeedKey };
}
