// src/composables/useCanvasStage.js
import { reactive, watch, watchPostEffect } from "vue";
import Konva from "konva";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 5;

// Enable all events on Konva for multi-touch support
Konva.hitOnDragEnabled = true;

const TOOLBAR_WIDTH = 260;

export { TOOLBAR_WIDTH };

/**
 * @param isMarking Getter, read at the end of a drag: true while the corner-circle marks
 *   are the live selection, so the rectangle gathers marks instead of board picks.
 */
export function useCanvasStage(
  stageRef,
  photos,
  toolbarState,
  isMarking = () => false,
) {
  const stageConfig = reactive({
    width: window.innerWidth,
    height: window.innerHeight,
    scale: { x: 1, y: 1 },
    draggable: false,
  });

  const stageOffset = reactive({ x: 0, y: 0 });
  const selectionRect = reactive({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    visible: false,
  });

  let selectionStart = null;

  watch(
    () => toolbarState.value.mouseMode,
    (newVal) => {
      stageConfig.draggable = newVal === "move";
    },
    { immediate: true },
  );

  const updateStageOffset = () => {
    const stage = stageRef.value?.getStage();
    if (stage) {
      toolbarState.value.zoomLevel = stage.scaleX(); // sincroniza zoom en ambos sentidos
      stageOffset.x = stage.x();
      stageOffset.y = stage.y();
    }
  };

  const handleWheel = (e) => {
    const stage = stageRef.value.getStage();
    const pointer = stage.getPointerPosition();

    const { criteria } = toolbarState.value.expansion.type;
    if (criteria === "tags" && isHoverPhoto()) {
      e.evt.preventDefault();
      e.evt.stopPropagation();
      return;
    }

    e.evt.preventDefault();

    const oldScale = stage.scaleX();
    const scaleBy = 1.11;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

    applyZoom(stage, newScale, updateStageOffset, pointer);
  };

  const handleMouseDown = (e) => {
    const stage = stageRef.value.getStage();
    const isCtrlOrCmd = e.evt?.ctrlKey || e.evt?.metaKey;

    // Ctrl/Cmd + drag on empty stage starts rectangle selection.
    if (isCtrlOrCmd && e.target === stage) {
      const pointer = stage.getPointerPosition();
      const transform = stage.getAbsoluteTransform().copy();
      transform.invert();
      selectionStart = transform.point(pointer);

      selectionRect.x = selectionStart.x;
      selectionRect.y = selectionStart.y;
      selectionRect.width = 0;
      selectionRect.height = 0;
      selectionRect.visible = true;
      stageConfig.draggable = false;
      return;
    }

    // Deselecting on empty space is deferred to the stage's CLICK handler, which can tell
    // a real click from a pan. Clearing here, on mousedown, wiped the selection the instant
    // the user pressed to drag the board — so a pan silently lost the selection (and let the
    // halo back in) before a single pixel of movement.
  };

  // Native Konva multi-touch support for pinch-to-zoom
  let lastCenter = null;
  let lastDist = 0;
  let dragStopped = false;

  const getDistance = (p1, p2) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  const getCenter = (p1, p2) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    };
  };

  const handleTouchStart = (e) => {
    // Let Konva handle single touches normally for dragging
    if (e.evt.touches.length === 1) {
      // Only handle if touching empty stage
      const stage = stageRef.value.getStage();
      if (e.target === stage) {
        handleMouseDown(e);
      }
    }
  };

  const handleTouchMove = (e) => {
    e.evt.preventDefault();
    const touch1 = e.evt.touches[0];
    const touch2 = e.evt.touches[1];
    const stage = stageRef.value.getStage();

    // Restore dragging if we go back to single touch
    if (touch1 && !touch2 && !stage.isDragging() && dragStopped) {
      stage.startDrag();
      dragStopped = false;
    }

    if (touch1 && touch2) {
      // Stop Konva's drag if multi-touch detected
      if (stage.isDragging()) {
        dragStopped = true;
        stage.stopDrag();
      }

      const p1 = {
        x: touch1.clientX,
        y: touch1.clientY,
      };
      const p2 = {
        x: touch2.clientX,
        y: touch2.clientY,
      };

      if (!lastCenter) {
        lastCenter = getCenter(p1, p2);
        return;
      }
      const newCenter = getCenter(p1, p2);

      const dist = getDistance(p1, p2);

      if (!lastDist) {
        lastDist = dist;
      }

      // Get stage container bounds for coordinate conversion
      const containerRect = stage.container().getBoundingClientRect();

      // Local coordinates of center point
      const pointTo = {
        x: (newCenter.x - containerRect.left - stage.x()) / stage.scaleX(),
        y: (newCenter.y - containerRect.top - stage.y()) / stage.scaleX(),
      };

      const scale = stage.scaleX() * (dist / lastDist);

      // Apply zoom limits
      const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));

      stage.scaleX(clampedScale);
      stage.scaleY(clampedScale);

      // Calculate new position of the stage
      const dx = newCenter.x - lastCenter.x;
      const dy = newCenter.y - lastCenter.y;

      const newPos = {
        x: newCenter.x - containerRect.left - pointTo.x * clampedScale + dx,
        y: newCenter.y - containerRect.top - pointTo.y * clampedScale + dy,
      };

      stage.position(newPos);
      stage.batchDraw();

      // Update our state
      updateStageOffset();

      lastDist = dist;
      lastCenter = newCenter;
    } else if (touch1 && !touch2) {
      // Single touch - handle normally
      handleMouseMove(e);
    }
  };

  const handleTouchEnd = (e) => {
    lastDist = 0;
    lastCenter = null;

    // Only handle mouseup for single touch on empty stage
    if (e.evt.touches.length === 0) {
      const stage = stageRef.value.getStage();
      if (e.target === stage) {
        handleMouseUp(e);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (!selectionRect.visible) return;

    const stage = stageRef.value.getStage();
    const pointer = stage.getPointerPosition();
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    const pos = transform.point(pointer);

    selectionRect.width = pos.x - selectionStart.x;
    selectionRect.height = pos.y - selectionStart.y;
  };

  const handleMouseUp = () => {
    if (!selectionRect.visible) return;

    const rect = {
      x: Math.min(selectionStart.x, selectionStart.x + selectionRect.width),
      y: Math.min(selectionStart.y, selectionStart.y + selectionRect.height),
      width: Math.abs(selectionRect.width),
      height: Math.abs(selectionRect.height),
    };

    // The rectangle follows whichever selection is live: while photos are marked with the
    // corner circle it marks too, so a big batch does not have to be gathered photo by
    // photo. Marking stays ADDITIVE — that mode exists to pile photos up across several
    // drags.
    const marking = isMarking();
    // The board selection does NOT: each rectangle is the user saying "these ones", and
    // saying it again means somewhere else, so the previous pick is dropped. Growing a
    // selection is the click's job — a click on a photo still adds to it.
    if (!marking) {
      photos.value.forEach((photo) => {
        photo.selected = false;
      });
    }
    photos.value.forEach((photo) => {
      const photoRect = {
        x: photo.config.x,
        y: photo.config.y,
        width: photo.config.width,
        height: photo.config.height,
      };
      if (Konva.Util.haveIntersection(photoRect, rect)) {
        if (marking) photo.checked = true;
        else photo.selected = true;
      }
    });

    selectionRect.visible = false;
    stageConfig.draggable = true;
  };

  const isHoverPhoto = () => {
    const stage = stageRef.value.getStage();
    const pointer = stage.getPointerPosition();
    let shape = stage.getIntersection(pointer);
    let isOverPhoto = false;

    while (shape && shape !== stage) {
      if (shape.getAttr("_isPhoto")) {
        isOverPhoto = true;
        break;
      }
      shape = shape.getParent();
    }

    return isOverPhoto;
  };

  /**
   * Glide the viewport until a given board photo sits in the middle of the visible canvas.
   *
   * Pan only — the zoom is left untouched (the ask was "desplazar hacia ella", not zoom to
   * it). The stage is already sized to the area left of any docked panel, so its own centre
   * is the visible centre. `onUpdate` keeps everything that reads the viewport (the offset,
   * the chat's vision radius) in step through the tween, not just at the end.
   */
  const centerViewOnPhoto = (photoId) => {
    const stage = stageRef.value?.getStage?.();
    if (!stage) return;

    const photo = photos.value.find((p) => Number(p.id) === Number(photoId));
    if (!photo?.config) return;

    const scale = stage.scaleX();
    const centerX = photo.config.x + photo.config.width / 2;
    const centerY = photo.config.y + photo.config.height / 2;

    stage.to({
      x: stage.width() / 2 - centerX * scale,
      y: stage.height() / 2 - centerY * scale,
      duration: 0.4,
      easing: Konva.Easings.EaseInOut,
      onUpdate: updateStageOffset,
      onFinish: updateStageOffset,
    });
  };

  /**
   * Glide the viewport until a world-space rectangle sits in the middle of the canvas.
   *
   * Pan only, like `centerViewOnPhoto` — the zoom the user set is theirs. Used when a
   * materialised group lands somewhere off-screen: the board travels to it, at the scale
   * the user was already working at.
   *
   * @param {{minX: number, minY: number, maxX: number, maxY: number}} bounds
   */
  const centerViewOnBounds = (bounds) => {
    const stage = stageRef.value?.getStage?.();
    if (!stage || !bounds) return;

    const scale = stage.scaleX();
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    stage.to({
      x: stage.width() / 2 - centerX * scale,
      y: stage.height() / 2 - centerY * scale,
      duration: 0.4,
      easing: Konva.Easings.EaseInOut,
      onUpdate: updateStageOffset,
      onFinish: updateStageOffset,
    });
  };

  /**
   * Encaja un rectángulo del tablero en la vista: lo centra y, si no cabe, ALEJA el zoom
   * hasta que quepa. Para resultados que se esparcen más allá del viewport, donde un
   * simple paneo no alcanza porque el problema no es dónde mira la vista sino cuánto abarca.
   *
   * Sólo aleja: acercarse sobre un resultado compacto cambiaría la escala a la que el
   * usuario venía trabajando sin que lo haya pedido, que es la misma razón por la que
   * `centerViewOnPhoto` y `centerViewOnBounds` no tocan el zoom en absoluto.
   */
  const fitViewToBounds = (bounds, padding = 120) => {
    const stage = stageRef.value?.getStage?.();
    if (!stage || !bounds) return;

    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (!(width > 0) || !(height > 0)) return;

    const usableWidth = Math.max(1, stage.width() - padding * 2);
    const usableHeight = Math.max(1, stage.height() - padding * 2);
    const scale = Math.max(
      MIN_ZOOM,
      Math.min(stage.scaleX(), usableWidth / width, usableHeight / height),
    );

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    stage.to({
      scaleX: scale,
      scaleY: scale,
      x: stage.width() / 2 - centerX * scale,
      y: stage.height() / 2 - centerY * scale,
      duration: 0.4,
      easing: Konva.Easings.EaseInOut,
      onUpdate: updateStageOffset,
      onFinish: updateStageOffset,
    });
  };

  let spinnerAnim = null;

  watchPostEffect(() => {
    const stage = stageRef.value?.getStage?.();
    if (!stage) return;

    const layer = stage.getLayers()[0];
    const isAnyLoading = photos.value.some((p) => p.loading);

    if (isAnyLoading && !spinnerAnim) {
      spinnerAnim = new Konva.Animation(() => {
        photos.value.forEach((photo) => {
          if (photo.loading) {
            photo.spinnerRotation = (photo.spinnerRotation || 0) + 6;
          }
        });
      }, layer);
      spinnerAnim.start();
    } else if (!isAnyLoading && spinnerAnim) {
      spinnerAnim.stop();
      spinnerAnim = null;
    }
  });

  return {
    stageConfig,
    stageOffset,
    selectionRect,
    updateStageOffset,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    applyZoom,
    centerViewOnPhoto,
    centerViewOnBounds,
    fitViewToBounds,
  };
}

export const applyZoom = (
  stage,
  newScale,
  updateOffsetFn,
  centerPoint = null,
) => {
  const oldScale = stage.scaleX();

  // Apply zoom limits for better UX
  newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));

  const pointer = centerPoint || {
    x: stage.width() / 2,
    y: stage.height() / 2,
  };

  const mousePointTo = {
    x: (pointer.x - stage.x()) / oldScale,
    y: (pointer.y - stage.y()) / oldScale,
  };

  stage.scale({ x: newScale, y: newScale });

  stage.position({
    x: pointer.x - mousePointTo.x * newScale,
    y: pointer.y - mousePointTo.y * newScale,
  });

  stage.batchDraw();
  updateOffsetFn?.();
};
