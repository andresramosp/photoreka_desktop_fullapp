import { defineStore } from "pinia";
import { api } from "@/utils/axios";

export const usePortfolioBuildsStore = defineStore("portfolioBuilds", {
  state: () => ({
    builds: null, // null = not loaded, [] = loaded but empty
    isLoading: false,
    isCreating: false,
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

    async checkEligibility(targetSize) {
      try {
        const params =
          typeof targetSize === "number" && Number.isFinite(targetSize)
            ? { targetSize }
            : undefined;
        const response = await api.get("/api/portfolio-build/eligibility", {
          params,
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
