<template>
  <div class="report-section">
    <div class="report-section-header">
      <h2 class="section-title">
        <n-icon class="section-icon">
          <CameraIcon />
        </n-icon>
        Camera & Optics
      </h2>
      <p class="section-description">
        What you shot with, read from the EXIF of your photos
      </p>
    </div>

    <template v-if="stats.photosWithExif > 0">
      <!-- Titulares: los cuatro números que resumen la sección -->
      <div class="tech-kpis">
        <div class="tech-kpi">
          <span class="tech-kpi-value">{{ stats.exifCoverage }}%</span>
          <span class="tech-kpi-label">
            of your catalog carries EXIF
            <span class="tech-kpi-detail">
              ({{ stats.photosWithExif }} of {{ stats.totalPhotos }})
            </span>
          </span>
        </div>
        <div class="tech-kpi">
          <span class="tech-kpi-value">{{ stats.cameras.distinct }}</span>
          <span class="tech-kpi-label">
            {{ stats.cameras.distinct === 1 ? "camera body" : "camera bodies" }}
            <span v-if="topCamera" class="tech-kpi-detail">
              — mostly {{ topCamera.label }}
            </span>
          </span>
        </div>
        <div class="tech-kpi">
          <span class="tech-kpi-value">{{
            stats.iso.median !== null ? Math.round(stats.iso.median) : "—"
          }}</span>
          <span class="tech-kpi-label">median ISO</span>
        </div>
        <div class="tech-kpi">
          <span class="tech-kpi-value">{{
            formatFocalLength(stats.focalClasses.median) || "—"
          }}</span>
          <span class="tech-kpi-label">median focal length</span>
        </div>
      </div>

      <div class="tech-grid">
        <!-- Cámaras: categorías nominales, así que un solo tono y el ranking
             hace el trabajo. El logotipo identifica la fila, no el color. -->
        <section class="tech-card tech-card--wide">
          <header class="tech-card-header">
            <h3 class="tech-card-title">Cameras</h3>
            <span class="tech-card-meta">
              {{ stats.cameras.photosWithData }} photos ·
              {{ stats.cameras.distinct }} distinct
              {{ stats.cameras.distinct === 1 ? "body" : "bodies" }}
            </span>
          </header>

          <div v-if="stats.cameras.ranking.length" class="rank-list">
            <div
              v-for="row in stats.cameras.ranking"
              :key="row.label"
              class="rank-row"
              :title="`${row.label} — ${row.count} ${row.count === 1 ? 'photo' : 'photos'} (${row.percentage}%)`"
            >
              <CameraBrandLogo
                v-if="!row.isOther"
                :camera-label="row.label"
                class="rank-logo"
              />
              <span v-else class="rank-logo rank-logo--other">···</span>

              <span class="rank-label">{{ row.label }}</span>

              <div class="rank-bar-track">
                <div
                  class="rank-bar-fill"
                  :style="{
                    width: `${barWidth(row.count, maxCameraCount)}%`,
                    backgroundColor: inkColor,
                  }"
                ></div>
              </div>

              <span class="rank-value">
                {{ row.count }}
                <span class="rank-share">{{ row.percentage }}%</span>
              </span>
            </div>
          </div>
          <p v-else class="tech-empty">No camera model recorded in your EXIF.</p>
        </section>

        <!-- Tipo de objetivo: parte-de-un-todo con clases ordenadas, de ahí el
             donut con una rampa de un solo tono (claro = ancho, oscuro = tele). -->
        <section class="tech-card">
          <header class="tech-card-header">
            <h3 class="tech-card-title">Lens type</h3>
            <span class="tech-card-meta">
              by focal length ·
              {{ stats.focalClasses.photosWithData }} photos
            </span>
          </header>

          <div v-if="focalSegments.length" class="donut-layout">
            <svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Share of photos by lens type">
              <circle
                class="donut-track"
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke="var(--bg-surface)"
                stroke-width="5"
              />
              <circle
                v-for="segment in focalSegments"
                :key="segment.label"
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                :stroke="segment.color"
                stroke-width="5"
                :stroke-dasharray="segment.dashArray"
                :stroke-dashoffset="segment.dashOffset"
                transform="rotate(-90 21 21)"
              >
                <title>
                  {{ segment.label }} ({{ segment.hint }}) — {{ segment.count }}
                  photos, {{ segment.percentage }}%
                </title>
              </circle>
              <text class="donut-center-value" x="21" y="20.5">
                {{ stats.focalClasses.photosWithData }}
              </text>
              <text class="donut-center-label" x="21" y="25">photos</text>
            </svg>

            <ul class="donut-legend">
              <li
                v-for="segment in focalSegments"
                :key="segment.label"
                class="donut-legend-row"
              >
                <span
                  class="donut-swatch"
                  :style="{ backgroundColor: segment.color }"
                ></span>
                <span class="donut-legend-label">
                  {{ segment.label }}
                  <span class="donut-legend-hint">{{ segment.hint }}</span>
                </span>
                <span class="donut-legend-value">
                  {{ segment.count }}
                  <span class="rank-share">{{ segment.percentage }}%</span>
                </span>
              </li>
            </ul>
          </div>
          <p v-else class="tech-empty">No focal length recorded in your EXIF.</p>
        </section>

        <section class="tech-card">
          <header class="tech-card-header">
            <h3 class="tech-card-title">ISO</h3>
            <span class="tech-card-meta">{{ isoSummary }}</span>
          </header>
          <HistogramChart
            v-if="stats.iso.photosWithData"
            :bars="stats.iso.buckets"
            :color="inkColor"
            aria-label="Photos by ISO"
          />
          <p v-else class="tech-empty">No ISO recorded in your EXIF.</p>
        </section>

        <section class="tech-card">
          <header class="tech-card-header">
            <h3 class="tech-card-title">Shutter speed</h3>
            <span class="tech-card-meta">{{ shutterSummary }}</span>
          </header>
          <HistogramChart
            v-if="stats.shutter.photosWithData"
            :bars="stats.shutter.buckets"
            :color="inkColor"
            aria-label="Photos by shutter speed"
          />
          <p v-else class="tech-empty">
            No exposure time recorded in your EXIF.
          </p>
        </section>

        <section class="tech-card">
          <header class="tech-card-header">
            <h3 class="tech-card-title">Aperture</h3>
            <span class="tech-card-meta">{{ apertureSummary }}</span>
          </header>
          <HistogramChart
            v-if="stats.aperture.photosWithData"
            :bars="stats.aperture.buckets"
            :color="inkColor"
            aria-label="Photos by aperture"
          />
          <p v-else class="tech-empty">No aperture recorded in your EXIF.</p>
        </section>

        <!-- El modelo de objetivo solo lo escriben algunos caminos de subida, así
             que la tarjeta aparece únicamente cuando hay algo que contar. -->
        <section
          v-if="stats.lenses.photosWithData > 0"
          class="tech-card tech-card--wide"
        >
          <header class="tech-card-header">
            <h3 class="tech-card-title">Lenses</h3>
            <span class="tech-card-meta">
              {{ stats.lenses.photosWithData }} photos ·
              {{ stats.lenses.distinct }} distinct
            </span>
          </header>

          <div class="rank-list">
            <div
              v-for="row in stats.lenses.ranking"
              :key="row.label"
              class="rank-row rank-row--no-logo"
              :title="`${row.label} — ${row.count} ${row.count === 1 ? 'photo' : 'photos'} (${row.percentage}%)`"
            >
              <span class="rank-label">{{ row.label }}</span>

              <div class="rank-bar-track">
                <div
                  class="rank-bar-fill"
                  :style="{
                    width: `${barWidth(row.count, maxLensCount)}%`,
                    backgroundColor: inkColor,
                  }"
                ></div>
              </div>

              <span class="rank-value">
                {{ row.count }}
                <span class="rank-share">{{ row.percentage }}%</span>
              </span>
            </div>
          </div>
        </section>
      </div>

      <p class="tech-footnote">
        Focal lengths are shown as the camera recorded them, without a 35mm
        equivalence — on an APS-C or Micro 4/3 body the real framing is tighter
        than its class suggests.
      </p>
    </template>

    <!-- Empty state -->
    <div v-else class="tech-empty-state">
      <n-icon size="48" :component="CameraIcon" class="empty-icon" />
      <p class="empty-text">
        None of your photos carry EXIF data, so there is nothing to break down
        here yet.
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { CameraOutline as CameraIcon } from "@vicons/ionicons5";
import { useThemeMode } from "@/composables/useTheme.js";
import CameraBrandLogo from "@/components/report/CameraBrandLogo.vue";
import HistogramChart from "@/components/report/HistogramChart.vue";
import {
  buildTechnicalStats,
  formatAperture,
  formatFocalLength,
  formatShutterSpeed,
} from "@/utils/exifStats.js";

