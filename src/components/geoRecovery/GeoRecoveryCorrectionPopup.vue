<template>
  <Teleport to="body">
    <Transition name="loc-correction-fade">
      <div
        v-if="show"
        class="loc-correction-backdrop"
        @click.self="handleClose"
      >
        <div
          class="loc-correction-card"
          role="dialog"
          aria-modal="true"
          aria-label="Correct photo location"
        >
          <div class="loc-correction-body">
            <div v-if="photoThumbnail" class="loc-correction-thumb-col">
              <img
                :src="photoThumbnail"
                class="loc-correction-thumb"
                alt=""
                loading="lazy"
              />
            </div>

            <div class="loc-correction-content-col">
              <div class="loc-correction-local-header">
                <div class="loc-correction-local-header-left">
                  <n-icon size="22" class="loc-correction-header-icon">
                    <svg viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                      />
                    </svg>
                  </n-icon>
                  <div class="loc-correction-local-header-text">
                    <span class="loc-correction-title">Adjust location</span>
                    <span
                      v-if="currentAddress"
                      class="loc-correction-current-address"
                      >{{ currentAddress }}</span
                    >
                  </div>
                </div>
                <n-button quaternary circle size="tiny" @click="handleClose">
                  <template #icon>
                    <n-icon size="14">
                      <svg viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
                        />
                      </svg>
                    </n-icon>
                  </template>
                </n-button>
              </div>

              <template v-if="step === 'search'">
                <p class="loc-correction-hint">
                  Search for the correct location.
                </p>
                <div class="loc-correction-search-area">
                  <div class="loc-correction-search-wrap">
                    <n-input
                      ref="inputRef"
                      v-model:value="query"
                      placeholder="Search address or place…"
                      clearable
                      :loading="isLoading"
                      @input="onQueryInput"
                      @clear="clearSearch"
                      @keydown.escape="handleClose"
                    />
                  </div>

                  <div
                    v-if="suggestions.length > 0"
                    class="loc-correction-suggestions"
                  >
                    <button
                      v-for="(s, i) in suggestions"
                      :key="i"
                      class="loc-correction-suggestion"
                      type="button"
                      @click="selectSuggestion(s)"
                    >
                      <div class="loc-suggestion-text">
                        <span class="loc-suggestion-name">{{ s.name }}</span>
                        <span
                          v-if="s.place_formatted"
                          class="loc-suggestion-sub"
                          >{{ s.place_formatted }}</span
                        >
                      </div>
                    </button>
                  </div>
                  <div
                    v-else-if="searched && !isLoading"
                    class="loc-correction-empty"
                  >
                    No matches.
                  </div>
                </div>
                <n-alert
                  v-if="sessionLimitReached"
                  type="warning"
                  size="small"
                  style="margin-top: 8px"
                >
                  Monthly autocomplete quota reached. Try again later.
                </n-alert>
              </template>

              <template v-else-if="step === 'confirm'">
                <p class="loc-correction-hint">
                  Use this location?
                  <strong>{{ pendingAddress }}</strong>
                </p>
                <div class="loc-correction-confirm-row">
                  <n-button @click="step = 'search'" :disabled="isSaving"
                    >Back</n-button
                  >
                  <n-button
                    type="primary"
                    :loading="isSaving"
                    @click="confirmUpdate"
                    >Apply</n-button
                  >
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { NAlert, NButton, NIcon, NInput } from "naive-ui";

import {
  geocodingRetrieve,
  geocodingSuggest,
  type GeocodingSuggestion,
} from "@/utils/geoRecovery/api";

const props = defineProps<{
  show: boolean;
  /** Geo-recovery session token used to call the gated geocoding endpoints. */
  apiToken: string | null;
  /** Local id of the photo being corrected. */
  photoId: string | null;
  photoThumbnail?: string | null;
  currentAddress?: string | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  confirmed: [
    payload: {
      photoId: string;
      lat: number;
      lng: number;
      formattedAddress: string;
    },
  ];
}>();

type Step = "search" | "confirm";

