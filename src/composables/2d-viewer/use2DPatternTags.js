// composables/2d-viewer/use2DPatternTags.js
import { ref, computed, watch, shallowRef } from "vue";
import * as PIXI from "pixi.js";

/**
 * Composable for managing pattern tags overlay on 2D photo map
 *
 * @param {Object} params
 * @param {import('vue').Ref} params.userStore - User store instance
 * @param {import('vue').Ref<string>} params.selectedChunk - Current clustering type (story/context/general)
 * @param {import('vue').Ref<Map>} params.photoById - Map of photoId -> photo object
 * @param {import('vue').Ref<PIXI.Container>} params.photoContainer - Pixi container for photos (parent for tags)
 * @param {import('vue').Ref<PIXI.Application>} params.pixiApp - PixiJS application instance
 * @param {import('vue').Ref<number>} params.scale - Current zoom scale
 * @param {import('vue').Ref<boolean>} params.isTransitioning - Whether a layout transition is in progress
 * @param {import('vue').Ref<boolean>} params.isLoadingPositions - Whether positions are being loaded from API
 * @param {import('vue').Ref<Map>} params.photoSprites - Map of photoId -> PIXI.Sprite
 * @param {string} params.displayMode - Display mode: 'floating' (tags on map) or 'list' (menu list)
 * @param {import('vue').Ref} params.selectedPatternId - Currently selected pattern ID (from parent component)
 * @param {import('vue').Ref<Array>} params.extraPatterns - Additional pattern-shaped items (e.g. collections) that can be selected
 */
