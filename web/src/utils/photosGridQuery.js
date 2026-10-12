// utils/photosGridQuery.js
//
// Shared, compact URL-query contract for deep-linking PhotosGrid filters/sorting.
// Written by ChatLab action suggestions (open_workspace / open_view collection),
// read by PhotosGrid + PhotosGridControls to seed their controls.
//
// GridFilters shape (mirror of api/app/utils/chat_actions_catalog.ts):
//   {
//     sort?:         { field: <score criterion>, dir: "asc"|"desc" },
//     genrePreset?:  <"general"|"street"|"documentary"|"abstract"|"commercial">,
//     scoreFilters?: [ { field: <score criterion>, op: "gte"|"lte", value: 1-10 } ],
//     visualAspects?: [ { aspect: <aspect key>, values: [<value>, …] } ]
//   }
//
// Query params:
//   sort=<field>&dir=asc|desc
//   genre=<preset>
//   score=field:op:value,field:op:value      (op = gte|lte)
//   aspects=key:val|val,key:val              (`,` separates aspects, `|` their values)

import { VISUAL_ASPECTS_MAP } from "@/config/photo_schema";

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
const GENRE_PRESETS = new Set([
  "general",
  "street",
  "documentary",
  "abstract",
  "commercial",
]);

// Visual-aspect facets the chat agent can filter by — the same closed subset the
// backend exposes to the suggester (api/app/utils/chat_actions_catalog.ts
// FILTERABLE_ASPECT_KEYS). Values are validated against the shared schema so a
// hand-edited or stale URL can't seed a filter the grid would never match.
const FILTERABLE_ASPECT_KEYS = ["genre", "palette", "lighting", "stylistic"];
const ASPECT_VALUES = new Map(
  FILTERABLE_ASPECT_KEYS.map((key) => [
    key,
    new Set(VISUAL_ASPECTS_MAP[key]?.values ?? []),
  ]),
);

/** Every query param this contract owns — the set a view strips once it has consumed the deep link. */
export const GRID_QUERY_PARAMS = ["sort", "dir", "genre", "score", "aspects"];

/** Serialize a GridFilters object into a plain query-params object. */
export function gridFiltersToQuery(filters) {
  const q = {};
  if (!filters || typeof filters !== "object") return q;

  if (filters.genrePreset && GENRE_PRESETS.has(filters.genrePreset)) {
    q.genre = filters.genrePreset;
  } else if (filters.sort && SCORE_CRITERIA.has(filters.sort.field)) {
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

  if (Array.isArray(filters.visualAspects) && filters.visualAspects.length > 0) {
    const parts = filters.visualAspects
      .map((a) => {
        const allowed = ASPECT_VALUES.get(a?.aspect);
        if (!allowed) return null;
        const values = (Array.isArray(a.values) ? a.values : []).filter((v) =>
          allowed.has(v),
        );
        return values.length > 0 ? `${a.aspect}:${values.join("|")}` : null;
      })
      .filter(Boolean);
    if (parts.length > 0) q.aspects = parts.join(",");
  }

  return q;
}

/**
 * Parse a route.query object into a normalized filters descriptor consumable by
 * PhotosGridControls. Returns null when there is nothing to apply.
 *
 * Shape:
 *   {
 *     sort?: { field, dir },        // score criterion
 *     genrePreset?: string,
 *     scoreFilters?: [ { field, op, value } ],
 *     visualAspects?: { [aspectKey]: string[] }   // note: keyed map, the shape the
 *                                                 // grid's own filter state uses
 *   }
 */
export function parseGridFiltersFromQuery(query) {
  if (!query || typeof query !== "object") return null;
  const out = {};

  if (query.genre && GENRE_PRESETS.has(String(query.genre))) {
    out.genrePreset = String(query.genre);
  } else if (query.sort) {
    const field = String(query.sort);
    if (SCORE_CRITERIA.has(field)) {
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

  if (query.aspects) {
    const raw = Array.isArray(query.aspects)
      ? query.aspects.join(",")
      : String(query.aspects);
    const visualAspects = {};
    for (const token of raw.split(",")) {
      const sep = token.indexOf(":");
      if (sep === -1) continue;
      const key = token.slice(0, sep).trim();
      const allowed = ASPECT_VALUES.get(key);
      if (!allowed) continue;
      const values = token
        .slice(sep + 1)
        .split("|")
        .map((v) => v.trim())
        .filter((v) => allowed.has(v));
      if (values.length > 0) {
        visualAspects[key] = [...new Set([...(visualAspects[key] ?? []), ...values])];
      }
    }
    if (Object.keys(visualAspects).length > 0) out.visualAspects = visualAspects;
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** True when a field is a score criterion (vs a basic date/name sort). */
export function isScoreCriterion(field) {
  return SCORE_CRITERIA.has(field);
}
