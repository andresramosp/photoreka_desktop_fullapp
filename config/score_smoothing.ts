// ══════════════════════════════════════════════════════════════
// SCORE SMOOTHING — configuración del regularizador de scores.
//
// Corrige la inconsistencia del LLM entre fotos casi idénticas: dos
// fotogramas de la misma toma no deberían recibir puntuaciones muy
// distintas solo por haber caído en lotes diferentes.
//
// Todo se expresa en PUNTOS DE LA BARRA (escala 1-10), no en parámetros
// abstractos, para que los límites sean promesas verificables.
//
// ── Las cuatro capas por las que pasa una pareja de fotos ─────
//
//   1. VECINDAD          ¿se parecen? → simThreshold / dhashThreshold
//                        CLIP, dhash o ambos. Es lo único que PROPONE parejas.
//
//   2. VETOS DE TOMA     ¿pueden ser la misma toma? → utils/score_smoothing_metadata
//                        Fecha fuera de ventana, focal distinta, cuerpo u óptica
//                        distintos → se corta la arista y no agrupan.
//                        Cada señal solo VETA; ausente = no opina, decide la capa 1.
//
//   3. AGRUPADO          buildCliques: dentro del grupo todas son vecinas de todas.
//
//   4. PERFIL DEL GRUPO  ¿cuánto se puede corregir? Solo hay tres:
//
//                          duplicate → dHash a 0 + mismo dateTaken + mismo histograma
//                          version   → igual, pero histograma distinto
//                          default   → todo lo demás
//
//                        Los dos primeros afirman algo sobre la procedencia del
//                        archivo, así que exigen PRUEBA: sin dateTaken en las dos
//                        fotos no se sube de `default`, por parecidas que sean.
//
// Solo tres cosas se calibran por criterio:
//   · diferencia permitida (`tol`)   → cuánta variedad sobrevive en el grupo
//   · máximo paso (`maxShift`)       → cuánto puede alejarse del original
//   · y ambas, por modo: `duplicate`, `default` o `version`
// ══════════════════════════════════════════════════════════════

/**
 * Cómo se decide que dos fotos son "la misma toma":
 *  - `clip`  : similitud semántica del embedding. Aguanta reencuadres y movimiento
 *              de cámara; puede juntar de más (dos productos sobre el mismo fondo).
 *  - `dhash` : huella perceptual de píxeles. No se deja engañar por fondos iguales;
 *              se le escapan las ráfagas donde la cámara se movió. Mucho más rápido.
 *  - `both`  : solo agrupa si los dos métodos están de acuerdo. El más conservador.
 */
export type NeighborStrategy = 'clip' | 'dhash' | 'both'

/**
 * Perfil de un criterio, todos los números en puntos de la barra. Cada ajuste tiene
 * un valor por modo, de más a menos agresivo:
 *
 *  - `duplicate`: el MISMO archivo dos veces. Nada las distingue —misma captura,
 *                 mismo revelado, misma huella— así que el LLM no tenía base alguna
 *                 para puntuarlas distinto. Toda diferencia es ruido: se colapsan.
 *  - `default`  : dos fotogramas de una ráfaga, o una pareja sin EXIF que corrobore
 *                 nada. Casi todo es ruido, pero algo puede ser real (un gesto, un
 *                 parpadeo), así que sobrevive un poco.
 *  - `version`  : misma captura, revelado distinto (blanco y negro, viraje,
 *                 desaturado). Ahí la diferencia PUEDE ser intencionada y estar bien
 *                 puesta, así que solo se mata la incoherencia gruesa.
 *
 * Lo que hace cada número:
 *
 *  - `tol` (diferencia permitida): hace dos trabajos con el mismo valor. Si la foto
 *    ya está a menos de `tol` de la mediana del grupo, NO se toca. Si está más
 *    lejos, se mueve solo hasta quedar a esa distancia — no hasta la mediana.
 *    En la práctica es cuánta variedad sobrevive dentro de un grupo: al terminar,
 *    todas quedan como mucho a `tol` de la mediana. Con `tol: 0` acaban iguales.
 *
 *  - `maxShift` (máximo paso): tope duro de desplazamiento respecto al valor
 *    original del LLM. Con `0` el criterio no se toca nunca; con un valor alto,
 *    la foto siempre llega hasta donde `tol` le permita.
 *
 * Nota sobre `duplicate`: hubo una versión anterior de este modo que se apoyaba solo
 * en el dHash exacto, y era falsa. El dHash es un gradiente 8×8 en gris, así que una
 * conversión a blanco y negro conserva la luminancia y da distancia 0 sobre dos
 * fotos con paletas opuestas. Ahora hacen falta las tres señales a la vez, y el
 * histograma tapa justo ese agujero: por separado mienten, juntas no. Y las tres
 * tienen que estar presentes, no solo no contradecirse.
 */
