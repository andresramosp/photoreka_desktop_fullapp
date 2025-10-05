import { ref } from "vue";
import * as THREE from "three";

/**
 * Touch controls for 3D navigation - Mobile equivalent to keyboard/mouse controls
 * 
 * Controls mapping:
 * - One finger drag: Camera rotation (yaw/pitch) - equivalent to mouse movement
 * - Two finger pinch: Move forward/backward - equivalent to mouse wheel
 * - Two finger drag: Move in direction (WASD equivalent)
 * - Three finger tap: Reset camera or toggle mode
 */
export function useTouchControls(camera, domElement) {
  // Touch state tracking
  const touchState = ref({
    isActive: false,
    activeTouches: 0,
    sensitivity: 0.003, // Same as mouse sensitivity
    yaw: 0, // horizontal rotation
    pitch: 0, // vertical rotation
  });

  // Movement configuration (matching keyboard controls)
  const moveSpeed = ref(60.0); // units/sec
  const initialSpeed = ref(2);
  const accelerationRate = ref(60.0);
  const accelerateSeconds = ref(0.8);
  const worldScale = ref(1);
  const movementMode = ref("time");
  const targetFps = ref(60);

  // Movement state
  const velocity = new THREE.Vector3();
  const currentSpeeds = ref({
    forward: 0,
    backward: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
  });

  const holdTimes = {
    forward: 0,
    backward: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
  };

  // Direction vectors
  const direction = new THREE.Vector3();
  const sideways = new THREE.Vector3();
  const upward = new THREE.Vector3(0, 1, 0);

  // Time tracking
  let lastUpdateTime = performance.now();

  // Control state
  const enabled = ref(true);

  // Touch tracking variables
  let touches = new Map(); // Map<touchId, {x, y, startX, startY, startTime}>
  let lastTouchDistance = 0;
  let lastPinchScale = 1;
  let twoFingerStartPos = null;
  let isRotating = false;
  let isPinching = false;
  let isTwoFingerMoving = false;

  // Movement simulation (like keyboard keys being pressed)
  const simulatedKeys = ref({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });

  // Deadzone for touch movements (pixels)
  const ROTATION_DEADZONE = 3;
  const MOVEMENT_DEADZONE = 5;
  const PINCH_DEADZONE = 10;

  // Touch event handlers
  const onTouchStart = (event) => {
    if (!enabled.value) return;
    event.preventDefault();

    const touchCount = event.touches.length;
    touchState.value.activeTouches = touchCount;

    // Update touches map
    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i];
      touches.set(touch.identifier, {
        x: touch.clientX,
        y: touch.clientY,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: performance.now(),
      });
    }

    // Initialize pinch distance for two fingers
    if (touchCount === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      lastPinchScale = 1;

      // Store starting position for two-finger movement
      twoFingerStartPos = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };

      isPinching = false;
      isTwoFingerMoving = false;
    }

    // Activate touch state
    if (touchCount > 0) {
      touchState.value.isActive = true;
    }
  };

  const onTouchMove = (event) => {
    if (!enabled.value || !touchState.value.isActive) return;
    event.preventDefault();

    const touchCount = event.touches.length;

    // ===== ONE FINGER: Camera Rotation (like mouse drag with pointer lock) =====
    if (touchCount === 1 && !isPinching && !isTwoFingerMoving) {
      const touch = event.touches[0];
      const prevTouch = touches.get(touch.identifier);

      if (prevTouch) {
        const deltaX = touch.clientX - prevTouch.x;
        const deltaY = touch.clientY - prevTouch.y;

        // Apply deadzone
        if (Math.abs(deltaX) > ROTATION_DEADZONE || Math.abs(deltaY) > ROTATION_DEADZONE) {
          isRotating = true;

          // Update camera rotation (same as mouse movement)
          touchState.value.yaw -= deltaX * touchState.value.sensitivity;
          touchState.value.pitch -= deltaY * touchState.value.sensitivity;

          // Limit pitch to prevent flipping
          touchState.value.pitch = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, touchState.value.pitch)
          );

          // Apply rotation to camera
          camera.rotation.order = "YXZ";
          camera.rotation.y = touchState.value.yaw;
          camera.rotation.x = touchState.value.pitch;
        }

        // Update touch position
        touches.set(touch.identifier, {
          ...prevTouch,
          x: touch.clientX,
          y: touch.clientY,
        });
      }
    }

    // ===== TWO FINGERS: Pinch to zoom OR drag to move =====
    else if (touchCount === 2) {
      const touch1 = event.touches[0];
      const touch2 = event.touches[1];

      // Calculate current distance between fingers
      const dx = touch2.clientX - touch1.clientX;
      const dy = touch2.clientY - touch1.clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      // Calculate center point of two fingers
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      // Calculate movement from start position
      const movementX = twoFingerStartPos ? centerX - twoFingerStartPos.x : 0;
      const movementY = twoFingerStartPos ? centerY - twoFingerStartPos.y : 0;
      const totalMovement = Math.sqrt(movementX * movementX + movementY * movementY);

      // Calculate distance change for pinch
      const distanceChange = currentDistance - lastTouchDistance;
      const distanceChangeAbs = Math.abs(distanceChange);

      // Determine gesture type based on which threshold is crossed first
      if (!isPinching && !isTwoFingerMoving) {
        if (distanceChangeAbs > PINCH_DEADZONE) {
          isPinching = true;
          console.log("🤏 Pinch gesture detected");
        } else if (totalMovement > MOVEMENT_DEADZONE) {
          isTwoFingerMoving = true;
          console.log("✋ Two-finger drag detected");
        }
      }

      // ===== PINCH GESTURE: Move forward/backward (like mouse wheel) =====
      if (isPinching) {
        const pinchDelta = distanceChange / lastTouchDistance;
        const pinchSpeed = pinchDelta * moveSpeed.value * 2; // Amplify for better control

        // Get camera forward direction
        camera.getWorldDirection(direction);

        // Move camera along forward direction
        camera.position.addScaledVector(direction, pinchSpeed);

        lastTouchDistance = currentDistance;
      }

      // ===== TWO-FINGER DRAG: Move in direction (like WASD) =====
      else if (isTwoFingerMoving && twoFingerStartPos) {
        // Calculate movement delta
        const deltaX = movementX / 50; // Scale down for smoother control
        const deltaY = movementY / 50;

        // Reset simulated keys
        Object.keys(simulatedKeys.value).forEach(key => {
          simulatedKeys.value[key] = false;
        });

        // Map movement to WASD-like controls
        const threshold = 0.3; // Minimum movement to trigger

        // Horizontal movement (left/right)
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0) {
            simulatedKeys.value.right = true;
          } else {
            simulatedKeys.value.left = true;
          }
        }

        // Vertical movement (forward/backward or up/down)
        if (Math.abs(deltaY) > threshold) {
          // If moving more horizontally than vertically, treat as forward/backward
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal dominant - already handled above
          } else {
            // Vertical dominant - move forward/backward
            if (deltaY < 0) {
              simulatedKeys.value.forward = true;
            } else {
              simulatedKeys.value.backward = true;
            }
          }
        }
      }

      // Update touch positions
      touches.set(touch1.identifier, {
        x: touch1.clientX,
        y: touch1.clientY,
        startX: touches.get(touch1.identifier)?.startX || touch1.clientX,
        startY: touches.get(touch1.identifier)?.startY || touch1.clientY,
        startTime: touches.get(touch1.identifier)?.startTime || performance.now(),
      });
      touches.set(touch2.identifier, {
        x: touch2.clientX,
        y: touch2.clientY,
        startX: touches.get(touch2.identifier)?.startX || touch2.clientX,
        startY: touches.get(touch2.identifier)?.startY || touch2.clientY,
        startTime: touches.get(touch2.identifier)?.startTime || performance.now(),
      });
    }
  };

  const onTouchEnd = (event) => {
    if (!enabled.value) return;
    event.preventDefault();

    // Remove ended touches from map
    const touchIds = Array.from(touches.keys());
    const activeTouchIds = Array.from(event.touches).map(t => t.identifier);
    
    touchIds.forEach(id => {
      if (!activeTouchIds.includes(id)) {
        touches.delete(id);
      }
    });

    const remainingTouches = event.touches.length;
    touchState.value.activeTouches = remainingTouches;

    // Reset gesture states when touches end
    if (remainingTouches === 0) {
      touchState.value.isActive = false;
      isRotating = false;
      isPinching = false;
      isTwoFingerMoving = false;
      twoFingerStartPos = null;

      // Reset all simulated keys
      Object.keys(simulatedKeys.value).forEach(key => {
        simulatedKeys.value[key] = false;
      });
    } else if (remainingTouches === 1) {
      // Transitioned from 2+ fingers to 1 finger
      isPinching = false;
      isTwoFingerMoving = false;
      isRotating = false;
      twoFingerStartPos = null;

      // Reset movement keys
      Object.keys(simulatedKeys.value).forEach(key => {
        simulatedKeys.value[key] = false;
      });
    }
  };

  const onTouchCancel = (event) => {
    // Treat cancel as end
    onTouchEnd(event);
  };

  // Update function - same logic as keyboard controls but uses simulatedKeys
  const update = () => {
    const now = performance.now();
    let dt = (now - lastUpdateTime) / 1000; // seconds
    lastUpdateTime = now;

    // Clamp to avoid jumps
    if (dt > 0.2) dt = 0.2;
    if (dt <= 0) dt = 0.0001;

    // Get camera directions
    camera.getWorldDirection(direction);
    sideways.crossVectors(direction, upward).normalize();

    // Reset velocity
    velocity.set(0, 0, 0);

    const maxSpeed = moveSpeed.value;
    const accel = accelerationRate.value;
    const initSpeed = initialSpeed.value;

    const dirs = ["forward", "backward", "left", "right", "up", "down"];
    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    // Update speeds based on simulated keys (same acceleration logic as keyboard)
    dirs.forEach((dir) => {
      if (!simulatedKeys.value[dir]) {
        holdTimes[dir] = 0;
        currentSpeeds.value[dir] = 0;
        return;
      }
      holdTimes[dir] += dt;

      // Initial speed seed
      if (currentSpeeds.value[dir] === 0) {
        currentSpeeds.value[dir] = initSpeed;
      }

      // Linear acceleration
      const linearNext = currentSpeeds.value[dir] + accel * dt;

      // Eased acceleration curve
      const ratio = Math.min(1, holdTimes[dir] / accelerateSeconds.value);
      const eased = easeOutCubic(ratio);
      const easedTarget = initSpeed + (maxSpeed - initSpeed) * eased;

      // Take maximum without exceeding max speed
      let next = Math.max(linearNext, easedTarget);
      if (next > maxSpeed) next = maxSpeed;

      currentSpeeds.value[dir] = next;
    });

    // Build velocity vector
    const applyVector = (mag, vec, invert = false) => {
      if (mag <= 0) return;
      velocity.addScaledVector(vec, invert ? -mag : mag);
    };

    applyVector(currentSpeeds.value.forward, direction);
    applyVector(currentSpeeds.value.backward, direction, true);
    applyVector(currentSpeeds.value.left, sideways, true);
    applyVector(currentSpeeds.value.right, sideways);
    applyVector(currentSpeeds.value.up, upward);
    applyVector(currentSpeeds.value.down, upward, true);

    // Apply movement
    if (!velocity.equals(new THREE.Vector3(0, 0, 0))) {
      if (movementMode.value === "frame") {
        const frameScale = targetFps.value > 0 ? 1 / targetFps.value : 1 / 60;
        const scale = frameScale * worldScale.value;
        const frameDistance = velocity.length() * scale;
        camera.position.addScaledVector(velocity.normalize(), frameDistance);
      } else {
        const scale = dt * worldScale.value;
        const frameDistance = velocity.length() * scale;
        camera.position.addScaledVector(velocity.normalize(), frameDistance);
      }
    }
  };

  // Setup function
  const setup = () => {
    if (!camera || !domElement) {
      console.error("Camera or domElement not provided");
      return;
    }

    // Camera configuration
    camera.rotation.order = "YXZ";

    // Add touch event listeners
    domElement.addEventListener("touchstart", onTouchStart, { passive: false });
    domElement.addEventListener("touchmove", onTouchMove, { passive: false });
    domElement.addEventListener("touchend", onTouchEnd, { passive: false });
    domElement.addEventListener("touchcancel", onTouchCancel, { passive: false });

    console.log("📱 Touch controls initialized");
  };

  // Cleanup function
  const cleanup = () => {
    if (domElement) {
      domElement.removeEventListener("touchstart", onTouchStart);
      domElement.removeEventListener("touchmove", onTouchMove);
      domElement.removeEventListener("touchend", onTouchEnd);
      domElement.removeEventListener("touchcancel", onTouchCancel);
    }
    console.log("📱 Touch controls cleaned up");
  };

  // Configuration methods (matching keyboard controls API)
  const setMoveSpeed = (speed) => {
    moveSpeed.value = speed;
  };

  const setTouchSensitivity = (sensitivity) => {
    touchState.value.sensitivity = sensitivity;
  };

  const setInitialSpeed = (speed) => {
    initialSpeed.value = speed;
  };

  const setAccelerationRate = (rate) => {
    accelerationRate.value = rate;
  };

  const setWorldScale = (scale) => {
    if (typeof scale === "number" && scale > 0) worldScale.value = scale;
  };

  const setMovementMode = (mode) => {
    if (mode === "time" || mode === "frame") movementMode.value = mode;
  };

  const setTargetFps = (fps) => {
    if (typeof fps === "number" && fps > 0) targetFps.value = fps;
  };

  const setSpeedProfile = ({ initial, max, accelerateInSeconds }) => {
    if (typeof initial === "number" && initial > 0) initialSpeed.value = initial;
    if (typeof max === "number" && max > 0) moveSpeed.value = max;
    if (typeof accelerateInSeconds === "number" && accelerateInSeconds > 0)
      accelerateSeconds.value = accelerateInSeconds;
  };

  const setSpeedScale = (factor) => {
    if (typeof factor !== "number" || factor <= 0) return;
    initialSpeed.value *= factor;
    moveSpeed.value *= factor;
  };

  const setCameraPosition = (x, y, z) => {
    camera.position.set(x, y, z);
  };

  const setCameraRotation = (yaw, pitch) => {
    touchState.value.yaw = yaw;
    touchState.value.pitch = pitch;
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  };

  const resetSpeeds = () => {
    Object.keys(currentSpeeds.value).forEach((key) => {
      currentSpeeds.value[key] = 0;
    });
    Object.keys(simulatedKeys.value).forEach((key) => {
      simulatedKeys.value[key] = false;
    });
  };

  const enable = () => {
    enabled.value = true;
    console.log("📱 Touch controls enabled");
  };

  const disable = () => {
    enabled.value = false;
    resetSpeeds();
    touchState.value.isActive = false;
    console.log("📱 Touch controls disabled");
  };

  return {
    // State
    touchState,
    simulatedKeys,
    moveSpeed,
    initialSpeed,
    accelerationRate,
    currentSpeeds,
    enabled,

    // Methods
    setup,
    cleanup,
    update,
    setMoveSpeed,
    setTouchSensitivity,
    setInitialSpeed,
    setAccelerationRate,
    setSpeedProfile,
    setSpeedScale,
    setWorldScale,
    setMovementMode,
    setTargetFps,
    setCameraPosition,
    setCameraRotation,
    resetSpeeds,
    enable,
    disable,
  };
}
