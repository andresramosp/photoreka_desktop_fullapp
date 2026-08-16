<template>
  <div class="photos-grid-controls">
    <!-- Ranking por scores: barra siempre visible, hermana de la quick search
         bar. Se oculta al scrollear igual que aquella; para dejarla fija basta
         con poner HIDE_SCORES_ON_SCROLL a false. -->
    <div
      v-if="showScoresToolbar"
      class="scores-toolbar-wrapper scroll-header entering"
      :class="{ 'header-hidden': HIDE_SCORES_ON_SCROLL && scrollCollapsed }"
    >
      <ScoresToolbar
        :sorting-type="sortingType"
        :selected-criteria="selectedCriteria"
        :selected-genre="selectedGenre"
        :sort-order="sortOrder"
        :has-active-sorting="hasActiveSorting"
        :has-selection="hasSortingSelection"
        :artistic-scores="artisticScores"
        :criterion-icons="criterionIcons"
        :format-criterion-name="formatCriterionName"
        :format-genre-tooltip="formatGenreTooltip"
        :genres="genres"
        @update:type="handleSortingTypeSelect"
        @toggle-criterion="toggleCriterion"
        @select-genre="handleGenreSelect"
        @toggle-order="toggleSortOrder"
        @clear="clearSorting"
      />
    </div>
    <!-- Sorting Section: el ranking en su presentación de panel plegable (móvil
         y colecciones). Se oculta al scrollear igual que la barra a la que
         sustituye, y con el mismo matiz que los filtros: solo si está cerrado,
         porque abierto sirve para reordenar viendo la grilla de más abajo. -->
    <div
      v-if="!showScoresToolbar"
      class="sorting-section"
      :class="{
        'scroll-header entering': !isSortingExpanded,
        'header-hidden':
          HIDE_SCORES_ON_SCROLL && scrollCollapsed && !isSortingExpanded,
      }"
    >
      <div
        class="filter-controls-section-header sorting-header"
        @click="toggleSorting"
      >
        <div class="filter-controls-header-left">
          <n-icon
            size="16"
            class="filter-controls-section-icon"
            :color="`var(--warning-color)`"
          >
            <Trophy20Regular />
          </n-icon>
          <span class="filter-controls-section-label">Rank by scores</span>
          <n-button
            v-if="hasActiveSorting"
            text
            size="small"
            @click="toggleSortOrder"
            class="sort-order-btn"
            :title="
              sortOrder === 'desc'
                ? 'Best First (click for Worst First)'
                : 'Worst First (click for Best First)'
            "
          >
            <n-icon size="16">
              <svg viewBox="0 0 24 24" style="width: 16px; height: 16px">
                <path
                  v-if="sortOrder === 'desc'"
                  d="M19,17H22L18,21L14,17H17V3H19V17M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
                <path
                  v-else
                  d="M19,7H22L18,3L14,7H17V21H19V7M2,17V19H12V17H2M6,5V7H12V5H6M2,11V13H9V11H2Z"
                  fill="currentColor"
                />
              </svg>
            </n-icon>
          </n-button>
          <!-- Como en la barra: visible mientras haya algo marcado, ordene o
               no, para que nunca falte la vía de escape. -->
          <n-button
            v-if="hasSortingSelection"
            quaternary
            size="small"
            @click="clearSorting"
            class="clear-action-btn"
          >
            Clear
          </n-button>
          <n-tag
            v-if="hasActiveSorting && !isSortingExpanded"
            size="tiny"
            type="warning"
            :bordered="false"
            round
          >
            Active
          </n-tag>
        </div>
        <n-icon
          size="14"
          class="filter-controls-toggle-icon"
          :class="{ rotated: isSortingExpanded }"
        >
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
            />
          </svg>
        </n-icon>
      </div>
      <!-- <Transition name="slide-down"> -->
      <div
        v-if="isSortingExpanded"
        class="sorting-wrapper filter-controls-tab-container"
      >
        <n-tabs
          v-model:value="sortingType"
          type="line"
          size="small"
          class="sorting-tabs"
          :theme-overrides="{ tabGapSmallLine: '15px' }"
          @update:value="handleSortingTypeChange"
          @click.stop
        >
          <!-- Tab: Criteria -->
          <n-tab-pane name="criteria" display-directive="show">
            <template #tab>
              <n-icon
                size="13"
                style="margin-right: 4px; vertical-align: middle"
                ><Star20Regular
              /></n-icon>
              <span class="tab-label">Criteria</span>
            </template>
            <div class="filter-controls-criteria-row">
              <template
                v-for="[groupKey, group] in Object.entries(artisticScores)"
                :key="groupKey"
              >
                <n-button
                  v-for="criterion in group.criteria"
                  :key="criterion.value"
                  secondary
                  :type="
                    selectedCriteria.includes(criterion.value)
                      ? groupKey === 'fundamentals'
                        ? 'primary'
                        : 'warning'
                      : 'default'
                  "
                  size="small"
                  @click="toggleCriterion(criterion.value)"
                  class="filter-controls-criterion-button"
                >
                  <template #icon>
                    <n-icon>
                      <component :is="criterionIcons[criterion.value]" />
                    </n-icon>
                  </template>
                  {{ formatCriterionName(criterion.value) }}
                </n-button>
              </template>
            </div>
          </n-tab-pane>

          <!-- Tab: Genre -->
          <n-tab-pane name="genre" display-directive="show">
            <template #tab>
              <n-icon
                size="13"
                style="margin-right: 4px; vertical-align: middle"
                ><Tag20Regular
              /></n-icon>
              <span class="tab-label">Genre</span>
            </template>
            <div class="genre-row">
              <n-tooltip
                v-for="genre in genres"
                :key="genre.value"
                trigger="hover"
                placement="bottom"
                :show-arrow="true"
                delay="1200"
              >
                <template #trigger>
                  <n-button
                    :type="
                      selectedGenre === genre.value ? 'primary' : 'default'
                    "
                    size="small"
                    secondary
                    @click="handleGenreSelect(genre.value)"
                    class="genre-button"
                    :class="{ 'custom-button': genre.value === 'custom' }"
                  >
                    <template #icon>
                      <n-icon>
                        <component :is="genre.icon" />
                      </n-icon>
                    </template>
                    {{ genre.label }}
                  </n-button>
                </template>
                <div
                  v-if="genre.value !== 'custom'"
                  v-html="formatGenreTooltip(genre.value)"
                ></div>
                <div v-else>Customize your own scoring weights</div>
              </n-tooltip>
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
      <!-- </Transition> -->
    </div>

    <!-- Visual Filters Compact Row -->
    <!-- Se oculta al scrollear como las demás barras, pero solo si el panel
         está cerrado: abierto sigue siendo útil para filtrar más abajo en la
         grilla, así que se queda fijo entero (header + contenido). Las clases
         de scroll solo se aplican con el panel cerrado para que su max-height
         base nunca recorte el contenido expandido. Para dejarlo siempre fijo,
         HIDE_FILTERS_ON_SCROLL a false. -->
    <div
      class="filters-section"
      :class="{
        'scroll-header entering': !isFiltersExpanded,
        'header-hidden':
          HIDE_FILTERS_ON_SCROLL && scrollCollapsed && !isFiltersExpanded,
      }"
    >
      <div class="filter-controls-section-header" @click="toggleFilters">
        <div class="filter-controls-header-left">
          <n-icon
            size="16"
            class="filter-controls-section-icon"
            :color="`var(--primary-color)`"
          >
            <Camera20Regular />
          </n-icon>
          <span class="filter-controls-section-label">Search filters</span>
          <n-tag
            v-if="
              (hasActiveFilters || hasActiveScoreFilters) && !isFiltersExpanded
            "
            size="tiny"
            type="primary"
            :bordered="false"
            round
          >
            {{ totalActiveFilters }}
          </n-tag>
        </div>
        <n-icon
          size="14"
          class="filter-controls-toggle-icon"
          :class="{ rotated: isFiltersExpanded }"
        >
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6l-6-6l1.41-1.41z"
            />
          </svg>
        </n-icon>
      </div>
      <!-- Filters Collapsible Content -->
      <!-- <Transition name="slide-down"> -->
      <div
        v-show="isFiltersExpanded"
        class="filter-controls-tab-container filters-expanded-content"
      >
        <n-tabs
          v-model:value="activeFiltersTab"
          type="line"
          size="small"
          class="filters-tabs"
          :theme-overrides="{ tabGapSmallLine: '15px' }"
          @click.stop
        >
          <!-- Tab 1: Basic Filters -->
          <n-tab-pane name="basic" display-directive="show">
            <template #tab>
              <n-icon
                size="13"
                style="margin-right: 4px; vertical-align: middle"
                ><Filter20Regular
              /></n-icon>
              <span class="tab-label">Basic filters</span>
            </template>
            <VisualFiltersPanel
              :visual-aspects="selectedFilters"
              :score-filters="artisticScoreFilters"
              :show-section-labels="false"
              @update:visual-aspects="handleVisualAspectsPanelChange"
              @update:score-filters="handleScoreFiltersPanelChange"
            />
          </n-tab-pane>

          <!-- Tab 2: Advanced Filters -->
          <n-tab-pane name="advanced" display-directive="show">
            <template #tab>
              <n-icon
                size="13"
                style="margin-right: 4px; vertical-align: middle"
                ><Settings20Regular
              /></n-icon>
              <span class="tab-label">Advanced filters</span>
              <span
                v-if="hasActiveMoreFilters || hasActiveMetadataFilters"
                class="tab-active-dot"
              />
            </template>
            <div class="advanced-filters-content">
              <!-- Date Range Filter -->
              <div class="date-range-wrapper">
                <TimeRangeFilter
                  ref="timeRangeFilterRef"
                  :photos="photos"
                  @time-range-change="handleTimeRangeChange"
                  :histogram-height="'30px'"
                  :show-title="true"
                  :marksCount="5"
                />
              </div>
              <!-- Tags Filter Row -->
              <!-- <div class="tags-filter-row">
                <div class="filter-wrapper">
                  <div class="filter-header-row">
                    <div style="display: flex; align-items: center; gap: 6px">
                      <label class="filter-label">Include tags</label>
                      <n-tooltip trigger="hover" placement="top">
                        <template #trigger>
                          <n-icon
                            size="14"
                            style="
                              color: var(--text-secondary);
                              cursor: help;
                              opacity: 0.7;
                            "
                          >
                            <Info16Regular />
                          </n-icon>
                        </template>
                        Exact tag matching only. Use Search tool for semantic
                        queries.
                      </n-tooltip>
                    </div>
                    <div class="tags-mode-switch-wrapper">
                      <span
                        class="tag-mode-label"
                        :class="{ active: !isOrMode }"
                      >
                        All
                      </span>
                      <n-switch
                        v-model:value="isOrMode"
                        size="small"
                        class="tags-mode-switch"
                      />
                      <span
                        class="tag-mode-label"
                        :class="{ active: isOrMode }"
                      >
                        Any
                      </span>
                    </div>
                  </div>
                  <n-select
                    v-model:value="includedTags"
                    v-model:show="includedTagsDropdownShow"
                    multiple
                    filterable
                    clearable
                    remote
                    placeholder="Include tags..."
                    :options="includedTagSuggestionsFormatted"
                    :filter="() => true"
                    :clear-filter-after-select="true"
                    :max-tag-count="3"
                    :ignore-composition="false"
                    size="small"
                    @search="handleIncludedTagSearch"
                    @update:value="handleIncludedTagsUpdate"
                    class="compact-select"
                  >
                    <template #empty>
                      <div style="padding: 8px; color: #888; font-size: 11px">
                        Start typing to search tags...
                      </div>
                    </template>
                  </n-select>
                </div>

                <div class="filter-wrapper">
                  <label class="filter-label">Exclude tags</label>
                  <n-select
                    v-model:value="excludedTags"
                    v-model:show="excludedTagsDropdownShow"
                    multiple
                    filterable
                    clearable
                    remote
                    placeholder="Exclude tags..."
                    :options="excludedTagSuggestionsFormatted"
                    :filter="() => true"
                    :clear-filter-after-select="true"
                    :max-tag-count="3"
                    :ignore-composition="false"
                    size="small"
                    @search="handleExcludedTagSearch"
                    @update:value="handleExcludedTagsUpdate"
                    class="compact-select"
                  >
                    <template #empty>
                      <div style="padding: 8px; color: #888; font-size: 11px">
                        Start typing to search tags...
                      </div>
                    </template>
                  </n-select>
                </div>
              </div> -->

              <!-- Filename Search + Metadata Filters Row -->
              <MetadataFiltersPanel
                :photos="photos"
                v-model="metadataFilters"
                :filename-search="filenameSearch"
                @update:filename-search="handleFilenameSearchChange"
              />
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
      <!-- </Transition> -->
    </div>

    <!-- Custom Weights Modal -->
    <n-modal
      class="custom-weights-modal"
      v-model:show="showCustomWeightsModal"
      preset="card"
      title="Custom Preset Configuration"
      :style="{ maxWidth: '90vw', width: '600px' }"
    >
      <CustomArtisticWeights
        v-model="customWeights"
        v-model:selected-preset-id="customWeightsPresetId"
        :format-criterion-name="formatCriterionName"
      />
      <template #footer>
        <div class="custom-weights-footer">
          <div class="footer-left">
            <n-button class="reset-button" @click="resetCustomWeights"
              >Reset</n-button
            >
          </div>
          <div class="footer-right">
            <n-button
              class="cancel-button"
              @click="showCustomWeightsModal = false"
              >Cancel</n-button
            >
            <n-button
              class="apply-button"
              type="primary"
              @click="saveCustomWeights"
              >Apply</n-button
            >
          </div>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, ref, reactive, watch, h, onMounted } from "vue";
