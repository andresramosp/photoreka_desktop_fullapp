// utils/mockExif.js
//
// EXIF inventado para las cuentas demo cuyo catálogo son imágenes generadas y
// por tanto llega sin metadatos. Sin esto, esas cuentas pierden el timeline y
// los filtros por cámara, objetivo, focal y apertura: la mitad de lo que hay
// que enseñar en una demo.
//
// Tres cosas que no son negociables aquí:
//
// 1. Determinismo. El fichero se parsea dos veces por importación (el aviso de
//    "faltan metadatos" analiza una muestra antes de subir nada, y luego la
//    subida vuelve a leerlo), así que los valores salen de una semilla derivada
//    del nombre y el tamaño del archivo. La misma foto da siempre lo mismo,
//    también si se reimporta meses después.
//
// 2. Aperturas de la banda segura. El analyzer deriva
//    `visual_aspects.depth_of_field` de la apertura y la focal del EXIF —
//    api/app/models/analyzer/metadataTask.ts, detectDepthOfFieldFromExif — así
//    que una apertura inventada acaba siendo una etiqueta visual que el usuario
//    filtra y contrasta con la foto. Un retrato con bokeh marcado como `deep`
//    canta. Nos quedamos en las combinaciones que esa función resuelve como
//    `medium`, que es lo único que no contradice a ninguna imagen:
//      focal 24–84 mm → f/4.5, f/5, f/5.6
//      focal 85–200 mm → f/6.3   (a f/5.6 y focal ≥85 ya devuelve `shallow`)
//    Quien toque los umbrales de aquel archivo tiene que revisar esta banda: no
//    hay test que las mantenga atadas, el front no tiene runner.
//
// 3. Sesiones, no fotos sueltas. Las fotos se reparten en sesiones que comparten
//    día, equipo y condición de luz. Trescientas fechas al azar se ven falsas en
//    el timeline en cuanto lo abres; un puñado de jornadas de trabajo, no.

// ── Semilla determinista ──────────────────────────────────────────────────────

/** FNV-1a de 32 bits: barato y con buena dispersión para nombres parecidos. */
function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** PRNG mulberry32: mismo seed, misma secuencia, en cualquier navegador. */
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length) % list.length];
const between = (random, min, max) => min + random() * (max - min);
const intBetween = (random, min, max) => Math.floor(between(random, min, max + 1));

// ── Equipo ────────────────────────────────────────────────────────────────────

/**
 * Cuerpos y objetivos de trabajo comercial. `focalRange` es el rango que se usa
 * de verdad, no el del objetivo: del 70-200 solo tomamos hasta 200 y del 24-70
 * hasta 70, y la apertura se elige después según dónde caiga la focal.
 * `make`/`model` van escritos como los graba cada marca.
 */
const KITS = [
  {
    make: "Canon",
    model: "Canon EOS R5",
    lens: "RF24-70mm F2.8 L IS USM",
    focalRange: [24, 70],
  },
  {
    make: "Canon",
    model: "Canon EOS R5",
    lens: "RF70-200mm F2.8 L IS USM",
    focalRange: [85, 200],
  },
  {
    make: "Canon",
    model: "Canon EOS R6m2",
    lens: "RF35mm F1.8 MACRO IS STM",
    focalRange: [35, 35],
  },
  {
    make: "SONY",
    model: "ILCE-7RM5",
    lens: "FE 24-70mm F2.8 GM II",
    focalRange: [24, 70],
  },
  {
    make: "SONY",
    model: "ILCE-7RM5",
    lens: "FE 90mm F2.8 Macro G OSS",
    focalRange: [90, 90],
  },
  {
    make: "NIKON CORPORATION",
    model: "NIKON Z 7_2",
    lens: "NIKKOR Z 24-70mm f/2.8 S",
    focalRange: [24, 70],
  },
  {
    make: "FUJIFILM",
    model: "GFX100S",
    lens: "GF45-100mmF4 R LM OIS WR",
    focalRange: [45, 100],
  },
];

/** Focales "de catálogo": nadie dispara un zoom a 53 mm y lo apunta así. */
const FOCAL_STOPS = [24, 28, 35, 40, 50, 70, 85, 90, 100, 105, 135, 200];

/** Aperturas seguras a cada lado del corte de focal (ver cabecera, punto 2). */
const SHORT_APERTURES = [4.5, 5, 5.6];
const LONG_APERTURES = [6.3];
const LONG_FOCAL_THRESHOLD = 85;

// ── Condiciones de luz ────────────────────────────────────────────────────────

/**
 * La apertura ya viene fijada por la banda segura, así que cada condición ajusta
 * ISO y velocidad para que la exposición cuadre con ella: flash de estudio a
 * ISO base, exterior de día a velocidad alta, interior con ISO subido.
 */
const LIGHTING = [
  {
    id: "studio-strobe",
    iso: [100, 200],
    shutters: [1 / 125, 1 / 160, 1 / 200],
    flash: "Flash fired, compulsory flash mode",
    whiteBalance: "Manual",
    hours: [10, 18],
  },
  {
    id: "daylight-exterior",
    iso: [100, 200],
    shutters: [1 / 640, 1 / 800, 1 / 1000],
    flash: "Flash did not fire",
    whiteBalance: "Auto",
    hours: [9, 18],
  },
  {
    id: "overcast-exterior",
    iso: [200, 400],
    shutters: [1 / 200, 1 / 250, 1 / 320],
    flash: "Flash did not fire",
    whiteBalance: "Auto",
    hours: [9, 19],
  },
  {
    id: "interior-ambient",
    iso: [400, 800, 1600],
    shutters: [1 / 60, 1 / 80, 1 / 125],
    flash: "Flash did not fire",
    whiteBalance: "Auto",
    hours: [10, 20],
  },
];

