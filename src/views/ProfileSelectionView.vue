<template>
  <ProfileLayout>
    <div class="profile-selection-content">
      <!-- Step Indicator -->
      <div class="step-indicator">
        <div
          class="step"
          :class="{ active: currentStep === 1, completed: currentStep > 1 }"
        >
          <div class="step-circle">1</div>
          <span class="step-label">Import Mode</span>
        </div>
        <div class="step-line" :class="{ completed: currentStep > 1 }"></div>
        <div class="step" :class="{ active: currentStep === 2 }">
          <div class="step-circle">2</div>
          <span class="step-label">Style Profile</span>
        </div>
      </div>

      <!-- Step 1: App Mode Selection -->
      <div v-if="currentStep === 1" class="step-content">
        <div class="profile-header">
          <h1 class="profile-title">How will you import your photos?</h1>
          <p class="profile-subtitle">
            Choose your primary workflow for importing photos into Photoreka
          </p>
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
                <img
                  src="/src/assets/logos/logo_imago_white.png"
                  alt="Photoreka Web"
                  class="app-logo"
                />
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
                  src="/src/assets/onBoarding/lightroom_logo.png"
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

                    <li>
                      ✓ Full access to all Photoreka web tools and features
                    </li>
                    <li>✓ Search tool integrated directly into Lightroom</li>
                    <li>
                      ✓ Perfect for photographers who organize everything in
                      Lightroom
                    </li>
                  </ul>
                  <p class="warning-note">
                    <strong>Note:</strong> If you upload photos directly through
                    the web, they will be analyzed but won't appear in your
                    Lightroom catalog, which may cause workflow inconsistencies.
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
            @click="nextStep"
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

      <!-- Step 2: Profile Selection -->
      <div v-if="currentStep === 2" class="step-content">
        <div class="profile-header">
          <h1 class="profile-title">What is your preferred style?</h1>
          <p class="profile-subtitle">
            Help us customize your Photoreka experience
          </p>
        </div>

        <div class="main-categories">
          <h3 class="section-title">Choose up to 2 main styles</h3>
          <div class="categories-grid">
            <div
              class="category-card"
              :class="{
                selected: selectedProfiles.includes('street'),
                disabled:
                  selectedProfiles.length >= 2 &&
                  !selectedProfiles.includes('street'),
              }"
              @click="toggleProfile('street')"
            >
              <div class="category-icon">
                <n-icon size="32">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M14.12 4L12 2L9.88 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-5.88zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5s5 2.24 5 5s-2.24 5-5 5zm0-8c-1.65 0-3 1.35-3 3s1.35 3 3 3s3-1.35 3-3s-1.35-3-3-3z"
                    />
                  </svg>
                </n-icon>
              </div>
              <h4 class="category-title">Street Photography</h4>
              <p class="category-description">
                Capture life as it happens in urban environments
              </p>
            </div>

            <div
              class="category-card"
              :class="{
                selected: selectedProfiles.includes('documentary'),
                disabled:
                  selectedProfiles.length >= 2 &&
                  !selectedProfiles.includes('documentary'),
              }"
              @click="toggleProfile('documentary')"
            >
              <div class="category-icon">
                <n-icon size="32">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
                    />
                  </svg>
                </n-icon>
              </div>
              <h4 class="category-title">Documentary Photography</h4>
              <p class="category-description">
                Tell stories and document real-world events
              </p>
            </div>

            <div
              class="category-card"
              :class="{
                selected: selectedProfiles.includes('artistic'),
                disabled:
                  selectedProfiles.length >= 2 &&
                  !selectedProfiles.includes('artistic'),
              }"
              @click="toggleProfile('artistic')"
            >
              <div class="category-icon">
                <n-icon size="32">
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22L12 18.77L5.82 22L7 14.14l-5-4.87l6.91-1.01L12 2z"
                    />
                  </svg>
                </n-icon>
              </div>
              <h4 class="category-title">Artistic Photography</h4>
              <p class="category-description">
                Create expressive and creative visual art
              </p>
            </div>
          </div>
        </div>

        <!-- Step 2 Actions -->
        <div class="profile-actions">
          <div class="action-buttons">
            <n-button size="large" @click="previousStep" class="back-button">
              <template #icon>
                <n-icon>
                  <svg viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6l6 6l1.41-1.41z"
                    />
                  </svg>
                </n-icon>
              </template>
              Back
            </n-button>
            <n-button
              type="primary"
              size="large"
              :disabled="selectedProfiles.length === 0"
              @click="completeProfile"
              class="complete-button"
            >
              Complete Setup
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </ProfileLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import { InformationCircleOutline } from "@vicons/ionicons5";
import ProfileLayout from "../components/ProfileLayout.vue";
import { useUserStore } from "../stores/userStore";

