<template>
  <div class="report-container view-container">
    <!-- Navigation Sidebar (Desktop) / Bottom Nav (Mobile) -->
    <!-- <nav class="report-navigation">
      <div class="nav-items">
        <button
          v-for="section in sections"
          :key="section.id"
          :class="['nav-item', { active: activeSection === section.id }]"
          @click="scrollToSection(section.id)"
        >
          <n-icon :size="20" class="nav-icon">
            <component :is="section.icon" />
          </n-icon>
          <span class="nav-label">
            <span class="nav-label-desktop">{{ section.label }}</span>
            <span class="nav-label-mobile">{{ section.shortLabel }}</span>
          </span>
        </button>
      </div>
    </nav> -->

    <!-- Report Content -->
    <div v-if="!isGenerating" class="report-content">
      <!-- Report Header -->
      <div class="report-header">
        <div class="header-content">
          <div class="header-left">
            <h1 class="report-title">Analytics Report</h1>
            <p class="report-subtitle">
              Comprehensive analysis of {{ totalPhotos }} photos in your catalog
            </p>
          </div>
        </div>
      </div>

      <!-- Visual Aspects Section -->
      <section
        id="visual"
        ref="visualRef"
        class="report-section-wrapper"
        data-section="visual"
      >
        <VisualAspectsReportNew :photos="photosStore.photos" />
      </section>

      <!-- Photographic Patterns Section -->
      <!-- <section
        id="patterns"
        ref="patternsRef"
        class="report-section-wrapper"
        data-section="patterns"
      >
        <div class="patterns-section">
          <NarrativeAnalysisReport />
        </div>
      </section> -->

      <!-- Artistic Scores Section -->
      <section
        id="artistic"
        ref="artisticRef"
        class="report-section-wrapper"
        data-section="artistic"
      >
        <ArtisticScoresReport :photos="photosStore.photos" />
      </section>

      <!-- Commented Sections -->
      <!-- <div class="report-section">

      <div class="report-section">
        <div class="section-header">
          <h2 class="section-title">
            <n-icon class="section-icon">
              <StarIcon />
            </n-icon>
            Aesthetic Strengths
          </h2>
          <p class="section-description">
            Positive aesthetic qualities and artistic merits identified in your
            portfolio
          </p>
        </div>

        <div class="aesthetic-grid">
          <div
            v-for="quality in aestheticQualities"
            :key="quality.id"
            class="aesthetic-card positive"
          >
            <div class="quality-icon">
              <n-icon size="24" :color="quality.color">
                <component :is="quality.icon" />
              </n-icon>
            </div>
            <div class="quality-content">
              <h3 class="quality-title">{{ quality.title }}</h3>
              <p class="quality-description">{{ quality.description }}</p>
              <div class="quality-score">
                <span class="score-label">Prevalence:</span>
                <div class="score-bar">
                  <div
                    class="score-fill positive"
                    :style="{ width: `${quality.score}%` }"
                  ></div>
                </div>
                <span class="score-value">{{ quality.score }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="report-section last-section">
        <div class="section-header">
          <h2 class="section-title">
            <n-icon class="section-icon">
              <BulbIcon />
            </n-icon>
            Growth Opportunities
          </h2>
          <p class="section-description">
            Areas for improvement and missing elements to enhance your portfolio
          </p>
        </div>

        <div class="improvement-grid">
          <div
            v-for="improvement in improvements"
            :key="improvement.id"
            class="improvement-card"
          >
            <div class="improvement-icon">
              <n-icon size="24" color="var(--warning-color)">
                <component :is="improvement.icon" />
              </n-icon>
            </div>
            <div class="improvement-content">
              <h3 class="improvement-title">{{ improvement.title }}</h3>
              <p class="improvement-description">
                {{ improvement.description }}
              </p>
              <div class="improvement-priority" :class="improvement.priority">
                <span class="priority-label">Priority:</span>
                <span class="priority-value">{{ improvement.priority }}</span>
              </div>
              <div class="improvement-suggestions">
                <h4>Suggestions:</h4>
                <ul>
                  <li
                    v-for="suggestion in improvement.suggestions"
                    :key="suggestion"
                  >
                    {{ suggestion }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div> -->
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { usePhotosStore } from "@/stores/photos.js";

defineOptions({
  name: "PortfolioReportView",
});
import { visualAspectsOptions } from "@/stores/searchStore.js";
import { useMessage } from "naive-ui";
import VisualAspectsReport from "@/components/report/VisualAspectsReport.vue";
import NarrativeAnalysisReport from "@/components/report/NarrativeAnalysisReport.vue";
import ArtisticScoresReport from "@/components/report/ArtisticScoresReport.vue";

// Icons
import {
  AnalyticsOutline as AnalyticsIcon,
  BarChartOutline as ChartBarIcon,
  BookOutline as BookIcon,
  EarthOutline as GlobeIcon,
  StarOutline as StarIcon,
  BulbOutline as BulbIcon,
  EyeOutline as EyeIcon,
  RefreshOutline as RefreshIcon,
  ArrowBackOutline as ArrowBackIcon,
  CameraOutline as CameraIcon,
  ColorPaletteOutline as PaletteIcon,
  FlashOutline as LightningIcon,
  GridOutline as GridIcon,
  ImageOutline as ImageIcon,
  SpeedometerOutline as SpeedometerIcon,
  TrendingUpOutline as TrendingUpIcon,
  WarningOutline as WarningIcon,
} from "@vicons/ionicons5";
import VisualAspectsReportNew from "@/components/report/VisualAspectsReportNew.vue";

const photosStore = usePhotosStore();
const message = useMessage();

// Navigation sections
const sections = [
  {
    id: "visual",
    label: "Visual Aspects",
    shortLabel: "Visual",
    icon: EyeIcon,
  },
  {
    id: "patterns",
    label: "Usage Patterns",
    shortLabel: "Patterns",
    icon: BookIcon,
  },
  {
    id: "artistic",
    label: "Artistic Scores",
    shortLabel: "Artistic",
    icon: StarIcon,
  },
];

// Section refs
const visualRef = ref(null);
const patternsRef = ref(null);
const artisticRef = ref(null);

// Active section tracking
const activeSection = ref("visual");

// Scroll to section
const scrollToSection = (sectionId) => {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
};

// IntersectionObserver setup
let observer = null;

const setupIntersectionObserver = () => {
  const options = {
    root: null,
    rootMargin: "-20% 0px -70% 0px",
    threshold: 0,
  };

  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const sectionId = entry.target.getAttribute("data-section");
        if (sectionId) {
          activeSection.value = sectionId;
        }
      }
    });
  }, options);

  // Observe all sections
  const sectionElements = document.querySelectorAll(".report-section-wrapper");
  sectionElements.forEach((section) => observer.observe(section));
};

