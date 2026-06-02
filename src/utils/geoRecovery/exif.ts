/**
 * EXIF utilities for the geo-recovery flow.
 *
 *   readTakenAtMs(file)    → EXIF DateTimeOriginal in ms (or null)
 *   injectGpsIntoJpeg(...) → uses `piexifjs` to write GPS tags
 *   injectGpsIntoPng(...)  → writes an `eXIf` chunk by hand
 */

// `piexifjs` ships untyped; declare a minimal interface inline.
// @ts-expect-error untyped CommonJS module
import piexif from "piexifjs";
import heic2any from "heic2any";
import exifr from "exifr";

// ── Reading ─────────────────────────────────────────────────────────────────

export async function readTakenAtMs(file: File): Promise<number | null> {
  try {
    const parsed = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
    const value: Date | string | undefined =
      parsed?.DateTimeOriginal ?? parsed?.CreateDate;
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    const ms = date.getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

// ── GPS injection: JPEG ────────────────────────────────────────────────────

function toRational(value: number): [number, number] {
  // Convert a float to a [numerator, denominator] pair with millisecond-level
  // precision (1e6 denominator). EXIF GPS tags expect arrays of rationals.
  const denom = 1_000_000;
  return [Math.round(value * denom), denom];
}

function decimalToDms(
  value: number,
): [[number, number], [number, number], [number, number]] {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return [[deg, 1], [min, 1], toRational(sec)];
}

function blobToBinaryString(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsBinaryString(blob);
  });
}

function binaryStringToBlob(binary: string, mime: string): Blob {
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: mime });
}

