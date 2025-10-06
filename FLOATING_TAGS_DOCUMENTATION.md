# Floating Tags System - Documentación

## Descripción General

Sistema de tags flotantes que muestra dinámicamente los tags de las fotos cercanas a la posición de la cámara en el visor 3D. Los tags se agrupan y muestran con intensidad visual variable según su frecuencia de aparición en la zona.

## Archivos Creados/Modificados

### Nuevos Archivos

- `src/composables/3d-viewer/useFloatingTags.js` - Composable principal del sistema

### Archivos Modificados

- `src/components/Photos3D.vue` - Integración del sistema y UI

## Características Implementadas

### 1. Detección Espacial de Tags

- Búsqueda de fotos cercanas usando una esfera de radio configurable
- Integración con el octree existente para búsqueda eficiente
- Fallback a búsqueda lineal si el octree no está disponible

### 2. Agregación y Conteo

- Los tags duplicados se cuentan y combinan
- Intensidad visual basada en la frecuencia (count)
- Soporte para múltiples categorías de tags

### 3. Visualización Dinámica

- Tags flotantes en esquina inferior izquierda
- Colores por categoría:
  - `context_story`: Azul (#4A90E2)
  - `visual_accents`: Rosa (#E24A90)
  - `visual_aspects`: Verde (#90E24A)
  - `artistic_scores`: Naranja (#E2904A)
- Opacidad y escala proporcional a la frecuencia
- Animaciones suaves de entrada/salida
- Scroll para listas largas

### 4. Panel de Configuración

Nueva sección "🏷️ Floating Tags" con:

- **Toggle ON/OFF**: Habilitar/deshabilitar el sistema
- **Detection Radius**: Radio de detección (20-150 unidades)
- **Max Tags to Show**: Máximo de tags únicos a mostrar (5-30)

## Configuración del Composable

```javascript
const config = {
  enabled: true, // Activar/desactivar
  detectionRadius: 50, // Radio de la esfera de detección
  updateInterval: 200, // Intervalo de actualización en ms
  maxTagsToShow: 15, // Máximo número de tags únicos
  minPhotoCount: 1, // Mínimo de fotos para mostrar un tag
  maxPhotoCount: 10, // Número de fotos para intensidad máxima
};
```

## API del Composable

### Estados Reactivos

- `activeTags`: Array de tags actualmente visibles
- `tagsByCategory`: Tags agrupados por categoría
- `stats`: Estadísticas (totalActiveTags, totalPhotosInRadius, categoriesCount)
- `isUpdating`: Flag de actualización en progreso

### Métodos

- `startUpdateLoop()`: Inicia el loop de actualización continua
- `stopUpdateLoop()`: Detiene el loop
- `updateActiveTags()`: Actualiza manualmente la lista de tags
- `reset()`: Resetea el estado

### Utilidades

- `getCategoryColor(category)`: Obtiene el color base de una categoría
- `calculateIntensity(count, min, max)`: Calcula intensidad visual (0-1)

## Estructura de un Tag

```javascript
{
  id: 990690,                    // ID único del tag
  name: "Indian setting",        // Nombre del tag
  category: "context_story",     // Categoría
  group: "toponym",              // Grupo (person, place, etc.)
  area: null,                    // Área opcional
  count: 5,                      // Número de fotos con este tag
  photoIds: [id1, id2, ...],    // IDs de fotos que contienen el tag
  intensity: 0.7,                // Intensidad calculada (0.3-1.0)
  color: "#4A90E2"              // Color asignado por categoría
}
```

## Uso del Sistema

### Integración en Photos3D.vue

```javascript
// 1. Import
import { useFloatingTags } from "@/composables/3d-viewer/useFloatingTags.js";

// 2. Inicialización (después de que la cámara esté lista)
floatingTagsSystem.value = useFloatingTags(cameraRef, photos3D, {
  searchRadius: octreeSearchRadius,
});

// 3. Iniciar loop
floatingTagsSystem.value.startUpdateLoop();

// 4. Cleanup en unmount
floatingTagsSystem.value.stopUpdateLoop();
floatingTagsSystem.value.reset();
```

### Renderizado en Template

```vue
<div v-if="floatingTagsSystem && floatingTagsSystem.config.enabled"
     class="floating-tags-container">
  <div class="floating-tags-list">
    <div v-for="tag in floatingTagsSystem.activeTags"
         :key="`${tag.category}_${tag.name}`"
         class="floating-tag"
         :style="{
           '--tag-color': tag.color,
           '--tag-intensity': tag.intensity
         }">
      <span class="tag-name">{{ tag.name }}</span>
      <span class="tag-count">×{{ tag.count }}</span>
    </div>
  </div>
</div>
```

## Rendimiento

- **Update Interval**: 200ms por defecto (configurable)
- **Búsqueda**: Usa octree para O(log n) en lugar de O(n)
- **Throttling**: Evita actualizaciones concurrentes con flag `isUpdating`
- **RAF**: Loop de actualización optimizado con requestAnimationFrame

## Responsive Design

- **Desktop**: Panel en esquina inferior izquierda (350px max-width)
- **Tablet**: Panel más estrecho (300px)
- **Mobile**: Panel full-width con padding reducido

## Notas de Implementación

1. **Extracción de Tags**: Soporta múltiples estructuras de datos:

   - `photo.tags`
   - `photo.descriptions.tags`
   - `photo.metadata.tags`

2. **Cálculo de Intensidad**: Interpolación lineal entre min y max count:

   - Mínimo: 0.3 (30% opacidad/intensidad)
   - Máximo: 1.0 (100% opacidad/intensidad)

3. **Colores**: CSS custom properties para fácil customización:
   ```css
   --tag-color: /* color base de la categoría */
   --tag-intensity: /* intensidad calculada */
   ```

## Posibles Mejoras Futuras

1. **Filtrado por Categoría**: Permitir mostrar solo ciertas categorías
2. **Clustering Visual**: Agrupar tags similares visualmente
3. **Click Interaction**: Click en tag para filtrar fotos con ese tag
4. **Posicionamiento 3D**: Renderizar tags en el espacio 3D (CSS3D)
5. **Transiciones**: Animaciones más suaves entre cambios de tags
6. **Cache**: Cachear resultados de búsqueda por posición
7. **Heatmap**: Visualización de densidad de tags en el espacio

## Troubleshooting

### Los tags no aparecen

- Verificar que `config.enabled` está en `true`
- Verificar que hay fotos con tags en el radio de detección
- Verificar que `startUpdateLoop()` se ha llamado
- Comprobar la consola para errores

### Performance Issues

- Aumentar `updateInterval` (ej: 300-500ms)
- Reducir `detectionRadius`
- Reducir `maxTagsToShow`

### Tags incorrectos

- Verificar estructura de datos de los tags en las fotos
- Comprobar que el backend devuelve los tags correctamente
- Revisar la función `extractPhotoTags()` en el composable
