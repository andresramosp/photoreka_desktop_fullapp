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
          <!-- Body: photo left + content right -->
          <div class="loc-correction-body">
            <!-- Left: photo thumbnail -->
            <div v-if="photoThumbnail" class="loc-correction-thumb-col">
              <img
                :src="photoThumbnail"
                class="loc-correction-thumb"
                alt=""
                loading="lazy"
              />
            </div>

            <!-- Right: info + step content -->
            <div class="loc-correction-content-col">
              <!-- Local header -->
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

              <!-- Search step -->
              <template v-if="step === 'search'">
                <p class="loc-correction-hint">
                  Doesn't look right? Search for the correct location.
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
                    >
                      <template #prefix>
                        <n-icon size="14">
                          <svg viewBox="0 0 24 24">
                            <path
                              fill="currentColor"
                              d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"
                            />
                          </svg>
                        </n-icon>
                      </template>
                    </n-input>
                  </div>

                  <!-- Suggestions dropdown — absolutely positioned so it overlays without stretching the card -->
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
                      <n-icon size="13" class="loc-suggestion-icon">
                        <svg viewBox="0 0 24 24">
                          <path
                            fill="currentColor"
                            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                          />
                        </svg>
                      </n-icon>
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
                </div>

                <div
                  v-if="
                    query.length >= 2 &&
                    !isLoading &&
                    searched &&
                    suggestions.length === 0
                  "
                  class="loc-correction-no-results"
                >
                  No results found
                </div>

                <div
                  v-if="sessionLimitReached"
                  class="loc-correction-limit-warning"
                >
                  Monthly autocomplete limit reached. Please try again next
                  month.
                </div>
              </template>

              <!-- Confirm step -->
              <template v-else-if="step === 'confirm'">
                <div class="loc-correction-confirm-body">
                  <div class="loc-correction-confirm-address">
                    <n-icon size="16" color="var(--accent-color)">
                      <svg viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                        />
                      </svg>
                    </n-icon>
                    <span>{{ pendingAddress }}</span>
                  </div>
                  <!-- <p class="loc-correction-confirm-question">
                    Update the location of this photo to the address above?
                  </p> -->
                </div>
                <div class="loc-correction-actions">
                  <n-button size="small" @click="step = 'search'"
                    >Back</n-button
                  >
                  <n-button
                    size="small"
                    type="primary"
                    :loading="isSaving"
                    @click="confirmUpdate"
                  >
                    Confirm
                  </n-button>
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
import { api } from "@/utils/axios";

const props = defineProps<{
  show: boolean;
  photoId: string | number | null;
  photoName?: string;
  photoThumbnail?: string | null;
  currentAddress?: string | null;
}>();

const emit = defineEmits<{
  "update:show": [value: boolean];
  confirmed: [
    payload: {
      lat: number;
      lng: number;
      formattedAddress: string;
      placeId: string | null;
      granularity: string | null;
    },
  ];
}>();

type Step = "search" | "confirm";

interface Suggestion {
  mapbox_id: string;
  name: string;
  place_formatted?: string;
  full_address?: string;
}

const inputRef = ref<any>(null);
const step = ref<Step>("search");
const query = ref("");
const suggestions = ref<Suggestion[]>([]);
const isLoading = ref(false);
const isSaving = ref(false);
const searched = ref(false);
const sessionLimitReached = ref(false);
const pendingAddress = ref("");
const pendingMapboxId = ref("");

/** UUID session token — one per popup open, groups all suggest calls into one billable session */
const sessionToken = ref("");

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
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
  sessionToken.value = generateSessionToken();
}

