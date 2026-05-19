<template>
  <!-- Desktop: collapsed trigger or expanded panel -->
  <template v-if="!isMobile">
    <div
      v-if="!isExpanded"
      class="collapsed-panel"
      title="Map filters"
      @click.stop="isExpanded = true"
    >
      <n-icon class="settings-icon">
        <SettingOutlined />
      </n-icon>
    </div>

    <div v-else class="control-panel" @click.stop @wheel.stop>
      <!-- Close button -->
      <button class="close-panel-btn-corner" @click="isExpanded = false">
        <n-icon><CloseOutlined /></n-icon>
      </button>

      <!-- Panel title -->
      <div class="panel-title">
        <n-icon
          size="14"
          color="var(--text-on-primary)"
          style="margin-right: 6px; vertical-align: middle"
        >
          <FilterOutlined />
        </n-icon>
        Filters
        <span
          v-if="activeFiltersCount > 0"
          class="active-indicator"
          style="margin-left: 6px"
          >{{ activeFiltersCount }}</span
        >
      </div>

      <!-- Location source -->
      <div class="filter-group">
        <div class="filter-label">
          Location source
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="info-icon-btn"
                type="button"
                aria-label="About location source"
              >
                <n-icon size="14" color="var(--text-primary)"
                  ><InfoCircleOutlined
                /></n-icon>
              </button>
            </template>
            Camera GPS: only photos with device GPS data.<br />
            AI Confident: includes high and moderate confidence AI-inferred
            locations.<br />
            Uncertain: lower-confidence AI inferences.
          </n-tooltip>
        </div>
        <div class="filter-btn-group">
          <button
            class="filter-btn"
            :class="{ active: confidenceFilter.includes('gps') }"
            title="Camera GPS coordinates"
            @click="toggleConfidence('gps')"
          >
            GPS
          </button>
          <button
            class="filter-btn"
            :class="{
              active:
                confidenceFilter.includes('very_likely') ||
                confidenceFilter.includes('likely'),
            }"
            title="AI-inferred locations (high + moderate confidence)"
            @click="toggleAiConfident()"
          >
            AI Confident
          </button>
          <button
            class="filter-btn"
            :class="{ active: confidenceFilter.includes('uncertain') }"
            title="Lower-confidence AI inference"
            @click="toggleConfidence('uncertain')"
          >
            Uncertain
          </button>
        </div>
      </div>

      <!-- Location detail -->
      <div
        class="filter-group last"
        :class="{ 'filter-group-disabled': !granularityEnabled }"
      >
        <div class="filter-label">
          Location detail
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <button
                class="info-icon-btn"
                type="button"
                aria-label="About location detail"
              >
                <n-icon size="14" color="var(--text-primary)"
                  ><InfoCircleOutlined
                /></n-icon>
              </button>
            </template>
            City / Region: show only photos pinned to a specific city or
            region.<br />
            Only country: also include photos where only the country was
            identified.<br />
            <em>Applies only when AI sources are selected.</em>
          </n-tooltip>
        </div>
        <div class="filter-btn-group">
          <button
            class="filter-btn"
            :class="{ active: granularityFilter.includes('city_region') }"
            :disabled="!granularityEnabled"
            title="City or region precision"
            @click="granularityEnabled && toggleGranularity('city_region')"
          >
            City / Region
          </button>
          <button
            class="filter-btn"
            :class="{ active: granularityFilter.includes('country') }"
            :disabled="!granularityEnabled"
            title="Include country-level AI locations"
            @click="granularityEnabled && toggleGranularity('country')"
          >
            Only country
          </button>
        </div>
      </div>
    </div>
  </template>

  <!-- Mobile: floating button bar + drop-down modal -->
  <template v-if="isMobile">
    <div class="mobile-bar">
      <button
        class="mobile-config-btn"
        :class="{ active: mobileModal === 'filters' }"
        @click.stop="mobileModal = mobileModal === 'filters' ? null : 'filters'"
      >
        <n-icon size="16"><FilterOutlined /></n-icon>
        <span>Filters</span>
        <span v-if="activeFiltersCount > 0" class="mobile-badge">{{
          activeFiltersCount
        }}</span>
      </button>
    </div>

    <div
      v-if="mobileModal === 'filters'"
      class="mobile-modal"
      @click.stop="mobileModal = null"
    >
      <div class="mobile-modal-content" @click.stop>
        <div class="mobile-modal-header">
          <h3 class="mobile-modal-title">
            <n-icon size="18" style="vertical-align: middle; margin-right: 6px">
              <FilterOutlined />
            </n-icon>
            Filters
          </h3>
          <button class="mobile-modal-close" @click="mobileModal = null">
            <n-icon size="18"><CloseOutlined /></n-icon>
          </button>
        </div>
        <div class="mobile-modal-body">
          <!-- Location source -->
          <div class="filter-group">
            <div class="filter-label">
              Location source
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <button
                    class="info-icon-btn"
                    type="button"
                    aria-label="About location source"
                  >
                    <n-icon size="14" color="var(--text-primary)"
                      ><InfoCircleOutlined
                    /></n-icon>
                  </button>
                </template>
                Camera GPS: only photos with device GPS data.<br />
                AI Confident: includes high and moderate confidence AI-inferred
                locations.<br />
                Uncertain: lower-confidence AI inferences.
              </n-tooltip>
            </div>
            <div class="filter-btn-group">
              <button
                class="filter-btn"
                :class="{ active: confidenceFilter.includes('gps') }"
                title="Camera GPS coordinates"
                @click="toggleConfidence('gps')"
              >
                GPS
              </button>
              <button
                class="filter-btn"
                :class="{
                  active:
                    confidenceFilter.includes('very_likely') ||
                    confidenceFilter.includes('likely'),
                }"
                title="AI-inferred locations (high + moderate confidence)"
                @click="toggleAiConfident()"
              >
                AI Confident
              </button>
              <button
                class="filter-btn"
                :class="{ active: confidenceFilter.includes('uncertain') }"
                title="Lower-confidence AI inference"
                @click="toggleConfidence('uncertain')"
              >
                Uncertain
              </button>
            </div>
          </div>

          <!-- Location detail -->
          <div
            class="filter-group last"
            :class="{ 'filter-group-disabled': !granularityEnabled }"
          >
            <div class="filter-label">
              Location detail
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <button
                    class="info-icon-btn"
                    type="button"
                    aria-label="About location detail"
                  >
                    <n-icon size="14" color="var(--text-primary)"
                      ><InfoCircleOutlined
                    /></n-icon>
                  </button>
                </template>
                City / Region: show only photos pinned to a specific city or
                region.<br />
                Country too: also include photos where only the country was
                identified.<br />
                <em>Applies only when AI sources are selected.</em>
              </n-tooltip>
            </div>
            <div class="filter-btn-group">
              <button
                class="filter-btn"
                :class="{ active: granularityFilter.includes('city_region') }"
                :disabled="!granularityEnabled"
                title="City or region precision"
                @click="granularityEnabled && toggleGranularity('city_region')"
              >
                City / Region
              </button>
              <button
                class="filter-btn"
                :class="{ active: granularityFilter.includes('country') }"
                :disabled="!granularityEnabled"
                title="Include country-level AI locations"
                @click="granularityEnabled && toggleGranularity('country')"
              >
                Only country
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { NIcon, NTooltip } from "naive-ui";
import {
  CloseOutlined,
  SettingOutlined,
  FilterOutlined,
  InfoCircleOutlined,
} from "@vicons/antd";
import { useIsMobile } from "@/composables/useIsMobile.js";

