import { computed, watch } from "vue";
import { useUserStore } from "@/stores/userStore";
import { useSearchStore } from "@/stores/searchStore";

/** Créditos mínimos para una búsqueda precisa: los mismos que exige el servicio de la nube. */
export const PRECISE_MIN_CREDITS = 50;

/** Aviso de la búsqueda básica, que es la que se hace sin créditos. */
export const BASIC_SEARCH_NOTICE = {
  title: "Basic search",
  text:
    "Without credits, the search uses the query exactly as written, without translating it or splitting it into concepts. It works best with short queries in English.",
};

/**
 * Escritorio: sin créditos, la búsqueda normal es básica y la precisa no está disponible. Si la
 * precisa estaba elegida al quedarse sin créditos, la búsqueda vuelve al modo amplio.
 */
export function useSearchCredits() {
  const userStore = useUserStore();
  const searchStore = useSearchStore();

  const remainingCredits = computed(() => {
    const usage = userStore.user?.usage;
    return (usage?.creditsAvailable ?? 0) - (usage?.creditsUsed ?? 0);
  });
  const hasCredits = computed(() => remainingCredits.value >= 1);
  const canUsePrecise = computed(() => remainingCredits.value >= PRECISE_MIN_CREDITS);

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

  return { hasCredits, canUsePrecise, preciseTooltip };
}
