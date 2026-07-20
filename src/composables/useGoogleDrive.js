import { ref, computed } from "vue";

// Google Drive Picker configuration.
// Reutiliza el mismo Client ID / API Key que Google Photos: es el mismo
// proyecto de Google Cloud, solo hace falta habilitar "Google Picker API"
// y añadir el scope drive.file al consent screen.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || "";
// Project number (no el Project ID de texto): requerido por el Picker para
// que el scope drive.file conceda acceso real al archivo elegido. Sin esto,
// la descarga posterior vía Drive API devuelve 404 aunque el archivo exista.
const GOOGLE_APP_ID = import.meta.env.VITE_GOOGLE_APP_ID || "";

// drive.file: acceso únicamente a los archivos que el usuario elige
// explícitamente en el Picker (no a todo su Drive). Scope básico, no
// restringido -> verificación OAuth simple.
const SCOPES = "https://www.googleapis.com/auth/drive.file";

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const IMAGE_MIME_TYPES =
  "image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,image/tiff,image/bmp";

// LocalStorage keys
const TOKEN_STORAGE_KEY = "google_drive_token";
const TOKEN_EXPIRY_KEY = "google_drive_token_expiry";

/**
 * Guarda el token y su fecha de expiración en localStorage
 */
function saveTokenToStorage(token, expiresIn = 3600) {
  const expiryTime = Date.now() + expiresIn * 1000;
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
}

/**
 * Recupera el token de localStorage si no ha expirado
 */
function loadTokenFromStorage() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

  if (!token || !expiry) return null;

  if (Date.now() >= parseInt(expiry, 10)) {
    clearTokenFromStorage();
    return null;
  }

  return token;
}

/**
 * Limpia el token del localStorage
 */
