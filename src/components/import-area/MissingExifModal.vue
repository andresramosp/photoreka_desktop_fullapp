<template>
  <n-modal
    :show="show"
    :style="{ width: '540px', maxWidth: '95vw' }"
    @update:show="handleShowChange"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="exif-missing-card"
    >
      <template #header>
        <div class="exif-missing-header">
          <n-icon size="20" color="var(--warning-color)">
            <AlertCircleOutline />
          </n-icon>
          <span>Some photos are missing metadata</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="emit('cancel')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="exif-missing-body">
        <p class="exif-missing-description">
          <strong>{{ stats.affected }} of {{ stats.checked }} photos</strong>
          {{ stats.sampled ? "we sampled" : "in this import" }}
          {{ stats.affected !== 1 ? "don't carry" : "doesn't carry" }} the EXIF
          metadata Photoreka relies on. You can import them anyway, but they'll
          be harder to organize later.
        </p>

        <div class="exif-missing-breakdown">
          <div v-if="stats.missingDate > 0" class="exif-missing-stat">
            <n-icon size="15" color="var(--warning-color)">
              <CalendarClearOutline />
            </n-icon>
            <span>
              <strong>{{ stats.missingDate }}</strong>
              {{ stats.missingDate !== 1 ? "photos have" : "photo has" }} no
              capture date
            </span>
          </div>
          <div v-if="stats.missingCamera > 0" class="exif-missing-stat">
            <n-icon size="15" color="var(--warning-color)">
              <CameraOutline />
            </n-icon>
            <span>
              <strong>{{ stats.missingCamera }}</strong>
              {{ stats.missingCamera !== 1 ? "photos have" : "photo has" }} no
              camera or lens info
            </span>
          </div>
          <div v-if="stats.missingSettings > 0" class="exif-missing-stat">
            <n-icon size="15" color="var(--warning-color)">
              <ApertureOutline />
            </n-icon>
            <span>
              <strong>{{ stats.missingSettings }}</strong>
              {{ stats.missingSettings !== 1 ? "photos have" : "photo has" }} no
              shooting settings (focal length, aperture, shutter, ISO)
            </span>
          </div>
          <div v-if="stats.noExif > 0" class="exif-missing-stat">
            <n-icon size="15" color="var(--warning-color)">
              <DocumentOutline />
            </n-icon>
            <span>
              <strong>{{ stats.noExif }}</strong>
              {{ stats.noExif !== 1 ? "photos carry" : "photo carries" }} no
              EXIF data at all
            </span>
          </div>
        </div>

        <div class="exif-missing-info-box">
          <div class="exif-missing-info-header">
            <n-icon size="15" color="var(--info-color)">
              <SparklesOutline />
            </n-icon>
            <span class="exif-missing-info-title">Why metadata matters</span>
          </div>
          <ul class="exif-missing-benefits">
            <li>
              <strong>Dates and time ranges</strong>: the capture date is what
              lets us place a photo on your timeline and filter by periods —
              "last summer", a specific trip, a given year.
            </li>
            <li>
              <strong>Camera and lens filters</strong>: browsing, search and the
              chat assistant can narrow down by camera model, focal length or
              aperture only when those values are present.
            </li>
            <li>
              <strong>Better duplicates and scoring</strong>: shared metadata
              makes near-identical shots much easier to detect, so scores can be
              consolidated across versions of the same photo instead of starting
              from scratch on each one.
            </li>
          </ul>
        </div>

        <p class="exif-missing-note">
          <n-icon size="13" color="var(--text-tertiary, var(--text-secondary))">
            <BulbOutline />
          </n-icon>
          <span>
            Metadata is usually stripped on export or when a photo travels
            through a messaging app. Re-exporting with
            <strong>“Include All Metadata”</strong> enabled (Lightroom, Capture
            One, Photoshop…) keeps it intact.
            <template v-if="stats.sampled">
              We checked a random sample of {{ stats.checked }} out of
              {{ stats.total.toLocaleString() }} photos in this import.
            </template>
          </span>
        </p>

        <div class="exif-missing-dismiss">
          <n-checkbox
            :checked="dontShowAgain"
            @update:checked="(value) => emit('update:dontShowAgain', value)"
          >
            Don't show this again
          </n-checkbox>
        </div>
      </div>

      <template #footer>
        <div class="exif-missing-footer">
          <n-button tertiary @click="emit('cancel')">Cancel import</n-button>
          <n-button type="primary" @click="emit('continue')">
            <template #icon>
              <n-icon><CloudUploadOutline /></n-icon>
            </template>
            Import anyway
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
// NModal no está registrado globalmente (ver main.ts), hay que importarlo.
import { NModal } from "naive-ui";
import {
  AlertCircleOutline,
  ApertureOutline,
  BulbOutline,
  CalendarClearOutline,
  CameraOutline,
  CloseOutline,
  CloudUploadOutline,
  DocumentOutline,
  SparklesOutline,
} from "@vicons/ionicons5";

defineProps({
  show: { type: Boolean, default: false },
  // Resultado de runMissingExifCheck: { checked, total, sampled, affected,
  // missingDate, missingCamera, missingSettings, noExif }
  stats: {
    type: Object,
    default: () => ({
      checked: 0,
      total: 0,
      sampled: false,
      affected: 0,
      missingDate: 0,
      missingCamera: 0,
      missingSettings: 0,
      noExif: 0,
    }),
  },
  dontShowAgain: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:show",
  "update:dontShowAgain",
  "continue",
  "cancel",
]);

// A diferencia del aviso de duplicados, este sale *antes* de subir nada: cerrar
// por la máscara o con Esc equivale a cancelar, para no arrancar una
// importación entera por un descuido.
const handleShowChange = (value) => {
  emit("update:show", value);
  if (!value) emit("cancel");
};
</script>

<style scoped>
.exif-missing-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.exif-missing-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.exif-missing-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.exif-missing-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.exif-missing-breakdown {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background-color: color-mix(in srgb, var(--warning-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning-color) 25%, transparent);
  border-left: 3px solid var(--warning-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
}

.exif-missing-stat {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.5;
}

.exif-missing-info-box {
  background-color: color-mix(in srgb, var(--info-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--info-color) 25%, transparent);
  border-left: 3px solid var(--info-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.exif-missing-info-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.exif-missing-info-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--info-color);
}

.exif-missing-benefits {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.exif-missing-note {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--font-size-xs, 12px);
  color: var(--text-tertiary, var(--text-secondary));
  line-height: 1.5;
  opacity: 0.85;
}

.exif-missing-dismiss {
  padding-top: 4px;
}

.exif-missing-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