// State
const isGenerating = ref(false);
const reportDate = ref(new Date());

// Mock data - In a real app, this would come from API calls
const totalPhotos = computed(() => photosStore.photos?.length || 0);

const narrativeData = ref([]);
const culturalData = ref([]);
const aestheticQualities = ref([]);
const improvements = ref([]);

const generateNarrativeData = () => {
  return [
    {
      id: 1,
      title: "Urban Storytelling",
      percentage: 28,
      description:
        "Photos capture people in urban environments with strong narrative elements, showing daily life interactions, street scenes, and human connections in city contexts.",
      photoCount: Math.floor(totalPhotos.value * 0.28),
      strength: "strong",
    },
    {
      id: 2,
      title: "Isolated Subjects",
      percentage: 22,
      description:
        "Images featuring solitary subjects in contemplative or dramatic poses, emphasizing individual character and emotional expression through isolation.",
      photoCount: Math.floor(totalPhotos.value * 0.22),
      strength: "moderate",
    },
    {
      id: 3,
      title: "Environmental Narratives",
      percentage: 18,
      description:
        "Landscape and environmental shots that tell stories about places, weather conditions, and the relationship between humans and nature.",
      photoCount: Math.floor(totalPhotos.value * 0.18),
      strength: "moderate",
    },
    {
      id: 4,
      title: "Documentary Moments",
      percentage: 15,
      description:
        "Candid captures of real-life events, social situations, and authentic moments that document experiences and cultural practices.",
      photoCount: Math.floor(totalPhotos.value * 0.15),
      strength: "strong",
    },
    {
      id: 5,
      title: "Abstract Concepts",
      percentage: 17,
      description:
        "Artistic interpretations focusing on form, color, and composition rather than literal representation, creating conceptual narratives.",
      photoCount: Math.floor(totalPhotos.value * 0.17),
      strength: "weak",
    },
  ];
};

