import { ref, computed } from "vue";

export function useCardSelection() {
  const selectedRecord = ref({});
  const lastClickedIndex = ref(-1);

  const selectedIds = computed(() =>
    Object.keys(selectedRecord.value).filter(
      (id) => !!selectedRecord.value[id],
    ),
  );

  const isSelectionMode = computed(() => selectedIds.value.length > 0);

  const isSelected = (id) => !!selectedRecord.value[String(id)];

  const toggle = (id) => {
    const key = String(id);
    if (selectedRecord.value[key]) {
      delete selectedRecord.value[key];
    } else {
      selectedRecord.value[key] = true;
    }
  };

  const selectRange = (ids) => {
    ids.forEach((id) => {
      selectedRecord.value[String(id)] = true;
    });
  };

  const clearAll = () => {
    selectedRecord.value = {};
    lastClickedIndex.value = -1;
  };

  const toggleSelectItem = (itemId, orderedIds) => {
    const strId = String(itemId);
    const currentIdx = orderedIds
      ? orderedIds.findIndex((id) => String(id) === strId)
      : -1;
    toggle(itemId);
    if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
  };

  const handleCardSelect = (itemId, event, orderedIds) => {
    const strId = String(itemId);
    const currentIdx = orderedIds.findIndex((id) => String(id) === strId);
    const isShift = event?.shiftKey ?? false;

    if (
      isShift &&
      isSelectionMode.value &&
      lastClickedIndex.value !== -1 &&
      currentIdx !== -1
    ) {
      const start = Math.min(lastClickedIndex.value, currentIdx);
      const end = Math.max(lastClickedIndex.value, currentIdx);
      selectRange(orderedIds.slice(start, end + 1));
      return true;
    }

    if (isSelectionMode.value) {
      toggle(itemId);
      if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
      return true;
    }

    if (currentIdx !== -1) lastClickedIndex.value = currentIdx;
    return false;
  };

  const resetRangeState = () => {
    lastClickedIndex.value = -1;
  };

  return {
    selectedIds,
    isSelectionMode,
    isSelected,
    handleCardSelect,
    toggleSelectItem,
    clearAll,
    resetRangeState,
  };
}
