<script setup lang="ts">
import { ref } from "vue";
import { NButton, NCheckbox, NIcon, NTag } from "naive-ui";
import {
  GlobeOutline,
  InformationCircleOutline,
  CreateOutline,
  FlaskOutline,
} from "@vicons/ionicons5";

const emit = defineEmits<{ start: [] }>();

const acceptedPrivacy = ref(false);
</script>

<template>
  <div class="grw-body">
    <!-- ── Hero + How it works (shared globe background) ── -->
    <div class="grw-hero-wrapper">
      <svg
        class="grw-hero-globe"
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        />
        <ellipse
          cx="100"
          cy="100"
          rx="90"
          ry="28"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
        />
        <ellipse
          cx="100"
          cy="72"
          rx="76"
          ry="19"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
        <ellipse
          cx="100"
          cy="128"
          rx="76"
          ry="19"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
        <ellipse
          cx="100"
          cy="100"
          rx="46"
          ry="90"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
        <ellipse
          cx="100"
          cy="100"
          rx="46"
          ry="90"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          transform="rotate(60 100 100)"
        />
        <ellipse
          cx="100"
          cy="100"
          rx="46"
          ry="90"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
          transform="rotate(-60 100 100)"
        />
        <line
          x1="100"
          y1="10"
          x2="100"
          y2="190"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>

      <!-- ── Hero ─────────────────────────────────────────── -->
      <div class="grw-hero">
        <NTag
          type="primary"
          size="small"
          round
          :bordered="false"
          class="grw-badge"
        >
          <template #icon>
            <NIcon :component="GlobeOutline" />
          </template>
          Geo Recovery
        </NTag>
        <p class="grw-hero-text">
          Upload your photos and our AI will infer GPS coordinates from visual
          context, writing them directly into your files' EXIF data.
        </p>
      </div>

      <!-- ── How it works ──────────────────────────────────── -->
      <div class="grw-section">
        <div class="grw-section-label">How it works</div>
        <ol class="grw-how-list">
          <li>
            Your <strong>original photos never leave this browser</strong>.
            They're stored locally and survive reloads.
          </li>
          <li>
            We send only a downscaled <strong>thumbnail</strong> per photo to
            our server, used exclusively by the AI to recognize what it depicts.
          </li>
          <li>Our model proposes a location (city / place) for each photo.</li>
          <li>
            You download a ZIP with your <strong>original files</strong>, now
            with GPS coordinates written into their EXIF.
          </li>
        </ol>
      </div>
    </div>

    <!-- ── Privacy notice ─────────────────────────────────── -->
    <div class="grw-notice grw-notice--info">
      <NIcon
        :component="InformationCircleOutline"
        size="15"
        :color="'var(--info-color)'"
        class="grw-notice-icon"
      />
      <span>
        Originals stay on your device. Thumbnails on our servers are deleted
        automatically after 7 days.
        <strong>No account or email required.</strong>
      </span>
    </div>

    <!-- ── Approximate results + Try for free ─────────────── -->
    <div class="grw-notice grw-notice--info grw-notice--multi">
      <div class="grw-notice-item">
        <NIcon
          :component="InformationCircleOutline"
          size="15"
          :color="'var(--info-color)'"
          class="grw-notice-icon"
        />
        <span>
          <strong>Results are approximate</strong> — usually
          <strong>city or district level</strong>, rarely street level. Several
          photos may cluster at the same point when finer data isn't available.
        </span>
      </div>
      <div class="grw-notice-item">
        <NIcon
          :component="CreateOutline"
          size="15"
          :color="'var(--info-color)'"
          class="grw-notice-icon"
        />
        <span>
          A <strong>small percentage</strong> of placements may be
          <strong>imprecise or wrong</strong>; you can always correct them
          manually.
        </span>
      </div>
      <div class="grw-notice-cta">
        <NButton
          type="info"
          size="medium"
          @click="() => {}"
          class="grw-test-btn"
        >
          <template #icon>
            <NIcon :component="FlaskOutline" />
          </template>
          Test your photos
        </NButton>
      </div>
    </div>

    <!-- ── Footer: checkbox + start ───────────────────────── -->
    <div class="grw-footer">
      <NCheckbox v-model:checked="acceptedPrivacy">
        I understand that originals stay in this browser and only thumbnails are
        uploaded.
      </NCheckbox>
      <NButton
        type="primary"
        size="large"
        block
        :disabled="!acceptedPrivacy"
        @click="emit('start')"
      >
        Start
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.grw-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Hero wrapper (shared globe) ──────────────────────────── */

.grw-hero-wrapper {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
}

.grw-hero-globe {
  position: absolute;
  right: -32px;
  top: 50%;
  transform: translateY(-50%);
  width: 220px;
  height: 220px;
  opacity: 0.25;
  color: var(--primary-color);
  pointer-events: none;
}

/* ── Hero ─────────────────────────────────────────────────── */

.grw-hero {
  padding: 14px 16px 10px;
}

.grw-badge {
  margin-bottom: 8px !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 11px !important;
}

.grw-hero-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.9);
}

/* ── How it works ──────────────────────────────────────────── */

.grw-section {
  padding: 10px 14px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.grw-section-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.grw-how-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.75);
}

.grw-how-list strong {
  color: #fff;
  font-weight: 600;
}

/* ── Notices ──────────────────────────────────────────────── */

.grw-notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 12px;
  border-left: 3px solid;
  font-size: 12px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.65);
}

.grw-notice--info {
  background: color-mix(in srgb, var(--info-color) 8%, transparent);
  border-color: color-mix(in srgb, var(--info-color) 45%, transparent);
}

.grw-notice strong {
  color: rgba(255, 255, 255, 0.9);
}

.grw-notice-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.grw-notice--multi {
  flex-direction: column;
  gap: 8px;
}

.grw-notice-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.grw-notice-cta {
  width: 100%;
  padding-top: 12px;
  padding-bottom: 2px;
  margin-top: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-top: 1px solid color-mix(in srgb, var(--info-color) 20%, transparent);
}

.grw-test-btn {
  font-weight: 600;
  letter-spacing: 0.2px;
  min-width: 170px;
  min-width: 160px;
}

/* ── Footer ───────────────────────────────────────────────── */

.grw-footer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
