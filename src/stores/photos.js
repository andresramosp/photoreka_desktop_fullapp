// stores/photos.js

// Umbral mínimo de fotos requeridas para desbloquear funcionalidades
export const MIN_PHOTOS_THRESHOLD = 50;

// Modo de onboarding: si true, el umbral actúa como recomendación en vez de requisito estricto
// false = modo estricto (requiere 50 fotos procesadas para desbloquear herramientas)
// true = modo suave (herramientas siempre disponibles, 50 fotos es solo una recomendación)
export const ONBOARDING_SOFT = true;

import { defineStore } from "pinia";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore.ts";

export const usePhotosStore = defineStore("photos", {
  // Exponer el umbral como propiedad estática
  state: () => ({
    photos: null,
    isLoading: false,
    isInitialized: false, // Indica si la carga inicial del catálogo está completa
    selectedPhotosRecord: {},
    showUploadProgress: false, // Controla si se muestra el progreso de subida especial
    duplicatesChecked: false, // Indica si ya se han verificado duplicados
  }),

  getters: {
    // Getter para selección global - solo para PhotoHub (PhotosCatalog y PhotosUpload)

    selectedPhotoIds: (state) =>
      Object.keys(state.selectedPhotosRecord)
        .filter((photoId) => !!state.selectedPhotosRecord[photoId])
        .map(Number),

    lightboxPhotos: (state) =>
      Array.isArray(state.photos)
        ? state.photos.filter(
            (p) =>
              p.status == "uploaded" ||
              p.status == "preprocessing" ||
              p.status == "preprocessed"
          )
        : [],

    workspacePhotos: (state) =>
      Array.isArray(state.photos)
        ? state.photos.filter(
            (p) => p.status == "processing" || p.status == "processed"
          )
        : [],

    uploadedPhotos: (state) =>
      Array.isArray(state.photos)
        ? state.photos.filter((p) => p.status == "uploaded")
        : [],

    preProcessingPhotos: (state) =>
      Array.isArray(state.photos)
        ? state.photos.filter((p) => p.status == "preprocessing")
        : [],

    preprocessedPhotos: (state) =>
      Array.isArray(state.photos)
        ? state.photos.filter((p) => p.status == "preprocessed")
        : [],

    processingPhotos: (state) =>
      Array.isArray(state.photos)
        ? state.photos.filter((p) => p.status == "processing")
        : [],

    processedPhotos: (state) =>
      Array.isArray(state.photos)
        ? state.photos.filter((p) => p.status == "processed")
        : [],

    // Todas las fotos que son preprocesadas o procesadas
    allPhotos: (state) => (Array.isArray(state.photos) ? state.photos : []),

    appAccessMode: (state) => {
      const processedCount = state.photos?.filter(
        (photo) => photo.status === "processed"
      ).length;

      // En modo soft, desbloquear con al menos 1 foto procesada
      if (ONBOARDING_SOFT) {
        return processedCount >= 1 ? "full" : "blocked";
      }

      // Modo estricto: App is unlocked when user has MIN_PHOTOS_THRESHOLD+ processed photos
      if (processedCount >= MIN_PHOTOS_THRESHOLD) {
        return "full";
      }

      // Otherwise blocked (eliminates partial state)
      return "blocked";
    },

    // New getter: determines if process button should be enabled/disabled
    processButtonState: (state) => {
      const processedCount = state.photos?.filter(
        (photo) => photo.status === "processed"
      ).length;
      const uploadedOrPreprocessedCount = state.photos?.filter(
        (photo) =>
          photo.status === "preprocessed" || photo.status === "uploaded"
      ).length;
      const processingCount = state.photos?.filter(
        (photo) => photo.status === "processing"
      ).length;
      const checkingDuplicatesCount = state.photos?.filter(
        (photo) => photo.isCheckingDuplicates
      ).length;

      // If there are photos currently processing, show processing state
      if (processingCount > 0) {
        return "processing";
      }

      // If there are photos currently checking duplicates, show disabled state
      if (checkingDuplicatesCount > 0) {
        return "processing";
      }

      // En modo soft, habilitar el botón si hay al menos 1 foto subida/preprocesada
      if (ONBOARDING_SOFT) {
        // Si ya hay fotos procesadas, siempre habilitado
        if (processedCount >= 1) {
          return "enabled";
        }
        // Si hay al menos 1 foto lista para procesar, habilitar
        if (uploadedOrPreprocessedCount >= 1) {
          return "enabled";
        }
        return "disabled";
      }

      // Modo estricto: If app is already unlocked (≥MIN_PHOTOS_THRESHOLD processed photos), always enabled
      if (processedCount >= MIN_PHOTOS_THRESHOLD) {
        return "enabled";
      }

      // If app is still locked, need threshold preprocessed photos to enable button
      if (uploadedOrPreprocessedCount >= MIN_PHOTOS_THRESHOLD) {
        return "enabled";
      }

      return "disabled";
    },

    // New getter: progress toward unlocking process button (0-100%)
    processButtonProgress: (state) => {
      const processedCount = state.photos?.filter(
        (photo) => photo.status === "processed"
      ).length;
      const uploadedOrPreprocessedCount = state.photos?.filter(
        (photo) =>
          photo.status === "preprocessed" || photo.status === "uploaded"
      ).length;

      // En modo soft, no hay requisito de umbral, por lo que no mostramos progreso
      // Retornamos 100% para que no se muestre la barra de progreso
      if (ONBOARDING_SOFT) {
        return 100;
      }

      // Modo estricto: If app is already unlocked, always 100% progress
      if (processedCount >= MIN_PHOTOS_THRESHOLD) {
        return 100;
      }

      // Calculate progress based on preprocessed + processed photos toward threshold
      const totalProgressPhotos = uploadedOrPreprocessedCount + processedCount;

      return Math.min((totalProgressPhotos / MIN_PHOTOS_THRESHOLD) * 100, 100);
    },
  },

  actions: {
    // Resetear el store completamente (para cambios de usuario)
    resetStore() {
      this.photos = null;
      this.isLoading = false;
      this.isInitialized = false;
      this.selectedPhotosRecord = {};
      this.showUploadProgress = false;
      this.duplicatesChecked = false;
    },

    async getOrFetch(force) {
      if (force || (this.photos?.length === 0 && !this.isLoading)) {
        this.isLoading = true;
        try {
          const response = await api.get(`/api/catalog`);

          const photos = response.data.photos.map((photo) => ({
            ...photo,
            isDuplicate: false,
          }));

          this.photos = photos.map((photo) => ({ ...photo }));
          // Reset duplicates check when photos are loaded/reloaded
          this.duplicatesChecked = false;
        } catch (error) {
          console.warn("API not available, using mock data:", error.message);
        } finally {
          this.isLoading = false;
          this.isInitialized = true; // Marcar como inicializado después de la primera carga
        }
      }
      return this.photos;
    },

    addPhotos(newPhotos) {
      const newPhotoIds = newPhotos.map((p) => p.id);
      this.photos = [
        ...this.photos.filter((p) => !newPhotoIds.includes(p.id)),
        ...newPhotos.map((photo) => ({ ...photo })),
      ];
      // Reset duplicates check when new photos are added
      this.duplicatesChecked = false;
    },

    updatePhoto(photoId, delta) {
      const photo = this.photos.find((p) => p.id === photoId);
      if (photo) {
        Object.assign(photo, delta);
      }
    },

    async fetchPhoto(photoId) {
      try {
        const { data: photo } = await api.get(`/api/catalog/${photoId}`);
        const updatedPhoto = photo;
        const index = this.photos.findIndex((p) => p.id == photoId);
        if (index !== -1) {
          this.photos[index] = { ...this.photos[index], ...updatedPhoto };
        } else {
          this.photos.push(updatedPhoto);
        }
        return updatedPhoto;
      } catch (error) {
        console.warn("API not available for fetchPhoto:", error.message);
        // Mock behavior - just return existing photo
      }
    },

    async deletePhotos(photoIds) {
      try {
        await api.post(`/api/catalog/delete`, { ids: photoIds });
        photoIds.forEach((id) => {
          delete this.selectedPhotosRecord[id];
        });
        this.photos = this.photos.filter(
          (photo) => !photoIds.includes(photo.id)
        );
        // Reset duplicates check when photos are deleted
        this.duplicatesChecked = false;

        // Update usage after deleting photos
        const userStore = useUserStore();
        await userStore.fetchUsage();
      } catch (error) {
        console.warn(
          "API not available for deletePhotos, using local delete:",
          error.message
        );
      }
    },

    async deleteDuplicates(photosIds) {
      try {
        const res = await api.post(`/api/catalog/deleteDuplicates`, {
          duplicates: photosIds,
        });

        const { deleted } = res.data;

        // Elimina las fotos borradas del store
        this.photos = this.photos.filter((p) => !deleted.includes(p.id));

        // Update usage after deleting duplicates
        const userStore = useUserStore();
        await userStore.fetchUsage();
      } catch (error) {
        console.warn(
          "API not available for deleteDuplicates, using local delete:",
          error.message
        );
        // Fallback: delete locally
        this.photos = this.photos.filter((p) => !photosIds.includes(p.id));
      }
    },

    async checkDuplicates(photoIds = null) {
      // Si ya se verificaron duplicados y no hay IDs específicos, no hacer nada
      if (this.duplicatesChecked && !photoIds) {
        return {};
      }

      try {
        const payload = photoIds ? { newPhotoIds: photoIds } : {};
        const res = await api.post("/api/catalog/checkDuplicates", payload);
        const duplicatesMap = res.data;

        for (const photo of this.photos) {
          if (!photoIds || photoIds.includes(photo.id)) {
            const duplicates = duplicatesMap[photo.id] || [];
            this.updatePhoto(photo.id, {
              duplicates,
              isDuplicate: duplicates.length > 0,
            });
          }
        }

        // Marcar como verificado solo si se hizo verificación completa
        if (!photoIds) {
          this.duplicatesChecked = true;
        }

        return duplicatesMap;
      } catch (error) {
        console.warn("API not available for checkDuplicates:", error.message);
        // Return empty duplicates map as fallback
        return {};
      }
    },

    // Acciones de selección global - solo para PhotoHub (PhotosCatalog y PhotosUpload)
    togglePhotoSelection(photoId) {
      this.selectedPhotosRecord[photoId] = !this.selectedPhotosRecord[photoId];
    },

    selectAllPhotos(photoIds) {
      photoIds.forEach((photoId) => {
        this.selectedPhotosRecord[photoId] = true;
      });
    },

    deselectAllPhotos(photoIds) {
      photoIds.forEach((photoId) => {
        this.selectedPhotosRecord[photoId] = false;
      });
    },

    clearAllSelections() {
      this.selectedPhotosRecord = {};
    },
  },
});
