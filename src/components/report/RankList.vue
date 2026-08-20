<template>
  <div class="rank-list" :class="{ 'rank-list--split': isSplit }">
    <div
      v-for="(column, columnIndex) in columns"
      :key="columnIndex"
      class="rank-column"
    >
      <div
        v-for="row in column"
        :key="row.label"
        class="rank-row"
        :class="{ 'rank-row--no-logo': !withLogos }"
        :title="`${row.label} — ${row.count} ${row.count === 1 ? 'photo' : 'photos'} (${row.percentage}%)`"
      >
        <template v-if="withLogos">
          <CameraBrandLogo
            v-if="!row.isOther"
            :camera-label="row.label"
            class="rank-logo"
          />
          <span v-else class="rank-logo rank-logo--other">···</span>
        </template>

        <span class="rank-label">{{ row.label }}</span>

        <div class="rank-bar-track">
          <div
            class="rank-bar-fill"
            :style="{
              width: `${barWidth(row.count)}%`,
              backgroundColor: color,
            }"
          ></div>
        </div>

        <span class="rank-value">
          {{ row.count }}
          <span class="rank-share">{{ row.percentage }}%</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import CameraBrandLogo from "@/components/report/CameraBrandLogo.vue";

const props = defineProps({
  /** `[{ label, count, percentage, isOther }]`, ya ordenadas de mayor a menor. */
  rows: {
    type: Array,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
  /** Antepone el logotipo de la marca, que es lo que identifica la fila. */
  withLogos: {
    type: Boolean,
    default: false,
  },
  /** A partir de aquí la lista se parte en dos columnas. */
  splitThreshold: {
    type: Number,
    default: 8,
  },
});

const isSplit = computed(() => props.rows.length >= props.splitThreshold);

/**
 * Se parte por la mitad y se lee hacia abajo, no en zigzag: la columna
 * izquierda sigue siendo la escalera del ranking de siempre y la derecha la
 * continúa. Las dos comparten escala (el mismo máximo), así que una barra de
 * la derecha se puede comparar con una de la izquierda sin recalcular nada.
 */
const columns = computed(() => {
  if (!isSplit.value) return [props.rows];
  const half = Math.ceil(props.rows.length / 2);
  return [props.rows.slice(0, half), props.rows.slice(half)];
});

// El máximo manda sobre toda la lista, no sobre cada columna: normalizar por
// columna haría que el séptimo cuerpo pareciera tan usado como el primero.
const maxCount = computed(() =>
  Math.max(...props.rows.map((row) => row.count), 0),
);

const barWidth = (count) =>
  maxCount.value > 0 ? (count / maxCount.value) * 100 : 0;
</script>

<style scoped>
.rank-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-xl);
}

.rank-list--split {
  grid-template-columns: 1fr 1fr;
}

.rank-column {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-width: 0;
}

.rank-row {
  display: grid;
  grid-template-columns: 84px minmax(140px, 240px) 1fr auto;
  align-items: center;
  gap: var(--spacing-lg);
}

.rank-row--no-logo {
  grid-template-columns: minmax(160px, 320px) 1fr auto;
}

/* En dos columnas el nombre cede ancho para que a la barra le quede recorrido:
   con la etiqueta a 240px el tramo pintable se queda en nada. */
.rank-list--split .rank-row {
  grid-template-columns: 84px minmax(110px, 180px) 1fr auto;
  gap: var(--spacing-md);
}

.rank-list--split .rank-row--no-logo {
  grid-template-columns: minmax(120px, 220px) 1fr auto;
}

.rank-logo--other {
  display: inline-flex;
  align-items: center;
  width: 84px;
  color: var(--text-tertiary);
  font-size: var(--font-size-lg);
  line-height: 1;
}

.rank-label {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rank-bar-track {
  height: 14px;
  background-color: var(--bg-surface);
  border-radius: var(--radius-xs);
  overflow: hidden;
}

.rank-bar-fill {
  height: 100%;
  border-radius: 0 4px 4px 0;
  transition: width 0.3s ease;
}

.rank-value {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 76px;
  text-align: right;
}

.rank-share {
  color: var(--text-tertiary);
  margin-left: var(--spacing-xs);
}

@media (max-width: 1024px) {
  .rank-list--split {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }

  .rank-list--split .rank-row {
    grid-template-columns: 84px minmax(140px, 240px) 1fr auto;
    gap: var(--spacing-lg);
  }

  .rank-list--split .rank-row--no-logo {
    grid-template-columns: minmax(160px, 320px) 1fr auto;
  }
}

@media (max-width: 768px) {
  .rank-row,
  .rank-list--split .rank-row {
    grid-template-columns: 64px 1fr auto;
    grid-template-areas:
      "logo label label"
      "bar  bar   value";
    gap: var(--spacing-sm) var(--spacing-md);
  }

  .rank-row--no-logo,
  .rank-list--split .rank-row--no-logo {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "label label"
      "bar   value";
  }

  .rank-logo,
  .rank-logo--other {
    grid-area: logo;
  }

  .rank-label {
    grid-area: label;
    white-space: normal;
  }

  .rank-bar-track {
    grid-area: bar;
  }

  .rank-value {
    grid-area: value;
  }
}
</style>
