<template>
  <div class="step-content">
    <div class="profile-header">
      <AppLogo
        layout="icon"
        :height="isMobile ? 52 : 64"
        class="header-logo"
      />
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
          class="mode-card"
          :class="{ selected: selectedMode === 'web' }"
          @click="selectMode('web')"
        >
          <div class="mode-icon app-icon">
            <AppLogo layout="icon" :height="60" />
          </div>
          <h4 class="mode-title">Photoreka Web</h4>
          <p class="mode-description">
            Import photos through the web interface
          </p>
          <div class="mode-badge recommended">For most users</div>
        </div>

        <!-- Lightroom Mode Card -->
        <div
          class="mode-card"
          :class="{ selected: selectedMode === 'lightroom' }"
          @click="selectMode('lightroom')"
        >
          <div class="mode-icon lightroom-icon">
            <img
              src="/src/assets/logos/lightroom_logo.png"
              alt="Adobe Lightroom"
              class="lightroom-logo"
            />
          </div>
          <h4 class="mode-title">Photoreka + Lightroom</h4>
          <p class="mode-description">
            Sync photos from Adobe Lightroom Classic
          </p>
          <div class="mode-badge advanced">For Lightroom-first users</div>
        </div>
      </div>

      <!-- Explanatory text based on selection -->
      <transition name="fade" mode="out-in">
        <div v-if="selectedMode" class="mode-explanation">
          <div v-if="selectedMode === 'web'" class="explanation-box web">
            <div class="explanation-icon">
              <n-icon size="24" color="#22c55e">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5l1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
                  />
                </svg>
              </n-icon>
            </div>
            <div class="explanation-content">
              <h5>Web-first Workflow</h5>
              <p>
                Your main photo import flow will be through the
                <strong>Photoreka web interface</strong>. Upload photos from
                multiple sources with ease.
              </p>
              <ul class="explanation-list">
                <li>✓ Import from your computer (drag & drop or browse)</li>
                <li>✓ Connect Google Photos and sync automatically</li>
                <li>✓ Import directly from Dropbox</li>
                <li>✓ Works from any device with a browser</li>
                <li>
                  ✓ Lightroom plugin available as optional secondary source
                </li>
              </ul>
            </div>
          </div>

          <div
            v-if="selectedMode === 'lightroom'"
            class="explanation-box lightroom"
          >
            <div class="explanation-icon">
              <n-icon size="24" color="#f59e0b">
                <InformationCircleOutline />
              </n-icon>
            </div>
            <div class="explanation-content">
              <h5>Lightroom-first Workflow</h5>
              <p>
                Your photo imports must
                <strong>always be done from our Lightroom Plugin</strong> to
                maintain synchronization between your catalog and Photoreka.
              </p>
              <ul class="explanation-list warning">
                <!-- <li>
                  ⚠️ All imports must come from Lightroom to avoid
                  inconsistencies
                </li> -->

                <li>✓ Full access to all Photoreka web tools and features</li>
                <li>✓ Search tool integrated directly into Lightroom</li>
                <li>
                  ✓ Perfect for photographers who organize everything in
                  Lightroom
                </li>
              </ul>
              <p class="warning-note">
                <strong>Note:</strong> If you upload photos directly through the
                web, they will be analyzed but won't appear in your Lightroom
                catalog, which may cause workflow inconsistencies.
              </p>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <!-- Step 1 Actions -->
    <div class="profile-actions">
      <n-button
        type="primary"
        size="large"
        :disabled="!selectedMode"
        @click="handleNext"
        class="next-button"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { InformationCircleOutline } from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import { useIsMobile } from "@/composables/useIsMobile.js";

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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 32px;
}

.header-logo {
  flex-shrink: 0;
}

.header-text {
  text-align: left;
}

.profile-title {
  margin: 0 0 2px 0;
  font-size: 32px;
  font-weight: 700;
  color: var(--text-secondary);
  letter-spacing: -0.025em;
}

.profile-subtitle {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 400;
}

/* Mode Selection */
.mode-selection {
  margin-bottom: 32px;
}

.modes-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  max-width: 700px;
  margin: 0 auto 32px;
}

.mode-card {
  background-color: #2c2c32;
  border: 2px solid #3c3c42;
  border-radius: 16px;
  padding: 20px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mode-card:hover {
  border-color: #4c4c52;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.mode-card.selected {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.mode-icon {
  margin-bottom: 8px;
  color: var(--text-secondary);
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mode-card.selected .mode-icon {
  color: #2563eb;
}

.app-icon {
  padding: 8px;
}

.app-logo {
  height: 80px;
  width: auto;
  object-fit: contain;
  filter: brightness(0.9);
  transition: filter 0.3s ease;
}

.mode-card.selected .app-logo {
  filter: brightness(1.2);
}

.lightroom-icon {
  padding: 8px;
}

.lightroom-logo {
  height: 65px;
  width: auto;
  object-fit: contain;
  filter: brightness(0.9);
  transition: filter 0.3s ease;
}

.mode-card.selected .lightroom-logo {
  filter: brightness(1.1);
}

.mode-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
}

.mode-description {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

.mode-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mode-badge.recommended {
  background-color: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.mode-badge.advanced {
  background-color: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

/* Mode Explanation */
.mode-explanation {
  max-width: 700px;
  margin: 0 auto;
}

.explanation-box {
  background-color: rgba(44, 44, 50, 0.5);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  gap: 16px;
  border-left: 4px solid;
}

.explanation-box.web {
  border-left-color: #22c55e;
}

.explanation-box.lightroom {
  border-left-color: #f59e0b;
}

.explanation-icon {
  flex-shrink: 0;
  margin-top: 2px;
}

.explanation-content h5 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
}

.explanation-content p {
  margin: 0 0 16px 0;
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.6;
}

.explanation-list {
  list-style: none;
  padding: 0;
  margin: 0 0 16px 0;
}

.explanation-list li {
  font-size: 12px;
  color: var(--text-primary);
  margin-bottom: 8px;
  padding-left: 4px;
}

.explanation-list.warning li {
  color: var(--text-primary);
}

.warning-note {
  background-color: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  padding: 12px;
  font-size: 11px;
  color: #f59e0b;
  margin: 0;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Actions */
.profile-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 32px;
}

.next-button {
  min-width: 180px;
  height: 44px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
}

/* Responsive design */
@media (max-width: 768px) {
  .profile-header {
    gap: 12px;
  }

  .profile-title {
    font-size: 24px;
  }

  .modes-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .mode-card {
    padding: 24px 20px;
  }

  .explanation-box {
    flex-direction: column;
    gap: 12px;
  }

  .next-button {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .profile-title {
    font-size: 22px;
  }

  .mode-title {
    font-size: 16px;
  }

  .lightroom-logo {
    height: 40px;
  }
}
</style>