import { useSearchStore } from "@/stores/searchStore.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { useUserStore } from "@/stores/userStore";
import { getGenrePresetKeys, getProfileVariant } from "@/config/photo_schema";
import { useSearchTags } from "@/composables/useSearchTags.js";
import { isScoreCriterion } from "@/utils/photosGridQuery.js";
import CustomArtisticWeights from "./CustomArtisticWeights.vue";
import TimeRangeFilter from "./TimeRangeFilter.vue";
import VisualFiltersPanel from "@/components/photos-grid/VisualFiltersPanel.vue";
import MetadataFiltersPanel from "@/components/photos-grid/MetadataFiltersPanel.vue";
import ScoresToolbar from "@/components/photos-grid/ScoresToolbar.vue";
import {
  createEmptyMetadataFilters,
  countActiveMetadataFilters,
} from "@/utils/metadataFilters.js";
import { api } from "@/utils/axios";
import {
  NButton,
  NSelect,
  NIcon,
  NModal,
  NTag,
  NTooltip,
  NSwitch,
  NTabs,
  NTabPane,
  useMessage,
} from "naive-ui";
import {
  BookOpen16Regular,
  Camera20Regular,
  Filter20Regular,
  Info16Regular,
  Settings20Regular,
  Star20Regular,
  Tag20Regular,
  Trophy20Regular,
} from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";
import { Walk, WalkOutline, BriefcaseOutline } from "@vicons/ionicons5";

