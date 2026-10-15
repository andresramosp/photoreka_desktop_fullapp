<template>
  <div class="step-content">
    <div class="profile-header">
      <AppLogo layout="icon" :height="isMobile ? 44 : 52" class="header-logo" />
      <div class="header-text">
        <h1 class="profile-title">How will you import your photos?</h1>
        <p class="profile-subtitle">
          Choose your primary workflow for importing photos into Photoreka
        </p>
      </div>
    </div>

    <div class="mode-selection">
      <div class="modes-grid">
        <!-- Web Mode Card -->
        <div
          class="opt-card mode-card"
          :class="{ selected: selectedMode === 'web' }"
          :style="{ '--accent': '#2563eb' }"
          @click="selectMode('web')"
        >
          <span class="opt-check">
            <n-icon size="14"><CheckmarkOutline /></n-icon>
          </span>
          <div class="mode-logo">
            <AppLogo layout="icon" :height="42" />
          </div>
          <div class="mode-text">
            <div class="mode-title-row">
              <h4 class="opt-title">Photoreka Web</h4>
              <span class="opt-badge recommended">For most users</span>
            </div>
            <p class="opt-desc">Import photos through the web interface</p>
          </div>
        </div>

        <!-- Lightroom Mode Card -->
        <div
          class="opt-card mode-card"
          :class="{ selected: selectedMode === 'lightroom' }"
          :style="{ '--accent': '#f59e0b' }"
          @click="selectMode('lightroom')"
        >
          <span class="opt-check">
            <n-icon size="14"><CheckmarkOutline /></n-icon>
          </span>
          <div class="mode-logo">
            <img
              src="/src/assets/logos/lightroom_logo.png"
              alt="Adobe Lightroom"
              class="lightroom-logo"
            />
          </div>
          <div class="mode-text">
            <div class="mode-title-row">
              <h4 class="opt-title">Photoreka + Lightroom Classic</h4>
              <span class="opt-badge advanced">Lightroom-first</span>
            </div>
            <p class="opt-desc">Sync photos from Adobe Lightroom Classic</p>
          </div>
        </div>
      </div>

      <!-- Explanatory text based on selection -->
      <transition name="fade" mode="out-in">
        <div v-if="selectedMode" class="mode-explanation">
          <div
            v-if="selectedMode === 'web'"
            class="explanation-box"
            :style="{ '--accent': '#22c55e' }"
          >
            <div class="explanation-icon">
              <n-icon size="18"><CheckmarkCircleOutline /></n-icon>
            </div>
            <div class="explanation-content">
              <h5>Web-first Workflow</h5>
              <p>
                Your main photo import flow will be through the
                <strong>Photoreka web interface</strong>. Upload photos from
                multiple sources with ease.
              </p>
              <ul class="explanation-list">
                <li>Import from your computer (drag &amp; drop or browse)</li>
                <template v-if="CLOUD_IMPORT_SOURCES_ENABLED">
                  <li>Connect Google Photos and sync automatically</li>
                  <li>Import directly from Dropbox</li>
                </template>
                <li>Works from any device with a browser</li>
                <li>Lightroom plugin available as optional secondary source</li>
              </ul>
            </div>
          </div>

          <div
            v-if="selectedMode === 'lightroom'"
            class="explanation-box"
            :style="{ '--accent': '#f59e0b' }"
          >
            <div class="explanation-icon">
              <n-icon size="18"><InformationCircleOutline /></n-icon>
            </div>
            <div class="explanation-content">
              <h5>Lightroom-first Workflow</h5>
              <p>
                Your photo imports must
                <strong>always be done from our Lightroom Plugin</strong> to
                maintain synchronization between your catalog and Photoreka.
              </p>
              <ul class="explanation-list">
                <li>Full access to all Photoreka web tools and features</li>
                <li>Search tool integrated directly into Lightroom</li>
                <li>
                  Perfect for photographers who organize everything in Lightroom
                </li>
              </ul>
              <!-- <p class="warning-note">
                <strong>Note:</strong> If you upload photos directly through the
                web, they will be analyzed but won't appear in your Lightroom
                catalog, which may cause workflow inconsistencies.
              </p> -->
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Step 1 Actions -->
    <WizardActions :show-back="false">
      <n-button
        type="primary"
        size="large"
        :disabled="!selectedMode"
        @click="handleNext"
      >
        Continue
        <template #icon>
          <n-icon>
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M8.59 16.59L13.17 12L8.59 7.41L10 6l6 6l-6 6l-1.41-1.41z"
              />
            </svg>
          </n-icon>
        </template>
      </n-button>
    </WizardActions>
  </div>
</template>

<script setup lang="ts">
import {
  InformationCircleOutline,
  CheckmarkOutline,
  CheckmarkCircleOutline,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import WizardActions from "./WizardActions.vue";
import { useIsMobile } from "@/composables/useIsMobile.js";
import { CLOUD_IMPORT_SOURCES_ENABLED } from "@/config/uploadConfig.js";

const { isMobile } = useIsMobile();

interface Props {
  selectedMode: "web" | "lightroom" | null;
}

interface Emits {
  (e: "update:selectedMode", value: "web" | "lightroom"): void;
  (e: "next"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const selectMode = (mode: "web" | "lightroom") => {
  emit("update:selectedMode", mode);
};

const handleNext = () => {
  emit("next");
};
</script>

<style scoped>
.step-content {
  animation: fadeIn 0.3s ease;
  max-width: 720px;
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
}

/* Mode Selection */
.modes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 18px;
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

.opt-card:hover {
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

/* Mode card layout */
.mode-card {
  padding: 16px 18px;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 14px;
  row-gap: 10px;
}

.mode-logo {
  grid-row: 1;
  grid-column: 1;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 11px;
  background-color: color-mix(in srgb, var(--text-primary) 5%, transparent);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightroom-logo {
  height: 30px;
  width: auto;
  object-fit: contain;
}

/* Children participate directly in the card grid so the description spans full width */
.mode-text {
  display: contents;
}

.mode-title-row {
  grid-row: 1;
  grid-column: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.mode-text .opt-desc {
  grid-column: 1 / -1;
}

.opt-badge {
  font-size: 9.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  white-space: nowrap;
}

.opt-badge.recommended {
  background-color: rgba(34, 197, 94, 0.16);
  color: #22c55e;
}

.opt-badge.advanced {
  background-color: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
}

/* Mode Explanation */
.mode-explanation {
  margin-top: 4px;
}

.explanation-box {
  --accent: var(--primary-color);
  background-color: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
  border: 1px solid var(--border-color);
  border-left: 3px solid var(--accent);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  gap: 14px;
}

.explanation-icon {
  flex-shrink: 0;
  color: var(--accent);
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
  background-color: var(--accent);
}

.warning-note {
  margin: 12px 0 0 0 !important;
  background-color: color-mix(in srgb, var(--accent) 10%, transparent);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 11.5px;
  color: var(--text-secondary) !important;
  line-height: 1.5;
}

.warning-note strong {
  color: var(--accent);
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

/* Responsive */
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

  .modes-grid {
    grid-template-columns: 1fr;
  }

  .explanation-list {
    grid-template-columns: 1fr;
  }
}
</style>
