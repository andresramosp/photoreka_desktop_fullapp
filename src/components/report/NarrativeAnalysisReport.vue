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

    <!-- Narrative Patterns Subsection -->
    <div class="group-header">
      <div class="group-title-wrapper">
        <h3 class="group-title" :style="{ color: colors.blue[600] }">
          Narrative Patterns
        </h3>
        <span class="group-subtitle"
          >Storytelling themes and narrative clusters identified in your
          collection</span
        >
      </div>
    </div>

    <div class="pattern-grid">
      <div
        v-for="narrative in narrativeData"
        :key="narrative.id"
        class="pattern-card"
      >
        <div class="pattern-header">
          <div class="pattern-title-wrapper">
            <h3 class="pattern-title">{{ narrative.title }}</h3>
            <span class="pattern-photo-count"
              >{{ narrative.photoCount }} photos</span
            >
          </div>
          <div class="mini-pie-chart">
            <svg width="50" height="50" viewBox="0 0 50 50">
              <g transform="translate(25,25)">
                <circle
                  r="20"
                  fill="var(--bg-secondary)"
                  stroke="var(--border-color)"
                  stroke-width="1"
                />
                <path
                  :d="generateMiniPieSlice(narrative.percentage)"
                  fill="var(--primary-color)"
                  stroke="var(--border-color)"
                  stroke-width="1"
                />
              </g>
              <text
                x="25"
                y="25"
                text-anchor="middle"
                dominant-baseline="middle"
                class="pie-percentage-text"
              >
                {{ narrative.percentage }}%
              </text>
            </svg>
          </div>
        </div>
        <p class="pattern-description">{{ narrative.description }}</p>

        <div class="example-photos" v-if="narrative.examples?.length">
          <h4 class="examples-title">Example Photos</h4>
          <div class="photos-grid">
            <div
              v-for="photo in narrative.examples"
              :key="photo.id"
              class="example-photo"
              :style="{ backgroundImage: `url(${photo.url})` }"
            >
              <div class="photo-overlay"></div>
            </div>
          </div>
        </div>

        <div class="pattern-meta">
          <span class="pattern-strength" :class="narrative.strength">
            {{ narrative.strength }} pattern
          </span>
        </div>
      </div>
    </div>

    <!-- Cultural Patterns Subsection -->
    <div class="criteria-group">
      <div class="group-header">
        <div class="group-title-wrapper">
          <h3 class="group-title" :style="{ color: colors.purple[600] }">
            Cultural Patterns
          </h3>
          <span class="group-subtitle"
            >Cultural themes and regional patterns detected across your
            photography collection</span
          >
        </div>
      </div>

      <div class="pattern-grid">
        <div
          v-for="cultural in culturalData"
          :key="cultural.id"
          class="pattern-card cultural-card"
        >
          <div class="pattern-header">
            <div class="pattern-title-wrapper">
              <h3 class="pattern-title">{{ cultural.title }}</h3>
              <span class="pattern-photo-count"
                >{{ cultural.photoCount }} photos</span
              >
            </div>
            <div class="mini-pie-chart">
              <svg width="50" height="50" viewBox="0 0 50 50">
                <g transform="translate(25,25)">
                  <circle
                    r="20"
                    fill="var(--bg-secondary)"
                    stroke="var(--border-color)"
                    stroke-width="1"
                  />
                  <path
                    :d="generateMiniPieSlice(cultural.percentage)"
                    fill="var(--primary-color)"
                    stroke="var(--border-color)"
                    stroke-width="1"
                  />
                </g>
                <text
                  x="25"
                  y="25"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  class="pie-percentage-text"
                >
                  {{ cultural.percentage }}%
                </text>
              </svg>
            </div>
          </div>
          <p class="pattern-description">{{ cultural.description }}</p>

          <div class="example-photos" v-if="cultural.examples?.length">
            <h4 class="examples-title">Example Photos</h4>
            <div class="photos-grid">
              <div
                v-for="photo in cultural.examples"
                :key="photo.id"
                class="example-photo"
                :style="{ backgroundImage: `url(${photo.url})` }"
              >
                <div class="photo-overlay"></div>
              </div>
            </div>
          </div>

          <div class="pattern-meta">
            <span class="pattern-strength" :class="cultural.strength">
              {{ cultural.strength }} pattern
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import theme from "@/config/theme.js";
const { colors } = theme;
import {
  BookOutline as BookIcon,
  GlobeOutline as GlobeIcon,
} from "@vicons/ionicons5";

defineOptions({
  name: "NarrativeAnalysisReport",
});

const photosStore = usePhotosStore();

const narrativeData = ref([]);
const culturalData = ref([]);

const totalPhotos = computed(() => photosStore.photos?.length || 0);