const emit = defineEmits([
  "filters-change",
  "sorting-change",
  "sort-order-change",
  "criteria-change",
  "genre-change",
  "sorting-type-change",
  "custom-weights-change",
  "filename-search-change",
  "time-range-change",
  "metadata-filters-change",
  "tag-search",
  "artistic-scores-change",
]);

// Genre definitions for rendering. The set of available genre presets
// derives from the user's profile via `getGenrePresetKeys` from the central
// schema (commercial users → ['commercial']; style/general users → the
// classic four artistic presets). 'custom' is always appended.
const GENRE_PRESET_META = {
  general: { label: "General", icon: Camera20Regular },
  street: { label: "Street", icon: WalkOutline },
  documentary: { label: "Documentary", icon: BookOpen16Regular },
  abstract: { label: "Artistic", icon: PaletteOutlined },
  commercial: { label: "Commercial", icon: BriefcaseOutline },
};

const props = defineProps({
  basicSortActive: {
    type: Boolean,
    default: false,
  },
  photos: {
    type: Array,
    default: () => [],
  },
  scrollCollapsed: {
    type: Boolean,
    default: false,
  },
  // Deep-link seed (parsed from route.query by the parent view). When present,
  // the controls hydrate their state so filters/sorting are reflected here — not
  // just applied to the grid. See utils/photosGridQuery.js.
  initialState: {
    type: Object,
    default: null,
  },
  // Filtro de género gobernado desde fuera (barra de quick search del
  // Workspace). `null` = nadie lo controla y el panel es dueño único. Cuando
  // llega un array, la relación es bidireccional: el select de aspectos refleja
  // los chips y los cambios del select vuelven al padre vía `filters-change`.
  genreFilter: {
    type: Array,
    default: null,
  },
  // Presentación del ranking por scores: `true` lo saca como barra siempre
  // visible (hermana de la quick search bar del Workspace); `false` mantiene el
  // panel plegable clásico con sus tabs, que es lo que usan las colecciones.
  scoresToolbar: {
    type: Boolean,
    default: false,
  },
});

