<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :style="{ maxWidth: '90vw', width: '700px', maxHeight: '90vh' }"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    :auto-focus="false"
    class="onboarding-modal"
  >
    <template #header>
      <div class="onboarding-header">
        <h2 class="onboarding-title">Welcome to Photoreka</h2>
        <p class="onboarding-subtitle">
          Let's get you started with your photo discovery journey
        </p>
      </div>
    </template>

    <div class="onboarding-content">
      <!-- Slide Content -->
      <div class="slide-container">
        <transition name="slide" mode="out-in">
          <div :key="currentSlide" class="slide">
            <!-- Slide 1: Add your photos -->
            <div v-if="currentSlide === 0" class="slide-content">
              <div class="slide-image">
                <img
                  src="/src/assets/onBoarding/slide_1.png"
                  alt="Photo upload interface"
                  class="onboarding-image"
                />
              </div>
              <div class="slide-text">
                <h3 class="slide-title">Continue building your Workspace</h3>
                <p class="slide-description">
                  You've completed your first batch of images. We encourage you
                  to continue uploading photos to get the most out of the app.
                  You can bring your images from different platforms (Google
                  Photos, Drive, etc.) or from your local directory.
                </p>
              </div>
            </div>

            <!-- Slide 2: Use your preprocessed photos -->
            <!-- <div v-if="currentSlide === 1" class="slide-content">
              <div class="slide-image">
                <img
                  src="/src/assets/onBoarding/slide_2.png"
                  alt="Photo editing interface"
                  class="onboarding-image"
                />
              </div>
              <div class="slide-text">
                <h3 class="slide-title">2. Preview in Lightbox</h3>
                <p class="slide-description">
                  The Lightbox is where you import and review your photos prior
                  to analysis. You can import them in batches, at your own pace,
                  or all at once. The photos in Lightbox are pre-processed and
                  can be used in some tools with limitations.
                </p>
              </div>
            </div> -->

            <!-- Slide 3: Unleash your catalog's potential -->
            <div v-if="currentSlide === 1" class="slide-content">
              <div class="slide-image">
                <img
                  src="/src/assets/onBoarding/slide_3.png"
                  alt="AI photo organization interface"
                  class="onboarding-image"
                />
              </div>
              <div class="slide-text">
                <h3 class="slide-title">Experiment with the tools</h3>
                <p class="slide-description">
                  We now invite you to try out the different tools. The photos
                  you already have in the Workspace are available for natural
                  language exploration, advanced canvas features, photo relation
                  search, style ranking, and much more...
                </p>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- Navigation Dots -->
      <div class="navigation-dots">
        <button
          v-for="(slide, index) in slides"
          :key="index"
          :class="['dot', { active: currentSlide === index }]"
          @click="goToSlide(index)"
        />
      </div>

      <!-- Navigation Buttons -->
      <div class="navigation-buttons">
        <n-button
          v-if="currentSlide > 0"
          quaternary
          size="large"
          @click="previousSlide"
          class="nav-button"
        >
          Previous
        </n-button>
        <div v-else></div>

        <n-button
          v-if="currentSlide < slides.length - 1"
          type="primary"
          size="large"
          @click="nextSlide"
          class="nav-button"
        >
          Next
        </n-button>
        <n-button
          v-else
          type="primary"
          size="large"
          @click="finish"
          class="nav-button"
        >
          Get Started
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed } from "vue";
import { NModal, NButton } from "naive-ui";
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue", "finish"]);

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const currentSlide = ref(0);

const slides = [
  { id: "add-photos" },
  // { id: "preprocessed" },
  { id: "ai-potential" },
];

const nextSlide = () => {
  if (currentSlide.value < slides.length - 1) {
    currentSlide.value++;
  }
};

const previousSlide = () => {
  if (currentSlide.value > 0) {
    currentSlide.value--;
  }
};

const goToSlide = (index) => {
  currentSlide.value = index;
};

const finish = () => {
  emit("finish");
  visible.value = false;
};
</script>

<style scoped>
.onboarding-modal {
  backdrop-filter: blur(8px);
}

.onboarding-header {
  text-align: center;
}

.onboarding-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-sm) 0;
  background: linear-gradient(
    135deg,
    var(--primary-color),
    var(--accent-color)
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.onboarding-subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 0;
}

.onboarding-content {
  min-height: 500px;
  display: flex;
  flex-direction: column;
}

.slide-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.slide {
  width: 100%;
  height: 100%;
}

.slide-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2xl);
  text-align: center;
}

.slide-image {
  /* width: 100%; */
  max-width: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.onboarding-image {
  width: 100%;
  height: 300px;
  object-fit: contain;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-color);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  background: #fff;
}

.slide-text {
  max-width: 500px;
}

.slide-title {
  font-size: 20px;
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-lg) 0;
}

.slide-description {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  margin: 0;
}

.navigation-dots {
  display: flex;
  justify-content: center;
  gap: var(--spacing-sm);
  margin: var(--spacing-2xl) 0;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-round);
  border: none;
  background: var(--text-tertiary);
  cursor: pointer;
  transition: var(--transition-fast);
}

.dot.active {
  background: var(--primary-color);
  transform: scale(1.2);
}

.dot:hover {
  background: var(--text-secondary);
}

.dot.active:hover {
  background: var(--primary-color-hover);
}

.navigation-buttons {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-lg);
}

.nav-button {
  min-width: 120px;
}

/* Slide Transitions */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* Responsive Design */
@media (max-width: 768px) {
  .onboarding-title {
    font-size: var(--font-size-2xl);
  }

  .slide-content {
    gap: var(--spacing-lg);
  }

  .slide-image {
    max-width: 400px;
  }

  .slide-title {
    font-size: var(--font-size-xl);
  }

  .slide-description {
    font-size: var(--font-size-base);
  }

  .onboarding-image {
    height: 250px;
    object-fit: contain;
  }

  .navigation-buttons {
    flex-direction: column-reverse;
    gap: var(--spacing-md);
  }

  .nav-button {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .onboarding-image {
    height: 200px;
    object-fit: contain;
  }
}
</style>
