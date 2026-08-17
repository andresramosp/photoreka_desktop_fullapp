// ══════════════════════════════════════════════════════════════
// QUICK SEARCH BAR — configuración de la barra de acceso rápido
// del Workspace (chips de género + chips de tag).
//
// Los géneros salen del catálogo que ya está en el front
// (descriptions.visual_aspects.genre); los tags vienen de
// GET /api/tags/top, acotados a los grupos de aquí abajo.
// ══════════════════════════════════════════════════════════════

import {
  BookOutline,
  BulbOutline,
  BusinessOutline,
  CafeOutline,
  ColorPaletteOutline,
  CubeOutline,
  EllipsisHorizontalOutline,
  HappyOutline,
  HeartOutline,
  LeafOutline,
  LocationOutline,
  MegaphoneOutline,
  PartlySunnyOutline,
  PawOutline,
  PersonOutline,
  PricetagOutline,
  RestaurantOutline,
  ShapesOutline,
  ShirtOutline,
  WalkOutline,
} from "@vicons/ionicons5";
import { LandscapeOutlined } from "@vicons/material";

/**
 * Grupos de tag que alimentan los chips. Ajustable: es el único sitio que
 * decide qué familias de tags se consideran "predominantes" para la barra.
 * Valores válidos = `tagGroups` de api/app/models/tag.ts.
 */
export const QUICK_SEARCH_TAG_GROUPS = [
  "person",
  "animals",
  "objects",
  "toponym",
  "symbols",
  "abstract concept",
  "environment",
  "mood",
];

/** El demo no ve "abstract concept". */
export const getQuickSearchTagGroups = (isDemoUser = false) =>
  isDemoUser
    ? QUICK_SEARCH_TAG_GROUPS.filter((group) => group !== "abstract concept")
    : QUICK_SEARCH_TAG_GROUPS;

/** Cuántos chips se muestran cuando el usuario no ha configurado nada. */
export const DEFAULT_GENRE_COUNT = 3;
export const DEFAULT_TAG_COUNT = 8;

/**
 * Color de la pill activa, por familia. Son `type` de n-button
 * ("primary" | "info" | "success" | "warning" | "error" | "tertiary"), así que
 * naive resuelve solo el juego completo de estados —reposo, hover, pressed— y
 * en ambos temas. Cambia aquí para distinguir géneros de tags por color; el
 * resto del aspecto se afina en components/workspace/quickSearchPills.css.
 */
export const GENRE_PILL_TYPE = "secondary";
export const TAG_PILL_TYPE = "info";

/**
 * Cuántos tags se piden al backend. Mayor que DEFAULT_TAG_COUNT porque el
 * modal de configuración ofrece el resto como candidatos sin pedir otra vez.
 */
export const TOP_TAGS_FETCH_LIMIT = 200;

/** Icono por valor de `visual_aspects.genre` (ver config/photo_schema.js). */
export const GENRE_ICONS = {
  abstract: ColorPaletteOutline,
  documentary: BookOutline,
  street: WalkOutline,
  landscape: LandscapeOutlined,
  portrait: PersonOutline,
  advertising: MegaphoneOutline,
  product: CubeOutline,
  fashion: ShirtOutline,
  lifestyle: CafeOutline,
  food: RestaurantOutline,
  wedding: HeartOutline,
  architecture: BusinessOutline,
};

/** Icono por grupo de tag; cada chip hereda el de su grupo. */
export const TAG_GROUP_ICONS = {
  person: PersonOutline,
  animals: PawOutline,
  objects: CubeOutline,
  toponym: LocationOutline,
  symbols: ShapesOutline,
  environment: LeafOutline,
  mood: HappyOutline,
  weather: PartlySunnyOutline,
  "abstract concept": BulbOutline,
  misc: EllipsisHorizontalOutline,
};

/** Fallback para tags sin grupo o con un grupo que no mapeamos. */
export const TAG_FALLBACK_ICON = PricetagOutline;

export const getGenreIcon = (genre) => GENRE_ICONS[genre] ?? PricetagOutline;

export const getTagIcon = (group) =>
  TAG_GROUP_ICONS[String(group || "").toLowerCase()] ?? TAG_FALLBACK_ICON;

/** "street" → "Street" */
export const formatChipLabel = (value) => {
  const text = String(value || "");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * Clave de localStorage. Va por usuario: dos cuentas en el mismo navegador no
 * comparten catálogo, así que tampoco deben compartir chips.
 */
export const getQuickSearchStorageKey = (userId) =>
  `photoreka:workspace:quicksearch:${userId ?? "anon"}`;
