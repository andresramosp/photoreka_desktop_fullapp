// stores/collections.js

import { defineStore } from "pinia";
import { api } from "@/utils/axios";

export const useCollectionsStore = defineStore("collections", {
  state: () => ({
    // Data
    collections: null, // null indicates not loaded yet, [] means loaded but empty
    collectionSets: null, // null indicates not loaded yet
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

    allCollectionSets: (state) =>
      Array.isArray(state.collectionSets) ? state.collectionSets : [],

    // Root-level collections (not inside any set)
    rootCollections: (state) => {
      if (!Array.isArray(state.collections)) return [];
      return state.collections.filter((c) => !c.setId);
    },

    // Root-level sets (no parent)
    rootSets: (state) => {
      if (!Array.isArray(state.collectionSets)) return [];
      return state.collectionSets.filter((s) => !s.parentSetId);
    },

    // Collection by ID
    getCollectionById: (state) => (id) => {
      if (!Array.isArray(state.collections)) return null;
      return state.collections.find(
        (collection) => String(collection.id) === String(id),
      );
    },

    getSetById: (state) => (id) => {
      if (!Array.isArray(state.collectionSets)) return null;
      return state.collectionSets.find((s) => String(s.id) === String(id));
    },

    // Collections in a specific set
    collectionsInSet: (state) => (setId) => {
      if (!Array.isArray(state.collections)) return [];
      return state.collections.filter((c) => String(c.setId) === String(setId));
    },

    // Child sets of a specific set
    childSetsOf: (state) => (setId) => {
      if (!Array.isArray(state.collectionSets)) return [];
      return state.collectionSets.filter(
        (s) => String(s.parentSetId) === String(setId),
      );
    },

    // Stats
    totalCollections: (state) =>
      Array.isArray(state.collections) ? state.collections.length : 0,

    collectionsWithPhotos: (state) => {
      if (!Array.isArray(state.collections)) return [];
      return state.collections.filter(
        (collection) => collection.photos && collection.photos.length > 0,
      );
    },

    // Current collection helpers
    currentCollectionPhotos: (state) => state.currentCollection?.photos || [],

    currentCollectionPhotoCount: (state) =>
      state.currentCollection?.photos?.length || 0,

    // Check if data has been loaded
    hasBeenLoaded: (state) => state.collections !== null,
    setsHaveBeenLoaded: (state) => state.collectionSets !== null,
  },

  actions: {
    // Resetear el store completamente (para cambios de usuario)
    resetStore() {
      this.collections = null;
      this.collectionSets = null;
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

    async getOrFetchSets(force = false) {
      if (this.setsHaveBeenLoaded && !force) {
        return this.allCollectionSets;
      }
      return await this.fetchCollectionSets();
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
            collection.updatedAt || collection.created_at || new Date(),
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

    // Fetch collection sets from API
    async fetchCollectionSets() {
      try {
        const response = await api.get("/api/collection-sets");
        this.collectionSets = response.data.map((set) => ({
          ...set,
          updatedAt: new Date(set.updatedAt || set.created_at || new Date()),
        }));
        return this.collectionSets;
      } catch (error) {
        console.error("Error loading collection sets:", error);
        throw error;
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
          setId: data.setId || null,
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

    // Create a new collection set
    async createCollectionSet(data) {
      try {
        const payload = {
          name: data.name,
          description: data.description || null,
          parentSetId: data.parentSetId || null,
        };
        const response = await api.post("/api/collection-sets", payload);
        const newSet = {
          ...response.data,
          updatedAt: new Date(response.data.updatedAt || new Date()),
        };
        if (Array.isArray(this.collectionSets)) {
          this.collectionSets.push(newSet);
        } else {
          this.collectionSets = [newSet];
        }
        return newSet;
      } catch (error) {
        console.error("Error creating collection set:", error);
        throw error;
      }
    },

    // Update a collection set
    async updateCollectionSet(id, data) {
      try {
        const payload = {
          name: data.name,
          description: data.description ?? null,
          parentSetId: data.parentSetId ?? undefined,
        };
        await api.put(`/api/collection-sets/${id}`, payload);
        if (Array.isArray(this.collectionSets)) {
          const idx = this.collectionSets.findIndex(
            (s) => String(s.id) === String(id),
          );
          if (idx !== -1) {
            this.collectionSets[idx] = {
              ...this.collectionSets[idx],
              ...payload,
              updatedAt: new Date(),
            };
          }
        }
        return true;
      } catch (error) {
        console.error("Error updating collection set:", error);
        throw error;
      }
    },

    // Delete a collection set
    async deleteCollectionSet(id) {
      try {
        await api.delete(`/api/collection-sets/${id}`);
        if (Array.isArray(this.collectionSets)) {
          this.collectionSets = this.collectionSets.filter(
            (s) => String(s.id) !== String(id),
          );
          // Promote child sets to root in local state
          this.collectionSets.forEach((s) => {
            if (String(s.parentSetId) === String(id)) {
              s.parentSetId = null;
            }
          });
        }
        // Move orphaned collections to root in local state
        if (Array.isArray(this.collections)) {
          this.collections.forEach((c) => {
            if (String(c.setId) === String(id)) {
              c.setId = null;
            }
          });
        }
        return true;
      } catch (error) {
        console.error("Error deleting collection set:", error);
        throw error;
      }
    },

    // Move a collection to a different set (or root)
    async moveCollectionToSet(collectionId, targetSetId) {
      try {
        await api.patch("/api/collections/move", {
          collectionId,
          targetSetId: targetSetId || null,
        });
        if (Array.isArray(this.collections)) {
          const col = this.collections.find(
            (c) => String(c.id) === String(collectionId),
          );
          if (col) {
            const oldSetId = col.setId;
            col.setId = targetSetId || null;
            // Update collectionsCount on the sets involved
            if (Array.isArray(this.collectionSets)) {
              if (oldSetId) {
                const oldSet = this.collectionSets.find(
                  (s) => String(s.id) === String(oldSetId),
                );
                if (oldSet && oldSet.collectionsCount > 0)
                  oldSet.collectionsCount -= 1;
              }
              if (targetSetId) {
                const newSet = this.collectionSets.find(
                  (s) => String(s.id) === String(targetSetId),
                );
                if (newSet)
                  newSet.collectionsCount = (newSet.collectionsCount ?? 0) + 1;
              }
            }
          }
        }
        return true;
      } catch (error) {
        console.error("Error moving collection:", error);
        throw error;
      }
    },

    // Bulk delete collections
    async deleteCollections(ids) {
      this.isDeleting = true;
      try {
        await api.delete("/api/collections", { data: { ids } });

        if (Array.isArray(this.collections)) {
          const idSet = new Set(ids.map(String));
          this.collections = this.collections.filter(
            (c) => !idSet.has(String(c.id)),
          );
        }

        if (
          this.currentCollection &&
          ids.map(String).includes(String(this.currentCollection.id))
        ) {
          this.currentCollection = null;
        }

        return true;
      } catch (error) {
        console.error("Error bulk deleting collections:", error);
        throw error;
      } finally {
        this.isDeleting = false;
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
            (collection) => String(collection.id) !== String(id),
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

    // Update collection (name/description)
    async updateCollection(id, data) {
      try {
        const payload = {
          name: data.title || data.name,
          description: data.description,
        };

        await api.put(`/api/collections/${id}`, payload);

        // Update in collections array
        if (Array.isArray(this.collections)) {
          const index = this.collections.findIndex(
            (collection) => String(collection.id) === String(id),
          );
          if (index !== -1) {
            this.collections[index] = {
              ...this.collections[index],
              name: payload.name,
              title: payload.name,
              description: payload.description,
              updatedAt: new Date(),
            };
          }
        }

        // Update current collection if it matches
        if (
          this.currentCollection &&
          String(this.currentCollection.id) === String(id)
        ) {
          this.currentCollection = {
            ...this.currentCollection,
            name: payload.name,
            title: payload.name,
            description: payload.description,
            updatedAt: new Date(),
          };
        }

        return true;
      } catch (error) {
        console.error("Error updating collection:", error);
        throw error;
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
            (collection) => String(collection.id) === String(collectionId),
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
        photoIds.includes(p.id),
      );

      return {
        ...collection,
        photos: fullPhotos,
      };
    },

    // Build breadcrumb trail for a set
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

    // Utility method for date formatting (can be moved to utils later)
    formatDate(date) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24)),
        "day",
      );
    },
  },
});
