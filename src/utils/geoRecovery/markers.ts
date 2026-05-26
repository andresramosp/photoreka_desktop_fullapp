/**
 * Leaflet marker + cluster icon factories for the geo-recovery map.
 *
 * Visually identical to WorldMapView markers (same HTML structure and class
 * names so the CSS in GeoRecoveryView.vue mirrors that view). Duplicated on
 * purpose — keeping these standalone avoids touching the main app code path.
 */

import L from "leaflet";

import type {
  GeoRecoveryResult,
  LocalPhotoRecord,
  LocationGranularity,
} from "./types";

export interface GeoPhotoMarkerData {
  photo: LocalPhotoRecord;
  result: GeoRecoveryResult;
  /** Effective coords (manual override wins over inferred). */
  lat: number;
  lng: number;
  granularity: LocationGranularity | null;
  /** True when the user has supplied manual coordinates for this photo. */
  hasManual: boolean;
  thumbUrl: string | null;
}

export type PhotoMarker = L.Marker & { photoData: GeoPhotoMarkerData };

// ── Thumb URL cache ─────────────────────────────────────────────────────────

const thumbUrlCache = new Map<string, string>();

// CSS dimensions for the tooltip area (220px container − 2×8px padding = 204px;
// height cap mirrors .map-tooltip-image max-height).
const THUMB_CSS_W = 204;
const THUMB_CSS_H = 160;

/**
 * Lazily generate a thumbnail blob URL for marker + tooltip display.
 *
 * Storage layout (what lives where):
 *   IndexedDB  → LocalPhotoRecord.originalBlob  — the RAW original File from
 *                disk; full resolution; never leaves the browser. One entry
 *                per photo; this is what the ZIP download uses.
 *   R2 (server) → resized thumbnail (≤800 px wide) uploaded during the session
 *                 setup so the AI model can see the photo. Auto-deleted after
 *                 7 days; never returned to the browser.
 *
 * This function reads the original from IndexedDB and renders a DPR-aware
 * canvas thumbnail so the tooltip looks sharp on HiDPI / Retina screens.
 * The 42×42 circular marker icon uses `object-fit: cover` in CSS so it
 * handles any generated aspect ratio correctly.
 */
export async function getMarkerThumbUrl(
  photo: LocalPhotoRecord,
): Promise<string | null> {
  const cached = thumbUrlCache.get(photo.clientPhotoId);
  if (cached) return cached;

  if (!photo.originalBlob) return null;

  try {
    const url = URL.createObjectURL(photo.originalBlob);
    const img = await loadImage(url);
    URL.revokeObjectURL(url);

    // Scale canvas to physical pixels so the tooltip is crisp on HiDPI/Retina
    // screens. Cap at 3× to avoid oversized blobs on extreme DPR values.
    const dpr = Math.min(
      typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1,
      3,
    );
    const targetW = Math.round(THUMB_CSS_W * dpr);
    const targetH = Math.round(THUMB_CSS_H * dpr);

    // Fit within targetW × targetH while preserving aspect ratio.
    // Never upscale images smaller than the target box.
    const scale = Math.min(targetW / img.width, targetH / img.height, 1);
    const w = Math.max(Math.round(img.width * scale), 1);
    const h = Math.max(Math.round(img.height * scale), 1);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, w, h);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.78),
    );
    if (!blob) return null;
    const thumbUrl = URL.createObjectURL(blob);
    thumbUrlCache.set(photo.clientPhotoId, thumbUrl);
    return thumbUrl;
  } catch (error) {
    console.warn(
      "[geoRecovery/markers] thumb gen failed:",
      (error as Error).message,
    );
    return null;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

export function revokeAllThumbUrls() {
  thumbUrlCache.forEach((url) => URL.revokeObjectURL(url));
  thumbUrlCache.clear();
}

// ── HTML helpers ────────────────────────────────────────────────────────────

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => {
    return c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;";
  });
}

function createImageMarkup(thumbUrl: string | null): string {
  if (!thumbUrl) return '<span class="photo-map-fallback"></span>';
  return `<img src="${escapeHtml(thumbUrl)}" alt="" loading="lazy" />`;
}

function granularityClass(granularity: LocationGranularity | null): string {
  if (granularity === "place") return "photo-single-marker--place";
  if (granularity === "city") return "photo-single-marker--city";
  if (granularity === "region") return "photo-single-marker--region";
  if (granularity === "country") return "photo-single-marker--country";
  return "";
}

// ── Icon factories ─────────────────────────────────────────────────────────

export function createPhotoMarkerIcon(data: GeoPhotoMarkerData): L.DivIcon {
  const classes = [
    "photo-single-marker",
    granularityClass(data.granularity),
    data.hasManual ? "photo-single-marker--corrected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pencil = `<button class="photo-marker-correct-btn" title="Correct location" aria-label="Correct location"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z"/></svg></button>`;

  return L.divIcon({
    className: "photo-map-div-icon photo-single-div-icon",
    html: `<div class="${classes}" aria-label="${escapeHtml(
      data.photo.originalName,
    )}">${createImageMarkup(data.thumbUrl)}${pencil}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function getClusterIconSize(count: number): number {
  if (count >= 100) return 74;
  if (count >= 10) return 66;
  return 58;
}

function createClusterTileMarkup(markers: PhotoMarker[]): string {
  const previews = markers
    .slice(0, 4)
    .map((m) => m.photoData.thumbUrl)
    .filter((u): u is string => !!u);
  const tileCount = Math.max(1, previews.length);
  if (previews.length === 0) {
    return `<span class="photo-cluster-tile tile-count-1"><span class="photo-map-fallback"></span></span>`;
  }
  return previews
    .map(
      (url) =>
        `<span class="photo-cluster-tile tile-count-${tileCount}">${createImageMarkup(
          url,
        )}</span>`,
    )
    .join("");
}

export function createPhotoClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const markers = cluster.getAllChildMarkers() as PhotoMarker[];
  const count = markers.length;
  const size = getClusterIconSize(count);

  return L.divIcon({
    className: "photo-map-div-icon photo-cluster-div-icon",
    html: `
      <div class="photo-cluster-marker" aria-label="${count} photos">
        <div class="photo-cluster-mosaic">
          ${createClusterTileMarkup(markers)}
        </div>
        <span class="photo-cluster-count">${count}</span>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export function getClusterRadius(zoom: number): number {
  if (zoom >= 17) return 8;
  if (zoom >= 15) return 16;
  if (zoom >= 12) return 28;
  if (zoom >= 8) return 42;
  return 58;
}