const generateCulturalData = () => {
  return [
    {
      id: 1,
      title: "Western Urban Culture",
      percentage: 35,
      description:
        "Contemporary Western city life, modern architecture, and urban social patterns reflecting metropolitan cultural values.",
      photoCount: Math.floor(totalPhotos.value * 0.35),
      tags: ["urban", "contemporary", "western", "metropolitan"],
    },
    {
      id: 2,
      title: "Traditional & Heritage",
      percentage: 24,
      description:
        "Cultural heritage elements, traditional practices, historical contexts, and preservation of cultural identity through visual documentation.",
      photoCount: Math.floor(totalPhotos.value * 0.24),
      tags: ["heritage", "traditional", "cultural", "historical"],
    },
    {
      id: 3,
      title: "Natural & Environmental",
      percentage: 19,
      description:
        "Environmental consciousness, nature appreciation, and the cultural relationship between humans and natural landscapes.",
      photoCount: Math.floor(totalPhotos.value * 0.19),
      tags: ["nature", "environmental", "landscape", "conservation"],
    },
    {
      id: 4,
      title: "Social Interactions",
      percentage: 22,
      description:
        "Community gatherings, social events, interpersonal relationships, and collective cultural expressions in various settings.",
      photoCount: Math.floor(totalPhotos.value * 0.22),
      tags: ["social", "community", "relationships", "gatherings"],
    },
  ];
};

const generateAestheticQualities = () => {
  return [
    {
      id: 1,
      title: "Strong Composition",
      description:
        "Well-balanced framing and thoughtful arrangement of visual elements create compelling and harmonious images.",
      score: 78,
      icon: GridIcon,
      color: "var(--success-color)",
    },
    {
      id: 2,
      title: "Dynamic Lighting",
      description:
        "Effective use of natural and artificial light sources to create mood, depth, and visual interest.",
      score: 65,
      icon: LightningIcon,
      color: "var(--success-color)",
    },
    {
      id: 3,
      title: "Color Harmony",
      description:
        "Thoughtful color palettes and tonal relationships that enhance the overall aesthetic appeal.",
      score: 72,
      icon: PaletteIcon,
      color: "var(--success-color)",
    },
    {
      id: 4,
      title: "Technical Quality",
      description:
        "Sharp focus, appropriate exposure, and good technical execution across the majority of images.",
      score: 58,
      icon: SpeedometerIcon,
      color: "var(--success-color)",
    },
  ];
};

const generateImprovements = () => {
  return [
    {
      id: 1,
      title: "Portrait Photography",
      description:
        "Limited representation of portrait work in the collection. Adding more character studies and human subjects could enhance storytelling depth.",
      priority: "high",
      icon: CameraIcon,
      suggestions: [
        "Include more close-up character portraits",
        "Experiment with environmental portraits",
        "Focus on emotional expression in subjects",
        "Try different portrait lighting techniques",
      ],
    },
    {
      id: 2,
      title: "Color Variety",
      description:
        "Portfolio shows tendency toward muted tones. Incorporating more vibrant and varied color palettes could add visual impact.",
      priority: "medium",
      icon: PaletteIcon,
      suggestions: [
        "Experiment with bold, saturated colors",
        "Try complementary color schemes",
        "Include more golden hour photography",
        "Explore color psychology in composition",
      ],
    },
    {
      id: 3,
      title: "Macro & Detail Work",
      description:
        "Missing intimate detail shots and macro photography that could add texture and visual interest to the collection.",
      priority: "medium",
      icon: EyeIcon,
      suggestions: [
        "Add close-up texture studies",
        "Include macro nature photography",
        "Focus on architectural details",
        "Capture interesting patterns and textures",
      ],
    },
    {
      id: 4,
      title: "Low Light Photography",
      description:
        "Limited exploration of night photography and challenging lighting conditions that could showcase technical skills.",
      priority: "low",
      icon: ImageIcon,
      suggestions: [
        "Try night street photography",
        "Experiment with long exposures",
        "Capture indoor ambient lighting",
        "Explore creative use of artificial light",
      ],
    },
  ];
};

const generateReport = async () => {
  if (totalPhotos.value === 0) {
    message.warning(
      "No photos found in your catalog. Please add photos first.",
    );
    return;
  }

  isGenerating.value = true;

  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    // Generate all sections data
    narrativeData.value = generateNarrativeData();
    culturalData.value = generateCulturalData();
    aestheticQualities.value = generateAestheticQualities();
    improvements.value = generateImprovements();

    reportDate.value = new Date();

    // message.warning(
    //   "This screen is only a preview for demonstration purposes. Real functionality coming soon.",
    //   {
    //     duration: 0, // requires manual close
    //     closable: true,
    //   },
    // );
  } catch (error) {
    console.error("Error generating report:", error);
    message.error("Failed to generate report. Please try again.");
  } finally {
    isGenerating.value = false;
  }
};

const regenerateReport = async () => {
  await generateReport();
};

