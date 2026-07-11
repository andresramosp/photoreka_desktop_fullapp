// utils/chatActionLabels.js
//
// Deterministic chip titles for ChatLab action suggestions. The Phase 3 agent
// only emits { type, params } (+ a resource name for creations); the visible
// title is composed HERE from a fixed template per action type. This makes a
// mislabeled/hallucinated CTA structurally impossible — every word either comes
// from a fixed template or from a DB-sourced name in params.
//
// Templates are English to match the app chrome; only content names (collection
// titles, filenames) carry the conversation's language.

// "strangeness" is the real DB key behind the criterion displayed as
// "Originality" — see photosGridQuery.js for why the key differs from the name.
const CRITERION_LABELS = {
  aesthetic_quality: "aesthetic quality",
  composition: "composition",
  storytelling: "storytelling",
  strangeness: "originality",
  message: "depth",
  humor: "humor",
  visual_games: "visual games",
  candidness: "candidness",
  commercial_intent: "commercial intent",
  subject_clarity: "subject clarity",
};

const GENRE_LABELS = {
  general: "general",
  street: "street",
  documentary: "documentary",
  abstract: "artistic",
  commercial: "commercial",
};

const VIEW_PHOTO_LABELS = {
  "2d": "2D Atlas",
  "3d": "3D Atlas",
};

const OPEN_VIEW_STATIC = {
  report: "Open Report & Statistics",
  portfolios: "Open Portfolio Builder",
  collections: "Open Collections",
  "series-list": "Open Series",
  "world-map": "Open World Map",
  tagcloud: "Open Tag Cloud",
};

const criterionLabel = (field) =>
  CRITERION_LABELS[field] ||
  (field === "date" ? "date" : field === "name" ? "name" : field);

const titleCase = (str) => str.replace(/\b\w/g, (c) => c.toUpperCase());

/** Friendly, non-technical chip label — no operators, numbers, or raw values. */
function workspaceCTA(filters) {
  if (!filters) return "Open My Library";

  if (filters.genrePreset) {
    return `Rank Library for ${titleCase(GENRE_LABELS[filters.genrePreset] || filters.genrePreset)}`;
  }

  if (Array.isArray(filters.scoreFilters) && filters.scoreFilters.length > 0) {
    return `Filter Workspace by ${titleCase(criterionLabel(filters.scoreFilters[0].field))}`;
  }

  if (filters.sort) {
    return `Sort Library by ${titleCase(criterionLabel(filters.sort.field))}`;
  }

  return "Open My Library";
}

function workspaceLabel(filters) {
  if (!filters) return "Open my library";

  if (filters.genrePreset) {
    return `Open library ranked for ${GENRE_LABELS[filters.genrePreset] || filters.genrePreset}`;
  }

  const parts = [];
  if (filters.sort) {
    const dir =
      filters.sort.field === "date"
        ? filters.sort.dir === "asc"
          ? "oldest first"
          : "newest first"
        : filters.sort.dir === "asc"
          ? "lowest first"
          : "best first";
    parts.push(`by ${criterionLabel(filters.sort.field)} (${dir})`);
  }
  if (Array.isArray(filters.scoreFilters) && filters.scoreFilters.length > 0) {
    const f = filters.scoreFilters[0];
    const op = f.op === "lte" ? "≤" : "≥";
    const extra =
      filters.scoreFilters.length > 1
        ? ` +${filters.scoreFilters.length - 1}`
        : "";
    parts.push(`${criterionLabel(f.field)} ${op} ${f.value}${extra}`);
  }

  return parts.length > 0
    ? `Open library: ${parts.join(", ")}`
    : "Open my library";
}

const photoCount = (params) =>
  Array.isArray(params.photoIds) ? params.photoIds.length : 0;

const photoCountPhrase = (params) => {
  const count = photoCount(params);
  return count > 0 ? ` with ${count} photo${count === 1 ? "" : "s"}` : "";
};

/** Compose the visible chip label for a suggested action. */
export function buildActionLabel(action) {
  const p = action?.params || {};
  switch (action?.type) {
    case "create_collection":
      return `Create “${p.title}”`;
    case "create_series":
      return `Create “${p.title}”`;
    case "create_canvas":
      return `Create “${p.title}”`;
    case "add_to_collection":
      return `Add to “${p.collectionName}”`;
    case "add_to_series":
      return `Add to “${p.seriesName}”`;
    case "search_photos":
      return p.query ? `Search “${p.query}”` : "Search Photos";
    case "open_workspace":
      return workspaceCTA(p.filters);
    case "view_photo":
      return `View Photo in ${VIEW_PHOTO_LABELS[p.view] || "2D Atlas"}`;
    case "open_view":
      if (p.view === "portfolio") return `Open “${p.name}”`;
      if (p.view === "collection") return `Open “${p.name}”`;
      if (p.view === "series") return `Open “${p.name}”`;
      return OPEN_VIEW_STATIC[p.view] || "Open";
    default:
      return "Open";
  }
}

/** Compose a longer tooltip to explain what happens on click. */
export function buildActionTooltip(action) {
  const p = action?.params || {};
  switch (action?.type) {
    case "create_collection":
      return `Click to create a collection named “${p.title}”${photoCountPhrase(p)}.`;
    case "create_series":
      return `Click to create a series named “${p.title}”${photoCountPhrase(p)}.`;
    case "create_canvas":
      return `Click to create a canvas named “${p.title}”${photoCountPhrase(p)}.`;
    case "add_to_collection":
      return `Click to add${photoCountPhrase(p)} to collection “${p.collectionName}”.`;
    case "add_to_series":
      return `Click to add${photoCountPhrase(p)} to series “${p.seriesName}”.`;
    case "search_photos":
      return `Click to search your library for “${p.query}”.`;
    case "open_workspace":
      return `Click to ${workspaceLabel(p.filters).toLowerCase()}.`;
    case "view_photo":
      return `Click to open ${p.filename || "this photo"} in ${VIEW_PHOTO_LABELS[p.view] || "2D Atlas"} to understand its context within your library.`;
    case "open_view":
      if (p.view === "portfolio") {
        return `Click to open portfolio “${p.name}”.`;
      }
      if (p.view === "collection") {
        return `Click to open collection “${p.name}”.`;
      }
      if (p.view === "series") {
        return `Click to open series “${p.name}”.`;
      }
      return `Click to ${String(OPEN_VIEW_STATIC[p.view] || "open").toLowerCase()}.`;
    default:
      return "Click to run this action.";
  }
}
