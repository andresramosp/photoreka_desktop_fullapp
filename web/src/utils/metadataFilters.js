// utils/metadataFilters.js
//
// Helpers to build dynamic metadata filter options from the photos actually
// present in the library and to test whether a photo matches a set of selected
// metadata filters. All options are derived from real data (no hardcoded
// values), so the UI only ever offers values that exist in the user's photos.
//
// Data sources (do NOT touch the EXIF extractors — only consume what they wrote):
//   - File type  -> extension of `photo.originalFileName` (the ORIGINAL file)
//   - EXIF       -> `photo.descriptions.EXIF` { iso, aperture, focalLength,
//                   exposureTime, camera, whiteBalance, flash }

// File type grouping by original file extension.
const FILE_TYPE_GROUPS = {
  jpeg: { label: "JPEG", exts: ["jpg", "jpeg", "jpe", "jfif"] },
  png: { label: "PNG", exts: ["png"] },
  webp: { label: "WebP", exts: ["webp"] },
  heic: { label: "HEIC", exts: ["heic", "heif"] },
  tiff: { label: "TIFF", exts: ["tif", "tiff"] },
  gif: { label: "GIF", exts: ["gif"] },
  bmp: { label: "BMP", exts: ["bmp"] },
  raw: {
    label: "RAW",
    exts: [
      "raw",
      "nef",
      "cr2",
      "cr3",
      "arw",
      "dng",
      "raf",
      "orf",
      "rw2",
      "pef",
      "srw",
      "sr2",
      "nrw",
      "kdc",
      "dcr",
      "x3f",
      "3fr",
      "mef",
      "iiq",
      "mos",
      "cap",
      "erf",
      "raw2",
      "rwl",
    ],
  },
};

/**
 * Normalized file-type key from an original file name's extension.
 * @param {string|null|undefined} originalFileName
 * @returns {string|null}
 */
export function getFileTypeKey(originalFileName) {
  if (!originalFileName || typeof originalFileName !== "string") return null;
  const match = originalFileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) return null;
  const ext = match[1];
  for (const [key, group] of Object.entries(FILE_TYPE_GROUPS)) {
    if (group.exts.includes(ext)) return key;
  }
  return ext; // unknown extension becomes its own bucket
}

/**
 * Display label for a file-type key.
 * @param {string} key
 * @returns {string}
 */
export function getFileTypeLabel(key) {
  return FILE_TYPE_GROUPS[key]?.label ?? String(key).toUpperCase();
}

/**
 * Normalize the verbose / heterogeneous EXIF flash value into a coarse state.
 * EXIF flash can be a verbose string ("Flash did not fire, compulsory flash
 * mode"), a boolean, or a numeric bitmask (bit 0 = fired).
 * @param {unknown} flash
 * @returns {"fired"|"not_fired"|null}
 */
export function normalizeFlash(flash) {
  if (flash === null || flash === undefined || flash === "") return null;
  if (typeof flash === "boolean") return flash ? "fired" : "not_fired";
  if (typeof flash === "number") return flash % 2 === 1 ? "fired" : "not_fired";

  const s = String(flash).toLowerCase();
  // Check the "not fired" variants first because they also contain "flash".
  if (
    s.includes("did not fire") ||
    s.includes("not fire") ||
    s.includes("no flash") ||
    s === "off"
  ) {
    return "not_fired";
  }
  if (s.includes("fired") || s.includes("flash") || s === "on") {
    return "fired";
  }
  return null;
}

/**
 * Human label for a normalized flash state.
 * @param {"fired"|"not_fired"} value
 * @returns {string}
 */
export function getFlashLabel(value) {
  return value === "fired" ? "Fired" : "Did not fire";
}

/**
 * Format an EXIF exposure time (seconds) into a readable shutter speed.
 * @param {unknown} value
 * @returns {string|null}
 */
export function formatExposureTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1) return `${Number.isInteger(n) ? n : n.toFixed(1)}s`;
  const denominator = Math.round(1 / n);
  return `1/${denominator}s`;
}

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Build the full set of select options from the photos that are present.
 * Each entry is an array of `{ label, value }` and only contains values that
 * actually exist in at least one photo.
 * @param {Array} photos
 */
