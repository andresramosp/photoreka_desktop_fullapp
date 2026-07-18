<template>
  <div class="step-content">
    <div class="profile-header">
      <AppLogo layout="icon" :height="isMobile ? 44 : 52" class="header-logo" />
      <div class="header-text">
        <h1 class="profile-title">What is your preferred style?</h1>
        <p class="profile-subtitle">
          Help us customize your Photoreka experience
          <n-tooltip trigger="hover" placement="top">
            <template #trigger>
              <n-icon size="14" class="subtitle-info-icon">
                <InfoCircleFilled />
              </n-icon>
            </template>
            Choosing a style doesn't limit your uploads. You can still upload
            photos of any type - this only creates a slight preference in how
            our engine evaluates and organizes your work.
          </n-tooltip>
        </p>
      </div>
    </div>

    <!-- General Purpose Block -->
    <div class="style-block">
      <div class="primary-grid">
        <div
          class="opt-card primary-card"
          :class="{ selected: selectedProfiles.includes('general') }"
          :style="{ '--accent': '#22c55e' }"
          @click="toggleGeneral()"
        >
          <span class="opt-check">
            <n-icon size="14"><CheckmarkOutline /></n-icon>
          </span>
          <div class="opt-icon">
            <n-icon size="24"><CameraOutline /></n-icon>
          </div>
          <div class="opt-head">
            <h4 class="opt-title">General Photography</h4>
            <span class="opt-badge">Recommended</span>
          </div>
          <p class="opt-desc">
            For everyday photos, travel, and mixed collections. Our engine
            adapts to any type of photography without requiring specific
            categorization.
          </p>
        </div>

        <div
          class="opt-card primary-card"
          :class="{ selected: selectedProfiles.includes('commercial') }"
          :style="{ '--accent': '#a855f7' }"
          @click="toggleCommercial()"
        >
          <span class="opt-check">
            <n-icon size="14"><CheckmarkOutline /></n-icon>
          </span>
          <div class="opt-icon">
            <n-icon size="24"><BriefcaseOutline /></n-icon>
          </div>
          <div class="opt-head">
            <h4 class="opt-title">Commercial Photography</h4>
            <span class="opt-badge">Professional</span>
          </div>
          <p class="opt-desc">
            Optimized for advertising, stock, fashion, wedding, architecture,
            and lifestyle work. Prioritizes visual polish, subject clarity, and
            commercial intent.
          </p>
        </div>
      </div>
    </div>

    <!-- Professional Profiles Block -->
    <div class="style-block">
      <div class="section-head">
        <h3 class="section-title">Advanced Profiles</h3>
        <p class="section-subtitle">
          For dedicated photographers with a clear style focus
        </p>
      </div>
      <div class="advanced-grid">
        <div
          class="opt-card advanced-card"
          :class="{
            selected: selectedProfiles.includes('street-photography'),
            disabled:
              selectedProfiles.includes('commercial') ||
              (selectedProfiles.length >= 2 &&
                !selectedProfiles.includes('street-photography') &&
                !selectedProfiles.includes('general')),
          }"
          :style="{ '--accent': '#2563eb' }"
          @click="toggleProfile('street-photography')"
        >
          <span class="opt-check">
            <n-icon size="12"><CheckmarkOutline /></n-icon>
          </span>
          <div class="opt-icon">
            <n-icon size="20"><WalkOutline /></n-icon>
          </div>
          <h4 class="opt-title">Street Photography</h4>
          <p class="opt-desc">
            Candid moments and decisive timing — the unscripted poetry of
            everyday life as it unfolds in the streets.
          </p>
        </div>

        <div
          class="opt-card advanced-card"
          :class="{
            selected: selectedProfiles.includes('documentary'),
            disabled:
              selectedProfiles.includes('commercial') ||
              (selectedProfiles.length >= 2 &&
                !selectedProfiles.includes('documentary') &&
                !selectedProfiles.includes('general')),
          }"
          :style="{ '--accent': '#06b6d4' }"
          @click="toggleProfile('documentary')"
        >
          <span class="opt-check">
            <n-icon size="12"><CheckmarkOutline /></n-icon>
          </span>
          <div class="opt-icon">
            <n-icon size="20"><BookOpen16Regular /></n-icon>
          </div>
          <h4 class="opt-title">Documentary Photography</h4>
          <p class="opt-desc">
            Narrative-driven images that document real people, places and events
            with honesty and lasting context.
          </p>
        </div>

        <div
          class="opt-card advanced-card"
          :class="{
            selected: selectedProfiles.includes('artistic'),
            disabled:
              selectedProfiles.includes('commercial') ||
              (selectedProfiles.length >= 2 &&
                !selectedProfiles.includes('artistic') &&
                !selectedProfiles.includes('general')),
          }"
          :style="{ '--accent': '#ec4899' }"
          @click="toggleProfile('artistic')"
        >
          <span class="opt-check">
            <n-icon size="12"><CheckmarkOutline /></n-icon>
          </span>
          <div class="opt-icon">
            <n-icon size="20"><PaletteOutlined /></n-icon>
          </div>
          <h4 class="opt-title">Artistic Photography</h4>
          <p class="opt-desc">
            Expressive, experimental work where concept, light and composition
            come together as visual fine art.
          </p>
        </div>
      </div>

      <!-- Explanatory text based on selection -->
      <transition name="fade" mode="out-in">
        <div v-if="currentExplanation" class="explanation-box">
          <div class="explanation-icon">
            <n-icon size="18"><CheckmarkCircleOutline /></n-icon>
          </div>
          <div class="explanation-content">
            <h5>{{ currentExplanation.title }}</h5>
            <p>{{ currentExplanation.description }}</p>
            <ul class="explanation-list">
              <li
                v-for="(point, index) in currentExplanation.points"
                :key="index"
              >
                {{ point }}
              </li>
            </ul>
          </div>
        </div>
      </transition>

      <p
        class="selection-hint"
        v-if="
          !selectedProfiles.includes('general') &&
          !selectedProfiles.includes('commercial')
        "
      >
        Choose up to 2 styles that best represent your work
      </p>
    </div>

    <!-- Step 2 Actions -->
    <div class="profile-actions">
      <n-button size="large" @click="handleBack" class="back-button" quaternary>
        <template #icon>
          <n-icon><ArrowBackOutline /></n-icon>
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
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import {
  CameraOutline,
  CheckmarkCircleOutline,
  CheckmarkOutline,
  ArrowBackOutline,
  WalkOutline,
  BriefcaseOutline,
} from "@vicons/ionicons5";
import { BookOpen16Regular } from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";
import { InfoCircleFilled } from "@vicons/antd";
import AppLogo from "@/components/AppLogo.vue";
import { useIsMobile } from "@/composables/useIsMobile.js";

