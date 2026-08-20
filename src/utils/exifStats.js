// utils/exifStats.js
//
// Agregados del bloque técnico del EXIF para el reporte (/report → Technical).
//
// El EXIF no tiene una sola forma: los dos caminos de subida escriben cosas
// distintas bajo `descriptions.EXIF`.
//
//   web (utils/exifUtils.js → getCompactExifSummary)
//        → { camera: 'SONY ILCE-7C', lens, iso, aperture, exposureTime, ... }
//   plugin Lightroom (ExifService.lua)
//        → { camera: 'Canon EOS 90D', lens, iso, aperture, exposureTime, ... }
//   ficheros antiguos / crudos
//        → { camera: { make, model, lens }, settings: { iso, aperture, ... } }
//
// Por eso cada campo se lee por una lista de alias ordenada: primero la ruta
// específica y después el nombre plano. Quien lea `exif.iso` a secas se deja
// fuera medio catálogo sin enterarse. Es el mismo criterio que en el backend
// (api/app/utils/exif_fields.ts), y los cortes de ISO y apertura son los mismos
// que usa allí stats_service para que el agente y el reporte cuenten igual.

// ─────────────────────────────────────────────────────────────
// Lectura de campos
// ─────────────────────────────────────────────────────────────

const CAMERA_MODEL_ALIASES = [
  "camera.model",
  "cameraModel",
  "CameraModel",
  "model",
  "Model",
  "camera",
];
const CAMERA_MAKE_ALIASES = [
  "camera.make",
  "cameraMake",
  "CameraMake",
  "make",
  "Make",
];
const LENS_ALIASES = [
  "camera.lens",
  "lens",
  "lensModel",
  "LensModel",
  "lensInfo",
];
const ISO_ALIASES = ["settings.iso", "iso", "ISO"];
const APERTURE_ALIASES = [
  "settings.aperture",
  "aperture",
  "FNumber",
  "fNumber",
];
const EXPOSURE_TIME_ALIASES = [
  "settings.exposureTime",
  "exposureTime",
  "ExposureTime",
  "shutterSpeed",
  "exposure_time",
];
const FOCAL_LENGTH_ALIASES = [
  "settings.focalLength",
  "focalLength",
  "FocalLength",
  "focal_length",
];

/** Lee una ruta con punto, y solo se queda con texto o números. */
function readExifPath(exif, path) {
  if (!exif) return null;

  let value = exif;
  for (const segment of path.split(".")) {
    if (value === null || typeof value !== "object") return null;
    value = value[segment];
  }

  return typeof value === "string" || typeof value === "number" ? value : null;
}

