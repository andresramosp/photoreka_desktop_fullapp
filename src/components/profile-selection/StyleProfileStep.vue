<template>
  <div class="step-content">
    <div class="profile-header">
      <h1 class="profile-title">What is your preferred style?</h1>
      <p class="profile-subtitle">
        Help us customize your Photoreka experience
      </p>
    </div>

    <!-- General Purpose Block -->
    <div class="style-block">
      <h3 class="section-title">General Purpose</h3>
      <p class="section-subtitle">Recommended for most users</p>
      <div class="general-grid">
        <div
          class="category-card general-card"
          :class="{ selected: selectedProfiles.includes('general') }"
          @click="toggleGeneral()"
        >
          <div class="category-icon">
            <n-icon size="32">
              <CameraOutline />
            </n-icon>
          </div>
          <h4 class="category-title">General Photography</h4>
          <p class="category-description">
            Perfect for everyday photos, family moments, travel, and mixed
            collections. Our engine adapts to any type of photography without
            requiring specific categorization.
          </p>
          <div class="mode-badge recommended">Recommended</div>
        </div>
      </div>
    </div>

    <!-- Professional Profiles Block -->
    <div class="style-block">
      <h3 class="section-title">Advanced Profiles</h3>
      <p class="section-subtitle">
        For professional or dedicated photographers with a clear style focus
      </p>
      <div class="categories-grid">
        <div
          class="category-card pro-card"
          :class="{
            selected: selectedProfiles.includes('street'),
            disabled:
              selectedProfiles.length >= 2 &&
              !selectedProfiles.includes('street') &&
              !selectedProfiles.includes('general'),
            expanded: expandedProfile === 'street',
          }"
          @click="toggleProfile('street')"
        >
          <div class="category-icon">
            <n-icon size="32">
              <WalkOutline />
            </n-icon>
          </div>
          <h4 class="category-title">Street Photography</h4>
          <p class="category-description">
            Capture life as it happens in urban environments
          </p>
        </div>

        <div
          class="category-card pro-card"
          :class="{
            selected: selectedProfiles.includes('documentary'),
            disabled:
              selectedProfiles.length >= 2 &&
              !selectedProfiles.includes('documentary') &&
              !selectedProfiles.includes('general'),
            expanded: expandedProfile === 'documentary',
          }"
          @click="toggleProfile('documentary')"
        >
          <div class="category-icon">
            <n-icon size="32">
              <BookOpen16Regular />
            </n-icon>
          </div>
          <h4 class="category-title">Documentary Photography</h4>
          <p class="category-description">
            Tell stories and document real-world events
          </p>
        </div>

        <div
          class="category-card pro-card"
          :class="{
            selected: selectedProfiles.includes('artistic'),
            disabled:
              selectedProfiles.length >= 2 &&
              !selectedProfiles.includes('artistic') &&
              !selectedProfiles.includes('general'),
            expanded: expandedProfile === 'artistic',
          }"
          @click="toggleProfile('artistic')"
        >
          <div class="category-icon">
            <n-icon size="32">
              <PaletteOutlined />
            </n-icon>
          </div>
          <h4 class="category-title">Artistic Photography</h4>
          <p class="category-description">
            Create expressive and creative visual art
          </p>
        </div>
      </div>

      <!-- Explanatory text based on selection -->
      <transition name="fade" mode="out-in">
        <div v-if="currentExplanation" class="profile-explanation">
          <div class="explanation-box">
            <div class="explanation-icon">
              <n-icon size="24" color="#2563eb">
                <CheckmarkCircleOutline />
              </n-icon>
            </div>
            <div class="explanation-content">
              <h5>{{ currentExplanation.title }}</h5>
              <p>{{ currentExplanation.description }}</p>
              <ul class="explanation-list">
                <li
                  v-for="(point, index) in currentExplanation.points"
                  :key="index"
                >
                  ✓ {{ point }}
                </li>
              </ul>
              <p class="info-note">
                <strong>Note:</strong> Choosing this style doesn't limit your
                uploads. You can still upload photos of any type - this only
                creates a slight preference in how our engine evaluates and
                organizes your work.
              </p>
            </div>
          </div>
        </div>
      </transition>

      <p class="selection-hint" v-if="!selectedProfiles.includes('general')">
        Choose up to 2 styles that best represent your work
      </p>
    </div>

    <!-- Step 2 Actions -->
    <div class="profile-actions">
      <div class="action-buttons">
        <n-button size="large" @click="handleBack" class="back-button">
          <template #icon>
            <n-icon>
              <ArrowBackOutline />
            </n-icon>
          </template>
          Back
        </n-button>
        <n-button
          type="primary"
          size="large"
          :disabled="selectedProfiles.length === 0"
          @click="handleComplete"
          class="complete-button"
        >
          Complete Setup
        </n-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import {
  CameraOutline,
  CheckmarkCircleOutline,
  ArrowBackOutline,
  WalkOutline,
} from "@vicons/ionicons5";
import { BookOpen16Regular } from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";

