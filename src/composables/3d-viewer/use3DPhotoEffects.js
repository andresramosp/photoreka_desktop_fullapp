/**
 * use3DPhotoEffects.js
 *
 * Composable para gestionar efectos visuales y optimizaciones de renderizado 3D:
 * - Billboarding (orientación hacia cámara)
 * - Fade basado en densidad direccional
 * - Frustum culling con Octree
 * - Escalado radial de posiciones
 * - Transiciones animadas de posición
 * - Gestión de visibilidad
 */

import { ref, computed } from "vue";
import * as THREE from "three";
import { useOctree } from "@/composables/3d-viewer/useOctree.js";

// ===== Configuración de fade por densidad =====
const FORWARD_CHECK_DISTANCE = 80;
const FORWARD_CONE_ANGLE = 60;
const DENSITY_MIN_PHOTOS = 5;
const DENSITY_MAX_PHOTOS = 40;
const FADE_START_DISTANCE = 20;
const FADE_END_DISTANCE = 200;
const DENSITY_SMOOTHING = 0.17;
const MAX_PHOTOS_FOR_BILLBOARD = 650; // Límite durante movimiento
const MAX_PHOTOS_FOR_BILLBOARD_STATIC = 2000; // Límite cuando está quieto

// ===== Configuración de detección de movimiento =====
const CAMERA_IDLE_THRESHOLD = 0.01; // Umbral de movimiento para considerar cámara quieta
const CAMERA_IDLE_TIME = 300; // Milisegundos sin movimiento para considerar cámara quieta

// ===== Configuración de transiciones =====
const TRANSITION_DURATION = 1500; // 1.5 segundos

