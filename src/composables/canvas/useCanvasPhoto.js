import { reactive, ref } from "vue";
import Konva from "konva";
import { useCanvasStore } from "@/stores/canvas";
import { TOOLBAR_WIDTH } from "./useCanvasStage";

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

  const handleDragEnd = (photo, evt, enableSnap = true) => {
    const node = evt.target;

    // Actualizar posición de la foto
    const newPos = node.position();
    photo.config.x = newPos.x;
    photo.config.y = newPos.y;

    // Deshabilitar auto-align si hay múltiples fotos seleccionadas para evitar
    // que una foto del grupo se desincronice del resto
    const isGroupDrag =
      photo.selected && photos.value.filter((p) => p.selected).length > 1;
    const shouldSnap = enableSnap && !isGroupDrag;

    if (shouldSnap) {
      const MAX_DIST = 300; // distancia máxima para snap
      const others = photos.value.filter((p) => p.id !== photo.id);
      if (others.length) {
        let closest = null;
        let minDist = Infinity;
        // Encontrar la foto más cercana
        for (const p of others) {
          const dx = photo.config.x - p.config.x;
          const dy = photo.config.y - p.config.y;
          const dist = Math.hypot(dx, dy);
          if (dist < minDist) {
            minDist = dist;
            closest = p;
          }
        }

        // Solo alinear si la más cercana está dentro de MAX_DIST
        if (closest && minDist <= MAX_DIST) {
          // Determinar eje de alineación según posición relativa
          const dx = closest.config.x - photo.config.x;
          const dy = closest.config.y - photo.config.y;
          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const MIN_GAP = 35; // separación mínima

          if (absDy > absDx) {
            // Alinear verticalmente (coincidir X)
            photo.config.x = closest.config.x;
            node.x(photo.config.x);
            // Ajustar Y para mantener separación mínima
            if (dy > 0) {
              // closest está debajo
              photo.config.y = closest.config.y - photo.config.height - MIN_GAP;
            } else {
              // closest está encima
              photo.config.y =
                closest.config.y + closest.config.height + MIN_GAP;
            }
            node.y(photo.config.y);
          } else {
            // Alinear horizontalmente (coincidir Y)
            photo.config.y = closest.config.y;
            node.y(photo.config.y);
            // Ajustar X para mantener separación mínima
            if (dx > 0) {
              // closest a la derecha
              photo.config.x = closest.config.x - photo.config.width - MIN_GAP;
            } else {
              // closest a la izquierda
              photo.config.x =
                closest.config.x + closest.config.width + MIN_GAP;
            }
            node.x(photo.config.x);
          }
        }
      }
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

    const iterations = 150; // reducido de 100 para ser más rápido
    const repulsionStrength = 200; // reducido de 300 para menor separación
    const damping = 0.85; // aumentado ligeramente para más estabilidad
    const minMargin = 20; // reducido de 15 para separación más compacta
    const convergenceThreshold = 0.05; // más estricto para mejor convergencia

    // Inicializar velocidades para cada foto
    const velocities = photos.value.map(() => ({ x: 0, y: 0 }));

    let converged = false;
    let iteration = 0;

    while (iteration < iterations && !converged) {
      const forces = photos.value.map(() => ({ x: 0, y: 0 }));
      let maxForce = 0;

      // Calcular fuerzas de repulsión entre todas las fotos
      for (let i = 0; i < photos.value.length; i++) {
        for (let j = i + 1; j < photos.value.length; j++) {
          const photoA = photos.value[i];
          const photoB = photos.value[j];

          const centerAX = photoA.config.x + photoA.config.width / 2;
          const centerAY = photoA.config.y + photoA.config.height / 2;
          const centerBX = photoB.config.x + photoB.config.width / 2;
          const centerBY = photoB.config.y + photoB.config.height / 2;

          const dx = centerBX - centerAX;
          const dy = centerBY - centerAY;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Distancia mínima deseada entre centros (más compacta)
          const minDistance = Math.max(
            (photoA.config.width + photoB.config.width) / 2 + minMargin,
            (photoA.config.height + photoB.config.height) / 2 + minMargin,
          );

          if (distance < minDistance && distance > 0) {
            // Calcular fuerza de repulsión con curva más suave
            const overlap = (minDistance - distance) / minDistance;
            const forceStrength = overlap * overlap * repulsionStrength; // curva cuadrática para más suavidad
            const forceX = (dx / distance) * forceStrength;
            const forceY = (dy / distance) * forceStrength;

            // Aplicar fuerzas opuestas a ambas fotos
            forces[i].x -= forceX;
            forces[i].y -= forceY;
            forces[j].x += forceX;
            forces[j].y += forceY;

            maxForce = Math.max(maxForce, Math.abs(forceX), Math.abs(forceY));
          }
        }
      }

      // Actualizar velocidades y posiciones
      for (let i = 0; i < photos.value.length; i++) {
        // Actualizar velocidad con amortiguación y factor de tiempo más pequeño
        velocities[i].x = (velocities[i].x + forces[i].x * 0.05) * damping;
        velocities[i].y = (velocities[i].y + forces[i].y * 0.05) * damping;

        // Actualizar posición
        photos.value[i].config.x += velocities[i].x;
        photos.value[i].config.y += velocities[i].y;
      }

      // Verificar convergencia
      converged = maxForce < convergenceThreshold;
      iteration++;
    }

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
  };
}
