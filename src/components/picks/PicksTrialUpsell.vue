<script setup lang="ts">
import { NIcon } from "naive-ui";
import { SparklesOutline } from "@vicons/ionicons5";
import { PICKS_MAX_PHOTOS, PICKS_PRICE_PER_PHOTO_EUR } from "@/config/picks";
import { formatCount, formatEur } from "@/utils/picks/format";

const emit = defineEmits<{ upgrade: [] }>();
</script>

<template>
  <aside class="pk-upsell">
    <div class="pk-upsell-icon">
      <n-icon :size="22"><SparklesOutline /></n-icon>
    </div>
    <div class="pk-upsell-text">
      <p class="pk-upsell-title">This was your free trial.</p>
      <p class="pk-upsell-sub">
        Rank your whole collection: up to {{ formatCount(PICKS_MAX_PHOTOS) }} photos,
        {{ formatEur(PICKS_PRICE_PER_PHOTO_EUR) }} each, with a private link to keep your results.
      </p>
    </div>
    <button class="pk-cta pk-upsell-cta" @click="emit('upgrade')">Rank all my photos</button>
  </aside>
</template>

<style scoped>
.pk-upsell {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 0 0 24px;
  padding: 18px 22px;
  border-radius: 20px;
  background:
    linear-gradient(110deg, rgba(244, 183, 64, 0.12), rgba(139, 92, 246, 0.08) 60%, transparent),
    var(--pk-panel);
  border: 1px solid rgba(244, 183, 64, 0.35);
  box-shadow: 0 20px 60px -30px rgba(244, 183, 64, 0.45);
}

.pk-upsell-icon {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: var(--pk-gold-2);
  background: rgba(244, 183, 64, 0.12);
}

.pk-upsell-text {
  flex: 1;
  min-width: 0;
}

.pk-upsell-title {
  margin: 0;
  font-family: var(--pk-serif);
  font-size: 22px;
  letter-spacing: -0.01em;
}

.pk-upsell-sub {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--pk-text-2);
}

.pk-upsell-cta {
  flex-shrink: 0;
  padding: 13px 24px;
}

@media (max-width: 760px) {
  .pk-upsell {
    flex-direction: column;
    align-items: flex-start;
  }
  .pk-upsell-cta {
    width: 100%;
  }
}
</style>
