<template>
  <div class="report-section">
    <div class="report-section-header">
      <h2 class="section-title">
        <n-icon class="section-icon">
          <BookIcon />
        </n-icon>
        Photographic Patterns Analysis
      </h2>
      <p class="section-description">
        Narrative themes and cultural patterns detected across your photography
        collection
      </p>
    </div>

    <!-- Placeholder when no patterns are available -->
    <div v-if="patternSections.length === 0" class="patterns-placeholder">
      <div class="placeholder-content">
        <n-icon :size="64" color="#6b7280" class="placeholder-icon">
          <BookIcon />
        </n-icon>

        <h3 class="placeholder-title">Your Patterns Will Appear Soon</h3>
        <p class="placeholder-description">
          As you add more photos to your catalog, we'll automatically detect
          meaningful patterns and themes in your photography.
        </p>

        <div class="pattern-types-list">
          <div class="pattern-type-item">
            <n-icon :size="20">
              <BookmarkIcon />
            </n-icon>
            <div class="pattern-type-text">
              <strong>Narrative Patterns</strong>
              <span
                >Storytelling themes and narrative clusters across your
                work</span
              >
            </div>
          </div>

          <div class="pattern-type-item">
            <n-icon :size="20">
              <GlobeIcon />
            </n-icon>
            <div class="pattern-type-text">
              <strong>Cultural Patterns</strong>
              <span
                >Cultural themes and regional patterns in your photography</span
              >
            </div>
          </div>

          <div class="pattern-type-item">
            <n-icon :size="20">
              <PaletteIcon />
            </n-icon>
            <div class="pattern-type-text">
              <strong>Stylistic Patterns</strong>
              <span
                >Visual style and technical characteristics of your images</span
              >
            </div>
          </div>
        </div>

        <div class="placeholder-note">
          <n-icon :size="18">
            <InformationCircleIcon />
          </n-icon>
          <span
            >Patterns update automatically with significant changes to your
            catalog</span
          >
        </div>
      </div>
    </div>

    <!-- Dynamic Pattern Sections -->
    <div
      v-for="(section, index) in patternSections"
      :key="section.key"
      :class="index > 0 ? 'criteria-group' : ''"
    >
      <div class="group-header">
        <div class="group-title-wrapper">
          <h3 class="group-title" :style="{ color: section.color }">
            {{ section.title }}
            <span class="patterns-count">{{ section.patterns.length }}</span>
          </h3>
          <span class="group-subtitle">{{ section.subtitle }}</span>
        </div>
      </div>

      <div class="carousel-container">
        <button
          class="carousel-nav carousel-nav-left"
          @click="scrollCarousel(section.key, 'left')"
          :disabled="!canScrollLeft(section.key)"
          v-show="section.patterns.length > 1"
        >
          <n-icon :size="24">
            <ChevronBackIcon />
          </n-icon>
        </button>

        <div
          class="pattern-grid"
          :ref="(el) => setCarouselRef(section.key, el)"
          @mousedown="startDrag($event, section.key)"
        >
          <div
            v-for="pattern in section.patterns"
            :key="pattern.id"
            class="pattern-card"
            :class="{ 'cultural-card': section.key === 'context' }"
          >
            <div class="pattern-header">
              <div class="pattern-title-wrapper">
                <h3 class="pattern-title">{{ pattern.title }}</h3>
              </div>
            </div>
            <p class="pattern-description">{{ pattern.description }}</p>

            <div class="example-photos" v-if="pattern.examples?.length">
              <h4 class="examples-title">Example Photos</h4>
              <div class="photos-grid">
                <PhotoCardHub
                  v-for="photo in pattern.examples"
                  :key="photo.id"
                  :photo="{
                    id: photo.id,
                    url: photo.url,
                    thumbnailUrl: photo.url,
                    name: 'Example Photo',
                    status: 'processed',
                    isCheckingDuplicates: false,
                  }"
                  :selected="false"
                  :show-footer="false"
                  :show-delete="false"
                  :show-name="false"
                  :is-uploading="false"
                  :show-duplicate="false"
                  @info="showPhotoInfo"
                  @select="() => {}"
                />
              </div>
            </div>

            <div class="pattern-meta">
              <span class="pattern-strength" :class="pattern.strength">
                {{ pattern.strength }} pattern
              </span>
            </div>
          </div>
        </div>

        <button
          class="carousel-nav carousel-nav-right"
          @click="scrollCarousel(section.key, 'right')"
          :disabled="!canScrollRight(section.key)"
          v-show="section.patterns.length > 1"
        >
          <n-icon :size="24">
            <ChevronForwardIcon />
          </n-icon>
        </button>
      </div>
    </div>

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from "vue";
import theme from "@/config/theme.js";
import { useUserStore } from "@/stores/userStore";
import { usePhotosStore } from "@/stores/photos.js";
import PhotoCardHub from "@/components/photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";