watch(
  () => props.show,
  (open) => {
    if (open) {
      resetState();
      nextTick(() => {
        inputRef.value?.focus();
      });
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
  isLoading.value = true;
  try {
    const { data } = await api.post("/api/geocoding/suggest", {
      query: query.value,
      session_token: sessionToken.value,
    });
    suggestions.value = (data.suggestions ?? []) as Suggestion[];
    searched.value = true;
  } catch (error: any) {
    console.warn("[LocationCorrectionPopup] suggest error:", error?.message);
    suggestions.value = [];
    searched.value = true;
  } finally {
    isLoading.value = false;
  }
}

async function selectSuggestion(suggestion: Suggestion) {
  pendingMapboxId.value = suggestion.mapbox_id;
  pendingAddress.value =
    suggestion.full_address ??
    suggestion.place_formatted ??
    suggestion.name ??
    "";
  step.value = "confirm";
}

async function confirmUpdate() {
  if (!props.photoId || !pendingMapboxId.value) return;
  isSaving.value = true;
  try {
    // Retrieve coordinates (this finalises the session and increments the monthly counter)
    const { data: geo } = await api.post("/api/geocoding/retrieve", {
      mapbox_id: pendingMapboxId.value,
      session_token: sessionToken.value,
    });

    if (!geo || geo.lat == null || geo.lng == null) {
      throw new Error("Could not retrieve coordinates");
    }

    // Apply the new coordinates on the backend
    await api.patch(`/api/photos/${props.photoId}/location`, {
      lat: geo.lat,
      lng: geo.lng,
      formattedAddress: geo.formattedAddress ?? pendingAddress.value,
      placeId: geo.placeId ?? null,
      granularity: geo.granularity ?? null,
    });

    emit("confirmed", {
      lat: geo.lat,
      lng: geo.lng,
      formattedAddress: geo.formattedAddress ?? pendingAddress.value,
      placeId: geo.placeId ?? null,
      granularity: geo.granularity ?? null,
    });
    emit("update:show", false);
  } catch (error: any) {
    if (error?.response?.status === 429) {
      sessionLimitReached.value = true;
      step.value = "search";
    } else {
      console.warn("[LocationCorrectionPopup] confirm error:", error?.message);
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
  z-index: 20000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.loc-correction-card {
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  width: 100%;
  max-width: 550px;
  display: flex;
  flex-direction: column;
  /* overflow visible so the absolute suggestions dropdown isn't clipped */
}

.loc-correction-body {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-height: 160px;
}

.loc-correction-thumb-col {
  flex-shrink: 0;
  width: 155px;
  min-height: 155px;
  background: var(--bg-surface);
  /* border-radius: 12px 0 0 12px; */
  overflow: hidden;
}

.loc-correction-thumb {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.loc-correction-content-col {
  flex: 1;
  min-width: 0;
  padding: 16px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loc-correction-local-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.loc-correction-local-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.loc-correction-local-header-text {
  display: flex;
  flex-direction: column;

  min-width: 0;
}

.loc-correction-header-icon {
  color: var(--accent-color);
  flex-shrink: 0;
}

.loc-correction-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.2;
}

.loc-correction-current-address {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loc-correction-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-primary);
  opacity: 0.7;
  font-style: italic;
}

.loc-correction-search-area {
  position: relative;
  width: 100%;
}

.loc-correction-search-wrap {
  width: 100%;
}

.loc-correction-suggestions {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.loc-correction-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
}

.loc-correction-suggestion:hover {
  background: var(--bg-container);
}

.loc-suggestion-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-top: 2px;
}

.loc-suggestion-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.loc-suggestion-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loc-suggestion-sub {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loc-correction-no-results {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  padding: 8px 0;
}

.loc-correction-limit-warning {
  font-size: 12px;
  color: var(--warning-color, #f0a020);
  padding: 8px;
  border: 1px solid var(--warning-color, #f0a020);
  border-radius: 6px;
  background: rgba(240, 160, 32, 0.08);
}

/* Confirm step */
.loc-correction-confirm-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.loc-correction-confirm-address {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  padding: 5px;
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.loc-correction-confirm-question {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.loc-correction-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Transition */
.loc-correction-fade-enter-active,
.loc-correction-fade-leave-active {
  transition: opacity 0.18s ease;
}
.loc-correction-fade-enter-active .loc-correction-card,
.loc-correction-fade-leave-active .loc-correction-card {
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}
.loc-correction-fade-enter-from,
.loc-correction-fade-leave-to {
  opacity: 0;
}
.loc-correction-fade-enter-from .loc-correction-card,
.loc-correction-fade-leave-to .loc-correction-card {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}
</style>
