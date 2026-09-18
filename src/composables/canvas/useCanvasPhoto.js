import { reactive, ref } from "vue";
import Konva from "konva";
import { useCanvasStore } from "@/stores/canvas";
import { TOOLBAR_WIDTH } from "./useCanvasStage";
import { relaxOverlaps } from "@/utils/canvasLayout";

export function useCanvasPhoto(
  stageRef,
  photos,
  photoRefs,
  stageConfig,
  onCommit = () => {},
) {
  const dragGroupStart = reactive({});
  const hoverTimeouts = reactive({});
  const canvasStore = useCanvasStore();

  const isHoveringTrash = ref(false);

  const handleSelectPhoto = (photo, event) => {
    if (!selectionRectVisible()) {
      photo.selected = !photo.selected;

      // SOLUCIÓN: Reorganizar todo el array de fotos para cambiar el orden de pintado
      // La foto clickeada se mueve al final del array, lo que la hace aparecer encima
      reorganizePhotosOrder(photo.id);
    }
  };

  // Función para reorganizar el orden de las fotos en el array
  const reorganizePhotosOrder = (clickedPhotoId) => {
    const currentPhotos = [...photos.value];

    // Encontrar la foto clickeada
    const clickedPhotoIndex = currentPhotos.findIndex(
      (p) => p.id === clickedPhotoId,
    );
    if (clickedPhotoIndex === -1) return;

    // Remover la foto clickeada de su posición actual
    const clickedPhoto = currentPhotos.splice(clickedPhotoIndex, 1)[0];

    // Si hay fotos seleccionadas, también las movemos al final (pero antes que la clickeada)
    const selectedPhotos = [];
    for (let i = currentPhotos.length - 1; i >= 0; i--) {
      if (currentPhotos[i].selected && currentPhotos[i].id !== clickedPhotoId) {
        selectedPhotos.unshift(currentPhotos.splice(i, 1)[0]);
      }
    }

    // Reorganizar: fotos no seleccionadas + fotos seleccionadas + foto clickeada
    const newPhotosOrder = [...currentPhotos, ...selectedPhotos, clickedPhoto];

    // Actualizar el store - esto forzará un re-render completo del canvas
    canvasStore.photos = newPhotosOrder;
  };

  const selectionRectVisible = () => false;

  const handleDragStart = (photo, e) => {
    e.cancelBubble = true;

    // Mark that this photo is being dragged to prevent selection on click
    photo._wasDragged = true;

    // Limpiar dragGroupStart antes de inicializar nuevas posiciones
    Object.keys(dragGroupStart).forEach((k) => delete dragGroupStart[k]);

    // Inicializar dragGroupStart INMEDIATAMENTE con las posiciones actuales
    // ANTES de reorganizar para evitar race conditions
    if (photo.selected) {
      photos.value.forEach((p) => {
        if (p.selected) {
          dragGroupStart[p.id] = { x: p.config.x, y: p.config.y };
          // Mark all selected photos as being dragged
          p._wasDragged = true;
        }
      });
    } else {
      dragGroupStart[photo.id] = { x: photo.config.x, y: photo.config.y };
    }

    // SOLUCIÓN: Reorganizar el orden de las fotos DESPUÉS de inicializar dragGroupStart
    // Esto preserva el z-index logic pero evita problemas de timing
    reorganizePhotosOrder(photo.id);
  };

  const handleDragMove = (photo, e) => {
    const newX = e.target.x();
    const newY = e.target.y();
    const origin = dragGroupStart[photo.id];

    // Validar que origin existe para evitar errores
    if (!origin) {
      // Si no existe origin, inicializarlo con la posición actual
      dragGroupStart[photo.id] = { x: photo.config.x, y: photo.config.y };
      return; // Salir y esperar al siguiente evento de drag
    }

    const deltaX = newX - origin.x;
    const deltaY = newY - origin.y;

    if (photo.selected) {
      photos.value.forEach((p) => {
        if (p.selected && dragGroupStart[p.id]) {
          p.config.x = dragGroupStart[p.id].x + deltaX;
          p.config.y = dragGroupStart[p.id].y + deltaY;
        }
      });
    } else {
      photo.config.x = newX;
      photo.config.y = newY;
    }

    const anyInTrash = photo.selected
      ? photos.value.some((p) => p.selected && isInTrashZone(p))
      : isInTrashZone(photo);

    isHoveringTrash.value = anyInTrash;

    photos.value.forEach((p) => {
      if (photo.selected) {
        p.inTrash = p.selected && anyInTrash;
      } else {
        p.inTrash = p.id === photo.id && anyInTrash;
      }
    });
  };

  function isInTrashZone(photo) {
    const trashEl = document.querySelector(".trash-zone");
    if (!trashEl) return false;

    const trashRect = trashEl.getBoundingClientRect();

    // Expandimos la zona virtual de la papelera
    const margin = 30; // píxeles extra de margen de detección

    const expandedRect = {
      left: trashRect.left - margin,
      right: trashRect.right + margin,
      top: trashRect.top - margin,
      bottom: trashRect.bottom + margin,
    };

    const stage = stageRef.value.getStage();
    const { x, y, width, height } = photo.config;
    const centerKonva = { x: x + width / 2, y: y + height / 2 };
    const centerScreen = stage.getAbsoluteTransform().point(centerKonva);

    const containerRect = stage.container().getBoundingClientRect();
    const screenX = containerRect.left + centerScreen.x;
    const screenY = containerRect.top + centerScreen.y;

    return (
      screenX >= expandedRect.left &&
      screenX <= expandedRect.right &&
      screenY >= expandedRect.top &&
      screenY <= expandedRect.bottom
    );
  }

  /** Let the next click be a click again, once the drag has settled. */
  const releaseDragFlags = (photo) => {
    setTimeout(() => {
      photo._wasDragged = false;
      if (photo.selected) {
        photos.value.forEach((p) => {
          if (p.selected) p._wasDragged = false;
        });
      }
    }, 50);
  };

  const SNAP_MAX_DIST = 300; // distancia máxima a la que el snap busca un encaje
  const SNAP_MIN_GAP = 35; // separación mínima entre el bloque y sus vecinas

  const rectOf = (photo) => {
    const { x, y, width, height } = photo.config;
    return { left: x, top: y, right: x + width, bottom: y + height };
  };

  const rectsOverlap = (a, b, padding) =>
    a.left - padding < b.right &&
    a.right + padding > b.left &&
    a.top - padding < b.bottom &&
    a.bottom + padding > b.top;

  /**
   * Traslación que encaja `moving` entre sus vecinas sin pisar a ninguna.
   *
   * El bloque se mueve rígido: el mismo desplazamiento para todas sus fotos, así que sirve
   * igual para una foto suelta que para un grupo, y un grupo con forma irregular conserva
   * su forma. Para cada par (foto del bloque, foto vecina) hay cuatro desplazamientos que
   * la dejan bien colocada en cada eje — bordes alineados a un lado o al otro, o pegada
   * con la separación mínima a un lado o al otro — y las combinaciones de esos
   * desplazamientos en X y en Y son los encajes candidatos. Gana el más cercano al punto
   * donde se soltó que no solape con ninguna foto del tablero; si no hay ninguno al
   * alcance, no hay snap y el bloque se queda donde cayó.
   *
   * El solape se comprueba foto a foto, no con el bounding box del bloque, para que un
   * grupo con huecos pueda encajar rodeando a otras fotos.
   */
  const computeSnapDelta = (moving, others) => {
    const movingRects = moving.map(rectOf);
    const otherRects = others.map(rectOf);

    const reach = SNAP_MAX_DIST + SNAP_MIN_GAP;
    const near = otherRects.filter((o) =>
      movingRects.some((m) => rectsOverlap(m, o, reach)),
    );
    if (!near.length) return null;

    const dxs = new Set();
    const dys = new Set();
    const consider = (set, value) => {
      if (Math.abs(value) <= SNAP_MAX_DIST) set.add(Math.round(value));
    };
    for (const m of movingRects) {
      for (const n of near) {
        consider(dxs, n.left - m.left);
        consider(dxs, n.right - m.right);
        consider(dxs, n.right + SNAP_MIN_GAP - m.left);
        consider(dxs, n.left - SNAP_MIN_GAP - m.right);
        consider(dys, n.top - m.top);
        consider(dys, n.bottom - m.bottom);
        consider(dys, n.bottom + SNAP_MIN_GAP - m.top);
        consider(dys, n.top - SNAP_MIN_GAP - m.bottom);
      }
    }

    const candidates = [];
    for (const dx of dxs) {
      for (const dy of dys) {
        const dist = Math.hypot(dx, dy);
        if (dist <= SNAP_MAX_DIST) candidates.push({ dx, dy, dist });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);

    // Un pelo por debajo de la separación mínima: los candidatos pegados a una vecina
    // quedan exactamente a SNAP_MIN_GAP y el redondeo no debe descartarlos.
    const clearance = SNAP_MIN_GAP - 1;
    for (const { dx, dy } of candidates) {
      const collides = movingRects.some((m) => {
        const moved = {
          left: m.left + dx,
          top: m.top + dy,
          right: m.right + dx,
          bottom: m.bottom + dy,
        };
        return otherRects.some((o) => rectsOverlap(moved, o, clearance));
      });
      if (!collides) return { dx, dy };
    }
    return null;
  };

  /**
   * Aplica el snap a un conjunto de fotos que acaba de moverse, como un bloque rígido.
   * Sirve tanto para el arrastre de una foto suelta como para el del marco de selección.
   */
  const snapPhotosToNeighbors = (moving) => {
    const movingIds = new Set(moving.map((p) => p.id));
    const others = photos.value.filter((p) => !movingIds.has(p.id));
    if (!others.length) return;

    const delta = computeSnapDelta(moving, others);
    if (!delta) return;

    moving.forEach((p) => {
      p.config.x += delta.dx;
      p.config.y += delta.dy;
      const node = photoRefs.value[p.id]?.getNode();
      if (node) {
        node.x(p.config.x);
        node.y(p.config.y);
      }
    });
  };

  const handleDragEnd = (photo, evt, enableSnap = true) => {
    const node = evt.target;

    // Actualizar posición de la foto
    const newPos = node.position();
    photo.config.x = newPos.x;
    photo.config.y = newPos.y;

    if (enableSnap) {
      const isGroupDrag =
        photo.selected &&
        photos.value.some((p) => p.selected && p.id !== photo.id);
      snapPhotosToNeighbors(
        isGroupDrag ? photos.value.filter((p) => p.selected) : [photo],
      );
    }

    // --- BASURA (trash) logic ---
    let photosToRemove = [];
    if (photo.selected) {
      const selected = photos.value.filter((p) => p.selected);
      if (selected.some((p) => isInTrashZone(p))) photosToRemove = selected;
    } else if (isInTrashZone(photo)) {
      photosToRemove = [photo];
    }

    if (photosToRemove.length) {
      canvasStore.deletePhotos(photosToRemove.map((p) => p.id));
      isHoveringTrash.value = false;
    }

    releaseDragFlags(photo);

    // One history entry per drag: positions are final now (dragmove only touched the live
    // node/config, never a commit). If the drag ended in the trash, deletePhotos already
    // recorded it and this commit is a no-op.
    onCommit();
  };

  const handleMouseOver = (photo) => {
    // Cancelar su propio timeout si estaba en curso
    if (hoverTimeouts[photo.id]) {
      clearTimeout(hoverTimeouts[photo.id]);
      hoverTimeouts[photo.id] = null;
    }

    // Desactivar hovered en otras fotos (y cancelar sus timeouts)
    photos.value.forEach((p) => {
      if (p.id !== photo.id) {
        if (hoverTimeouts[p.id]) {
          clearTimeout(hoverTimeouts[p.id]);
          hoverTimeouts[p.id] = null;
        }
        if (p.hovered) {
          p.hovered = false;
        }
      }
    });

    // Activar hovered en esta foto
    photo.hovered = true;
  };

  const handleMouseOut = (photo) => {
    // Si ya hay un timeout, lo cancelamos por seguridad
    if (hoverTimeouts[photo.id]) clearTimeout(hoverTimeouts[photo.id]);

    // Programamos desactivar hovered después del delay
    hoverTimeouts[photo.id] = setTimeout(() => {
      photo.hovered = false;
      hoverTimeouts[photo.id] = null;
    }, 250); // o el tiempo que quieras
  };

  const autoAlignPhotos = () => {
    const threshold = 50; // cuánto margen permitimos para decir que están "casi alineados"
    for (let i = 0; i < photos.value.length; i++) {
      for (let j = i + 1; j < photos.value.length; j++) {
        const photoA = photos.value[i];
        const photoB = photos.value[j];

        const dx = Math.abs(photoA.config.x - photoB.config.x);
        const dy = Math.abs(photoA.config.y - photoB.config.y);

        if (dx < threshold) {
          // Alinear verticalmente
          const targetX = Math.round((photoA.config.x + photoB.config.x) / 2);
          movePhotoSmoothly(photoA, targetX, photoA.config.y);
          movePhotoSmoothly(photoB, targetX, photoB.config.y);
        }

        if (dy < threshold) {
          // Alinear horizontalmente
          const targetY = Math.round((photoA.config.y + photoB.config.y) / 2);
          movePhotoSmoothly(photoA, photoA.config.x, targetY);
          movePhotoSmoothly(photoB, photoB.config.x, targetY);
        }
      }
    }
  };

  const unstackPhotos = () => {
    if (photos.value.length < 2) return;

    relaxOverlaps(photos.value.map((photo) => photo.config));

    // Animar suavemente a las posiciones finales con animación más rápida y ligera
    photos.value.forEach((photo, index) => {
      if (photoRefs.value[photo.id]) {
        const node = photoRefs.value[photo.id].getNode();
        new Konva.Tween({
          node,
          duration: 0.35, // reducido de 0.6 para ser más rápido
          x: photo.config.x,
          y: photo.config.y,
          easing: Konva.Easings.EaseInOut, // cambiado de EaseOut para ser más suave
        }).play();
      }
    });

    // Positions are already committed to config above; the tween is only cosmetic.
    onCommit();
  };

  const movePhotoSmoothly = (photo, targetX, targetY) => {
    if (!photoRefs.value[photo.id]) return;
    const node = photoRefs.value[photo.id].getNode();
    new Konva.Tween({
      node,
      duration: 0.5,
      x: targetX,
      y: targetY,
      easing: Konva.Easings.StrongEaseInOut,
    }).play();
    photo.config.x = targetX;
    photo.config.y = targetY;
  };

  const bringPhotosToFront = (photoList) => {
    photoList.forEach((photo) => {
      const node = photoRefs.value[photo.id]?.getNode();
      if (node) node.moveToTop();
    });
    const anyNode = photoRefs.value[photoList[0]?.id]?.getNode();
    if (anyNode) anyNode.getLayer().batchDraw();
  };

  function handlePhotoDrop(event, removePhotoFromToolbar) {
    event.preventDefault();

    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return 0;

    const droppedPhotos = JSON.parse(raw);
    if (!Array.isArray(droppedPhotos) || droppedPhotos.length === 0) return 0;

    const stage = stageRef.value.getStage();
    const containerRect = stage.container().getBoundingClientRect();
    const transform = stage.getAbsoluteTransform().copy().invert();

    const pointer = {
      x: event.clientX - containerRect.left,
      y: event.clientY - containerRect.top,
    };

    const stagePoint = transform.point(pointer);

    const defaultWidth = 200;
    const defaultHeight = 140;
    const spreadOffset = 30; // distancia entre cada foto

    droppedPhotos.forEach((photo, index) => {
      const width = photo.config?.width || defaultWidth;
      const height = photo.config?.height || defaultHeight;

      const offsetX = spreadOffset * index;
      const offsetY = spreadOffset * index;

      photo.config = {
        x: stagePoint.x - width / 2 + offsetX,
        y: stagePoint.y - height / 2 + offsetY,
        width,
        height,
      };

      canvasStore.addPhotos([photo]);
      removePhotoFromToolbar(photo.id);
    });

    return droppedPhotos.length;
  }

  return {
    handleSelectPhoto,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleMouseOver,
    handleMouseOut,
    autoAlignPhotos,
    unstackPhotos,
    isHoveringTrash,
    handlePhotoDrop,
    reorganizePhotosOrder,
    snapPhotosToNeighbors,
  };
}