export async function injectGpsIntoJpeg(
  jpegBlob: Blob,
  lat: number,
  lng: number,
): Promise<Blob> {
  const binary = await blobToBinaryString(jpegBlob);
  const dataUri = `data:image/jpeg;base64,${btoa(binary)}`;

  let exifObj: any;
  try {
    exifObj = piexif.load(dataUri);
  } catch {
    exifObj = {
      "0th": {},
      Exif: {},
      GPS: {},
      Interop: {},
      "1st": {},
      thumbnail: null,
    };
  }

  const gps: Record<number, unknown> = {};
  gps[piexif.GPSIFD.GPSLatitudeRef] = lat >= 0 ? "N" : "S";
  gps[piexif.GPSIFD.GPSLatitude] = decimalToDms(lat);
  gps[piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
  gps[piexif.GPSIFD.GPSLongitude] = decimalToDms(lng);
  exifObj.GPS = gps;

  const exifBytes = piexif.dump(exifObj);
  const newDataUri = piexif.insert(exifBytes, dataUri);
  const newBinary = atob(newDataUri.split(",")[1]);
  return binaryStringToBlob(newBinary, "image/jpeg");
}

// ── GPS injection: PNG (custom eXIf chunk) ─────────────────────────────────

/**
 * Build a minimal TIFF/EXIF block (little-endian) containing only GPS IFD.
 * Layout:
 *   - TIFF header (II*\0, IFD0 offset = 8)
 *   - IFD0: 1 entry pointing to GPS IFD, then next-IFD = 0
 *   - GPS IFD: 4 entries (lat ref, lat, lng ref, lng), then next = 0
 *   - external data area: lat (3 rationals = 24 bytes) + lng (3 rationals = 24 bytes)
 */
function buildExifGpsTiff(lat: number, lng: number): Uint8Array {
  const RATIONAL = 5;
  const ASCII = 2;
  const LONG = 4;

  function rationalsBytes(values: Array<[number, number]>): Uint8Array {
    const buf = new Uint8Array(values.length * 8);
    const dv = new DataView(buf.buffer);
    values.forEach(([num, den], i) => {
      dv.setUint32(i * 8, num, true);
      dv.setUint32(i * 8 + 4, den, true);
    });
    return buf;
  }

  const latRef = lat >= 0 ? "N" : "S";
  const lngRef = lng >= 0 ? "E" : "W";
  const latRationals = decimalToDms(lat);
  const lngRationals = decimalToDms(lng);

  // Fixed-size segments
  const HEADER = 8; // TIFF header
  const IFD0_SIZE = 2 + 12 + 4; // count(2) + 1 entry(12) + next(4)
  const GPS_IFD_COUNT = 4;
  const GPS_IFD_SIZE = 2 + GPS_IFD_COUNT * 12 + 4;

  const dataStart = HEADER + IFD0_SIZE + GPS_IFD_SIZE;
  const latOffset = dataStart;
  const lngOffset = latOffset + 24;
  const totalSize = lngOffset + 24;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // TIFF header (little-endian)
  view.setUint8(0, 0x49); // 'I'
  view.setUint8(1, 0x49); // 'I'
  view.setUint16(2, 0x002a, true);
  view.setUint32(4, HEADER, true); // IFD0 offset

  // IFD0: 1 entry — tag 0x8825 (GPS IFD pointer)
  let p = HEADER;
  view.setUint16(p, 1, true); // num entries
  p += 2;
  view.setUint16(p, 0x8825, true); // tag
  view.setUint16(p + 2, LONG, true); // type
  view.setUint32(p + 4, 1, true); // count
  view.setUint32(p + 8, HEADER + IFD0_SIZE, true); // value = offset to GPS IFD
  p += 12;
  view.setUint32(p, 0, true); // next IFD = 0
  p += 4;

  // GPS IFD: 4 entries
  view.setUint16(p, GPS_IFD_COUNT, true);
  p += 2;

  // 1 — GPSLatitudeRef (ASCII, count=2: "N\0" or "S\0")
  view.setUint16(p, 0x0001, true);
  view.setUint16(p + 2, ASCII, true);
  view.setUint32(p + 4, 2, true);
  u8[p + 8] = latRef.charCodeAt(0);
  u8[p + 9] = 0;
  // bytes 10..11 already zero
  p += 12;

  // 2 — GPSLatitude (RATIONAL, count=3, offset → latOffset)
  view.setUint16(p, 0x0002, true);
  view.setUint16(p + 2, RATIONAL, true);
  view.setUint32(p + 4, 3, true);
  view.setUint32(p + 8, latOffset, true);
  p += 12;

  // 3 — GPSLongitudeRef
  view.setUint16(p, 0x0003, true);
  view.setUint16(p + 2, ASCII, true);
  view.setUint32(p + 4, 2, true);
  u8[p + 8] = lngRef.charCodeAt(0);
  u8[p + 9] = 0;
  p += 12;

  // 4 — GPSLongitude
  view.setUint16(p, 0x0004, true);
  view.setUint16(p + 2, RATIONAL, true);
  view.setUint32(p + 4, 3, true);
  view.setUint32(p + 8, lngOffset, true);
  p += 12;

  view.setUint32(p, 0, true); // next IFD
  p += 4;

  // External rational data
  u8.set(rationalsBytes(latRationals), latOffset);
  u8.set(rationalsBytes(lngRationals), lngOffset);

  return u8;
}

// CRC32 for PNG chunks
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function injectGpsIntoPng(
  pngBlob: Blob,
  lat: number,
  lng: number,
): Promise<Blob> {
  const buf = new Uint8Array(await pngBlob.arrayBuffer());

  // PNG signature is 8 bytes; chunks follow: [length(4)][type(4)][data][crc(4)]
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
    throw new Error("Invalid PNG");
  }

  // Find insertion point: right after IHDR (always the first chunk), before
  // any other chunk. This is the standard, broadly-compatible location for
  // ancillary chunks like eXIf.
  const PNG_SIG_LEN = 8;
  const ihdrLength = new DataView(
    buf.buffer,
    buf.byteOffset,
    buf.byteLength,
  ).getUint32(PNG_SIG_LEN, false);
  const ihdrEnd = PNG_SIG_LEN + 4 + 4 + ihdrLength + 4; // length + type + data + crc

  // Strip any existing eXIf chunk before inserting the new one.
  const filtered: Uint8Array[] = [buf.subarray(0, ihdrEnd)];
  let cursor = ihdrEnd;
  while (cursor < buf.length) {
    const dv = new DataView(buf.buffer, buf.byteOffset + cursor, 8);
    const len = dv.getUint32(0, false);
    const type = String.fromCharCode(
      buf[cursor + 4],
      buf[cursor + 5],
      buf[cursor + 6],
      buf[cursor + 7],
    );
    const chunkEnd = cursor + 4 + 4 + len + 4;
    if (type !== "eXIf") {
      filtered.push(buf.subarray(cursor, chunkEnd));
    }
    cursor = chunkEnd;
    if (type === "IEND") break;
  }

  const tiff = buildExifGpsTiff(lat, lng);
  const exifChunk = new Uint8Array(4 + 4 + tiff.length + 4);
  const dvChunk = new DataView(exifChunk.buffer);
  dvChunk.setUint32(0, tiff.length, false);
  exifChunk[4] = 0x65; // 'e'
  exifChunk[5] = 0x58; // 'X'
  exifChunk[6] = 0x49; // 'I'
  exifChunk[7] = 0x66; // 'f'
  exifChunk.set(tiff, 8);
  const crcInput = new Uint8Array(4 + tiff.length);
  crcInput.set(exifChunk.subarray(4, 8 + tiff.length), 0);
  dvChunk.setUint32(8 + tiff.length, crc32(crcInput), false);

  // Splice the chunk just after IHDR.
  const ihdrAndChunk = new Uint8Array(filtered[0].length + exifChunk.length);
  ihdrAndChunk.set(filtered[0], 0);
  ihdrAndChunk.set(exifChunk, filtered[0].length);
  filtered[0] = ihdrAndChunk;

  return new Blob(filtered, { type: "image/png" });
}

