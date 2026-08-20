<template>
  <div class="bars">
    <div class="bar-header" aria-hidden="true">
      <span>Criterio</span>
      <span>Nivel</span>
      <span class="bar-header-values">
        <template v-if="reference">
          <span class="bar-header-value">Valor</span>
        </template>
        <template v-else-if="morph">
          <span class="bar-header-current">Ahora</span>
          <span>Cambio</span>
        </template>
        <template v-else>
          <span>Antes</span>
          <span>Después</span>
          <span>Cambio</span>
        </template>
      </span>
    </div>

    <div
      v-for="row in rows"
      :key="row.key"
      class="bar-row"
      :class="{ 'bar-row--changed': row.changed }"
    >
      <span class="bar-label" :title="row.label">{{ row.label }}</span>

      <div class="bar-track">
        <!-- Barra viva: se mueve entre el antes y el después según `phase` -->
        <template v-if="morph">
          <div
            class="bar-live"
            :class="row.changed ? (row.up ? 'is-up' : 'is-down') : 'is-flat'"
            :style="{ width: pct(row.current) }"
          />
          <!-- Marcas fijas de los dos extremos, para no perder la referencia -->
          <div class="bar-tick bar-tick--before" :style="{ left: pct(row.before) }" />
          <div
            v-if="row.changed"
            class="bar-tick bar-tick--after"
            :style="{ left: pct(row.after) }"
          />
        </template>
        <template v-else>
          <!-- Tramo común a antes y después -->
          <div class="bar-base" :style="{ width: pct(row.min) }" />
          <!-- Tramo que cambia: verde si sube, rojo si baja -->
          <div
            v-if="row.changed"
            class="bar-delta"
            :class="row.up ? 'is-up' : 'is-down'"
            :style="{ left: pct(row.min), width: pct(row.max - row.min) }"
          />
        </template>
        <!-- Referencia hacia la que tira: mediana de SUS vecinos directos -->
        <div
          v-if="row.median !== null"
          class="bar-median"
          :style="{ left: pct(row.median) }"
          :title="`Mediana de sus vecinos: ${fmt(row.median)}`"
        />
      </div>

      <span class="bar-values">
        <template v-if="reference">
          <span class="v-reference">{{ fmt(row.after) }}</span>
        </template>
        <template v-else-if="morph">
          <span
            class="v-current"
            :class="row.changed ? (row.up ? 'is-up' : 'is-down') : ''"
          >
            {{ fmt(row.current) }}
          </span>
          <span
            v-if="row.changed"
            class="v-delta"
            :class="row.up ? 'is-up' : 'is-down'"
          >
            ({{ signed(row.delta) }})
          </span>
          <span v-else class="v-delta v-delta--none">—</span>
        </template>
        <template v-else>
          <span class="v-before">{{ fmt(row.before) }}</span>
          <span class="v-after">{{ fmt(row.after) }}</span>
          <span
            v-if="row.changed"
            class="v-delta"
            :class="row.up ? 'is-up' : 'is-down'"
          >
            ({{ signed(row.delta) }})
          </span>
          <span v-else class="v-delta v-delta--none">—</span>
        </template>
      </span>
    </div>

    <p v-if="rows.length === 0" class="bars-empty">Sin cambios</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  getArtisticCriteria,
  detectVariantFromScores,
} from "@/config/photo_schema";

const props = defineProps<{
  before: Record<string, number>;
  after: Record<string, number>;
  /** Muestra un único valor cuando la barra representa una referencia. */
  reference?: boolean;
  /** Valor de referencia por criterio; se pinta como marca en la barra. */
  medians?: Record<string, number>;
  /**
   * Criterios a pintar y en qué orden. Lo fija el grupo para que todas sus fotos
   * muestren las mismas filas en la misma posición y se puedan comparar en vertical
   * mientras se hace scroll lateral.
   */
  keys?: string[];
  /**
   * Modo animado: en vez de pintar el antes y el después a la vez, pinta UN valor
   * interpolado entre los dos (0 = antes, 1 = después). Quien lo pasa es el que
   * anima, para que todas las barras de una foto se muevan a la vez.
   */
  phase?: number | null;
}>();

const SCALE_MAX = 10;

const morph = computed(
  () => !props.reference && props.phase !== undefined && props.phase !== null,
);

const labels = computed<Record<string, string>>(() => {
  const variant = detectVariantFromScores(props.before);
  const map: Record<string, string> = {};
  for (const criterion of getArtisticCriteria(variant)) {
    map[criterion.key] = criterion.label;
  }
  return map;
});

