<script setup lang="ts">
import { computed } from "vue";
import { NIcon } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseOutline,
  CloudUploadOutline,
  LockClosedOutline,
} from "@vicons/ionicons5";
import PicksProgressBar from "./PicksProgressBar.vue";
import PicksStripeForm from "./PicksStripeForm.vue";
import {
  PICKS_MIN_CHARGE_EUR,
  PICKS_PRICE_PER_PHOTO_EUR,
  computePicksPriceEur,
} from "@/config/picks";
import { formatCount, formatEur } from "@/utils/picks/format";
import type { PicksTransferState } from "@/utils/picks/types";

const props = defineProps<{
  show: boolean;
  photoCount: number;
  transfer: PicksTransferState;
  uploadFinished: boolean;
  /** Null while the order is being opened on the server. */
  token: string | null;
  openError: string | null;
}>();
const emit = defineEmits<{ close: []; paid: [] }>();

const uploadPercent = computed(() =>
  props.transfer.total
    ? ((props.transfer.uploaded + props.transfer.failed) / props.transfer.total) * 100
    : 0,
);

const total = computed(() => computePicksPriceEur(props.photoCount));
const minApplied = computed(
  () => props.photoCount * PICKS_PRICE_PER_PHOTO_EUR < PICKS_MIN_CHARGE_EUR,
);
</script>

<template>
  <Transition name="pk-modal">
    <div v-if="show" class="pk-modal" @click.self="emit('close')">
      <div class="pk-modal-card" role="dialog" aria-modal="true">
        <button class="pk-icon-btn pk-modal-close" @click="emit('close')">
          <n-icon :size="18"><CloseOutline /></n-icon>
        </button>

        <p class="pk-eyebrow">Checkout</p>
        <h2 class="pk-modal-title">One payment, <em>no account.</em></h2>

        <div class="pk-modal-lines">
          <div class="pk-modal-line">
            <span>{{ formatCount(photoCount) }} photos × {{ formatEur(PICKS_PRICE_PER_PHOTO_EUR) }}</span>
            <span>{{ formatEur(photoCount * PICKS_PRICE_PER_PHOTO_EUR) }}</span>
          </div>
          <div v-if="minApplied" class="pk-modal-line is-muted">
            <span>Minimum charge</span>
            <span>{{ formatEur(PICKS_MIN_CHARGE_EUR) }}</span>
          </div>
          <div class="pk-modal-line is-total">
            <span>Total</span>
            <span>{{ formatEur(total) }}</span>
          </div>
        </div>

        <div class="pk-modal-upload" :class="{ 'is-done': uploadFinished }">
          <div class="pk-modal-upload-head">
            <n-icon :size="16">
              <CheckmarkCircleOutline v-if="uploadFinished" />
              <CloudUploadOutline v-else />
            </n-icon>
            <span class="pk-modal-upload-label">
              {{ uploadFinished ? "Photos uploaded, ready for the jury" : "Uploading your photos while you pay" }}
            </span>
            <span class="pk-modal-upload-count">
              {{ formatCount(transfer.uploaded) }} / {{ formatCount(transfer.total) }}
            </span>
          </div>
          <PicksProgressBar :percent="uploadPercent" variant="upload" />
        </div>

        <p v-if="openError" class="pk-modal-error">{{ openError }}</p>
        <PicksStripeForm
          v-else-if="token"
          :key="`${token}:${photoCount}`"
          :token="token"
          :photo-count="photoCount"
          @paid="emit('paid')"
        />
        <div v-else class="pk-stripe-slot">
          <n-icon :size="16"><LockClosedOutline /></n-icon>
          Opening your order…
        </div>
        <p class="pk-modal-note">
          Your private results link is sent to the email you pay with.
        </p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pk-modal {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(4, 4, 7, 0.6);
  backdrop-filter: blur(10px);
}

.pk-modal-card {
  position: relative;
  width: min(460px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 32px;
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(28, 28, 36, 0.96), rgba(16, 16, 22, 0.98));
  border: 1px solid var(--pk-line-strong);
  box-shadow: 0 50px 120px -30px rgba(0, 0, 0, 0.9);
}

.pk-modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
}

.pk-modal-title {
  margin: 10px 0 24px;
  font-family: var(--pk-serif);
  font-weight: 400;
  font-size: 32px;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.pk-modal-title em {
  font-style: italic;
  color: var(--pk-gold-2);
}

.pk-modal-lines {
  display: grid;
  gap: 10px;
  font-size: 14px;
  color: var(--pk-text-2);
}

.pk-modal-line {
  display: flex;
  justify-content: space-between;
}

.pk-modal-line.is-muted {
  color: var(--pk-text-3);
}

.pk-modal-line.is-total {
  padding-top: 14px;
  margin-top: 4px;
  border-top: 1px solid var(--pk-line);
  color: var(--pk-text);
  font-family: var(--pk-serif);
  font-size: 22px;
}

.pk-modal-upload {
  margin-top: 22px;
  padding: 12px 14px 8px;
  border-radius: 14px;
  background: rgba(34, 211, 238, 0.06);
  border: 1px solid rgba(34, 211, 238, 0.18);
  transition:
    background 0.5s var(--pk-ease),
    border-color 0.5s var(--pk-ease);
}

.pk-modal-upload.is-done {
  background: rgba(74, 222, 128, 0.06);
  border-color: rgba(74, 222, 128, 0.22);
}

.pk-modal-upload-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--pk-text-2);
}

.pk-modal-upload-head .n-icon {
  color: #22d3ee;
}

.is-done .pk-modal-upload-head .n-icon {
  color: #4ade80;
}

.pk-modal-upload-label {
  flex: 1;
}

.pk-modal-upload-count {
  font-variant-numeric: tabular-nums;
  color: var(--pk-text-3);
}

.pk-stripe-slot {
  margin: 14px 0 18px;
  padding: 26px 16px;
  border-radius: 14px;
  border: 1px dashed var(--pk-line-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--pk-text-3);
}

.pk-modal-error {
  margin: 18px 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  color: #fecaca;
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.25);
}

.pk-modal-note {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--pk-text-3);
}

.pk-modal-enter-active,
.pk-modal-leave-active {
  transition: opacity 0.35s var(--pk-ease);
}
.pk-modal-enter-active .pk-modal-card,
.pk-modal-leave-active .pk-modal-card {
  transition:
    transform 0.45s var(--pk-ease),
    opacity 0.35s var(--pk-ease);
}
.pk-modal-enter-from,
.pk-modal-leave-to {
  opacity: 0;
}
.pk-modal-enter-from .pk-modal-card,
.pk-modal-leave-to .pk-modal-card {
  transform: translateY(24px) scale(0.97);
  opacity: 0;
}
</style>