export type CriterionProfileMode = 'duplicate' | 'default' | 'version'

export interface CriterionProfileValue {
  duplicate: number
  default: number
  version: number
}

export interface CriterionProfile {
  tol: CriterionProfileValue
  maxShift: CriterionProfileValue
}

export interface ResolvedCriterionProfile {
  tol: number
  maxShift: number
}

/**
 * Versión del motor. Como el suavizado SIEMPRE recalcula desde
 * `artistic_scores_raw`, la versión no es un histórico ni se guarda en la foto: al
 * cambiar parámetros se sube la versión y se reejecuta, y todo se recalcula desde
 * el original.
 */
export const SMOOTHING_VERSION = 'v3'

// ── Perfiles por criterio ────────────────────────────────────
//
// Claves internas de `config/photo_schema.ts` (variantes style/general y commercial).
//
// Las tolerancias arrancan en el ruido medido del propio evaluador: la dispersión
// de los valores originales dentro de grupos casi idénticos, donde la diferencia
// real es ~0. Medido sobre 2.012 grupos de un catálogo de 33k fotos:
//
//   aesthetic_quality 0.40   humor 0.40   composition 0.44   subject_clarity 0.58
//   candidness 0.59   storytelling 0.60   commercial_intent 0.60   strangeness 0.65
//
// Por debajo de esa cifra, una diferencia es indistinguible del ruido del modelo.
//
// Los de `duplicate` no se calibran: son los mismos para todos los criterios. Si
// nada distingue a las dos fotos, no hay diferencia que preservar en ningún eje,
// así que `tol: 0` las colapsa a la mediana y `maxShift` solo tiene que ser lo
// bastante grande para dejarlas llegar. No es infinito por si el filtro se
// equivocara alguna vez: el tope sigue siendo una promesa comprobable.
//
// Los de `version` son un punto de partida sin medir, a diferencia del resto, y no
// son iguales para todos los criterios. Lo que los separa es si el revelado toca o
// no lo que ese criterio mide:
//
//  - INVARIANTES AL COLOR (composition, visual_games, storytelling, message, humor,
//    candidness): el encuadre y los juegos —reflejos, simetrías, dobles lecturas—
//    son geometría y no se mueven al desaturar; la historia, la gracia y la
//    naturalidad del momento son las mismas en color y en blanco y negro. Si el LLM
//    los puntúa distinto entre dos revelados es incoherencia suya, así que se
//    corrigen igual que en `default` (o casi, donde queda algún efecto indirecto:
//    un blanco y negro puede reforzar una narrativa documental sin cambiar lo que
//    se cuenta).
//
//  - SENSIBLES AL COLOR (aesthetic_quality, strangeness, subject_clarity,
//    commercial_intent): aquí el revelado ES parte de lo que se juzga. Una versión
//    en blanco y negro puede ser legítimamente más bonita, más rara, leerse peor o
//    venderse mejor que la de color, así que la diferencia se respeta: `tol` alto
//    para dejar pasar hasta un punto entero y `maxShift` del orden del ruido del
//    evaluador (~0.5), que solo tumba lo que no puede ser intencionado.

