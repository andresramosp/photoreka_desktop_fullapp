/**
 * Predicados de filtrado de fotos compartidos por la grilla principal
 * (PhotosGrid) y los diálogos de selección (PhotosDialog,
 * PortfolioAddPhotosDialog).
 *
 * Estaban escritos a mano dentro del computed `filteredAndSortedPhotos` de
 * PhotosGrid; extraerlos evita que las implementaciones diverjan y permite
 * montar el mismo panel de filtros sobre cualquier lista de fotos.
 *
 * Todos los `matches*` devuelven `true` cuando su filtro está inactivo, así que
 * se pueden encadenar sin comprobar antes si hay algo que aplicar.
 */

/** Forma del estado que consume `applyPhotoFilters`. */
export function createEmptyPhotoFilters() {
  return {
    /** { [aspectKey]: string[] } */
    visualAspects: {},
    /** { [criterionKey]: { value: number, operator: '>=' | '<=' } } */
    scoreFilters: {},
    /** [minTimestamp, maxTimestamp] | null */
    timeRange: null,
    filenameSearch: "",
    /** ids de colecciones seleccionadas (OR entre ellas) */
    collectionIds: [],
  };
}

// ── Nombre de archivo ────────────────────────────────────────────────────────

export function matchesFilename(photo, search) {
  const term = (search || "").toLowerCase().trim();
  if (!term) return true;
  return (photo?.originalFileName || "").toLowerCase().includes(term);
}

// ── Colecciones (OR entre las seleccionadas) ─────────────────────────────────

/**
 * Conjunto de ids de foto que pertenecen a alguna de las colecciones elegidas.
 * Devuelve `null` cuando el filtro está inactivo, para distinguirlo de "ninguna
 * de las colecciones elegidas tiene fotos" (que sí debe vaciar la grilla).
 */
export function buildCollectionPhotoIdSet(collectionIds, collections) {
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) return null;

  const wanted = new Set(collectionIds.map(String));
  const photoIds = new Set();
  for (const collection of collections ?? []) {
    if (!wanted.has(String(collection?.id))) continue;
    for (const photoId of collection?.photoIds ?? []) {
      if (photoId !== undefined && photoId !== null) photoIds.add(String(photoId));
    }
  }
  return photoIds;
}

export function matchesCollections(photo, collectionPhotoIds) {
  if (!collectionPhotoIds) return true;
  return collectionPhotoIds.has(String(photo?.id));
}

// ── Rango temporal (EXIF dateTaken) ──────────────────────────────────────────

export function matchesTimeRange(photo, range) {
  if (!Array.isArray(range) || range.length !== 2) return true;
  // `captureMs` lo precalcula el store (rawifyPhoto) en el mismo marco que el rango que
  // emite TimeRangeFilter, así la pertenencia coincide con slider y diálogo.
  const taken = photo?.captureMs;
  // Sin fecha válida no se puede afirmar que caiga dentro del rango: se excluye.
  if (taken == null) return false;
  return taken >= range[0] && taken <= range[1];
}

// ── Scores artísticos (≥ / ≤ por criterio) ───────────────────────────────────

export function matchesScoreFilters(photo, scoreFilters) {
  if (!scoreFilters || Object.keys(scoreFilters).length === 0) return true;
  const scores = photo?.descriptions?.artistic_scores;
  if (!scores) return false;

  return Object.entries(scoreFilters).every(([criterion, filterVal]) => {
    if (!filterVal) return true;
    const score = scores[criterion];
    if (score === undefined || score === null) return false;
    const value = typeof filterVal === "object" ? filterVal.value : filterVal;
    const operator =
      typeof filterVal === "object" ? (filterVal.operator ?? ">=") : ">=";
    return operator === ">=" ? score >= value : score <= value;
  });
}

// ── Visual aspects (AND entre categorías, OR dentro de cada una) ─────────────

export function hasActiveVisualAspects(visualAspects) {
  if (!visualAspects) return false;
  return Object.values(visualAspects).some(
    (values) => Array.isArray(values) && values.length > 0,
  );
}

export function matchesVisualAspects(photo, visualAspects) {
  if (!hasActiveVisualAspects(visualAspects)) return true;
  const aspects = photo?.descriptions?.visual_aspects;
  if (!aspects) return false;

  return Object.entries(visualAspects).every(([category, selected]) => {
    if (!Array.isArray(selected) || selected.length === 0) return true;
    const photoAspects = aspects[category];
    if (!Array.isArray(photoAspects)) return false;
    return selected.some((value) => photoAspects.includes(value));
  });
}

// ── Estado agregado ──────────────────────────────────────────────────────────

export function countActivePhotoFilters(filters) {
  if (!filters) return 0;

  const aspectsCount = Object.values(filters.visualAspects ?? {}).reduce(
    (total, values) => total + (Array.isArray(values) ? values.length : 0),
    0,
  );
  const scoresCount = Object.keys(filters.scoreFilters ?? {}).length;
  const timeRangeCount = Array.isArray(filters.timeRange) ? 1 : 0;
  const filenameCount = (filters.filenameSearch || "").trim() ? 1 : 0;
  const collectionsCount = Array.isArray(filters.collectionIds)
    ? filters.collectionIds.length
    : 0;

  return (
    aspectsCount +
    scoresCount +
    timeRangeCount +
    filenameCount +
    collectionsCount
  );
}

/**
 * Aplica todos los filtros en una sola pasada. Devuelve el mismo array recibido
 * cuando no hay ningún filtro activo, para que los watchers que observan la
 * lista (p. ej. la paginación de las grillas) no se disparen de más.
 *
 * `collections` es la lista de colecciones del usuario (con sus `photos`), que
 * hace falta para resolver `filters.collectionIds` a ids de foto.
 */
export function applyPhotoFilters(photos, filters, collections = []) {
  if (!Array.isArray(photos) || photos.length === 0) return photos ?? [];
  if (countActivePhotoFilters(filters) === 0) return photos;

  const { visualAspects, scoreFilters, timeRange, filenameSearch } = filters;
  const collectionPhotoIds = buildCollectionPhotoIdSet(
    filters.collectionIds,
    collections,
  );

  return photos.filter(
    (photo) =>
      matchesFilename(photo, filenameSearch) &&
      matchesCollections(photo, collectionPhotoIds) &&
      matchesTimeRange(photo, timeRange) &&
      matchesScoreFilters(photo, scoreFilters) &&
      matchesVisualAspects(photo, visualAspects),
  );
}
