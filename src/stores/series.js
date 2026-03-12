// stores/series.js

import { defineStore } from "pinia";
import { api } from "@/utils/axios";

export const useSeriesStore = defineStore("series", {
  state: () => ({
    // Data
    series: null, // null indicates not loaded yet, [] means loaded but empty
    currentSeries: null,

    // Loading states
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isAddingPhotos: false,
    isRemovingPhotos: false,
    isReordering: false,

    // UI helpers - predefined gradients for photo placeholders
    photoGradients: [
      "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
      "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
      "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
      "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
      "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
      "linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)",
      "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
      "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
      "linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)",
      "linear-gradient(135deg, #a8caba 0%, #5d4e75 100%)",
      "linear-gradient(135deg, #29323c 0%, #485563 100%)",
    ],
  }),

  getters: {
    // Series list - return empty array if not loaded yet
    allSeries: (state) => (Array.isArray(state.series) ? state.series : []),

    // Series by ID
    getSeriesById: (state) => (id) => {
      if (!Array.isArray(state.series)) return null;
      return state.series.find((s) => String(s.id) === String(id));
    },

    // Stats
    totalSeries: (state) =>
      Array.isArray(state.series) ? state.series.length : 0,

    seriesWithPhotos: (state) => {
      if (!Array.isArray(state.series)) return [];
      return state.series.filter((s) => s.photos && s.photos.length > 0);
    },

    // Current series helpers
    currentSeriesPhotos: (state) => state.currentSeries?.photos || [],

    currentSeriesPhotoCount: (state) =>
      state.currentSeries?.photos?.length || 0,

    // Check if data has been loaded
    hasBeenLoaded: (state) => state.series !== null,
  },

  actions: {
    // Resetear el store completamente (para cambios de usuario)
    resetStore() {
      this.series = null;
      this.currentSeries = null;
      this.isLoading = false;
      this.isCreating = false;
      this.isDeleting = false;
      this.isAddingPhotos = false;
      this.isRemovingPhotos = false;
      this.isReordering = false;
    },

    // Main fetch method following photosStore pattern
    async getOrFetch(force = false) {
      // If already loaded and not forcing, return existing data
      if (this.hasBeenLoaded && !force) {
        return this.allSeries;
      }

      // Otherwise fetch from API
      return await this.fetchSeries();
    },

    // Fetch all series from API
    async fetchSeries() {
      this.isLoading = true;
      try {
        const response = await api.get("/api/series");
        this.series = response.data.map((s) => ({
          ...s,
          photos: this.assignPhotoGradients(s.photos || []),
          photoCount: (s.photos || []).length,
          updatedAt: new Date(s.updatedAt || s.created_at || new Date()),
        }));
        return this.series;
      } catch (error) {
        console.error("Error loading series:", error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    // Create new series
    async createSeries(data) {
      this.isCreating = true;
      try {
        const payload = {
          name: data.title || data.name,
          description: data.description,
          photoIds: data.photoIds || [],
        };

        const response = await api.post("/api/series", payload);

        // Add the new series to the store
        const newSeries = {
          ...response.data,
          photos: this.assignPhotoGradients(response.data.photos || []),
          photoCount: (response.data.photos || []).length,
          updatedAt: new Date(response.data.updatedAt || new Date()),
        };

        if (Array.isArray(this.series)) {
          this.series.unshift(newSeries); // Add to beginning
        } else {
          this.series = [newSeries];
        }

        return newSeries;
      } catch (error) {
        console.error("Error creating series:", error);
        throw error;
      } finally {
        this.isCreating = false;
      }
    },

    // Update series name/description
    async updateSeries(id, data) {
      try {
        const payload = {
          name: data.title || data.name,
          description: data.description,
        };

        const response = await api.put(`/api/series/${id}`, payload);

        // Update in series array
        if (Array.isArray(this.series)) {
          const index = this.series.findIndex(
            (s) => String(s.id) === String(id)
          );
          if (index !== -1) {
            this.series[index] = {
              ...this.series[index],
              ...response.data,
              updatedAt: new Date(response.data.updatedAt || new Date()),
            };
          }
        }

        // Update current series if it matches
        if (
          this.currentSeries &&
          String(this.currentSeries.id) === String(id)
        ) {
          this.currentSeries = {
            ...this.currentSeries,
            ...response.data,
            updatedAt: new Date(response.data.updatedAt || new Date()),
          };
        }

        return response.data;
      } catch (error) {
        console.error("Error updating series:", error);
        throw error;
      }
    },

    // Delete series
    async deleteSeries(id) {
      this.isDeleting = true;
      try {
        await api.delete(`/api/series/${id}`);

        // Remove from store
        if (Array.isArray(this.series)) {
          this.series = this.series.filter((s) => String(s.id) !== String(id));
        }

        // Clear current series if it was the deleted one
        if (
          this.currentSeries &&
          String(this.currentSeries.id) === String(id)
        ) {
          this.currentSeries = null;
        }

        return true;
      } catch (error) {
        console.error("Error deleting series:", error);
        throw error;
      } finally {
        this.isDeleting = false;
      }
    },

    // Add photos to series (they get added at the end with order)
    async addPhotosToSeries(seriesId, photoIds) {
      this.isAddingPhotos = true;
      try {
        await api.post(`/api/series/${seriesId}/photos`, {
          photoIds,
        });

        // Refresh the specific series data
        await this.refreshSeries(seriesId);

        return true;
      } catch (error) {
        console.error("Error adding photos to series:", error);
        throw error;
      } finally {
        this.isAddingPhotos = false;
      }
    },

    // Insert photos into a series at a specific position.
    // Implementation: append via existing endpoint, then re-order.
    async insertPhotosAt(seriesId, photoIds, insertIndex) {
      if (!Array.isArray(photoIds) || photoIds.length === 0) return true;

      const current = this.getSeriesById(seriesId);
      const currentOrderedIds = (current?.photos || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((p) => p.id);

      const safeIndex = Math.min(
        Math.max(Number(insertIndex) || 0, 0),
        currentOrderedIds.length
      );

      // 1) Append (backend sets order)
      await this.addPhotosToSeries(seriesId, photoIds);

      // 2) Reorder to move the inserted photos into the desired position
      const updated = this.getSeriesById(seriesId);
      const updatedOrderedIds = (updated?.photos || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((p) => p.id);

      const actuallyAddedIds = photoIds.filter((id) =>
        updatedOrderedIds.includes(id)
      );
      const baseIds = updatedOrderedIds.filter(
        (id) => !actuallyAddedIds.includes(id)
      );

      baseIds.splice(safeIndex, 0, ...actuallyAddedIds);

      const payload = baseIds.map((photoId, order) => ({ photoId, order }));
      await this.updatePhotoOrder(seriesId, payload);

      return true;
    },

    // Remove photos from series
    async removePhotosFromSeries(seriesId, photoIds) {
      this.isRemovingPhotos = true;
      try {
        await api.delete(`/api/series/${seriesId}/photos`, {
          data: { photoIds },
        });

        // Refresh the specific series data
        await this.refreshSeries(seriesId);

        return true;
      } catch (error) {
        console.error("Error removing photos from series:", error);
        throw error;
      } finally {
        this.isRemovingPhotos = false;
      }
    },

    // Update order massively: { photos: [{ photoId, order }] }
    async updatePhotoOrder(seriesId, photos) {
      this.isReordering = true;
      try {
        await api.put(`/api/series/${seriesId}/order`, {
          photos,
        });

        // Refresh the specific series data
        await this.refreshSeries(seriesId);

        return true;
      } catch (error) {
        console.error("Error updating photo order:", error);
        throw error;
      } finally {
        this.isReordering = false;
      }
    },

    // Move a single photo to a new position
    async movePhoto(seriesId, photoId, newPosition) {
      this.isReordering = true;
      try {
        await api.put(`/api/series/${seriesId}/move`, {
          photoId,
          newPosition,
        });

        // Refresh the specific series data
        await this.refreshSeries(seriesId);

        return true;
      } catch (error) {
        console.error("Error moving photo:", error);
        throw error;
      } finally {
        this.isReordering = false;
      }
    },

    // Refresh a specific series
    async refreshSeries(seriesId) {
      try {
        const response = await api.get(`/api/series/${seriesId}`);
        const updatedSeries = {
          ...response.data,
          photos: this.assignPhotoGradients(response.data.photos || []),
          photoCount: (response.data.photos || []).length,
          updatedAt: new Date(response.data.updatedAt || new Date()),
        };

        // Update in series array
        if (Array.isArray(this.series)) {
          const index = this.series.findIndex(
            (s) => String(s.id) === String(seriesId)
          );
          if (index !== -1) {
            this.series[index] = updatedSeries;
          }
        }

        // Update current series if it matches
        if (
          this.currentSeries &&
          String(this.currentSeries.id) === String(seriesId)
        ) {
          this.currentSeries = updatedSeries;
        }

        return updatedSeries;
      } catch (error) {
        console.error("Error refreshing series:", error);
        throw error;
      }
    },

    // Fetch a public series by user ID and name (for anonymous users)
    async fetchSeriesByName(userId, serieName) {
      this.isLoading = true;
      try {
        const response = await api.get(
          `/api/series/by-name/${encodeURIComponent(serieName)}`,
          { params: { userId } }
        );
        const series = {
          ...response.data,
          photos: this.assignPhotoGradients(response.data.photos || []),
          photoCount: (response.data.photos || []).length,
          updatedAt: new Date(response.data.updatedAt || new Date()),
        };
        return series;
      } catch (error) {
        console.error("Error fetching series by name:", error);
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    // Series navigation
    setCurrentSeries(series) {
      this.currentSeries = series;
    },

    clearCurrentSeries() {
      this.currentSeries = null;
    },

    // Helper method to assign gradient colors to photos
    assignPhotoGradients(photos) {
      return photos.map((photo, index) => ({
        ...photo,
        gradient: this.photoGradients[index % this.photoGradients.length],
      }));
    },

    // Get series with full photo data from photosStore (maintaining order)
    getSeriesWithFullPhotos(seriesId, photosStore) {
      const series = this.getSeriesById(seriesId);
      if (!series) return null;

      // Get photo IDs from the series (already ordered)
      const seriesPhotos = series.photos || [];

      // Get full photos from photosStore while maintaining order
      const fullPhotos = seriesPhotos
        .map((sp) => {
          const fullPhoto = photosStore.allPhotos.find((p) => p.id === sp.id);
          return fullPhoto
            ? { ...fullPhoto, order: sp.order }
            : { ...sp, order: sp.order };
        })
        .sort((a, b) => (a.order || 0) - (b.order || 0));

      return {
        ...series,
        photos: fullPhotos,
      };
    },

    // Utility method for date formatting
    formatDate(date) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24)),
        "day"
      );
    },
  },
});