function clearTokenFromStorage() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function useGoogleDrive() {
  const isInitialized = ref(false);
  const isAuthorized = ref(false);
  const isLoading = ref(false);
  const isPickerOpen = ref(false);
  const isDownloading = ref(false);
  const error = ref(null);
  const accessToken = ref(null);
  const downloadedCount = ref(0);
  const totalToDownload = ref(0);

  let tokenClient = null;
  let pickerLibraryLoaded = false;

  const savedToken = loadTokenFromStorage();
  if (savedToken) {
    accessToken.value = savedToken;
    isAuthorized.value = true;
  }

  /**
   * Carga el script de Google Identity Services si no está presente
   */
  function loadGISScript() {
    return new Promise((resolve, reject) => {
      if (
        document.querySelector('script[src*="accounts.google.com/gsi/client"]')
      ) {
        resolve();
        return;
      }

      const gsiScript = document.createElement("script");
      gsiScript.src = "https://accounts.google.com/gsi/client";
      gsiScript.async = true;
      gsiScript.defer = true;
      gsiScript.onload = () => resolve();
      gsiScript.onerror = () =>
        reject(new Error("Failed to load Google Identity Services script"));
      document.head.appendChild(gsiScript);
    });
  }

  /**
   * Carga el script gapi (necesario para la librería del Picker)
   */
  function loadGapiScript() {
    return new Promise((resolve, reject) => {
      if (window.gapi?.load) {
        resolve();
        return;
      }

      if (document.querySelector('script[src*="apis.google.com/js/api.js"]')) {
        const waitForGapi = () => {
          if (window.gapi?.load) resolve();
          else setTimeout(waitForGapi, 100);
        };
        waitForGapi();
        return;
      }

      const gapiScript = document.createElement("script");
      gapiScript.src = "https://apis.google.com/js/api.js";
      gapiScript.async = true;
      gapiScript.defer = true;
      gapiScript.onload = () => resolve();
      gapiScript.onerror = () =>
        reject(new Error("Failed to load Google API script"));
      document.head.appendChild(gapiScript);
    });
  }

  /**
   * Carga el módulo "picker" de gapi
   */
  function loadPickerLibrary() {
    return new Promise((resolve, reject) => {
      if (pickerLibraryLoaded && window.google?.picker) {
        resolve();
        return;
      }

      window.gapi.load("picker", {
        callback: () => {
          pickerLibraryLoaded = true;
          resolve();
        },
        onerror: () => reject(new Error("Failed to load Google Picker library")),
      });
    });
  }

  /**
   * Espera a que Google Identity Services esté disponible
   */
  function waitForGIS() {
    return new Promise((resolve, reject) => {
      const maxAttempts = 50;
      let attempts = 0;

      const checkGIS = () => {
        attempts++;
        if (window.google?.accounts?.oauth2) {
          resolve();
        } else if (attempts >= maxAttempts) {
          reject(
            new Error(
              "Google Identity Services not loaded. Make sure to include the GIS script."
            )
          );
        } else {
          setTimeout(checkGIS, 100);
        }
      };

      checkGIS();
    });
  }

  /**
   * Inicializa Google Identity Services (OAuth2) + la librería del Picker
   */
  async function initialize() {
    if (isInitialized.value) return;

    try {
      isLoading.value = true;
      error.value = null;

      await Promise.all([loadGISScript(), loadGapiScript()]);
      await waitForGIS();
      await loadPickerLibrary();

      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: "", // Se define dinámicamente en authorize()
      });

      isInitialized.value = true;
    } catch (err) {
      error.value = err.message || "Error initializing Google Drive Picker";
      console.error("❌ Google Drive initialization error:", err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Inicia el flujo de autorización OAuth2
   * @returns {Promise<string>} Access token
   */
  function authorize() {
    return new Promise(async (resolve, reject) => {
      if (!isInitialized.value) {
        await initialize();
      }

      if (!tokenClient) {
        reject(new Error("Token client not initialized"));
        return;
      }

      if (accessToken.value) {
        resolve(accessToken.value);
        return;
      }

      tokenClient.callback = (response) => {
        if (response.error) {
          error.value = response.error;
          isAuthorized.value = false;
          reject(new Error(response.error));
          return;
        }

        accessToken.value = response.access_token;
        isAuthorized.value = true;

        const expiresIn = response.expires_in || 3600;
        saveTokenToStorage(response.access_token, expiresIn);

        resolve(response.access_token);
      };

      try {
        tokenClient.requestAccessToken({ prompt: "" });
      } catch (err) {
        error.value = err.message;
        reject(err);
      }
    });
  }

  /**
   * Abre el Google Picker configurado para elegir varias fotos (no carpetas
   * completas: con drive.file, seleccionar una carpeta no da acceso a su
   * contenido, solo a los archivos elegidos explícitamente).
   * @returns {Promise<Array>} Documentos seleccionados (google.picker.Document)
   */
  function openPicker() {
    return new Promise((resolve, reject) => {
      try {
        const view = new window.google.picker.DocsView(
          window.google.picker.ViewId.DOCS
        )
          .setIncludeFolders(true)
          .setMimeTypes(IMAGE_MIME_TYPES);

        const picker = new window.google.picker.PickerBuilder()
          .setOAuthToken(accessToken.value)
          .setDeveloperKey(GOOGLE_API_KEY)
          .setAppId(GOOGLE_APP_ID)
          .addView(view)
          .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
          .setCallback((data) => {
            if (data.action === window.google.picker.Action.PICKED) {
              resolve(data.docs || []);
            } else if (data.action === window.google.picker.Action.CANCEL) {
              resolve([]);
            }
          })
          .build();

        picker.setVisible(true);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Flujo completo de selección: autoriza si hace falta y abre el Picker.
   * @returns {Promise<Array>} Documentos seleccionados
   */
  async function selectFiles() {
    isPickerOpen.value = true;
    error.value = null;

    try {
      if (!isInitialized.value) {
        await initialize();
      }
      if (!accessToken.value) {
        await authorize();
      }
      return await openPicker();
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      isPickerOpen.value = false;
    }
  }

  /**
   * Descarga un archivo de Drive como Blob
   * @param {object} file - { id, name }
   * @returns {Promise<Blob>}
   */
  async function downloadFileAsBlob(file) {
    if (!accessToken.value) {
      throw new Error("Not authorized");
    }

    const response = await fetch(
      `${DRIVE_API_BASE}/files/${file.id}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to download ${file.name}: ${response.status} ${response.statusText}`
      );
    }

    return await response.blob();
  }

  /**
   * Descarga múltiples archivos con límite de concurrencia
   * @param {Array} files - Array de { id, name }
   * @param {Function} onProgress - Callback (downloaded, total)
   * @param {number} concurrencyLimit
   * @returns {Promise<Array>} Array de {file, blob, success}
   */
  async function downloadMultipleFiles(
    files,
    onProgress = null,
    concurrencyLimit = 5
  ) {
    const results = [];
    let downloaded = 0;
    const total = files.length;

    for (let i = 0; i < files.length; i += concurrencyLimit) {
      const batch = files.slice(i, i + concurrencyLimit);

      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const blob = await downloadFileAsBlob(file);
            downloaded++;
            onProgress?.(downloaded, total);
            return { file, blob, success: true };
          } catch (err) {
            console.error(`❌ Error downloading ${file.name}:`, err);
            downloaded++;
            onProgress?.(downloaded, total);
            return { file, blob: null, success: false, error: err.message };
          }
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Flujo completo: seleccionar y descargar fotos de Google Drive
   * @param {number} concurrencyLimit - Límite de descargas simultáneas
   * @returns {Promise<Array>} Array de {file, blob, success}
   */
  async function importPhotos(concurrencyLimit = 5) {
    const docs = await selectFiles();

    if (!docs || docs.length === 0) {
      return [];
    }

    // Los docs seleccionados que sean carpetas se descartan: drive.file no da
    // acceso a su contenido, solo a los archivos elegidos explícitamente.
    const imageFiles = docs
      .filter((doc) => doc.mimeType?.startsWith("image/"))
      .map((doc) => ({ id: doc.id, name: doc.name, mimeType: doc.mimeType }));

    if (imageFiles.length === 0) {
      return [];
    }

    isDownloading.value = true;
    downloadedCount.value = 0;
    totalToDownload.value = imageFiles.length;

    try {
      return await downloadMultipleFiles(
        imageFiles,
        (downloaded, total) => {
          downloadedCount.value = downloaded;
          totalToDownload.value = total;
        },
        concurrencyLimit
      );
    } finally {
      isDownloading.value = false;
      downloadedCount.value = 0;
      totalToDownload.value = 0;
    }
  }

  /**
   * Revoca la autorización
   */
  function signOut() {
    if (accessToken.value && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken.value, () => {});
    }
    accessToken.value = null;
    isAuthorized.value = false;
    clearTokenFromStorage();
  }

  const downloadProgress = computed(() => {
    if (totalToDownload.value === 0) return 0;
    return (downloadedCount.value / totalToDownload.value) * 100;
  });

  return {
    // Estado
    isInitialized,
    isAuthorized,
    isLoading,
    isPickerOpen,
    isDownloading,
    downloadedCount,
    totalToDownload,
    downloadProgress,
    error,

    // Métodos
    initialize,
    authorize,
    signOut,
    selectFiles,
    importPhotos,
    downloadFileAsBlob,
    downloadMultipleFiles,
  };
}
