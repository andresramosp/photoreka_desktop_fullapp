// src/composables/useCanvasStage.js
import { reactive, watch, watchPostEffect } from "vue";
import Konva from "konva";

// Enable all events on Konva for multi-touch support
Konva.hitOnDragEnabled = true;

const TOOLBAR_WIDTH = 260;

export { TOOLBAR_WIDTH };

export function useCanvasStage(stageRef, photos, toolbarState) {
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
      const minZoom = 0.1;
      const maxZoom = 5;
      const clampedScale = Math.max(minZoom, Math.min(maxZoom, scale));

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

    // Additive: the rectangle only ever ADDS to the selection, never clears what is already
    // picked. So the user can gather photos from several corners of the board with a few
    // separate drags. Deselecting is the other gestures' job — a click on empty space, or
    // clicking a photo to toggle it off.
    photos.value.forEach((photo) => {
      const photoRect = {
        x: photo.config.x,
        y: photo.config.y,
        width: photo.config.width,
        height: photo.config.height,
      };
      if (Konva.Util.haveIntersection(photoRect, rect)) {
        photo.selected = true;
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
  const minZoom = 0.1;
  const maxZoom = 5;
  newScale = Math.max(minZoom, Math.min(maxZoom, newScale));

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
