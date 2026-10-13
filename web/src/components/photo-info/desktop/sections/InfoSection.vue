<template>
  <div class="info-grid">
    <!-- File Information -->
    <div class="info-block">
      <h6 class="block-title">File Information</h6>
      <div class="block-tags">
        <InfoTag
          :text="
            selectedPhoto?.originalFileName || selectedPhoto?.name || 'Unknown'
          "
        />
        <InfoTag
          :type="
            selectedPhoto?.descriptions?.visual_aspects?.format
              ? 'info'
              : 'warning'
          "
          :text="
            selectedPhoto?.descriptions?.visual_aspects?.format?.[0]?.toUpperCase() ||
            'Not Present'
          "
        />
        <InfoTag
          :type="
            selectedPhoto?.descriptions?.visual_aspects?.dimensions
              ? 'info'
              : 'warning'
          "
          :text="
            selectedPhoto?.descriptions?.visual_aspects?.dimensions?.[0] ||
            'Not Present'
          "
        />
      </div>

      <!-- Escritorio: dónde está el original en el disco. Se recorta por la
           carpeta para que el nombre del archivo siempre se vea. -->
      <div
        v-if="location?.path"
        class="original-path"
        :class="{ 'original-path--missing': !location.exists }"
      >
        <button
          type="button"
          class="path-link"
          :title="pathTitle"
          @click="originals.showOriginal(selectedPhoto.id)"
        >
          <n-icon size="13" class="path-icon"><FolderOpenOutline /></n-icon>
          <span class="path-dir">{{ pathParts.dir }}</span>
          <span class="path-file">{{ pathParts.file }}</span>
        </button>
        <template v-if="!location.exists">
          <span class="path-missing">not found ·</span>
          <button
            type="button"
            class="path-locate"
            title="Choose where this photo's original is now"
            @click="relink"
          >
            Locate…
          </button>
        </template>
        <button
          v-else
          type="button"
          class="path-open"
          title="Open original"
          @click="originals.openOriginal(selectedPhoto.id)"
        >
          <n-icon size="13"><OpenOutline /></n-icon>
        </button>
      </div>
    </div>

    <!-- Date & Time -->
    <div class="info-block">
      <h6 class="block-title">Date &amp; Time</h6>
      <div class="block-tags">
        <InfoTag
          :text="
            selectedPhoto?.descriptions?.EXIF?.dateTaken
              ? formatDate(selectedPhoto.descriptions.EXIF.dateTaken)
              : selectedPhoto?.createdAt
                ? formatDate(selectedPhoto.createdAt)
                : 'Not Present'
          "
        />
      </div>
    </div>

    <!-- Camera & Settings -->
    <div class="info-block">
      <h6 class="block-title">Camera &amp; Settings</h6>
      <div class="block-tags">
        <InfoTag
          :type="selectedPhoto?.descriptions?.EXIF?.camera ? 'info' : 'warning'"
          :text="selectedPhoto?.descriptions?.EXIF?.camera || 'Not Present'"
        />
        <InfoTag
          v-if="selectedPhoto?.descriptions?.EXIF?.iso"
          :text="`ISO ${selectedPhoto.descriptions.EXIF.iso}`"
        />
        <InfoTag
          v-if="selectedPhoto?.descriptions?.EXIF?.aperture"
          :text="`f/${selectedPhoto.descriptions.EXIF.aperture}`"
        />
        <InfoTag
          v-if="selectedPhoto?.descriptions?.EXIF?.focalLength"
          :text="`${selectedPhoto.descriptions.EXIF.focalLength}mm`"
        />
        <InfoTag
          v-if="selectedPhoto?.descriptions?.EXIF?.exposureTime"
          :text="
            formatExposureTime(selectedPhoto.descriptions.EXIF.exposureTime)
          "
        />
      </div>
    </div>

    <!-- Genre -->
    <div class="info-block">
      <h6 class="block-title">Genre</h6>
      <div class="block-tags">
        <InfoTag
          v-for="genre in selectedPhoto?.descriptions?.visual_aspects?.genre ||
          []"
          :key="genre"
          :text="formatCategoryName(genre)"
        />
        <InfoTag
          v-if="!selectedPhoto?.descriptions?.visual_aspects?.genre"
          type="warning"
          text="Not Present"
        />
      </div>
    </div>

    <!-- Composition -->
    <div class="info-block">
      <h6 class="block-title">Composition</h6>
      <div class="block-tags">
        <InfoTag
          v-for="frame in selectedPhoto?.descriptions?.visual_aspects
            ?.framing || []"
          :key="frame"
          :text="formatCategoryName(frame)"
        />
        <InfoTag
          v-for="orientation in selectedPhoto?.descriptions?.visual_aspects
            ?.orientation || []"
          :key="orientation"
          :text="formatCategoryName(orientation)"
        />
        <InfoTag
          v-for="perspective in selectedPhoto?.descriptions?.visual_aspects
            ?.perspective || []"
          :key="perspective"
          :text="`${formatCategoryName(perspective)} perspective`"
        />
        <InfoTag
          v-for="dof in selectedPhoto?.descriptions?.visual_aspects
            ?.depth_of_field || []"
          :key="dof"
          :text="`${formatCategoryName(dof)} DoF`"
        />
      </div>
    </div>

    <!-- Lighting -->
    <div class="info-block">
      <h6 class="block-title">Lighting</h6>
      <div class="block-tags">
        <InfoTag
          v-for="light in selectedPhoto?.descriptions?.visual_aspects
            ?.lighting || []"
          :key="light"
          :text="formatCategoryName(light)"
        />
        <InfoTag
          v-if="selectedPhoto?.descriptions?.EXIF?.flash"
          :text="formatFlashValue(selectedPhoto.descriptions.EXIF.flash)"
        />
        <InfoTag
          v-if="selectedPhoto?.descriptions?.EXIF?.whiteBalance"
          :text="`WB: ${selectedPhoto.descriptions.EXIF.whiteBalance}`"
        />
      </div>
    </div>

    <!-- Color Style -->
    <div class="info-block">
      <h6 class="block-title">Color Style</h6>
      <div class="block-tags">
        <InfoTag
          v-for="color in selectedPhoto?.descriptions?.visual_aspects
            ?.palette || []"
          :key="color"
          :text="formatCategoryName(color)"
        />
        <InfoTag
          v-for="temp in selectedPhoto?.descriptions?.visual_aspects
            ?.temperature || []"
          :key="temp"
          :text="`${formatCategoryName(temp)} temperature`"
        />
      </div>
    </div>

    <!-- Stylistic -->
    <div class="info-block">
      <h6 class="block-title">Stylistic</h6>
      <div class="block-tags">
        <InfoTag
          v-for="style in selectedPhoto?.descriptions?.visual_aspects
            ?.stylistic || []"
          :key="style"
          :text="formatCategoryName(style)"
        />
        <InfoTag
          v-if="
            !selectedPhoto?.descriptions?.visual_aspects?.stylistic ||
            selectedPhoto.descriptions.visual_aspects.stylistic.length === 0
          "
          type="warning"
          text="None"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { NIcon } from "naive-ui";
