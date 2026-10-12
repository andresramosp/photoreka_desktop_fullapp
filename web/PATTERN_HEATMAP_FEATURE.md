# Pattern Heatmap Visualization Feature

## Descripción

Esta funcionalidad proporciona dos modos alternativos para visualizar patrones en el mapa 2D de fotos:

### Modo 1: Photo Highlighting (Original)

- Ilumina las fotos específicas que pertenecen al patrón
- Oscurece las fotos que no pertenecen al patrón
- Útil cuando quieres ver exactamente qué fotos forman parte del patrón

### Modo 2: Heatmap (Nuevo) ⭐

- Muestra áreas difusas con gradientes de color según la densidad de fotos
- No compromete con fotos específicas (evita ruido)
- Efecto visual sutil y estético
- Calcula automáticamente el radio de difusión basándose en la densidad local de fotos
- Se adapta al nivel de zoom actual

## Uso

### Cambiar entre modos

En [`use2DPatternTags.js`](./src/composables/2d-viewer/use2DPatternTags.js), línea ~28:

```javascript
// Cambiar esta constante para alternar entre modos
const HIGHLIGHT_MODE = ref("heatmap"); // o "photos" para el modo original
```

### Configuración

#### Modo Heatmap

Puedes ajustar los siguientes parámetros en la función `createHeatmapOverlay`:

```javascript
// Blur intensity (línea ~216)
blurFilter.blur = 12; // Mayor = más difuso (rango: 1-20)

// Transparencia máxima (línea ~207)
const alphaFactor = (1 - radiusFactor) * 0.15; // Cambiar 0.15 para ajustar intensidad

// Calidad del blur (línea ~217)
blurFilter.quality = 4; // Mayor = mejor calidad pero más costoso (1-15)

// Radio base (línea ~195)
const baseRadius = Math.max(60, avgDistance * 1.8); // Ajusta el multiplicador 1.8

// Dimming de fotos (línea ~276)
sprite.alpha = sprite.__originalAlpha * 0.85; // 0.85 = 15% más oscuro
```

#### Modo Photos

El comportamiento original permanece sin cambios.

## Características Técnicas

### Heatmap

- **Renderizado**: Usa PixiJS Graphics con círculos concéntricos y gradientes radiales
- **Filtros**: Aplica BlurFilter para efecto difuso
- **Adaptación**: Calcula el radio de difusión basándose en:
  - Distancia promedio al vecino más cercano
  - Nivel de zoom actual
- **Performance**: z-index 5000 (entre fotos y tags)
- **Color**: Se obtiene del theme CSS (`--v-primary-base`)

### Detección de Densidad

El algoritmo calcula la distancia promedio al vecino más cercano para cada foto del patrón, lo que permite:

- Radios de difusión adaptativos según qué tan agrupadas estén las fotos
- Mejor representación visual de clusters densos vs dispersos

## Comportamiento

### Al seleccionar un patrón:

**Modo Heatmap:**

1. Oculta tags de otros patrones
2. Atenúa ligeramente todas las fotos (85% alpha)
3. Crea overlay de mapa de calor sobre las fotos del patrón
4. El mapa de calor se adapta al zoom

**Modo Photos:**

1. Oculta tags de otros patrones
2. Oscurece fotos que NO pertenecen al patrón (20% alpha)
3. Ilumina fotos del patrón (120% alpha, máx 1.0)

### Al deseleccionar:

- Restaura alpha original de todas las fotos
- Muestra todos los tags
- Limpia el overlay de mapa de calor

## Integración

La funcionalidad está completamente integrada con:

- ✅ Sistema de patrones existente
- ✅ Filtros de clustering (story/context/general)
- ✅ Transiciones de layout
- ✅ Sistema de zoom y pan
- ✅ Theme system (colores adaptativos)

## Exportación

El modo de highlight se exporta desde el composable y está disponible en `Photos2D.vue`:

```javascript
const { HIGHLIGHT_MODE } = use2DPatternTags({ ... });

// Se puede cambiar dinámicamente:
HIGHLIGHT_MODE.value = "photos"; // o "heatmap"
```

## Próximos pasos posibles

1. **UI Toggle**: Añadir botón en `Photos2DConfigPanel` para cambiar entre modos
2. **Configuración avanzada**: Exponer parámetros de blur/radius/alpha en UI
3. **Múltiples patrones**: Soporte para visualizar múltiples patrones simultáneamente con diferentes colores
4. **Animaciones**: Transiciones suaves al cambiar entre modos

## Notas técnicas

- El heatmap se re-crea cada vez que se selecciona un patrón (no se cachea)
- El BlurFilter puede ser costoso en dispositivos móviles si hay muchos círculos
- El radio adaptativo asegura que el heatmap se vea bien en diferentes densidades
- El z-index 5000 asegura que el heatmap esté sobre las fotos pero debajo de los tags (10000)