const props = defineProps({
  photos: {
    type: Array,
    required: true,
  },
});

const { isDarkMode } = useThemeMode();

// Un solo tono para las barras: las cámaras son categorías nominales y el
// largo de la barra ya codifica la magnitud, así que pintar cada una de un
// color gastaría el canal de identidad en repetir lo que se ve.
// Los dos pasos están elegidos para superar el 3:1 sobre su propia superficie
// (5.2:1 sobre #FFFFFF, 4.8:1 sobre #18181c).
const inkColor = computed(() => (isDarkMode.value ? "#3b82f6" : "#2563eb"));

// Rampa ordinal (un tono, pasos de luminosidad monótonos) para las clases de
// focal, que sí tienen orden: claro = gran angular, oscuro = teleobjetivo.
// Validada en ambos modos: L monótona, ΔL ≥ 0.06 y el extremo pegado al fondo
// por encima de 2:1.
const FOCAL_RAMP_LIGHT = ["#60a5fa", "#3b82f6", "#2563eb", "#1e40af", "#152a5e"];
const FOCAL_RAMP_DARK = ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb"];

const stats = computed(() => buildTechnicalStats(props.photos));

const topCamera = computed(
  () => stats.value.cameras.ranking.find((row) => !row.isOther) || null,
);

const maxCameraCount = computed(() =>
  Math.max(...stats.value.cameras.ranking.map((row) => row.count), 0),
);