export function use2DPatternTags({
  userStore,
  selectedChunk,
  photoById,
  photoContainer,
  pixiApp,
  scale,
  isTransitioning,
  isLoadingPositions,
  photoSprites,
  displayMode = "list", // Default to list mode
  selectedPatternId, // Optional: pattern ID selected in parent component
  extraPatterns, // Optional: pattern-shaped items outside the chunk (collections)
}) {
  // Scale factor from backend coordinates to canvas coordinates
  const SCALE_FACTOR = 50;

  // Highlight mode: 'photos' (iluminar fotos específicas) o 'heatmap' (áreas difusas de densidad)
  const HIGHLIGHT_MODE = ref("heatmap"); // Cambiar a "photos" para el comportamiento anterior

  // State
  const viewPatternsEnabled = ref(false);
  const patternTagsContainer = shallowRef(null);
  const activePatternTags = shallowRef(new Map()); // Map of patternId -> tag sprite
  const activeTooltip = shallowRef(null); // Current tooltip being displayed (HTML element)
  const tooltipElement = shallowRef(null); // DOM element for tooltip
  const heatmapContainer = shallowRef(null); // Container for heatmap graphics
  const activeHeatmapGraphics = shallowRef(null); // Current heatmap graphics
  const activeHeatmapPhotoIds = shallowRef(null); // Remember last ids for zoom refresh

  // MEMORY OPTIMIZATION: Reuse a single BlurFilter instead of creating a new one per redraw.
  // BlurFilter allocates WebGL framebuffers internally that are NOT freed by Graphics.destroy().
  let sharedBlurFilter = null;
  const getOrCreateBlurFilter = () => {
    if (!sharedBlurFilter) {
      sharedBlurFilter = new PIXI.BlurFilter();
      sharedBlurFilter.blur = 18;
      sharedBlurFilter.quality = 3;
    }
    return sharedBlurFilter;
  };

  // Heatmap rendering UX: avoid showing a stale heatmap for 1 frame while updates are scheduled.
  // Morphing between shapes is non-trivial; use a simple fade-in for the new heatmap.
  const HEATMAP_FADE_IN_MS = 180;
  let heatmapFadeRaf = 0;
  let heatmapFadeToken = 0;

  const cancelHeatmapFade = () => {
    heatmapFadeToken++;
    if (heatmapFadeRaf) {
      cancelAnimationFrame(heatmapFadeRaf);
      heatmapFadeRaf = 0;
    }
  };

  const hideHeatmapImmediately = () => {
    cancelHeatmapFade();
    const g = activeHeatmapGraphics.value;
    if (!g) return;
    try {
      // Keep it around until the next render pass removes it,
      // but ensure it cannot appear for a frame with outdated geometry.
      g.visible = false;
      g.renderable = false;
      g.alpha = 0;
    } catch (_) {
      // ignore
    }
  };

  const fadeInHeatmap = (graphics) => {
    if (!graphics) return;
    cancelHeatmapFade();

    const myToken = ++heatmapFadeToken;
    const start = performance.now();

    try {
      graphics.visible = true;
      graphics.renderable = true;
      graphics.alpha = 0;
    } catch (_) {
      // ignore
    }

    const step = (now) => {
      if (myToken !== heatmapFadeToken) return;
      const t = HEATMAP_FADE_IN_MS > 0 ? (now - start) / HEATMAP_FADE_IN_MS : 1;
      const a = Math.max(0, Math.min(1, t));
      try {
        graphics.alpha = a;
      } catch (_) {
        // ignore
      }
      if (a < 1) {
        heatmapFadeRaf = requestAnimationFrame(step);
      } else {
        heatmapFadeRaf = 0;
      }
    };

    heatmapFadeRaf = requestAnimationFrame(step);
  };

  // Get catalog patterns from user profile
  const catalogPatterns = computed(() => {
    const profile = userStore.user;
    return profile?.catalogPatternsResult || profile?.catalog_patterns || null;
  });

  // Get patterns for the current clustering type (chunk)
  const patternsForCurrentChunk = computed(() => {
    const patterns = catalogPatterns.value?.[selectedChunk.value] || [];
    return Array.isArray(patterns) ? patterns : [];
  });

  // Pattern options for UI dropdown/validation
  const patternOptions = computed(() => {
    return patternsForCurrentChunk.value
      .filter((p) => p && (p.patternId || p.title))
      .map((p) => ({
        label: p.title || String(p.patternId),
        value: p.patternId ?? p.title,
      }));
  });

  // Disable patterns when no options available
  watch(
    () => patternOptions.value,
    (opts) => {
      if (!opts || opts.length === 0) {
        viewPatternsEnabled.value = false;
      }
    },
    { immediate: true },
  );

  /**
   * Ensure the pattern tags container exists and is attached to photoContainer
   */
  const ensurePatternTagsLayer = () => {
    const parent = photoContainer.value;
    if (!parent) return;

    const existing = patternTagsContainer.value;
    const needsNew =
      !existing ||
      existing.destroyed ||
      existing.parent !== parent ||
      typeof existing.addChild !== "function";

    if (needsNew) {
      try {
        existing?.parent?.removeChild?.(existing);
      } catch (_) {
        // ignore
      }

      const layer = new PIXI.Container();
      layer.zIndex = 10_000;
      parent.addChild(layer);
      patternTagsContainer.value = layer;
      return;
    }

    // Keep it on top even if zIndex sorting is not applied.
    try {
      parent.addChild(existing);
    } catch (_) {
      // ignore
    }
  };

  /**
   * Clear all pattern tags from the map and container
   */
  const clearPatternTag = () => {
    const container = patternTagsContainer.value;
    if (!container) return;

    // Hide tooltip first
    hideTooltip();

    activePatternTags.value.forEach((tag) => {
      try {
        container?.removeChild?.(tag);
      } catch (_) {
        // ignore
      }
      try {
        // Use destroy(true) to free internal contexts (GraphicsContext, TextContext)
        tag.destroy?.(true);
      } catch (_) {
        // ignore
      }
    });
    activePatternTags.value.clear();
  };

  /**
   * Get photo by ID with loose matching (handles string/number ID variations)
   */
  const getPhotoByIdLoose = (id) => {
    const map = photoById.value;
    if (!map?.get) return null;
    return (
      map.get(id) ||
      map.get(String(id)) ||
      (Number.isFinite(Number(id)) ? map.get(Number(id)) : null) ||
      null
    );
  };

  /**
   * Compute the centroid (average position) of a pattern's cluster photos
   * @param {Object} pattern - Pattern object with clusterPhotos array
   * @returns {Object|null} - {x, y, count} in canvas coordinates, or null if no valid photos
   */
  const computeCentroidCanvasFromSamplePhotos = (pattern) => {
    const clusterIds = (pattern?.clusterPhotos || []).filter(Boolean);

    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const id of clusterIds) {
      const photo = getPhotoByIdLoose(id);
      if (!photo) continue;
      const [x, y] = photo.position || [0, 0];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sumX += x * SCALE_FACTOR;
      sumY += y * SCALE_FACTOR;
      count++;
    }

    if (!count) return null;
    return { x: sumX / count, y: sumY / count, count };
  };

  /**
   * Create a tooltip HTML element for pattern description
   * @param {string} description - Pattern description to display
   * @returns {HTMLElement} - Tooltip DOM element
   */
  const createTooltipElement = (description) => {
    const tooltip = document.createElement("div");
    tooltip.className = "pattern-tooltip";
    tooltip.style.cssText = `
      position: fixed;
      background: rgba(66, 66, 66, 0.95);
      border-radius: 6px;
      padding: 10px;
      pointer-events: none;
      z-index: 10000;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      max-width: 270px;
      font-size: 12px;
      line-height: 16px;
      color: white;
      word-wrap: break-word;
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    tooltip.textContent = description;
    return tooltip;
  };

  /**
   * Show tooltip for a pattern tag
   * @param {PIXI.Container} tag - Tag sprite
   * @param {string} description - Pattern description
   * @param {PIXI.Application} pixiApp - PixiJS application instance
   */
  const showTooltip = (tag, description, pixiApp) => {
    if (!description || !tag || !pixiApp) return;

    // Remove existing tooltip
    hideTooltip();

    // Create HTML tooltip element
    const tooltip = createTooltipElement(description);

    // Get the screen position of the tag
    const globalPos = tag.getGlobalPosition();
    const canvasRect = pixiApp.canvas.getBoundingClientRect();

    // Calculate screen position
    const screenX = canvasRect.left + globalPos.x;
    const screenY = canvasRect.top + globalPos.y + 20; // 20px below the tag

    tooltip.style.left = screenX + "px";
    tooltip.style.top = screenY + "px";

    // Add to document body
    document.body.appendChild(tooltip);

    tooltipElement.value = tooltip;
  };

  /**
   * Hide the active tooltip
   */
  const hideTooltip = () => {
    if (tooltipElement.value) {
      try {
        document.body.removeChild(tooltipElement.value);
      } catch (_) {
        // ignore if already removed
      }
      tooltipElement.value = null;
    }
  };

  /**
   * Create heatmap container if it doesn't exist
   */
  const ensureHeatmapContainer = () => {
    const parent = photoContainer.value;
    if (!parent || parent.destroyed) return;
    // Safety check for pixiApp
    if (!pixiApp?.value || pixiApp.value.destroyed) return;

    const existing = heatmapContainer.value;
    const needsNew =
      !existing ||
      existing.destroyed ||
      existing.parent !== parent ||
      typeof existing.addChild !== "function";

    if (needsNew) {
      try {
        existing?.parent?.removeChild?.(existing);
      } catch (_) {
        // ignore
      }

      const layer = new PIXI.Container();
      // Heatmap should be a subtle background layer.
      // Keep it behind photo sprites so it doesn't "paint over" them.
      layer.zIndex = -100;
      // Avoid interfering with pointer events.
      layer.eventMode = "none";

      // Prefer an explicit back insertion to avoid relying on zIndex sorting.
      try {
        parent.addChildAt(layer, 0);
      } catch (_) {
        parent.addChild(layer);
      }
      try {
        parent.sortChildren?.();
      } catch (_) {
        // ignore
      }
      heatmapContainer.value = layer;
      return;
    }

    // Keep the layer at the back.
    try {
      if (parent.getChildIndex?.(existing) !== 0) {
        parent.setChildIndex?.(existing, 0);
      }
      parent.sortChildren?.();
    } catch (_) {
      // ignore
    }
  };

  /**
   * Clear active heatmap graphics
   */
  const clearHeatmap = ({ preserveIds = false } = {}) => {
    cancelHeatmapFade();
    const graphics = activeHeatmapGraphics.value;
    if (graphics) {
      try {
        // Detach shared filter before destroying so it survives for reuse
        graphics.filters = null;

        heatmapContainer.value?.removeChild?.(graphics);
        // CRITICAL: pass `true` (not { children: true }) to also destroy the
        // internal GraphicsContext. In Pixi v8, GraphicsContext holds ALL the
        // circle geometry (vertices, indices, fill batches). Without this,
        // every redraw leaks ~10-40 MB of geometry data that GC cannot free.
        graphics.destroy(true);
      } catch (_) {
        // ignore
      }
      activeHeatmapGraphics.value = null;
    }
    if (!preserveIds) {
      activeHeatmapPhotoIds.value = null;
    }
  };

  /**
   * Create a diffused heatmap overlay based on photo density
   * @param {Array} clusterPhotoIds - Array of photo IDs in the pattern
   */
  const createHeatmapOverlay = (clusterPhotoIds) => {
    if (!clusterPhotoIds || clusterPhotoIds.length === 0) return;

    // If photo sprites are currently animating to new positions (balloon expansion, snap, etc),
    // rendering now would draw the *old* geometry for the whole transition duration.
    // Instead, keep ids and wait for the transition-end update.
    if (isTransitioning?.value || isLoadingPositions?.value) {
      hideHeatmapImmediately();
      clearHeatmap({ preserveIds: true });
      return;
    }

    // Safety check: ensure Pixi app and containers are still valid
    if (!pixiApp?.value || !photoContainer?.value) {
      return;
    }
    if (pixiApp.value.destroyed) {
      return;
    }

    // Remember the active ids for zoom refresh and future updates.
    activeHeatmapPhotoIds.value = clusterPhotoIds;

    ensureHeatmapContainer();
    // We're about to re-render; ensure the old graphics cannot flash for 1 frame.
    hideHeatmapImmediately();
    // Clear only the graphics, keep ids.
    clearHeatmap({ preserveIds: true });

    const container = heatmapContainer.value;
    if (!container || container.destroyed) {
      return;
    }

    // Get positions of cluster photos that are currently visible
    // Filter by photoSprites to respect current filters and layout
    const positions = [];
    const sprites = photoSprites?.value;

    if (!sprites) {
      return;
    }

    for (const photoId of clusterPhotoIds) {
      // Skip if photo is not in current sprite map (filtered out)
      const sprite = sprites?.get(photoId);
      if (!sprite || !sprite.visible) continue;

      // Use sprite position (reflects current layout including snap/relaxation)
      const x = sprite.x;
      const y = sprite.y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      positions.push({ x, y });
    }

    if (positions.length === 0) {
      // No visible points => keep ids but show nothing.
      return;
    }

    // Create graphics for heatmap
    const graphics = new PIXI.Graphics();

    // Render as a background glow instead of an opaque overlay.
    // Prefer SCREEN; fall back to ADD; if neither exist, keep Pixi default.
    // IMPORTANT: Never assign undefined here (Pixi can crash in the blend mode pipe).
    try {
      const modes = PIXI?.BLEND_MODES;
      const safeBlendMode = modes?.SCREEN ?? modes?.ADD ?? null;
      if (safeBlendMode !== null && safeBlendMode !== undefined) {
        graphics.blendMode = safeBlendMode;
      }
    } catch (_) {
      // keep default blend mode
    }
    // Start hidden; fade-in after the new shape is ready.
    graphics.alpha = 0;

    // Get theme color for heatmap
    let heatmapColor = 0x1976d2; // Default blue
    try {
      const primaryHex = getComputedStyle(document.documentElement)
        .getPropertyValue("--v-primary-base")
        .trim();
      if (primaryHex && primaryHex.startsWith("#")) {
        const parsed = parseInt(primaryHex.replace("#", ""), 16);
        if (Number.isFinite(parsed)) {
          heatmapColor = parsed;
        }
      }
    } catch (_) {
      // fallback
    }

    // Calculate adaptive radius based on density and scale
    const avgDistance = calculateAverageNearestNeighborDistance(positions);
    // Smaller radii + lower alpha keeps the effect subtle.
    const baseRadius = Math.max(45, avgDistance * 1.8);
    const currentScale = Number(scale.value) || 1;
    // Slightly reduce growth with zoom so it remains background-like.
    const adaptiveRadius =
      baseRadius / Math.pow(Math.max(1e-6, currentScale), 0.4);

    // Draw gradient circles at each photo position
    // Using multiple circles with decreasing alpha creates a smooth diffused effect
    positions.forEach((pos) => {
      const steps = 8;
      const maxPointAlpha = 0.055;
      for (let i = steps; i > 0; i--) {
        const radiusFactor = i / steps;
        const alphaFactor = (1 - radiusFactor) * maxPointAlpha;
        graphics.circle(pos.x, pos.y, adaptiveRadius * radiusFactor);
        graphics.fill({ color: heatmapColor, alpha: alphaFactor });
      }
    });

    // Reuse shared BlurFilter (avoids allocating new WebGL framebuffers each redraw)
    graphics.filters = [getOrCreateBlurFilter()];

    container.addChild(graphics);
    activeHeatmapGraphics.value = graphics;
    fadeInHeatmap(graphics);
  };

  // Keep heatmap roughly consistent when zoom changes.
  // DEBOUNCED: recreating Graphics+geometry on every wheel tick was the #1 heap pressure.
  // Now we wait until zoom stabilizes (200ms idle) before redrawing.
  let heatmapZoomTimer = 0;
  watch(
    () => scale.value,
    () => {
      if (HIGHLIGHT_MODE.value !== "heatmap") return;
      const ids = activeHeatmapPhotoIds.value;
      if (!ids || ids.length === 0) return;

      // Hide stale heatmap immediately (visual) but DON'T recreate yet.
      hideHeatmapImmediately();

      if (heatmapZoomTimer) clearTimeout(heatmapZoomTimer);
      heatmapZoomTimer = setTimeout(() => {
        heatmapZoomTimer = 0;
        createHeatmapOverlay(ids);
      }, 200); // Only redraw when zoom stabilizes
    },
  );

  // Update heatmap when photo positions change (snap/relaxation) or filters change
  let heatmapUpdateRaf = 0;
  const scheduleHeatmapUpdate = () => {
    if (HIGHLIGHT_MODE.value !== "heatmap") {
      return;
    }
    // Safety check before scheduling async update
    if (!pixiApp?.value || pixiApp.value.destroyed) {
      return;
    }

    // During animated re-layouts (balloon/snap) the sprite positions are mid-flight.
    // Rendering during this window tends to show the previous shape.
    if (isTransitioning?.value || isLoadingPositions?.value) {
      hideHeatmapImmediately();
      clearHeatmap({ preserveIds: true });
      return;
    }

    // Try to get photo IDs from active heatmap state first
    let ids = activeHeatmapPhotoIds.value;

    // If no active heatmap IDs but there's a selected pattern, get IDs from pattern
    if ((!ids || ids.length === 0) && selectedPatternId?.value) {
      const currentPattern = [
        ...patternsForCurrentChunk.value,
        ...(extraPatterns?.value || []),
      ].find((p) => (p.patternId ?? p.title) === selectedPatternId.value);
      if (currentPattern) {
        ids = currentPattern.clusterPhotos || [];
      }
    }

    if (!ids || ids.length === 0) {
      return;
    }

    // Hide immediately so the previous geometry doesn't linger for a frame.
    hideHeatmapImmediately();

    if (heatmapUpdateRaf) cancelAnimationFrame(heatmapUpdateRaf);
    heatmapUpdateRaf = requestAnimationFrame(() => {
      heatmapUpdateRaf = 0;
      createHeatmapOverlay(ids);
    });
  };

  // During layout transitions/loading, photo positions are in flux.
  // Hide heatmap to avoid incoherent intermediate frames.
  watch(isTransitioning, (transitioning) => {
    if (transitioning) {
      hideHeatmapImmediately();
      clearHeatmap({ preserveIds: true });
    }
  });

  watch(isLoadingPositions, (loading) => {
    if (loading) {
      hideHeatmapImmediately();
      clearHeatmap({ preserveIds: true });
    }
  });

  // NOTE: Sprite visibility changes are already handled by scheduleHeatmapUpdate()
  // calls in Photos2D.vue (updateSpriteVisibility, filter watchers, etc.).
  // The previous watcher iterated ALL sprites on every reactivity tick, creating GC pressure
  // and triggering redundant heatmap redraws. Removed to fix memory accumulation.

  // Watch for transition end to update heatmap with new positions
  watch(isTransitioning, (transitioning, wasTransitioning) => {
    if (wasTransitioning && !transitioning) {
      // Transition just finished, update heatmap
      // Add small delay to ensure sprites have final positions
      setTimeout(() => {
        scheduleHeatmapUpdate();
      }, 50);
    }
  });

  /**
   * Calculate average nearest neighbor distance to determine density
   * @param {Array} positions - Array of {x, y} positions
   * @returns {number} Average distance to nearest neighbor
   */
  const calculateAverageNearestNeighborDistance = (positions) => {
    if (positions.length < 2) return 100;

    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < positions.length; i++) {
      let minDistance = Infinity;
      for (let j = 0; j < positions.length; j++) {
        if (i === j) continue;
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
        }
      }
      if (Number.isFinite(minDistance)) {
        totalDistance += minDistance;
        count++;
      }
    }

    return count > 0 ? totalDistance / count : 100;
  };

  /**
   * Highlight photos belonging to a pattern (original method)
   * Delegates to either photo-based or heatmap-based highlighting
   * @param {Array} clusterPhotoIds - Array of photo IDs to highlight
   * @param {string|number} patternId - ID of the pattern being highlighted
   */
  const highlightPatternPhotos = (clusterPhotoIds, patternId) => {
    if (HIGHLIGHT_MODE.value === "heatmap") {
      highlightPatternPhotosHeatmap(clusterPhotoIds, patternId);
    } else {
      highlightPatternPhotosPhotos(clusterPhotoIds, patternId);
    }
  };

  /**
   * Highlight using heatmap overlay (diffused areas)
   * @param {Array} clusterPhotoIds - Array of photo IDs to highlight
   * @param {string|number} patternId - ID of the pattern being highlighted
   */
  const highlightPatternPhotosHeatmap = (clusterPhotoIds, patternId) => {
    if (!clusterPhotoIds) return;

    // Hide all other pattern tags
    activePatternTags.value.forEach((tag, id) => {
      if (id !== patternId) {
        tag.alpha = 0;
      }
    });

    // Create heatmap overlay
    createHeatmapOverlay(clusterPhotoIds);
  };

  /**
   * Highlight using photo-based highlighting (original method)
   * @param {Array} clusterPhotoIds - Array of photo IDs to highlight
   * @param {string|number} patternId - ID of the pattern being highlighted
   */
  const highlightPatternPhotosPhotos = (clusterPhotoIds, patternId) => {
    if (!clusterPhotoIds || !photoSprites?.value) return;

    const clusterIdSet = new Set(clusterPhotoIds);

    // Hide all other pattern tags
    activePatternTags.value.forEach((tag, id) => {
      if (id !== patternId) {
        tag.alpha = 0;
      }
    });

    // First pass: dim all photos that are NOT in the cluster
    photoSprites.value.forEach((sprite, photoId) => {
      if (!clusterIdSet.has(photoId)) {
        // Store original alpha if not already stored
        if (sprite.__originalAlpha === undefined) {
          sprite.__originalAlpha = sprite.alpha ?? 1;
        }
        // Make non-cluster photos semi-transparent
        sprite.alpha = 0.2;
      }
    });

    // Second pass: highlight cluster photos
    for (const photoId of clusterPhotoIds) {
      const sprite = photoSprites.value.get(photoId);
      if (!sprite) continue;

      // Solo aplicar efecto de 'luz' (aumento de brillo), sin filtro de color
      // Guardar alpha original si no está guardado
      if (sprite.__originalAlpha === undefined) {
        sprite.__originalAlpha = sprite.alpha ?? 1;
      }
      // Aumentar el alpha para dar efecto de luz (máximo 1)
      sprite.alpha = Math.min(1, sprite.__originalAlpha * 1.2);
    }
  };

  /**
   * Remove highlight from photos belonging to a pattern
   * @param {Array} clusterPhotoIds - Array of photo IDs to unhighlight
   */
  const unhighlightPatternPhotos = (clusterPhotoIds) => {
    // Clear heatmap if in heatmap mode
    if (HIGHLIGHT_MODE.value === "heatmap") {
      clearHeatmap();
    }

    if (!clusterPhotoIds || !photoSprites?.value) return;

    // Show all pattern tags again
    activePatternTags.value.forEach((tag) => {
      tag.alpha = 1;
    });

    // Restore alpha for all photos
    photoSprites.value.forEach((sprite) => {
      if (sprite.__originalAlpha !== undefined) {
        sprite.alpha = sprite.__originalAlpha;
        delete sprite.__originalAlpha;
      }
    });

    // Restore tint and scale for cluster photos
    for (const photoId of clusterPhotoIds) {
      const sprite = photoSprites.value.get(photoId);
      if (!sprite) continue;

      // Restore original tint
      if (sprite.__originalTint !== undefined) {
        sprite.tint = sprite.__originalTint;
        delete sprite.__originalTint;
      }

      // Restore original scale
      if (sprite.__originalScale !== undefined) {
        sprite.scale.set(sprite.__originalScale.x, sprite.__originalScale.y);
        delete sprite.__originalScale;
      }
    }
  };

  /**
   * Clear all photo highlights/lowlights regardless of pattern
   * Restores all sprites to their original state
   */
  const clearPhotoHighlights = () => {
    // Clear heatmap
    clearHeatmap();

    if (!photoSprites?.value) return;

    // Show all pattern tags again
    activePatternTags.value.forEach((tag) => {
      tag.alpha = 1;
    });

    // Restore all sprites to original state
    photoSprites.value.forEach((sprite) => {
      // Restore original alpha
      if (sprite.__originalAlpha !== undefined) {
        sprite.alpha = sprite.__originalAlpha;
        delete sprite.__originalAlpha;
      }

      // Restore original tint
      if (sprite.__originalTint !== undefined) {
        sprite.tint = sprite.__originalTint;
        delete sprite.__originalTint;
      }

      // Restore original scale
      if (sprite.__originalScale !== undefined) {
        sprite.scale.set(sprite.__originalScale.x, sprite.__originalScale.y);
        delete sprite.__originalScale;
      }
    });
  };

  /**
   * Create a pattern tag sprite with text and rounded background
   * @param {string} label - Pattern title/label to display
   * @param {string} description - Pattern description for tooltip
   * @param {Array} clusterPhotoIds - Array of photo IDs in this pattern
   * @param {string|number} patternId - Pattern ID
   * @returns {PIXI.Container} - Container with text and background graphics
   */
  const createPatternTag = (label, description, clusterPhotoIds, patternId) => {
    const group = new PIXI.Container();
    group.zIndex = 10_000;
    group.__patternLabel = label;
    group.__patternDescription = description;
    group.__clusterPhotoIds = clusterPhotoIds;

    // Make interactive for tooltip
    group.eventMode = "static";
    group.cursor = "pointer";

    // Obtener colores del theme usando CSS variables
    let primaryColor = 0x1976d2; // fallback azul
    let textColor = 0xffffff; // fallback blanco
    try {
      const primaryHex = getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-container")
        .trim();
      if (primaryHex && primaryHex.startsWith("#")) {
        const parsed = parseInt(primaryHex.replace("#", ""), 16);
        if (Number.isFinite(parsed)) {
          primaryColor = parsed;
        }
      }

      const textHex = getComputedStyle(document.documentElement)
        .getPropertyValue("--text-on-primary")
        .trim();
      if (textHex && textHex.startsWith("#")) {
        const parsed = parseInt(textHex.replace("#", ""), 16);
        if (Number.isFinite(parsed)) {
          textColor = parsed;
        }
      }
    } catch (_) {
      // fallback
    }

    const text = new PIXI.Text({
      text: String(label || ""),
      style: {
        // fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
        fontSize: 13,
        fill: textColor,
      },
    });
    text.anchor.set(0.5);

    const padX = 8;
    const padY = 5;
    const w = (text.width || 0) + padX * 2;
    const h = (text.height || 0) + padY * 2;

    const bg = new PIXI.Graphics();
    if (typeof bg.roundRect === "function") {
      bg.roundRect(-w / 2, -h / 2, w, h, 8);
    } else {
      bg.rect(-w / 2, -h / 2, w, h);
    }
    bg.fill({ color: primaryColor, alpha: 0.8 });
    bg.stroke({ color: 0xffffff, width: 1, alpha: 0.35 });

    group.addChild(bg);
    group.addChild(text);

    // Add tooltip and photo highlight events
    group.on("pointerenter", () => {
      // if (description) {
      //   showTooltip(group, description, pixiApp.value);
      // }
      if (clusterPhotoIds) {
        highlightPatternPhotos(clusterPhotoIds, patternId);
      }
    });

    group.on("pointerleave", () => {
      // hideTooltip();
      if (clusterPhotoIds) {
        unhighlightPatternPhotos(clusterPhotoIds);
      }
    });

    return group;
  };

  /**
   * Apply inverse scaling to keep tag size constant on screen regardless of zoom
   * @param {PIXI.Container} tag - Tag sprite to scale
   */
  const updatePatternTagScreenScale = (tag) => {
    if (!tag) return;
    const s = Number(scale.value) || 1;
    const inv = 1 / Math.max(1e-6, s);
    tag.scale.set(inv);
  };

  /**
   * Update screen scale for all active pattern tags and tooltip
   */
  const updateAllPatternTagsScreenScale = () => {
    activePatternTags.value.forEach((tag) => {
      updatePatternTagScreenScale(tag);
    });
    if (activeTooltip.value) {
      updatePatternTagScreenScale(activeTooltip.value);
    }
  };

  /**
   * Main function to render/update pattern tags based on current state
   * - Creates tags for all patterns in current chunk when enabled
   * - Updates positions when patterns/photos change
   * - Removes tags when patterns are disabled or no longer exist
   */
  const ensurePatternTag = () => {
    // Only render floating tags if displayMode is 'floating'
    if (displayMode !== "floating") {
      clearPatternTag();
      return;
    }

    ensurePatternTagsLayer();
    if (!patternTagsContainer.value) return;

    // Don't render tags during loading or layout transitions
    if (isLoadingPositions.value || isTransitioning.value) {
      clearPatternTag();
      return;
    }

    if (!viewPatternsEnabled.value) {
      clearPatternTag();
      return;
    }

    const patterns = patternsForCurrentChunk.value;
    if (!patterns || patterns.length === 0) {
      clearPatternTag();
      return;
    }

    const container = patternTagsContainer.value;
    const existingTags = new Set(activePatternTags.value.keys());
    const neededPatternIds = new Set();

    // Create/update tags for each pattern
    for (const pattern of patterns) {
      const patternId = pattern?.patternId ?? pattern?.title;
      if (!patternId) continue;

      neededPatternIds.add(patternId);

      const centroid = computeCentroidCanvasFromSamplePhotos(pattern);
      if (!centroid) continue;

      const label = pattern.title || "Pattern";
      const description = pattern.description || "";
      const clusterPhotoIds = pattern.clusterPhotos || [];
      let tag = activePatternTags.value.get(patternId);

      const needsRecreate =
        !tag ||
        tag.__patternLabel !== label ||
        tag.__patternDescription !== description;

      if (needsRecreate) {
        // Remove old tag if it exists
        if (tag) {
          try {
            container.removeChild(tag);
            tag.destroy?.(true);
          } catch (_) {
            // ignore
          }
        }

        // Create new tag
        tag = createPatternTag(label, description, clusterPhotoIds, patternId);
        container.addChild(tag);
        activePatternTags.value.set(patternId, tag);
      } else {
        // Update cluster photo IDs in case they changed
        tag.__clusterPhotoIds = clusterPhotoIds;
      }

      // Update position
      tag.x = centroid.x;
      tag.y = centroid.y;
      updatePatternTagScreenScale(tag);
    }

    // Remove tags for patterns that no longer exist
    for (const patternId of existingTags) {
      if (!neededPatternIds.has(patternId)) {
        const tag = activePatternTags.value.get(patternId);
        if (tag) {
          try {
            container.removeChild(tag);
            tag.destroy?.(true);
          } catch (_) {
            // ignore
          }
          activePatternTags.value.delete(patternId);
        }
      }
    }
  };

  // Watch for pattern changes and update tags
  watch([viewPatternsEnabled, selectedChunk], () => {
    ensurePatternTag();
  });

  // Watch for chunk changes to clear photo highlights
  watch(
    () => selectedChunk.value,
    () => {
      clearPhotoHighlights();
    },
  );

  // Watch for transition end to render tags
  watch(isTransitioning, (transitioning) => {
    if (!transitioning) {
      // Transition finished, render tags if enabled
      ensurePatternTag();
    } else {
      // Transition started, clear existing tags
      clearPatternTag();
    }
  });

  // Watch for positions loading to clear/render tags
  watch(isLoadingPositions, (loading) => {
    if (!loading) {
      // Loading finished, render tags if enabled
      ensurePatternTag();
    } else {
      // Loading started, clear existing tags
      clearPatternTag();
    }
  });

  // Cleanup function to cancel pending timers/RAFs and free all resources
  const cleanup = () => {
    // Cancel timers and animation frames
    if (heatmapZoomTimer) {
      clearTimeout(heatmapZoomTimer);
      heatmapZoomTimer = 0;
    }
    if (heatmapUpdateRaf) {
      cancelAnimationFrame(heatmapUpdateRaf);
      heatmapUpdateRaf = 0;
    }
    cancelHeatmapFade();

    // Clear graphics and tags
    clearHeatmap();
    clearPatternTag();

    // Destroy the shared BlurFilter (it holds WebGL framebuffers)
    if (sharedBlurFilter) {
      try {
        sharedBlurFilter.destroy();
      } catch (_) {}
      sharedBlurFilter = null;
    }

    // Destroy and clear container references
    const hContainer = heatmapContainer.value;
    if (hContainer && !hContainer.destroyed) {
      try {
        hContainer.parent?.removeChild?.(hContainer);
        hContainer.destroy(true);
      } catch (_) {}
    }
    heatmapContainer.value = null;

    const pContainer = patternTagsContainer.value;
    if (pContainer && !pContainer.destroyed) {
      try {
        pContainer.parent?.removeChild?.(pContainer);
        pContainer.destroy(true);
      } catch (_) {}
    }
    patternTagsContainer.value = null;
  };

  return {
    // State
    viewPatternsEnabled,
    patternOptions,
    patternsForCurrentChunk,
    patternTagsContainer,
    activePatternTags,
    HIGHLIGHT_MODE, // Export for external configuration

    // Methods
    ensurePatternTagsLayer,
    ensurePatternTag,
    clearPatternTag,
    updatePatternTagScreenScale,
    updateAllPatternTagsScreenScale,
    scheduleHeatmapUpdate, // Export to allow manual refresh after layout changes
    cleanup, // Export cleanup for component unmount

    // Highlight methods (exposed for external use, e.g., from UI list)
    highlightPatternPhotos,
    unhighlightPatternPhotos,
    clearPhotoHighlights,
  };
}
