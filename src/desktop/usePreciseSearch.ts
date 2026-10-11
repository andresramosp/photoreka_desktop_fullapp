import { computed, watch } from "vue";
import { useUserStore } from "@/stores/userStore";
import { useSearchStore } from "@/stores/searchStore";

/** Créditos mínimos para una búsqueda precisa: los mismos que exige el servicio de la nube. */
export const PRECISE_MIN_CREDITS = 50;

/**
 * Escritorio: la búsqueda precisa necesita créditos. Sin ellos, su botón se deshabilita y, si
 * estaba elegida, la búsqueda vuelve al modo amplio, que sin créditos se hace en modo básico.
 */
export function usePreciseSearch() {
  const userStore = useUserStore();
  const searchStore = useSearchStore();

  const canUsePrecise = computed(() => {
    const usage = userStore.user?.usage;
    const remaining = (usage?.creditsAvailable ?? 0) - (usage?.creditsUsed ?? 0);
    return remaining >= PRECISE_MIN_CREDITS;
  });

  watch(
    canUsePrecise,
    (allowed) => {
      if (!allowed && searchStore.searchMode === "precise") searchStore.setSearchMode("broad");
    },
    { immediate: true }
  );

  const preciseTooltip = computed(() =>
    canUsePrecise.value
      ? "Heavy search that prioritizes logical accuracy"
      : `Precise search needs at least ${PRECISE_MIN_CREDITS} credits`
  );

  return { canUsePrecise, preciseTooltip };
}
