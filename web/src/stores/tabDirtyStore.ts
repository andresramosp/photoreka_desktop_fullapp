import { defineStore } from "pinia";
import { ref } from "vue";

export interface DirtyTabCallbacks {
  save: () => Promise<void>;
  discard?: () => void;
}

/**
 * Why the confirmation is being asked:
 * - `close`: the tab itself is going away.
 * - `replace`: the tab stays open but is about to load a different entity
 *   (singleton tabs such as Series or Portfolios), so the pending edits would
 *   be dropped just the same.
 */
export type PendingReason = "close" | "replace";

export type PendingDecision = "save" | "discard" | "cancel";

export const useTabDirtyStore = defineStore("tabDirty", () => {
  // Non-reactive map for callbacks; reactivity is driven by dirtyTabKeys
  const _registry = new Map<string, DirtyTabCallbacks>();
  // Reactive set so the UI can observe which tabs are dirty
  const dirtyTabKeys = ref<Set<string>>(new Set());
  // Key of the tab whose close is pending user confirmation
  const pendingCloseKey = ref<string | null>(null);
  const pendingReason = ref<PendingReason>("close");
  // Only set for "replace": the navigation waits on this until the user answers.
  let _pendingResolve: ((decision: PendingDecision) => void) | null = null;

  function _settle(decision: PendingDecision) {
    const resolve = _pendingResolve;
    _pendingResolve = null;
    resolve?.(decision);
  }

  function register(key: string, callbacks: DirtyTabCallbacks) {
    _registry.set(key, callbacks);
    dirtyTabKeys.value = new Set(_registry.keys());
  }

  function unregister(key: string) {
    _registry.delete(key);
    dirtyTabKeys.value = new Set(_registry.keys());
    if (pendingCloseKey.value === key) {
      pendingCloseKey.value = null;
      _settle("cancel");
    }
  }

  function isDirty(key: string): boolean {
    return _registry.has(key);
  }

  function getCallbacks(key: string): DirtyTabCallbacks | undefined {
    return _registry.get(key);
  }

  function requestClose(key: string) {
    _settle("cancel");
    pendingReason.value = "close";
    pendingCloseKey.value = key;
  }

  /**
   * Ask the user what to do before a singleton tab swaps its content.
   * Resolves once the modal is answered; the caller (navigation guard) decides
   * whether to continue.
   */
  function requestReplace(key: string): Promise<PendingDecision> {
    _settle("cancel");
    pendingReason.value = "replace";
    pendingCloseKey.value = key;
    return new Promise<PendingDecision>((resolve) => {
      _pendingResolve = resolve;
    });
  }

  function resolvePending(decision: PendingDecision) {
    pendingCloseKey.value = null;
    pendingReason.value = "close";
    _settle(decision);
  }

  function clearPendingClose() {
    resolvePending("cancel");
  }

  return {
    dirtyTabKeys,
    pendingCloseKey,
    pendingReason,
    register,
    unregister,
    isDirty,
    getCallbacks,
    requestClose,
    requestReplace,
    resolvePending,
    clearPendingClose,
  };
});