const formatDate = (date) => {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

// Initialize
onMounted(async () => {
  // Ensure photos are loaded
  if (photosStore.photos.length === 0) {
    await photosStore.fetchPhotos();
  }

  // Setup scroll spy
  setTimeout(() => {
    setupIntersectionObserver();
  }, 100);
});

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
  }
});
</script>

<style scoped>
.report-container {
  padding: var(--spacing-2xl) var(--spacing-2xl) var(--spacing-4xl)
    var(--spacing-2xl);
  margin: 0 auto;
  background-color: var(--bg-body);
  min-height: 90vh;
  position: relative;
}

/* Navigation Styles */
.report-navigation {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  width: fit-content;
  z-index: 100;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(10px);
  transition: var(--transition-normal);
  height: auto;
  min-height: unset;
}

.nav-items {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-xs);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--border-color);
}

.nav-item.active {
  background: var(--primary-color);
  color: var(--text-on-primary);
  border-color: var(--border-color);
}

.nav-item.active .nav-icon {
  color: white;
}

.nav-icon {
  flex-shrink: 0;
  transition: var(--transition-fast);
}

.nav-label {
  transition: var(--transition-fast);
}

/* Mobile Navigation */
@media (max-width: 768px) {
  .report-navigation {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    top: auto;
    margin: 0;
    transform: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    border-bottom: none;
    padding: var(--spacing-sm) var(--spacing-md);
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
    box-sizing: border-box;
    width: 100%;
    max-width: 100vw;
  }

  .nav-items {
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    gap: 0;
    width: 100%;
  }

  .nav-item {
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    flex: 1;
    text-align: center;
    justify-content: center;
  }

  .nav-label {
    font-size: var(--font-size-xs);
    display: inline;
  }

  .report-container {
    padding-bottom: calc(var(--spacing-4xl) + 80px);
  }
}

/* Section Wrappers */
.report-section-wrapper {
  scroll-margin-top: var(--spacing-2xl);
  margin-bottom: var(--spacing-3xl);
}

/* Empty State Styles (similar to ProjectBuilderView) */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: var(--spacing-4xl) var(--spacing-2xl);
}

.empty-content {
  text-align: center;
  max-width: 600px;
}

.empty-icon {
  margin-bottom: var(--spacing-2xl);
  opacity: 0.7;
}

.empty-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xl) 0;
  line-height: var(--line-height-tight);
}

.empty-description {
  font-size: var(--font-size-lg);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-3xl) 0;
}

.instructions-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-3xl);
  text-align: left;
}

.instruction-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  transition: var(--transition-normal);
}

.instruction-item:hover {
  border-color: var(--primary-color);
  transform: translateY(-1px);
}

.instruction-item n-icon {
  color: var(--primary-color);
  margin-top: 2px;
  flex-shrink: 0;
}

.instruction-item span {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
}

.report-actions {
  margin-top: var(--spacing-2xl);
}

.generate-button {
  font-size: var(--font-size-lg);
  padding: var(--spacing-lg) var(--spacing-2xl);
  height: auto;
}

/* Report Content Styles */
.report-content {
  margin: 0 auto;
}

.report-header {
  padding-bottom: var(--spacing-2xl);
  border-bottom: 1px solid var(--border-color);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-2xl);
}

.header-left {
  flex: 1;
}

.report-title {
  font-size: var(--font-size-4xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  line-height: var(--line-height-tight);
}

.report-subtitle {
  font-size: var(--font-size-xl);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-sm) 0;
}

.report-date {
  font-size: var(--font-size-base);
  color: var(--text-tertiary);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
  flex-shrink: 0;
}

/* Section Styles */
.report-section {
  margin-bottom: var(--spacing-4xl);
}

.report-section.last-section {
  margin-bottom: var(--spacing-6xl);
}

.section-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.section-icon {
  color: var(--primary-color);
}

.section-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

/* Patterns Section */
.patterns-section {
  width: 100%;
}

.patterns-section .section-header {
  margin-bottom: 0;
}

/* Narrative Grid */
.narrative-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
}

