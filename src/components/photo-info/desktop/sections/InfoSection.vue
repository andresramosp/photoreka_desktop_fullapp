<template>
  <div class="info-grid">
    <!-- File Information -->
    <div class="info-block">
      <h6 class="block-title">File Information</h6>
      <div class="block-tags">
        <n-tag type="info" class="tech-tag">
          {{
            selectedPhoto?.originalFileName || selectedPhoto?.name || "Unknown"
          }}
        </n-tag>
        <n-tag
          :type="
            selectedPhoto?.descriptions?.visual_aspects?.format
              ? 'info'
              : 'warning'
          "
          class="tech-tag"
        >
          {{
            selectedPhoto?.descriptions?.visual_aspects?.format?.[0]?.toUpperCase() ||
            "Not Present"
          }}
        </n-tag>
        <n-tag
          :type="
            selectedPhoto?.descriptions?.visual_aspects?.dimensions
              ? 'info'
              : 'warning'
          "
          class="tech-tag"
        >
          {{
            selectedPhoto?.descriptions?.visual_aspects?.dimensions?.[0] ||
            "Not Present"
          }}
        </n-tag>
      </div>
    </div>

    <!-- Date & Time -->
    <div class="info-block">
      <h6 class="block-title">Date &amp; Time</h6>
      <div class="block-tags">
        <n-tag type="info" class="tech-tag">
          {{
            selectedPhoto?.descriptions?.EXIF?.dateTaken
              ? formatDate(selectedPhoto.descriptions.EXIF.dateTaken)
              : selectedPhoto?.createdAt
                ? formatDate(selectedPhoto.createdAt)
                : "Not Present"
          }}
        </n-tag>
      </div>
    </div>

    <!-- Camera & Settings -->
    <div class="info-block">
      <h6 class="block-title">Camera &amp; Settings</h6>
      <div class="block-tags">
        <n-tag
          :type="selectedPhoto?.descriptions?.EXIF?.camera ? 'info' : 'warning'"
          class="tech-tag"
        >
          {{ selectedPhoto?.descriptions?.EXIF?.camera || "Not Present" }}
        </n-tag>
        <n-tag
          v-if="selectedPhoto?.descriptions?.EXIF?.iso"
          type="info"
          class="tech-tag"
        >
          ISO {{ selectedPhoto.descriptions.EXIF.iso }}
        </n-tag>
        <n-tag
          v-if="selectedPhoto?.descriptions?.EXIF?.aperture"
          type="info"
          class="tech-tag"
        >
          f/{{ selectedPhoto.descriptions.EXIF.aperture }}
        </n-tag>
        <n-tag
          v-if="selectedPhoto?.descriptions?.EXIF?.focalLength"
          type="info"
          class="tech-tag"
        >
          {{ selectedPhoto.descriptions.EXIF.focalLength }}mm
        </n-tag>
        <n-tag
          v-if="selectedPhoto?.descriptions?.EXIF?.exposureTime"
          type="info"
          class="tech-tag"
        >
          {{ formatExposureTime(selectedPhoto.descriptions.EXIF.exposureTime) }}
        </n-tag>
      </div>
    </div>

    <!-- Genre -->
    <div class="info-block">
      <h6 class="block-title">Genre</h6>
      <div class="block-tags">
        <n-tag
          v-for="genre in selectedPhoto?.descriptions?.visual_aspects?.genre ||
          []"
          :key="genre"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(genre) }}
        </n-tag>
        <n-tag
          v-if="!selectedPhoto?.descriptions?.visual_aspects?.genre"
          type="warning"
          class="tech-tag"
        >
          Not Present
        </n-tag>
      </div>
    </div>

    <!-- Composition -->
    <div class="info-block">
      <h6 class="block-title">Composition</h6>
      <div class="block-tags">
        <n-tag
          v-for="frame in selectedPhoto?.descriptions?.visual_aspects
            ?.framing || []"
          :key="frame"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(frame) }}
        </n-tag>
        <n-tag
          v-for="orientation in selectedPhoto?.descriptions?.visual_aspects
            ?.orientation || []"
          :key="orientation"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(orientation) }}
        </n-tag>
        <n-tag
          v-for="perspective in selectedPhoto?.descriptions?.visual_aspects
            ?.perspective || []"
          :key="perspective"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(perspective) }} perspective
        </n-tag>
        <n-tag
          v-for="dof in selectedPhoto?.descriptions?.visual_aspects
            ?.depth_of_field || []"
          :key="dof"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(dof) }} DoF
        </n-tag>
      </div>
    </div>

    <!-- Lighting -->
    <div class="info-block">
      <h6 class="block-title">Lighting</h6>
      <div class="block-tags">
        <n-tag
          v-for="light in selectedPhoto?.descriptions?.visual_aspects
            ?.lighting || []"
          :key="light"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(light) }}
        </n-tag>
        <n-tag
          v-if="selectedPhoto?.descriptions?.EXIF?.flash"
          type="info"
          class="tech-tag"
        >
          {{ formatFlashValue(selectedPhoto.descriptions.EXIF.flash) }}
        </n-tag>
        <n-tag
          v-if="selectedPhoto?.descriptions?.EXIF?.whiteBalance"
          type="info"
          class="tech-tag"
        >
          WB: {{ selectedPhoto.descriptions.EXIF.whiteBalance }}
        </n-tag>
      </div>
    </div>

    <!-- Color Style -->
    <div class="info-block">
      <h6 class="block-title">Color Style</h6>
      <div class="block-tags">
        <n-tag
          v-for="color in selectedPhoto?.descriptions?.visual_aspects
            ?.palette || []"
          :key="color"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(color) }}
        </n-tag>
        <n-tag
          v-for="temp in selectedPhoto?.descriptions?.visual_aspects
            ?.temperature || []"
          :key="temp"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(temp) }} temperature
        </n-tag>
      </div>
    </div>

    <!-- Stylistic -->
    <div class="info-block">
      <h6 class="block-title">Stylistic</h6>
      <div class="block-tags">
        <n-tag
          v-for="style in selectedPhoto?.descriptions?.visual_aspects
            ?.stylistic || []"
          :key="style"
          type="info"
          class="tech-tag"
        >
          {{ formatCategoryName(style) }}
        </n-tag>
        <n-tag
          v-if="
            !selectedPhoto?.descriptions?.visual_aspects?.stylistic ||
            selectedPhoto.descriptions.visual_aspects.stylistic.length === 0
          "
          type="warning"
          class="tech-tag"
        >
          None
        </n-tag>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NTag } from "naive-ui";

defineOptions({ name: "PhotoInfoInfoSection" });

defineProps({
  selectedPhoto: { type: Object, default: null },
  formatDate: { type: Function, default: (d) => d },
  formatExposureTime: { type: Function, default: (e) => e },
  formatCategoryName: { type: Function, default: (c) => c },
});

const formatFlashValue = (flash) => {
  if (!flash) return "";
  if (typeof flash === "string") return flash;
  if (typeof flash === "object") {
    return Boolean(flash.Fired) ? "Flash fired" : "Flash did not fire";
  }
  return String(flash);
};
</script>

<style scoped>
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-md) var(--spacing-lg);
}

.info-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
}

.block-title {
  margin: 0;
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.block-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tech-tag {
  font-size: 10px;
  height: 22px !important;
  border-radius: 4px !important;
  font-family: var(--font-mono);
  font-weight: 500;
}
</style>
