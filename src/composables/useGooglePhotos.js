import { ref, computed } from "vue";

// Google Photos Picker API configuration
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// Scope correcto para Google Photos Picker API (NO Drive Picker)
const SCOPES =
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

// Endpoints de la API real de Google Photos Picker
const PICKER_API_BASE = "https://photospicker.googleapis.com/v1";

// LocalStorage keys
const TOKEN_STORAGE_KEY = "google_photos_token";
const TOKEN_EXPIRY_KEY = "google_photos_token_expiry";

/**
 * Guarda el token y su fecha de expiración en localStorage
 */
function saveTokenToStorage(token, expiresIn = 3600) {
  const expiryTime = Date.now() + expiresIn * 1000; // expiresIn en segundos
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
  console.log("💾 Token saved to localStorage");
}

/**
 * Recupera el token de localStorage si no ha expirado
 */
function loadTokenFromStorage() {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

  if (!token || !expiry) {
    return null;
  }

  const expiryTime = parseInt(expiry, 10);
  const now = Date.now();

  // Verificar si el token ha expirado
  if (now >= expiryTime) {
    console.log("⏰ Token expired, clearing storage");
    clearTokenFromStorage();
    return null;
  }

  console.log("✅ Token loaded from localStorage");
  return token;
}

/**
 * Limpia el token del localStorage
 */
function clearTokenFromStorage() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  console.log("🗑️ Token cleared from localStorage");
}

