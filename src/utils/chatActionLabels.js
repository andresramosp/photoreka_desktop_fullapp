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

import { VISUAL_ASPECTS_MAP } from "@/config/photo_schema";

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

const criterionLabel = (field) => CRITERION_LABELS[field] || field;

const aspectLabel = (key) =>
  VISUAL_ASPECTS_MAP[key]?.label?.toLowerCase() || key;

const titleCase = (str) => str.replace(/\b\w/g, (c) => c.toUpperCase());

const scoreFiltersOf = (filters) =>
  Array.isArray(filters?.scoreFilters) ? filters.scoreFilters : [];

/** Visual aspects as emitted by the backend: [{ aspect, values }]. */
const visualAspectsOf = (filters) =>
  Array.isArray(filters?.visualAspects)
    ? filters.visualAspects.filter((a) => a?.aspect && a.values?.length > 0)
    : [];

// The chip names the SET of photos an action opens, so two workspace CTAs that
// differ only in their aspects ("colour portraits" vs "b&w landscapes") never
// read the same. Genre values become the head noun; the other aspects qualify it.
const GENRE_NOUNS = {
  abstract: "Abstracts",
  documentary: "Documentary Shots",
  street: "Street Shots",
  landscape: "Landscapes",
  portrait: "Portraits",
  advertising: "Ad Shots",
  product: "Product Shots",
  fashion: "Fashion Shots",
  lifestyle: "Lifestyle Shots",
  food: "Food Shots",
  wedding: "Wedding Shots",
  architecture: "Architecture Shots",
};

const PALETTE_QUALIFIERS = {
  "black and white": "B&W",
  monochrome: "Monochrome",
  color: "Colour",
};

/**
 * Noun phrase for the photos an aspect filter selects, e.g. "B&W Portraits",
 * "Backlit Photos", "B&W / Grain Landscapes". Returns null when there are no
 * aspects.
 *
 * Wording is kept compact (abbreviations, plural nouns) but nothing is hidden:
 * every aspect value appears, since dropping any of them is what made two
 * different suggestions read alike. Long phrases are fine — the chip row scrolls.
 */
function aspectPhrase(aspects) {
  if (aspects.length === 0) return null;

  const valuesOf = (key) => aspects.find((a) => a.aspect === key)?.values ?? [];
  const genre = valuesOf("genre");
  const palette = valuesOf("palette");
  const lighting = valuesOf("lighting");
  const stylistic = valuesOf("stylistic");

  // Head noun: the genres if present, otherwise a neutral "Photos" that the
  // qualifiers below turn into "Backlit Photos" / "Long Exposure Photos".
  const head =
    genre.length > 0
      ? genre.map((v) => GENRE_NOUNS[v] || titleCase(v)).join(" / ")
      : "Photos";

  // Qualifiers, most identifying first.
  const qualifiers = [
    ...palette.map((v) => PALETTE_QUALIFIERS[v] || titleCase(v)),
    ...lighting.map((v) => titleCase(v)),
    ...stylistic.map((v) => titleCase(v)),
  ];

  return [qualifiers.join(" / "), head].filter(Boolean).join(" ");
}

/**
 * One-word ranking qualifier folded into the noun phrase, so two actions over the
 * SAME aspects but different rankings ("best portraits" vs "most original ones")
 * don't read alike. Deliberately criterion-agnostic — which criterion it ranks by
 * is the tooltip's job; the chip only signals the direction.
 */
function rankingQualifier(filters) {
  if (filters.genrePreset) {
    return `${titleCase(GENRE_LABELS[filters.genrePreset] || filters.genrePreset)}-Ranked`;
  }
  if (filters.sort) return filters.sort.dir === "asc" ? "Lowest-Ranked" : "Top";
  return "";
}

/**
 * Chip label. Named after WHAT the action opens rather than what it does to the
 * grid: the aspect values are the part a user actually distinguishes two
 * suggestions by, while the exact criteria and thresholds are tooltip detail.
 */
function workspaceCTA(filters) {
  if (!filters) return "Open My Library";

  const phrase = aspectPhrase(visualAspectsOf(filters));
  if (phrase) {
    return ["Show", rankingQualifier(filters), phrase]
      .filter(Boolean)
      .join(" ");
  }

  const scoreFilters = scoreFiltersOf(filters);
  if (scoreFilters.length > 0) {
    const criteria = scoreFilters
      .map((f) => titleCase(criterionLabel(f.field)))
      .join(" / ");
    return `Filter Library by ${criteria}`;
  }
  if (filters.genrePreset) {
    return `Rank Library for ${titleCase(GENRE_LABELS[filters.genrePreset] || filters.genrePreset)}`;
  }
  if (filters.sort) {
    return `Rank Library by ${titleCase(criterionLabel(filters.sort.field))}`;
  }
  return "Open My Library";
}