const { colors } = theme;
import {
  BookOutline as BookIcon,
  GlobeOutline as GlobeIcon,
  ChevronBack as ChevronBackIcon,
  ChevronForward as ChevronForwardIcon,
  BookmarkOutline as BookmarkIcon,
  ColorPaletteOutline as PaletteIcon,
  InformationCircleOutline as InformationCircleIcon,
} from "@vicons/ionicons5";

defineOptions({
  name: "PatternsAnalysisReport",
});

const userStore = useUserStore();
const photosStore = usePhotosStore();

const patternSections = ref([]);
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref(null);

// Carousel refs and state
const carouselRefs = ref({});
const carouselPositions = ref({});
const isDragging = ref(false);
const dragStart = ref({ x: 0, scrollLeft: 0, key: null });

// Configuration for section titles and colors
const sectionConfig = {
  story: {
    title: "Narrative Patterns",
    subtitle:
      "Storytelling themes and narrative clusters identified in your collection",
    color: colors.blue[600],
  },
  context: {
    title: "Cultural Patterns",
    subtitle:
      "Cultural themes and regional patterns detected across your photography collection",
    color: colors.purple[600],
  },
  general: {
    title: "Stylistic Patterns",
    subtitle:
      "General photographic patterns and technical characteristics across your collection",
    color: colors.green[600],
  },
};

const catalogPatterns = computed(() => {
  const profile = userStore.user;
  console.log("Computing catalogPatterns, profile:", profile);

  // Try both camelCase and snake_case
  const patterns =
    profile?.catalogPatterns || profile?.catalog_patterns || null;
  console.log("Patterns found:", patterns);

  return patterns;
});

const loadPatternsData = () => {
  const patterns = catalogPatterns.value;

  if (!patterns) {
    console.warn("No catalog patterns found in user profile");
    patternSections.value = [];
    return;
  }

  console.log("Loading patterns data:", patterns);

  // Dynamically process all pattern categories
  const sections = [];

  Object.keys(patterns).forEach((key) => {
    const categoryPatterns = patterns[key];

    if (Array.isArray(categoryPatterns) && categoryPatterns.length > 0) {
      // Get configuration for this section, or use defaults
      const config = sectionConfig[key] || {
        title: key.charAt(0).toUpperCase() + key.slice(1) + " Patterns",
        subtitle: `${key.charAt(0).toUpperCase() + key.slice(1)} patterns detected in your collection`,
        color: colors.blue[600],
      };

      sections.push({
        key,
        title: config.title,
        subtitle: config.subtitle,
        color: config.color,
        patterns: categoryPatterns.map((pattern) => ({
          id: pattern.patternId,
          title: pattern.title,
          percentage: Math.round(pattern.percentage * 100) / 100,
          description: pattern.description,
          photoCount: pattern.photoCount,
          strength: pattern.strength,
          examples: (pattern.samplePhotos || []).map((photo) => ({
            id: photo.id,
            url: photo.thumbnailUrl,
          })),
        })),
      });

      console.log(`Loaded ${key} patterns:`, categoryPatterns.length);
    }
  });

  patternSections.value = sections;
  console.log("Total sections loaded:", sections.length);
};

