// composables/usePhotoDownload.js
import { ref } from "vue";
import { api } from "@/utils/axios.js";
import { useMessage } from "naive-ui";

export function usePhotoDownload() {
  const message = useMessage();
  const isDownloading = ref(false);
  const downloadProgress = ref(0);

  // Download a single photo (now uses POST with 'urls' array in body)
  const downloadPhoto = async (photo) => {
    if (!photo) return;

    const id = photo.id;
    const filename =
      photo.filename || photo.name || `photo-${photo.id || Date.now()}.jpg`;

    isDownloading.value = true;
    try {
      const apiUrl = `/download-photo`;
      const response = await api.post(
        apiUrl,
        { ids: [id] },
        { responseType: "blob" }
      );
      const blob = response.data;

      // Create a temporary link to download the file
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = photo.originalFileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      message.success("Download completed");
    } catch (error) {
      message.error("Failed to download photo");
      console.error("Download photo failed:", error);
      throw error;
    } finally {
      isDownloading.value = false;
    }
  };

  // Download multiple photos as a zip
  const downloadPhotosZip = async (photos) => {
    if (!photos || photos.length === 0) return;
    isDownloading.value = true;
    try {
      const ids = photos.map((photo) => photo.id).filter(Boolean);
      if (ids.length === 0) throw new Error("No valid photo URLs");
      const apiUrl = `/download-photo`;
      const response = await api.post(
        apiUrl,
        { ids },
        { responseType: "blob" }
      );
      const blob = response.data;
      // Create a temporary link to download the zip file
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `photos-${Date.now()}.zip`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      message.success("Download ZIP completed");
    } catch (error) {
      message.error("Failed to download ZIP");
      console.error("Download ZIP failed:", error);
    } finally {
      isDownloading.value = false;
    }
  };

  return {
    downloadPhoto,
    downloadPhotosZip,
    isDownloading,
  };
}
