<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { NIcon } from "naive-ui";
import { CheckmarkOutline, ChevronDownOutline, TrophyOutline } from "@vicons/ionicons5";
import {
  PICKS_AWARD_MIN_SCORE,
  PICKS_AWARDS,
  getPicksJury,
  isAwardJury,
} from "@/config/picks";
import { formatCount } from "@/utils/picks/format";
import PicksJuryTip from "./PicksJuryTip.vue";
import PicksTooltip from "./PicksTooltip.vue";

const GENERIC_AWARD = "award";

const props = defineProps<{
  juryCounts: Record<string, number>;
  /** Selected jury id, or null when ranking by a single criterion. */
  activeJuryId: string | null;
}>();
const emit = defineEmits<{ select: [juryId: string] }>();

const open = ref(false);
const pill = ref<HTMLElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const position = ref({ top: 0, left: 0, maxHeight: 0 });
const VIEWPORT_MARGIN = 16;

const isActive = computed(() => props.activeJuryId !== null && isAwardJury(props.activeJuryId));
// The pill keeps the last award chosen, so it reads as the active competition.
const shownId = computed(() => (isActive.value ? props.activeJuryId! : GENERIC_AWARD));
const shown = computed(() => getPicksJury(shownId.value));

const options = computed(() => [
  {
    id: GENERIC_AWARD,
    label: "Any competition",
    tagline: "The general award jury, all genres.",
    jury: getPicksJury(GENERIC_AWARD),
    count: props.juryCounts[GENERIC_AWARD] ?? 0,
  },
  ...PICKS_AWARDS.map((award) => ({
    id: award.id,
    label: award.label,
    tagline: award.tagline,
    jury: award,
    count: props.juryCounts[award.id] ?? 0,
  })),
]);

const noMatchNote = `No photo in this set reaches ${PICKS_AWARD_MIN_SCORE.toFixed(1)} with this jury.`;

// An empty jury must not make the whole pill look disabled: clicking it opens
// the list instead, where a specific competition may still have photos.
const shownEmpty = computed(() => !props.juryCounts[shownId.value]);
const othersHaveMatches = computed(() =>
  options.value.some((option) => option.id !== shownId.value && option.count > 0),
);
const pillNote = computed(() => {
  if (!shownEmpty.value) return undefined;
  return othersHaveMatches.value
    ? `${noMatchNote} Open the list: other competitions do have photos.`
    : noMatchNote;
});

function onMainClick() {
  if (shownEmpty.value) toggle();
  else emit("select", shownId.value);
}

// The pills row scrolls horizontally and would clip a regular dropdown, so the
// menu is teleported out and anchored under the pill.
function place() {
  const rect = pill.value?.getBoundingClientRect();
  if (!rect) return;
  const width = 320;
  const top = rect.bottom + 8;
  position.value = {
    top,
    left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
    // Whatever room is left under the pill; the list scrolls inside it.
    maxHeight: window.innerHeight - top - VIEWPORT_MARGIN,
  };
}

function toggle() {
  if (!open.value) place();
  open.value = !open.value;
}

function choose(id: string) {
  open.value = false;
  emit("select", id);
}

function onPointer(event: PointerEvent) {
  const target = event.target as Node;
  if (!menu.value?.contains(target) && !pill.value?.contains(target)) open.value = false;
}

const close = () => (open.value = false);
function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

watch(open, (isOpen) => {
  const method = isOpen ? "addEventListener" : "removeEventListener";
  document[method]("pointerdown", onPointer as EventListener);
  window[method]("keydown", onKey as EventListener);
  window[method]("resize", close);
  document.querySelector(".picks-root")?.[method]("scroll", close);
});

onBeforeUnmount(() => (open.value = false));
</script>