// ── Props & emits ────────────────────────────────────────────────────────────

type ConfidenceLevel = "gps" | "very_likely" | "likely" | "uncertain";
type GranularityLevel = "city_region" | "country";

type ConfidenceFilter = ConfidenceLevel[];
type GranularityFilter = GranularityLevel[];

const props = defineProps<{
  confidenceFilter: ConfidenceFilter;
  granularityFilter: GranularityFilter;
}>();

const emit = defineEmits<{
  "update:confidenceFilter": [value: ConfidenceFilter];
  "update:granularityFilter": [value: GranularityFilter];
}>();

// ── Internal UI state ────────────────────────────────────────────────────────

const { isMobile } = useIsMobile();
const isExpanded = ref(false);
const mobileModal = ref<string | null>(null);

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggleConfidence(val: ConfidenceLevel) {
  const set = new Set(props.confidenceFilter);
  if (set.has(val)) set.delete(val);
  else set.add(val);
  emit("update:confidenceFilter", [...set]);
}

function toggleAiConfident() {
  const set = new Set(props.confidenceFilter);
  const hasAny = set.has("very_likely") || set.has("likely");
  if (hasAny) {
    set.delete("very_likely");
    set.delete("likely");
  } else {
    set.add("very_likely");
    set.add("likely");
  }
  emit("update:confidenceFilter", [...set]);
}

