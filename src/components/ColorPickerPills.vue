<template>
  <div class="color-picker-pills">
    <button
      v-for="option in filteredOptions"
      :key="option.id"
      :class="['color-pill', { active: currentColorId === option.id }]"
      :style="getOptionStyle(option)"
      :title="option.label"
      :disabled="disabled"
      @click.stop="handleColorChange(option.id)"
    ></button>
  </div>
</template>

<script setup>
import { computed, watch } from "vue";
import { useTheme } from "@/composables/useTheme.js";
import woodenTextureUrl from "@/assets/canvas/wooden-texture.jpg";

// All available color options - source of truth
const BACKGROUND_COLOR_OPTIONS = [
  { id: "default", color: "#000000", label: "Dark" },
  { id: "white", color: "#f5f5f5", label: "Light" },
  { id: "gray", color: "#a0a0a0", label: "Gray" },
  // {
  //   id: "wood",
  //   label: "Wood",
  //   swatchStyle: {
  //     backgroundImage: `url(${woodenTextureUrl})`,
  //     backgroundSize: "cover",
  //     backgroundPosition: "center",
  //   },
  // },
];

const props = defineProps({
  modelValue: {
    type: [String, Object], // Can be ID string or full object
    default: null,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  // Consumer-specific options appended after the shared palette
  extraOptions: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:modelValue"]);

const { isDarkMode } = useTheme();

// Show all 3 colors in both themes
const filteredOptions = computed(() => {
  return [...BACKGROUND_COLOR_OPTIONS, ...props.extraOptions];
});

// Get current color ID from modelValue (supports both string ID and object)
const currentColorId = computed(() => {
  if (!props.modelValue) return null;
  return typeof props.modelValue === "string"
    ? props.modelValue
    : props.modelValue.id;
});

const getOptionStyle = (option) => {
  if (option.swatchStyle) {
    return option.swatchStyle;
  }

  return {
    backgroundColor: option.color,
  };
};

// Watch for theme changes and set default color if none selected
watch(isDarkMode, (newIsDarkMode) => {
  // Only auto-set if no color is currently selected
  if (!currentColorId.value) {
    const defaultOption = BACKGROUND_COLOR_OPTIONS.find(
      (opt) => opt.id === (newIsDarkMode ? "default" : "gray"),
    );
    emit("update:modelValue", defaultOption);
  }
});

const handleColorChange = (colorId) => {
  // Emit the full color object with all properties
  const colorOption = filteredOptions.value.find((opt) => opt.id === colorId);
  emit("update:modelValue", colorOption);
};
</script>

<style scoped>
.color-picker-pills {
  display: flex;
  gap: 8px;
}

.color-pill {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.65);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.color-pill:hover {
  transform: scale(1.1);
}

.color-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.color-pill.active {
  border-color: var(--primary-color, #007bff);
  box-shadow: 0 0 0 2px var(--primary-color, #007bff);
}
</style>
