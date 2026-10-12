import { defineStore } from "pinia";
import { api } from "@/utils/axios";

const DEFAULT_MIN_PHOTO_COUNT = 1;
const DEFAULT_LIMIT = 5000;

export const useTagCloudStore = defineStore("tagCloud", {
  state: () => ({
    data: null, // { tags: [], metadata: {} } — raw response
    loading: false,
    error: null,
    _promise: null, // in-flight Promise so callers can await completion
  }),

  getters: {
    isReady: (state) => state.data !== null && !state.loading,
  },

  actions: {
    /**
     * Fire a prefetch with the default parameters.
     * - If already loaded, returns immediately.
     * - If a fetch is in-flight, returns the same Promise (deduplication).
     * - Otherwise starts a new fetch.
     */
    prefetch() {
      if (this.data !== null) return Promise.resolve(this.data);
      if (this._promise) return this._promise;

      this.loading = true;
      this.error = null;

      this._promise = api
        .post("/api/tagcloud/2d", {
          outputDims: 2,
          minPhotoCount: DEFAULT_MIN_PHOTO_COUNT,
          limit: DEFAULT_LIMIT,
        })
        .then(({ data }) => {
          this.data = data;
          return data;
        })
        .catch((err) => {
          this.error =
            err?.response?.data?.message ||
            err.message ||
            "Failed to prefetch tag cloud";
          throw err;
        })
        .finally(() => {
          this.loading = false;
          this._promise = null;
        });

      return this._promise;
    },

    /**
     * Wait for the in-flight prefetch to settle (if any), then return the
     * cached data. Returns null if no prefetch has been started.
     */
    async awaitData() {
      if (this._promise) {
        try {
          await this._promise;
        } catch {
          // error already stored in this.error
        }
      }
      return this.data;
    },

    resetStore() {
      this.data = null;
      this.loading = false;
      this.error = null;
      this._promise = null;
    },
  },
});

export { DEFAULT_MIN_PHOTO_COUNT, DEFAULT_LIMIT };