const router = useRouter();
const message = useMessage();
const userStore = useUserStore();

// Step management
const currentStep = ref(1);

// Step 1: App mode selection
const selectedMode = ref<"web" | "lightroom" | null>(null);

// Step 2: Profile selection
const selectedProfiles = ref<string[]>([]);

// Computed payload for register
const profilePayload = computed(() => ({
  preferredSource: selectedMode.value,
  profiles: selectedProfiles.value,
}));

const selectMode = (mode: "web" | "lightroom") => {
  selectedMode.value = mode;
};

const toggleProfile = (profile: string) => {
  const index = selectedProfiles.value.indexOf(profile);

  if (index > -1) {
    selectedProfiles.value.splice(index, 1);
  } else {
    if (selectedProfiles.value.length < 2) {
      selectedProfiles.value.push(profile);
    }
  }
};

const nextStep = () => {
  if (currentStep.value < 2) {
    currentStep.value++;
  }
};

const previousStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
  }
};

const completeProfile = async () => {
  try {
    const result = await userStore.updateProfile(profilePayload.value);

    if (result.success) {
      message.success(
        "Profile preferences saved! Now let's set up your storage and plan."
      );
      router.push({ name: "photo-hub", hash: "#upload" });
    } else {
      message.error(result.error || "Error saving profile preferences.");
    }
  } catch (error) {
    console.error("Error updating profile:", error);
    message.error("An unexpected error occurred. Please try again.");
  }
};
</script>

<style scoped>
.profile-selection-content {
  width: 100%;
  margin: 0 auto;
}

/* Step Indicator */
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32px;
  gap: 8px;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.5;
  transition: opacity 0.3s ease;
}

.step.active,
.step.completed {
  opacity: 1;
}

.step-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: #3c3c42;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  color: #ffffff73;
  transition: all 0.3s ease;
}

.step.active .step-circle {
  background-color: #2563eb;
  color: #fff;
}

.step.completed .step-circle {
  background-color: #22c55e;
  color: #fff;
}

.step-label {
  font-size: 13px;
  color: #ffffff73;
  font-weight: 500;
}

.step.active .step-label {
  color: #ffffffd1;
}

.step-line {
  width: 80px;
  height: 2px;
  background-color: #3c3c42;
  margin-bottom: 24px;
  transition: background-color 0.3s ease;
}

.step-line.completed {
  background-color: #22c55e;
}

/* Step Content */
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

.section-title {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: #ffffffd1;
  text-align: center;
}

/* Mode Selection - Step 1 */
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
  color: #ffffffd1;
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
  color: #ffffffd1;
}

.mode-description {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: #ffffff73;
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

.explanation-list.warning li {
  color: #ffffff99;
}

.warning-note {
  background-color: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  padding: 12px;
  font-size: 13px;
  color: #f59e0b;
  margin: 0;
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Main Categories - Step 2 */
.main-categories {
  margin-bottom: 40px;
}

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
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.category-card:hover:not(.disabled) {
  border-color: #2563eb;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.2);
}

.category-card.selected {
  border-color: #2563eb;
  background-color: rgba(37, 99, 235, 0.1);
  box-shadow: 0 4px 16px rgba(37, 99, 235, 0.3);
}

.category-card.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.category-icon {
  margin-bottom: 12px;
  color: #ffffffd1;
}

.category-card.selected .category-icon {
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

/* Actions */
.profile-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 32px;
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

.next-button,
.complete-button {
  min-width: 180px;
  height: 44px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
}

.skip-button {
  font-size: 14px;
  color: #ffffff73;
}

/* Responsive design */
@media (max-width: 768px) {
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

  .categories-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .category-card {
    min-height: 120px;
    padding: 20px;
  }

  .step-indicator {
    gap: 4px;
  }

  .step-line {
    width: 40px;
  }

  .step-label {
    font-size: 11px;
  }

  .explanation-box {
    flex-direction: column;
    gap: 12px;
  }

  .action-buttons {
    flex-direction: column;
    width: 100%;
  }

  .back-button,
  .next-button,
  .complete-button {
    width: 100%;
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

  .category-title {
    font-size: 14px;
  }

  .category-description {
    font-size: 12px;
  }

  .mode-title {
    font-size: 16px;
  }

  .lightroom-logo {
    height: 40px;
  }
}
</style>