import { FolderOpenOutline, OpenOutline } from "@vicons/ionicons5";
import InfoTag from "./InfoTag.vue";
import { useOriginals } from "@/composables/useOriginals.js";

defineOptions({ name: "PhotoInfoInfoSection" });

const props = defineProps({
  selectedPhoto: { type: Object, default: null },
  formatDate: { type: Function, default: (d) => d },
  formatExposureTime: { type: Function, default: (e) => e },
  formatCategoryName: { type: Function, default: (c) => c },
});

const originals = useOriginals();
const location = ref(null);

// Al navegar entre fotos, una respuesta lenta de la anterior no debe pisar la actual.
async function loadLocation(photoId) {
  if (!originals.available || !photoId) return;
  try {
    const data = await originals.fetchLocation(photoId);
    if (props.selectedPhoto?.id === photoId) location.value = data;
  } catch {
    // Sin ubicación no se muestra la línea; el resto de la info no depende de ella.
  }
}

watch(
  () => props.selectedPhoto?.id,
  (photoId) => {
    location.value = null;
    loadLocation(photoId);
  },
  { immediate: true },
);

async function relink() {
  const photoId = props.selectedPhoto?.id;
  if (await originals.relinkOriginal(photoId, location.value?.path)) loadLocation(photoId);
}

const pathParts = computed(() => {
  const path = location.value?.path ?? "";
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1;
  return { dir: path.slice(0, cut), file: path.slice(cut) };
});

const pathTitle = computed(() =>
  location.value?.exists
    ? `${location.value.path}\nShow in ${originals.fileManagerName}`
    : `${location.value?.path}\nNot found: it was moved, renamed or is on a disconnected drive`,
);

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
  min-width: 0;
}

.original-path {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-size: 11px;
  color: var(--text-tertiary);
}

.path-link,
.path-open {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.path-link:hover,
.path-open:hover {
  color: var(--primary-color);
}

.path-link:hover .path-dir,
.path-link:hover .path-file {
  text-decoration: underline;
}

.path-icon {
  flex-shrink: 0;
  margin-right: 4px;
}

.path-dir {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.path-file {
  flex-shrink: 0;
  white-space: nowrap;
}

.path-open {
  flex-shrink: 0;
  opacity: 0.7;
}

.path-open:hover {
  opacity: 1;
}

.original-path--missing .path-link {
  color: var(--warning-color);
}

.path-missing {
  flex-shrink: 0;
  color: var(--warning-color);
  white-space: nowrap;
}

.path-locate {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--primary-color);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.path-locate:hover {
  text-decoration: underline;
}
</style>