interface Props {
  selectedProfiles: string[];
}

interface Emits {
  (e: "update:selectedProfiles", value: string[]): void;
  (e: "back"): void;
  (e: "complete"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const expandedProfile = ref<string | null>(null);

// Profile explanations for all possible combinations
const profileExplanations = {
  street: {
    title: "Street Photography",
    description:
      "Optimized for candid moments and urban life documentation. This profile gives a slight bias to:",
    points: [
      "Authentic, unposed moments and decisive instants",
      "Strong composition and framing in urban contexts",
      "Human subjects and environmental storytelling",
      "Humor, visual games, striking scenes in everyday life",
    ],
  },
  documentary: {
    title: "Documentary Photography",
    description:
      "Optimized for storytelling and real-world documentation. This profile gives a slight bias to:",
    points: [
      "Narrative strength and emotional impact",
      "Context, environment, and situational awareness",
      "Authenticity and truthfulness over stylized aesthetics",
      "Series coherence and photo essay potential",
    ],
  },
  artistic: {
    title: "Artistic Photography",
    description:
      "Optimized for creative expression and fine art. This profile gives a slight bias to:",
    points: [
      "Creative vision and conceptual execution",
      "Technical mastery and intentional choices",
      "Color theory, light, and visual poetry",
      "Unique perspectives and experimental approaches",
    ],
  },
  "artistic+documentary": {
    title: "Artistic Documentary Photography",
    description:
      "Storytelling through artistic expression. This dual profile combines:",
    points: [
      "Narrative strength with creative visual language",
      "Real-world subjects treated with artistic sensitivity",
      "Conceptual depth in documentary projects",
      "Aesthetic beauty without compromising authenticity",
    ],
  },
  "artistic+street": {
    title: "Street Photography with Artistic Vision",
    description:
      "Creative urban documentation with artistic flair. This dual profile emphasizes:",
    points: [
      "Candid moments elevated through artistic composition",
      "Experimental approaches to street scenes",
      "Visual poetry found in everyday urban life",
      "Technical mastery applied to spontaneous situations",
    ],
  },
  "documentary+street": {
    title: "Street & Documentary Photography",
    description:
      "A powerful combination for narrative urban storytelling. This dual profile balances:",
    points: [
      "Candid moments with strong narrative context",
      "Urban environments as stages for human stories",
      "Authenticity in composition and decisive timing",
      "Series work that documents social reality",
    ],
  },
};

// Computed property to get the current profile explanation
const currentExplanation = computed(() => {
  const professionalProfiles = props.selectedProfiles
    .filter((p) => p !== "general")
    .sort();

  if (professionalProfiles.length === 0) return null;

  const key =
    professionalProfiles.length === 1
      ? professionalProfiles[0]
      : professionalProfiles.join("+");

  return profileExplanations[key as keyof typeof profileExplanations] || null;
});

const toggleGeneral = () => {
  // If general is selected, deselect it; otherwise select it and clear other selections
  if (props.selectedProfiles.includes("general")) {
    emit("update:selectedProfiles", []);
  } else {
    emit("update:selectedProfiles", ["general"]);
    expandedProfile.value = null;
  }
};

const toggleProfile = (profile: string) => {
  const currentProfiles = [...props.selectedProfiles].filter(
    (p) => p !== "general"
  );
  const index = currentProfiles.indexOf(profile);

  if (index > -1) {
    currentProfiles.splice(index, 1);
    expandedProfile.value = null;
  } else {
    if (currentProfiles.length < 2) {
      currentProfiles.push(profile);
      expandedProfile.value = profile;
    }
  }

  emit("update:selectedProfiles", currentProfiles);
};

// Watch for changes in selectedProfiles to update expandedProfile
watch(
  () => props.selectedProfiles,
  (newProfiles) => {
    // If general is selected, clear expanded profile
    if (newProfiles.includes("general")) {
      expandedProfile.value = null;
    } else {
      // If a professional profile is selected and there's no expanded profile, expand the first one
      const professionalProfiles = newProfiles.filter((p) => p !== "general");
      if (professionalProfiles.length > 0 && !expandedProfile.value) {
        expandedProfile.value = professionalProfiles[0];
      }
    }
  }
);

const handleBack = () => {
  emit("back");
};

const handleComplete = () => {
  emit("complete");
};
</script>

<style scoped>
.step-content {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.profile-header {
  text-align: center;
  margin-bottom: 32px;
}

.profile-title {
  margin: 16px 0 8px 0;
  font-size: 32px;
  font-weight: 700;
  color: #ffffffd1;
  letter-spacing: -0.025em;
}

.profile-subtitle {
  margin: 0 0 24px 0;
  font-size: 16px;
  color: #ffffff73;
  font-weight: 400;
}

/* Style Blocks */
.style-block {
  margin-bottom: 48px;
}

.section-title {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
  color: #ffffffd1;
  text-align: center;
}

.section-subtitle {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: #ffffff73;
  text-align: center;
  font-weight: 400;
}

.selection-hint {
  margin: 20px 0 0 0;
  font-size: 13px;
  color: #ffffff73;
  text-align: center;
  font-style: italic;
}

/* General Grid */
.general-grid {
  max-width: 500px;
  margin: 0 auto;
}

.general-card {
  background-color: #2c2c32;
  border: 2px solid #3c3c42;
  border-radius: 16px;
  padding: 28px 32px;
  text-align: center;
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.general-card:hover {
  border-color: #4c4c52;
}

.general-card.selected {
  border-color: #22c55e;
  background-color: rgba(34, 197, 94, 0.1);
  box-shadow: 0 4px 16px rgba(34, 197, 94, 0.3);
}

.general-card .category-icon {
  margin-bottom: 12px;
  color: #ffffffd1;
}

.general-card.selected .category-icon {
  color: #22c55e;
}

.mode-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 12px;
}

.mode-badge.recommended {
  background-color: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

/* Professional Categories Grid */
.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.category-card {
  background-color: #2c2c32;
  border: 2px solid #3c3c42;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.pro-card:hover:not(.disabled) {
  border-color: #4c4c52;
}

.pro-card.selected {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.pro-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.category-icon {
  margin-bottom: 12px;
  color: #ffffffd1;
}

.pro-card.selected .category-icon {
  color: #2563eb;
}

.category-title {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffffd1;
}

.category-description {
  margin: 0;
  font-size: 13px;
  color: #ffffff73;
  line-height: 1.4;
}

/* Profile Explanation */
.profile-explanation {
  max-width: 700px;
  margin: 24px auto 0;
}

.explanation-box {
  background-color: rgba(44, 44, 50, 0.5);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  gap: 16px;
  border-left: 4px solid #2563eb;
}

.explanation-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.explanation-content h5 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #ffffffd1;
}

.explanation-content p {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #ffffff99;
  line-height: 1.6;
}

.explanation-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px 0;
}

.explanation-list li {
  font-size: 14px;
  color: #ffffff99;
  margin-bottom: 8px;
  padding-left: 4px;
}

.info-note {
  background-color: rgba(37, 99, 235, 0.1);
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  color: #60a5fa;
  margin: 0;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from {
  opacity: 0;
}

.fade-leave-to {
  opacity: 0;
}

/* Actions */
.profile-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 40px;
}

.action-buttons {
  display: flex;
  gap: 16px;
  align-items: center;
}

.back-button {
  height: 44px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  padding: 0 24px;
}

.complete-button {
  min-width: 180px;
  height: 44px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
}

/* Responsive design */
@media (max-width: 768px) {
  .profile-title {
    font-size: 24px;
  }

  .categories-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .category-card {
    min-height: 120px;
    padding: 20px;
  }

  .general-card {
    padding: 24px 28px;
  }

  .action-buttons {
    flex-direction: column;
    width: 100%;
  }

  .back-button,
  .complete-button {
    width: 100%;
  }

  .explanation-box {
    flex-direction: column;
    gap: 12px;
  }
}

@media (max-width: 480px) {
  .profile-title {
    font-size: 22px;
  }

  .category-card {
    min-height: 100px;
    padding: 16px;
  }

  .general-card {
    padding: 20px 24px;
  }

  .category-title {
    font-size: 14px;
  }

  .category-description {
    font-size: 12px;
  }
}
</style>
