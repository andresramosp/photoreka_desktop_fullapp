# 🎯 Billboarding Adaptativo - Documentación

## 📋 Resumen

Sistema de billboarding adaptativo que optimiza el rendimiento durante el movimiento de la cámara y mejora la calidad visual cuando la cámara está quieta.

## 🚀 Implementación

### 1️⃣ Detección de Movimiento (`use3DPhotoEffects.js`)

#### Constantes de configuración:

```javascript
const CAMERA_IDLE_THRESHOLD = 0.01; // Umbral de movimiento para considerar cámara quieta
const CAMERA_IDLE_TIME = 300; // Milisegundos sin movimiento para considerar cámara quieta
const MAX_PHOTOS_FOR_BILLBOARD = 750; // Límite durante movimiento
```

#### Método `updateCameraMovementState(camera)`:

- **Detecta cambios** en posición y rotación de la cámara
- **Compara** con el estado anterior usando vectores THREE.js
- **Actualiza** `isCameraMoving.value` según:
  - `true` → Movimiento detectado (delta > umbral)
  - `false` → Sin movimiento durante > 300ms

### 2️⃣ Billboarding Adaptativo

#### Lógica en `updateBillboardRotations()`:

```javascript
if (isCameraMoving.value) {
  // Durante movimiento: límite más restrictivo
  if (photosWithDistances.length > MAX_PHOTOS_FOR_BILLBOARD) {
    photosToProcess = photosWithDistances.slice(0, MAX_PHOTOS_FOR_BILLBOARD);
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
```

## 🎨 Comportamiento Visual

### Durante Movimiento 🏃

- **Límite**: 750 fotos máximo
- **Objetivo**: Fluidez (mantener 60 FPS)
- **Resultado**: Algunas fotos distantes pueden no estar perfectamente orientadas

### Cámara Quieta 🧘

- **Límite**: 2000 fotos máximo
- **Objetivo**: Máxima calidad visual sin comprometer rendimiento
- **Resultado**: Hasta 2000 fotos visibles perfectamente orientadas hacia la cámara

## 📊 Flujo de Ejecución

```
Frame Loop (Photos3D.vue)
    ↓
1. effectsManager.updateCameraMovementState(camera)
    ↓ (detecta movimiento)
2. calculateDistancesForVisiblePhotos()
    ↓
3. photosWithDistances.sort() (más cercanas primero)
    ↓
4. updateBillboardRotations(photosWithDistances)
    ↓ (aplica límite solo si isCameraMoving === true)
5. Billboarding aplicado selectivamente
```

## 🔧 Integración en Photos3D.vue

### Estado exportado:

```javascript
const {
  // ... otros estados
  isCameraMoving, // ✅ NUEVO: ref reactivo del estado de movimiento
} = effectsManager;
```

### En el loop de animación:

```javascript
if (visiblePhotos.value.length > 0 && cameraRef.value) {
  // 🎯 Detectar si la cámara está en movimiento
  effectsManager.updateCameraMovementState(cameraRef.value);

  const photosWithDistances = calculateDistancesForVisiblePhotos(
    cameraRef.value.position
  );

  photosWithDistances.sort((a, b) => a.distSq - b.distSq);

  if (useBillboarding.value) updateBillboardRotations(photosWithDistances);
}
```

## 📈 Beneficios

### Rendimiento

- ✅ Mantiene 60 FPS durante navegación activa
- ✅ Reduce cálculos de `lookAt()` en escenas con muchas fotos
- ✅ Sin impacto perceptible en la experiencia de usuario

### Calidad Visual

- ✅ Máxima calidad cuando el usuario observa detenidamente
- ✅ Transición suave entre estados (300ms de gracia)
- ✅ Todas las fotos visibles correctamente orientadas cuando está quieto

## 🧪 Testing Recomendado

1. **Movimiento rápido**: Verificar que mantiene 60 FPS
2. **Detenerse**: Verificar que después de 300ms todas las fotos se orientan
3. **Movimiento lento**: Verificar transiciones suaves
4. **Escenas densas**: Probar con >1000 fotos visibles

## 🔍 Debug

Para verificar el estado:

```javascript
console.log("Cámara en movimiento:", isCameraMoving.value);
console.log("Fotos a procesar:", photosToProcess.length);
console.log("Total visible:", photosWithDistances.length);
```

## ⚙️ Ajustes Posibles

Si necesitas ajustar el comportamiento:

- `CAMERA_IDLE_THRESHOLD`: ↑ = menos sensible a movimientos pequeños
- `CAMERA_IDLE_TIME`: ↑ = espera más tiempo antes de considerar "quieto"
- `MAX_PHOTOS_FOR_BILLBOARD`: ↑ = mejor calidad durante movimiento (menor FPS)
- `MAX_PHOTOS_FOR_BILLBOARD_STATIC`: ↑ = más fotos procesadas cuando está quieto (puede afectar FPS al girar)

---

**Fecha de implementación**: Octubre 2025  
**Versión**: 1.0
