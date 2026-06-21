<template>
  <!-- Mobile: Full screen drawer/modal -->
  <n-drawer
    v-model:show="visibleModel"
    placement="bottom"
    :height="'100%'"
    :width="'100%'"
    :trap-focus="true"
    :close-on-esc="true"
    class="photo-info-mobile-drawer"
  >
    <n-drawer-content :native-scrollbar="false" :closable="false">
      <!-- Header with photo name and close -->
      <template #header>
        <div class="mobile-header">
          <div class="mobile-header-title">
            <span class="mobile-photo-name">
              {{
                selectedPhoto?.originalFileName &&
                selectedPhoto.originalFileName.length > 10
                  ? selectedPhoto.originalFileName.slice(0, 10) + "…"
                  : selectedPhoto?.originalFileName || "Untitled"
              }}
            </span>
            <n-button
              size="tiny"
              quaternary
              @click="emit('copy-name')"
              title="Copy name"
            >
              <template #icon>
                <n-icon size="14">
                  <CopyIcon />
                </n-icon>
              </template>
            </n-button>
          </div>
          <div class="mobile-fab-wrapper">
            <FloatingActionBar
              :embedded="true"
              :selected-ids="selectedPhoto?.id ? [selectedPhoto.id] : []"
              :show-delete="showDelete"
              :show-add-to-collection="showAddToCollection"
              :show-move-to-tool="showMoveToTool"
              :show-send-to-chat="showSendToChat"
              @delete="emit('delete-photo')"
              @download="emit('download')"
              @add-to-collection="emit('add-to-collection')"
              @move-to-tool="emit('move-to-tool')"
              @send-to-chat="emit('send-to-chat')"
            />
          </div>
          <n-button
            quaternary
            circle
            size="small"
            class="mobile-close-btn"
            @click="visibleModel = false"
          >
            <template #icon>
              <n-icon size="20">
                <CloseIcon />
              </n-icon>
            </template>
          </n-button>
        </div>
      </template>

      <div class="mobile-content">
        <!-- Photo Display -->
        <div class="mobile-photo-container">
          <img
            :src="selectedPhoto?.thumbnailUrl"
            :alt="selectedPhoto?.filename || selectedPhoto?.name || 'Photo'"
            class="mobile-photo"
            @error="emit('image-error', $event)"
            @click="emit('open-fullscreen')"
          />
          <!-- Photo credit badge (if available) -->
          <a
            v-if="photoCredit"
            :href="photoCredit.url"
            target="_blank"
            rel="noopener noreferrer"
            class="photo-credit-badge mobile"
            :title="`Photo by ${photoCredit.username}`"
          >
            <n-icon size="14">
              <LogoInstagram />
            </n-icon>
            <span>{{ photoCredit.username }}</span>
          </a>

          <!-- Quick Actions Overlay -->
          <div class="mobile-photo-actions">
            <n-button
              size="small"
              quaternary
              class="mobile-action-btn"
              @click="emit('download')"
              title="Download"
            >
              <template #icon>
                <n-icon size="18">
                  <DownloadIcon />
                </n-icon>
              </template>
            </n-button>
            <n-button
              size="small"
              quaternary
              class="mobile-action-btn"
              @click="emit('open-fullscreen')"
              title="Fullscreen"
            >
              <template #icon>
                <n-icon size="18">
                  <FullscreenOutlined />
                </n-icon>
              </template>
            </n-button>
          </div>
        </div>

        <!-- Horizontal Tabs -->
        <div class="mobile-tabs-container">
          <n-tabs
            v-model:value="activeTab"
            type="line"
            size="small"
            justify-content="space-evenly"
            animated
          >
            <n-tab-pane name="scores" display-directive="show:lazy">
              <template #tab>
                <div class="mobile-tab">
                  <n-icon size="16">
                    <ScoresIcon />
                  </n-icon>
                  <span>Score</span>
                </div>
              </template>

              <div class="mobile-tab-content">
                <div
                  v-if="selectedPhoto?.descriptions?.artistic_scores"
                  class="mobile-scores"
                >
                  <!-- Overall Rating Compact -->
                  <div class="mobile-overall-rating">
                    <div class="mobile-rating-main">
                      <span class="mobile-rating-value">
                        {{ overallRating.average }}/{{ scoreScale.max }}
                      </span>
                      <span
                        class="mobile-rating-label"
                        :class="
                          'rating-' +
                          overallRating.rating
                            .toLowerCase()
                            .replace(' ', '-')
                            .replace('/', '')
                        "
                      >
                        {{ overallRating.rating }}
                      </span>
                    </div>
                  </div>

                  <!-- Genre Pills (Horizontal scroll) -->
                  <div class="mobile-genre-scroll">
                    <div
                      v-for="preset in availableGenrePresets"
                      :key="preset.key"
                      class="mobile-genre-pill"
                      :class="{ active: selectedGenre === preset.key }"
                      @click="emit('apply-genre-preset', preset.key)"
                    >
                      <n-icon size="14"><component :is="preset.icon" /></n-icon>
                      {{ preset.label }}
                    </div>
                  </div>

                  <!-- Scores List (Compact) -->
                  <div class="mobile-scores-list">
                    <div
                      v-for="scoreData in orderedArtisticScores"
                      :key="scoreData.criterion"
                      class="mobile-score-row"
                      :class="{ 'bonus-item': scoreData.group === 'bonus' }"
                      :style="{
                        '--weight-scale':
                          artisticScoreWeights[scoreData.criterion] ?? 0,
                        '--weight-opacity':
                          artisticScoreWeights[scoreData.criterion] ?? 0,
                      }"
                    >
                      <span class="mobile-score-label">{{
                        scoreData.label
                      }}</span>
                      <div class="mobile-score-bar-wrap">
                        <div class="mobile-score-bar">
                          <div
                            class="mobile-score-fill"
                            :style="{
                              width: (scoreData.score / 9) * 100 + '%',
                              background: getScoreBgColor(scoreData.score),
                            }"
                          ></div>
                        </div>
                        <span class="mobile-score-value">{{
                          scoreData.score
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="mobile-empty-state">
                  <n-icon size="32" color="var(--text-tertiary)">
                    <ScoresIcon />
                  </n-icon>
                  <p>No scores available</p>
                </div>
              </div>
            </n-tab-pane>

            <n-tab-pane name="tags" display-directive="show:lazy"
              >>
              <template #tab>
                <div class="mobile-tab">
                  <n-icon size="16">
                    <TagIcon />
                  </n-icon>
                  <span>Tags</span>
                </div>
              </template>

              <div class="mobile-tab-content">
                <div
                  v-if="Object.keys(groupedTags).length > 0"
                  class="mobile-tags-groups"
                >
                  <div
                    v-for="(tags, groupName) in groupedTags"
                    :key="groupName"
                    class="mobile-tag-group"
                  >
                    <h6 class="mobile-group-title">{{ groupName }}</h6>
                    <div class="mobile-tags-row">
                      <n-tag
                        v-for="tag in tags"
                        :key="tag.id || tag.name"
                        size="small"
                        type="info"
                        :bordered="false"
                      >
                        {{ tag.name || tag }}
                      </n-tag>
                    </div>
                  </div>
                </div>
                <div v-else class="mobile-empty-state">
                  <n-icon size="32" color="var(--text-tertiary)">
                    <TagIcon />
                  </n-icon>
                  <p>No tags available</p>
                </div>
              </div>
            </n-tab-pane>

            <n-tab-pane name="technical" display-directive="show:lazy">
              <template #tab>
                <div class="mobile-tab">
                  <n-icon size="16">
                    <InfoIcon />
                  </n-icon>
                  <span>Info</span>
                </div>
              </template>

              <div class="mobile-tab-content">
                <div class="mobile-info-grid">
                  <!-- File Info -->
                  <div class="mobile-info-section">
                    <h6 class="mobile-section-title">File</h6>
                    <div class="mobile-tags-row">
                      <n-tag size="small" type="info">
                        {{
                          selectedPhoto?.descriptions?.visual_aspects?.format?.[0]?.toUpperCase() ||
                          "—"
                        }}
                      </n-tag>
                      <n-tag size="small" type="info">
                        {{
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.dimensions?.[0] || "—"
                        }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Date -->
                  <div class="mobile-info-section">
                    <h6 class="mobile-section-title">Date</h6>
                    <div class="mobile-tags-row">
                      <n-tag size="small" type="info">
                        {{
                          selectedPhoto?.descriptions?.EXIF?.dateTaken
                            ? formatDate(
                                selectedPhoto.descriptions.EXIF.dateTaken,
                              )
                            : selectedPhoto?.createdAt
                              ? formatDate(selectedPhoto.createdAt)
                              : "—"
                        }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Camera -->
                  <div class="mobile-info-section">
                    <h6 class="mobile-section-title">Camera</h6>
                    <div class="mobile-tags-row">
                      <n-tag
                        size="small"
                        :type="
                          selectedPhoto?.descriptions?.EXIF?.camera
                            ? 'info'
                            : 'default'
                        "
                      >
                        {{ selectedPhoto?.descriptions?.EXIF?.camera || "—" }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.iso"
                        size="small"
                        type="info"
                      >
                        ISO {{ selectedPhoto.descriptions.EXIF.iso }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.aperture"
                        size="small"
                        type="info"
                      >
                        f/{{ selectedPhoto.descriptions.EXIF.aperture }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.focalLength"
                        size="small"
                        type="info"
                      >
                        {{ selectedPhoto.descriptions.EXIF.focalLength }}mm
                      </n-tag>
                    </div>
                  </div>

                  <!-- Genre/Type -->
                  <div class="mobile-info-section">
                    <h6 class="mobile-section-title">Type</h6>
                    <div class="mobile-tags-row">
                      <template
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.genre
                        "
                      >
                        <n-tag
                          v-for="genre in selectedPhoto.descriptions
                            .visual_aspects.genre"
                          :key="genre"
                          size="small"
                          type="info"
                        >
                          {{ formatCategoryName(genre) }}
                        </n-tag>
                      </template>
                      <n-tag v-else size="small" type="default">—</n-tag>
                    </div>
                  </div>

                  <!-- Composition -->
                  <div class="mobile-info-section">
                    <h6 class="mobile-section-title">Composition</h6>
                    <div class="mobile-tags-row">
                      <template
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.framing
                        "
                      >
                        <n-tag
                          v-for="frame in selectedPhoto.descriptions
                            .visual_aspects.framing"
                          :key="frame"
                          size="small"
                          type="info"
                        >
                          {{ formatCategoryName(frame) }}
                        </n-tag>
                      </template>
                      <template
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.perspective
                        "
                      >
                        <n-tag
                          v-for="perspective in selectedPhoto.descriptions
                            .visual_aspects.perspective"
                          :key="perspective"
                          size="small"
                          type="info"
                        >
                          {{ formatCategoryName(perspective) }}
                        </n-tag>
                      </template>
                    </div>
                  </div>

                  <!-- Lighting -->
                  <div class="mobile-info-section">
                    <h6 class="mobile-section-title">Lighting</h6>
                    <div class="mobile-tags-row">
                      <template
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.lighting
                        "
                      >
                        <n-tag
                          v-for="light in selectedPhoto.descriptions
                            .visual_aspects.lighting"
                          :key="light"
                          size="small"
                          type="info"
                        >
                          {{ formatCategoryName(light) }}
                        </n-tag>
                      </template>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.flash"
                        size="small"
                        type="info"
                      >
                        {{
                          formatFlashValue(
                            selectedPhoto.descriptions.EXIF.flash,
                          )
                        }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Style -->
                  <div class="mobile-info-section">
                    <h6 class="mobile-section-title">Style</h6>
                    <div class="mobile-tags-row">
                      <template
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.palette
                        "
                      >
                        <n-tag
                          v-for="color in selectedPhoto.descriptions
                            .visual_aspects.palette"
                          :key="color"
                          size="small"
                          type="info"
                        >
                          {{ formatCategoryName(color) }}
                        </n-tag>
                      </template>
                      <template
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.stylistic
                        "
                      >
                        <n-tag
                          v-for="style in selectedPhoto.descriptions
                            .visual_aspects.stylistic"
                          :key="style"
                          size="small"
                          type="info"
                        >
                          {{ formatCategoryName(style) }}
                        </n-tag>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </n-tab-pane>

            <n-tab-pane name="notes" display-directive="show:lazy">
              <template #tab>
                <div class="mobile-tab">
                  <n-icon size="16">
                    <EditIcon />
                  </n-icon>
                  <span>Notes</span>
                </div>
              </template>

              <div class="mobile-tab-content">
                <div class="mobile-notes">
                  <p class="mobile-notes-hint">
                    Add personal notes to help with searches.
                  </p>
                  <n-input
                    :value="photoNotes"
                    @update:value="emit('update:photo-notes', $event)"
                    type="textarea"
                    placeholder="Your notes about this photo..."
                    :autosize="{ minRows: 4, maxRows: 8 }"
                    @input="emit('update-word-count')"
                  />
                  <div class="mobile-notes-footer">
                    <span
                      class="mobile-word-count"
                      :class="{ exceeded: wordCount > 50 }"
                    >
                      {{ wordCount }}/50 words
                    </span>
                    <n-button
                      size="small"
                      type="primary"
                      @click="emit('save-notes')"
                      :loading="isSavingNotes"
                      :disabled="wordCount > 50"
                    >
                      {{
                        selectedPhoto?.descriptions?.notes ? "Update" : "Save"
                      }}
                    </n-button>
                  </div>
                </div>
              </div>
            </n-tab-pane>

            <!-- Library Tab -->
            <n-tab-pane name="library" display-directive="show:lazy">
              <template #tab>
                <div class="mobile-tab">
                  <n-icon size="16">
                    <LibraryIcon />
                  </n-icon>
                  <span>Library</span>
                </div>
              </template>

              <div class="mobile-tab-content">
                <div
                  v-if="photoLibrary.collections.length > 0"
                  class="mobile-tags-groups"
                >
                  <!-- Collections -->
                  <div
                    v-if="photoLibrary.collections.length > 0"
                    class="mobile-tag-group"
                  >
                    <h6 class="mobile-group-title">Collections</h6>
                    <div class="mobile-tags-row">
                      <n-tag
                        v-for="collection in photoLibrary.collections"
                        :key="'col-' + collection.id"
                        size="small"
                        type="info"
                        :bordered="false"
                        class="library-tag"
                        @click="navigateTo('collection-detail', collection.id)"
                      >
                        {{ collection.name }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Series (hidden on mobile) -->
                  <!--
                  <div
                    v-if="photoLibrary.series.length > 0"
                    class="mobile-tag-group"
                  >
                    <h6 class="mobile-group-title">Series</h6>
                    <div class="mobile-tags-row">
                      <n-tag
                        v-for="s in photoLibrary.series"
                        :key="'ser-' + s.id"
                        size="small"
                        type="info"
                        :bordered="false"
                        class="library-tag"
                        @click="navigateTo('series-detail', s.id)"
                      >
                        {{ s.name }}
                      </n-tag>
                    </div>
                  </div>
                  -->
                </div>
                <div v-else class="mobile-empty-state">
                  <n-icon size="32" color="var(--text-tertiary)">
                    <LibraryIcon />
                  </n-icon>
                  <p>Not in any collection or series yet</p>
                </div>
              </div>
            </n-tab-pane>

            <!-- Similar Photos Tab -->
            <n-tab-pane name="similar" display-directive="show:lazy">
              <template #tab>
                <div class="mobile-tab">
                  <n-icon size="16">
                    <SimilarIcon />
                  </n-icon>
                  <span>Similar</span>
                </div>
              </template>
              <div class="mobile-tab-content">
                <SimilarPhotosSection
                  :selected-photo="selectedPhoto"
                  @navigate-to-photo="
                    (photo) => emit('navigate-to-photo', photo)
                  "
                />
              </div>
            </n-tab-pane>

            <!-- Insights tab (hidden) -->
            <!--
            <n-tab-pane name="insights" display-directive="show:lazy">
              <template #tab>
                <div class="mobile-tab">
                  <n-icon size="16">
                    <SparklesIcon />
                  </n-icon>
                  <span>AI</span>
                </div>
              </template>

              <div class="mobile-tab-content">
                <div class="mobile-insights">
                  <div v-if="allPhotoInsights.length > 0" class="mobile-insights-list">
                    <div v-for="(insight, index) in allPhotoInsights" :key="index" class="mobile-insight-item">
                      <h6 class="mobile-insight-label">{{ insight.label }}</h6>
                      <div class="mobile-insight-text" v-html="insight.text"></div>
                    </div>
                  </div>
                  <div v-if="isGeneratingInsight" class="mobile-insight-loading">
                    <SpiralGridLoader variant="primary" :size="24" />
                    <span>{{ pendingInsightLabel || "Analyzing..." }}</span>
                  </div>
                  <div v-if="allPhotoInsights.length === 0 && !isGeneratingInsight" class="mobile-empty-state">
                    <n-icon size="32" color="var(--primary-color)"><SparklesIcon /></n-icon>
                    <p>Tap a button to get AI insights</p>
                  </div>
                  <div class="mobile-insights-controls">
                    <div class="mobile-insight-buttons">
                      <n-button size="small" type="primary" :disabled="isGeneratingInsight || !insightTypesAvailable.cultural || !canUseInsights" @click="emit('get-insight', 'cultural')">
                        <template #icon><n-icon size="14"><GlobeOutline /></n-icon></template>
                        Cultural
                      </n-button>
                      <n-button size="small" type="primary" :disabled="isGeneratingInsight || !insightTypesAvailable.technical || !canUseInsights" @click="emit('get-insight', 'technical')">
                        <template #icon><n-icon size="14"><SettingsOutline /></n-icon></template>
                        Technical
                      </n-button>
                      <n-button size="small" type="primary" :disabled="isGeneratingInsight || !insightTypesAvailable.artistic || !canUseInsights" @click="emit('get-insight', 'artistic')">
                        <template #icon><n-icon size="14"><BrushOutline /></n-icon></template>
                        Artistic
                      </n-button>
                    </div>
                    <div class="mobile-custom-question">
                      <n-input :value="customInsightQuestion" @update:value="emit('update:custom-insight-question', $event)" placeholder="Ask a question..." size="small" :disabled="isGeneratingInsight || customQuestionsRemaining <= 0 || !canUseInsights" @keydown.enter="emit('submit-custom-question')">
                        <template #suffix>
                          <n-button text size="tiny" :disabled="!customInsightQuestion.trim() || isGeneratingInsight || customQuestionsRemaining <= 0 || !canUseInsights" @click="emit('submit-custom-question')">
                            <n-icon size="16"><SendOutline /></n-icon>
                          </n-button>
                        </template>
                      </n-input>
                    </div>
                  </div>
                </div>
              </div>
            </n-tab-pane>
            -->
          </n-tabs>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NDrawer,
  NDrawerContent,
  NIcon,
  NButton,
  NTag,
  NTabs,
  NTabPane,
  NInput,
} from "naive-ui";
import SpiralGridLoader from "../../SpiralGridLoader.vue";

// Icons
import {
  CameraOutline,
  CopyOutline as CopyIcon,
  CloseOutline as CloseIcon,
  DownloadOutline as DownloadIcon,
  InformationCircleOutline as InfoIcon,
  PricetagOutline as TagIcon,
  SparklesOutline as SparklesIcon,
  CreateOutline as EditIcon,
  WalkOutline,
  GlobeOutline,
  SettingsOutline,
  BrushOutline,
  SendOutline,
  LogoInstagram,
  LibraryOutline as LibraryIcon,
  GitCompareOutline as SimilarIcon,
} from "@vicons/ionicons5";
import { FullscreenOutlined, PaletteOutlined } from "@vicons/material";
import {
  Trophy20Regular as ScoresIcon,
  BookOpen16Regular,
} from "@vicons/fluent";
import FloatingActionBar from "../../FloatingActionBar.vue";
import SimilarPhotosSection from "../SimilarPhotosSection.vue";

defineOptions({ name: "PhotoInfoMobileLayout" });

const router = useRouter();

const props = defineProps({
  visible: { type: Boolean, default: false },
  selectedPhoto: { type: Object, default: null },
  groupedTags: { type: Object, default: () => ({}) },
  photoNotes: { type: String, default: "" },
  wordCount: { type: Number, default: 0 },
  isSavingNotes: { type: Boolean, default: false },
  overallRating: {
    type: Object,
    default: () => ({ average: 0, rating: "N/A" }),
  },
  scoreScale: { type: Object, default: () => ({ max: 9 }) },
  selectedGenre: { type: String, default: "general" },
  showCustomWeights: { type: Boolean, default: false },
  artisticScoreWeights: { type: Object, default: () => ({}) },
  orderedArtisticScores: { type: Array, default: () => [] },
  allPhotoInsights: { type: Array, default: () => [] },
  isGeneratingInsight: { type: Boolean, default: false },
  pendingInsightLabel: { type: String, default: "" },
  customInsightQuestion: { type: String, default: "" },
  customQuestionsRemaining: { type: Number, default: 3 },
  insightTypesAvailable: {
    type: Object,
    default: () => ({ cultural: true, technical: true, artistic: true }),
  },
  canUseInsights: { type: Boolean, default: true },
  photoLibrary: {
    type: Object,
    default: () => ({ collections: [], series: [] }),
  },
  photoCredit: { type: Object, default: null },
  showDelete: { type: Boolean, default: true },
  showAddToCollection: { type: Boolean, default: true },
  showMoveToTool: { type: Boolean, default: true },
  showSendToChat: { type: Boolean, default: false },
  formatDate: { type: Function, default: (d) => d },
  formatExposureTime: { type: Function, default: (e) => e },
  formatCategoryName: { type: Function, default: (c) => c },
  formatCriterionName: { type: Function, default: (c) => c },
  formatGenreTooltip: { type: Function, default: () => "" },
  getScoreBgColor: { type: Function, default: () => "#ccc" },
  availableGenrePresets: {
    type: Array,
    default: () => [
      { key: "general", label: "General", icon: null },
      { key: "street", label: "Street", icon: null },
      { key: "documentary", label: "Documentary", icon: null },
      { key: "abstract", label: "Artistic", icon: null },
    ],
  },
});

const emit = defineEmits([
  "update:visible",
  "copy-name",
  "image-error",
  "download",
  "open-fullscreen",
  "update:photo-notes",
  "update-word-count",
  "save-notes",
  "apply-genre-preset",
  "update:artistic-score-weights",
  "get-insight",
  "update:custom-insight-question",
  "submit-custom-question",
  "delete-photo",
  "add-to-collection",
  "move-to-tool",
  "send-to-chat",
  "navigate-to-photo",
]);

const activeTab = ref("scores");

watch(
  () => props.selectedPhoto,
  () => {
    activeTab.value = "scores";
  },
);

const visibleModel = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const navigateTo = (routeName, id) => {
  emit("update:visible", false);
  router.push({ name: routeName, params: { id } });
};

const formatFlashValue = (flash) => {
  if (!flash) return "";

  if (typeof flash === "string") {
    return flash;
  }

  if (typeof flash === "object") {
    const fired = Boolean(flash.Fired);
    return fired ? "Flash fired" : "Flash did not fire";
  }

  return String(flash);
};
</script>

<style scoped>
.photo-info-mobile-drawer :deep(.n-drawer) {
  width: 100% !important;
  max-width: 100% !important;
  left: 0 !important;
  right: 0 !important;
}

.photo-info-mobile-drawer :deep(.n-drawer-header) {
  padding: var(--spacing-sm) var(--spacing-md) !important;
  border-bottom: 1px solid var(--border-color);
}

.mobile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: var(--spacing-sm);
  overflow: hidden;
}

.mobile-fab-wrapper {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
}

.mobile-close-btn {
  flex-shrink: 0 !important;
}

.mobile-header-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 1;
  min-width: 0;
}

.mobile-photo-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-x: hidden;
  width: 100%;
}

/* Photo Container */
.mobile-photo-container {
  position: relative;
  width: 100%;
  height: 240px;
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mobile-photo {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  cursor: pointer;
}

.mobile-photo-actions {
  position: absolute;
  bottom: var(--spacing-sm);
  right: var(--spacing-sm);
  display: flex;
  gap: var(--spacing-xs);
}

.mobile-action-btn {
  background: rgba(0, 0, 0, 0.6) !important;
  color: white !important;
  backdrop-filter: blur(4px);
}

.mobile-action-btn:hover {
  background: rgba(0, 0, 0, 0.8) !important;
}

/* Photo credit badge mobile */
.photo-credit-badge.mobile {
  position: absolute;
  bottom: var(--spacing-sm);
  left: var(--spacing-sm);
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border-radius: 16px;
  color: white;
  text-decoration: none;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.85;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 10;
}

.photo-credit-badge.mobile:hover,
.photo-credit-badge.mobile:active {
  opacity: 1;
  background: rgba(225, 48, 108, 0.8);
  border-color: rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
}

.photo-credit-badge.mobile span {
  line-height: 1;
}

/* Tabs Container */
.mobile-tabs-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mobile-tabs-container :deep(.n-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mobile-tabs-container :deep(.n-tabs-nav) {
  padding: 0 var(--spacing-sm);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.mobile-tabs-container :deep(.n-tabs-nav-scroll-content) {
  justify-content: space-around;
}

.mobile-tabs-container :deep(.n-tabs-tab) {
  padding: var(--spacing-sm) var(--spacing-xs) !important;
  font-size: 12px;
}

.mobile-tabs-container :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  overflow: hidden;
}

.mobile-tabs-container :deep(.n-tab-pane) {
  height: 100%;
  overflow-y: auto;
  padding: 0 !important;
}

.mobile-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
}

.mobile-tab-content {
  padding: var(--spacing-md);
  height: 93%;
  display: flex;
  flex-direction: column;
}

.mobile-tab-content .mobile-insights {
  height: 100%;
}

.mobile-tab-content .mobile-scores {
  height: auto;
}

.mobile-tab-content .mobile-notes {
  height: auto;
}

.mobile-tab-content .mobile-info-grid {
  height: auto;
}

.mobile-tab-content .mobile-tags-groups {
  height: auto;
}

/* Info Grid */
.mobile-info-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.mobile-info-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.mobile-section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mobile-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.mobile-tags-row :deep(.n-tag) {
  font-size: 11px;
  height: 22px;
}

/* Tags Groups */
.mobile-tags-groups {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.mobile-tag-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.mobile-group-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: capitalize;
}

/* Scores */
.mobile-scores {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.mobile-overall-rating {
  display: flex;
  justify-content: center;
  padding: var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
}

.mobile-rating-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.mobile-rating-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.mobile-rating-label {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  text-transform: uppercase;
}

/* Rating colors */
.rating-disastrous {
  background: #7f1d1d;
  color: white;
}
.rating-very-poor {
  background: #b91c1c;
  color: white;
}
.rating-poor {
  background: #ef4444;
  color: white;
}
.rating-needs-improvement {
  background: #f87171;
  color: white;
}
.rating-acceptable {
  background: #f59e0b;
  color: white;
}
.rating-good {
  background: #10b981;
  color: white;
}
.rating-very-good {
  background: #22d3ee;
  color: white;
}
.rating-remarkable {
  background: #3b82f6;
  color: white;
}
.rating-excellent {
  background: #6366f1;
  color: white;
}
.rating-outstanding {
  background: #7c3aed;
  color: white;
}

.mobile-genre-scroll {
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  padding: var(--spacing-xs) var(--spacing-sm);
  -webkit-overflow-scrolling: touch;
  justify-content: flex-start;
  scroll-padding-left: var(--spacing-sm);
}

.mobile-genre-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-genre-pill.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.mobile-scores-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.mobile-score-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px;
  position: relative;
}

.mobile-score-row::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: calc(var(--weight-scale, 0) * (110px + var(--spacing-sm)));
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--primary-color) 0%,
    rgba(59, 130, 246, 0.4) 80%,
    rgba(59, 130, 246, 0.1) 100%
  );
  border-radius: var(--radius-sm);
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.25;
  z-index: 0;
}

.mobile-score-row.bonus-item::before {
  background: linear-gradient(
    90deg,
    #f59e0b 0%,
    rgba(245, 158, 11, 0.4) 80%,
    rgba(245, 158, 11, 0.1) 100%
  );
}

.mobile-score-row:hover::before {
  opacity: 0.4;
}

.mobile-score-label {
  font-size: 12px;
  color: var(--text-primary);
  min-width: 100px;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.mobile-score-bar-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  position: relative;
  z-index: 1;
}

.mobile-score-bar {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
}

.mobile-score-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.mobile-score-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  min-width: 20px;
  text-align: right;
  font-family: var(--font-mono);
}

/* Notes */
.mobile-notes {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.mobile-notes-hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.mobile-notes-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mobile-word-count {
  font-size: 11px;
  color: var(--text-tertiary);
}

.mobile-word-count.exceeded {
  color: var(--error-color);
  font-weight: 600;
}

/* Insights */
.mobile-insights {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  height: 100%;
}

.mobile-insights-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.mobile-insights-list::-webkit-scrollbar {
  width: 6px;
}

.mobile-insights-list::-webkit-scrollbar-track {
  background: transparent;
}

.mobile-insights-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.mobile-insights-list::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.mobile-insight-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.mobile-insight-label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.mobile-insight-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  padding: var(--spacing-sm);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--primary-color);
}

.mobile-insight-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-secondary);
  flex: 1;
  min-height: 100px;
}

