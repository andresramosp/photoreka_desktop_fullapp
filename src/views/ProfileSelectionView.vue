<template>
  <ProfileLayout>
    <div class="profile-selection-content">
      <!-- Step Indicator -->
      <!-- <div class="step-indicator">
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
      </div> -->

      <!-- Step 1: App Mode Selection -->
      <ImportModeStep
        v-if="currentStep === 1"
        v-model:selected-mode="selectedMode"
        @next="nextStep"
      />

      <!-- Step 2: Profile Selection -->
      <StyleProfileStep
        v-if="currentStep === 2"
        v-model:selected-profiles="selectedProfiles"
        @back="previousStep"
        @complete="completeProfile"
      />
    </div>
  </ProfileLayout>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useMessage } from "naive-ui";
import ProfileLayout from "../components/ProfileLayout.vue";
import ImportModeStep from "../components/profile-selection/ImportModeStep.vue";
import StyleProfileStep from "../components/profile-selection/StyleProfileStep.vue";
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

const scrollToTop = async () => {
  await nextTick();
  // Scroll en window
  window.scrollTo({ top: 0, behavior: "smooth" });
  // Scroll en document.documentElement (Safari en iOS)
  document.documentElement.scrollTop = 0;
  // Scroll en document.body (algunos navegadores)
  document.body.scrollTop = 0;
  // Scroll en los padres si hay overflow
  const profileLayout = document.querySelector(".profile-layout");
  if (profileLayout) {
    profileLayout.scrollTop = 0;
  }
};

const nextStep = () => {
  if (currentStep.value < 2) {
    currentStep.value++;
    scrollToTop();
  }
};

const previousStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
    scrollToTop();
  }
};

const completeProfile = async () => {
  try {
    const result = await userStore.updateProfile(profilePayload.value);

    if (result.success) {
      // A fresh profile means an empty library: the chat welcomes it. On desktop
      // this route lands on the dashboard with the chat open; on mobile it is
      // the chat view itself.
      router.push({ name: "chat-lab" });
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
  color: var(--text-primary);
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
  color: var(--text-primary);
  font-weight: 500;
}

.step.active .step-label {
  color: var(--text-secondary);
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

/* Responsive design */
@media (max-width: 768px) {
  .step-indicator {
    gap: 4px;
  }

  .step-line {
    width: 40px;
  }

  .step-label {
    font-size: 11px;
  }
}
</style>