/** Primer alias que resuelve a algo. */
function readExifAlias(exif, aliases) {
  for (const alias of aliases) {
    const value = readExifPath(exif, alias);
    if (value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

/**
 * Acepta 48, "48", "48mm", "48.0 mm", "f/5.6" y racionales como "1/206";
 * cualquier otra cosa devuelve null.
 */
function parseExifNumber(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  const normalized = raw.trim().replace(",", ".");
  const fraction = normalized.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    return denominator !== 0 ? numerator / denominator : null;
  }

  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Un ISO, una apertura o una focal de 0 o menos no existen: son ruido del fichero. */
function readExifNumber(exif, aliases) {
  const value = parseExifNumber(readExifAlias(exif, aliases));
  return value !== null && value > 0 ? value : null;
}

/** El bloque EXIF de una foto, sea cual sea el camino por el que entró. */
export function getPhotoExif(photo) {
  const exif = photo?.descriptions?.EXIF;
  return exif && typeof exif === "object" ? exif : null;
}

// La marca del EXIF suele traer la razón social entera ("NIKON CORPORATION",
// "OLYMPUS IMAGING CORP."). Se recorta para que la comparación con el modelo
// funcione y para que la fila no se lea como un registro mercantil.
const MAKE_SUFFIX = /\s+(?:corporation|corp\.?|company|co\.?|ltd\.?|inc\.?|imaging|electronics|optical|gmbh|s\.a\.?)$/gi;

function normalizeMake(raw) {
  let text = String(raw).trim().replace(/\s+/g, " ");
  let previous;
  do {
    previous = text;
    text = text.replace(MAKE_SUFFIX, "").trim();
  } while (text !== previous && text);
  return text;
}

/**
 * "SONY" + "ILCE-7C" → "SONY ILCE-7C", pero "Canon" + "Canon EOS 90D" no se
 * duplica: hay cuerpos que ya traen la marca dentro del modelo. Y
 * "NIKON CORPORATION" + "NIKON D850" → "NIKON D850", no el trabalenguas.
 */
export function buildCameraLabel(exif) {
  const model = readExifAlias(exif, CAMERA_MODEL_ALIASES);
  if (model === null) return null;

  const modelText = String(model).trim().replace(/\s+/g, " ");
  if (!modelText) return null;

  const make = readExifAlias(exif, CAMERA_MAKE_ALIASES);
  const makeText = make === null ? "" : normalizeMake(make);
  if (!makeText || modelText.toLowerCase().startsWith(makeText.toLowerCase())) {
    return modelText;
  }

  return `${makeText} ${modelText}`;
}

export function readLensLabel(exif) {
  const lens = readExifAlias(exif, LENS_ALIASES);
  if (lens === null) return null;
  const text = String(lens).trim().replace(/\s+/g, " ");
  return text || null;
}

export const readIso = (exif) => readExifNumber(exif, ISO_ALIASES);
export const readAperture = (exif) => readExifNumber(exif, APERTURE_ALIASES);
export const readFocalLength = (exif) =>
  readExifNumber(exif, FOCAL_LENGTH_ALIASES);

/**
 * El tiempo de exposición viene en segundos. Se descartan los disparates
 * (una toma de más de una hora es un campo mal escrito, no una foto).
 */
export function readExposureTime(exif) {
  const value = readExifNumber(exif, EXPOSURE_TIME_ALIASES);
  return value !== null && value <= 3600 ? value : null;
}

// ─────────────────────────────────────────────────────────────
// Marcas: del texto de la cámara al logotipo
// ─────────────────────────────────────────────────────────────

// Ordenado a propósito: los patrones más específicos van antes, porque un
// cuerpo puede citar dos marcas ("NIKON CORPORATION NIKON D750").
const BRAND_MATCHERS = [
  { slug: "canon", label: "Canon", pattern: /\bcanon\b/ },
  { slug: "nikon", label: "Nikon", pattern: /\bnikon\b|\bcoolpix\b/ },
  { slug: "fujifilm", label: "Fujifilm", pattern: /\bfuji(?:film)?\b|\bgfx\b/ },
  { slug: "olympus", label: "Olympus", pattern: /\bolympus\b|\bom[- ]?system\b|\bom[- ]?d\b/ },
  { slug: "leica", label: "Leica", pattern: /\bleica\b/ },
  { slug: "hasselblad", label: "Hasselblad", pattern: /\bhasselblad\b/ },
  { slug: "pentax", label: "Pentax", pattern: /\bpentax\b/ },
  { slug: "ricoh", label: "Ricoh", pattern: /\bricoh\b/ },
  { slug: "panasonic", label: "Panasonic", pattern: /\bpanasonic\b|\blumix\b|\bdmc-|\bdc-g/ },
  { slug: "dji", label: "DJI", pattern: /\bdji\b|\bmavic\b|\bphantom\b/ },
  { slug: "apple", label: "Apple", pattern: /\bapple\b|\biphone\b|\bipad\b/ },
  { slug: "samsung", label: "Samsung", pattern: /\bsamsung\b|\bgalaxy\b|\bsm-[a-z]/ },
  { slug: "google", label: "Google", pattern: /\bgoogle\b|\bpixel\b/ },
  { slug: "xiaomi", label: "Xiaomi", pattern: /\bxiaomi\b|\bredmi\b|\bpoco\b/ },
  { slug: "oneplus", label: "OnePlus", pattern: /\bone\s?plus\b/ },
  // Sony va al final: "SONY" aparece limpio, pero sus modelos (ILCE, DSC, SLT)
  // se cuelan en cadenas de otras marcas con menos frecuencia que al revés.
  { slug: "sony", label: "Sony", pattern: /\bsony\b|\bilce-|\bdsc-|\bslt-|\bnex-/ },
];

/** Marca reconocida a partir del texto de la cámara, o null si no cuadra ninguna. */
export function resolveCameraBrand(cameraLabel) {
  if (!cameraLabel) return null;
  const text = String(cameraLabel).toLowerCase();
  return BRAND_MATCHERS.find(({ pattern }) => pattern.test(text)) || null;
}

// ─────────────────────────────────────────────────────────────
// Cortes de los histogramas
// ─────────────────────────────────────────────────────────────

// `max` es el techo inclusivo del tramo. `tick` es lo que va bajo el eje: el
// nombre largo no cabe en una columna de 50px y recortarlo sería peor que
// resumirlo, así que el rango completo vive en `label` (tooltip y tabla).
// `band` agrupa los tramos en las tres zonas que un fotógrafo reconoce en el
// eje, y es lo único que decide el color de la barra. La altura ya dice cuántas
// fotos hay: repetirla con un degradado no añadiría nada, así que el color se
// gasta en lo que el eje no canta solo — dónde empieza el ruido, dónde se acaba
// la mano alzada, dónde la difracción. Las claves son las mismas en los tres
// histogramas ("low" = extremo izquierdo del eje) para que el color se aprenda
// una vez y valga para los tres.
export const ISO_BUCKETS = [
  { label: "ISO ≤ 100", tick: "100", max: 100, band: "low" },
  { label: "ISO 101–200", tick: "200", max: 200, band: "low" },
  { label: "ISO 201–400", tick: "400", max: 400, band: "low" },
  { label: "ISO 401–800", tick: "800", max: 800, band: "mid" },
  { label: "ISO 801–1600", tick: "1.6k", max: 1600, band: "mid" },
  { label: "ISO 1601–3200", tick: "3.2k", max: 3200, band: "high" },
  { label: "ISO 3201–6400", tick: "6.4k", max: 6400, band: "high" },
  {
    label: "ISO > 6400",
    tick: "6.4k+",
    max: Number.POSITIVE_INFINITY,
    band: "high",
  },
];

export const APERTURE_BUCKETS = [
  { label: "Faster than f/2", tick: "f/2", max: 2, band: "low" },
  { label: "f/2 – f/2.8", tick: "f/2.8", max: 2.8, band: "low" },
  { label: "f/2.8 – f/4", tick: "f/4", max: 4, band: "low" },
  { label: "f/4 – f/5.6", tick: "f/5.6", max: 5.6, band: "mid" },
  { label: "f/5.6 – f/8", tick: "f/8", max: 8, band: "mid" },
  { label: "f/8 – f/11", tick: "f/11", max: 11, band: "high" },
  { label: "f/11 – f/16", tick: "f/16", max: 16, band: "high" },
  {
    label: "Narrower than f/16",
    tick: "f/16+",
    max: Number.POSITIVE_INFINITY,
    band: "high",
  },
];

export const SHUTTER_BUCKETS = [
  { label: "1/2000s or faster", tick: "1/2000", max: 1 / 2000, band: "low" },
  { label: "1/2000s – 1/500s", tick: "1/500", max: 1 / 500, band: "low" },
  { label: "1/500s – 1/125s", tick: "1/125", max: 1 / 125, band: "mid" },
  { label: "1/125s – 1/60s", tick: "1/60", max: 1 / 60, band: "mid" },
  { label: "1/60s – 1/15s", tick: "1/15", max: 1 / 15, band: "high" },
  { label: "1/15s – 1/2s", tick: "1/2", max: 1 / 2, band: "high" },
  { label: "1/2s – 1s", tick: "1s", max: 1, band: "high" },
  {
    label: "Longer than 1s",
    tick: "1s+",
    max: Number.POSITIVE_INFINITY,
    band: "high",
  },
];

// Nombres de las bandas: van en la leyenda y son lo que convierte el color en
// información. Sin ellos serían tres tonos elegidos por gusto. El corte de 1/60s
// es el límite clásico de la mano alzada y el de f/8 el punto donde la
// difracción empieza a notarse; ninguno es un juicio sobre la foto.
export const ISO_BANDS = [
  { key: "low", label: "Base" },
  { key: "mid", label: "Everyday" },
  { key: "high", label: "Low light" },
];

export const SHUTTER_BANDS = [
  { key: "low", label: "Freezes motion" },
  { key: "mid", label: "Handheld" },
  { key: "high", label: "Needs support" },
];

export const APERTURE_BANDS = [
  { key: "low", label: "Shallow depth" },
  { key: "mid", label: "Sweet spot" },
  { key: "high", label: "Deep field" },
];

// Cinco clases y no ocho: el donut solo se lee de un vistazo con pocos gajos, y
// el corte fino de focales ya lo da el backend. OJO: son las focales tal cual
// las escribe la cámara, sin equivalencia a 35mm — en un cuerpo APS-C o micro
// 4/3 el encuadre real es más cerrado que el que sugiere la clase.
export const FOCAL_CLASSES = [
  { label: "Ultra-wide", hint: "≤ 24mm", max: 24 },
  { label: "Wide", hint: "24–35mm", max: 35 },
  { label: "Normal", hint: "35–70mm", max: 70 },
  { label: "Telephoto", hint: "70–200mm", max: 200 },
  { label: "Super-tele", hint: "> 200mm", max: Number.POSITIVE_INFINITY },
];

const asPercentage = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

function computeMedian(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return Math.round(value * 10000) / 10000;
}

/**
 * Reparte valores en tramos. Los tramos vacíos se quedan: en un histograma el
 * hueco es información (nadie dispara a ISO 6400) y quitarlo rompe el eje.
 */
function bucketize(values, buckets) {
  const counts = buckets.map(() => 0);

  for (const value of values) {
    const index = buckets.findIndex((bucket) => value <= bucket.max);
    counts[index === -1 ? buckets.length - 1 : index] += 1;
  }

  return buckets.map((bucket, index) => ({
    label: bucket.label,
    tick: bucket.tick ?? bucket.label,
    hint: bucket.hint ?? null,
    band: bucket.band ?? null,
    count: counts[index],
    percentage: asPercentage(counts[index], values.length),
  }));
}

function buildNumericStat(values, totalPhotos, buckets) {
  const sorted = [...values].sort((a, b) => a - b);

  return {
    photosWithData: values.length,
    coverage: asPercentage(values.length, totalPhotos),
    min: sorted.length ? sorted[0] : null,
    max: sorted.length ? sorted[sorted.length - 1] : null,
    median: computeMedian(sorted),
    buckets: bucketize(values, buckets),
  };
}

/** Ranking de valores de texto con cola agrupada en "Other". */
function buildRanking(counts, totalWithData, limit) {
  const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
  const listed = ranked.slice(0, limit).map((entry) => ({
    ...entry,
    percentage: asPercentage(entry.count, totalWithData),
  }));

  const tail = ranked.slice(limit);
  if (tail.length > 0) {
    const tailCount = tail.reduce((sum, entry) => sum + entry.count, 0);
    listed.push({
      label: `Other (${tail.length} more)`,
      brand: null,
      count: tailCount,
      percentage: asPercentage(tailCount, totalWithData),
      isOther: true,
    });
  }

  return listed;
}

// ─────────────────────────────────────────────────────────────
// Agregado principal
// ─────────────────────────────────────────────────────────────

const MAX_CAMERA_ROWS = 10;
const MAX_LENS_ROWS = 8;

/**
 * Recorre el catálogo una sola vez y devuelve todo lo que pinta la sección
 * técnica del reporte.
 *
 * @param {Array} photos
 * @returns {{
 *   totalPhotos: number,
 *   photosWithExif: number,
 *   exifCoverage: number,
 *   cameras: { photosWithData: number, coverage: number, distinct: number, ranking: Array },
 *   lenses: { photosWithData: number, coverage: number, distinct: number, ranking: Array },
 *   focalClasses: { photosWithData: number, coverage: number, median: number|null, segments: Array },
 *   iso: Object, aperture: Object, shutter: Object,
 * }}
 */
export function buildTechnicalStats(photos = []) {
  const list = Array.isArray(photos) ? photos : [];
  const totalPhotos = list.length;

  // Se agrupa por nombre normalizado pero se enseña el original: el mismo
  // cuerpo aparece como "ILCE-7C" y "ILCE-7C " según quién escribiera el EXIF.
  const cameraCounts = new Map();
  const lensCounts = new Map();
  const isoValues = [];
  const apertureValues = [];
  const exposureValues = [];
  const focalValues = [];
  let photosWithExif = 0;

  for (const photo of list) {
    const exif = getPhotoExif(photo);
    if (!exif) continue;
    photosWithExif += 1;

    const camera = buildCameraLabel(exif);
    if (camera) {
      const key = camera.toLowerCase();
      const entry = cameraCounts.get(key);
      if (entry) entry.count += 1;
      else
        cameraCounts.set(key, {
          label: camera,
          brand: resolveCameraBrand(camera),
          count: 1,
        });
    }

    const lens = readLensLabel(exif);
    if (lens) {
      const key = lens.toLowerCase();
      const entry = lensCounts.get(key);
      if (entry) entry.count += 1;
      else lensCounts.set(key, { label: lens, brand: null, count: 1 });
    }

    const iso = readIso(exif);
    if (iso !== null) isoValues.push(iso);

    const aperture = readAperture(exif);
    if (aperture !== null) apertureValues.push(aperture);

    const exposure = readExposureTime(exif);
    if (exposure !== null) exposureValues.push(exposure);

    const focal = readFocalLength(exif);
    if (focal !== null) focalValues.push(focal);
  }

  const photosWithCamera = [...cameraCounts.values()].reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  const photosWithLens = [...lensCounts.values()].reduce(
    (sum, entry) => sum + entry.count,
    0,
  );

  const focalStat = buildNumericStat(focalValues, totalPhotos, FOCAL_CLASSES);

  return {
    totalPhotos,
    photosWithExif,
    exifCoverage: asPercentage(photosWithExif, totalPhotos),

    cameras: {
      photosWithData: photosWithCamera,
      coverage: asPercentage(photosWithCamera, totalPhotos),
      distinct: cameraCounts.size,
      ranking: buildRanking(cameraCounts, photosWithCamera, MAX_CAMERA_ROWS),
    },

    lenses: {
      photosWithData: photosWithLens,
      coverage: asPercentage(photosWithLens, totalPhotos),
      distinct: lensCounts.size,
      ranking: buildRanking(lensCounts, photosWithLens, MAX_LENS_ROWS),
    },

    focalClasses: {
      photosWithData: focalStat.photosWithData,
      coverage: focalStat.coverage,
      median: focalStat.median,
      segments: focalStat.buckets,
    },

    iso: buildNumericStat(isoValues, totalPhotos, ISO_BUCKETS),
    aperture: buildNumericStat(apertureValues, totalPhotos, APERTURE_BUCKETS),
    shutter: buildNumericStat(exposureValues, totalPhotos, SHUTTER_BUCKETS),
  };
}

// ─────────────────────────────────────────────────────────────
// Formato
// ─────────────────────────────────────────────────────────────

/** 0.008 → "1/125s"; 2 → "2s". */
export function formatShutterSpeed(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds >= 1) {
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
  }
  return `1/${Math.round(1 / seconds)}s`;
}

export const formatAperture = (value) =>
  Number.isFinite(value) ? `f/${Math.round(value * 10) / 10}` : null;

export const formatFocalLength = (value) =>
  Number.isFinite(value) ? `${Math.round(value)}mm` : null;

export const formatIso = (value) =>
  Number.isFinite(value) ? `ISO ${Math.round(value)}` : null;
