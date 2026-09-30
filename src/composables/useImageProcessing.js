// composables/useImageProcessing.js
//
// Este composable maneja el redimensionamiento de imágenes con fallback automático:
// 1. Intenta usar PICA para máxima calidad (algoritmos Lanczos/bicubic)
// 2. Si falla por protección de fingerprinting, usa step-down nativo de alta calidad
// 3. Maneja automáticamente la compresión para controlar el tamaño de archivo
//
// NOTE on the Chromium tile-scrambling bug (nodeca/pica#217):
// Excluding the 'cib' feature only disables pica's whole-image
// createImageBitmap() resize path. It does NOT disable pica's separate,
// unconditional use of createImageBitmap(img, x, y, w, h) to extract each
// tile when resizing an <img> with WebWorkers ('ww') + OffscreenCanvas
// (see __extractTileData in pica/index.js). That per-tile crop is exactly
// where Chromium 131+ mis-applies EXIF Orientation, producing the scrambled
// "puzzle" artifact — and only for images that actually carry a non-default
// Orientation tag (i.e. vertical mobile photos), regardless of OS/device.
// Fix: when the source file has a rotation-needing Orientation tag, we
// pre-draw it onto a canvas (see toPicaSafeSource below) before handing it
// to pica. Canvases are read via getImageData instead of createImageBitmap,
// which sidesteps the bug entirely. Images without a rotation tag (the vast
// majority) keep going through the original <img> path unchanged.
import { ref } from "vue";
import pica from "pica";
import exifr from "exifr";
import {
  UPLOAD_MIME,
  UPLOAD_QUALITY_INITIAL,
  UPLOAD_QUALITY_DECREMENT,
} from "@/config/uploadConfig.js";

// One-time probe: does this browser actually produce WebP output when asked?
// canvas.toBlob('image/webp') silently returns PNG on Safari < 16 / iOS < 16,
// which breaks the iterative size-control loop (PNG ignores the quality param).
// Cached at module level — runs at most once per page load.
let _webpEncodingSupport = null;
function probeWebpEncoding() {
  if (_webpEncodingSupport !== null) return _webpEncodingSupport;
  _webpEncodingSupport = new Promise((resolve) => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    c.toBlob((blob) => resolve(blob?.type === "image/webp"), "image/webp");
  });
  return _webpEncodingSupport;
}

// fit "width": targetSize is the output width (may upscale).
// fit "longEdge": targetSize caps the longer side (never upscales).
function getTargetDimensions(img, targetSize, fit) {
  if (fit === "longEdge") {
    const scale = Math.min(1, targetSize / Math.max(img.width, img.height));
    return {
      width: Math.round(img.width * scale),
      height: Math.round(img.height * scale),
    };
  }
  return { width: targetSize, height: (img.height * targetSize) / img.width };
}

