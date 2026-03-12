import { ref } from "vue";
import * as THREE from "three";

/**
 * Orbit-style controls for 3D photo viewer.
 *
 * Behaviour (like a 3D model viewer / globe):
 *  - Left-click + drag → rotate (orbit) around a target point
 *  - Middle-click + drag (or Shift+Left) → pan (translate target + camera)
 *  - Mouse wheel → dolly (zoom) in/out
 *
 * The camera always looks at `target`. Rotation is expressed in spherical
 * coordinates around that target.
 *
 * @param {THREE.Camera} camera  - The perspective camera
 * @param {HTMLElement}   domElement - The container element for event listeners
 */
export function useOrbitControls(camera, domElement) {
  // ── Configuración ──────────────────────────────────────────────
  const enabled = ref(true);

  // Spherical coordinates (radius, polar angle θ, azimuthal angle φ)
  const spherical = new THREE.Spherical();
  const target = new THREE.Vector3(0, 0, 0); // centre of orbit

  // Limits
  const minDistance = 5;
  const maxDistance = 800;
  const minPolarAngle = 0.05; // avoid gimbal lock at poles
  const maxPolarAngle = Math.PI - 0.05;

  // Sensitivity
  const rotateSensitivity = ref(0.005);
  const panSensitivity = ref(0.5);
  const zoomSensitivity = ref(1.1); // multiplicative factor per wheel tick
  // dampingFactor removed — no inertia

  // Internal interaction state
  const isDragging = ref(false);
  const isPanning = ref(false);
  let pointerDown = false;
  let panDown = false;
  let prevPointer = { x: 0, y: 0 };
  let pointerDownPos = { x: 0, y: 0 };

  // Expose drag distance for external click-vs-drag detection
  let _lastDragDistance = 0;

  // Temp vectors (reused to avoid GC pressure)
  const _offset = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _panOffset = new THREE.Vector3();

  // Expose for external reading (e.g. camera-move detection)
  const mouseState = ref({
    isPointerLocked: false, // compatibility with FPS controls API
    sensitivity: 0.005,
    yaw: 0,
    pitch: 0,
  });

  // ── Helpers ────────────────────────────────────────────────────

  /** Sync spherical from current camera + target */
  const syncFromCamera = () => {
    _offset.subVectors(camera.position, target);
    spherical.setFromVector3(_offset);
    // Clamp polar
    spherical.phi = Math.max(
      minPolarAngle,
      Math.min(maxPolarAngle, spherical.phi),
    );
    spherical.radius = Math.max(
      minDistance,
      Math.min(maxDistance, spherical.radius),
    );
  };

  /** Apply spherical back to camera */
  const applyToCamera = () => {
    _offset.setFromSpherical(spherical);
    camera.position.copy(target).add(_offset);
    camera.lookAt(target);
  };

  // ── Event Handlers ─────────────────────────────────────────────

  const onPointerDown = (e) => {
    if (!enabled.value) return;

    // Middle button → pan
    if (e.button === 1) {
      panDown = true;
      isPanning.value = true;
      prevPointer = { x: e.clientX, y: e.clientY };
      pointerDownPos = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    // Left button → rotate
    if (e.button === 0) {
      pointerDown = true;
      isDragging.value = true;
      prevPointer = { x: e.clientX, y: e.clientY };
      pointerDownPos = { x: e.clientX, y: e.clientY };
      _lastDragDistance = 0;
      e.preventDefault();
    }
  };

  // pointermove on WINDOW so dragging outside the element still tracks
  const onPointerMove = (e) => {
    if (!enabled.value) return;
    if (!pointerDown && !panDown) return;

    const dx = e.clientX - prevPointer.x;
    const dy = e.clientY - prevPointer.y;
    prevPointer = { x: e.clientX, y: e.clientY };

    if (panDown) {
      // Pan: move target (and camera) in the camera's local XY plane
      const panScale = panSensitivity.value * (spherical.radius / 100);
      camera.updateMatrixWorld(); // ensure matrixWorld is current
      _right.setFromMatrixColumn(camera.matrixWorld, 0); // camera right
      _up.setFromMatrixColumn(camera.matrixWorld, 1); // camera up

      _panOffset.set(0, 0, 0);
      _panOffset.addScaledVector(_right, -dx * panScale);
      _panOffset.addScaledVector(_up, dy * panScale);
      target.add(_panOffset);

      syncFromCamera();
      applyToCamera();
      return;
    }

    if (pointerDown) {
      // Rotate: adjust spherical angles
      const dTheta = -dx * rotateSensitivity.value;
      const dPhi = -dy * rotateSensitivity.value;

      spherical.theta += dTheta;
      spherical.phi += dPhi;

      // Clamp polar angle
      spherical.phi = Math.max(
        minPolarAngle,
        Math.min(maxPolarAngle, spherical.phi),
      );

      applyToCamera();
    }
  };

  // pointerup on WINDOW so it always fires even if pointer left the element
  const onPointerUp = (e) => {
    if (e.button === 0 && pointerDown) {
      // Compute total drag distance for click-vs-drag detection
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      _lastDragDistance = Math.sqrt(dx * dx + dy * dy);
      pointerDown = false;
      isDragging.value = false;
    }
    if (e.button === 1) {
      panDown = false;
      isPanning.value = false;
    }
  };

  const onWheel = (e) => {
    if (!enabled.value) return;
    e.preventDefault();

    if (e.deltaY > 0) {
      // Zoom out
      spherical.radius = Math.min(
        maxDistance,
        spherical.radius * zoomSensitivity.value,
      );
    } else {
      // Zoom in
      spherical.radius = Math.max(
        minDistance,
        spherical.radius / zoomSensitivity.value,
      );
    }

    applyToCamera();
  };

  const onContextMenu = (e) => {
    e.preventDefault();
  };

  // ── Setup / Cleanup ────────────────────────────────────────────

  let _isSetup = false;

  const setup = () => {
    // Sync spherical state from current camera position
    syncFromCamera();
    enabled.value = true;

    if (_isSetup) {
      // Already set up, just resync'd above
      return;
    }

    // pointerdown + wheel + contextmenu on domElement
    domElement.addEventListener("pointerdown", onPointerDown);
    domElement.addEventListener("wheel", onWheel, { passive: false });
    domElement.addEventListener("contextmenu", onContextMenu);

    // pointermove + pointerup on window for reliable drag tracking
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    _isSetup = true;
    console.log("🌐 Orbit controls set up (listeners registered)");
  };

  const cleanup = () => {
    if (!_isSetup) return;

    domElement.removeEventListener("pointerdown", onPointerDown);
    domElement.removeEventListener("wheel", onWheel);
    domElement.removeEventListener("contextmenu", onContextMenu);

    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);

    _isSetup = false;
    console.log("🌐 Orbit controls cleaned up (listeners removed)");
  };

  // ── Per-frame update (call from animate loop) ──────────────────

  const update = () => {
    // No inertia — movement is purely driven by pointer events.
    // This method exists for API compatibility with the animate loop.
  };

  // ── Public API ─────────────────────────────────────────────────

  const enable = () => {
    enabled.value = true;
    syncFromCamera();
    console.log("🌐 Orbit controls enabled");
  };

  const disable = () => {
    enabled.value = false;
    pointerDown = false;
    panDown = false;
    isDragging.value = false;
    isPanning.value = false;
    console.log("🌐 Orbit controls disabled");
  };

  const resetSpeeds = () => {
    // No inertia to reset — stub for API compatibility
  };

  /** Re-sync spherical from camera (useful after external camera moves) */
  const resyncFromCamera = () => {
    syncFromCamera();
  };

  // Setters for fine-tuning
  const setRotateSensitivity = (val) => {
    if (typeof val === "number" && val > 0) rotateSensitivity.value = val;
  };
  const setPanSensitivity = (val) => {
    if (typeof val === "number" && val > 0) panSensitivity.value = val;
  };
  const setZoomSensitivity = (val) => {
    if (typeof val === "number" && val > 1) zoomSensitivity.value = val;
  };
  const setDamping = () => {
    // No inertia — stub for API compatibility
  };

  /** Set orbit target (the point we rotate around) */
  const setTarget = (x, y, z) => {
    target.set(x, y, z);
    syncFromCamera();
    applyToCamera();
  };

  /** Get current orbit target */
  const getTarget = () => target.clone();

  // Stubs for FPS-compatible API (so callers don't crash)
  const setSpeedProfile = () => {};
  const setAccelerationRate = () => {};
  const setWorldScale = () => {};
  const setMouseSensitivity = (val) => setRotateSensitivity(val);
  const setWheelSpeedFactor = () => {};
  const toggleDebug = () => {};
  const requestPointerLock = () => {};
  const setTouchSensitivity = (val) => setRotateSensitivity(val);

  return {
    // State
    enabled,
    isDragging,
    isPanning,
    mouseState,
    target,
    spherical,

    // Drag distance (for click-vs-drag detection by consumers)
    get _lastDragDistance() {
      return _lastDragDistance;
    },

    // Lifecycle
    setup,
    cleanup,
    update,

    // Configuration
    setRotateSensitivity,
    setPanSensitivity,
    setZoomSensitivity,
    setDamping,
    setTarget,
    getTarget,
    resyncFromCamera,

    // FPS-compatible stubs
    setSpeedProfile,
    setAccelerationRate,
    setWorldScale,
    setMouseSensitivity,
    setWheelSpeedFactor,
    toggleDebug,
    requestPointerLock,
    setTouchSensitivity,

    // Control
    enable,
    disable,
    resetSpeeds,
  };
}