.narrative-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.narrative-card:hover {
  border-color: var(--success-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.narrative-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.narrative-percentage {
  background: linear-gradient(
    135deg,
    var(--success-color),
    var(--success-color-light)
  );
  color: white;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  min-width: 60px;
  text-align: center;
}

.narrative-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.narrative-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.narrative-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
}

.photo-count {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.narrative-strength {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
}

.narrative-strength.strong {
  background-color: var(--success-color-light);
  color: var(--success-color);
}

.narrative-strength.moderate {
  background-color: var(--warning-color-light);
  color: var(--warning-color);
}

.narrative-strength.weak {
  background-color: var(--error-color-light);
  color: var(--error-color);
}

/* Cultural Grid */
.cultural-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
}

.cultural-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.cultural-card:hover {
  border-color: var(--info-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.cultural-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.cultural-percentage {
  background: linear-gradient(
    135deg,
    var(--info-color),
    var(--info-color-light)
  );
  color: white;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  min-width: 60px;
  text-align: center;
}

.cultural-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.cultural-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.cultural-meta {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.cultural-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
}

.cultural-tag {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

/* Aesthetic Grid */
.aesthetic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
}

.aesthetic-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  display: flex;
  gap: var(--spacing-lg);
  transition: var(--transition-normal);
}

.aesthetic-card:hover {
  border-color: var(--success-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.quality-icon {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: var(--spacing-xs);
}

.quality-content {
  flex: 1;
}

.quality-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.quality-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.quality-score {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.score-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.score-bar {
  flex: 1;
  height: 8px;
  background-color: var(--bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.score-fill.positive {
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--success-color),
    var(--success-color-light)
  );
  border-radius: var(--radius-full);
  transition: var(--transition-normal);
}

.score-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--success-color);
  flex-shrink: 0;
}

/* Improvement Grid */
.improvement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  gap: var(--spacing-xl);
}

.improvement-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  display: flex;
  gap: var(--spacing-lg);
  transition: var(--transition-normal);
}

.improvement-card:hover {
  border-color: var(--warning-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.improvement-icon {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  padding-top: var(--spacing-xs);
}

.improvement-content {
  flex: 1;
}

.improvement-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.improvement-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-md) 0;
}

.improvement-priority {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.priority-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.priority-value {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
}

.improvement-priority.high .priority-value {
  background-color: var(--error-color-light);
  color: var(--error-color);
}

.improvement-priority.medium .priority-value {
  background-color: var(--warning-color-light);
  color: var(--warning-color);
}

.improvement-priority.low .priority-value {
  background-color: var(--success-color-light);
  color: var(--success-color);
}

.improvement-suggestions h4 {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
}

.improvement-suggestions ul {
  margin: 0;
  padding-left: var(--spacing-lg);
}

.improvement-suggestions li {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin-bottom: var(--spacing-xs);
}

/* Shared Report Section Styles */
:deep(.report-section) {
  margin-bottom: var(--spacing-4xl);
}

:deep(.report-section-header) {
  margin-bottom: var(--spacing-2xl);
  margin-top: var(--spacing-xl);
}

:deep(.section-title) {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

:deep(.section-icon) {
  color: var(--primary-color);
}

:deep(.section-description) {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

:deep(.subsection-header) {
  margin-bottom: var(--spacing-xl);
  margin-top: var(--spacing-3xl);
}

:deep(.subsection-title) {
  font-size: var(--font-size-xl) !important;
  font-weight: var(--font-weight-medium) !important;
}

:deep(.group-header) {
  margin-bottom: var(--spacing-xl);
  padding-bottom: var(--spacing-md);
  border-bottom: 2px solid var(--border-color);
}

:deep(.group-title-wrapper) {
  display: flex;
  flex-direction: column;
}

:deep(.criteria-group) {
  margin-top: var(--spacing-3xl);
  margin-bottom: var(--spacing-3xl);
}

:deep(.criteria-group:first-of-type) {
  margin-top: 0;
}

:deep(.criteria-group:last-of-type) {
  margin-bottom: 0;
}

:deep(.group-title) {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

:deep(.group-subtitle) {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-normal);
}

:deep(.empty-icon) {
  color: var(--text-tertiary);
  opacity: 0.5;
}

:deep(.empty-text) {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .report-container {
    padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-3xl)
      var(--spacing-lg);
  }

  .header-content {
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .narrative-grid,
  .cultural-grid,
  .aesthetic-grid,
  .improvement-grid {
    grid-template-columns: 1fr;
  }

  .narrative-meta,
  .cultural-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .quality-score {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .score-bar {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .empty-title {
    font-size: var(--font-size-2xl);
  }

  .report-title {
    font-size: var(--font-size-3xl);
  }

  .section-title {
    font-size: var(--font-size-xl);
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }

  .aesthetic-card,
  .improvement-card {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .quality-score,
  .improvement-priority {
    flex-direction: row;
  }
}

/* Mostrar solo el label largo en desktop, el corto en mobile */
.nav-label-desktop {
  display: inline;
}
.nav-label-mobile {
  display: none;
}
@media (max-width: 768px) {
  .nav-label-desktop {
    display: none;
  }
  .nav-label-mobile {
    display: inline;
  }
}
</style>