// Mobile detection
const { isMobile } = useIsMobile();

// En móvil la barra siempre pierde: sus ocho pills solo caben apiladas en dos
// columnas, y encima ocupan alto fijo que la grilla necesita. Ahí se vuelve al
// panel plegable, el mismo que ven las colecciones.
const showScoresToolbar = computed(
  () => props.scoresToolbar && !isMobile.value,
);

// User store for profile-based defaults
const userStore = useUserStore();
const searchStore = useSearchStore();

const genres = computed(() => {
  const variant = getProfileVariant(userStore.user?.profiles);
  const built = getGenrePresetKeys(variant).map((key) => ({
    value: key,
    label: GENRE_PRESET_META[key]?.label ?? key,
    icon: GENRE_PRESET_META[key]?.icon ?? Camera20Regular,
  }));
  built.push({ value: "custom", label: "Custom", icon: Settings20Regular });
  return built;
});

// Message instance
const message = useMessage();

// Use search tags composable
const {
  includedTagSuggestions,
  excludedTagSuggestions,
  onSearchInputIncluded,
  onSearchInputExcluded,
} = useSearchTags();

// Tags filter state (local to this component)
const includedTags = ref([]);
const excludedTags = ref([]);
const includedTagsDropdownShow = ref(false);
const excludedTagsDropdownShow = ref(false);
const isSearchingTags = ref(false);
const isOrMode = ref(true); // true = OR (Any), false = AND (All)

const tagsMode = computed(() => (isOrMode.value ? "OR" : "AND"));

// Filename Search
const filenameSearch = ref("");

// Time range active state
const isTimeRangeActive = ref(false);

// Metadata filters (file type + EXIF) — options are derived dynamically from
// the photos present, inside MetadataFiltersPanel.
const metadataFilters = ref(createEmptyMetadataFilters());

// Visual Aspects Filters
const selectedFilters = ref({});
const isFiltersExpanded = ref(false); // Will be set based on mobile on mount

// Filters tab (basic / advanced)
const activeFiltersTab = ref("basic");

// Quality Sorting
const sortingType = ref("criteria"); // 'criteria' or 'genre'
const selectedCriteria = ref([]); // Start empty (no sorting initially)
const selectedGenre = ref(null);
const sortOrder = ref("desc"); // 'asc', 'desc'
const isSortingExpanded = ref(false); // solo aplica al panel plegable clásico

// El ranking es un control, no una cabecera decorativa; se oculta al scrollear
// como la quick search bar, en sus dos presentaciones: la barra (escritorio) y
// el panel plegable (móvil y colecciones). Poner a false para dejarlo fijo.
const HIDE_SCORES_ON_SCROLL = true;

// El header de "Search filters" se oculta al scrollear igual que el resto,
// pero solo cuando está cerrado (ver :class en el template). Poner a false
// para dejarlo siempre fijo.
const HIDE_FILTERS_ON_SCROLL = true;

// Get dynamic criteria from useArtisticScores
const {
  artisticScores,
  genrePresets,
  formatCriterionName,
  formatGenreTooltip,
  criterionIcons,
} = useArtisticScores({ profile: () => userStore.user?.profiles });

// Create grouped criteria options for n-select
const availableCriteria = Object.entries(artisticScores).map(
  ([groupKey, group]) => ({
    type: "group",
    label: group.label,
    key: groupKey,
    children: group.criteria.map((criterion) => ({
      value: criterion.value,
      label: formatCriterionName(criterion.value),
      group: groupKey, // Add group information for styling
    })),
  }),
);

// Helper function to get group for a criterion
const getCriterionGroup = (criterionValue) => {
  for (const [groupKey, group] of Object.entries(artisticScores)) {
    if (group.criteria.some((c) => c.value === criterionValue)) {
      return groupKey;
    }
  }
  return null;
};

// Artistic Score Filters
const artisticScoreFilters = ref({});

const hasActiveScoreFilters = computed(
  () => Object.keys(artisticScoreFilters.value).length > 0,
);

const handleArtisticScoreChange = (key, filterVal) => {
  if (!filterVal) {
    const updated = { ...artisticScoreFilters.value };
    delete updated[key];
    artisticScoreFilters.value = updated;
  } else {
    artisticScoreFilters.value = {
      ...artisticScoreFilters.value,
      [key]: filterVal,
    };
  }
  emit("artistic-scores-change", { ...artisticScoreFilters.value });
};

const clearArtisticScores = () => {
  artisticScoreFilters.value = {};
  emit("artistic-scores-change", {});
};

// Custom weights modal
const showCustomWeightsModal = ref(false);
const customWeights = ref({});
const customWeightsPresetId = ref(null);

// Initialize custom weights with default values (1.0 for all criteria)
const initializeCustomWeights = () => {
  const weights = {};
  Object.values(artisticScores).forEach((group) => {
    group.criteria.forEach((criterion) => {
      weights[criterion.value] = 0.5;
    });
  });
  return weights;
};

customWeights.value = initializeCustomWeights();