export function buildMetadataOptions(photos) {
  const fileTypes = new Map(); // key -> label
  const iso = new Set();
  const aperture = new Set();
  const focalLength = new Set();
  const exposure = new Set();
  const camera = new Set();
  const whiteBalance = new Set();
  const flash = new Set();

  for (const photo of photos || []) {
    const ftKey = getFileTypeKey(photo?.originalFileName);
    if (ftKey) fileTypes.set(ftKey, getFileTypeLabel(ftKey));

    const exif = photo?.descriptions?.EXIF || {};

    const isoVal = toNumberOrNull(exif.iso);
    if (isoVal !== null) iso.add(isoVal);

    const apertureVal = toNumberOrNull(exif.aperture);
    if (apertureVal !== null) aperture.add(apertureVal);

    const focalVal = toNumberOrNull(exif.focalLength);
    if (focalVal !== null) focalLength.add(focalVal);

    const exposureVal = toNumberOrNull(exif.exposureTime);
    if (exposureVal !== null && exposureVal > 0) exposure.add(exposureVal);

    if (exif.camera) camera.add(String(exif.camera).trim());
    if (exif.whiteBalance != null && exif.whiteBalance !== "") {
      whiteBalance.add(String(exif.whiteBalance).trim());
    }

    const flashState = normalizeFlash(exif.flash);
    if (flashState) flash.add(flashState);
  }

  const numSorted = (set) => [...set].sort((a, b) => a - b);
  const strSorted = (set) => [...set].sort((a, b) => a.localeCompare(b));

  return {
    fileType: [...fileTypes.entries()]
      .map(([value, label]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    iso: numSorted(iso).map((v) => ({ label: String(v), value: v })),
    aperture: numSorted(aperture).map((v) => ({ label: `f/${v}`, value: v })),
    focalLength: numSorted(focalLength).map((v) => ({
      label: `${v}mm`,
      value: v,
    })),
    exposureTime: numSorted(exposure).map((v) => ({
      label: formatExposureTime(v),
      value: v,
    })),
    camera: strSorted(camera).map((v) => ({ label: v, value: v })),
    whiteBalance: strSorted(whiteBalance).map((v) => ({ label: v, value: v })),
    flash: [...flash].map((v) => ({ label: getFlashLabel(v), value: v })),
  };
}

/**
 * Empty selected-filters object with all categories initialized.
 */
export function createEmptyMetadataFilters() {
  return {
    fileType: [],
    iso: [],
    aperture: [],
    focalLength: [],
    exposureTime: [],
    camera: [],
    whiteBalance: [],
    flash: [],
  };
}

/**
 * Whether a photo matches the selected metadata filters.
 * Logic: AND across categories, OR within a category (multi-select).
 * @param {Object} photo
 * @param {Object} filters
 * @returns {boolean}
 */
export function photoMatchesMetadataFilters(photo, filters) {
  if (!filters) return true;
  const exif = photo?.descriptions?.EXIF || {};

  if (filters.fileType?.length) {
    const key = getFileTypeKey(photo?.originalFileName);
    if (!key || !filters.fileType.includes(key)) return false;
  }
  if (filters.iso?.length) {
    if (!filters.iso.includes(toNumberOrNull(exif.iso))) return false;
  }
  if (filters.aperture?.length) {
    if (!filters.aperture.includes(toNumberOrNull(exif.aperture))) return false;
  }
  if (filters.focalLength?.length) {
    if (!filters.focalLength.includes(toNumberOrNull(exif.focalLength)))
      return false;
  }
  if (filters.exposureTime?.length) {
    if (!filters.exposureTime.includes(toNumberOrNull(exif.exposureTime)))
      return false;
  }
  if (filters.camera?.length) {
    const cam = exif.camera ? String(exif.camera).trim() : null;
    if (!cam || !filters.camera.includes(cam)) return false;
  }
  if (filters.whiteBalance?.length) {
    const wb =
      exif.whiteBalance != null && exif.whiteBalance !== ""
        ? String(exif.whiteBalance).trim()
        : null;
    if (!wb || !filters.whiteBalance.includes(wb)) return false;
  }
  if (filters.flash?.length) {
    const flashState = normalizeFlash(exif.flash);
    if (!flashState || !filters.flash.includes(flashState)) return false;
  }
  return true;
}

/**
 * Count of selected metadata filter values across all categories.
 * @param {Object} filters
 * @returns {number}
 */
export function countActiveMetadataFilters(filters) {
  if (!filters) return 0;
  return Object.values(filters).reduce(
    (total, arr) => total + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
}