.mobile-insights-controls {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  flex-shrink: 0;
  margin-top: auto;
}

.mobile-insight-buttons {
  display: flex;
  gap: var(--spacing-xs);
}

.mobile-insight-buttons :deep(.n-button) {
  flex: 1;
  font-size: 11px;
}

.mobile-custom-question {
  width: 100%;
}

/* Empty State */
.mobile-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl);
  text-align: center;
  flex: 1;
  min-height: 100px;
}

.mobile-empty-state p {
  margin: 0;
  font-size: 13px;
  color: var(--text-tertiary);
}
</style>

<style>
/* Mobile drawer styles - must be outside scoped to affect drawer elements */
.photo-info-mobile-drawer,
.photo-info-mobile-drawer .n-drawer,
.photo-info-mobile-drawer .n-drawer-content,
.photo-info-mobile-drawer .n-drawer-body,
.photo-info-mobile-drawer .n-drawer-body-content-wrapper,
.photo-info-mobile-drawer .n-scrollbar,
.photo-info-mobile-drawer .n-scrollbar-container {
  overflow-x: hidden !important;
  max-width: 100vw !important;
}

.photo-info-mobile-drawer .n-drawer-content .n-drawer-body-content-wrapper {
  box-sizing: border-box;
  padding: 8px !important;
  height: 100%;
}

.photo-info-mobile-drawer .n-drawer-header {
  display: block !important;
}

/* Library tab styles */
.library-tag {
  cursor: pointer;
  transition: all 0.2s ease;
}

.library-tag:active {
  transform: scale(0.95);
  opacity: 0.8;
}
</style>
