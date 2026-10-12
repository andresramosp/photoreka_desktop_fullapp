import { defineStore } from "pinia";
import { api } from "@/utils/axios";
import { emitRouteTabsInstancePurge } from "@/config/routeTabs";

/**
 * Fired after photos are appended to a portfolio from outside its detail view
 * (the "add to portfolio" modal). A detail view kept alive in a tab loads its
 * build exactly once, so without this it would keep showing the stale list —
 * and worse, saving its layout would drop the photos just added.
 *
 * detail: `{ buildId: number, photoItems: Array<{ id, thumbnailUrl }> }`
 */
export const PORTFOLIO_PHOTOS_ADDED_EVENT = "photoreka:portfolio-photos-added";

const emitPortfolioPhotosAdded = (buildId, photoItems) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PORTFOLIO_PHOTOS_ADDED_EVENT, {
      detail: { buildId: Number(buildId), photoItems },
    }),
  );
};

export const usePortfolioBuildsStore = defineStore("portfolioBuilds", {
  state: () => ({
    builds: null, // null = not loaded, [] = loaded but empty
    buildSets: null, // null = not loaded, [] = loaded but empty
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    // Published items keyed by build id, or null while never fetched.
    publicItemsByBuildId: null,
    // Handle the public pages are served under. Null means not claimed yet.
    publicUsername: null,
    defaultWeights: null, // null = not yet fetched; cached after first call
  }),

  getters: {
    allBuilds: (state) => (Array.isArray(state.builds) ? state.builds : []),
    allBuildSets: (state) =>
      Array.isArray(state.buildSets) ? state.buildSets : [],
    rootBuilds: (state) => {
      if (!Array.isArray(state.builds)) return [];
      return state.builds.filter((build) => !build.setId);
    },
    rootSets: (state) => {
      if (!Array.isArray(state.buildSets)) return [];
      return state.buildSets.filter((set) => !set.parentSetId);
    },
    getSetById: (state) => (id) => {
      if (!Array.isArray(state.buildSets)) return null;
      return state.buildSets.find((set) => String(set.id) === String(id));
    },
    buildsInSet: (state) => (setId) => {
      if (!Array.isArray(state.builds)) return [];
      return state.builds.filter(
        (build) => String(build.setId) === String(setId),
      );
    },
    childSetsOf: (state) => (setId) => {
      if (!Array.isArray(state.buildSets)) return [];
      return state.buildSets.filter(
        (set) => String(set.parentSetId) === String(setId),
      );
    },
    hasBeenLoaded: (state) => state.builds !== null,
    setsHaveBeenLoaded: (state) => state.buildSets !== null,
    totalBuilds: (state) =>
      Array.isArray(state.builds) ? state.builds.length : 0,
  },

  actions: {
    resetStore() {
      this.builds = null;
      this.buildSets = null;
      this.isLoading = false;
      this.isCreating = false;
      this.isDeleting = false;
      // Keep defaultWeights cached — they never change between sessions.
    },

    async getOrFetch(force = false) {
      if (this.hasBeenLoaded && !force) {
        return this.allBuilds;
      }
      return await this.fetchBuilds();
    },

    async getOrFetchSets(force = false) {
      if (this.setsHaveBeenLoaded && !force) {
        return this.allBuildSets;
      }
      return await this.fetchBuildSets();
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

    async fetchBuildSets() {
      try {
        const response = await api.get("/api/portfolio-build-sets");
        this.buildSets = response.data.map((set) => ({
          ...set,
          updatedAt: new Date(set.updatedAt || set.created_at || new Date()),
        }));
        return this.buildSets;
      } catch (error) {
        console.error("[PortfolioBuildsStore] fetchBuildSets error:", error);
        throw error;
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

    /**
     * Create a manually-curated (empty) portfolio. No AI build runs; the
     * user will add photos through the detail view.
     */
    async createManual({ name, description, setId }) {
      this.isCreating = true;
      try {
        const response = await api.post("/api/portfolio-build/manual", {
          name,
          description,
          setId: setId || null,
        });
        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] createManual error:", error);
        throw error;
      } finally {
        this.isCreating = false;
      }
    },

    async createBuildSet(data) {
      try {
        const payload = {
          name: data.name,
          description: data.description || null,
          parentSetId: data.parentSetId || null,
        };
        const response = await api.post("/api/portfolio-build-sets", payload);
        const newSet = {
          ...response.data,
          updatedAt: new Date(response.data.updatedAt || new Date()),
        };
        if (Array.isArray(this.buildSets)) {
          this.buildSets.push(newSet);
        } else {
          this.buildSets = [newSet];
        }
        return newSet;
      } catch (error) {
        console.error("[PortfolioBuildsStore] createBuildSet error:", error);
        throw error;
      }
    },

    async updateBuildSet(id, data) {
      try {
        const payload = {
          name: data.name,
          description: data.description ?? null,
          parentSetId: data.parentSetId ?? undefined,
        };
        await api.put(`/api/portfolio-build-sets/${id}`, payload);
        if (Array.isArray(this.buildSets)) {
          const idx = this.buildSets.findIndex(
            (set) => String(set.id) === String(id),
          );
          if (idx !== -1) {
            this.buildSets[idx] = {
              ...this.buildSets[idx],
              ...payload,
              updatedAt: new Date(),
            };
          }
        }
        return true;
      } catch (error) {
        console.error("[PortfolioBuildsStore] updateBuildSet error:", error);
        throw error;
      }
    },

    async deleteBuildSet(id) {
      try {
        const deletedSet = Array.isArray(this.buildSets)
          ? this.buildSets.find((set) => String(set.id) === String(id))
          : null;
        const promotedParentId = deletedSet?.parentSetId ?? null;

        await api.delete(`/api/portfolio-build-sets/${id}`);
        if (Array.isArray(this.buildSets)) {
          this.buildSets = this.buildSets.filter(
            (set) => String(set.id) !== String(id),
          );
          this.buildSets.forEach((set) => {
            if (String(set.parentSetId) === String(id)) {
              set.parentSetId = promotedParentId;
            }
          });
        }
        if (Array.isArray(this.builds)) {
          this.builds.forEach((build) => {
            if (String(build.setId) === String(id)) {
              build.setId = promotedParentId;
            }
          });
        }
        return true;
      } catch (error) {
        console.error("[PortfolioBuildsStore] deleteBuildSet error:", error);
        throw error;
      }
    },

    async moveBuildToSet(buildId, targetSetId) {
      try {
        await api.patch("/api/portfolio-build/move", {
          buildId,
          targetSetId: targetSetId || null,
        });
        if (Array.isArray(this.builds)) {
          const build = this.builds.find(
            (b) => String(b.id) === String(buildId),
          );
          if (build) {
            const oldSetId = build.setId;
            build.setId = targetSetId || null;
            if (Array.isArray(this.buildSets)) {
              if (oldSetId) {
                const oldSet = this.buildSets.find(
                  (set) => String(set.id) === String(oldSetId),
                );
                if (oldSet && oldSet.portfolioBuildsCount > 0)
                  oldSet.portfolioBuildsCount -= 1;
              }
              if (targetSetId) {
                const newSet = this.buildSets.find(
                  (set) => String(set.id) === String(targetSetId),
                );
                if (newSet)
                  newSet.portfolioBuildsCount =
                    (newSet.portfolioBuildsCount ?? 0) + 1;
              }
            }
          }
        }
        return true;
      } catch (error) {
        console.error("[PortfolioBuildsStore] moveBuildToSet error:", error);
        throw error;
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

    /**
     * Fetch the backend-authoritative credit estimate for the given build
     * configuration. Returns the number of credits, or `null` on error
     * (callers should fall back to a local approximation).
     */
    async fetchEstimateCredits({
      targetSize,
      coherenceMode,
      sequencing,
      stylePreferences,
    }) {
      try {
        const params = {
          targetSize,
          coherenceMode,
          sequencing: sequencing ? "true" : "false",
        };
        if (stylePreferences && stylePreferences.trim().length > 0) {
          params.stylePreferences = stylePreferences.trim();
        }
        const response = await api.get(
          "/api/portfolio-build/estimate-credits",
          { params },
        );
        return response.data.credits ?? null;
      } catch (error) {
        console.error(
          "[PortfolioBuildsStore] fetchEstimateCredits error:",
          error,
        );
        return null;
      }
    },

    /**
     * Persist the portfolio layout: photo order and/or the grid presentation
     * settings ({ columns, gap, fillAvailableSpace }). Both are optional, but
     * the backend requires at least one.
     */
    async saveLayout(buildId, photoIds, gridSettings) {
      try {
        const payload = {};
        if (photoIds !== undefined) payload.photoIds = photoIds;
        if (gridSettings !== undefined) payload.gridSettings = gridSettings;
        const response = await api.patch(
          `/api/portfolio-build/${buildId}/layout`,
          payload,
        );

        // Keep the cached list in sync so the portfolios/set views don't show
        // a stale order or grid config after the user navigates back.
        if (Array.isArray(this.builds)) {
          const cached = this.builds.find(
            (b) => String(b.id) === String(buildId),
          );
          if (cached) {
            if (gridSettings !== undefined) {
              cached.config = { ...(cached.config || {}), gridSettings };
            }
            if (Array.isArray(response.data?.photoIds)) {
              cached.resultCount = response.data.photoIds.length;
              if (Array.isArray(cached.photoItems)) {
                const byId = new Map(
                  cached.photoItems.map((item) => [String(item.id), item]),
                );
                cached.photoItems = response.data.photoIds
                  .map((id) => byId.get(String(id)))
                  .filter(Boolean);
              }
            }
          }
        }

        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] saveLayout error:", error);
        throw error;
      }
    },

    // Update portfolio name/description (both live in `config`)
    async updateBuildDetails(buildId, { name, description }) {
      try {
        const response = await api.put(`/api/portfolio-build/${buildId}`, {
          name,
          description,
        });
        const details = {
          name: response.data.name,
          description: response.data.description ?? undefined,
        };

        if (Array.isArray(this.builds)) {
          const cached = this.builds.find(
            (b) => String(b.id) === String(buildId),
          );
          if (cached) {
            cached.config = { ...(cached.config || {}), ...details };
          }
        }

        // A rename moves the public link, so the share dialog must show the new one.
        const publicItem = this.getPublicItemForBuild(buildId);
        if (publicItem && response.data.publicSlug) {
          this.publicItemsByBuildId[String(buildId)] = {
            ...publicItem,
            slug: response.data.publicSlug,
          };
        }

        return details;
      } catch (error) {
        console.error("[PortfolioBuildsStore] updateBuildDetails error:", error);
        throw error;
      }
    },

    /**
     * Append photos to an existing (completed) portfolio.
     *
     * There is no dedicated "add photos" endpoint: the layout PATCH replaces the
     * whole photo list, so we merge the new ids on top of the portfolio's current
     * order — re-read from the server first so a stale cache can't silently drop
     * photos added from another tab/device.
     *
     * Returns `{ added, total }`.
     */
    async addPhotosToBuild(buildId, photoIds) {
      const ids = (Array.isArray(photoIds) ? photoIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length === 0) return { added: 0, total: 0 };

      const build = await this.getBuildStatus(buildId);
      const currentIds = (
        build?.result?.photoIds ??
        (build?.result?.photoItems || []).map((item) => item.id)
      ).map(Number);

      const existing = new Set(currentIds);
      const toAdd = [...new Set(ids)].filter((id) => !existing.has(id));
      if (toAdd.length === 0) {
        return { added: 0, total: currentIds.length };
      }

      const merged = [...currentIds, ...toAdd];
      await this.saveLayout(buildId, merged);

      // saveLayout can only re-map thumbnails it already had cached, so the
      // freshly added photos would be missing from the list previews. Re-sync
      // the cached entry from the server copy instead.
      let addedItems = [];
      try {
        const updated = await this.getBuildStatus(buildId);
        const items = updated?.result?.photoItems;
        if (Array.isArray(items)) {
          const addedSet = new Set(toAdd);
          addedItems = items.filter((item) => addedSet.has(Number(item.id)));
        }
        if (Array.isArray(this.builds)) {
          const cached = this.builds.find(
            (b) => String(b.id) === String(buildId),
          );
          if (cached) {
            if (Array.isArray(items)) cached.photoItems = items;
            cached.resultCount =
              updated?.result?.photoIds?.length ?? merged.length;
          }
        }
      } catch (error) {
        // The photos are already saved; a stale preview isn't worth failing on.
        console.error("[PortfolioBuildsStore] addPhotosToBuild sync:", error);
      }

      // Let an open detail view of this portfolio pick the photos up without a
      // page reload. With no items resolved it still signals "reload me".
      emitPortfolioPhotosAdded(buildId, addedItems);

      return { added: toAdd.length, total: merged.length };
    },

    async deleteBuild(buildId) {
      this.isDeleting = true;
      try {
        const response = await api.delete(`/api/portfolio-build/${buildId}`);
        emitRouteTabsInstancePurge("portfolios", [buildId]);
        if (Array.isArray(this.builds)) {
          const deletedBuild = this.builds.find(
            (b) => String(b.id) === String(buildId),
          );
          this.builds = this.builds.filter((b) => b.id !== buildId);
          if (deletedBuild?.setId && Array.isArray(this.buildSets)) {
            const set = this.buildSets.find(
              (s) => String(s.id) === String(deletedBuild.setId),
            );
            if (set && set.portfolioBuildsCount > 0)
              set.portfolioBuildsCount -= 1;
          }
        }
        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] deleteBuild error:", error);
        throw error;
      } finally {
        this.isDeleting = false;
      }
    },

    async deleteBuilds(ids) {
      this.isDeleting = true;
      try {
        const response = await api.delete("/api/portfolio-build", {
          data: { ids },
        });
        emitRouteTabsInstancePurge("portfolios", ids);
        if (Array.isArray(this.builds)) {
          const idSet = new Set(ids.map(String));
          const deletedBuilds = this.builds.filter((build) =>
            idSet.has(String(build.id)),
          );
          this.builds = this.builds.filter(
            (build) => !idSet.has(String(build.id)),
          );
          if (Array.isArray(this.buildSets)) {
            deletedBuilds.forEach((build) => {
              if (!build.setId) return;
              const set = this.buildSets.find(
                (s) => String(s.id) === String(build.setId),
              );
              if (set && set.portfolioBuildsCount > 0)
                set.portfolioBuildsCount -= 1;
            });
          }
        }
        return response.data;
      } catch (error) {
        console.error("[PortfolioBuildsStore] deleteBuilds error:", error);
        throw error;
      } finally {
        this.isDeleting = false;
      }
    },

    async fetchPublicItems() {
      const response = await api.get("/api/public-items");
      const map = {};
      for (const item of response.data?.publicItems || []) {
        if (item.itemType === "portfolio") map[String(item.itemId)] = item;
      }
      this.publicItemsByBuildId = map;
      this.publicUsername = response.data?.username ?? null;
      return map;
    },

    async claimUsername(username) {
      const response = await api.put("/api/me/username", { username });
      this.publicUsername = response.data?.username ?? null;
      return this.publicUsername;
    },

    async getOrFetchPublicItems() {
      if (this.publicItemsByBuildId !== null) return this.publicItemsByBuildId;
      return this.fetchPublicItems();
    },

    getPublicItemForBuild(buildId) {
      return this.publicItemsByBuildId?.[String(buildId)] ?? null;
    },

    /**
     * Publish a portfolio. `aspectRatios` comes from the grid the user is looking
     * at, so the public page can lay out before a single image has loaded.
     */
    async publishBuild(buildId, { slug, aspectRatios } = {}) {
      const response = await api.post("/api/public-items", {
        itemType: "portfolio",
        itemId: buildId,
        slug,
        aspectRatios,
      });
      const item = response.data?.publicItem;
      if (item) {
        if (this.publicItemsByBuildId === null) this.publicItemsByBuildId = {};
        this.publicItemsByBuildId[String(buildId)] = item;
      }
      return item;
    },

    async unpublishBuild(buildId) {
      const item = this.getPublicItemForBuild(buildId);
      if (!item) return;
      await api.delete(`/api/public-items/${item.id}`);
      if (this.publicItemsByBuildId) {
        delete this.publicItemsByBuildId[String(buildId)];
      }
    },

    getBreadcrumbFor(setId) {
      const trail = [];
      let current = this.getSetById(setId);
      while (current) {
        trail.unshift(current);
        current = current.parentSetId
          ? this.getSetById(current.parentSetId)
          : null;
      }
      return trail;
    },
  },
});
