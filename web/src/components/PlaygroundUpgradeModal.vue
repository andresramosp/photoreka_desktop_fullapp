<template>
  <n-modal
    v-model:show="show"
    preset="dialog"
    title="What You're Missing"
    style="width: 1200px"
  >
    <template #header>
      <div class="modal-header">
        <h2>Unlock the Full Power of Photo Discovery</h2>
      </div>
    </template>

    <div class="modal-content">
      <div class="video-container">
        <video
          ref="videoRef"
          autoplay
          muted
          loop
          playsinline
          class="demo-video"
        >
          <source src="/src/assets/videos/canvas_1.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>

      <div class="features-list">
        <h3>With a full account, you can:</h3>
        <ul>
          <li>🔍 Expand photos by similarity search</li>
          <li>🎨 Find photos by color, composition, and style</li>
          <li>🏷️ Search by tags and visual elements</li>
          <li>💾 Save your work and create collections</li>
          <li>📁 Access your entire photo library</li>
        </ul>
      </div>
    </div>

    <template #action>
      <div class="modal-actions">
        <n-button @click="closeModal" quaternary> Continue Playing </n-button>
        <n-button type="primary" @click="signUp"> Request Access </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { NModal, NButton } from "naive-ui";
import { useRouter } from "vue-router";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["update:modelValue"]);

const router = useRouter();
const videoRef = ref(null);

const show = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const closeModal = () => {
  show.value = false;
};

const signUp = () => {
  router.push("/");
};

// Restart video when modal opens
watch(show, (newValue) => {
  if (newValue && videoRef.value) {
    videoRef.value.currentTime = 0;
    videoRef.value.play();
  }
});
</script>

<style scoped>
.modal-header h2 {
  color: var(--text-primary);
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.modal-content {
  display: flex;
  flex-direction: row;
  gap: 1.5rem;
}

.video-container {
  flex: 2;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-surface);
}

.demo-video {
  width: 100%;
  height: 350px;
  object-fit: cover;
}

.features-list {
  flex: 1;
}

.features-list h3 {
  color: var(--text-primary);
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  font-weight: 500;
}

.features-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.features-list li {
  color: var(--text-secondary);
  padding: 0.25rem 0;
  font-size: 0.95rem;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

@media (max-width: 480px) {
  .modal-content {
    flex-direction: column;
  }

  .demo-video {
    height: 200px;
  }

  .modal-actions {
    flex-direction: column;
  }
}
</style>
