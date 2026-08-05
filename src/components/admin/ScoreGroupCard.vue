<template>
  <div class="group-card">
    <div class="group-head">
      <span class="group-index">#{{ index + 1 }}</span>
      <span class="group-meta">
        <strong>{{ group.size }}</strong> fotos
      </span>
      <n-tag
        size="tiny"
        :bordered="false"
        :type="group.changedPhotos ? 'success' : 'default'"
      >
        {{ group.changedPhotos }} ajustadas
      </n-tag>
      <span class="group-meta">
        parecido <strong>{{ group.avgSim.toFixed(3) }}</strong>
      </span>
      <n-tag
        v-if="group.mode === 'version'"
        size="tiny"
        :bordered="false"
        type="warning"
        title="El histograma de color no coincide: son revelados distintos de la misma captura, así que la diferencia de scores puede ser intencionada y apenas se corrige."
      >
        revelado distinto
      </n-tag>
      <n-tag
        v-else-if="group.mode === 'duplicate'"
        size="tiny"
        :bordered="false"
        type="info"
        title="Misma captura, mismo revelado y misma huella: es el mismo archivo repetido. No queda nada que pueda justificar una diferencia de scores, así que se colapsan."
      >
        duplicado exacto
      </n-tag>
      <span class="group-meta group-shift">
        movimiento total <strong>{{ group.totalShift.toFixed(1) }}</strong>
      </span>
    </div>

    <div class="group-photos">
      <!-- Referencia del grupo, fija a la izquierda para comparar con scroll lateral -->
      <div class="median-card">
        <div class="median-head">
          <span class="median-title">Mediana</span>
          <span class="median-sub">{{ group.size }} fotos</span>
        </div>

        <p
          class="median-note"
          title="Todas las fotos del grupo son vecinas entre sí, así que esta es la referencia que usa el motor para todas ellas."
        >
          referencia del grupo
        </p>

        <ScoreBarsDiff
          :before="groupMedians"
          :after="groupMedians"
          :keys="visibleKeys"
          reference
        />
      </div>

      <div
        v-for="photo in group.photos"
        :key="photo.id"
        class="photo-card"
        :class="{ 'photo-card--changed': changedIds.has(photo.id) }"
      >
        <div class="photo-media">
          <img
            v-if="photo.thumbnailUrl"
            :src="photo.thumbnailUrl"
            :alt="photo.originalFileName ?? String(photo.id)"
            loading="lazy"
            @click="$emit('open', photo)"
          />
          <div v-else class="photo-missing">Sin miniatura</div>
          <span class="photo-id">#{{ photo.id }}</span>
          <span class="photo-neighbors">{{ photo.neighbors }} vec.</span>
        </div>

        <p class="photo-name" :title="photo.originalFileName ?? ''">
          {{ photo.originalFileName ?? "—" }}
        </p>

        <ScoreBarsDiff
          :before="photo.before"
          :after="photo.after"
          :medians="mediansByPhoto[photo.id]"
          :keys="visibleKeys"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { NTag } from "naive-ui";
import ScoreBarsDiff from "./ScoreBarsDiff.vue";
import {
  getArtisticCriteria,
  detectVariantFromScores,
} from "@/config/photo_schema";
import type { PreviewGroup, PreviewPhoto } from "../../types/scoreSmoothing";

const props = defineProps<{
  group: PreviewGroup;
  index: number;
  showAll?: boolean;
}>();

defineEmits<{ (e: "open", photo: PreviewPhoto): void }>();

const CHANGE_EPSILON = 0.05;

const photoById = computed(
  () => new Map(props.group.photos.map((photo) => [photo.id, photo])),
);

/** Orden canónico del esquema: idéntico en todas las fotos del grupo. */
const orderedKeys = computed<string[]>(() => {
  const variant = detectVariantFromScores(props.group.photos[0]?.before ?? {});
  const schemaOrder: string[] = getArtisticCriteria(variant).map(
    (criterion: { key: string }) => criterion.key,
  );

  const present = new Set<string>();
  for (const photo of props.group.photos) {
    for (const key of Object.keys(photo.before)) present.add(key);
  }

  const ordered = schemaOrder.filter((key) => present.has(key));
  for (const key of present) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered;
});

/**
 * Criterios que se pintan. Se deciden a nivel de GRUPO, no de foto: todas las fotos
 * renderizan las mismas filas en el mismo orden, que es lo que permite comparar en
 * vertical mientras se hace scroll lateral.
 */