const { isMobile } = useIsMobile();

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
  "street-photography": {
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
  "artistic|documentary": {
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
  "artistic|street-photography": {
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
  "documentary|street-photography": {
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
      : professionalProfiles.join("|");

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

const toggleCommercial = () => {
  // Commercial is mutually exclusive with general and any advanced profile
  if (props.selectedProfiles.includes("commercial")) {
    emit("update:selectedProfiles", []);
  } else {
    emit("update:selectedProfiles", ["commercial"]);
    expandedProfile.value = null;
  }
};

const toggleProfile = (profile: string) => {
  const currentProfiles = [...props.selectedProfiles].filter(
    (p) => p !== "general" && p !== "commercial",
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
    // If general or commercial is selected, clear expanded profile
    if (newProfiles.includes("general") || newProfiles.includes("commercial")) {
      expandedProfile.value = null;
    } else {
      // If a professional profile is selected and there's no expanded profile, expand the first one
      const professionalProfiles = newProfiles.filter(
        (p) => p !== "general" && p !== "commercial",
      );
      if (professionalProfiles.length > 0 && !expandedProfile.value) {
        expandedProfile.value = professionalProfiles[0];
      }
    }
  },
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
  max-width: 860px;
  margin: 0 auto;
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

/* Header */
.profile-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  margin-bottom: 28px;
}

.header-logo {
  flex-shrink: 0;
}

.header-text {
  text-align: left;
}

.profile-title {
  margin: 0 0 2px 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.profile-subtitle {
  margin: 0;
  font-size: 15px;
  color: var(--text-secondary);
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.subtitle-info-icon {
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s ease;
}

.subtitle-info-icon:hover {
  color: var(--primary-color);
}

/* Blocks */
.style-block {
  margin-bottom: 24px;
}

.style-block:last-of-type {
  margin-bottom: 0;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 14px;
}

.section-head::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.section-subtitle {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  font-weight: 400;
  white-space: nowrap;
}

.selection-hint {
  margin: 16px 0 0 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
  text-align: center;
}

/* ===== Shared option card ===== */
.opt-card {
  --accent: var(--primary-color);
  position: relative;
  background-color: var(--bg-card);
  border: 1.5px solid var(--border-color);
  border-radius: 14px;
  cursor: pointer;
  transition:
    border-color 0.25s ease,
    box-shadow 0.25s ease,
    background-color 0.25s ease;
}

.opt-card:hover:not(.disabled) {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border-color));
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.14);
}

.opt-card.selected {
  border-color: var(--accent);
  background-color: color-mix(in srgb, var(--accent) 8%, var(--bg-card));
  box-shadow:
    inset 0 0 0 1px var(--accent),
    0 8px 26px color-mix(in srgb, var(--accent) 26%, transparent);
}

.opt-card.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.opt-icon {
  color: var(--accent);
  background-color: color-mix(in srgb, var(--accent) 14%, transparent);
  border-radius: 11px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.25s ease;
}

.opt-card.selected .opt-icon {
  background-color: color-mix(in srgb, var(--accent) 22%, transparent);
}

.opt-check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.opt-card.selected .opt-check {
  opacity: 1;
  transform: scale(1);
}

.opt-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
}

.opt-desc {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ===== Primary cards ===== */
.primary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.primary-card {
  padding: 18px 20px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 14px;
  row-gap: 12px;
}

.primary-card .opt-icon {
  grid-row: 1;
  grid-column: 1;
}

.primary-card .opt-head {
  grid-row: 1;
  grid-column: 2;
}

.primary-card .opt-desc {
  grid-column: 1 / -1;
}

.opt-head {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.opt-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--accent);
  background-color: color-mix(in srgb, var(--accent) 15%, transparent);
}

/* ===== Advanced cards ===== */
.advanced-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

.advanced-card {
  padding: 15px 16px 16px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 12px;
  row-gap: 9px;
}

.advanced-card .opt-icon {
  width: 40px;
  height: 40px;
  grid-row: 1;
  grid-column: 1;
}

.advanced-card .opt-title {
  grid-row: 1;
  grid-column: 2;
  font-size: 14.5px;
  white-space: nowrap;
}

.advanced-card .opt-desc {
  grid-column: 1 / -1;
  font-size: 12px;
  line-height: 1.55;
}

/* ===== Explanation ===== */
.explanation-box {
  margin-top: 16px;
  background-color: color-mix(in srgb, var(--primary-color) 6%, var(--bg-card));
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--primary-color);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  gap: 14px;
}

.explanation-icon {
  flex-shrink: 0;
  color: var(--primary-color);
  margin-top: 1px;
}

.explanation-content h5 {
  margin: 0 0 6px 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.explanation-content p {
  margin: 0 0 10px 0;
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.explanation-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 18px;
}

.explanation-list li {
  position: relative;
  font-size: 12px;
  color: var(--text-secondary);
  padding-left: 18px;
  line-height: 1.4;
}

.explanation-list li::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--primary-color);
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* Actions */
.profile-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.back-button {
  height: 42px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  padding: 0 20px;
}

.complete-button {
  min-width: 180px;
  height: 42px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
}

/* Responsive */
@media (max-width: 880px) {
  .advanced-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .profile-header {
    gap: 12px;
    margin-bottom: 24px;
  }

  .profile-title {
    font-size: 22px;
  }

  .profile-subtitle {
    font-size: 14px;
  }

  .primary-grid {
    grid-template-columns: 1fr;
  }

  .advanced-grid {
    grid-template-columns: 1fr;
  }

  .section-subtitle {
    display: none;
  }

  .explanation-list {
    grid-template-columns: 1fr;
  }

  .profile-actions {
    flex-direction: column-reverse;
  }

  .back-button,
  .complete-button {
    width: 100%;
  }
}
</style>