export function useGooglePhotos() {
  // Estado del composable
  const isInitialized = ref(false);
  const isAuthorized = ref(false);
  const isLoading = ref(false);
  const isPickerOpen = ref(false);
  const isPolling = ref(false);
  const isDownloading = ref(false);
  const error = ref(null);
  const accessToken = ref(null);
  const selectedPhotos = ref([]);
  const currentSession = ref(null);
  const downloadedCount = ref(0);
  const totalToDownload = ref(0);

  let tokenClient = null;
  let pollingInterval = null;
  let pickerWindow = null;

  // Intentar cargar token guardado al inicializar
  const savedToken = loadTokenFromStorage();
  if (savedToken) {
    accessToken.value = savedToken;
    isAuthorized.value = true;
    console.log("🔄 Restored session from localStorage");
  }

  /**
   * Carga el script de Google Identity Services si no está presente
   */
  function loadGISScript() {
    return new Promise((resolve, reject) => {
      // Si ya está cargado, resolver inmediatamente
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
   * Inicializa Google Identity Services para OAuth2
   */
  async function initialize() {
    if (isInitialized.value) return;

    try {
      isLoading.value = true;
      error.value = null;

      // Cargar el script de GIS si no está presente
      await loadGISScript();

      // Esperar a que Google Identity Services esté disponible
      await waitForGIS();

      // Inicializar Google Identity Services (OAuth2)
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: "", // Se define dinámicamente en authorize()
      });

      console.log("✅ Google Identity Services initialized for Photos Picker");
      isInitialized.value = true;
    } catch (err) {
      error.value =
        err.message || "Error initializing Google Photos Picker API";
      console.error("❌ Google Photos Picker initialization error:", err);
    } finally {
      isLoading.value = false;
    }
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

      // Si ya tenemos token válido, retornarlo
      if (accessToken.value) {
        resolve(accessToken.value);
        return;
      }

      // Configurar callback para cuando se reciba el token
      tokenClient.callback = (response) => {
        if (response.error) {
          console.error("❌ OAuth error:", response.error);
          error.value = response.error;
          isAuthorized.value = false;
          reject(new Error(response.error));
          return;
        }

        console.log("✅ Access token received for Photos Picker scope");
        accessToken.value = response.access_token;
        isAuthorized.value = true;

        // Guardar token en localStorage (expiresIn viene en segundos, default 3600 = 1 hora)
        const expiresIn = response.expires_in || 3600;
        saveTokenToStorage(response.access_token, expiresIn);

        resolve(response.access_token);
      };

      try {
        console.log("🔐 Requesting access token with scope:", SCOPES);
        tokenClient.requestAccessToken({ prompt: "" });
      } catch (err) {
        console.error("Error requesting token:", err);
        error.value = err.message;
        reject(err);
      }
    });
  }

  /**
   * Crea una sesión de Picker en Google Photos
   * @param {number} maxItems - Número máximo de items que puede seleccionar (default 100)
   * @returns {Promise<Object>} Session object con pickerUri
   */
  async function createPickerSession(maxItems = 100) {
    if (!accessToken.value) {
      await authorize();
    }

    try {
      console.log("📝 Creating Photos Picker session...");

      const response = await fetch(`${PICKER_API_BASE}/sessions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pickingConfig: {
            maxItemCount: maxItems.toString(),
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message ||
            `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const session = await response.json();
      console.log("✅ Picker session created:", session.id);
      console.log("🔗 Picker URI:", session.pickerUri);

      currentSession.value = session;
      return session;
    } catch (err) {
      console.error("❌ Error creating picker session:", err);
      error.value = err.message;
      throw err;
    }
  }

  /**
   * Obtiene el estado actual de una sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Object>} Session object
   */
  async function getSession(sessionId) {
    if (!accessToken.value) {
      throw new Error("Not authorized");
    }

    const response = await fetch(`${PICKER_API_BASE}/sessions/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${accessToken.value}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Lista los media items seleccionados en una sesión
   * @param {string} sessionId - ID de la sesión
   * @returns {Promise<Array>} Array de media items
   */
  async function listMediaItems(sessionId) {
    if (!accessToken.value) {
      throw new Error("Not authorized");
    }

    const allItems = [];
    let pageToken = null;

    do {
      const url = new URL(`${PICKER_API_BASE}/mediaItems`);
      url.searchParams.set("sessionId", sessionId);
      url.searchParams.set("pageSize", "100");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.mediaItems) {
        allItems.push(...data.mediaItems);
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return allItems;
  }

  /**
   * Elimina una sesión
   * @param {string} sessionId - ID de la sesión
   */
  async function deleteSession(sessionId) {
    if (!accessToken.value) return;

    try {
      await fetch(`${PICKER_API_BASE}/sessions/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      });
      console.log("🗑️ Session deleted:", sessionId);
    } catch (err) {
      console.warn("Could not delete session:", err);
    }
  }

  /**
   * Abre el Google Photos Picker y espera a que el usuario seleccione fotos
   * @param {number} maxItems - Número máximo de items
   * @returns {Promise<Array>} Array de fotos seleccionadas
   */
  async function selectPhotos(maxItems = 100) {
    try {
      isLoading.value = true;
      isPickerOpen.value = true;
      error.value = null;

      // CRÍTICO: Si no hay token, solo hacer autorización y retornar
      // El usuario debe hacer click de nuevo después de autorizar
      if (!accessToken.value) {
        console.log("🔐 No token found, need authorization first");
        console.log("⚠️ User will need to click again after authorization");

        await authorize();

        console.log("✅ Authorization complete, token acquired");
        console.log("💡 User can now click again to open picker");

        // Retornar array vacío indicando que debe intentar de nuevo
        // El componente debe detectar esto y mostrar mensaje
        return [];
      }

      // Ya tenemos token, crear sesión de picker
      console.log("📝 Creating picker session...");
      const session = await createPickerSession(maxItems);
      console.log("✅ Session created:", session.id);

      // Abrir el popup DIRECTAMENTE con la URL real
      // Como ya tenemos token y sesión, esto es sincrónico desde el click del usuario
      console.log("� Opening Photos Picker window...");
      pickerWindow = window.open(
        session.pickerUri,
        "GooglePhotosPicker",
        "width=1024,height=768,menubar=no,toolbar=no,location=no,status=no"
      );

      if (!pickerWindow) {
        throw new Error(
          "Could not open picker window. Please allow popups for this site."
        );
      }

      console.log("✅ Picker window opened successfully");

      // Empezar polling para verificar cuando el usuario termine
      const photos = await pollSessionUntilComplete(
        session.id,
        session.pollingConfig
      );

      // Cerrar la ventana del picker si aún está abierta
      if (pickerWindow && !pickerWindow.closed) {
        pickerWindow.close();
      }
      pickerWindow = null;

      // Eliminar sesión (buena práctica)
      await deleteSession(session.id);

      selectedPhotos.value = photos;
      return photos;
    } catch (err) {
      console.error("❌ Error in selectPhotos:", err);
      error.value = err.message;
      // Cerrar popup si quedó abierto tras un error
      if (pickerWindow && !pickerWindow.closed) {
        pickerWindow.close();
      }
      pickerWindow = null;
      throw err;
    } finally {
      isLoading.value = false;
      isPickerOpen.value = false;
      isPolling.value = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }
  }

  /**
   * Hace polling a la sesión hasta que el usuario termine de seleccionar
   * @param {string} sessionId - ID de la sesión
   * @param {Object} pollingConfig - Configuración de polling de la API
   * @returns {Promise<Array>} Array de media items seleccionados
   */
  function pollSessionUntilComplete(sessionId, pollingConfig) {
    return new Promise((resolve, reject) => {
      isPolling.value = true;

      // Parsear intervalo de polling (viene como "3s", "5s", etc.)
      let pollIntervalMs = parseInterval(pollingConfig?.pollInterval || "3s");
      const timeoutMs = parseInterval(pollingConfig?.timeoutIn || "1800s"); // 30 min default

      const startTime = Date.now();
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;

      console.log(
        `⏱️ Starting polling every ${pollIntervalMs}ms, timeout in ${timeoutMs}ms`
      );

      /**
       * Cuando la ventana se cierra, continuar verificando hasta encontrar las fotos
       * o hasta que se alcance el timeout general (30 min por defecto)
       */
      const checkAfterWindowClose = async () => {
        console.log("🪟 Picker window was closed, checking final state...");
        clearInterval(pollingInterval);
        pollingInterval = null;

        // Continuar verificando cada 2 segundos hasta encontrar fotos o timeout
        const checkInterval = 2000; // 2 segundos
        const maxAttempts = 150; // Máximo 150 intentos (300 segundos total)
        let attemptCount = 0;

        const checkLoop = async () => {
          attemptCount++;

          // Verificar si se alcanzó el timeout general
          if (Date.now() - startTime > timeoutMs) {
            console.log(
              "⏰ Timeout reached while waiting for photos after window close"
            );
            resolve([]);
            return;
          }

          // Verificar si se alcanzó el máximo de intentos después de cerrar
          if (attemptCount > maxAttempts) {
            console.log(
              `❌ User closed picker without selecting (${maxAttempts} attempts exhausted)`
            );
            resolve([]);
            return;
          }

          try {
            console.log(
              `🔄 Checking mediaItemsSet (attempt ${attemptCount}/${maxAttempts})...`
            );
            const session = await getSession(sessionId);

            if (session.mediaItemsSet) {
              const items = await listMediaItems(sessionId);
              console.log(
                `📷 ${items.length} photos selected (after window close, attempt ${attemptCount})`
              );
              resolve(items);
              return;
            }

            // Si no hay fotos todavía, esperar y reintentar
            console.log(
              `⏳ No photos yet, waiting ${checkInterval}ms before retry...`
            );
            setTimeout(checkLoop, checkInterval);
          } catch (err) {
            console.error(`Attempt ${attemptCount} error:`, err);
            // En caso de error, esperar y reintentar (si no hemos alcanzado el máximo)
            setTimeout(checkLoop, checkInterval);
          }
        };

        // Iniciar el primer chequeo después de un breve delay inicial
        setTimeout(checkLoop, 500);
      };

      const checkSession = async () => {
        try {
          // Verificar si la ventana fue cerrada por el usuario
          if (pickerWindow && pickerWindow.closed) {
            await checkAfterWindowClose();
            return;
          }

          // Verificar timeout
          if (Date.now() - startTime > timeoutMs) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            reject(new Error("Picker session timed out"));
            return;
          }

          // Consultar estado de la sesión
          const session = await getSession(sessionId);
          consecutiveErrors = 0; // Reset error counter on success

          console.log(
            `🔄 Polling session... mediaItemsSet: ${session.mediaItemsSet}`
          );

          if (session.mediaItemsSet) {
            console.log("✅ User finished selecting photos!");
            clearInterval(pollingInterval);
            pollingInterval = null;

            // Obtener los media items
            const items = await listMediaItems(sessionId);
            console.log(`📷 ${items.length} photos selected`);
            resolve(items);
            return;
          }

          // Actualizar config de polling si cambió
          if (session.pollingConfig?.pollInterval) {
            const newInterval = parseInterval(
              session.pollingConfig.pollInterval
            );
            if (newInterval !== pollIntervalMs && newInterval > 0) {
              console.log(`⏱️ Updating poll interval to ${newInterval}ms`);
              pollIntervalMs = newInterval;
              clearInterval(pollingInterval);
              pollingInterval = setInterval(checkSession, newInterval);
            }
          }
        } catch (err) {
          console.error("Polling error:", err);
          consecutiveErrors++;

          if (consecutiveErrors >= maxConsecutiveErrors) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            reject(
              new Error(
                `Polling failed after ${maxConsecutiveErrors} consecutive errors: ${err.message}`
              )
            );
          }
          // Si no hemos alcanzado el máximo, continuar intentando
        }
      };

      // Iniciar polling
      pollingInterval = setInterval(checkSession, pollIntervalMs);

      // Primera verificación después de un breve delay
      setTimeout(checkSession, 500);
    });
  }

  /**
   * Parsea un string de duración (e.g., "3s", "5.5s") a milisegundos
   */
  function parseInterval(duration) {
    if (!duration) return 3000;
    const match = duration.match(/^(\d+(?:\.\d+)?)s$/);
    return match ? parseFloat(match[1]) * 1000 : 3000;
  }

  /**
   * Descarga una foto como Blob (bytes originales, con EXIF)
   * @param {object} mediaItem - Media item de Google Photos Picker
   * @returns {Promise<Blob>}
   */
  async function downloadPhotoAsBlob(mediaItem) {
    if (!accessToken.value) {
      throw new Error("Not authorized");
    }

    try {
      // Obtener baseUrl del mediaItem
      // La estructura puede variar: mediaItem.mediaFile.baseUrl o mediaItem.baseUrl
      const baseUrl = mediaItem.mediaFile?.baseUrl || mediaItem.baseUrl;

      if (!baseUrl) {
        throw new Error("No baseUrl found in mediaItem");
      }

      // `=d` descarga los bytes originales conservando todo el EXIF (Google
      // solo elimina la geolocalización). Con `=w{n}-h{n}` Google devuelve una
      // copia reescalada y re-codificada por su CDN, que llega SIN EXIF: por eso
      // las fotos importadas no traían cámara, objetivo, ISO ni fecha de toma.
      // El redimensionado para subida ya lo hace processPhotoSource() después.
      const downloadUrl = `${baseUrl}=d`;

      console.log(`📥 Downloading photo: ${mediaItem.id}`);

      // IMPORTANTE: Las baseUrl de Photos Picker API requieren Authorization header
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download photo: ${response.status} ${response.statusText}`
        );
      }

      const blob = await response.blob();
      return blob;
    } catch (err) {
      console.error("❌ Error downloading photo:", err);
      throw err;
    }
  }

  /**
   * Flujo completo: seleccionar y descargar fotos de Google Photos
   * @param {number} maxItems - Número máximo de items a seleccionar
   * @param {number} concurrencyLimit - Límite de descargas simultáneas
   * @returns {Promise<Array>} Array de {mediaItem, blob, success}
   */
  async function importPhotos(maxItems = 100, concurrencyLimit = 5) {
    try {
      // Seleccionar fotos
      const mediaItems = await selectPhotos(maxItems);

      if (!mediaItems || mediaItems.length === 0) {
        return [];
      }

      // Descargar fotos con progreso
      isDownloading.value = true;
      downloadedCount.value = 0;
      totalToDownload.value = mediaItems.length;

      const results = await downloadMultiplePhotos(
        mediaItems,
        (downloaded, total) => {
          downloadedCount.value = downloaded;
          totalToDownload.value = total;
        },
        concurrencyLimit
      );

      return results;
    } finally {
      isDownloading.value = false;
      downloadedCount.value = 0;
      totalToDownload.value = 0;
    }
  }

  /**
   * Descarga múltiples fotos con límite de concurrencia
   * @param {Array} mediaItems - Array de media items
   * @param {Function} onProgress - Callback para progreso (downloadedCount, total)
   * @param {number} concurrencyLimit - Límite de descargas simultáneas
   * @returns {Promise<Array>} Array de {mediaItem, blob, success}
   */
  async function downloadMultiplePhotos(
    mediaItems,
    onProgress = null,
    concurrencyLimit = 5
  ) {
    const results = [];
    let downloadedCount = 0;
    const total = mediaItems.length;

    // Procesar en batches para controlar concurrencia
    for (let i = 0; i < mediaItems.length; i += concurrencyLimit) {
      const batch = mediaItems.slice(i, i + concurrencyLimit);

      const batchResults = await Promise.all(
        batch.map(async (mediaItem) => {
          try {
            const blob = await downloadPhotoAsBlob(mediaItem);
            downloadedCount++;

            if (onProgress) {
              onProgress(downloadedCount, total);
            }

            return {
              mediaItem,
              blob,
              success: true,
            };
          } catch (err) {
            console.error(`❌ Error downloading ${mediaItem.id}:`, err);
            downloadedCount++;
            if (onProgress) {
              onProgress(downloadedCount, total);
            }
            return {
              mediaItem,
              blob: null,
              success: false,
              error: err.message,
            };
          }
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Obtiene la URL de thumbnail de un media item
   * @param {object} mediaItem - Media item
   * @param {number} size - Tamaño deseado (default 400)
   * @returns {string} URL del thumbnail
   */
  function getThumbnailUrl(mediaItem, size = 400) {
    const baseUrl = mediaItem.mediaFile?.baseUrl || mediaItem.baseUrl;
    if (!baseUrl) return null;
    return `${baseUrl}=w${size}-h${size}-c`; // -c para crop cuadrado
  }

  /**
   * Obtiene la URL de imagen en tamaño completo
   * @param {object} mediaItem - Media item
   * @returns {string} URL de la imagen
   */
  function getFullSizeUrl(mediaItem) {
    const baseUrl = mediaItem.mediaFile?.baseUrl || mediaItem.baseUrl;
    if (!baseUrl) return null;
    return `${baseUrl}=d`; // =d para download
  }

  /**
   * Revoca la autorización
   */
  function signOut() {
    if (accessToken.value && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(accessToken.value, () => {
        console.log("Token revoked");
      });
    }
    accessToken.value = null;
    isAuthorized.value = false;
    selectedPhotos.value = [];
    currentSession.value = null;
    clearTokenFromStorage();
    console.log("👋 Signed out from Google Photos");
  }

  /**
   * Limpia las fotos seleccionadas
   */
  function clearSelection() {
    selectedPhotos.value = [];
  }

  /**
   * Cancela el polling actual si existe
   */
  function cancelPicker() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    if (pickerWindow && !pickerWindow.closed) {
      pickerWindow.close();
    }
    pickerWindow = null;
    isPickerOpen.value = false;
    isPolling.value = false;
  }

  // Computed properties
  const hasSelectedPhotos = computed(() => selectedPhotos.value.length > 0);
  const selectedCount = computed(() => selectedPhotos.value.length);
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
    isPolling,
    isDownloading,
    downloadedCount,
    totalToDownload,
    downloadProgress,
    error,
    selectedPhotos,
    currentSession,
    hasSelectedPhotos,
    selectedCount,

    // Métodos principales
    initialize,
    authorize,
    signOut,
    selectPhotos,
    importPhotos,
    cancelPicker,

    // Métodos de sesión (para uso avanzado)
    createPickerSession,
    getSession,
    listMediaItems,
    deleteSession,

    // Métodos de descarga
    downloadPhotoAsBlob,
    downloadMultiplePhotos,

    // Utilidades
    getThumbnailUrl,
    getFullSizeUrl,
    clearSelection,
  };
}