export function useImageProcessing() {
  // Exclude 'cib' (createImageBitmap) to avoid pica's whole-image resize-via-cib
  // path (see NOTE above for why this alone doesn't fix the tile-scrambling bug).
  const picaInstance = pica({ features: ["js", "wasm", "ww"] });

  // Solo las imágenes con un tag de Orientation que implique rotación (2-8)
  // disparan el bug de recorte por tile de Chromium. Si no hay tag o es 1
  // (normal), devolvemos la <img> tal cual y pica sigue su camino habitual.
  async function toPicaSafeSource(file, img) {
    let orientation;
    try {
      orientation = await exifr.orientation(file);
    } catch {
      orientation = undefined;
    }

    if (!orientation || orientation === 1) return img;

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas;
  }

  async function resizeImage(
    file,
    targetSize,
    maxSizeBytes = 512000,
    options = {},
  ) {
    try {
      // Intentar usar pica primero para máxima calidad
      return await resizeWithPica(file, targetSize, maxSizeBytes, options);
    } catch (error) {
      // Detectar errores específicos de protección de fingerprinting o canvas
      console.warn(
        "⚠️ Pica failed due to browser restrictions, using step-down fallback:",
        error.message,
      );
      return await resizeWithStepDown(file, targetSize, maxSizeBytes, options);
    }
  }

  // Función original con pica
  async function resizeWithPica(
    file,
    targetSize,
    maxSizeBytes = 512000,
    { fit = "width" } = {},
  ) {
    // 0.5MB = 512000 bytes
    const img = await loadImage(file);
    // On Safari < 16 / iOS < 16, canvas.toBlob('image/webp') silently returns
    // PNG and ignores quality, so the iterative size loop does nothing.
    // Fall back to JPEG on those platforms so compression actually works.
    const effectiveMime =
      UPLOAD_MIME === "image/webp" && !(await probeWebpEncoding())
        ? "image/jpeg"
        : UPLOAD_MIME;
    const canvas = document.createElement("canvas");
    const { width, height } = getTargetDimensions(img, targetSize, fit);
    canvas.width = width;
    canvas.height = height;

    const resizeSource = await toPicaSafeSource(file, img);
    await picaInstance.resize(resizeSource, canvas);

    // Si maxSizeBytes es null, usar calidad fija como antes
    if (!maxSizeBytes) {
      const blob = await picaInstance.toBlob(
        canvas,
        effectiveMime,
        UPLOAD_QUALITY_INITIAL,
      );
      return blob;
    }

    // Compresión iterativa para no superar el tamaño máximo
    let quality = UPLOAD_QUALITY_INITIAL;
    let blob;
    let attempts = 0;
    const maxAttempts = 10;
    const qualityDecrement = UPLOAD_QUALITY_DECREMENT;

    do {
      blob = await picaInstance.toBlob(canvas, effectiveMime, quality);

      if (blob.size <= maxSizeBytes || attempts >= maxAttempts) {
        break;
      }

      quality = Math.max(0.1, quality - qualityDecrement);
      attempts++;
    } while (quality > 0.1);

    return blob;
  }

  // Fallback con step-down resize para alta calidad sin pica
  async function resizeWithStepDown(
    file,
    targetSize,
    maxSizeBytes = 512000,
    { fit = "width" } = {},
  ) {
    const img = await loadImage(file);
    // Same WebP encoding fallback as resizeWithPica.
    const effectiveMime =
      UPLOAD_MIME === "image/webp" && !(await probeWebpEncoding())
        ? "image/jpeg"
        : UPLOAD_MIME;
    const target = getTargetDimensions(img, targetSize, fit);
    const targetWidth = target.width;
    const targetHeight = Math.round(target.height);

    let currentCanvas = document.createElement("canvas");
    let currentCtx = currentCanvas.getContext("2d");

    // Configurar para máxima calidad
    currentCtx.imageSmoothingEnabled = true;
    currentCtx.imageSmoothingQuality = "high";

    let currentWidth = img.width;
    let currentHeight = img.height;

    // Dibujar imagen original en el canvas inicial
    currentCanvas.width = currentWidth;
    currentCanvas.height = currentHeight;
    currentCtx.drawImage(img, 0, 0);

    // Step-down: reducir en pasos del 50% hasta estar cerca del objetivo
    while (currentWidth > targetWidth * 2 || currentHeight > targetHeight * 2) {
      const stepWidth = Math.max(targetWidth, Math.floor(currentWidth * 0.5));
      const stepHeight = Math.max(
        targetHeight,
        Math.floor(currentHeight * 0.5),
      );

      const stepCanvas = document.createElement("canvas");
      const stepCtx = stepCanvas.getContext("2d");
      stepCanvas.width = stepWidth;
      stepCanvas.height = stepHeight;

      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = "high";
      stepCtx.drawImage(currentCanvas, 0, 0, stepWidth, stepHeight);

      // Limpiar canvas anterior para liberar memoria
      currentCanvas.width = 1;
      currentCanvas.height = 1;

      currentCanvas = stepCanvas;
      currentCtx = stepCtx;
      currentWidth = stepWidth;
      currentHeight = stepHeight;
    }

    // Paso final al tamaño exacto objetivo
    const finalCanvas = document.createElement("canvas");
    const finalCtx = finalCanvas.getContext("2d");
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = "high";
    finalCtx.drawImage(currentCanvas, 0, 0, targetWidth, targetHeight);

    // Limpiar canvas intermedio
    currentCanvas.width = 1;
    currentCanvas.height = 1;

    // Manejar compresión con control de tamaño
    if (!maxSizeBytes) {
      return new Promise((resolve) => {
        finalCanvas.toBlob(resolve, effectiveMime, UPLOAD_QUALITY_INITIAL);
      });
    }

    // Compresión iterativa para controlar el tamaño
    let quality = UPLOAD_QUALITY_INITIAL;
    let blob;
    let attempts = 0;
    const maxAttempts = 10;
    const qualityDecrement = UPLOAD_QUALITY_DECREMENT;

    do {
      blob = await new Promise((resolve) => {
        finalCanvas.toBlob(resolve, effectiveMime, quality);
      });

      if (blob.size <= maxSizeBytes || attempts >= maxAttempts) {
        break;
      }

      quality = Math.max(0.1, quality - qualityDecrement);
      attempts++;
    } while (quality > 0.1);

    return blob;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let blobUrl = null;

      img.onload = () => {
        // Limpiar el blob URL después de cargar para liberar memoria
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
        resolve(img);
      };

      img.onerror = (error) => {
        // Limpiar el blob URL en caso de error
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
        console.error("❌ Error loading image:", error);
        reject(new Error(`Failed to load image: ${file.name}`));
      };

      try {
        blobUrl = URL.createObjectURL(file);
        img.src = blobUrl;
      } catch (error) {
        console.error("❌ Error creating object URL:", error);
        reject(
          new Error(`Failed to create object URL for image: ${file.name}`),
        );
      }
    });
  }

  // Nueva función para subir a R2 con retry y validación
  async function uploadToR2WithRetry(
    url,
    blob,
    fileName,
    type,
    maxRetries = 3,
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🔄 Uploading ${type} for ${fileName} (attempt ${attempt}/${maxRetries})`,
        );

        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": blob.type,
            // Removido Content-Length: algunos navegadores (Safari iOS) no lo permiten
            // y puede causar errores. El navegador lo calcula automáticamente.
          },
          body: blob,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Verificar que la respuesta sea exitosa
        if (response.status >= 200 && response.status < 300) {
          console.log(`✅ Successfully uploaded ${type} for ${fileName}`);
          return response;
        } else {
          throw new Error(`Unexpected status code: ${response.status}`);
        }
      } catch (error) {
        console.error(
          `❌ Upload attempt ${attempt} failed for ${type} of ${fileName}:`,
          error,
        );

        // Log específico para problemas de compatibilidad
        if (
          error.name === "TypeError" &&
          error.message.includes("Failed to fetch")
        ) {
          console.warn("🚨 Network/CORS issue detected");
        }

        if (attempt === maxRetries) {
          throw new Error(
            `Failed to upload ${type} for ${fileName} after ${maxRetries} attempts: ${error.message}`,
          );
        }

        // Esperar antes del siguiente intento (backoff exponencial)
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return {
    resizeImage, // Función principal con fallback automático
    resizeWithPica, // Función específica con pica (para casos avanzados)
    resizeWithStepDown, // Función fallback de alta calidad
    loadImage,
    uploadToR2WithRetry,
  };
}