// Function to render criterion tags with group-specific colors
const renderCriterionTag = ({ option, handleClose }) => {
  const group = getCriterionGroup(option.value);
  const tagColor = group.color; // Blue for fundamentals, amber for bonus

  return h(
    NTag,
    {
      style: {
        backgroundColor: tagColor + "20", // Add transparency
        borderColor: tagColor,
        color: tagColor,
      },
      closable: true,
      onClose: (e) => {
        e.stopPropagation();
        handleClose();
      },
    },
    {
      default: () => option.label,
    },
  );
};

// Genre options for the select (no longer needed but keeping for compatibility)
const genreOptions = [
  { value: "general", label: "General" },
  { value: "street", label: "Street" },
  { value: "documentary", label: "Documentary" },
  { value: "abstract", label: "Abstract" },
];

// Initialize selectedFilters with empty arrays for each category
searchStore.visualAspectsOptionsForProfile.forEach((group) => {
  selectedFilters.value[group.key] = [];
});

// Computed for checking if there are active filters
const hasActiveMetadataFilters = computed(
  () => countActiveMetadataFilters(metadataFilters.value) > 0,
);

const hasActiveMoreFilters = computed(
  () =>
    includedTags.value.length > 0 ||
    excludedTags.value.length > 0 ||
    filenameSearch.value.length > 0 ||
    isTimeRangeActive.value,
);

const hasActiveFilters = computed(() => {
  return (
    Object.values(selectedFilters.value).some(
      (filters) => filters.length > 0,
    ) ||
    hasActiveMetadataFilters.value ||
    hasActiveMoreFilters.value
  );
});

// Computed for total count of active filters
const totalActiveFilters = computed(() => {
  const aspectsCount = Object.values(selectedFilters.value).reduce(
    (total, filters) => total + filters.length,
    0,
  );
  const scoreFiltersCount = Object.keys(artisticScoreFilters.value).length;
  const metadataCount = countActiveMetadataFilters(metadataFilters.value);
  const tagsCount = includedTags.value.length + excludedTags.value.length;
  const filenameCount = filenameSearch.value.length > 0 ? 1 : 0;
  const timeRangeCount = isTimeRangeActive.value ? 1 : 0;
  return (
    aspectsCount +
    scoreFiltersCount +
    metadataCount +
    tagsCount +
    filenameCount +
    timeRangeCount
  );
});

// Hay algo que limpiar aunque el ranking no esté ordenando nada. Es distinto de
// `hasActiveSorting` a propósito: colgar el botón Clear de aquel dejaba el único
// escape deshabilitado en cuanto el modo caía en "none", que es justo cuando
// hacía falta. Clear debe poder rescatar cualquier estado, no solo los sanos.
const hasSortingSelection = computed(
  () => selectedCriteria.value.length > 0 || selectedGenre.value !== null,
);

// Computed for checking if sorting is active
const hasActiveSorting = computed(() => {
  if (sortingType.value === "none") {
    return false; // No sorting when "none" is selected
  } else if (sortingType.value === "criteria") {
    return selectedCriteria.value.length > 0;
  } else if (sortingType.value === "genre") {
    return selectedGenre.value !== null; // Genre sorting requires a selection
  }
  return false;
});

const timeRangeFilterRef = ref(null);

// Functions
const clearAllFilters = () => {
  Object.keys(selectedFilters.value).forEach((key) => {
    selectedFilters.value[key] = [];
  });
  isTimeRangeActive.value = false;
  timeRangeFilterRef.value?.clearFilter();
};

const toggleCriterion = (criterionValue) => {
  // Tocar una pill es pedir ranking por scores, así que hay que sacar al modo
  // de "none", donde lo deja el sort básico de la grilla (date/name). Sin esto
  // la pill se marcaba pero no ordenaba —`sortByQuality` corta en seco con
  // "none"— y no había vuelta atrás: `hasActiveSorting` también es false ahí, y
  // con él se deshabilita el único Clear que restauraría el modo.
  if (sortingType.value === "none") {
    sortingType.value = "criteria";
  }

  const index = selectedCriteria.value.indexOf(criterionValue);
  if (index === -1) {
    // Add criterion
    selectedCriteria.value.push(criterionValue);
  } else {
    // Remove criterion
    selectedCriteria.value.splice(index, 1);
  }
  handleCriteriaChange();
};

// Cambio de modo desde el select de la barra. No se toca la selección: cada
// modo conserva la suya y volver al otro la recupera tal cual. El watcher de
// `sortingType` ya se encarga de avisar a la grilla.
const handleSortingTypeSelect = (value) => {
  sortingType.value = value;
};

// Cambio de modo desde las tabs del panel plegable.
const handleSortingTypeChange = () => {
  if (sortingType.value === "none") {
    selectedCriteria.value = []; // Clear criteria when none is selected
  }
  emit("sorting-type-change", sortingType.value);
};

const handleGenreChange = () => {
  emit("genre-change", selectedGenre.value);
};

const handleGenreSelect = (genre) => {
  // Mismo caso que en toggleCriterion: elegir género es pedir ranking, y con el
  // modo en "none" se quedaría marcado sin ordenar y sin Clear con el que
  // deshacerlo. Solo al seleccionar; deseleccionar no reactiva nada.
  if (sortingType.value === "none" && selectedGenre.value !== genre) {
    sortingType.value = "genre";
  }

  if (genre === "custom") {
    // Open custom weights modal
    showCustomWeightsModal.value = true;
  } else if (selectedGenre.value === genre) {
    // Deselect if already selected
    selectedGenre.value = null;
    handleGenreChange();
  } else {
    selectedGenre.value = genre;
    handleGenreChange();
  }
};

