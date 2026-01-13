// stores/collections.js

import { defineStore } from "pinia";
import { api } from "@/utils/axios";

export const useCollectionsStore = defineStore("collections", {
  state: () => ({
    // Data
    collections: null, // null indicates not loaded yet, [] means loaded but empty
    currentCollection: null,

    // Loading states
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isAddingPhotos: false,

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
    // Collections list - return empty array if not loaded yet
    allCollections: (state) =>
      Array.isArray(state.collections) ? state.collections : [],

    // Collection by ID
    getCollectionById: (state) => (id) => {
      if (!Array.isArray(state.collections)) return null;
      return state.collections.find(
        (collection) => String(collection.id) === String(id)
      );
    },

    // Stats
    totalCollections: (state) =>
      Array.isArray(state.collections) ? state.collections.length : 0,

    collectionsWithPhotos: (state) => {
      if (!Array.isArray(state.collections)) return [];
      return state.collections.filter(
        (collection) => collection.photos && collection.photos.length > 0
      );
    },

    // Current collection helpers
    currentCollectionPhotos: (state) => state.currentCollection?.photos || [],

    currentCollectionPhotoCount: (state) =>
      state.currentCollection?.photos?.length || 0,

    // Check if data has been loaded
    hasBeenLoaded: (state) => state.collections !== null,
  },

  actions: {
    // Resetear el store completamente (para cambios de usuario)
    resetStore() {
      this.collections = null;
      this.currentCollection = null;
      this.isLoading = false;
      this.isCreating = false;
      this.isDeleting = false;
      this.isAddingPhotos = false;
    },

    // Main fetch method following photosStore pattern
    async getOrFetch(force = false) {
      // If already loaded and not forcing, return existing data
      if (this.hasBeenLoaded && !force) {
        return this.allCollections;
      }

      // Otherwise fetch from API
      return await this.fetchCollections();
    },

    // Fetch collections from API
    async fetchCollections() {
      this.isLoading = true;
      try {
        const response = await api.get("/api/collections");
        this.collections = response.data.map((collection) => ({
          ...collection,
          photos: this.assignPhotoGradients(collection.photos || []),
          photoCount: (collection.photos || []).length,
          updatedAt: new Date(
            collection.updatedAt || collection.created_at || new Date()
          ),
        }));
        return this.collections;
      } catch (error) {
        console.error("Error loading collections:", error);
        throw error; // Let the component handle the error message
      } finally {
        this.isLoading = false;
      }
    },

    // Create new collection
    async createCollection(data) {
      this.isCreating = true;
      try {
        const payload = {
          name: data.title || data.name,
          description: data.description,
          photoIds: data.photoIds || [],
        };

        const response = await api.post("/api/collections", payload);

        // Add the new collection to the store
        const newCollection = {
          ...response.data,
          photos: this.assignPhotoGradients(response.data.photos || []),
          photoCount: (response.data.photos || []).length,
          updatedAt: new Date(response.data.updatedAt || new Date()),
        };

        if (Array.isArray(this.collections)) {
          this.collections.unshift(newCollection); // Add to beginning
        } else {
          this.collections = [newCollection];
        }

        return newCollection;
      } catch (error) {
        console.error("Error creating collection:", error);
        throw error;
      } finally {
        this.isCreating = false;
      }
    },

    // Delete collection
    async deleteCollection(id) {
      this.isDeleting = true;
      try {
        await api.delete(`/api/collections/${id}`);

        // Remove from store
        if (Array.isArray(this.collections)) {
          this.collections = this.collections.filter(
            (collection) => String(collection.id) !== String(id)
          );
        }

        // Clear current collection if it was the deleted one
        if (
          this.currentCollection &&
          String(this.currentCollection.id) === String(id)
        ) {
          this.currentCollection = null;
        }

        return true;
      } catch (error) {
        console.error("Error deleting collection:", error);
        throw error;
      } finally {
        this.isDeleting = false;
      }
    },

    // Add photos to collection
    async addPhotosToCollection(collectionId, photoIds) {
      this.isAddingPhotos = true;
      try {
        await api.post(`/api/collections/${collectionId}/photos`, {
          photoIds,
        });

        // Refresh the specific collection data
        await this.refreshCollection(collectionId);

        return true;
      } catch (error) {
        console.error("Error adding photos to collection:", error);
        throw error;
      } finally {
        this.isAddingPhotos = false;
      }
    },

    // Remove photos from collection
    async removePhotosFromCollection(collectionId, photoIds) {
      try {
        await api.delete(`/api/collections/${collectionId}/photos`, {
          data: { photoIds },
        });

        // Refresh the specific collection data
        await this.refreshCollection(collectionId);

        return true;
      } catch (error) {
        console.error("Error removing photos from collection:", error);
        throw error;
      }
    },

    // Refresh a specific collection
    async refreshCollection(collectionId) {
      try {
        const response = await api.get(`/api/collections/${collectionId}`);
        const updatedCollection = {
          ...response.data,
          photos: this.assignPhotoGradients(response.data.photos || []),
          photoCount: (response.data.photos || []).length,
          updatedAt: new Date(response.data.updatedAt || new Date()),
        };

        // Update in collections array
        if (Array.isArray(this.collections)) {
          const index = this.collections.findIndex(
            (collection) => String(collection.id) === String(collectionId)
          );
          if (index !== -1) {
            this.collections[index] = updatedCollection;
          }
        }

        // Update current collection if it matches
        if (
          this.currentCollection &&
          String(this.currentCollection.id) === String(collectionId)
        ) {
          this.currentCollection = updatedCollection;
        }

        return updatedCollection;
      } catch (error) {
        console.error("Error refreshing collection:", error);
        throw error;
      }
    },

    // Collection navigation
    setCurrentCollection(collection) {
      this.currentCollection = collection;
    },

    clearCurrentCollection() {
      this.currentCollection = null;
    },

    // Helper method to assign gradient colors to photos
    assignPhotoGradients(photos) {
      return photos.map((photo, index) => ({
        ...photo,
        gradient: this.photoGradients[index % this.photoGradients.length],
      }));
    },

    // Get collection with full photo data from photosStore
    getCollectionWithFullPhotos(collectionId, photosStore) {
      const collection = this.getCollectionById(collectionId);
      if (!collection) return null;

      // Get photo IDs from the collection
      const photoIds = (collection.photos || []).map((p) => p.id);

      // Get full photos from photosStore
      const fullPhotos = photosStore.allPhotos.filter((p) =>
        photoIds.includes(p.id)
      );

      return {
        ...collection,
        photos: fullPhotos,
      };
    },

    // Utility method for date formatting (can be moved to utils later)
    formatDate(date) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24)),
        "day"
      );
    },
  },
});