// ── EXIF copy (JPEG only) ──────────────────────────────────────────────────

/**
 * Copy the complete EXIF block from `source` JPEG into `target` JPEG.
 * Used to restore EXIF after a canvas round-trip (which strips all metadata).
 */
export async function copyJpegExif(source: Blob, target: Blob): Promise<Blob> {
  const srcBinary = await blobToBinaryString(source);
  const srcDataUri = `data:image/jpeg;base64,${btoa(srcBinary)}`;
  let exifObj: any;
  try {
    exifObj = piexif.load(srcDataUri);
  } catch {
    // No EXIF in source – return target unchanged
    return target;
  }
  const tgtBinary = await blobToBinaryString(target);
  const tgtDataUri = `data:image/jpeg;base64,${btoa(tgtBinary)}`;
  const exifBytes = piexif.dump(exifObj);
  const newDataUri = piexif.insert(exifBytes, tgtDataUri);
  const newBinary = atob(newDataUri.split(",")[1]);
  return binaryStringToBlob(newBinary, "image/jpeg");
}

// ── High-level dispatch ────────────────────────────────────────────────────

// ── HEIC / WebP → JPEG helpers ────────────────────────────────────────────

/**
 * Convert a HEIC/HEIF blob to JPEG using heic2any.
 * Exported so upload.ts and GeoRecoveryView.vue can re-use it.
 */
export async function convertHeicToJpeg(blob: Blob): Promise<Blob> {
  const result = await heic2any({ blob, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(result) ? result[0] : (result as Blob);
}

/**
 * Convert a WebP blob to JPEG via an off-screen canvas.
 * WebP EXIF injection requires RIFF chunk manipulation; converting to JPEG
 * is simpler and universally supported.
 */
async function convertWebpToJpeg(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error("WebP→JPEG canvas conversion failed"));
        },
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load WebP image for conversion"));
    };
    img.src = url;
  });
}

export async function injectGps(
  original: Blob,
  originalMime: string,
  lat: number,
  lng: number,
): Promise<Blob> {
  if (originalMime === "image/png") {
    return injectGpsIntoPng(original, lat, lng);
  }
  // HEIC/HEIF: convert to JPEG first (no browser API for writing HEIC)
  if (originalMime === "image/heic" || originalMime === "image/heif") {
    const jpeg = await convertHeicToJpeg(original);
    return injectGpsIntoJpeg(jpeg, lat, lng);
  }
  // WebP: convert to JPEG (WebP RIFF EXIF chunk injection is non-trivial)
  if (originalMime === "image/webp") {
    const jpeg = await convertWebpToJpeg(original);
    return injectGpsIntoJpeg(jpeg, lat, lng);
  }
  // JPEG (and anything else we treat as JPEG-compatible)
  return injectGpsIntoJpeg(original, lat, lng);
}