interface BarRow {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number;
  min: number;
  max: number;
  changed: boolean;
  up: boolean;
  median: number | null;
  /** Valor pintado ahora mismo: interpolado en modo animado, el final si no. */
  current: number;
}

const rows = computed<BarRow[]>(() => {
  // Sin `keys` explícitas se cae al orden del esquema, nunca al orden de movimiento:
  // reordenar por delta rompería la comparación vertical entre fotos.
  const keys =
    props.keys ??
    getArtisticCriteria(detectVariantFromScores(props.before))
      .map((c: { key: string }) => c.key)
      .filter((key: string) => key in props.before);

  const result: BarRow[] = [];

  for (const key of keys) {
    const before = Number(props.before[key]);
    const after = Number(props.after?.[key] ?? before);
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;

    const delta = Number((after - before).toFixed(2));
    const changed = Math.abs(delta) >= 0.05;

    result.push({
      key,
      label: labels.value[key] ?? key.replace(/_/g, " "),
      before,
      after,
      delta,
      min: Math.min(before, after),
      max: Math.max(before, after),
      changed,
      up: delta > 0,
      median: props.medians?.[key] ?? null,
      current: before + (after - before) * (props.phase ?? 1),
    });
  }

  return result;
});

function pct(value: number): string {
  return `${Math.max(0, Math.min(100, (value / SCALE_MAX) * 100))}%`;
}

function fmt(value: number): string {
  return value.toFixed(1);
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}
</script>

<style scoped>
.bars {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bar-header {
  display: grid;
  grid-template-columns: 66px minmax(54px, 1fr) 112px;
  align-items: end;
  gap: 6px;
  height: 14px;
  color: #64748b;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
}

.bar-header-values {
  display: grid;
  grid-template-columns: 30px 40px 38px;
  gap: 2px;
  text-align: right;
}

.bar-header-value {
  grid-column: 1 / -1;
}

.bar-row {
  display: grid;
  /* La pista se lleva el espacio sobrante: es lo que hay que poder leer. */
  grid-template-columns: 66px minmax(54px, 1fr) 112px;
  align-items: center;
  gap: 6px;
  /* Altura fija: las filas de fotos contiguas deben cuadrar al milímetro. */
  height: 16px;
}

.bar-label {
  font-size: 10px;
  color: #475569;
  font-weight: 500;
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-row--changed .bar-label {
  color: #1e293b;
  font-weight: 600;
}

.bar-track {
  position: relative;
  height: 8px;
  border-radius: 4px;
  background: #f1f5f9;
  overflow: hidden;
}

.bar-base {
  position: absolute;
  inset: 0 auto 0 0;
  background: #e2e8f0;
}

.bar-row--changed .bar-base {
  background: #94a3b8;
}

.bar-delta {
  position: absolute;
  top: 0;
  bottom: 0;
}

.bar-delta.is-up {
  background: #22c55e;
}

.bar-delta.is-down {
  background: #ef4444;
}

/* Modo animado: una sola barra que viaja entre el antes y el después. */
.bar-live {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 4px;
  background: #94a3b8;
}

.bar-live.is-up {
  background: #22c55e;
}

.bar-live.is-down {
  background: #ef4444;
}

.bar-live.is-flat {
  background: #cbd5e1;
}

.bar-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: rgba(15, 23, 42, 0.28);
}

.bar-tick--after {
  width: 2px;
  margin-left: -1px;
  background: rgba(15, 23, 42, 0.55);
}

.bar-median {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  margin-left: -1px;
  background: #1e293b;
  opacity: 0.55;
}

.bar-values {
  display: grid;
  grid-template-columns: 30px 40px 38px;
  gap: 2px;
  align-items: center;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: #64748b;
  text-align: right;
}

.v-before {
  color: #64748b;
}

.v-reference {
  grid-column: 1 / -1;
  color: #1e293b;
  font-weight: 700;
}

.bar-header-current,
.v-current {
  grid-column: 1 / 3;
}

.v-current {
  color: #1e293b;
  font-weight: 700;
}

.v-current.is-up {
  color: #16a34a;
}

.v-current.is-down {
  color: #dc2626;
}

.v-after {
  color: #1e293b;
  font-weight: 700;
}

.v-delta {
  font-weight: 600;
  white-space: nowrap;
}

.v-delta.is-up {
  color: #16a34a;
}

.v-delta.is-down {
  color: #dc2626;
}

.v-delta--none {
  color: #94a3b8;
  font-weight: 500;
}

.bars-empty {
  margin: 0;
  font-size: 10px;
  color: #64748b;
}
</style>
