<template>
  <div class="histogram">
    <div class="histogram-plot" role="img" :aria-label="ariaLabel">
      <div
        v-for="(bar, index) in bars"
        :key="`${bar.label}-${index}`"
        class="histogram-column"
        :title="barTitle(bar)"
      >
        <span class="histogram-value">{{ bar.count || "" }}</span>
        <div class="histogram-track">
          <div
            class="histogram-fill"
            :style="{
              height: `${heightPercent(bar.count)}%`,
              backgroundColor: barColor(bar),
            }"
          ></div>
        </div>
        <span class="histogram-tick">{{ bar.tick }}</span>
      </div>
    </div>

    <ul v-if="bands.length > 1" class="histogram-legend">
      <li v-for="band in bands" :key="band.key" class="histogram-legend-item">
        <span
          class="histogram-swatch"
          :style="{ backgroundColor: band.color }"
        ></span>
        {{ band.label }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  /** `[{ label, tick, count, percentage }]`, ya ordenados por el eje. */
  bars: {
    type: Array,
    required: true,
  },
  /** Color de las barras sin banda, y red de seguridad si falta alguna. */
  color: {
    type: String,
    required: true,
  },
  /**
   * `[{ key, label, color }]`, en el orden del eje. El color agrupa el eje en
   * zonas con nombre en vez de repetir la magnitud que ya cuenta la altura, así
   * que la leyenda no es opcional: sin ella el color no dice nada.
   */
  bands: {
    type: Array,
    default: () => [],
  },
  ariaLabel: {
    type: String,
    default: "",
  },
});

const maxCount = computed(() =>
  Math.max(...props.bars.map((bar) => bar.count), 0),
);

const bandsByKey = computed(
  () => new Map(props.bands.map((band) => [band.key, band])),
);

const barColor = (bar) => bandsByKey.value.get(bar.band)?.color ?? props.color;

const barTitle = (bar) => {
  const photos = `${bar.count} ${bar.count === 1 ? "photo" : "photos"}`;
  const band = bandsByKey.value.get(bar.band);
  const zone = band ? ` · ${band.label}` : "";
  return `${bar.label} — ${photos} (${bar.percentage}%)${zone}`;
};

// El tramo vacío se queda a cero (no a 2px): en un histograma el hueco es
// información, y un muñón mínimo lo disfraza de "aquí hay algo".
const heightPercent = (count) =>
  maxCount.value > 0 ? (count / maxCount.value) * 100 : 0;
</script>

<style scoped>
.histogram {
  width: 100%;
}

.histogram-plot {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: var(--spacing-xs);
  align-items: end;
}

.histogram-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.histogram-value {
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  line-height: 1;
  height: 12px;
}

.histogram-track {
  width: 100%;
  height: 116px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-bottom: 1px solid var(--border-color);
}

/* Columna estrecha a propósito: un bloque saturado de 80px de ancho grita más
   de lo que informa, y el aire entre barras es lo que deja leer el perfil. */
.histogram-fill {
  width: 100%;
  max-width: 44px;
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}

/* La leyenda va debajo del eje y en tono terciario: nombra las zonas sin
   competir con las barras, que son lo que hay que mirar. */
.histogram-legend {
  list-style: none;
  margin: var(--spacing-md) 0 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs) var(--spacing-lg);
}

.histogram-legend-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.histogram-swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.histogram-tick {
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text-tertiary);
  line-height: 1.2;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

@media (max-width: 768px) {
  .histogram-track {
    height: 92px;
  }

  .histogram-tick {
    font-size: 9px;
  }
}
</style>
