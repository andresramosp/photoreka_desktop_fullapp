/**
 * useCollectionSelection
 *
 * Google-Photos-style multi-selection for collection cards.
 *
 * Interaction model:
 *   • Click the selection circle (top-left)  → toggles item, enters selection mode
 *   • Regular click, nothing selected        → consumer opens the collection (returns false)
 *   • Regular click, selection mode active   → toggles the clicked card (returns true)
 *   • Shift + click (in selection mode)      → range select from last anchor (returns true)
 *   • Escape                                 → clearAll() — wired in the parent view
 *
 * Usage in CollectionsView:
 *
 *   const { selectedCollectionIds, isSelectionMode, isSelected,
 *           handleCollectionSelect, toggleSelectItem, clearAll } =
 *     useCollectionSelection();
 *
 *   // Card body click
 *   const onCardClick = (collection, nativeEvent, orderedIds) => {
 *     const handled = handleCollectionSelect(collection.id, nativeEvent, orderedIds);
 *     if (!handled) openCollection(collection);
 *   };
 *
 *   // Circle click (always enters/stays in selection mode)
 *   const onCircleClick = (collection, orderedIds) => {
 *     toggleSelectItem(collection.id, orderedIds);
 *   };
 *
 * For drag:
 *   Pass :isSelected and :selectedIds to CollectionCard so it can encode all IDs in dragstart.
 */

import { useCardSelection } from "./useCardSelection";

export function useCollectionSelection() {
  const selection = useCardSelection();

  return {
    selectedCollectionIds: selection.selectedIds,
    isSelectionMode: selection.isSelectionMode,
    isSelected: selection.isSelected,
    handleCollectionSelect: selection.handleCardSelect,
    toggleSelectItem: selection.toggleSelectItem,
    clearAll: selection.clearAll,
    resetRangeState: selection.resetRangeState,
  };
}
