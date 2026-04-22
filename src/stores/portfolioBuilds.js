import { defineStore } from "pinia";
import { api } from "@/utils/axios";

export const usePortfolioBuildsStore = defineStore("portfolioBuilds", {
  state: () => ({
    builds: null, // null = not loaded, [] = loaded but empty
    isLoading: false,
    isCreating: false,
    defaultWeights: null, // null = not yet fetched; cached after first call
  }),

  getters: {
    allBuilds: (state) => (Array.isArray(state.builds) ? state.builds : []),
    hasBeenLoaded: (state) => state.builds !== null,
    totalBuilds: (state) =>
      Array.isArray(state.builds) ? state.builds.length : 0,
  },

  actions: {
    resetStore() {
      this.builds = null;
      this.isLoading = false;
      this.isCreating = false;
      // Keep defaultWeights cached — they never change between sessions.
    },

    async getOrFetch(force = false) {
      if (this.hasBeenLoaded && !force) {
        return this.allBuilds;
      }
      return await this.fetchBuilds();
    },

    async fetchBuilds() {
      this.isLoading = true;
      try {
        const response = await api.get("/api/portfolio-build/list");
        this.builds = response.data.builds || [];
        return this.builds;
      } catch (error) {
        console.error("[PortfolioBuildsStore] fetchBuilds error:", error);
        this.builds = [];
        return [];
      } finally {
        this.isLoading = false;
      }
    },

    async checkEligibility(targetSize, collectionIds) {
      try {
        const params = {};
        if (typeof targetSize === "number" && Number.isFinite(targetSize)) {
          params.targetSize = targetSize;
        }
        if (Array.isArray(collectionIds) && collectionIds.length > 0) {
          params.collectionIds = collectionIds.join(",");
        }
        const response = await api.get("/api/portfolio-build/eligibility", {
          params: Object.keys(params).length ? params : undefined,
        });
        return response.data;
      } catch (error) {
        if (error.response?.status === 402) {
          return {
            eligible: false,
            reason: error.response.data.message || "Insufficient credits",
          };
        }
        throw error;
      }
    },

    async startBuild(config) {
      this.isCreating = true;
      try {
        const response = await api.post("/api/portfolio-build/start", {
          ...config,
          wait: false,
        });
        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] startBuild error:", error);
        throw error;
      } finally {
        this.isCreating = false;
      }
    },

    async getBuildStatus(buildId) {
      try {
        const response = await api.get(`/api/portfolio-build/${buildId}`);
        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] getBuildStatus error:", error);
        throw error;
      }
    },

    /**
     * Fetch the canonical default weight vector (0..1) from the backend.
     * Cached in store state after the first successful call — subsequent calls
     * are synchronous no-ops.
     *
     * Returns `Record<string, number>` or `null` on network error.
     */
    async fetchDefaultWeights() {
      if (this.defaultWeights) return this.defaultWeights;
      try {
        const response = await api.get("/api/portfolio-build/default-weights");
        this.defaultWeights = response.data.weights;
        return this.defaultWeights;
      } catch (error) {
        console.error(
          "[PortfolioBuildsStore] fetchDefaultWeights error:",
          error,
        );
        return null;
      }
    },

    /**
     * Parse a freeform style description into a sparse set of emphasized /
     * de-emphasized artistic criteria. The backend applies the emphasis on
     * top of a neutral baseline so that the resulting weights are well-defined
     * and never zero out criteria by omission.
     *
     * Returns `{ emphasize: string[], deemphasize: string[], weights: Record<string, number> }`
     * or `null` if the endpoint is unavailable / the text is empty.
     */
    async previewStyleWeights(stylePreferences) {
      const text = (stylePreferences || "").trim();
      if (!text) return null;
      try {
        const response = await api.post(
          "/api/portfolio-build/preview-style-weights",
          { stylePreferences: text },
        );
        return response.data;
      } catch (error) {
        // Endpoint may not exist yet — fail silently so the UI can keep
        // working with the neutral baseline.
        if (error.response?.status === 404) return null;
        console.error(
          "[PortfolioBuildsStore] previewStyleWeights error:",
          error,
        );
        return null;
      }
    },

    async saveLayout(buildId, photoIds) {
      try {
        const response = await api.patch(
          `/api/portfolio-build/${buildId}/layout`,
          { photoIds },
        );
        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] saveLayout error:", error);
        throw error;
      }
    },

    async deleteBuild(buildId) {
      try {
        const response = await api.delete(`/api/portfolio-build/${buildId}`);
        if (Array.isArray(this.builds)) {
          this.builds = this.builds.filter((b) => b.id !== buildId);
        }
        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] deleteBuild error:", error);
        throw error;
      }
    },
  },
});
