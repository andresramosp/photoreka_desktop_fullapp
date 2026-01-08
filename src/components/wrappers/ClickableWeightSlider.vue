<template>
  <div class="clickable-weight-slider">
    <div
      class="slider-track"
      @mousedown="handleMouseDown"
      @click="handleClick"
      ref="trackRef"
      :class="{ dragging: isDragging }"
    >
      <div
        class="slider-fill"
        :style="{
          width: fillWidth + '%',
          background: fillBackground,
        }"
      ></div>
      <div class="slider-content">
        <div v-if="!hideLabel" class="label-container">
          <span class="slider-label" :style="{ color: labelColor }">
            {{ label }}
          </span>
          <span class="slider-value" :style="{ color: valueColor }">
            {{ valueDisplay }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";

const props = defineProps({
  modelValue: {
    type: Number,
    default: 0,
  },
  min: {
    type: Number,
    default: 0,
  },
  max: {
    type: Number,
    default: 1,
  },
  step: {
    type: Number,
    default: 0.1,
  },
  label: {
    type: String,
    required: true,
  },
  valueDisplay: {
    type: String,
    required: true,
  },
  color: {
    type: String,
    default: "#8b5cf6",
  },
  fillColor: {
    type: String,
    default:
      "linear-gradient(90deg, var(--primary-color), rgba(59, 130, 246, 0.4))",
  },
});

const emit = defineEmits(["update:modelValue"]);

const trackRef = ref(null);
const isDragging = ref(false);

const fillWidth = computed(() => {
  return (props.modelValue / props.max) * 100;
});

const fillBackground = computed(() => {
  return props.fillColor;
});

const labelColor = computed(() => {
  return "var(--text-secondary)";
});

const valueColor = computed(() => {
  return props.color;
});

const calculateValue = (clientX) => {
  if (!trackRef.value) return props.modelValue;

  const rect = trackRef.value.getBoundingClientRect();
  const clickX = clientX - rect.left;
  const trackWidth = rect.width;
  const percentage = Math.max(0, Math.min(1, clickX / trackWidth));

  // Calculate the new value based on the position
  let newValue = percentage * props.max;

  // Round to nearest step
  newValue = Math.round(newValue / props.step) * props.step;

  // Ensure within bounds
  newValue = Math.max(props.min, Math.min(props.max, newValue));

  return newValue;
};

const handleClick = (event) => {
  if (isDragging.value) return;

  const newValue = calculateValue(event.clientX);
  emit("update:modelValue", newValue);
};

const handleMouseDown = (event) => {
  isDragging.value = true;

  const newValue = calculateValue(event.clientX);
  emit("update:modelValue", newValue);

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  event.preventDefault();
};

const handleMouseMove = (event) => {
  if (!isDragging.value) return;

  const newValue = calculateValue(event.clientX);
  emit("update:modelValue", newValue);
};

const handleMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};

onUnmounted(() => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
});
</script>

<style scoped>
.clickable-weight-slider {
  width: 100%;
  display: flex;
  align-items: center;
  position: relative;
  user-select: none;
  margin-bottom: 6px;
}

.slider-track {
  width: 100%;
  height: 44px;
  background: #1a1a1f;
  border: 1px solid #2c2c32;
  border-radius: 8px;
  position: relative;
  cursor: pointer;
  transition: all 0.2s ease;
  overflow: visible;
}

.slider-track:hover {
  border-color: #8b5cf6;
  transform: translateY(-1px);
}

.slider-track.dragging {
  border-color: #a855f7;
  cursor: grabbing;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.2);
}

.slider-fill {
  height: 100%;
  border-radius: 7px;
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  position: absolute;
  top: 0;
  left: 0;
  background: linear-gradient(
    90deg,
    rgba(139, 92, 246, 0.8) 0%,
    rgba(139, 92, 246, 0.4) 80%,
    rgba(139, 92, 246, 0.1) 100%
  );
}

.dragging .slider-fill {
  transition: width 0.1s ease;
}

.slider-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 0 12px;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}

.label-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
}

.slider-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  width: 100%;
}

.slider-value {
  font-size: 10px;
  font-weight: 600;
  font-family: monospace;
  color: inherit;
  opacity: 0.7;
}

/* Dark theme support */
@media (prefers-color-scheme: dark) {
  .slider-track {
    background: #1a1a1f;
    border-color: #2c2c32;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .slider-track {
    height: 40px;
  }

  .slider-content {
    padding: 0 10px;
  }

  .slider-label {
    font-size: 12px;
  }

  .slider-value {
    font-size: 9px;
  }
}
</style>
