// utils/photosGridQuery.js
//
// Shared, compact URL-query contract for deep-linking PhotosGrid filters/sorting.
// Written by ChatLab action suggestions (open_workspace / open_view collection),
// read by PhotosGrid + PhotosGridControls to seed their controls.
//
// GridFilters shape (mirror of api/app/utils/chat_actions_catalog.ts):
//   {
//     sort?:        { field: <score criterion | "date" | "name">, dir: "asc"|"desc" },
//     genrePreset?: <"general"|"street"|"documentary"|"abstract"|"commercial">,
//     scoreFilters?: [ { field: <score criterion>, op: "gte"|"lte", value: 1-10 } ]
//   }
//
// Query params:
//   sort=<field>&dir=asc|desc
//   genre=<preset>
//   score=field:op:value,field:op:value      (op = gte|lte)

// NOTE: "strangeness" is the real DB/UI key for the criterion displayed as
// "Originality" (see api/config/photo_schema.ts `externalKey: 'originality'`).
// The backend Phase 3 agent translates the LLM-facing "originality" name to
// this internal key before it ever reaches the querystring, so this set (and
// PhotosGridControls, which keys off the same schema) must use "strangeness".
const SCORE_CRITERIA = new Set([
  "aesthetic_quality",
  "composition",
  "storytelling",
  "strangeness",
  "message",
  "humor",
  "visual_games",
  "candidness",
  "commercial_intent",
  "subject_clarity",
]);
const BASIC_SORT = new Set(["date", "name"]);
const GENRE_PRESETS = new Set([
  "general",
  "street",
  "documentary",
  "abstract",
  "commercial",
]);

/** Serialize a GridFilters object into a plain query-params object. */
export function gridFiltersToQuery(filters) {
  const q = {};
  if (!filters || typeof filters !== "object") return q;

  if (filters.genrePreset && GENRE_PRESETS.has(filters.genrePreset)) {
    q.genre = filters.genrePreset;
  } else if (
    filters.sort &&
    (SCORE_CRITERIA.has(filters.sort.field) || BASIC_SORT.has(filters.sort.field))
  ) {
    q.sort = filters.sort.field;
    q.dir = filters.sort.dir === "asc" ? "asc" : "desc";
  }

  if (Array.isArray(filters.scoreFilters) && filters.scoreFilters.length > 0) {
    const parts = filters.scoreFilters
      .filter((f) => f && SCORE_CRITERIA.has(f.field))
      .map((f) => {
        const op = f.op === "lte" ? "lte" : "gte";
        const value = Math.max(1, Math.min(10, Number(f.value) || 0));
        return `${f.field}:${op}:${value}`;
      });
    if (parts.length > 0) q.score = parts.join(",");
  }

  return q;
}

/**
 * Parse a route.query object into a normalized filters descriptor consumable by
 * PhotosGridControls. Returns null when there is nothing to apply.
 *
 * Shape:
 *   {
 *     sort?: { field, dir },        // basic (date/name) or score criterion
 *     genrePreset?: string,
 *     scoreFilters?: [ { field, op, value } ]
 *   }
 */
export function parseGridFiltersFromQuery(query) {
  if (!query || typeof query !== "object") return null;
  const out = {};

  if (query.genre && GENRE_PRESETS.has(String(query.genre))) {
    out.genrePreset = String(query.genre);
  } else if (query.sort) {
    const field = String(query.sort);
    if (SCORE_CRITERIA.has(field) || BASIC_SORT.has(field)) {
      out.sort = { field, dir: query.dir === "asc" ? "asc" : "desc" };
    }
  }

  if (query.score) {
    const raw = Array.isArray(query.score) ? query.score.join(",") : String(query.score);
    const scoreFilters = raw
      .split(",")
      .map((token) => {
        const [field, op, value] = token.split(":");
        if (!SCORE_CRITERIA.has(field)) return null;
        const v = Math.max(1, Math.min(10, Number(value) || 0));
        if (!v) return null;
        return { field, op: op === "lte" ? "lte" : "gte", value: v };
      })
      .filter(Boolean);
    if (scoreFilters.length > 0) out.scoreFilters = scoreFilters;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** True when a field is a score criterion (vs a basic date/name sort). */
export function isScoreCriterion(field) {
  return SCORE_CRITERIA.has(field);
}
