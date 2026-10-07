import type { Component } from "vue";
import {
  AirplaneOutline,
  ApertureOutline,
  CameraOutline,
  ColorPaletteOutline,
  EarthOutline,
  EyeOutline,
  FootstepsOutline,
  GlobeOutline,
  HeartOutline,
  ImageOutline,
  LeafOutline,
  NewspaperOutline,
  PeopleOutline,
  PersonOutline,
  SparklesOutline,
  TrophyOutline,
} from "@vicons/ionicons5";

// Photoreka Picks owns its criteria and juries on purpose: they evolve
// independently from the main app's photo_schema (criteria get added or
// dropped here without touching the analyzer).

export const PICKS_MAX_PHOTOS = 5000;
export const PICKS_PRICE_PER_PHOTO_EUR = 0.01;
export const PICKS_MIN_CHARGE_EUR = 1;
export const PICKS_RETENTION_DAYS = 30;
/** Free trial: its own small order; buying afterwards starts a new one. */
export const PICKS_FREE_TRIAL_PHOTOS = 10;

export type PicksCriterionKey =
  | "aesthetics"
  | "composition"
  | "storytelling"
  | "originality"
  | "message"
  | "humor"
  | "visual_games"
  | "spontaneity";

export interface PicksCriterion {
  key: PicksCriterionKey;
  label: string;
  description: string;
}

export const PICKS_CRITERIA: PicksCriterion[] = [
  {
    key: "aesthetics",
    label: "Aesthetics",
    description: "Immediate visual beauty: light, colour and atmosphere.",
  },
  {
    key: "composition",
    label: "Composition",
    description: "How the frame is built: balance, lines, layers and space.",
  },
  {
    key: "storytelling",
    label: "Storytelling",
    description:
      "How strongly the image suggests a moment, a before and an after.",
  },
  {
    key: "originality",
    label: "Originality",
    description: "How far it is from the picture everyone else would take.",
  },
  {
    key: "message",
    label: "Message",
    description: "Whether it says something beyond what it shows.",
  },
  {
    key: "humor",
    label: "Humor",
    description: "Wit, irony or a playful coincidence inside the frame.",
  },
  {
    key: "visual_games",
    label: "Visual games",
    description:
      "Juxtapositions, reflections, shapes that rhyme or trick the eye.",
  },
  {
    key: "spontaneity",
    label: "Spontaneity",
    description: "How unposed and alive the captured moment feels.",
  },
];

export type PicksWeights = Partial<Record<PicksCriterionKey, number>>;

// Multi-label: a travel photo can also be a landscape or a street photo.
export type PicksGenreKey =
  | "street"
  | "documentary"
  | "landscape"
  | "portrait"
  | "travel"
  | "fine_art";

export const PICKS_GENRES: { key: PicksGenreKey; label: string }[] = [
  { key: "street", label: "Street" },
  { key: "documentary", label: "Documentary" },
  { key: "landscape", label: "Landscape" },
  { key: "portrait", label: "Portrait" },
  { key: "travel", label: "Travel" },
  { key: "fine_art", label: "Fine art" },
];

export interface PicksJury {
  id: string;
  label: string;
  tagline: string;
  icon: Component;
  weights: PicksWeights;
  /** When set, the jury only ranks photos tagged with one of these genres. */
  genres?: PicksGenreKey[];
  /** When set, photos whose weighted score falls below it are left out. */
  minScore?: number;
}

/** Shared bar for every award jury: below it a photo is not award material. */
export const PICKS_AWARD_MIN_SCORE = 8;