/** Margen de sobra para que un duplicado siempre alcance la mediana del grupo. */
const DUPLICATE_MAX_SHIFT = 3.0

export const CRITERION_PROFILES: Readonly<Record<string, CriterionProfile>> = {
  // Fundamentals (style/general)
  aesthetic_quality: {
    tol: { duplicate: 0, default: 0.1, version: 1.0 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.25, version: 0.5 },
  },
  composition: {
    tol: { duplicate: 0, default: 0.1, version: 0 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.25, version: 2 },
  },
  storytelling: {
    tol: { duplicate: 0, default: 0.1, version: 0 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.25, version: 1.1 },
  },
  strangeness: {
    tol: { duplicate: 0, default: 0.1, version: 1.0 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.1, version: 0.5 },
  }, // externo: originality
  // Bonus (style/general)
  message: {
    tol: { duplicate: 0, default: 0.1, version: 0.1 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.1, version: 1.0 },
  },
  humor: {
    tol: { duplicate: 0, default: 0.1, version: 0.1 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.25, version: 1.0 },
  },
  visual_games: {
    tol: { duplicate: 0, default: 0.1, version: 0.1 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.25, version: 1.1 },
  },
  candidness: {
    tol: { duplicate: 0, default: 0.1, version: 0.1 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.1, version: 1.0 },
  },
  // Commercial
  commercial_intent: {
    tol: { duplicate: 0, default: 0.1, version: 1.0 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.1, version: 0.5 },
  },
  subject_clarity: {
    tol: { duplicate: 0, default: 0.1, version: 1.0 },
    maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 1.25, version: 0.5 },
  },
}

/**
 * Perfil para una clave desconocida: el más prudente. Salvo en `duplicate`, donde no
 * hay nada que preservar por mucho que no se sepa qué mide el criterio.
 */
export const DEFAULT_PROFILE: CriterionProfile = {
  tol: { duplicate: 0, default: 0.6, version: 1.0 },
  maxShift: { duplicate: DUPLICATE_MAX_SHIFT, default: 0.6, version: 0.4 },
}

export function getCriterionProfile(
  key: string,
  mode: CriterionProfileMode = 'default'
): ResolvedCriterionProfile {
  const profile = CRITERION_PROFILES[key] ?? DEFAULT_PROFILE
  return { tol: profile.tol[mode], maxShift: profile.maxShift[mode] }
}

/**
 * Cuándo dos fotos de la misma toma comparten revelado. Se mide sobre el
 * `color_histogram` (HSV, 16 tonos × 4 saturaciones, sin canal V) y son dos
 * comprobaciones separadas a propósito: ver `utils/score_smoothing_color.ts`.
 *
 * No mide exposición ni contraste: el histograma no guarda el canal V. Una foto
 * subida dos pasos con el mismo tono y saturación pasa por el mismo revelado.
 */
export interface ColorGradeConfig {
  /**
   * Diferencia máxima de masa insaturada (la fila `s = 0` del histograma) entre
   * las dos fotos. Es la comprobación que separa blanco y negro de color, y la
   * que caza los decolorados. Una conversión a monocromo mueve esta cifra de
   * ~0.4 a ~1.0, así que un corte bajo basta y sobra.
   */
  maxUnsaturatedMassDelta: number
  /**
   * Intersección mínima de los bins CON color, ya sin el pico acromático. Aquí
   * vive el viraje de tono. Ojo con subirlo: los 16 bins de tono cubren 22.5°
   * reales cada uno, así que un viraje suave que no cruza frontera de bin no se
   * ve, y uno que la cruza cae de golpe.
   */
  minChromaticIntersection: number
  /**
   * Masa cromática mínima para que comparar tonos signifique algo. Por debajo, la
   * foto es monocroma y la decisión la toma entera `maxUnsaturatedMassDelta`.
   */
  minChromaticMass: number
}