// Pie chart function for mini pie
const generateMiniPieSlice = (percentage) => {
  const radius = 20;
  const angle = (percentage / 100) * 2 * Math.PI;

  // Start from top (12 o'clock position)
  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + angle;

  const x1 = Math.cos(startAngle) * radius;
  const y1 = Math.sin(startAngle) * radius;
  const x2 = Math.cos(endAngle) * radius;
  const y2 = Math.sin(endAngle) * radius;

  const largeArcFlag = angle > Math.PI ? 1 : 0;

  // Handle full circle case
  if (percentage >= 99.9) {
    return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 1 1 ${-x1} ${-y1} A ${radius} ${radius} 0 1 1 ${x1} ${y1} Z`;
  }

  return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
};

// Watch for changes in catalogPatterns
watch(
  catalogPatterns,
  (newPatterns) => {
    console.log("CatalogPatterns changed:", newPatterns);
    if (newPatterns) {
      loadPatternsData();
    }
  },
  { immediate: true },
);

// Carousel functions
const setCarouselRef = (key, el) => {
  if (el) {
    carouselRefs.value[key] = el;
    if (!carouselPositions.value[key]) {
      carouselPositions.value[key] = 1;
    }

    // Add scroll listener to update position
    el.addEventListener("scroll", () => {
      updateCarouselPosition(key);
    });
  }
};

const scrollCarousel = (key, direction) => {
  const carousel = carouselRefs.value[key];
  if (!carousel) return;

  const containerWidth = carousel.offsetWidth;
  const scrollAmount = containerWidth;

  if (direction === "left") {
    carousel.scrollBy({ left: -scrollAmount, behavior: "smooth" });
  } else {
    carousel.scrollBy({ left: scrollAmount, behavior: "smooth" });
  }

  setTimeout(() => updateCarouselPosition(key), 300);
};

const canScrollLeft = (key) => {
  const carousel = carouselRefs.value[key];
  return carousel ? carousel.scrollLeft > 0 : false;
};

const canScrollRight = (key) => {
  const carousel = carouselRefs.value[key];
  if (!carousel) return false;
  return carousel.scrollLeft < carousel.scrollWidth - carousel.clientWidth - 1;
};

const updateCarouselPosition = (key) => {
  const carousel = carouselRefs.value[key];
  if (!carousel) return;

  const firstCard = carousel.querySelector(".pattern-card");
  if (!firstCard) return;

  const cardWidth = firstCard.offsetWidth;
  const gap = 24; // var(--spacing-xl)
  const scrollLeft = carousel.scrollLeft;

  // Calculate which card we're viewing (1-indexed)
  const currentCard = Math.round(scrollLeft / (cardWidth + gap)) + 1;
  carouselPositions.value[key] = Math.max(1, currentCard);
};

// Drag to scroll
const startDrag = (e, key) => {
  const carousel = carouselRefs.value[key];
  if (!carousel || window.innerWidth <= 768) return; // Only on desktop

  isDragging.value = true;
  dragStart.value = {
    x: e.pageX,
    scrollLeft: carousel.scrollLeft,
    key,
  };
  carousel.style.cursor = "grabbing";
  carousel.style.userSelect = "none";

  const onMouseMove = (e) => {
    if (!isDragging.value) return;
    e.preventDefault();
    const x = e.pageX;
    const walk = (x - dragStart.value.x) * 2; // Multiply for faster scroll
    carousel.scrollLeft = dragStart.value.scrollLeft - walk;
  };

  const onMouseUp = () => {
    isDragging.value = false;
    carousel.style.cursor = "grab";
    carousel.style.userSelect = "";
    updateCarouselPosition(key);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

// Handler for photo info
const showPhotoInfo = async (photo) => {
  try {
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    selectedDialogPhoto.value = fullPhoto;
    showPhotoInfoDialog.value = true;
  } catch (error) {
    console.error("Error fetching photo info:", error);
  }
};

// Also load on mount as fallback
onMounted(() => {
  console.log("Component mounted");
  console.log("Profile:", userStore.profile);
  console.log(
    "CatalogPatterns (camelCase):",
    userStore.profile?.catalogPatterns,
  );
  console.log(
    "catalog_patterns (snake_case):",
    userStore.profile?.catalog_patterns,
  );

  if (catalogPatterns.value) {
    loadPatternsData();
  } else {
    console.error(
      "No patterns available on mount. Profile keys:",
      userStore.profile ? Object.keys(userStore.profile) : "no profile",
    );
  }
});
</script>

<style scoped>
/* Common styles inherited from parent */

/* Patterns Placeholder */
.patterns-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 500px;
  padding: var(--spacing-2xl);
}

.placeholder-content {
  text-align: center;
  max-width: 600px;
}

.placeholder-icon {
  margin-bottom: var(--spacing-lg);
}

.placeholder-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-md) 0;
}

.placeholder-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-2xl) 0;
  line-height: var(--line-height-relaxed);
}

.pattern-types-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--spacing-xl);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-xl);
  text-align: left;
}

.pattern-type-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  color: var(--text-secondary);
}

.pattern-type-item .n-icon {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--primary-color);
}

.pattern-type-text {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.pattern-type-text strong {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.pattern-type-text span {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

.placeholder-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background-color: var(--primary-color-light);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--primary-color);
  font-weight: var(--font-weight-medium);
}

.placeholder-note .n-icon {
  flex-shrink: 0;
}

.carousel-container {
  position: relative;
  padding: 0;
}

.pattern-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
  overflow-x: auto;
  overflow-y: visible;
  scroll-behavior: smooth;
  cursor: grab;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

.pattern-grid::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

.pattern-grid:active {
  cursor: grabbing;
}

@media (min-width: 769px) {
  .pattern-grid {
    grid-template-columns: repeat(
      auto-fill,
      calc((100% - (var(--spacing-xl) * 2)) / 3)
    );
    grid-auto-flow: column;
    grid-auto-columns: calc((100% - (var(--spacing-xl) * 2)) / 3);
    scroll-snap-type: x mandatory;
  }

  .pattern-card {
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }
}

.carousel-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  background-color: var(--primary-color);
  border: 1px solid var(--border-color);
  border-radius: 50%;
  width: 35px;
  height: 35px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--transition-normal);
  box-shadow: var(--shadow-md);
  color: var(--text-primary);
}

.carousel-nav:hover:not(:disabled) {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
  box-shadow: var(--shadow-lg);
  transform: translateY(-50%) scale(1.05);
}

.carousel-nav:disabled {
  opacity: 0;
  cursor: not-allowed;
}

.carousel-nav-left {
  left: -17px;
}

.carousel-nav-right {
  right: -17px;
}
.patterns-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-card);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  margin-left: var(--spacing-sm);
  border: 1px solid var(--border-color);
}
.carousel-indicator {
  position: absolute;
  bottom: -40px;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-full);
  padding: var(--spacing-xs) var(--spacing-lg);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  box-shadow: var(--shadow-sm);
}

.pattern-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
  display: flex;
  flex-direction: column;
  height: 370px;
  min-height: 370px;
}

.pattern-card:hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-lg);
}

.pattern-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  flex-shrink: 0;
}

.pattern-title-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.pattern-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
  line-height: 1.2;
}

.pattern-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
  flex: 1;
  overflow-y: auto;
  padding-right: var(--spacing-sm);
}

.pattern-description::-webkit-scrollbar {
  width: 6px;
}

.pattern-description::-webkit-scrollbar-track {
  background: transparent;
}

.pattern-description::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.pattern-description::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.pattern-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--spacing-md);
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  padding-top: var(--spacing-lg);
  margin-top: auto;
}

.pattern-strength {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
}

.pattern-strength.strong {
  background-color: var(--primary-color-light);
  color: var(--primary-color);
}

.pattern-strength.moderate {
  background-color: var(--warning-color-light);
  color: var(--warning-color);
}

.pattern-strength.weak {
  background-color: var(--error-color-light);
  color: var(--error-color);
}

.example-photos {
  margin: var(--spacing-lg) 0;
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.examples-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);

  .photos-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  margin: 0 0 var(--spacing-md) 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.photos-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-sm);
}

.cultural-card {
  border-left: 3px solid var(--primary-color);
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .patterns-placeholder {
    min-height: 400px;
    padding: var(--spacing-xl);
  }

  .placeholder-title {
    font-size: var(--font-size-xl);
  }

  .placeholder-description {
    font-size: var(--font-size-sm);
  }

  .pattern-types-list {
    padding: var(--spacing-lg);
    gap: var(--spacing-md);
  }

  .placeholder-note {
    flex-direction: column;
    text-align: center;
  }

  .carousel-container {
    padding: 0;
  }

  .carousel-nav,
  .carousel-indicator {
    display: none !important;
  }

  .pattern-grid {
    grid-template-columns: 1fr;
    grid-auto-flow: row;
    overflow-x: visible;
    cursor: default;
  }

  .pattern-card {
    height: auto;
    min-height: unset;
  }

  .pattern-description {
    max-height: none;
    overflow-y: visible;
  }

  .pattern-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .photos-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .patterns-placeholder {
    min-height: 350px;
    padding: var(--spacing-lg);
  }

  .placeholder-icon {
    font-size: 48px !important;
  }

  .placeholder-title {
    font-size: var(--font-size-lg);
  }

  .placeholder-description {
    font-size: var(--font-size-xs);
    margin-bottom: var(--spacing-lg);
  }

  .pattern-types-list {
    padding: var(--spacing-md);
    gap: var(--spacing-sm);
  }

  .pattern-type-item {
    gap: var(--spacing-sm);
  }

  .pattern-type-text strong {
    font-size: var(--font-size-sm);
  }

  .pattern-type-text span {
    font-size: var(--font-size-xs);
  }

  .placeholder-note {
    padding: var(--spacing-sm);
    font-size: var(--font-size-xs);
  }

  .section-title {
    font-size: var(--font-size-xl);
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .pattern-card {
    padding: var(--spacing-lg);
  }

  .pattern-title {
    font-size: var(--font-size-base);
  }

  .pattern-description {
    font-size: var(--font-size-sm);
  }

  .photos-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-xs);
  }
}
</style>