// Only the ratios between weights matter: the ranking is a weighted mean.
export const PICKS_JURIES: PicksJury[] = [
  {
    id: "overall",
    label: "Overall",
    tagline: "A balanced eye across every criterion.",
    icon: SparklesOutline,
    weights: {
      aesthetics: 1,
      composition: 1,
      storytelling: 0.8,
      originality: 0.8,
      message: 0.6,
      humor: 0.3,
      visual_games: 0.4,
      spontaneity: 0.4,
    },
  },
  {
    id: "award",
    label: "Award-winning",
    tagline: `What a competition jury would shortlist: only photos scoring ${PICKS_AWARD_MIN_SCORE.toFixed(1)} or more.`,
    icon: TrophyOutline,
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      aesthetics: 0.7,
      composition: 0.9,
      storytelling: 1,
      originality: 1,
      message: 1,
      humor: 0.2,
      visual_games: 0.5,
      spontaneity: 0.4,
    },
  },
  {
    id: "street",
    label: "Street",
    tagline: "Timing, wit and the theatre of everyday life.",
    icon: FootstepsOutline,
    genres: ["street"],
    weights: {
      aesthetics: 0.6,
      composition: 0.8,
      storytelling: 0.9,
      originality: 0.9,
      message: 0.5,
      humor: 0.7,
      visual_games: 0.8,
      spontaneity: 1,
    },
  },
  {
    id: "documentary",
    label: "Documentary",
    tagline: "Truth, context and human stories.",
    icon: NewspaperOutline,
    genres: ["documentary"],
    weights: {
      aesthetics: 0.4,
      composition: 0.7,
      storytelling: 1,
      originality: 0.4,
      message: 1,
      humor: 0.1,
      visual_games: 0.2,
      spontaneity: 0.8,
    },
  },
  {
    id: "landscape",
    label: "Landscape",
    tagline: "Light, atmosphere and a well-built frame.",
    icon: LeafOutline,
    genres: ["landscape"],
    weights: {
      aesthetics: 1,
      composition: 1,
      originality: 0.5,
      storytelling: 0.2,
      message: 0.2,
    },
  },
  {
    id: "fine_art",
    label: "Fine art",
    tagline: "Vision, mood and images that ask questions.",
    icon: ColorPaletteOutline,
    genres: ["fine_art"],
    weights: {
      aesthetics: 1,
      composition: 0.9,
      originality: 1,
      message: 0.7,
      visual_games: 0.6,
      storytelling: 0.3,
    },
  },
  {
    id: "portrait",
    label: "Portrait",
    tagline: "Presence, expression and connection.",
    icon: PersonOutline,
    genres: ["portrait"],
    weights: {
      aesthetics: 0.8,
      composition: 0.7,
      storytelling: 0.7,
      message: 0.6,
      spontaneity: 0.6,
      originality: 0.5,
    },
  },
  {
    id: "travel",
    label: "Travel",
    tagline: "A sense of place you can almost smell.",
    icon: AirplaneOutline,
    genres: ["travel"],
    weights: {
      aesthetics: 0.9,
      composition: 0.8,
      storytelling: 0.7,
      spontaneity: 0.5,
      originality: 0.5,
      message: 0.3,
      humor: 0.3,
      visual_games: 0.3,
    },
  },
];

export function getPicksCriterion(key: string): PicksCriterion | undefined {
  return PICKS_CRITERIA.find((c) => c.key === key);
}

export function getPicksGenreLabel(key: string): string {
  return PICKS_GENRES.find((g) => g.key === key)?.label ?? key;
}

/**
 * Real competitions under the Award-winning pill. Weights are our reading of
 * what each jury publicly rewards; open competitions set no genre filter.
 */