const resetCustomWeights = () => {
  customWeights.value = initializeCustomWeights();
  customWeightsPresetId.value = null;
};

const saveCustomWeights = () => {
  sortingType.value = "genre";
  selectedGenre.value = "custom";
  showCustomWeightsModal.value = false;

  // Emit custom weights to parent
  emit("custom-weights-change", customWeights.value);
  handleGenreChange();
};

// Clear vacía las DOS selecciones, no solo la del modo visible: antes el género
// sobrevivía a un Clear hecho desde criterios y volvía a ordenar solo con
// cambiar de modo, que es justo lo que el botón promete haber deshecho. El modo
// se conserva —no hay razón para echar al usuario de género— salvo que fuera
// "none", que no es un modo sino la marca de que manda el sort básico.
const clearSorting = () => {
  if (sortingType.value !== "genre") {
    sortingType.value = "criteria";
  }
  selectedCriteria.value = [];
  selectedGenre.value = null;
};

const toggleSortOrder = () => {
  sortOrder.value = sortOrder.value === "desc" ? "asc" : "desc";
};

// Acordeón exclusivo: abrir una sección cierra la otra (solo hay dos cuando el
// ranking va en panel; con la barra, `isSortingExpanded` queda inerte).
const toggleFilters = () => {
  if (!isFiltersExpanded.value) {
    isSortingExpanded.value = false;
  }
  isFiltersExpanded.value = !isFiltersExpanded.value;
};

const toggleSorting = () => {
  if (!isSortingExpanded.value) {
    isFiltersExpanded.value = false;
  }
  isSortingExpanded.value = !isSortingExpanded.value;
};

const handleFilterChange = () => {
  emit("filters-change", selectedFilters.value);
};

const handleVisualAspectsPanelChange = (newFilters) => {
  selectedFilters.value = newFilters;
  handleFilterChange();
};

// ── Filtro de género controlado desde fuera ──────────────────
// Comparación por contenido, no por referencia: el padre reemite el mismo
// conjunto en cuanto el select lo cambia, y sin esta guarda el watcher lo
// reescribiría en bucle.
const sameGenreSelection = (a, b) => {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return (
    left.length === right.length && left.every((value, i) => value === right[i])
  );
};

watch(
  () => props.genreFilter,
  (value) => {
    if (!Array.isArray(value)) return;
    if (sameGenreSelection(value, selectedFilters.value.genre)) return;
    selectedFilters.value = { ...selectedFilters.value, genre: [...value] };
    handleFilterChange();
  },
  { immediate: true, deep: true },
);

const handleScoreFiltersPanelChange = (newScoreFilters) => {
  artisticScoreFilters.value = newScoreFilters;
  emit("artistic-scores-change", { ...newScoreFilters });
};

const handleCriteriaChange = () => {
  emit("criteria-change", selectedCriteria.value);
};

const handleFilenameSearchChange = (value) => {
  filenameSearch.value = value;
  emit("filename-search-change", value);
};

const handleTimeRangeChange = (range) => {
  isTimeRangeActive.value = !!(
    range &&
    (range[0] !== null || range[1] !== null)
  );
  emit("time-range-change", range);
};

// Tag filtering functions - use composable handlers
const handleIncludedTagSearch = (query) => {
  onSearchInputIncluded(query);
};

const handleExcludedTagSearch = (query) => {
  onSearchInputExcluded(query);
};

const handleIncludedTagsUpdate = async (value) => {
  includedTags.value = value;
  includedTagsDropdownShow.value = false; // Cerrar dropdown al seleccionar
  await executeTagSearch();
};

const handleExcludedTagsUpdate = async (value) => {
  excludedTags.value = value;
  excludedTagsDropdownShow.value = false; // Cerrar dropdown al seleccionar
  await executeTagSearch();
};

const executeTagSearch = async () => {
  // If no tags selected, clear the filter
  if (includedTags.value.length === 0 && excludedTags.value.length === 0) {
    emit("tag-search", null);
    return;
  }

  try {
    isSearchingTags.value = true;
    const { data: response } = await api.post("/api/search/tags/direct", {
      included: includedTags.value,
      excluded: excludedTags.value,
      mode: tagsMode.value,
      semantic: false,
    });

    // Emit the search results to parent
    emit("tag-search", response);

    console.log(`✅ Tag search completed: ${response.length} photos matched`);
  } catch (error) {
    console.error("Error searching by tags:", error);
    message.error("Failed to search by tags");
  } finally {
    setTimeout(() => {
      isSearchingTags.value = false;
    }, 500);
  }
};

const includedTagSuggestionsFormatted = computed(() => {
  // Filter out already selected tags to avoid duplicates in n-select dropdown
  const selectedSet = new Set(includedTags.value);
  return includedTagSuggestions.value.filter(
    (tag) => !selectedSet.has(tag.value),
  );
});

const excludedTagSuggestionsFormatted = computed(() => {
  // Filter out already selected tags to avoid duplicates in n-select dropdown
  const selectedSet = new Set(excludedTags.value);
  return excludedTagSuggestions.value.filter(
    (tag) => !selectedSet.has(tag.value),
  );
});

// Watch for tags mode changes and re-trigger search if tags are selected
watch(
  () => isOrMode.value,
  () => {
    if (includedTags.value.length > 0 || excludedTags.value.length > 0) {
      executeTagSearch();
    }
  },
);

// Watchers to emit changes
watch(
  sortingType,
  (newValue) => {
    emit("sorting-type-change", newValue);
  },
  { immediate: true },
);

watch(
  sortOrder,
  (newValue) => {
    emit("sort-order-change", newValue);
  },
  { immediate: true },
);

