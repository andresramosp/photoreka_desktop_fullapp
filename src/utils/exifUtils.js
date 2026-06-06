// utils/exifUtils.js
import exifr from "exifr";

/**
 * Convierte un valor GPS en formato DMS (grados, minutos, segundos) a grados decimales.
 * Maneja los distintos formatos que pueden devolver exifr y distintas cámaras:
 *   - Número decimal ya convertido: 37.823
 *   - Array DMS: [37, 49, 25.94]
 *   - String decimal: "37.823"
 *   - String DMS: "37, 49, 25.94" / "37 49 25.94"
 * @param {number|number[]|string} value
 * @returns {number|null}
 */
function parseDMSToDecimal(value) {
  if (value === null || value === undefined) return null;

  // Número: ya es decimal (exifr a veces lo convierte automáticamente)
  if (typeof value === "number") {
    return isNaN(value) ? null : value;
  }

  // Array [grados, minutos, segundos] — formato raw más común
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const deg = Number(value[0]) || 0;
    const min = Number(value[1]) || 0;
    const sec = Number(value[2]) || 0;
    const decimal = deg + min / 60 + sec / 3600;
    return isNaN(decimal) ? null : decimal;
  }

  // String: intentar decimal primero, luego DMS separado por comas/espacios
  if (typeof value === "string") {
    const trimmed = value.trim();
    const asNum = Number(trimmed);
    if (!isNaN(asNum)) return asNum;

    const parts = trimmed
      .split(/[\s,;]+/)
      .map((s) => parseFloat(s))
      .filter((n) => !isNaN(n));
    if (parts.length >= 1) {
      const [deg = 0, min = 0, sec = 0] = parts;
      return deg + min / 60 + sec / 3600;
    }
  }

  return null;
}

/**
 * Aplica el signo de hemisferio a un valor de coordenada ya en decimal absoluto.
 * @param {number} value - Valor en grados decimales (siempre positivo tras parseDMSToDecimal)
 * @param {string|undefined} ref - Referencia hemisférica ("N"/"S" para lat, "E"/"W" para lon)
 * @param {"lat"|"lon"} type
 * @returns {number|null}
 */
function applyHemisphereSign(value, ref, type) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const abs = Math.abs(value);
  const normalizedRef = (ref || "").trim().toUpperCase();
  if (type === "lat") {
    return normalizedRef === "S" ? -abs : abs;
  } else {
    return normalizedRef === "W" ? -abs : abs;
  }
}

/**
 * Extrae y normaliza coordenadas GPS de los datos EXIF crudos.
 * Robusto ante los distintos formatos de distintas cámaras y software.
 * @param {Object} exifData - Datos EXIF parseados por exifr
 * @returns {{latitude: number, longitude: number, altitude: number|null}|null}
 */
function parseGpsCoordinates(exifData) {
  const rawLat = parseDMSToDecimal(exifData.GPSLatitude);
  const rawLon = parseDMSToDecimal(exifData.GPSLongitude);

  if (rawLat === null || rawLon === null) return null;

  const latitude = applyHemisphereSign(rawLat, exifData.GPSLatitudeRef, "lat");
  const longitude = applyHemisphereSign(
    rawLon,
    exifData.GPSLongitudeRef,
    "lon",
  );

  if (latitude === null || longitude === null) return null;

  // Altitud: GPSAltitudeRef 0 = sobre el nivel del mar, 1 = bajo el nivel del mar
  let altitude = null;
  const rawAlt =
    exifData.GPSAltitude !== null && exifData.GPSAltitude !== undefined
      ? Number(exifData.GPSAltitude)
      : null;
  if (rawAlt !== null && !isNaN(rawAlt)) {
    altitude = exifData.GPSAltitudeRef === 1 ? -Math.abs(rawAlt) : rawAlt;
  }

  return { latitude, longitude, altitude };
}

/**
 * Extrae datos EXIF básicos de un archivo de imagen
 * @param {File} file - Archivo de imagen
 * @returns {Promise<Object>} - Objeto con datos EXIF básicos
 */
export async function extractBasicExifData(file) {
  try {
    const isPng =
      file.type === "image/png" || file.name?.toLowerCase().endsWith(".png");

    const exifData = isPng
      ? await exifr.parse(file, {
          exif: true,
          xmp: true,
          icc: true,
          iptc: true,
        })
      : await exifr.parse(file, {
          pick: [
            "DateTimeOriginal",
            "DateTime",
            "CreateDate",
            "Make",
            "Model",
            "LensModel",
            "FocalLength",
            "FNumber",
            "ExposureTime",
            "ISO",
            "Flash",
            "WhiteBalance",
            "GPSLatitude",
            "GPSLatitudeRef",
            "GPSLongitude",
            "GPSLongitudeRef",
            "GPSAltitude",
            "GPSAltitudeRef",
            "Orientation",
            "ColorSpace",
          ],
        });

    console.log("RAW EXIF DATA:", exifData);

    if (!exifData || Object.keys(exifData).length === 0) {
      return null;
    }

    const rawDate =
      exifData.DateTimeOriginal ||
      exifData.DateTime ||
      exifData.CreateDate ||
      null;

    let dateTaken = null;

    if (rawDate instanceof Date) {
      dateTaken = rawDate;
    } else if (typeof rawDate === "string") {
      const parsed = new Date(rawDate);
      dateTaken = !isNaN(parsed.getTime()) ? parsed : rawDate;
    }

    const basicExif = {
      dateTaken,

      camera: {
        make: exifData.Make || null,
        model: exifData.Model || null,
        lens: exifData.LensModel || null,
      },

      settings: {
        focalLength: exifData.FocalLength || null,
        aperture: exifData.FNumber || null,
        exposureTime: exifData.ExposureTime || null,
        iso: exifData.ISO || null,
        flash: exifData.Flash || null,
        whiteBalance: exifData.WhiteBalance || null,
      },

      gps: parseGpsCoordinates(exifData),

      orientation: exifData.Orientation || null,
      colorSpace: exifData.ColorSpace || null,
    };

    console.log("Extracted EXIF data:", basicExif);

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
        exifDate.getMonth() + 1,
      ).padStart(2, "0")}-${String(exifDate.getDate()).padStart(
        2,
        "0",
      )} ${String(exifDate.getHours()).padStart(2, "0")}:${String(
        exifDate.getMinutes(),
      ).padStart(2, "0")}:${String(exifDate.getSeconds()).padStart(2, "0")}`;
    }

    // Si es una string, limpiar casos problemáticos
    if (typeof exifDate === "string") {
      // EXIF dates are usually in format "YYYY:MM:DD HH:MM:SS"
      let normalizedDate = exifDate.replace(/:/g, "-", 2).replace(/ /, "T");
      // Si tiene offset y Z, elimina la Z y lo que sigue
      normalizedDate = normalizedDate.replace(
        /([+-]\d{2}:\d{2})(\.\d+)?Z$/,
        "$1",
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
          "0",
        )}-${String(date.getDate()).padStart(2, "0")} ${String(
          date.getHours(),
        ).padStart(2, "0")}:${String(date.getMinutes()).padStart(
          2,
          "0",
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