// ── Sesiones ──────────────────────────────────────────────────────────────────

/** Jornadas distintas en las que se reparte el catálogo. */
const SESSION_COUNT = 24;

/**
 * Fin del calendario inventado, fijo a propósito: si se calculara desde la fecha
 * de hoy, la misma foto cambiaría de fecha según el día en que se importe.
 */
const CALENDAR_END = Date.UTC(2026, 5, 30);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días entre sesiones; ~un par de encargos al mes hacia atrás. */
const SESSION_SPACING_DAYS = 15;

/**
 * Todo lo que comparten las fotos de una misma jornada. Se deriva solo del
 * índice de sesión, así que dos fotos de la misma sesión coinciden en equipo,
 * luz y día aunque se importen por separado.
 */
function buildSession(index) {
  const random = createRandom(hashString(`photoreka-session-${index}`));

  // Equipo y luz se reparten en ciclo, no al azar: sorteándolos, con solo dos
  // docenas de sesiones era normal que algún cuerpo no saliera nunca y su marca
  // faltara de los filtros. El desfase de 3 en la luz —coprimo con el número de
  // condiciones— evita que cada cámara arrastre siempre la misma iluminación.
  const kit = KITS[index % KITS.length];
  const lighting = LIGHTING[(index * 3 + 1) % LIGHTING.length];

  const daysBack = index * SESSION_SPACING_DAYS + intBetween(random, 0, 6);
  const startHour = intBetween(random, lighting.hours[0], lighting.hours[1] - 2);

  return {
    kit,
    lighting,
    dayStart: CALENDAR_END - daysBack * DAY_MS,
    startHour,
    startMinute: intBetween(random, 0, 59),
  };
}

const SESSIONS = Array.from({ length: SESSION_COUNT }, (_, i) => buildSession(i));

// ── Generación ────────────────────────────────────────────────────────────────

/** Focal del catálogo que cae dentro del rango que ese objetivo cubre. */
function pickFocalLength(random, [min, max]) {
  const available = FOCAL_STOPS.filter((f) => f >= min && f <= max);
  return available.length > 0 ? pick(random, available) : min;
}

/** La apertura depende de la focal: ver el punto 2 de la cabecera. */
function pickAperture(random, focalLength) {
  return focalLength >= LONG_FOCAL_THRESHOLD
    ? pick(random, LONG_APERTURES)
    : pick(random, SHORT_APERTURES);
}

/**
 * Genera un EXIF completo y plausible para un archivo, de forma determinista.
 * Sin GPS: inventar coordenadas para imágenes generadas pondría chinchetas
 * falsas en el mapa, y ahí no hay nada que la foto pueda respaldar.
 *
 * @param {{name?: string, size?: number}} file
 * @returns {{dateTaken: Date, camera: {make: string, model: string, lens: string},
 *   settings: {focalLength: number, aperture: number, exposureTime: number,
 *   iso: number, flash: string, whiteBalance: string}, gps: null,
 *   orientation: null, colorSpace: null}}
 */
export function buildMockExif(file) {
  const fingerprint = `${file?.name || "unnamed"}|${file?.size || 0}`;
  const seed = hashString(fingerprint);
  const random = createRandom(seed);

  const session = SESSIONS[seed % SESSIONS.length];
  const { kit, lighting } = session;

  const focalLength = pickFocalLength(random, kit.focalRange);
  const aperture = pickAperture(random, focalLength);

  // Repartidas dentro de la jornada: hasta tres horas desde que empieza.
  const minutesIn = intBetween(random, 0, 179);
  const dateTaken = new Date(
    session.dayStart +
      (session.startHour * 60 + session.startMinute + minutesIn) * 60 * 1000 +
      intBetween(random, 0, 59) * 1000,
  );

  return {
    dateTaken,
    camera: {
      make: kit.make,
      model: kit.model,
      lens: kit.lens,
    },
    settings: {
      focalLength,
      aperture,
      exposureTime: pick(random, lighting.shutters),
      iso: pick(random, lighting.iso),
      flash: lighting.flash,
      whiteBalance: lighting.whiteBalance,
    },
    gps: null,
    orientation: null,
    colorSpace: null,
  };
}

/**
 * Rellena lo que falte de un EXIF real con valores inventados. Solo rellena: si
 * la foto trae fecha o cámara de verdad, esos ganan. Los ajustes se completan en
 * bloque —focal y apertura tienen que venir del mismo disparo para que la
 * profundidad de campo que deduce el analyzer sea la que corresponde.
 *
 * @param {Object|null} basicExif - Salida de `extractBasicExifData`
 * @param {{name?: string, size?: number}} file
 * @returns {Object} EXIF con los huecos cubiertos
 */
export function fillMissingExif(basicExif, file) {
  const mock = buildMockExif(file);

  if (!basicExif) return mock;

  const camera = basicExif.camera || {};
  const settings = basicExif.settings || {};
  const hasCamera = Boolean(camera.make || camera.model);
  const hasSettings = Boolean(
    settings.focalLength || settings.aperture || settings.exposureTime || settings.iso,
  );

  return {
    ...basicExif,
    dateTaken: basicExif.dateTaken || mock.dateTaken,
    camera: hasCamera ? camera : mock.camera,
    settings: hasSettings ? settings : mock.settings,
  };
}
