import { ref } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import { useCanvasStore } from "@/stores/canvas.js";
import { usePhotosStore } from "@/stores/photos.js";

export function usePhotoToolSelection(customTools = null) {
  const router = useRouter();
  const message = useMessage();
  const canvasStore = useCanvasStore();
  const photosStore = usePhotosStore();

  const isProcessing = ref(false);
  const showToolSelector = ref(false);

  // Default available tools for photo selection
  const defaultTools = [
    {
      id: "canvas",
      name: "Canvas",
      description: "Create layouts and arrange photos",
      icon: "Workspace",
      route: "/canvas",
    },
    {
      id: "framer",
      name: "Framer",
      description: "Add frames and borders to photos",
      icon: "ImageFrame",
      route: "/framer",
    },
  ];

  // Use custom tools if provided, otherwise use default tools
  const availableTools = customTools || defaultTools;

  /**
   * Takes selected photos to Canvas
   * @param {Array} photoIds - Array of photo IDs to add to canvas
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeToCanvas = async (photoIds, clearSelections) => {
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

      // Add photos to canvas store
      canvasStore.addPhotos(photosToAdd, false, true);

      // Navigate to canvas
      await router.push("/canvas");

      message.success(
        `Added ${photosToAdd.length} photo${
          photosToAdd.length > 1 ? "s" : ""
        } to Canvas`
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

      // Clear selections before navigating
      clearSelections();

      // Store photos in sessionStorage to be picked up by FramerView
      // This is a temporary solution until we have a proper framer store
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
        JSON.stringify(photosData)
      );

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
   * Takes photos to a specific tool
   * @param {string} toolId - The tool to take photos to ('canvas' or 'framer')
   * @param {Array} photoIds - Array of photo IDs
   * @param {Function} clearSelections - Function to clear current selections
   */
  const takeToTool = async (toolId, photoIds, clearSelections) => {
    if (photoIds.length === 0) {
      message.warning("Please select at least one photo");
      return;
    }

    switch (toolId) {
      case "canvas":
        await takeToCanvas(photoIds, clearSelections);
        break;
      case "framer":
        await takeToFramer(photoIds, clearSelections);
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
    availableTools,

    // Methods
    takeToCanvas,
    takeToFramer,
    takeToTool,
    openToolSelector,
    closeToolSelector,
  };
}