export function use3DPhotoEffects() {
  // ===== Estado de visibilidad =====
  const visiblePhotos = ref([]);
  const cachedPhotosSet = new Set();

  // ===== Estado de transiciones =====
  const isTransitioning = ref(false);
  const animationStartTime = ref(0);
  let animationTargetPositions = [];
  let pendingOriginalPositionsUpdate = null;

  // ===== Estado de escalado =====
  const inflateFactor = ref(2);
  const originalPositions = ref([]);

  // ===== Billboarding =====
  const useBillboarding = ref(true);

  // ===== Detección de movimiento de cámara =====
  const isCameraMoving = ref(false);
  let lastCameraPosition = new THREE.Vector3();
  let lastCameraRotation = new THREE.Quaternion();
  let lastMovementTime = 0;

  // ===== Octree =====
  const {
    buildOctree,
    queryFrustum,
    queryRadius,
    getStats: getOctreeStats,
    clear: clearOctree,
  } = useOctree(8, 5);
  const octreeNeedsRebuild = ref(true);

  // ===== Objetos reutilizables Three.js =====
  const reusableFrustum = new THREE.Frustum();
  const reusableMatrix = new THREE.Matrix4();
  const reusableVector3 = new THREE.Vector3();
  const reusableSphere = new THREE.Sphere();

  // ===== Estado de densidad =====
  let currentDensityFactor = 0;

  /**
   * Función de easing para animaciones suaves
   */
  const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  /**
   * Calcular posiciones escaladas radialmente
   */
  const calculateScaledPositions = (positions, scaleFactor) => {
    if (positions.length === 0) {
      console.warn("⚠️ calculateScaledPositions: array de posiciones vacío");
      return [];
    }

    const centroid = [
      positions.reduce((sum, pos) => sum + pos[0], 0) / positions.length,
      positions.reduce((sum, pos) => sum + pos[1], 0) / positions.length,
      positions.reduce((sum, pos) => sum + pos[2], 0) / positions.length,
    ];

    const scaledPositions = positions.map((originalPos) => {
      const vector = [
        originalPos[0] - centroid[0],
        originalPos[1] - centroid[1],
        originalPos[2] - centroid[2],
      ];

      return [
        centroid[0] + vector[0] * scaleFactor,
        centroid[1] + vector[1] * scaleFactor,
        centroid[2] + vector[2] * scaleFactor,
      ];
    });

    return scaledPositions;
  };

  /**
   * Animar transición entre posiciones
   */
  const animatePositionTransition = (
    photosWithMaterials,
    fromPositions,
    toPositions,
    newOriginalPositions = null
  ) => {
    if (fromPositions.length !== toPositions.length) {
      console.warn("⚠️ Número diferente de posiciones en la transición:", {
        from: fromPositions.length,
        to: toPositions.length,
      });

      const minLength = Math.min(fromPositions.length, toPositions.length);
      const adjustedFromPositions = fromPositions.slice(0, minLength);
      const adjustedToPositions = toPositions.slice(0, minLength);

      return animatePositionTransition(
        photosWithMaterials,
        adjustedFromPositions,
        adjustedToPositions,
        newOriginalPositions
      );
    }

    if (fromPositions.length === 0) {
      console.warn("⚠️ No hay posiciones para animar");
      return;
    }

    animationTargetPositions = [...toPositions];
    pendingOriginalPositionsUpdate = newOriginalPositions;

    isTransitioning.value = true;
    animationStartTime.value = performance.now();
  };

  /**
   * Actualizar posiciones durante animación
   */
  const updateTransitionPositions = (photosWithMaterials, currentTime) => {
    if (!isTransitioning.value || animationTargetPositions.length === 0) {
      return false;
    }

    const elapsed = currentTime - animationStartTime.value;
    const progress = Math.min(elapsed / TRANSITION_DURATION, 1);
    const easedProgress = easeInOutCubic(progress);

    const maxIndex = Math.min(
      photosWithMaterials.length,
      animationTargetPositions.length
    );

    for (let index = 0; index < maxIndex; index++) {
      const photo = photosWithMaterials[index];
      const targetPos = animationTargetPositions[index];
      const startPos = photo.transitionStartPosition || photo.position;

      photo.position = [
        startPos[0] + (targetPos[0] - startPos[0]) * easedProgress,
        startPos[1] + (targetPos[1] - startPos[1]) * easedProgress,
        startPos[2] + (targetPos[2] - startPos[2]) * easedProgress,
      ];

      if (photo.lodObject) {
        photo.lodObject.position.set(
          photo.position[0],
          photo.position[1],
          photo.position[2]
        );
      }
    }

    if (progress >= 1) {
      isTransitioning.value = false;

      const maxFinalIndex = Math.min(
        photosWithMaterials.length,
        animationTargetPositions.length
      );
      for (let index = 0; index < maxFinalIndex; index++) {
        photosWithMaterials[index].position = [
          ...animationTargetPositions[index],
        ];
      }

      if (pendingOriginalPositionsUpdate) {
        originalPositions.value = pendingOriginalPositionsUpdate;
        console.log("✅ originalPositions actualizado después de la animación");
      }

      photosWithMaterials.forEach((photo) => {
        delete photo.transitionStartPosition;
      });

      animationTargetPositions = [];
      pendingOriginalPositionsUpdate = null;

      octreeNeedsRebuild.value = true;

      return true; // Transición completada
    }

    return false; // Transición en curso
  };

  /**
   * Aplicar escalado radial a las posiciones
   */
  const applyRadialScaling = (photosWithMaterials) => {
    if (
      photosWithMaterials.length === 0 ||
      originalPositions.value.length === 0
    )
      return;

    if (isTransitioning.value) {
      console.log("⏸️ Escalado radial pospuesto: animación en curso");
      return;
    }

    const scaledPositions = calculateScaledPositions(
      originalPositions.value,
      inflateFactor.value
    );

    photosWithMaterials.forEach((photo, index) => {
      if (index >= scaledPositions.length) return;
      photo.position = scaledPositions[index];

      if (photo.lodObject) {
        photo.lodObject.position.set(
          photo.position[0],
          photo.position[1],
          photo.position[2]
        );
      }
    });
  };

  /**
   * Actualizar fotos visibles con frustum culling + Octree
   */
  const updateVisiblePhotos = (camera, photosWithMaterials, filteredPhotos) => {
    if (!camera || filteredPhotos.length === 0) {
      visiblePhotos.value = [];
      return;
    }

    // Reconstruir octree si es necesario
    if (octreeNeedsRebuild.value && filteredPhotos.length > 0) {
      buildOctree(filteredPhotos);
      octreeNeedsRebuild.value = false;
      const stats = getOctreeStats();
      console.log("🌳 Octree rebuilt for frustum culling:", stats);
    }

    // Mantener fotos filtradas con opacity=0
    const filteredIds = new Set(filteredPhotos.map((p) => p.id));
    photosWithMaterials.forEach((photo) => {
      if (
        !filteredIds.has(photo.id) &&
        photo.lodObject &&
        photo.lodObject.material
      ) {
        photo.lodObject.material.opacity = 0;
        photo.lodObject.material.transparent = true;
      }
    });

    // Configurar frustum
    reusableMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    reusableFrustum.setFromProjectionMatrix(reusableMatrix);

    // Query octree
    const candidatePhotos =
      filteredPhotos.length > 100
        ? queryFrustum(reusableFrustum)
        : filteredPhotos;

    // Filtrar con frustum
    visiblePhotos.value = candidatePhotos.filter((photo) => {
      if (photo.isVisible === false) {
        return false;
      }

      reusableVector3.set(...photo.position);
      reusableSphere.set(reusableVector3, 2);

      const isInFrustum = reusableFrustum.intersectsSphere(reusableSphere);

      return isInFrustum;
    });

    // Actualizar cache
    visiblePhotos.value.forEach((photo) => {
      if (photo.__textureLoaded) {
        cachedPhotosSet.add(photo.id);
      }
    });
  };

  /**
   * Detectar si la cámara está en movimiento
   */
  const updateCameraMovementState = (camera) => {
    if (!camera) return;

    const currentTime = performance.now();
    const currentPosition = camera.position.clone();
    const currentRotation = camera.quaternion.clone();

    // Calcular diferencias de posición y rotación
    const positionDelta = currentPosition.distanceTo(lastCameraPosition);
    const rotationDelta = 1 - Math.abs(lastCameraRotation.dot(currentRotation));

    // Detectar movimiento significativo
    const hasMovement =
      positionDelta > CAMERA_IDLE_THRESHOLD ||
      rotationDelta > CAMERA_IDLE_THRESHOLD;

    if (hasMovement) {
      lastMovementTime = currentTime;
      isCameraMoving.value = true;
    } else {
      // Verificar si ha pasado suficiente tiempo sin movimiento
      const timeSinceLastMovement = currentTime - lastMovementTime;
      if (timeSinceLastMovement > CAMERA_IDLE_TIME) {
        isCameraMoving.value = false;
      }
    }

    // Actualizar estado anterior
    lastCameraPosition.copy(currentPosition);
    lastCameraRotation.copy(currentRotation);
  };

  /**
   * Calcular distancias para todas las fotos visibles
   */
  const calculateDistancesForVisiblePhotos = (cameraPosition) => {
    return visiblePhotos.value.map((photo) => {
      const distSq =
        Math.pow(cameraPosition.x - photo.position[0], 2) +
        Math.pow(cameraPosition.y - photo.position[1], 2) +
        Math.pow(cameraPosition.z - photo.position[2], 2);

      return {
        photo,
        distSq,
        distance: Math.sqrt(distSq),
      };
    });
  };

  /**
   * Actualizar rotaciones billboard
   * - Si la cámara está en movimiento: limita a MAX_PHOTOS_FOR_BILLBOARD para mejor rendimiento
   * - Si la cámara está quieta: limita a MAX_PHOTOS_FOR_BILLBOARD_STATIC para mejor calidad
   */
  const updateBillboardRotations = (photosWithDistances, cameraPosition) => {
    if (!cameraPosition || photosWithDistances.length === 0) return;

    let photosToProcess = photosWithDistances;

    // 🎯 Aplicar límite según estado de movimiento
    if (isCameraMoving.value) {
      // Durante movimiento: límite más restrictivo
      if (photosWithDistances.length > MAX_PHOTOS_FOR_BILLBOARD) {
        photosToProcess = photosWithDistances.slice(
          0,
          MAX_PHOTOS_FOR_BILLBOARD
        );
      }
    } else {
      // Cámara quieta: límite más generoso
      if (photosWithDistances.length > MAX_PHOTOS_FOR_BILLBOARD_STATIC) {
        photosToProcess = photosWithDistances.slice(
          0,
          MAX_PHOTOS_FOR_BILLBOARD_STATIC
        );
      }
    }

    photosToProcess.forEach(({ photo }) => {
      if (!photo.lodObject) return;
      photo.lodObject.lookAt(cameraPosition);
    });
  };

  /**
   * 🚀 OPTIMIZADO: Aplicar fade basado en densidad direccional
   * - Usa solo fotos visibles (pasadas como parámetro)
   * - Calcula distancias UNA SOLA VEZ
   * - Cache de vector forward
   */
  const applyDistanceFading = (
    camera,
    visiblePhotos, // ✅ Ya filtradas por frustum culling (~200 en lugar de ~2000)
    frameCounter = 0
  ) => {
    if (!camera) return;

    const allPhotosToFade = visiblePhotos.filter((p) => p.lodObject);
    if (allPhotosToFade.length === 0) return;

    const cameraPos = camera.position;

    // Calcular vector de dirección de cámara
    const forwardVector = new THREE.Vector3(0, 0, -1);
    forwardVector.applyQuaternion(camera.quaternion);
    forwardVector.normalize();

    // 🎯 OPTIMIZACIÓN: Pre-calcular distancias UNA SOLA VEZ
    const photosWithDistances = [];
    const cosHalfAngle = Math.cos((FORWARD_CONE_ANGLE * Math.PI) / 180 / 2);

    for (const photo of allPhotosToFade) {
      const dx = photo.position[0] - cameraPos.x;
      const dy = photo.position[1] - cameraPos.y;
      const dz = photo.position[2] - cameraPos.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      const distance = Math.sqrt(distanceSq);

      photosWithDistances.push({ photo, distance, dx, dy, dz });
    }

    // Contar fotos en el cono hacia adelante (usando distancias pre-calculadas)
    let forwardPhotosCount = 0;

    for (const { photo, distance, dx, dy, dz } of photosWithDistances) {
      if (distance < 1 || distance > FORWARD_CHECK_DISTANCE) continue;

      const toPhotoX = dx / distance;
      const toPhotoY = dy / distance;
      const toPhotoZ = dz / distance;

      const dotProduct =
        forwardVector.x * toPhotoX +
        forwardVector.y * toPhotoY +
        forwardVector.z * toPhotoZ;

      if (dotProduct >= cosHalfAngle) {
        forwardPhotosCount++;
      }
    }

    // Calcular factor de densidad
    let targetDensityFactor = 0;
    if (forwardPhotosCount <= DENSITY_MIN_PHOTOS) {
      targetDensityFactor = 0;
    } else if (forwardPhotosCount >= DENSITY_MAX_PHOTOS) {
      targetDensityFactor = 1;
    } else {
      targetDensityFactor =
        (forwardPhotosCount - DENSITY_MIN_PHOTOS) /
        (DENSITY_MAX_PHOTOS - DENSITY_MIN_PHOTOS);
    }

    // Suavizar cambios
    currentDensityFactor =
      currentDensityFactor * (1 - DENSITY_SMOOTHING) +
      targetDensityFactor * DENSITY_SMOOTHING;

    // 🎯 OPTIMIZACIÓN: Aplicar fade reutilizando distancias pre-calculadas
    const fadeRange = Math.max(1, FADE_END_DISTANCE - FADE_START_DISTANCE);

    for (const { photo, distance } of photosWithDistances) {
      const mesh = photo.lodObject.isLOD ? null : photo.lodObject;
      if (!mesh || !mesh.material) continue;

      if (photo.isVisible === false) {
        mesh.material.opacity = 0;
        mesh.material.transparent = true;
      } else {
        let baseOpacity = 1.0;
        if (distance < FADE_START_DISTANCE) {
          baseOpacity = 1.0;
        } else if (distance >= FADE_END_DISTANCE) {
          baseOpacity = 0.05;
        } else {
          const fadeProgress = (distance - FADE_START_DISTANCE) / fadeRange;
          baseOpacity = Math.max(0.05, 1.0 - fadeProgress);
        }

        const finalOpacity =
          baseOpacity * currentDensityFactor + 1.0 * (1 - currentDensityFactor);

        mesh.material.opacity = finalOpacity;
        mesh.material.transparent = true;
      }
    }
  };

  /**
   * Actualizar efectos de fotos (billboard + fading)
   */

  /**
   * Resetear estado
   */
  const reset = () => {
    visiblePhotos.value = [];
    cachedPhotosSet.clear();
    isTransitioning.value = false;
    animationStartTime.value = 0;
    animationTargetPositions = [];
    pendingOriginalPositionsUpdate = null;
    inflateFactor.value = 2;
    originalPositions.value = [];
    octreeNeedsRebuild.value = true;
    currentDensityFactor = 0;
    isCameraMoving.value = false;
    lastCameraPosition.set(0, 0, 0);
    lastCameraRotation.set(0, 0, 0, 1);
    lastMovementTime = 0;
    clearOctree();
  };

  return {
    // Estado
    visiblePhotos,
    isTransitioning,
    inflateFactor,
    originalPositions,
    useBillboarding,
    octreeNeedsRebuild,
    isCameraMoving,

    // Métodos de transición
    animatePositionTransition,
    updateTransitionPositions,
    calculateScaledPositions,

    // Métodos de escalado
    applyRadialScaling,

    // Métodos de visibilidad
    updateVisiblePhotos,
    calculateDistancesForVisiblePhotos,

    // Métodos de detección de movimiento
    updateCameraMovementState,

    // Métodos de efectos visuales
    updateBillboardRotations,
    applyDistanceFading,

    // Métodos de Octree
    queryRadius,
    clearOctree,

    // Utilidades
    reset,
    getOctreeStats,
  };
}
