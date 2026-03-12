import { ref } from "vue";
import * as THREE from "three";

export function useFirstPersonControls(camera, domElement) {
  // Estado de las teclas
  const keys = ref({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });

  // Estados del mouse
  const mouseState = ref({
    isPointerLocked: false,
    sensitivity: 0.003,
    yaw: 0, // rotación horizontal
    pitch: 0, // rotación vertical
  });

  // Configuración de movimiento simple: velocidad inicial + aceleración
  // Parámetros ajustables
  // Velocidad máxima (unidades/seg). Aumentada para desplazamientos largos.
  const moveSpeed = ref(160.0); // elevar para pruebas
  const initialSpeed = ref(2); // valor claramente visible
  const accelerationRate = ref(60.0); // usada solo si curva custom
  const accelerateSeconds = ref(0.8); // llegar rápido al máximo
  const worldScale = ref(1); // factor para escalar TODO el movimiento si el "mundo" es muy grande
  const movementMode = ref("time"); // "time" (v*dt) o "frame" (legacy para probar)
  const targetFps = ref(60); // usado si movementMode = frame para compensar
  // Curva de aceleración opcional: recibe (tHoldSegundos, velActual, velMax) y devuelve nuevaVelocidad
  let customAccelerationCurve = null;

  // Vectores de dirección
  const direction = new THREE.Vector3();
  const sideways = new THREE.Vector3();
  const upward = new THREE.Vector3(0, 1, 0);

  // Para suavizar el movimiento con aceleración
  const velocity = new THREE.Vector3();
  // Track de tiempo de presión por dirección (segundos acumulados)
  const holdTimes = {
    forward: 0,
    backward: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
  };

  // Sistema de aceleración progresiva
  const currentSpeeds = ref({
    forward: 0,
    backward: 0,
    left: 0,
    right: 0,
    up: 0,
    down: 0,
  });

  // Tiempo para tracking de aceleración (en ms)
  let lastUpdateTime = performance.now();

  // Debug opcional (desactivado por defecto)
  let debugEnabled = true; // activar para diagnóstico ahora
  let fpsAccumulatorTime = 0;
  let fpsFrameCount = 0;
  let distanceAccumulator = 0; // distancia recorrida en el último segundo
  let lastDebugPrint = 0;

  // Estado de habilitación de controles
  const enabled = ref(true);

  // Eventos de teclado
  const onKeyDown = (event) => {
    if (!enabled.value) return; // Bloquear si está deshabilitado

    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        keys.value.forward = true;
        break;
      case "KeyS":
      case "ArrowDown":
        keys.value.backward = true;
        break;
      case "KeyA":
      case "ArrowLeft":
        keys.value.left = true;
        break;
      case "KeyD":
      case "ArrowRight":
        keys.value.right = true;
        break;
      case "KeyF":
        keys.value.up = true;
        break;
      case "KeyV":
        keys.value.down = true;
        break;
    }
  };

  const onKeyUp = (event) => {
    if (!enabled.value) {
      // Forzar todas las teclas a false si está deshabilitado
      Object.keys(keys.value).forEach((key) => (keys.value[key] = false));
      return;
    }

    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        keys.value.forward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        keys.value.backward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        keys.value.left = false;
        break;
      case "KeyD":
      case "ArrowRight":
        keys.value.right = false;
        break;
      case "KeyF":
        keys.value.up = false;
        break;
      case "KeyV":
        keys.value.down = false;
        break;
    }
  };

  // Eventos del mouse para rotación libre
  const onMouseMove = (event) => {
    if (!mouseState.value.isPointerLocked || !enabled.value) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    mouseState.value.yaw -= movementX * mouseState.value.sensitivity;
    mouseState.value.pitch -= movementY * mouseState.value.sensitivity;

    // Limitar pitch para evitar voltear completamente
    mouseState.value.pitch = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, mouseState.value.pitch)
    );

    // Aplicar rotación a la cámara
    camera.rotation.order = "YXZ";
    camera.rotation.y = mouseState.value.yaw;
    camera.rotation.x = mouseState.value.pitch;
  };

  // Factor de velocidad específico para la rueda (independiente de moveSpeed)
  const wheelSpeedFactor = ref(0.3); // 30% de la velocidad normal por defecto

  // Eventos del mouse para zoom con rueda
  const onWheel = (event) => {
    event.preventDefault();

    // Calcular dirección hacia adelante basada en la orientación actual de la cámara
    camera.getWorldDirection(direction);

    // Velocidad con factor específico para la rueda
    const baseSpeed = event.deltaY > 0 ? -moveSpeed.value : moveSpeed.value;
    const speed = baseSpeed * wheelSpeedFactor.value;

    // Mover en la dirección de la cámara
    camera.position.addScaledVector(direction, speed);
  };

  // Control de Pointer Lock
  const onPointerLockChange = () => {
    mouseState.value.isPointerLocked =
      document.pointerLockElement === domElement;
  };

  const onPointerLockError = () => {
    console.error("Pointer lock error");
  };

  // Solicitar Pointer Lock al hacer click
  const requestPointerLock = () => {
    if (!enabled.value) {
      console.log("⚠️ Controles deshabilitados - pointer lock bloqueado");
      return;
    }
    if (domElement.requestPointerLock) {
      domElement.requestPointerLock();
    }
  };

  // Función de actualización del frame con aceleración progresiva
  const update = () => {
    // Delta real en segundos
    const now = performance.now();
    let dt = (now - lastUpdateTime) / 1000; // s
    lastUpdateTime = now;

    // Clamp para evitar saltos tras lags o pestaña inactiva
    if (dt > 0.2) dt = 0.2; // evita "teleports"
    if (dt <= 0) dt = 0.0001;

    // Direcciones actuales basadas en orientación de cámara
    camera.getWorldDirection(direction);
    sideways.crossVectors(direction, upward).normalize();

    // Resetear vector acumulador de desplazamiento por este frame
    velocity.set(0, 0, 0);

    let maxSpeed = moveSpeed.value; // unidades / segundo (en modo time) o por frame (modo frame)
    const accel = accelerationRate.value; // unidades / segundo^2
    const initSpeed = initialSpeed.value; // unidades / segundo

    const dirs = ["forward", "backward", "left", "right", "up", "down"];

    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
    dirs.forEach((dir) => {
      if (!keys.value[dir]) {
        holdTimes[dir] = 0;
        currentSpeeds.value[dir] = 0;
        return;
      }
      holdTimes[dir] += dt;

      // 1) Si velocidad es cero -> seed inicial
      if (currentSpeeds.value[dir] === 0) {
        currentSpeeds.value[dir] = initSpeed;
      }

      // 2) Incremento lineal puro (time-based)
      const linearNext = currentSpeeds.value[dir] + accel * dt; // accel en unidades/seg^2

      // 3) Objetivo por easing (curva suave hacia max) usando tiempo acumulado
      const ratio = Math.min(1, holdTimes[dir] / accelerateSeconds.value);
      const eased = easeOutCubic(ratio);
      const easedTarget = initSpeed + (moveSpeed.value - initSpeed) * eased;

      // 4) Curva custom si existe
      let customTarget = null;
      if (customAccelerationCurve) {
        try {
          const v = customAccelerationCurve(
            holdTimes[dir],
            currentSpeeds.value[dir],
            moveSpeed.value
          );
          if (typeof v === "number" && v > 0) customTarget = v;
        } catch (e) {
          if (debugEnabled) console.warn("Custom acceleration curve error:", e);
        }
      }

      // 5) Seleccionar el mayor crecimiento válido sin pasar del máximo
      let next = linearNext;
      if (easedTarget > next) next = easedTarget;
      if (customTarget && customTarget > next) next = customTarget;
      if (next > moveSpeed.value) next = moveSpeed.value;

      // 6) Asignar
      const prev = currentSpeeds.value[dir];
      currentSpeeds.value[dir] = next;

      // 7) Debug detallado (solo para 'forward' para no saturar)
      if (debugEnabled && dir === "forward" && Math.random() < 0.15) {
        console.log("[ACCEL]", {
          dt: dt.toFixed(3),
          hold: holdTimes[dir].toFixed(2),
          prev: prev.toFixed(2),
          linearNext: linearNext.toFixed(2),
          easedTarget: easedTarget.toFixed(2),
          customTarget: customTarget ? customTarget.toFixed(2) : null,
          final: currentSpeeds.value[dir].toFixed(2),
          max: moveSpeed.value,
          accel,
          ratio: ratio.toFixed(2),
        });
      }
    });

    // Construir desplazamiento (velocidades ya en unidades/seg → multiplicar por dt al aplicar)
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

    let frameDistance = 0;
    if (!velocity.equals(new THREE.Vector3(0, 0, 0))) {
      if (movementMode.value === "frame") {
        // Normalizar a targetFps para que se aproxime al modo time
        const frameScale = targetFps.value > 0 ? 1 / targetFps.value : 1 / 60;
        const scale = frameScale * worldScale.value;
        frameDistance = velocity.length() * scale;
        camera.position.addScaledVector(velocity.normalize(), frameDistance);
      } else {
        const scale = dt * worldScale.value;
        frameDistance = velocity.length() * scale;
        camera.position.addScaledVector(velocity.normalize(), frameDistance);
      }
      distanceAccumulator += frameDistance;
    }

    // Debug FPS (cada ~1s) si activado
    if (debugEnabled) {
      fpsAccumulatorTime += dt;
      fpsFrameCount++;
      lastDebugPrint += dt;
      if (lastDebugPrint >= 1) {
        const fps = (fpsFrameCount / fpsAccumulatorTime).toFixed(1);
        const vF = currentSpeeds.value.forward.toFixed(2);
        console.log(
          `[CTRL] mode=${movementMode.value} worldScale=${
            worldScale.value
          } dt=${dt.toFixed(
            4
          )} FPS=${fps} vForward=${vF} dist/s=${distanceAccumulator.toFixed(
            2
          )} hold=${holdTimes.forward.toFixed(2)}`
        );
        lastDebugPrint = 0;
        fpsAccumulatorTime = 0;
        fpsFrameCount = 0;
        distanceAccumulator = 0;
      }
    }
  };

  // Configuración inicial
  const setup = () => {
    if (!camera || !domElement) {
      console.error("Camera or domElement not provided");
      return;
    }

    // Configuración inicial de la cámara
    camera.rotation.order = "YXZ";

    // Event listeners
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("pointerlockerror", onPointerLockError);

    if (domElement) {
      // NOTE: Click listener removed - handled externally for photo selection
      // domElement.addEventListener("click", requestPointerLock);
      domElement.addEventListener("mousemove", onMouseMove);
      domElement.addEventListener("wheel", onWheel, { passive: false });
    }
  };

  // Limpieza de eventos
  const cleanup = () => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("pointerlockchange", onPointerLockChange);
    document.removeEventListener("pointerlockerror", onPointerLockError);

    if (domElement) {
      // NOTE: Click listener removed - handled externally for photo selection
      // domElement.removeEventListener("click", requestPointerLock);
      domElement.removeEventListener("mousemove", onMouseMove);
      domElement.removeEventListener("wheel", onWheel);
    }
  };

  // Métodos públicos para configuración
  const setMoveSpeed = (speed) => {
    moveSpeed.value = speed;
  };

  const setMouseSensitivity = (sensitivity) => {
    mouseState.value.sensitivity = sensitivity;
  };

  const setWheelSpeedFactor = (factor) => {
    if (typeof factor === "number" && factor > 0) {
      wheelSpeedFactor.value = factor;
    }
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
  const toggleDebug = (val) => {
    debugEnabled = val === undefined ? !debugEnabled : !!val;
  };
  const setSpeedProfile = ({ initial, max, accelerateInSeconds }) => {
    if (typeof initial === "number" && initial > 0)
      initialSpeed.value = initial;
    if (typeof max === "number" && max > 0) moveSpeed.value = max;
    if (typeof accelerateInSeconds === "number" && accelerateInSeconds > 0)
      accelerateSeconds.value = accelerateInSeconds;
  };
  const setSpeedScale = (factor) => {
    if (typeof factor !== "number" || factor <= 0) return;
    initialSpeed.value *= factor;
    moveSpeed.value *= factor;
  };

  const setAccelerationCurve = (fn) => {
    customAccelerationCurve = typeof fn === "function" ? fn : null;
  };

  const setCameraPosition = (x, y, z) => {
    camera.position.set(x, y, z);
  };

  const setCameraRotation = (yaw, pitch) => {
    mouseState.value.yaw = yaw;
    mouseState.value.pitch = pitch;
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  };

  // Método para resetear velocidades (útil cuando se pausa/reanuda)
  const resetSpeeds = () => {
    Object.keys(currentSpeeds.value).forEach((key) => {
      currentSpeeds.value[key] = 0;
    });
  };

  // Métodos para habilitar/deshabilitar controles
  const enable = () => {
    enabled.value = true;
    console.log("🚀 Controles FPS habilitados");
  };

  const disable = () => {
    enabled.value = false;
    // Resetear todas las teclas y velocidades
    Object.keys(keys.value).forEach((key) => (keys.value[key] = false));
    resetSpeeds();
    console.log("🔒 Controles FPS deshabilitados");
  };

  return {
    // Estado reactivo
    keys,
    mouseState,
    moveSpeed,
    initialSpeed,
    accelerationRate,
    currentSpeeds,
    enabled,

    // Métodos
    setup,
    cleanup,
    update,
    setMoveSpeed,
    setMouseSensitivity,
    setWheelSpeedFactor,
    setInitialSpeed,
    setAccelerationRate,
    setSpeedProfile,
    setSpeedScale,
    setAccelerationCurve,
    setWorldScale,
    setMovementMode,
    setTargetFps,
    toggleDebug,
    setCameraPosition,
    setCameraRotation,
    resetSpeeds,
    requestPointerLock,
    enable,
    disable,
  };
}