watch(
  selectedGenre,
  (newGenre) => {
    emit("genre-change", newGenre);
  },
  { immediate: true },
);

// Combined watcher for overall sorting state
watch(
  [sortingType, selectedCriteria, selectedGenre],
  () => {
    emit("sorting-change", hasActiveSorting.value);
  },
  { immediate: true },
); // Emitir inmediatamente al montar

// Emitir estado inicial de filtros y criterios
watch(
  selectedFilters,
  (newFilters) => {
    emit("filters-change", newFilters);
  },
  { immediate: true, deep: true },
);

watch(
  selectedCriteria,
  (newCriteria) => {
    emit("criteria-change", newCriteria);
  },
  { immediate: true },
);

// Emit metadata (file type + EXIF) filter changes
watch(
  metadataFilters,
  (newFilters) => {
    emit("metadata-filters-change", newFilters);
  },
  { deep: true },
);

// En escritorio un panel abierto se queda abierto y visible al scrollear (ver
// HIDE_SCORES_ON_SCROLL / HIDE_FILTERS_ON_SCROLL): hay sitio de sobra y sirve
// para seguir ajustando orden o filtros mirando la grilla de más abajo. En
// móvil esa excepción no se sostiene —abierto ocupa casi toda la pantalla— así
// que ahí se cierra al scrollear y se oculta con el resto. No se restaura al
// volver a subir: reaparecería tapando la grilla justo cuando el gesto de subir
// es para verla, y ahora basta un delta corto para revelar las barras.
watch(
  () => props.scrollCollapsed,
  (collapsed) => {
    if (!collapsed || !isMobile.value) return;
    isFiltersExpanded.value = false;
    isSortingExpanded.value = false;
  },
);

// Watch for basic sort activation to deactivate scores sorting
watch(
  () => props.basicSortActive,
  (isBasicSortActive) => {
    if (isBasicSortActive) {
      // When basic sort is activated, deactivate scores sorting
      sortingType.value = "none";
      selectedCriteria.value = [];
    }
  },
);

// ── Deep-link hydration ──────────────────────────────────────
// Seed the controls from a parsed query descriptor so filters/sorting are
// reflected in the UI (not only applied to the grid). Basic date/name sort is
// owned by PhotosGrid, so it is intentionally ignored here.
onMounted(() => {
  const init = props.initialState;
  if (!init) return;

  if (init.sort && isScoreCriterion(init.sort.field)) {
    sortingType.value = "criteria";
    selectedCriteria.value = [init.sort.field];
    sortOrder.value = init.sort.dir === "asc" ? "asc" : "desc";
    isSortingExpanded.value = true;
  } else if (init.genrePreset) {
    sortingType.value = "genre";
    selectedGenre.value = init.genrePreset;
    isSortingExpanded.value = true;
  }

  if (Array.isArray(init.scoreFilters) && init.scoreFilters.length > 0) {
    const map = {};
    for (const f of init.scoreFilters) {
      map[f.field] = { value: f.value, operator: f.op === "lte" ? "<=" : ">=" };
    }
    artisticScoreFilters.value = map;
    emit("artistic-scores-change", { ...map });
    isFiltersExpanded.value = true;
  }

  // Visual aspects ({ [aspectKey]: string[] }) — unlike the score filters above,
  // the grid owns this state, so the seed must be emitted for it to take effect.
  if (init.visualAspects && Object.keys(init.visualAspects).length > 0) {
    const seeded = { ...selectedFilters.value };
    for (const [key, values] of Object.entries(init.visualAspects)) {
      if (!Array.isArray(values) || values.length === 0) continue;
      if (!(key in seeded)) continue; // aspect not offered for this user's profile
      seeded[key] = [...values];
    }
    selectedFilters.value = seeded;
    handleFilterChange();
    isFiltersExpanded.value = true;
  }
});
</script>

<style scoped>
.photos-grid-controls {
  display: flex;
  flex-direction: column;
}

/* Filters Section. El margen inferior es la separación con la fila de
   controles de la grilla: vive aquí, no como padding de aquella, para que
   desaparezca con el panel cuando se oculta al scrollear. */
.filters-section {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
}

/* Baseline height for the scroll-hide transition (see HIDE_FILTERS_ON_SCROLL).
   Only present while the panel is closed (.scroll-header is added
   conditionally in the template), so it never clips the expanded content —
   when open the section grows freely instead. */
.filters-section.scroll-header {
  max-height: 60px;
}

/* Barra de ranking por scores: hermana visual de la quick search bar. El
   colapso al scrollear anima max-height, que necesita un valor de partida
   explícito; holgado porque en tablet/móvil las pills envuelven. El
   margin-bottom (en vez de un `gap` en el padre) es lo que permite que el
   `margin-bottom: 0 !important` de .header-hidden se coma el hueco entero
   cuando se oculta, en vez de dejar un espacio fantasma. */
.scores-toolbar-wrapper {
  max-height: 160px;
  margin-bottom: 8px;
}

/* Panel plegable clásico del ranking (scoresToolbar = false) */
.sorting-section {
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}

/* Altura de partida del colapso, como en .filters-section: solo está mientras
   el panel esté cerrado, así que nunca recorta el contenido desplegado. */
.sorting-section.scroll-header {
  max-height: 60px;
}

.sorting-wrapper {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0 12px 8px 12px;
}

.sorting-tabs {
  width: 100%;
}

.sorting-tabs :deep(.n-tabs-nav) {
  padding: 0 2px;
  margin-bottom: 10px;
}

.sorting-tabs :deep(.n-tab-pane) {
  padding: 0;
}

