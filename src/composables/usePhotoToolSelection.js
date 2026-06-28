import { ref } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import { useCanvasStore } from "@/stores/canvas.js";
import { usePhotosStore } from "@/stores/photos.js";

export function usePhotoToolSelection() {
  const router = useRouter();
  const message = useMessage();
  const canvasStore = useCanvasStore();
  const photosStore = usePhotosStore();

  const isProcessing = ref(false);
  const showToolSelector = ref(false);

  /**
   * Takes selected photos to Canvas
   * @param {Array} photoIds - Array of photo IDs to add to canvas
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeToCanvas = async (photoIds, clearSelections, canvasId = null) => {
    try {
      isProcessing.value = true;

      // Fetch all photos if needed
      await Promise.all(photoIds.map((id) => photosStore.fetchPhoto(id)));

      // Get the photo objects
      const photosToAdd = photoIds
        .map((id) => photosStore.photos.find((p) => p.id == id))
        .filter(Boolean);

      if (photosToAdd.length === 0) {
        message.error("No photos found to add to canvas");
        return;
      }

      // Clear selections before navigating
      clearSelections();

      // Queue photos and target canvas for canvas view to process on mount/activation
      canvasStore.pendingPhotosToAdd = [...photosToAdd];
      canvasStore.pendingCanvasId = canvasId;

      // Navigate to canvas
      await router.push("/canvas");

      message.success(
        `Added ${photosToAdd.length} photo${
          photosToAdd.length > 1 ? "s" : ""
        } to Canvas`,
      );
    } catch (error) {
      console.error("Error taking photos to canvas:", error);
      message.error("Failed to add photos to Canvas");
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Takes selected photos to Framer
   * @param {Array} photoIds - Array of photo IDs to add to framer
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeToFramer = async (photoIds, clearSelections) => {
    try {
      isProcessing.value = true;

      // Fetch all photos if needed
      await Promise.all(photoIds.map((id) => photosStore.fetchPhoto(id)));

      // Get the photo objects
      const photosToAdd = photoIds
        .map((id) => photosStore.photos.find((p) => p.id == id))
        .filter(Boolean);

      if (photosToAdd.length === 0) {
        message.error("No photos found to add to framer");
        return;
      }

      // Store photos in sessionStorage to be picked up by FramerView
      const photosData = photosToAdd.map((photo) => ({
        id: photo.id,
        thumbnailUrl: photo.thumbnailUrl,
        name: photo.name,
        dimensions: photo.dimensions,
        tags: photo.tags || [],
        detectionAreas: photo.detectionAreas || [],
        // For framer, we need the photo object itself for processing
        photoObject: photo,
      }));

      sessionStorage.setItem(
        "framer_photos_to_add",
        JSON.stringify(photosData),
      );

      console.log(
        `📦 Stored ${photosData.length} photos in sessionStorage for Framer`,
      );

      // Clear selections before navigating
      clearSelections();

      // Navigate to framer
      await router.push("/framer");
    } catch (error) {
      console.error("Error taking photos to framer:", error);
      message.error("Failed to add photos to Framer");
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Takes a photo to the 2D Atlas and flies to it
   * @param {Array} photoIds - Array with single photo ID to visit
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeTo2D = async (photoIds, clearSelections) => {
    try {
      isProcessing.value = true;

      if (!photoIds || photoIds.length === 0) {
        message.error("No photo selected for 2D navigation");
        return;
      }

      if (photoIds.length > 1) {
        message.error("Please select only one photo for 2D view");
        return;
      }

      const photoId = photoIds[0];

      // Fetch photo to ensure it exists
      await photosStore.fetchPhoto(photoId);

      const photo = photosStore.photos.find((p) => p.id == photoId);

      if (!photo) {
        message.error("Photo not found");
        return;
      }

      // Clear selections before navigating
      clearSelections();

      // Navigate to 2D Atlas first
      await router.push("/2d-atlas");

      // Dispatch custom event with photo ID for camera flight
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("2d:flyToPhoto", {
            detail: { photoId: photoId },
          }),
        );
        console.log("🚀 Flying to photo in 2D:", photoId);
      }, 100);

      // message.info("Navigating to photo in 2D space...");
    } catch (error) {
      console.error("Error taking photo to 2D Atlas:", error);
      message.error("Failed to navigate to 2D Atlas");
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Takes photos to the 3D Atlas and flies to them sequentially
   * @param {Array} photoIds - Array of photo IDs to visit in sequence
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeToAtlas = async (photoIds, clearSelections) => {
    try {
      isProcessing.value = true;

      if (!photoIds || photoIds.length === 0) {
        message.error("No photos selected for 3D navigation");
        return;
      }

      // Fetch all photos to ensure they exist
      await Promise.all(photoIds.map((id) => photosStore.fetchPhoto(id)));

      const photos = photoIds
        .map((id) => photosStore.photos.find((p) => p.id == id))
        .filter(Boolean);

      if (photos.length === 0) {
        message.error("No valid photos found");
        return;
      }

      // Clear selections before navigating
      clearSelections();

      // Navigate to 3D Atlas first
      await router.push("/3d-atlas");

      // Dispatch custom event with photo IDs for sequential tour
      // Single photo = immediate flight, multiple = sequential tour
      setTimeout(() => {
        if (photoIds.length === 1) {
          window.dispatchEvent(
            new CustomEvent("atlas:flyToPhoto", {
              detail: { photoId: photoIds[0] },
            }),
          );
          console.log("🚀 Flying to single photo:", photoIds[0]);
        } else {
          window.dispatchEvent(
            new CustomEvent("atlas:startPhotoTour", {
              detail: { photoIds: photoIds },
            }),
          );
          console.log("🎬 Starting photo tour:", photoIds);
        }
      }, 100);

      const photoText =
        photoIds.length === 1 ? "photo" : `${photoIds.length} photos`;
      // message.info(`Navigating to ${photoText} in 3D space...`);
    } catch (error) {
      console.error("Error taking photos to 3D Atlas:", error);
      message.error("Failed to navigate to 3D Atlas");
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Takes selected photos to Chat (attaches them as context)
   * @param {Array} photoIds - Array of photo IDs to attach
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeToChat = async (photoIds, clearSelections) => {
    try {
      isProcessing.value = true;

      if (!photoIds || photoIds.length === 0) {
        message.warning("Please select at least one photo");
        return;
      }

      if (photoIds.length > 5) {
        message.warning("Only the first 5 photos will be sent to ChatLab");
      }

      // Build minimal photo payloads now, while the store is populated
      await Promise.all(
        photoIds.slice(0, 5).map((id) => photosStore.fetchPhoto(id)),
      );

      const photosData = photoIds
        .slice(0, 5)
        .map((id) =>
          photosStore.photos.find((p) => String(p.id) === String(id)),
        )
        .filter(Boolean)
        .map((photo) => ({
          id: String(photo.id),
          title: photo.title || photo.name || "Photo",
          name: photo.name || photo.title || "Photo",
          url: photo.url,
          thumbnailUrl: photo.thumbnailUrl || photo.url,
          rating: photo.rating ?? 0,
          isUploading: false,
          file: null,
          needProcess: false,
          isDuplicate: false,
          originalFileName:
            photo.originalFileName || photo.name || photo.title || "photo",
          isCheckingDuplicates: false,
          status: "processed",
        }));

      if (photosData.length === 0) {
        message.error("Could not find selected photos");
        return;
      }

      // Store full photo data so ChatView doesn't need the store to be loaded
      sessionStorage.setItem("chat_context_photos", JSON.stringify(photosData));

      // Clear selections before navigating
      clearSelections();

      // Navigate to chat
      await router.push("/chat-lab");
    } catch (error) {
      console.error("Error taking photos to Chat:", error);
      message.error("Failed to navigate to Chat");
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * Takes photos to a specific tool
   * @param {string} toolId - The tool to take photos to ('canvas', 'framer', or '3d-atlas')
   * @param {Array} photoIds - Array of photo IDs
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeToTool = async (
    toolId,
    photoIds,
    clearSelections,
    canvasId = null,
  ) => {
    if (photoIds.length === 0) {
      message.warning("Please select at least one photo");
      return;
    }

    switch (toolId) {
      case "canvas":
        await takeToCanvas(photoIds, clearSelections, canvasId);
        break;
      case "framer":
        await takeToFramer(photoIds, clearSelections);
        break;
      case "2d-atlas":
        await takeTo2D(photoIds, clearSelections);
        break;
      case "3d-atlas":
        await takeToAtlas(photoIds, clearSelections);
        break;
      default:
        message.error(`Unknown tool: ${toolId}`);
    }
  };

  /**
   * Opens the tool selector modal
   */
  const openToolSelector = () => {
    showToolSelector.value = true;
  };

  /**
   * Closes the tool selector modal
   */
  const closeToolSelector = () => {
    showToolSelector.value = false;
  };

  return {
    // State
    isProcessing,
    showToolSelector,

    // Methods
    takeToCanvas,
    takeToFramer,
    takeTo2D,
    takeToAtlas,
    takeToTool,
    takeToChat,
    openToolSelector,
    closeToolSelector,
  };
}