function toggleGranularity(val: GranularityLevel) {
  const set = new Set(props.granularityFilter);
  if (set.has(val)) set.delete(val);
  else set.add(val);
  emit("update:granularityFilter", [...set]);
}

// ── Computed ─────────────────────────────────────────────────────────────────

const granularityEnabled = computed(() =>
  props.confidenceFilter.some((f) => f !== "gps"),
);

const activeFiltersCount = computed(
  () => props.confidenceFilter.length + props.granularityFilter.length,
);
</script>

<style scoped>
/* ── Desktop: collapsed trigger ─────────────────────────────────────────── */

.collapsed-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 1000;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 30, 30, 0.85);
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
  touch-action: manipulation;
  backdrop-filter: blur(8px);
}

.collapsed-panel:hover {
  background: rgba(50, 50, 50, 0.9);
}

.settings-icon {
  color: #e5e5e5;
  font-size: 20px;
}

/* ── Desktop: expanded panel ────────────────────────────────────────────── */

.control-panel {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 325px;
  max-height: calc(100% - 32px);
  background: var(--bg-card);
  border-radius: 12px;
  padding: 16px;
  z-index: 1000;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 16px rgba(18, 24, 38, 0.24);
}

.close-panel-btn-corner {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-panel-btn-corner:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.panel-title {
  color: #e5e5e5;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  margin-bottom: 14px;
  padding-right: 24px; /* space for close button */
}

.active-indicator {
  background: var(--primary-color, #3b82f6);
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  min-width: 16px;
  text-align: center;
}

.info-icon-btn {
  margin-left: 3px;
  margin-top: 1px;
  background: transparent;
  border: none;
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
  vertical-align: middle;
}

.info-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.control-panel::-webkit-scrollbar {
  width: 6px;
}
.control-panel::-webkit-scrollbar-track {
  background: transparent;
}
.control-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
.control-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ── Mobile: floating bar ───────────────────────────────────────────────── */

.mobile-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 12px;
  gap: 8px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.45), transparent);
  z-index: 1000;
  pointer-events: none;
}

.mobile-config-btn {
  pointer-events: auto;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 7px 14px;
  background: var(--bg-card);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 10px;
  font-weight: 500;
  min-width: 60px;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(18, 24, 38, 0.2);
}

.mobile-config-btn:hover,
.mobile-config-btn.active {
  background: color-mix(in srgb, var(--primary-color) 18%, var(--bg-card));
  border-color: color-mix(in srgb, var(--primary-color) 40%, transparent);
  color: var(--primary-color);
}

.mobile-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  background: var(--primary-color);
  color: white;
  font-size: 9px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 8px;
  min-width: 14px;
  text-align: center;
  line-height: 1.3;
}

/* ── Mobile: drop-down modal ────────────────────────────────────────────── */

.mobile-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1002;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.mobile-modal-content {
  width: 100%;
  max-width: 500px;
  background: var(--bg-card);
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.mobile-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.mobile-modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  display: flex;
  align-items: center;
}

.mobile-modal-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}

.mobile-modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.mobile-modal-body {
  padding: 16px;
}

/* ── Filter controls (shared desktop + mobile) ──────────────────────────── */

.filter-group {
  margin-bottom: 14px;
}

.filter-group.last {
  margin-bottom: 0;
}

.filter-label {
  display: flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 7px;
}

.filter-btn-group {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.filter-btn {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  transition: all 0.18s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

.filter-btn.active {
  background: color-mix(in srgb, var(--primary-color) 22%, transparent);
  border-color: color-mix(in srgb, var(--primary-color) 45%, transparent);
  color: var(--primary-color);
  font-weight: 600;
}

.filter-group-disabled {
  opacity: 0.38;
  pointer-events: none;
}

.filter-btn:disabled {
  cursor: not-allowed;
}
</style>