.sort-order-btn {
  color: var(--text-secondary);
  transition: all 0.2s ease;
  opacity: 0.7;
  padding: 4px;
}

.sort-order-btn:hover {
  opacity: 1;
  color: var(--warning-color);
  transform: scale(1.05);
}

/* Sorting header button event handling */
.sorting-header .sort-order-btn,
.sorting-header .clear-action-btn {
  pointer-events: auto;
}

/* Criteria and Genre Rows */
.genre-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  padding-top: 4px;
}

/* Tablet and below: wrap */
@media (max-width: 1023px) {
  .genre-row {
    flex-wrap: wrap;
  }
}

.genre-button {
  flex: 1 1 auto;
  min-width: 100px;
  transition: all 0.2s ease;
  font-size: 13px;
}

.genre-button:hover {
  transform: translateY(-1px);
}

.genre-button.custom-button {
  border: 1px dashed var(--border-color);
}

/* Slide-down transition */
.slide-down-enter-active {
  transition:
    opacity 0.18s ease-out,
    max-height 0.18s ease-out,
    transform 0.18s ease-out;
  overflow: hidden;
  will-change: opacity, transform;
}

.slide-down-leave-active {
  transition: none;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-4px);
}

.slide-down-enter-to,
.slide-down-leave-from {
  opacity: 1;
  max-height: 480px;
  transform: translateY(0);
}

/* Filters tabs */
.filters-tabs {
  width: 100%;
}

.filters-tabs :deep(.n-tabs-nav) {
  padding: 0 2px;
  margin-bottom: 10px;
}

.filters-tabs :deep(.n-tab-pane) {
  padding: 0;
}

.advanced-filters-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-label {
  font-size: 11px;
}

/* Dot indicator on Advanced tab when filters are active */
.tab-active-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--primary-color);
  margin-left: 5px;
  vertical-align: middle;
  flex-shrink: 0;
}

.tags-filter-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
}

.metadata-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.date-range-wrapper,
.filter-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.compact-select {
  width: 100%;
}

.filter-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.filter-header-row {
  display: flex;
  align-items: center;
  /* justify-content: space-between; */
  margin-bottom: 8px;
  gap: 8px;
}

.tags-mode-switch-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

.tag-mode-label {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  opacity: 0.6;
  transition: opacity 0.2s;
  cursor: default;
}

.tag-mode-label.active {
  opacity: 1;
}

.tags-mode-switch :deep(.n-switch) {
  --n-height: 16px;
  --n-width: 28px;
}

.tags-mode-switch :deep(.n-switch__rail) {
  background: rgba(255, 255, 255, 0.1);
}

.tags-mode-switch :deep(.n-switch.n-switch--checked .n-switch__rail) {
  background: var(--primary-color);
}

.filename-input {
  width: 100%;
  max-width: 400px;
}

/* Mobile styles */
@media (max-width: 767px) {
  .filter-controls-section-label {
    font-size: 12px;
  }

  .filter-controls-toggle-icon {
    display: block;
  }

  .sorting-header .filter-controls-header-left {
    flex-wrap: wrap;
    width: 100%;
  }

  .inline-radios {
    width: 100%;
    margin-left: 0;
  }

  .genre-button {
    flex: 1 1 calc(50% - 4px);
    min-width: 0;
  }

  .filename-input {
    max-width: 100%;
    width: 100%;
  }

  .tags-filter-row,
  .metadata-row {
    flex-direction: column;
    gap: 12px;
  }

  .filter-wrapper {
    width: 100%;
  }
}

/* Desktop: hide toggle icon */
@media (min-width: 1024px) {
  .section-header:hover {
    background-color: transparent;
  }
}

/* Custom tooltip styling */
:deep(.n-tooltip__content) {
  background-color: var(--bg-body) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
  max-width: 280px !important;
  padding: 12px !important;
}

/* Artistic Scores Filter */
.filters-expanded-content {
  display: flex;
  flex-direction: column;
  padding: 0px 12px 8px;
}

.score-slider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.score-slider-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.score-slider-value {
  font-size: 11px;
  font-weight: 500;
  color: var(--warning-color);
}

.score-slider :deep(.n-slider) {
  --n-fill-color: var(--primary-color);
  --n-fill-color-hover: var(--primary-color-hover, var(--primary-color));
}

/* Custom modal footer responsiveness */
.custom-weights-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 12px;
  flex-wrap: nowrap;
}
.custom-weights-footer .footer-left {
  flex: 1 1 auto;
}
.custom-weights-footer .footer-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* On small screens stack buttons vertically and make them full width */
@media (max-width: 600px) {
  .custom-weights-modal {
    max-width: 92vw !important;
    width: 100% !important;
    padding: 0 8px;
  }
  .custom-weights-footer {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  .custom-weights-footer .footer-left,
  .custom-weights-footer .footer-right {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .custom-weights-footer .footer-left {
    flex: 0 0 auto;
  }
  .custom-weights-footer .footer-right {
    flex: 1 0 auto;
    justify-content: flex-end;
  }
  .custom-weights-footer n-button {
    padding: 6px 12px;
    font-size: 14px;
    line-height: 1;
    min-width: 84px;
    border-radius: 6px;
  }
  .custom-weights-footer n-button.reset-button,
  .custom-weights-footer n-button.cancel-button {
    min-width: 84px;
    padding: 6px 12px;
  }
  .custom-weights-footer n-button.apply-button {
    min-width: 96px;
    padding: 8px 16px;
  }
  /* If space becomes tight, keep content on one line */
  .custom-weights-footer n-button .n-button__content {
    white-space: nowrap;
  }
}
</style>
