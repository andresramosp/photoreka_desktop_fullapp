<script setup lang="ts">
import { ref } from "vue";
import { NAlert, NButton, NCheckbox } from "naive-ui";

const emit = defineEmits<{ start: [] }>();

const acceptedPrivacy = ref(false);
</script>

<template>
  <h2>Recover the GPS for your photos</h2>
  <ol class="how">
    <li>
      Your <strong>original photos never leave this browser</strong>. They're
      stored locally and survive reloads.
    </li>
    <li>
      We send only a downscaled <strong>thumbnail</strong> per photo to our
      server, used exclusively by the AI to recognize what it depicts.
    </li>
    <li>Our model proposes a location (city / place) for each photo.</li>
    <li>
      You download a ZIP with your <strong>original files</strong>, now with GPS
      coordinates written into their EXIF.
    </li>
  </ol>
  <NAlert type="info" :show-icon="true" style="margin: 12px 0">
    <template #header>Privacy</template>
    Originals stay on your device. Thumbnails on our servers are deleted
    automatically after 7 days. No account or email required.
  </NAlert>
  <NCheckbox v-model:checked="acceptedPrivacy" style="margin: 4px 0 12px">
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
</template>

<style scoped>
.how {
  padding-left: 22px;
  line-height: 1.65;
  margin: 8px 0 12px;
  font-size: 14px;
}
</style>
