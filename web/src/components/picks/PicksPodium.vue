<script setup lang="ts">
import PicksScoreRing from "./PicksScoreRing.vue";
import PicksCopiesBadge from "./PicksCopiesBadge.vue";
import { useLargeImage } from "@/utils/picks/imageSource";
import type { RankedPhoto } from "@/utils/picks/types";

defineProps<{ items: RankedPhoto[] }>();
const emit = defineEmits<{ open: [photoId: string] }>();

const MEDALS = ["gold", "silver", "bronze"];
const largeImage = useLargeImage();
</script>

<template>
  <div class="pk-podium" :class="`has-${items.length}`">
    <div
      v-for="(item, i) in items"
      :key="i"
      class="pk-podium-slot"
      :class="[`is-${MEDALS[i]}`, { 'is-first': i === 0 }]"
    >
      <Transition name="pk-podium-swap" mode="out-in">
        <button
          :key="item.photo.id"
          class="pk-podium-card"
          @click="emit('open', item.photo.id)"
        >
          <img :src="largeImage(item.photo)" alt="" class="pk-podium-img" />
          <span class="pk-podium-shade" />
          <span class="pk-podium-rank">{{ String(item.rank).padStart(2, "0") }}</span>
          <PicksCopiesBadge :copies="item.photo.duplicates" large />
          <span class="pk-podium-info">
            <span class="pk-podium-text">
              <span v-if="item.photo.critique" class="pk-podium-critique">
                “{{ item.photo.critique }}”
              </span>
              <span class="pk-podium-name">{{ item.photo.name }}</span>
            </span>
            <PicksScoreRing :value="item.score" :size="i === 0 ? 64 : 48" />
          </span>
        </button>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.pk-podium {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  grid-template-rows: 1fr 1fr;
  gap: 14px;
  height: clamp(420px, 50vw, 640px);
}

.pk-podium-slot {
  position: relative;
  min-height: 0;
  border-radius: 22px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.pk-podium-slot.is-first {
  grid-row: 1 / span 2;
}

.pk-podium.has-1 .pk-podium-slot.is-first {
  grid-column: 1 / -1;
}

.pk-podium-card {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  color: inherit;
  text-align: left;
}

.pk-podium-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 1.2s var(--pk-ease);
}

.pk-podium-card:hover .pk-podium-img {
  transform: scale(1.035);
}

.pk-podium-shade {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.45) 0%, transparent 28%),
    linear-gradient(0deg, rgba(4, 4, 7, 0.88) 0%, rgba(4, 4, 7, 0.2) 42%, transparent 62%);
}

.pk-podium-rank {
  position: absolute;
  top: 14px;
  left: 20px;
  font-family: var(--pk-serif);
  font-style: italic;
  font-weight: 300;
  font-size: clamp(48px, 6vw, 84px);
  line-height: 1;
  letter-spacing: -0.04em;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 4px 18px rgba(0, 0, 0, 0.5));
}

.is-first .pk-podium-rank {
  font-size: clamp(72px, 9vw, 128px);
}

.is-gold .pk-podium-rank {
  background-image: var(--pk-gold-gradient);
}
.is-silver .pk-podium-rank {
  background-image: linear-gradient(135deg, #ffffff 0%, #c9d1dc 50%, #8d97a5 100%);
}
.is-bronze .pk-podium-rank {
  background-image: linear-gradient(135deg, #f6c9a0 0%, #c98a5a 50%, #8a5532 100%);
}

.pk-podium-info {
  position: absolute;
  left: 20px;
  right: 18px;
  bottom: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.pk-podium-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.pk-podium-critique {
  max-width: 520px;
  font-family: var(--pk-serif);
  font-style: italic;
  font-weight: 300;
  font-size: clamp(16px, 1.6vw, 21px);
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.92);
  text-wrap: pretty;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
}

.pk-podium-slot:not(.is-first) .pk-podium-critique {
  max-width: none;
  font-size: clamp(13px, 1.05vw, 15px);
  -webkit-line-clamp: 3;
  line-clamp: 3;
}

.pk-podium-name {
  font-size: 12px;
  color: var(--pk-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pk-podium-swap-enter-active,
.pk-podium-swap-leave-active {
  transition:
    opacity 0.45s var(--pk-ease),
    transform 0.6s var(--pk-ease),
    filter 0.45s var(--pk-ease);
}
.pk-podium-swap-enter-from {
  opacity: 0;
  transform: scale(1.06);
  filter: blur(8px);
}
.pk-podium-swap-leave-to {
  opacity: 0;
  filter: blur(8px);
}

@media (max-width: 760px) {
  .pk-podium {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1.6fr 1fr;
    height: 560px;
  }
  .pk-podium-slot.is-first {
    grid-row: auto;
    grid-column: 1 / -1;
  }
  .pk-podium-critique {
    font-size: 15px;
  }
  .pk-podium-slot:not(.is-first) .pk-podium-critique {
    font-size: 12px;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
}
</style>
