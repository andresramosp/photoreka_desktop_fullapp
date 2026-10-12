// src/composables/usePhotoAnimations.js
import Konva from "konva";
import { nextTick } from "vue";

export function usePhotoAnimations() {
  const animatePhoto = (groupNode, targetX, targetY, duration = 0.7) => {
    new Konva.Tween({
      node: groupNode,
      duration,
      x: targetX,
      y: targetY,
      opacity: 1,
      easing: Konva.Easings.StrongEaseInOut,
    }).play();
  };

  const animatePhotoGroup = (
    photoRefs,
    photos,
    basePosition,
    position,
    offsetX,
    offsetY,
    expansionType = "linear" // por defecto "linear"
  ) => {
    nextTick(() => {
      const newPhotos = photos.value.filter((p) => p.config.opacity === 0);
      const n = newPhotos.length;

      newPhotos.forEach((newPhoto, index) => {
        const groupNode = photoRefs.value[newPhoto.id]?.getNode();
        if (!groupNode) return;

        let targetX = basePosition.x;
        let targetY = basePosition.y;

        if (["left", "right", "upper", "bottom"].includes(position)) {
          const isHorizontal = position === "left" || position === "right";
          const isPositive = position === "right" || position === "bottom";

          if (expansionType === "linear") {
            // Expansión normal, misma dirección
            if (isHorizontal) {
              targetX += (isPositive ? 1 : -1) * offsetX * (index + 1);
            } else {
              targetY += (isPositive ? 1 : -1) * offsetY * (index + 1);
            }
          } else if (expansionType === "perpendicular") {
            // Expansión en eje perpendicular, centrada
            const relativeIndex = index - (n - 1) / 2;

            if (isHorizontal) {
              // Mueves a la derecha/izquierda (X), pero expandes en columnas verticales (Y)
              targetX += (isPositive ? 1 : -1) * offsetX;
              targetY += relativeIndex * offsetY;
            } else {
              // Mueves arriba/abajo (Y), pero expandes en filas horizontales (X)
              targetY += (isPositive ? 1 : -1) * offsetY;
              targetX += relativeIndex * offsetX;
            }
          }
        } else if (
          ["upper-left", "upper-right", "bottom-right", "bottom-left"].includes(
            position
          )
        ) {
          if (expansionType === "linear") {
            const signX = position.includes("left") ? -1 : 1;
            const signY = position.includes("upper") ? -1 : 1;
            targetX += signX * offsetX * (index + 1);
            targetY += signY * offsetY * (index + 1);
          }
          // En perpendicular no expandimos diagonales
        }

        animatePhoto(groupNode, targetX, targetY, 0.7);
        setTimeout(() => {
          newPhoto.config.x = targetX;
          newPhoto.config.y = targetY;
          newPhoto.config.opacity = 1;
        }, 700);
      });
    });
  };

  const animatePhotoGroupExplosion = (
    photoRefs,
    photos,
    basePosition,
    position
  ) => {
    nextTick(() => {
      const newPhotos = photos.value.filter((p) => p.config.opacity === 0);
      // Constantes para el efecto de explosión
      const ANGLE_STEP = 55 - 5 * newPhotos.length; // separación angular entre fotos en una capa
      const EXPLOSION_DISTANCE = 250 + newPhotos.length * 45; // distancia base (disparo de 1 foto)
      const NUM_LAYERS = 1; // número de capas del abanico

      // Determinar el ángulo base según la dirección indicada
      let baseAngle = 0;
      switch (position) {
        case "left":
          baseAngle = 180;
          break;
        case "right":
          baseAngle = 0;
          break;
        case "upper":
          baseAngle = -90;
          break;
        case "bottom":
          baseAngle = 90;
          break;
        case "upper-left":
          baseAngle = 225;
          break;
        case "upper-right":
          baseAngle = -45;
          break;
        case "bottom-right":
          baseAngle = 45;
          break;
        case "bottom-left":
          baseAngle = 135;
          break;
        default:
          baseAngle = 0;
      }

      const totalPhotos = newPhotos.length;
      // Si hay menos fotos que capas deseadas, las colocamos todas en una capa
      const actualLayers = totalPhotos < NUM_LAYERS ? 1 : NUM_LAYERS;
      const photosPerLayer = Math.ceil(totalPhotos / actualLayers);

      newPhotos.forEach((newPhoto, index) => {
        const groupNode = photoRefs.value[newPhoto.id]?.getNode();
        if (!groupNode) return;

        const layer = Math.floor(index / photosPerLayer);
        const indexInLayer = index % photosPerLayer;
        let layerCount;
        if (layer === actualLayers - 1) {
          layerCount = totalPhotos - photosPerLayer * layer;
        } else {
          layerCount = photosPerLayer;
        }
        // Calcular el centro de la capa y distribuir las fotos simétricamente
        const mid = (layerCount - 1) / 2;
        const angleOffset = (indexInLayer - mid) * ANGLE_STEP;
        const angleDeg = baseAngle + angleOffset;
        const angleRad = (angleDeg * Math.PI) / 180;
        // La distancia radial aumenta con cada capa
        const radialDistance = (layer * 0.8 + 1) * EXPLOSION_DISTANCE;

        const targetX = basePosition.x + radialDistance * Math.cos(angleRad);
        const targetY = basePosition.y + radialDistance * Math.sin(angleRad);

        animatePhoto(groupNode, targetX, targetY, 0.7);
        setTimeout(() => {
          newPhoto.config.x = targetX;
          newPhoto.config.y = targetY;
          newPhoto.config.opacity = 1;
        }, 700);
      });
    });
  };

  return { animatePhoto, animatePhotoGroup, animatePhotoGroupExplosion };
}
