import { defineStore } from "pinia";
import { ref } from "vue";

export interface DirtyTabCallbacks {
  save: () => Promise<void>;
  discard?: () => void;
}

export const useTabDirtyStore = defineStore("tabDirty", () => {
  // Non-reactive map for callbacks; reactivity is driven by dirtyTabKeys
  const _registry = new Map<string, DirtyTabCallbacks>();
  // Reactive set so the UI can observe which tabs are dirty
  const dirtyTabKeys = ref<Set<string>>(new Set());
  // Key of the tab whose close is pending user confirmation
  const pendingCloseKey = ref<string | null>(null);

  function register(key: string, callbacks: DirtyTabCallbacks) {
    _registry.set(key, callbacks);
    dirtyTabKeys.value = new Set(_registry.keys());
  }

  function unregister(key: string) {
    _registry.delete(key);
    dirtyTabKeys.value = new Set(_registry.keys());
    if (pendingCloseKey.value === key) {
      pendingCloseKey.value = null;
    }
  }

  function isDirty(key: string): boolean {
    return _registry.has(key);
  }

  function getCallbacks(key: string): DirtyTabCallbacks | undefined {
    return _registry.get(key);
  }

  function requestClose(key: string) {
    pendingCloseKey.value = key;
  }

  function clearPendingClose() {
    pendingCloseKey.value = null;
  }

  return {
    dirtyTabKeys,
    pendingCloseKey,
    register,
    unregister,
    isDirty,
    getCallbacks,
    requestClose,
    clearPendingClose,
  };
});