/** Full, explicit rundown of what the chip will apply — this is the tooltip's job. */
function workspaceLabel(filters) {
  if (!filters) return "Open my library";

  const clauses = [];

  const aspects = visualAspectsOf(filters);
  if (aspects.length > 0) {
    const shown = aspects
      .map((a) => `${aspectLabel(a.aspect)}: ${a.values.join(" or ")}`)
      .join("; ");
    clauses.push(`showing only ${shown}`);
  }

  const scoreFilters = scoreFiltersOf(filters);
  if (scoreFilters.length > 0) {
    const shown = scoreFilters
      .map(
        (f) =>
          `${criterionLabel(f.field)} ${f.op === "lte" ? "≤" : "≥"} ${f.value}`,
      )
      .join(", ");
    clauses.push(`with ${shown}`);
  }

  if (filters.genrePreset) {
    clauses.push(
      `ranked for ${GENRE_LABELS[filters.genrePreset] || filters.genrePreset}`,
    );
  } else if (filters.sort) {
    const dir = filters.sort.dir === "asc" ? "lowest first" : "best first";
    clauses.push(`ranked by ${criterionLabel(filters.sort.field)} (${dir})`);
  }

  return clauses.length > 0
    ? `Open my library ${clauses.join(", ")}`
    : "Open my library";
}

const photoCount = (params) =>
  Array.isArray(params.photoIds) ? params.photoIds.length : 0;

const photoCountPhrase = (params) => {
  const count = photoCount(params);
  return count > 0 ? ` with ${count} photo${count === 1 ? "" : "s"}` : "";
};

/**
 * Names the group an action's photos came from, e.g. ` from “Digital Solitude”`.
 * An organizing action covers exactly one shown group; the backend resolves it to photo
 * ids but keeps the group reference in params, so the tooltip can state the action's
 * SCOPE — the thing a user needs to see before clicking a chip that files some, not all,
 * of the photos above. Empty on a flat (group-less) turn.
 */
const groupScopePhrase = (params) =>
  params.groupLabel ? ` from “${params.groupLabel}”` : "";

/** " with 4 photos from “Group”" — the full scope clause used in tooltips. */
const photoScopePhrase = (params) => `${photoCountPhrase(params)}`; //${groupScopePhrase(params)}`;

// Content names are user/DB-sourced and can be arbitrarily long ("Sony World
// Photography Awards (Street)"), which blows out the chip and pushes the rest of
// the row out of sight. Ellipsize inside the quotes so the template words stay
// readable and the closing quote survives; the tooltip keeps the full name.
const NAME_MAX_LENGTH = 24;

const truncateName = (name) => {
  const str = String(name ?? "");
  if (str.length <= NAME_MAX_LENGTH) return str;
  return `${str.slice(0, NAME_MAX_LENGTH).trimEnd()}…`;
};

/** Compose the visible chip label for a suggested action. */
export function buildActionLabel(action) {
  const p = action?.params || {};
  switch (action?.type) {
    case "create_collection":
      return `Create “${truncateName(p.title)}”`;
    case "create_series":
      return `Create “${truncateName(p.title)}”`;
    case "create_canvas":
      return `Create “${truncateName(p.title)}”`;
    case "add_to_collection":
      return `Add to “${truncateName(p.collectionName)}”`;
    case "add_to_series":
      return `Add to “${truncateName(p.seriesName)}”`;
    case "search_photos":
      return p.query ? `Search “${p.query}”` : "Search Photos";
    case "open_workspace":
      return workspaceCTA(p.filters);
    case "view_photo":
      return `View Photo in ${VIEW_PHOTO_LABELS[p.view] || "2D Atlas"}`;
    case "open_view":
      if (p.view === "portfolio") return `Open “${truncateName(p.name)}”`;
      if (p.view === "collection") return `Open “${truncateName(p.name)}”`;
      if (p.view === "series") return `Open “${truncateName(p.name)}”`;
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
      return `Click to create a collection named “${p.title}”${photoScopePhrase(p)}.`;
    case "create_series":
      return `Click to create a series named “${p.title}”${photoScopePhrase(p)}.`;
    case "create_canvas":
      return `Click to create a canvas named “${p.title}”${photoScopePhrase(p)}.`;
    case "add_to_collection":
      return `Click to add${photoScopePhrase(p)} to collection “${p.collectionName}”.`;
    case "add_to_series":
      return `Click to add${photoScopePhrase(p)} to series “${p.seriesName}”.`;
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
