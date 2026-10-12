import { ref } from "vue";
import { useMessage } from "naive-ui";
import { api } from "@/utils/axios.js";
import JSZip from "jszip";

export function useFramedPhotoDownload() {
  const message = useMessage();
  const isDownloading = ref(false);

  // Create a framed photo canvas with improved margin calculation
  const createFramedPhotoCanvas = async (
    imageBlob,
    frameConfig,
    realMargins = null,
  ) => {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          // Parse aspect ratio
          const [widthRatio, heightRatio] = frameConfig.aspectRatio
            .split("/")
            .map(Number);
          const aspectRatio = widthRatio / heightRatio;

          // Calculate dimensions - use high resolution for better quality
          // Use higher base resolution on mobile to match DOM capture quality
          const isMobile = window.innerWidth <= 768;
          const baseWidth = isMobile ? 2400 : 1200; // Double resolution for mobile
          let canvasWidth, canvasHeight;

          if (aspectRatio >= 1) {
            // Landscape or square
            canvasWidth = baseWidth;
            canvasHeight = baseWidth / aspectRatio;
          } else {
            // Portrait
            canvasHeight = baseWidth;
            canvasWidth = baseWidth * aspectRatio;
          }

          canvas.width = canvasWidth;
          canvas.height = canvasHeight;

          console.log(
            `Creating framed canvas: ${canvasWidth}x${canvasHeight} (mobile: ${isMobile}, baseWidth: ${baseWidth})`,
          );

          // Fill frame background
          ctx.fillStyle = frameConfig.frameColor || "#ffffff";
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);

          // Use real margins if provided, otherwise fallback to config margin
          let marginPx;
          if (realMargins) {
            // Use proportional margins based on real DOM measurements
            const avgRealMargin =
              (realMargins.top +
                realMargins.left +
                realMargins.right +
                realMargins.bottom) /
              4;
            // Scale the margin proportionally to the high-res canvas
            const scaleFactorWidth = canvasWidth / realMargins.containerWidth;
            const scaleFactorHeight =
              canvasHeight / realMargins.containerHeight;
            const avgScaleFactor = (scaleFactorWidth + scaleFactorHeight) / 2;
            marginPx = avgRealMargin * avgScaleFactor;
          } else {
            // Fallback to original method
            marginPx = frameConfig.margin || 20;
          }

          // Calculate photo area (with margin)
          const photoX = marginPx;
          const photoY = marginPx;
          const photoWidth = canvasWidth - marginPx * 2;
          const photoHeight = canvasHeight - marginPx * 2;

          // Calculate how to fit the image in the photo area
          const imgAspectRatio = img.width / img.height;
          const photoAspectRatio = photoWidth / photoHeight;

          let drawWidth, drawHeight, drawX, drawY;

          if (imgAspectRatio > photoAspectRatio) {
            // Image is wider than photo area - fit by width
            drawWidth = photoWidth;
            drawHeight = photoWidth / imgAspectRatio;
            drawX = photoX;
            drawY = photoY + (photoHeight - drawHeight) / 2;
          } else {
            // Image is taller than photo area - fit by height
            drawHeight = photoHeight;
            drawWidth = photoHeight * imgAspectRatio;
            drawX = photoX + (photoWidth - drawWidth) / 2;
            drawY = photoY;
          }

          // Draw the image
          ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

          // Clean up the blob URL
          URL.revokeObjectURL(img.src);

          resolve(canvas);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };

      // Create object URL from blob
      const imageUrl = URL.createObjectURL(imageBlob);
      img.src = imageUrl;
    });
  };

  // Extract real margins from FrameVisualizer DOM
  const extractRealMargins = (frameVisualizerRef) => {
    if (!frameVisualizerRef) return null;

    try {
      const frameElement = frameVisualizerRef.$el || frameVisualizerRef;
      const frameContainer = frameElement.querySelector(".frame-container");

      if (!frameContainer) return null;

      const containerRect = frameContainer.getBoundingClientRect();
      const containerStyles = window.getComputedStyle(frameContainer);

      return {
        top: parseFloat(containerStyles.paddingTop) || 0,
        left: parseFloat(containerStyles.paddingLeft) || 0,
        right: parseFloat(containerStyles.paddingRight) || 0,
        bottom: parseFloat(containerStyles.paddingBottom) || 0,
        containerWidth: containerRect.width,
        containerHeight: containerRect.height,
      };
    } catch (error) {
      console.warn("Could not extract real margins:", error);
      return null;
    }
  };

  // NEW: Recreate the exact FrameVisualizer composition manually
  const captureFramedPhotoFromDOM = async (
    frameVisualizerRef,
    scaleFactor = 3,
  ) => {
    if (!frameVisualizerRef) {
      throw new Error("FrameVisualizer reference not provided");
    }

    // Get the frame container element
    const frameElement = frameVisualizerRef.$el || frameVisualizerRef;
    const frameContainer = frameElement.querySelector(".frame-container");

    if (!frameContainer) {
      throw new Error("Frame container not found in DOM");
    }

    const img = frameContainer.querySelector(".photo-image");
    if (!img || !img.complete) {
      throw new Error("Image not loaded or not found");
    }

    try {
      // Get the exact visual dimensions and styles from the DOM
      const containerRect = frameContainer.getBoundingClientRect();
      const containerStyles = window.getComputedStyle(frameContainer);

      // Get margin from padding (this is the frame margin)
      const paddingTop = parseFloat(containerStyles.paddingTop) || 0;
      const paddingLeft = parseFloat(containerStyles.paddingLeft) || 0;
      const paddingRight = parseFloat(containerStyles.paddingRight) || 0;
      const paddingBottom = parseFloat(containerStyles.paddingBottom) || 0;

      // Create high-resolution canvas
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Scale up for high quality
      canvas.width = containerRect.width * scaleFactor;
      canvas.height = containerRect.height * scaleFactor;
      ctx.scale(scaleFactor, scaleFactor);

      // Fill frame background
      const backgroundColor = containerStyles.backgroundColor || "#ffffff";
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, containerRect.width, containerRect.height);

      // Calculate the photo area (same as CSS .photo-container)
      const photoAreaX = paddingLeft;
      const photoAreaY = paddingTop;
      const photoAreaWidth = containerRect.width - paddingLeft - paddingRight;
      const photoAreaHeight = containerRect.height - paddingTop - paddingBottom;

      // Get image natural dimensions
      const imgNaturalWidth = img.naturalWidth;
      const imgNaturalHeight = img.naturalHeight;
      const imgAspectRatio = imgNaturalWidth / imgNaturalHeight;
      const photoAreaAspectRatio = photoAreaWidth / photoAreaHeight;

      // Calculate how the image fits within the photo area (object-fit: contain logic)
      let drawWidth, drawHeight, drawX, drawY;

      if (imgAspectRatio > photoAreaAspectRatio) {
        // Image is wider than photo area - fit by width
        drawWidth = photoAreaWidth;
        drawHeight = photoAreaWidth / imgAspectRatio;
        drawX = photoAreaX;
        drawY = photoAreaY + (photoAreaHeight - drawHeight) / 2;
      } else {
        // Image is taller than photo area - fit by height
        drawHeight = photoAreaHeight;
        drawWidth = photoAreaHeight * imgAspectRatio;
        drawX = photoAreaX + (photoAreaWidth - drawWidth) / 2;
        drawY = photoAreaY;
      }

      // Draw the image with exact same positioning logic as CSS
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

      return canvas;
    } catch (error) {
      console.error("Error capturing frame with manual DOM method:", error);
      throw error;
    }
  };

  // Download single framed photo
  const downloadFramedPhoto = async (
    photo,
    frameConfig,
    isPlayground = false,
    frameVisualizerRef = null,
  ) => {
    if (!photo || !frameConfig) return;

    isDownloading.value = true;

    try {
      let canvas;

      // Use DOM capture if frameVisualizerRef is provided (preferred method)
      if (frameVisualizerRef) {
        try {
          console.log("Attempting DOM capture with manual recreation...");
          // Use higher scale factor on mobile to compensate for smaller preview
          const isMobile = window.innerWidth <= 768;
          const scaleFactor = isMobile ? 8 : 3; // Higher scaling for mobile
          canvas = await captureFramedPhotoFromDOM(
            frameVisualizerRef,
            scaleFactor,
          );
          console.log(
            "DOM capture successful:",
            canvas.width,
            "x",
            canvas.height,
            `(mobile: ${isMobile}, scale: ${scaleFactor})`,
          );
        } catch (domError) {
          console.warn(
            "DOM capture failed, falling back to original method:",
            domError,
          );
          // Fall back to original method if DOM capture fails
          frameVisualizerRef = null;
        }
      }

      if (!canvas) {
        // Fallback to original method for backward compatibility
        console.log("Using original download method...");
        let originalImageBlob;

        if (isPlayground) {
          // In playground mode, use the local file blob directly
          originalImageBlob = photo.file; // This is the resized blob from PlaygroundPhotosDialog
        } else {
          // In authenticated mode, download from API
          const apiUrl = `/download-photo`;
          const response = await api.post(
            apiUrl,
            { ids: [photo.id] },
            { responseType: "blob" },
          );
          originalImageBlob = response.data;
        }

        // Create framed version using improved method
        const realMargins = extractRealMargins(frameVisualizerRef);
        canvas = await createFramedPhotoCanvas(
          originalImageBlob,
          frameConfig,
          realMargins,
        );
      }

      // Convert canvas to blob
      const framedBlob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.9);
      });

      // Create download link for framed photo
      const blobUrl = URL.createObjectURL(framedBlob);
      const link = document.createElement("a");
      link.href = blobUrl;

      // Generate filename
      const originalName = isPlayground
        ? photo.name || `photo-${photo.id}`
        : photo.originalFileName || photo.file_name || `photo-${photo.id}`;
      const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
      const frameRatio =
        frameConfig.ratio || frameConfig.aspectRatio.replace("/", "-");
      link.download = `${nameWithoutExt}_framed_${frameRatio}.jpg`;

      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      message.success("Framed photo downloaded successfully");
    } catch (error) {
      console.error("Error downloading framed photo:", error);
      message.error("Failed to download framed photo");
    } finally {
      isDownloading.value = false;
    }
  };

  // Download multiple framed photos as ZIP
  const downloadFramedPhotosZip = async (
    photos,
    frameConfig,
    isPlayground = false,
    frameVisualizerRef = null,
  ) => {
    if (!photos || photos.length === 0 || !frameConfig) return;

    isDownloading.value = true;

    try {
      const zip = new JSZip();

      // Extract real margins from DOM if frameVisualizerRef is available
      const realMargins = extractRealMargins(frameVisualizerRef);
      if (realMargins) {
        console.log("Using real margins for ZIP:", realMargins);
      } else {
        console.log("Using fallback margins for ZIP");
      }

      // Process photos in batches to avoid overwhelming the API (or process all at once in playground)
      const batchSize = isPlayground ? photos.length : 5; // No need to batch local files
      for (let i = 0; i < photos.length; i += batchSize) {
        const batch = photos.slice(i, i + batchSize);
        const batchPromises = [];

        for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
          const photo = batch[batchIdx];
          const globalIndex = i + batchIdx;
          const promise = (async () => {
            try {
              let canvas;

              // For ZIP downloads, always use createFramedPhotoCanvas to process each individual photo
              // DOM capture only works for the currently visible photo in the preview
              console.log(
                `Processing photo for ZIP: ${photo.name || photo.id}`,
              );

              let originalImageBlob;

              if (isPlayground) {
                // In playground mode, use the local file blob directly
                originalImageBlob = photo.file; // This is the resized blob from PlaygroundPhotosDialog
              } else {
                // In authenticated mode, download from API
                const apiUrl = `/download-photo`;
                const response = await api.post(
                  apiUrl,
                  { ids: [photo.id] },
                  { responseType: "blob" },
                );
                originalImageBlob = response.data;
              }

              // Create framed version using improved method with real margins
              // This will use the higher resolution we set for mobile devices
              canvas = await createFramedPhotoCanvas(
                originalImageBlob,
                frameConfig,
                realMargins, // Pass the real margins
              );

              // Convert to blob
              const framedBlob = await new Promise((resolve) => {
                canvas.toBlob(resolve, "image/jpeg", 0.9);
              });

              // Add to ZIP
              const originalName = isPlayground
                ? photo.name || `photo-${photo.id}`
                : photo.originalFileName ||
                  photo.file_name ||
                  `photo-${photo.id}`;
              const nameWithoutExt = originalName.replace(/\.[^/.]+$/, "");
              const frameRatio =
                frameConfig.ratio || frameConfig.aspectRatio.replace("/", "-");
              // Reemplaza caracteres inválidos para Windows
              const safeFrameRatio = String(frameRatio).replace(
                /[:*?"<>|]/g,
                "-",
              );
              // Add numeric prefix to preserve order in the zip
              const orderPrefix = String(globalIndex + 1).padStart(2, "0");
              const filename = `${orderPrefix}_${nameWithoutExt}_framed_${safeFrameRatio}.jpg`;

              zip.file(filename, framedBlob);
            } catch (error) {
              console.error(`Error processing photo ${photo.id}:`, error);
              // Continue with other photos even if one fails
            }
          })();

          batchPromises.push(promise);
        }

        // Wait for current batch to complete
        await Promise.all(batchPromises);
      }

      // Generate ZIP
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Download ZIP
      const blobUrl = URL.createObjectURL(zipBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `framed_photos_${
        frameConfig.ratio || "custom"
      }_${Date.now()}.zip`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      message.success(`Successfully downloaded ${photos.length} framed photos`);
    } catch (error) {
      console.error("Error downloading framed photos ZIP:", error);
      message.error("Failed to download framed photos ZIP");
    } finally {
      isDownloading.value = false;
    }
  };

  return {
    downloadFramedPhoto,
    downloadFramedPhotosZip,
    isDownloading,
  };
}