const maxLensCount = computed(() =>
  Math.max(...stats.value.lenses.ranking.map((row) => row.count), 0),
);

const barWidth = (count, max) => (max > 0 ? (count / max) * 100 : 0);

/**
 * Gajos del donut. Se recorta un pelín cada arco para dejar 2px de fondo entre
 * gajos, pero nunca más de la mitad del propio gajo: si no, un 0,4% se
 * quedaría sin nada que pintar y desaparecería del gráfico.
 */
const focalSegments = computed(() => {
  const ramp = isDarkMode.value ? FOCAL_RAMP_DARK : FOCAL_RAMP_LIGHT;
  const visible = stats.value.focalClasses.segments.filter(
    (segment) => segment.count > 0,
  );
  if (visible.length === 0) return [];

  const total = visible.reduce((sum, segment) => sum + segment.count, 0);
  let cumulative = 0;

  return stats.value.focalClasses.segments
    .map((segment, index) => ({ segment, color: ramp[index] ?? ramp[0] }))
    .filter(({ segment }) => segment.count > 0)
    .map(({ segment, color }) => {
      const share = (segment.count / total) * 100;
      const gap = visible.length > 1 ? Math.min(1, share / 2) : 0;
      const arc = {
        label: segment.label,
        hint: segment.hint,
        count: segment.count,
        percentage: segment.percentage,
        color,
        dashArray: `${share - gap} ${100 - share + gap}`,
        dashOffset: -cumulative,
      };
      cumulative += share;
      return arc;
    });
});

const rangeSummary = (stat, format) => {
  if (!stat.photosWithData) return "no data";
  const median = format(stat.median);
  const min = format(stat.min);
  const max = format(stat.max);
  return `median ${median} · ${min}–${max}`;
};

const isoSummary = computed(() =>
  rangeSummary(stats.value.iso, (value) =>
    value === null ? "—" : String(Math.round(value)),
  ),
);

const apertureSummary = computed(() =>
  rangeSummary(stats.value.aperture, (value) => formatAperture(value) || "—"),
);

const shutterSummary = computed(() =>
  rangeSummary(
    stats.value.shutter,
    (value) => formatShutterSpeed(value) || "—",
  ),
);
</script>

<style scoped>
/* KPI row */
.tech-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-2xl);
}

.tech-kpi {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-lg) var(--spacing-xl);
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.tech-kpi-value {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  line-height: 1.1;
}

.tech-kpi-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

.tech-kpi-detail {
  color: var(--text-tertiary);
}

/* Cards grid */
.tech-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-xl);
  align-items: start;
}

.tech-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.tech-card:hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-lg);
}

.tech-card--wide {
  grid-column: span 2;
}

.tech-card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-md);
  flex-wrap: wrap;
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: 2px solid var(--border-color);
}

.tech-card-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.tech-card-meta {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.tech-empty {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  margin: 0;
}

/* Ranked bars (cameras, lenses) */
.rank-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
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

/* Donut */
.donut-layout {
  display: flex;
  align-items: center;
  gap: var(--spacing-2xl);
}

.donut {
  width: 132px;
  height: 132px;
  flex-shrink: 0;
}

.donut-center-value {
  fill: var(--text-primary);
  font-size: 7px;
  font-weight: var(--font-weight-semibold);
  text-anchor: middle;
}

.donut-center-label {
  fill: var(--text-tertiary);
  font-size: 3.2px;
  text-anchor: middle;
}

.donut-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  min-width: 0;
}

.donut-legend-row {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  align-items: center;
  gap: var(--spacing-sm);
}

.donut-swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.donut-legend-label {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.donut-legend-hint {
  color: var(--text-tertiary);
  margin-left: var(--spacing-xs);
}

.donut-legend-value {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tech-footnote {
  margin: var(--spacing-xl) 0 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  line-height: var(--line-height-relaxed);
}

/* Empty state */
.tech-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4xl) var(--spacing-2xl);
  gap: var(--spacing-md);
  text-align: center;
}

/* Responsive */
@media (max-width: 1400px) {
  .tech-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 1024px) {
  .tech-grid {
    grid-template-columns: 1fr;
  }

  .tech-card--wide {
    grid-column: span 1;
  }
}

@media (max-width: 768px) {
  .tech-kpis {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }

  .tech-kpi {
    padding: var(--spacing-md) var(--spacing-lg);
  }

  .tech-kpi-value {
    font-size: var(--font-size-2xl);
  }

  .rank-row {
    grid-template-columns: 64px 1fr auto;
    grid-template-areas:
      "logo label label"
      "bar  bar   value";
    gap: var(--spacing-sm) var(--spacing-md);
  }

  .rank-row--no-logo {
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

  .donut-layout {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-lg);
  }

  .donut {
    align-self: center;
  }
}
</style>