const visibleKeys = computed<string[]>(() => {
  if (props.showAll) return orderedKeys.value;

  const changed = new Set<string>();
  for (const photo of props.group.photos) {
    for (const key of orderedKeys.value) {
      const delta = Number(photo.after?.[key] ?? 0) - Number(photo.before[key]);
      if (Math.abs(delta) >= CHANGE_EPSILON) changed.add(key);
    }
  }

  const filtered = orderedKeys.value.filter((key) => changed.has(key));
  return filtered.length > 0 ? filtered : orderedKeys.value;
});

/** Mediana del grupo completo, criterio a criterio, sobre los valores finales. */
const groupMedians = computed<Record<string, number>>(() =>
  medianOf(props.group.photos, orderedKeys.value),
);

const changedIds = computed<Set<number>>(() => {
  const ids = new Set<number>();
  for (const photo of props.group.photos) {
    const moved = Object.keys(photo.before).some(
      (key) =>
        Math.abs(Number(photo.after?.[key] ?? 0) - Number(photo.before[key])) >=
        CHANGE_EPSILON,
    );
    if (moved) ids.add(photo.id);
  }
  return ids;
});

/**
 * Referencia real de cada foto: la mediana de SUS vecinos directos más ella misma,
 * que es exactamente lo que usa el motor. Calcularla sobre el grupo entero sería
 * engañoso en cuanto el grupo es una cadena.
 */
const mediansByPhoto = computed<Record<number, Record<string, number>>>(() => {
  const result: Record<number, Record<string, number>> = {};

  for (const photo of props.group.photos) {
    const pool = [photo];
    for (const neighborId of photo.neighborIds) {
      const neighbor = photoById.value.get(neighborId);
      if (neighbor) pool.push(neighbor);
    }
    result[photo.id] = medianOf(pool, orderedKeys.value);
  }

  return result;
});

/** Mediana por criterio de un conjunto de fotos, sobre sus valores finales. */
function medianOf(
  photos: PreviewPhoto[],
  keys: string[],
): Record<string, number> {
  const medians: Record<string, number> = {};

  for (const key of keys) {
    const values = photos
      .map((photo) => Number(photo.after?.[key]))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    if (values.length === 0) continue;

    const mid = values.length >> 1;
    medians[key] =
      values.length % 2 === 1
        ? values[mid]
        : (values[mid - 1] + values[mid]) / 2;
  }

  return medians;
}
</script>

<style scoped>
.group-card {
  border: 1px solid #e8ecf0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f8fafc;
  border-bottom: 1px solid #f1f5f9;
  font-size: 11px;
  color: #64748b;
}

.group-index {
  font-weight: 700;
  color: #1e293b;
}

.group-meta strong {
  color: #1e293b;
}

.group-shift {
  margin-left: auto;
}

.group-photos {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  overflow-x: auto;
}

.photo-card {
  flex: 0 0 296px;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
  padding: 8px;
  background: #fff;
  transition:
    opacity 0.15s,
    border-color 0.15s;
}

/* Columna de referencia: se queda pegada al borde izquierdo mientras se
   desplazan las fotos, que es lo que permite comparar sin perder el patrón. */
.median-card {
  position: sticky;
  left: 0;
  z-index: 2;
  flex: 0 0 296px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 8px;
  background: #fff;
  box-shadow: 6px 0 8px -6px rgba(15, 23, 42, 0.22);
}

.median-head {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  padding: 10px;
}

.median-title {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

.median-sub {
  font-size: 10px;
  color: #64748b;
  font-weight: 500;
}

.median-note {
  margin: 6px 0;
  height: 14px;
  font-size: 10px;
  color: #475569;
  font-weight: 500;
  cursor: help;
}

.photo-card--changed {
  border-color: #bfdbfe;
  background: #f8fbff;
}

.photo-media {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #f1f5f9;
  aspect-ratio: 4 / 3;
}

.photo-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
}

.photo-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 10px;
  color: #94a3b8;
}

.photo-id,
.photo-neighbors {
  position: absolute;
  bottom: 4px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.72);
  color: #fff;
  font-size: 9px;
}

.photo-id {
  left: 4px;
}

.photo-neighbors {
  right: 4px;
}

.photo-name {
  margin: 6px 0;
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  height: 14px;
}
</style>
