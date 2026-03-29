import { ref, computed } from "vue";

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || "";

// 5MB size limit per file (matching existing app constraint)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Composable for importing photos from Dropbox using the Chooser drop-in.
 * Much simpler than Google Photos: no OAuth management, no polling, no sessions.
 * The Chooser handles auth internally.
 */
export function useDropbox() {
  const isInitialized = ref(false);
  const isLoading = ref(false);
  const isDownloading = ref(false);
  const error = ref(null);
  const selectedFiles = ref([]);
  const downloadedCount = ref(0);
  const totalToDownload = ref(0);

  /**
   * Loads the Dropbox Dropins script if not already present.
   */
  function loadDropinsScript() {
    return new Promise((resolve, reject) => {
      if (window.Dropbox && typeof window.Dropbox.choose === "function") {
        resolve();
        return;
      }

      const existing = document.getElementById("dropboxjs");
      if (existing) {
        // Script tag exists but Dropbox not ready yet — wait for it
        const maxAttempts = 50;
        let attempts = 0;
        const check = () => {
          attempts++;
          if (window.Dropbox && typeof window.Dropbox.choose === "function") {
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error("Dropbox SDK did not load in time"));
          } else {
            setTimeout(check, 100);
          }
        };
        check();
        return;
      }

      const script = document.createElement("script");
      script.type = "text/javascript";
      script.src = "https://www.dropbox.com/static/api/2/dropins.js";
      script.id = "dropboxjs";
      script.setAttribute("data-app-key", DROPBOX_APP_KEY);
      script.async = true;

      script.onload = () => {
        const maxAttempts = 50;
        let attempts = 0;
        const check = () => {
          attempts++;
          if (window.Dropbox && typeof window.Dropbox.choose === "function") {
            resolve();
          } else if (attempts >= maxAttempts) {
            reject(new Error("Dropbox SDK did not initialize"));
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      };

      script.onerror = () =>
        reject(new Error("Failed to load Dropbox Dropins script"));

      document.head.appendChild(script);
    });
  }

  /**
   * Initializes the Dropbox Dropins SDK.
   */
  async function initialize() {
    if (isInitialized.value) return;

    try {
      isLoading.value = true;
      error.value = null;
      await loadDropinsScript();
      isInitialized.value = true;
    } catch (err) {
      error.value = err.message || "Error initializing Dropbox";
      console.error("Dropbox initialization error:", err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Opens the Dropbox Chooser to let the user pick images.
   * Returns an array of file objects with direct download links.
   * @param {number} sizeLimit - Max file size in bytes (default 5MB)
   * @returns {Promise<Array>} Selected file objects
   */
  function chooseFiles(sizeLimit = MAX_FILE_SIZE) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!isInitialized.value) {
          await initialize();
        }

        if (!window.Dropbox || typeof window.Dropbox.choose !== "function") {
          reject(new Error("Dropbox Chooser not available"));
          return;
        }

        if (
          window.Dropbox.isBrowserSupported &&
          !window.Dropbox.isBrowserSupported()
        ) {
          reject(
            new Error("Your browser does not support the Dropbox Chooser"),
          );
          return;
        }

        window.Dropbox.choose({
          success: (files) => {
            // Filter to only image files as a safety net
            const imageFiles = files.filter((f) => {
              const ext = f.name.split(".").pop()?.toLowerCase() || "";
              return [
                "jpg",
                "jpeg",
                "png",
                "webp",
                "gif",
                "bmp",
                "tiff",
                "tif",
              ].includes(ext);
            });
            selectedFiles.value = imageFiles;
            resolve(imageFiles);
          },
          cancel: () => {
            resolve([]);
          },
          linkType: "direct",
          multiselect: true,
          extensions: ["images"],
          sizeLimit: sizeLimit,
        });
      } catch (err) {
        error.value = err.message;
        reject(err);
      }
    });
  }

  /**
   * Downloads a single file from its direct link as a Blob.
   * Direct links are CORS-enabled and expire after 4 hours.
   * @param {object} file - Dropbox file object with .link
   * @returns {Promise<Blob>}
   */
  async function downloadFileAsBlob(file) {
    const response = await fetch(file.link);

    if (!response.ok) {
      throw new Error(
        `Failed to download ${file.name}: ${response.status} ${response.statusText}`,
      );
    }

    return await response.blob();
  }

  /**
   * Downloads multiple files with concurrency control.
   * @param {Array} files - Array of Dropbox file objects
   * @param {Function} onProgress - Callback (downloaded, total)
   * @param {number} concurrencyLimit - Max concurrent downloads
   * @returns {Promise<Array>} Array of { file, blob, success }
   */
  async function downloadMultipleFiles(
    files,
    onProgress = null,
    concurrencyLimit = 5,
  ) {
    const results = [];
    let completed = 0;
    const total = files.length;

    for (let i = 0; i < files.length; i += concurrencyLimit) {
      const batch = files.slice(i, i + concurrencyLimit);

      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const blob = await downloadFileAsBlob(file);
            completed++;
            if (onProgress) onProgress(completed, total);

            return { file, blob, success: true };
          } catch (err) {
            console.error(`Error downloading ${file.name}:`, err);
            completed++;
            if (onProgress) onProgress(completed, total);
            return { file, blob: null, success: false, error: err.message };
          }
        }),
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Full flow: open Chooser → download selected photos as blobs.
   * @param {number} concurrencyLimit - Max concurrent downloads
   * @returns {Promise<Array>} Array of { file, blob, success }
   */
  async function importPhotos(concurrencyLimit = 5) {
    try {
      isLoading.value = true;
      error.value = null;

      const files = await chooseFiles();

      if (!files || files.length === 0) {
        return [];
      }

      isDownloading.value = true;
      downloadedCount.value = 0;
      totalToDownload.value = files.length;

      const results = await downloadMultipleFiles(
        files,
        (downloaded, total) => {
          downloadedCount.value = downloaded;
          totalToDownload.value = total;
        },
        concurrencyLimit,
      );

      return results;
    } catch (err) {
      error.value = err.message;
      console.error("Error importing from Dropbox:", err);
      return [];
    } finally {
      isLoading.value = false;
      isDownloading.value = false;
      downloadedCount.value = 0;
      totalToDownload.value = 0;
    }
  }

  const downloadProgress = computed(() => {
    if (totalToDownload.value === 0) return 0;
    return (downloadedCount.value / totalToDownload.value) * 100;
  });

  return {
    // State
    isInitialized,
    isLoading,
    isDownloading,
    downloadedCount,
    totalToDownload,
    downloadProgress,
    error,
    selectedFiles,

    // Methods
    initialize,
    chooseFiles,
    importPhotos,
    downloadFileAsBlob,
    downloadMultipleFiles,
  };
}