<template>
  <div ref="pill" class="pk-award" :class="{ 'is-active': isActive }">
    <PicksTooltip>
      <template #trigger>
        <button
          class="pk-award-main"
          :class="{ 'is-empty': shownEmpty }"
          @click="onMainClick"
        >
          <n-icon :size="15"><TrophyOutline /></n-icon>
          {{ shownId === GENERIC_AWARD ? "Award-winning" : shown.label }}
          <span class="pk-pill-count">{{ formatCount(juryCounts[shownId] ?? 0) }}</span>
        </button>
      </template>
      <PicksJuryTip
        :jury="shown"
        :title="shownId === GENERIC_AWARD ? 'Award-winning' : undefined"
        :note="pillNote"
      />
    </PicksTooltip>
    <button
      class="pk-award-toggle"
      :class="{ 'is-open': open }"
      aria-label="Choose a competition"
      :aria-expanded="open"
      @click="toggle"
    >
      <n-icon :size="14"><ChevronDownOutline /></n-icon>
    </button>
  </div>

  <Teleport to=".picks-root">
    <Transition name="pk-award-pop">
      <div
        v-if="open"
        ref="menu"
        class="pk-award-menu"
        role="menu"
        :style="{
          top: `${position.top}px`,
          left: `${position.left}px`,
          maxHeight: `${position.maxHeight}px`,
        }"
      >
        <p class="pk-eyebrow">Competitions</p>
        <p class="pk-award-note">
          Every jury here only keeps photos scoring {{ PICKS_AWARD_MIN_SCORE.toFixed(1) }} or more.
        </p>
        <PicksTooltip
          v-for="option in options"
          :key="option.id"
          placement="right"
          :delay="400"
          block
        >
          <template #trigger>
            <button
              class="pk-award-option"
              :class="{ 'is-selected': option.id === activeJuryId }"
              role="menuitem"
              :disabled="!option.count"
              @click="choose(option.id)"
            >
              <span class="pk-award-option-text">
                <span class="pk-award-option-label">{{ option.label }}</span>
                <span class="pk-award-option-tagline">{{ option.tagline }}</span>
              </span>
              <n-icon v-if="option.id === activeJuryId" :size="15" class="pk-award-check">
                <CheckmarkOutline />
              </n-icon>
              <span class="pk-pill-count">{{ formatCount(option.count) }}</span>
            </button>
          </template>
          <PicksJuryTip
            :jury="option.jury"
            :title="option.label"
            :note="option.count ? undefined : noMatchNote"
          />
        </PicksTooltip>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pk-award {
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid var(--pk-line);
  background: rgba(255, 255, 255, 0.03);
  transition:
    border-color 0.25s var(--pk-ease),
    background 0.25s var(--pk-ease),
    box-shadow 0.25s var(--pk-ease);
}

.pk-award:hover {
  border-color: var(--pk-line-strong);
}

.pk-award.is-active {
  border-color: rgba(244, 183, 64, 0.55);
  background: rgba(244, 183, 64, 0.1);
  box-shadow:
    inset 0 0 0 1px rgba(244, 183, 64, 0.15),
    0 8px 24px -10px rgba(244, 183, 64, 0.5);
}

.pk-award-main,
.pk-award-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  color: var(--pk-text-2);
  font: 500 13px var(--pk-sans);
  cursor: pointer;
  transition: color 0.25s var(--pk-ease);
}

.pk-award-main {
  padding: 9px 10px 9px 16px;
  white-space: nowrap;
}

.pk-award-toggle {
  padding: 9px 12px 9px 8px;
  border-left: 1px solid var(--pk-line);
}

.pk-award-toggle .n-icon {
  transition: transform 0.3s var(--pk-ease);
}

.pk-award-toggle.is-open .n-icon {
  transform: rotate(180deg);
}

.pk-award-main:hover,
.pk-award-toggle:hover {
  color: var(--pk-text);
}

.pk-award.is-active .pk-award-main,
.pk-award.is-active .pk-award-toggle {
  color: var(--pk-gold-2);
}

/* Only the zero count is dimmed; the label stays readable and clickable. */
.pk-award-main.is-empty .pk-pill-count {
  opacity: 0.5;
}

.pk-pill-count {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--pk-text-3);
  background: rgba(255, 255, 255, 0.06);
}

.pk-award.is-active .pk-award-main .pk-pill-count {
  color: #1a1206;
  background: var(--pk-gold-gradient);
}

.pk-award-menu {
  position: fixed;
  z-index: 45;
  width: 320px;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(28, 28, 36, 0.97), rgba(16, 16, 22, 0.98));
  border: 1px solid var(--pk-line-strong);
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(16px);
}

.pk-award-note {
  margin: 6px 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--pk-text-3);
}

.pk-award-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: none;
  color: var(--pk-text);
  text-align: left;
  cursor: pointer;
  transition:
    background 0.2s var(--pk-ease),
    border-color 0.2s var(--pk-ease);
}

.pk-award-option:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.05);
}

.pk-award-option.is-selected {
  border-color: rgba(244, 183, 64, 0.45);
  background: rgba(244, 183, 64, 0.08);
}

.pk-award-option:disabled {
  opacity: 0.4;
  cursor: default;
}

.pk-award-option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pk-award-option-label {
  font: 600 13px var(--pk-sans);
}

.pk-award-option-tagline {
  font-size: 12px;
  color: var(--pk-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pk-award-check {
  color: var(--pk-gold);
}

.pk-award-pop-enter-active,
.pk-award-pop-leave-active {
  transition:
    opacity 0.2s var(--pk-ease),
    transform 0.2s var(--pk-ease);
}

.pk-award-pop-enter-from,
.pk-award-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
