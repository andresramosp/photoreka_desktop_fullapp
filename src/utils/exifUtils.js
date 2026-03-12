// utils/exifUtils.js
import exifr from "exifr";

/**
 * Extrae datos EXIF básicos de un archivo de imagen
 * @param {File} file - Archivo de imagen
 * @returns {Promise<Object>} - Objeto con datos EXIF básicos
 */
export async function extractBasicExifData(file) {
  try {
    const exifData = await exifr.parse(file, {
      // Especificar qué datos queremos extraer
      pick: [
        "DateTimeOriginal", // Fecha y hora de la toma
        "DateTime", // Fecha y hora de modificación
        "CreateDate", // Fecha de creación
        "Make", // Marca de la cámara
        "Model", // Modelo de la cámara
        "LensModel", // Modelo del lente
        "FocalLength", // Distancia focal
        "FNumber", // Número f (apertura)
        "ExposureTime", // Tiempo de exposición
        "ISO", // Sensibilidad ISO
        "Flash", // Información del flash
        "WhiteBalance", // Balance de blancos
        "GPSLatitude", // Latitud GPS
        "GPSLongitude", // Longitud GPS
        "GPSAltitude", // Altitud GPS
        "Orientation", // Orientación de la imagen
        "ColorSpace", // Espacio de color
      ],
    });

    if (!exifData) {
      return null;
    }

    // Procesar y normalizar los datos
    const basicExif = {
      // Fecha de la toma (priorizar DateTimeOriginal, luego DateTime, luego CreateDate)
      dateTaken:
        exifData.DateTimeOriginal ||
        exifData.DateTime ||
        exifData.CreateDate ||
        null,

      // Información de la cámara
      camera: {
        make: exifData.Make || null,
        model: exifData.Model || null,
        lens: exifData.LensModel || null,
      },

      // Configuración de la foto
      settings: {
        focalLength: exifData.FocalLength || null,
        aperture: exifData.FNumber || null,
        exposureTime: exifData.ExposureTime || null,
        iso: exifData.ISO || null,
        flash: exifData.Flash || null,
        whiteBalance: exifData.WhiteBalance || null,
      },

      // Ubicación GPS (si está disponible)
      gps:
        exifData.GPSLatitude && exifData.GPSLongitude
          ? {
              latitude: exifData.GPSLatitude,
              longitude: exifData.GPSLongitude,
              altitude: exifData.GPSAltitude || null,
            }
          : null,

      // Otros metadatos
      orientation: exifData.Orientation || null,
      colorSpace: exifData.ColorSpace || null,
    };

    return basicExif;
  } catch (error) {
    console.warn("Error extracting EXIF data:", error);
    return null;
  }
}

/**
 * Convierte la fecha EXIF a formato ISO string
 * @param {Date|string} exifDate - Fecha en formato EXIF
 * @returns {string|null} - Fecha en formato ISO string o null
 */
export function formatExifDate(exifDate) {
  if (!exifDate) return null;

  try {
    // Si ya es un objeto Date
    if (exifDate instanceof Date) {
      return `${exifDate.getFullYear()}-${String(
        exifDate.getMonth() + 1
      ).padStart(2, "0")}-${String(exifDate.getDate()).padStart(
        2,
        "0"
      )} ${String(exifDate.getHours()).padStart(2, "0")}:${String(
        exifDate.getMinutes()
      ).padStart(2, "0")}:${String(exifDate.getSeconds()).padStart(2, "0")}`;
    }

    // Si es una string, limpiar casos problemáticos
    if (typeof exifDate === "string") {
      // EXIF dates are usually in format "YYYY:MM:DD HH:MM:SS"
      let normalizedDate = exifDate.replace(/:/g, "-", 2).replace(/ /, "T");
      // Si tiene offset y Z, elimina la Z y lo que sigue
      normalizedDate = normalizedDate.replace(
        /([+-]\d{2}:\d{2})(\.\d+)?Z$/,
        "$1"
      );
      // Si tiene offset y .000Z, elimina solo la Z
      normalizedDate = normalizedDate.replace(/([+-]\d{2}:\d{2})\.\d+Z$/, "$1");
      // Si tiene solo .000Z, elimina la Z
      normalizedDate = normalizedDate.replace(/(\.\d+)Z$/, "$1");
      // Si tiene ambos, offset y Z, elimina la Z
      normalizedDate = normalizedDate.replace(/([+-]\d{2}:\d{2})Z$/, "$1");
      const date = new Date(normalizedDate);

      if (!isNaN(date.getTime())) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(date.getDate()).padStart(2, "0")} ${String(
          date.getHours()
        ).padStart(2, "0")}:${String(date.getMinutes()).padStart(
          2,
          "0"
        )}:${String(date.getSeconds()).padStart(2, "0")}`;
      }
    }

    return null;
  } catch (error) {
    console.warn("Error formatting EXIF date:", error);
    return null;
  }
}

/**
 * Obtiene un resumen compacto de los datos EXIF para envío al servidor
 * @param {Object} exifData - Datos EXIF completos
 * @returns {Object} - Resumen compacto de EXIF
 */
export function getCompactExifSummary(exifData) {
  if (!exifData) return null;

  const summary = {};

  // Fecha de la toma (dato más importante)
  if (exifData.dateTaken) {
    summary.dateTaken = formatExifDate(exifData.dateTaken);
  }

  // Información básica de la cámara
  if (exifData.camera?.make || exifData.camera?.model) {
    summary.camera = [exifData.camera.make, exifData.camera.model]
      .filter(Boolean)
      .join(" ");
  }

  // Configuración principal (cada uno en su propiedad)
  if (exifData.settings) {
    if (exifData.settings.focalLength) {
      summary.focalLength = exifData.settings.focalLength;
    }
    if (exifData.settings.aperture) {
      summary.aperture = exifData.settings.aperture;
    }
    if (exifData.settings.exposureTime) {
      summary.exposureTime = exifData.settings.exposureTime;
    }
    if (exifData.settings.iso) {
      summary.iso = exifData.settings.iso;
    }
    if (
      exifData.settings.flash !== null &&
      exifData.settings.flash !== undefined
    ) {
      summary.flash = exifData.settings.flash;
    }
    if (exifData.settings.whiteBalance) {
      summary.whiteBalance = exifData.settings.whiteBalance;
    }
  }

  // GPS si está disponible
  if (exifData.gps) {
    summary.hasGps = true;
    summary.gps = {
      lat: exifData.gps.latitude,
      lng: exifData.gps.longitude,
    };
  }

  return Object.keys(summary).length > 0 ? summary : null;
}
