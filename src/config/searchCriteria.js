import { h } from "vue";
import { NIcon, NTooltip } from "naive-ui";
import {
  AppsOutline,
  BookOutline,
  EyeOutline,
  LocationOutline,
  ColorPaletteOutline,
  PricetagOutline,
  ConstructOutline,
  CameraOutline,
} from "@vicons/ionicons5";

// Single source of truth for the "similarity criteria" used across similar-photo
// search, canvas expansion and series suggestions (SimilarPhotosSection,
// canvas.js expansionTypeOptions, SeriesPhotoGrid/Strip suggestionCriteriaOptions)
// as well as the clustering-type selects (Photos2D/Photos3D config panels).
export const SEARCH_CRITERIA = [
  {
    label: "General",
    value: "embedding",
    icon: CameraOutline,
    description:
      "Broad visual and semantic similarity: scene, objects, and overall style.",
  },
  {
    label: "Narrative",
    value: "story",
    icon: BookOutline,
    description:
      "Story-like grouping based on what's happening, actions, and event feel.",
  },
  {
    label: "Content",
    value: "content",
    icon: EyeOutline,
    description:
      "Subjects and objects in the photo — what's physically depicted.",
  },
  {
    label: "Context",
    value: "context",
    icon: LocationOutline,
    description: "Places, symbols, environments, and other contextual cues.",
  },
  {
    label: "Chromatic",
    value: "chromatic",
    icon: ColorPaletteOutline,
    description: "Overall color palette and distribution.",
  },
  {
    label: "Technical",
    value: "technical",
    icon: ConstructOutline,
    description: "Technical visual traits such as color, framing and lighting.",
  },
  {
    label: "Photo tags",
    value: "tags",
    icon: PricetagOutline,
    description: "Match based on selected photo tags.",
  },
];

/** Subset of SEARCH_CRITERIA in the given value order, for consumers that only use some. */
export function criteriaOptions(values) {
  return values
    .map((value) => SEARCH_CRITERIA.find((c) => c.value === value))
    .filter(Boolean);
}

/**
 * Build chunk options that carry icon + description from SEARCH_CRITERIA.
 * `definitions` items: { value, label, criterion }
 */
export function buildChunkOptions(definitions) {
  return (definitions || []).map(({ value, label, criterion }) => {
    const criterionOption = SEARCH_CRITERIA.find(
      (item) => item.value === criterion,
    );
    return {
      value,
      label,
      icon: criterionOption?.icon,
      description: criterionOption?.description,
    };
  });
}

/**
 * n-select `render-label` implementation: icon + text, wrapped in an n-tooltip
 * that explains the criterion on hover. Used for both the trigger and the menu.
 */
export function renderCriteriaLabel(option) {
  const labelNode = h(
    "div",
    { style: "display:flex;align-items:center;gap:6px" },
    [h(NIcon, { component: option.icon }), option.label],
  );

  if (!option.description) return labelNode;

  return h(
    NTooltip,
    { trigger: "hover", placement: "top" },
    {
      trigger: () => labelNode,
      default: () => option.description,
    },
  );
}