const getRandomPhotos = (count) => {
  const photos = photosStore.photos || [];
  if (photos.length === 0) return [];

  const shuffled = [...photos].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, photos.length)).map((photo) => ({
    id: photo.id,
    url: photo.thumbnailUrl || photo.url || "",
  }));
};

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
      examples: getRandomPhotos(4),
    },
    {
      id: 2,
      title: "Isolated Subjects",
      percentage: 22,
      description:
        "Images featuring solitary subjects in contemplative or dramatic poses, emphasizing individual character and emotional expression through isolation.",
      photoCount: Math.floor(totalPhotos.value * 0.22),
      strength: "moderate",
      examples: getRandomPhotos(4),
    },
    {
      id: 3,
      title: "Environmental Narratives",
      percentage: 18,
      description:
        "Landscape and environmental shots that tell stories about places, weather conditions, and the relationship between humans and nature.",
      photoCount: Math.floor(totalPhotos.value * 0.18),
      strength: "moderate",
      examples: getRandomPhotos(4),
    },
    {
      id: 4,
      title: "Documentary Moments",
      percentage: 15,
      description:
        "Candid captures of real-life events, social situations, and authentic moments that document experiences and cultural practices.",
      photoCount: Math.floor(totalPhotos.value * 0.15),
      strength: "strong",
      examples: getRandomPhotos(4),
    },
    {
      id: 5,
      title: "Abstract Concepts",
      percentage: 17,
      description:
        "Artistic interpretations focusing on form, color, and composition rather than literal representation, creating conceptual narratives.",
      photoCount: Math.floor(totalPhotos.value * 0.17),
      strength: "weak",
      examples: getRandomPhotos(4),
    },
    {
      id: 6,
      title: "Intimate Portraits",
      percentage: 12,
      description:
        "Close and personal portraits that emphasize vulnerability, subtle emotions, and psychological depth through proximity, gaze, and minimalistic composition.",
      photoCount: Math.floor(totalPhotos.value * 0.12),
      strength: "moderate",
      examples: getRandomPhotos(4),
    },
  ];
};

const generateCulturalData = () => {
  return [
    {
      id: 1,
      title: "Western Urban Culture",
      percentage: 32,
      description:
        "Contemporary Western lifestyle documentation featuring modern architecture, café culture, street fashion, and urban social interactions typical of European and North American cities.",
      photoCount: Math.floor(totalPhotos.value * 0.32),
      strength: "strong",
      examples: getRandomPhotos(4),
    },
    {
      id: 2,
      title: "Traditional Ceremonies",
      percentage: 14,
      description:
        "Cultural celebrations, religious events, and traditional ceremonies that showcase rituals, customs, and heritage practices across different communities.",
      photoCount: Math.floor(totalPhotos.value * 0.14),
      strength: "moderate",
      examples: getRandomPhotos(4),
    },
    {
      id: 3,
      title: "Natural Landscapes",
      percentage: 25,
      description:
        "Geographic and environmental documentation showing diverse terrains, ecosystems, and natural wonders that reflect regional characteristics and climate patterns.",
      photoCount: Math.floor(totalPhotos.value * 0.25),
      strength: "strong",
      examples: getRandomPhotos(4),
    },
    {
      id: 4,
      title: "Food & Culinary Culture",
      percentage: 11,
      description:
        "Gastronomic documentation featuring regional cuisines, traditional dishes, food preparation methods, and dining experiences that reflect cultural identity.",
      photoCount: Math.floor(totalPhotos.value * 0.11),
      strength: "moderate",
      examples: getRandomPhotos(4),
    },
    {
      id: 5,
      title: "Architectural Heritage",
      percentage: 18,
      description:
        "Historical and contemporary architecture showcasing building styles, construction techniques, and design philosophies unique to different cultures and time periods.",
      photoCount: Math.floor(totalPhotos.value * 0.18),
      strength: "strong",
      examples: getRandomPhotos(4),
    },
    {
      id: 6,
      title: "Festive Attire & Costumes",
      percentage: 8,
      description:
        "Images highlighting traditional clothing, festive costumes, and regional dress codes that express cultural identity and celebration.",
      photoCount: Math.floor(totalPhotos.value * 0.08),
      strength: "weak",
      examples: getRandomPhotos(4),
    },
  ];
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

onMounted(() => {
  narrativeData.value = generateNarrativeData();
  culturalData.value = generateCulturalData();
});
</script>

<style scoped>
/* Common styles inherited from parent */

.pattern-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: var(--spacing-xl);
}

.pattern-card {
  background-color: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  transition: var(--transition-normal);
}

.pattern-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.pattern-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
}

.mini-pie-chart {
  flex-shrink: 0;
}

.pie-percentage-text {
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  fill: var(--text-primary);
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

.pattern-photo-count {
  font-size: var(--font-size-sm);
  color: var(--text-tertiary);
}

.pattern-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0 0 var(--spacing-lg) 0;
}

.pattern-meta {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--spacing-md);
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

.example-photo {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  background-color: var(--bg-surface);
  padding: var(--spacing-xs);
  overflow: hidden;
  cursor: pointer;
  transition: var(--transition-normal);
}

.example-photo:hover {
  transform: scale(1.05);
}

.example-photo:hover .photo-overlay {
  opacity: 0.2;
}

.photo-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.1),
    rgba(0, 0, 0, 0.3)
  );
  opacity: 0.5;
  transition: var(--transition-normal);
}

.cultural-card {
  border-left: 3px solid var(--primary-color);
}

/* Mobile Responsiveness */
@media (max-width: 768px) {
  .pattern-grid {
    grid-template-columns: 1fr;
  }

  .pattern-meta {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .section-title {
    font-size: var(--font-size-xl);
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-sm);
  }
}
</style>
