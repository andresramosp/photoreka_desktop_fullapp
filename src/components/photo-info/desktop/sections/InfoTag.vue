<template>
  <n-tooltip
    trigger="hover"
    placement="top"
    :disabled="!isTruncated"
    :style="{ maxWidth: '320px' }"
  >
    <template #trigger>
      <n-tag :type="type" class="tech-tag">
        <span ref="labelRef" class="tag-label">{{ text }}</span>
      </n-tag>
    </template>
    <span class="tag-tooltip">{{ text }}</span>
  </n-tooltip>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { NTag, NTooltip } from "naive-ui";

defineOptions({ name: "PhotoInfoInfoTag" });

const props = defineProps({
  text: { type: [String, Number], default: "" },
  type: { type: String, default: "info" },
});

const labelRef = ref(null);
const isTruncated = ref(false);

const measure = () => {
  const el = labelRef.value;
  if (!el) return;
  isTruncated.value = el.scrollWidth > el.clientWidth + 1;
};

let observer = null;

onMounted(async () => {
  await nextTick();
  measure();
  if (typeof ResizeObserver !== "undefined" && labelRef.value) {
    observer = new ResizeObserver(measure);
    observer.observe(labelRef.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

watch(
  () => props.text,
  async () => {
    await nextTick();
    measure();
  }
);
</script>

<style scoped>
.tech-tag {
  font-size: 10px;
  height: 22px !important;
  border-radius: 4px !important;
  font-family: var(--font-mono);
  font-weight: 500;
  max-width: 100%;
  min-width: 0;
}

.tech-tag :deep(.n-tag__content) {
  overflow: hidden;
  min-width: 0;
}

.tag-label {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-tooltip {
  font-size: 12px;
  word-break: break-word;
}
</style>