const inputRef = ref<any>(null);
const step = ref<Step>("search");
const query = ref("");
const suggestions = ref<GeocodingSuggestion[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const searched = ref(false);
const sessionLimitReached = ref(false);
const pendingAddress = ref("");
const pendingMapboxId = ref("");

/** UUID session token grouping all suggest calls into one billable Mapbox session. */
const mapboxSessionToken = ref("");

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function resetState() {
  step.value = "search";
  query.value = "";
  suggestions.value = [];
  isLoading.value = false;
  isSaving.value = false;
  searched.value = false;
  sessionLimitReached.value = false;
  pendingAddress.value = "";
  pendingMapboxId.value = "";
  mapboxSessionToken.value = generateSessionToken();
}

watch(
  () => props.show,
  (open) => {
    if (open) {
      resetState();
      nextTick(() => inputRef.value?.focus());
    }
  },
);

function handleClose() {
  emit("update:show", false);
}

function onQueryInput() {
  searched.value = false;
  suggestions.value = [];
  if (debounceTimer) clearTimeout(debounceTimer);
  if (query.value.length < 2) return;
  debounceTimer = setTimeout(fetchSuggestions, 280);
}

function clearSearch() {
  suggestions.value = [];
  searched.value = false;
}

async function fetchSuggestions() {
  if (!query.value || query.value.length < 2) return;
  if (!props.apiToken) return;
  isLoading.value = true;
  try {
    const data = await geocodingSuggest(
      props.apiToken,
      query.value,
      mapboxSessionToken.value,
    );
    suggestions.value = data.suggestions ?? [];
    searched.value = true;
  } catch (error) {
    console.warn(
      "[GeoRecoveryCorrectionPopup] suggest error:",
      (error as Error).message,
    );
    suggestions.value = [];
    searched.value = true;
  } finally {
    isLoading.value = false;
  }
}

function selectSuggestion(s: GeocodingSuggestion) {
  pendingMapboxId.value = s.mapbox_id;
  pendingAddress.value = s.full_address || s.place_formatted || s.name || "";
  step.value = "confirm";
}

async function confirmUpdate() {
  if (!props.apiToken || !props.photoId || !pendingMapboxId.value) return;
  isSaving.value = true;
  try {
    const geo = await geocodingRetrieve(
      props.apiToken,
      pendingMapboxId.value,
      mapboxSessionToken.value,
    );
    if (!geo || geo.lat == null || geo.lng == null) {
      throw new Error("Could not retrieve coordinates");
    }
    emit("confirmed", {
      photoId: props.photoId,
      lat: geo.lat,
      lng: geo.lng,
      formattedAddress: geo.formattedAddress ?? pendingAddress.value,
    });
    emit("update:show", false);
  } catch (error: any) {
    if (error?.response?.status === 429) {
      sessionLimitReached.value = true;
      step.value = "search";
    } else {
      console.warn(
        "[GeoRecoveryCorrectionPopup] confirm error:",
        error?.message,
      );
    }
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.loc-correction-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}
.loc-correction-card {
  background: var(--bg-container, #1f1f1f);
  border-radius: 12px;
  width: min(560px, 92vw);
  max-height: 84vh;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  border: 1px solid var(--border-color, #2a2a2a);
}
.loc-correction-body {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 16px;
  padding: 16px;
}
@media (max-width: 520px) {
  .loc-correction-body {
    grid-template-columns: 1fr;
  }
  .loc-correction-thumb-col {
    display: none;
  }
}
.loc-correction-thumb {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: 8px;
}
.loc-correction-local-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.loc-correction-local-header-left {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.loc-correction-local-header-text {
  display: flex;
  flex-direction: column;
}
.loc-correction-title {
  font-weight: 600;
  font-size: 15px;
}
.loc-correction-current-address {
  font-size: 12px;
  color: var(--text-color-3, #888);
}
.loc-correction-hint {
  margin: 6px 0 8px;
  font-size: 13px;
  color: var(--text-color-2, #ccc);
}
.loc-correction-search-area {
  position: relative;
}
.loc-correction-suggestions {
  margin-top: 6px;
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg-card, #181818);
}
.loc-correction-suggestion {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.loc-correction-suggestion:hover {
  background: rgba(255, 255, 255, 0.05);
}
.loc-suggestion-name {
  font-size: 13px;
  font-weight: 600;
}
.loc-suggestion-sub {
  font-size: 12px;
  color: var(--text-color-3, #888);
}
.loc-correction-empty {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-3, #888);
}
.loc-correction-confirm-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.loc-correction-fade-enter-active,
.loc-correction-fade-leave-active {
  transition: opacity 0.18s ease;
}
.loc-correction-fade-enter-from,
.loc-correction-fade-leave-to {
  opacity: 0;
}
</style>