export interface SmoothingConfig {
  /** Similitud coseno CLIP mínima para considerar dos fotos "la misma toma". */
  simThreshold: number
  /**
   * Distancia de Hamming máxima entre dhashes (0-64, menos = más parecidas).
   *
   * MUY por debajo del umbral de la detección de duplicados (7.5): aquel busca el
   * mismo archivo reexportado y puede permitirse ser laxo, pero el dhash es una
   * huella de 8×8 en gris y a 7 bits empieza a confundir imágenes que solo comparten
   * la distribución de luces — dos fotos oscuras con un objeto claro en el centro
   * colisionan aunque no tengan nada que ver.
   */
  dhashThreshold: number
  /** Separación temporal máxima para que dos candidatos dHash pertenezcan a una ráfaga. */
  maxDateTakenDeltaSeconds: number
  /**
   * Desvío relativo máximo de la distancia focal para que dos fotos sigan siendo la
   * misma toma. La focal es el mejor veto disponible: ISO, apertura y obturación las
   * mueve el automatismo entre disparo y disparo, pero la focal solo cambia si
   * alguien toca el objetivo. Relativo y no exacto porque los dos caminos de subida
   * guardan el valor en formatos distintos.
   */
  maxFocalLengthRatio: number
  /**
   * Margen para dar dos fotos por salidas del MISMO disparo, que es lo que exigen los
   * modos `version` y `duplicate`: el revelado no toca la hora del obturador, así que
   * dos versiones comparten `dateTaken`. EXIF lo guarda al segundo, y con eso basta.
   * No es un veto: las dos fotos tienen que TENER la fecha, o se quedan en `default`.
   */
  sameCaptureToleranceSeconds: number
  /**
   * Corte entre `default` y `version`. No filtra vecinos: un revelado distinto no
   * deja de ser la misma toma, solo cambia cuánto se puede corregir.
   */
  colorGrade: ColorGradeConfig
  /** Vecinos máximos por foto. */
  k: number
  /** Corte de convergencia: se para cuando el mayor cambio de una iteración baja de aquí. */
  epsilon: number
  maxIterations: number
  /** Movimiento mínimo (tras redondear a 1 decimal) para molestarse en escribir. */
  minWrite: number
  scoreMin: number
  scoreMax: number
  /** Tope de fotos por grupo. */
  maxGroupSize: number
}

export const SMOOTHING_CONFIG: SmoothingConfig = {
  simThreshold: 0.95,
  dhashThreshold: 7,
  maxDateTakenDeltaSeconds: 30,
  maxFocalLengthRatio: 0.05,
  sameCaptureToleranceSeconds: 1,
  colorGrade: {
    maxUnsaturatedMassDelta: 0.15,
    minChromaticIntersection: 0.9,
    minChromaticMass: 0.02,
  },
  k: 8,
  epsilon: 0.01,
  maxIterations: 12,
  minWrite: 0.1,
  scoreMin: 1,
  scoreMax: 10,
  maxGroupSize: 60,
}

// ── Flags de entorno ─────────────────────────────────────────
//
// Se leen de process.env directamente (y no del proxy de `start/env.ts`, que en
// producción lanza si la variable falta) para que ausencia = desactivado.

/**
 * Activa el enganche automático al terminar un análisis. Desactivado por defecto:
 * el motor solo corre si se pide explícitamente (comando o admin).
 */
export function isSmoothingEnabled(): boolean {
  return String(process.env.SCORES_SMOOTHING_ENABLED ?? '').toLowerCase() === 'true'
}

/** Método de vecindad por defecto. */
export function getNeighborStrategy(): NeighborStrategy {
  const raw = String(process.env.SCORES_SMOOTHING_STRATEGY ?? '').toLowerCase()
  return raw === 'dhash' || raw === 'both' ? raw : 'clip'
}
