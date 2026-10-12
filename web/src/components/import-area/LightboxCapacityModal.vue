<template>
  <n-modal
    :show="show"
    :style="{ width: '480px', maxWidth: '95vw' }"
    @update:show="(val) => !val && emit('close')"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="lightbox-capacity-card"
    >
      <template #header>
        <div class="lightbox-capacity-header">
          <n-icon size="20" color="var(--warning-color)">
            <AlertCircleOutline />
          </n-icon>
          <span>Import exceeds your Lightbox limit</span>
        </div>
      </template>
      <template #header-extra>
        <n-button text @click="emit('close')" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <CloseOutline />
          </n-icon>
        </n-button>
      </template>

      <div class="lightbox-capacity-body">
        <p class="lightbox-capacity-description">
          How many photos you can keep in the Lightbox is proportional to your
          analysis quota.
          <template v-if="capacity > 0">
            With your current quota, your Lightbox can hold up to
            <strong
              >{{ capacity.toLocaleString() }} photo{{
                capacity !== 1 ? "s" : ""
              }}</strong
            >.
          </template>
          <template v-else>
            You have no analyses left, so you can't add more photos for now.
          </template>
        </p>

        <div class="lightbox-capacity-stats">
          <div class="lightbox-capacity-stat">
            <span>Trying to add</span>
            <strong>{{ attemptedCount.toLocaleString() }}</strong>
          </div>
          <!-- Con el lightbox vacío esta línea no aporta nada: lo que ya hay
               es 0 y el sitio libre es la capacidad entera. -->
          <div v-if="currentCount > 0" class="lightbox-capacity-stat">
            <span>Already in your Lightbox</span>
            <strong>{{ currentCount.toLocaleString() }}</strong>
          </div>
          <div class="lightbox-capacity-stat">
            <span>Room available</span>
            <strong>{{ availableSlots.toLocaleString() }}</strong>
          </div>
        </div>

        <p class="lightbox-capacity-description">{{ adviceText }}</p>
      </div>

      <template #footer>
        <div class="lightbox-capacity-footer">
          <n-button tertiary @click="emit('go-to-settings')"
            >Upgrade plan</n-button
          >
          <n-button type="primary" @click="emit('close')">Got it</n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup>
// NModal no está registrado globalmente (ver main.ts), hay que importarlo.
import { computed } from "vue";
import { NModal } from "naive-ui";
import { AlertCircleOutline, CloseOutline } from "@vicons/ionicons5";

const props = defineProps({
  show: { type: Boolean, default: false },
  // Tope de fotos que caben en el lightbox con la cuota de análisis actual
  capacity: { type: Number, default: 0 },
  // Fotos que ya hay en el lightbox
  currentCount: { type: Number, default: 0 },
  // Fotos que el usuario intentaba importar
  attemptedCount: { type: Number, default: 0 },
});

const emit = defineEmits(["close", "go-to-settings"]);

const availableSlots = computed(() =>
  Math.max(0, props.capacity - props.currentCount),
);

// El consejo depende del escenario: vaciar el lightbox solo sirve si hay algo
// dentro, y sin cuota de análisis lo único que queda es ampliar el plan.
const adviceText = computed(() => {
  if (props.capacity === 0) {
    return "Upgrade your plan to get more analyses and start importing again.";
  }
  if (props.currentCount > 0) {
    return "Analyze or remove some of the photos you already have, import a smaller batch, or upgrade your plan to raise the limit.";
  }
  return "Import a smaller batch, or upgrade your plan to raise the limit.";
});
</script>

<style scoped>
.lightbox-capacity-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
}

.lightbox-capacity-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.lightbox-capacity-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.lightbox-capacity-description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.6;
}

.lightbox-capacity-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background-color: color-mix(in srgb, var(--warning-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning-color) 25%, transparent);
  border-left: 3px solid var(--warning-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
}

.lightbox-capacity-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.5;
}

.lightbox-capacity-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