export const PICKS_AWARDS: PicksJury[] = [
  {
    id: "award_world_press_photo",
    label: "World Press Photo",
    tagline: "Accurate photojournalism about the stories that matter.",
    icon: NewspaperOutline,
    genres: ["documentary"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      message: 1,
      storytelling: 1,
      spontaneity: 0.8,
      composition: 0.6,
      aesthetics: 0.4,
      originality: 0.4,
    },
  },
  {
    id: "award_eugene_smith",
    label: "W. Eugene Smith Grant",
    tagline: "Humanistic, concerned photography made with compassion.",
    icon: HeartOutline,
    genres: ["documentary"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      message: 1,
      storytelling: 0.9,
      aesthetics: 0.6,
      spontaneity: 0.6,
      composition: 0.5,
      originality: 0.3,
    },
  },
  {
    id: "award_leica_oskar_barnack",
    label: "Leica Oskar Barnack Award",
    tagline: "People and their environment, seen with a fresh, bold eye.",
    icon: ApertureOutline,
    genres: ["documentary", "fine_art"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      originality: 1,
      message: 0.9,
      storytelling: 0.8,
      composition: 0.8,
      aesthetics: 0.6,
      spontaneity: 0.4,
      visual_games: 0.3,
    },
  },
  {
    id: "award_lensculture_street",
    label: "LensCulture Street Photography Awards",
    tagline: "Contemporary takes on public life, from candid to quietly odd.",
    icon: FootstepsOutline,
    genres: ["street"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      originality: 1,
      spontaneity: 1,
      storytelling: 0.8,
      visual_games: 0.8,
      composition: 0.8,
      humor: 0.5,
      message: 0.5,
      aesthetics: 0.5,
    },
  },
  {
    id: "award_miami_street",
    label: "Miami Street Photography Festival",
    tagline: "Classic candid street: layers, juxtapositions and wit.",
    icon: EyeOutline,
    genres: ["street"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      spontaneity: 1,
      visual_games: 1,
      humor: 0.9,
      composition: 0.9,
      originality: 0.8,
      storytelling: 0.7,
      aesthetics: 0.3,
      message: 0.2,
    },
  },
  {
    id: "award_lpoty",
    label: "Landscape Photographer of the Year",
    tagline: "Charlie Waite's Take a View: light, place and pure craft.",
    icon: LeafOutline,
    genres: ["landscape"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      aesthetics: 1,
      composition: 1,
      originality: 0.6,
      storytelling: 0.2,
      message: 0.2,
    },
  },
  {
    id: "award_nlpa",
    label: "Natural Landscape Photography Awards",
    tagline: "Honest landscapes: no composites, no AI, real light.",
    icon: EarthOutline,
    genres: ["landscape"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      composition: 1,
      originality: 0.9,
      aesthetics: 0.8,
      visual_games: 0.3,
      message: 0.3,
    },
  },
  {
    id: "award_winston_taylor",
    label: "Winston Taylor Photo Portrait Prize",
    tagline: "The National Portrait Gallery's prize for contemporary portraits.",
    icon: PersonOutline,
    genres: ["portrait"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      originality: 0.9,
      aesthetics: 0.8,
      composition: 0.8,
      message: 0.8,
      storytelling: 0.6,
      spontaneity: 0.2,
    },
  },
  {
    id: "award_portrait_of_humanity",
    label: "Portrait of Humanity",
    tagline: "Individuality, community and unity, with BJP and Magnum.",
    icon: PeopleOutline,
    genres: ["portrait", "documentary"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      storytelling: 1,
      message: 1,
      spontaneity: 0.6,
      aesthetics: 0.5,
      composition: 0.5,
      originality: 0.5,
      humor: 0.2,
    },
  },
  {
    id: "award_tpoty",
    label: "Travel Photographer of the Year",
    tagline: "Cultures, journeys and places, judged blind by 15 experts.",
    icon: AirplaneOutline,
    genres: ["travel"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      aesthetics: 1,
      composition: 0.9,
      storytelling: 0.7,
      originality: 0.7,
      spontaneity: 0.6,
      message: 0.3,
      humor: 0.2,
    },
  },
  {
    id: "award_lensculture_art",
    label: "LensCulture Art Photography Awards",
    tagline: "Inventive, conceptual work that stretches what a photo can be.",
    icon: ColorPaletteOutline,
    genres: ["fine_art"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      originality: 1,
      message: 0.9,
      visual_games: 0.8,
      aesthetics: 0.7,
      composition: 0.6,
      storytelling: 0.3,
    },
  },
  {
    id: "award_prix_pictet",
    label: "Prix Pictet",
    tagline: "Photography that confronts the great questions of sustainability.",
    icon: GlobeOutline,
    genres: ["fine_art", "documentary", "landscape"],
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      message: 1,
      originality: 0.8,
      aesthetics: 0.8,
      composition: 0.7,
      storytelling: 0.5,
    },
  },
  {
    id: "award_sony_world",
    label: "Sony World Photography Awards",
    tagline: "Striking standalone images across every genre.",
    icon: CameraOutline,
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      aesthetics: 1,
      composition: 0.9,
      originality: 0.9,
      storytelling: 0.8,
      message: 0.5,
      visual_games: 0.5,
      spontaneity: 0.4,
      humor: 0.3,
    },
  },
  {
    id: "award_siena",
    label: "Siena International Photo Awards",
    tagline: "Emotive, polished images with a story behind them.",
    icon: ImageOutline,
    minScore: PICKS_AWARD_MIN_SCORE,
    weights: {
      storytelling: 1,
      aesthetics: 1,
      composition: 0.8,
      spontaneity: 0.6,
      message: 0.6,
      originality: 0.6,
      humor: 0.2,
    },
  },
];
const ALL_JURIES = [...PICKS_JURIES, ...PICKS_AWARDS];

export function getPicksJury(id: string): PicksJury {
  return ALL_JURIES.find((j) => j.id === id) ?? PICKS_JURIES[0];
}

export const isAwardJury = (id: string) =>
  id === "award" || PICKS_AWARDS.some((a) => a.id === id);

/** Labels of the criteria a jury weighs most, heaviest first. */
export function getJuryFocus(jury: PicksJury, count = 3): string[] {
  return Object.entries(jury.weights)
    .filter(([, weight]) => weight)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .slice(0, count)
    .map(([key]) => getPicksCriterion(key)?.label ?? key);
}

/** "Street photos", "Documentary and fine art photos" or "Every genre". */
export function getJuryScope(jury: PicksJury): string {
  if (!jury.genres) return "Every genre";
  const labels = jury.genres.map((g, i) =>
    i === 0 ? getPicksGenreLabel(g) : getPicksGenreLabel(g).toLowerCase(),
  );
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
      : labels[0];
  return `${list} photos`;
}

/** Juries restricted to a genre; open juries judge every photo and are left out. */
export function getGenreJuries(genre: string): PicksJury[] {
  return ALL_JURIES.filter((j) => j.genres?.includes(genre as PicksGenreKey));
}

export function computePicksPriceEur(photoCount: number): number {
  const raw = Math.round(photoCount * PICKS_PRICE_PER_PHOTO_EUR * 100) / 100;
  return Math.max(PICKS_MIN_CHARGE_EUR, raw);
}
