<template>
  <div class="mention-input-wrap">
    <!-- Highlight overlay: renders the exact same text as the textarea, with
         mentioned ranges colored in primary. Textarea text is transparent so
         only this overlay's glyphs are visible; native caret/selection still
         come from the real textarea sitting on top. -->
    <div
      class="mention-text-metrics mention-highlight-overlay"
      ref="overlayRef"
      aria-hidden="true"
      :style="reservedPaddingStyle"
    >
      <template v-for="(seg, i) in segments" :key="i">
        <span v-if="seg.mention" class="mention-chip-overlay">{{
          seg.text
        }}</span>
        <span v-else>{{ seg.text }}</span>
      </template>
      <span v-if="endsWithNewline">&nbsp;</span>
    </div>

    <!-- Hidden mirror used only to measure the pixel position of the "@" trigger
         for dropdown placement (classic textarea-caret-position technique). -->
    <div
      class="mention-text-metrics mention-caret-mirror"
      ref="mirrorRef"
      aria-hidden="true"
    ></div>

    <textarea
      ref="textareaRef"
      class="mention-text-metrics mention-textarea"
      :style="reservedPaddingStyle"
      :value="rawText"
      :placeholder="placeholder"
      rows="1"
      @input="onInput"
      @keydown="onKeydown"
      @keyup="onKeyup"
      @click="recalcTrigger"
      @mouseup="recalcTrigger"
      @scroll="syncScroll"
      @blur="onBlur"
    ></textarea>

    <Transition name="mention-dropdown-fade">
      <div
        v-if="dropdownOpen"
        ref="dropdownRef"
        class="mention-dropdown"
        :style="dropdownStyle"
        @mousedown.prevent
        @touchstart.stop
      >
        <div v-if="query.length < 2" class="mention-hint">
          Keep typing to search…
        </div>
        <div v-else-if="isSearching" class="mention-hint">Searching…</div>
        <div v-else-if="!hasSuggestions" class="mention-hint">
          No matches for "{{ query }}"
        </div>
        <template v-else>
          <div
            v-if="suggestionGroups.collections.length"
            class="mention-section"
          >
            <div class="mention-section-header">
              <n-icon :size="12"><GridOutline /></n-icon>
              <span>Collections</span>
            </div>
            <div
              v-for="item in suggestionGroups.collections"
              :key="`collection-${item.id}`"
              class="mention-item"
              :class="{ active: isActive('collection', item.id) }"
              @click="selectSuggestion(item)"
              @mouseenter="setActive('collection', item.id)"
            >
              <div class="mention-item-thumb">
                <img
                  v-if="item.coverUrl"
                  :src="item.coverUrl"
                  :alt="item.name"
                />
                <div v-else class="mention-item-thumb-fallback">
                  <n-icon :size="14"><GridOutline /></n-icon>
                </div>
              </div>
              <div class="mention-item-content">
                <div class="mention-item-name">{{ item.name }}</div>
                <div class="mention-item-meta">
                  {{ item.photoCount }} photos
                </div>
              </div>
            </div>
          </div>

          <div v-if="suggestionGroups.series.length" class="mention-section">
            <div class="mention-section-header">
              <n-icon :size="12"><ListOutline /></n-icon>
              <span>Series</span>
            </div>
            <div
              v-for="item in suggestionGroups.series"
              :key="`series-${item.id}`"
              class="mention-item"
              :class="{ active: isActive('series', item.id) }"
              @click="selectSuggestion(item)"
              @mouseenter="setActive('series', item.id)"
            >
              <div class="mention-item-thumb">
                <img
                  v-if="item.coverUrl"
                  :src="item.coverUrl"
                  :alt="item.name"
                />
                <div v-else class="mention-item-thumb-fallback">
                  <n-icon :size="14"><ListOutline /></n-icon>
                </div>
              </div>
              <div class="mention-item-content">
                <div class="mention-item-name">{{ item.name }}</div>
                <div class="mention-item-meta">
                  {{ item.photoCount }} photos
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="suggestionGroups.portfolios.length"
            class="mention-section"
          >
            <div class="mention-section-header">
              <n-icon :size="12"><PortfolioIcon /></n-icon>
              <span>Portfolios</span>
            </div>
            <div
              v-for="item in suggestionGroups.portfolios"
              :key="`portfolio-${item.id}`"
              class="mention-item"
              :class="{ active: isActive('portfolio', item.id) }"
              @click="selectSuggestion(item)"
              @mouseenter="setActive('portfolio', item.id)"
            >
              <div class="mention-item-thumb">
                <img
                  v-if="item.coverUrl"
                  :src="item.coverUrl"
                  :alt="item.name"
                />
                <div v-else class="mention-item-thumb-fallback">
                  <n-icon :size="14"><PortfolioIcon /></n-icon>
                </div>
              </div>
              <div class="mention-item-content">
                <div class="mention-item-name">{{ item.name }}</div>
                <div class="mention-item-meta">
                  {{ item.photoCount }} photos
                </div>
              </div>
            </div>
          </div>

          <div v-if="suggestionGroups.photos.length" class="mention-section">
            <div class="mention-section-header">
              <n-icon :size="12"><ImageOutline /></n-icon>
              <span>Photos</span>
            </div>
            <div
              v-for="item in suggestionGroups.photos"
              :key="`photo-${item.id}`"
              class="mention-item"
              :class="{
                active: isActive('photo', item.id),
                attached: isAttached(item.id),
              }"
              @click="selectSuggestion(item)"
              @mouseenter="setActive('photo', item.id)"
            >
              <div class="mention-item-thumb">
                <img
                  v-if="item.thumbnailUrl"
                  :src="item.thumbnailUrl"
                  :alt="item.name"
                />
                <div v-else class="mention-item-thumb-fallback">
                  <n-icon :size="14"><ImageOutline /></n-icon>
                </div>
              </div>
              <div class="mention-item-content">
                <div class="mention-item-name">{{ item.name }}</div>
                <div v-if="isAttached(item.id)" class="mention-item-meta">
                  Already attached
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { NIcon } from "naive-ui";
import {
  GridOutline,
  ListOutline,
  ImageOutline,
  BriefcaseOutline as PortfolioIcon,
} from "@vicons/ionicons5";
import {
  useGlobalSearch,
  type SearchResult,
} from "@/composables/useGlobalSearch";

const props = defineProps<{
  modelValue: string;
  attachedPhotoIds?: (string | number)[];
  photoLimitReached?: boolean;
  placeholder?: string;
  /** Total right padding (px) to reserve space for an overlaid control (e.g. a mode
   *  selector chip docked in the input's bottom-right corner). Applied identically to
   *  the textarea and the highlight overlay so their text wraps in lockstep. */
  reserveRightPx?: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "submit"): void;
  (e: "attach-photo", photo: SearchResult): void;
  (e: "flash-photo", photoId: string | number): void;
}>();

interface Mention {
  start: number;
  end: number;
  type: "collection" | "series" | "portfolio";
  id: number;
  name: string;
}

// Name capture is lazy over any character (not just "non-]") so resource names that
// themselves contain brackets (e.g. "[Pattern] Marketplace Narratives") still match —
// it stops at the first "]]" it finds rather than the first stray "]".
const MENTION_TOKEN_RE =
  /\[\[(collection|series|portfolio):(\d+)\|([\s\S]+?)\]\]/g;

function serialize(text: string, mentionList: Mention[]): string {
  if (mentionList.length === 0) return text;
  const sorted = [...mentionList].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const m of sorted) {
    out += text.slice(cursor, m.start);
    out += `[[${m.type}:${m.id}|${m.name}]]`;
    cursor = m.end;
  }
  out += text.slice(cursor);
  return out;
}

function deserialize(text: string): {
  display: string;
  mentionList: Mention[];
} {
  const mentionList: Mention[] = [];
  let display = "";
  let lastIndex = 0;
  MENTION_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN_RE.exec(text)) !== null) {
    const [full, type, id, name] = match;
    display += text.slice(lastIndex, match.index);
    const start = display.length;
    const displayText = `@${name}`;
    display += displayText;
    mentionList.push({
      start,
      end: start + displayText.length,
      type: type as Mention["type"],
      id: Number(id),
      name,
    });
    lastIndex = match.index + full.length;
  }
  display += text.slice(lastIndex);
  return { display, mentionList };
}

const initial = deserialize(props.modelValue || "");
const rawText = ref(initial.display);
const mentions = ref<Mention[]>(initial.mentionList);
const lastEmitted = ref(props.modelValue || "");
let prevValue = rawText.value;

const overlayRef = ref<HTMLElement | null>(null);
const mirrorRef = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const endsWithNewline = computed(() => rawText.value.endsWith("\n"));

const reservedPaddingStyle = computed(() => ({
  paddingRight: `${props.reserveRightPx || 14}px`,
}));

const segments = computed(() => {
  const text = rawText.value;
  if (mentions.value.length === 0) return [{ text, mention: false }];
  const sorted = [...mentions.value].sort((a, b) => a.start - b.start);
  const out: { text: string; mention: boolean }[] = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.start > cursor)
      out.push({ text: text.slice(cursor, m.start), mention: false });
    out.push({ text: text.slice(m.start, m.end), mention: true });
    cursor = m.end;
  }
  if (cursor < text.length)
    out.push({ text: text.slice(cursor), mention: false });
  return out;
});

function emitValue() {
  const serialized = serialize(rawText.value, mentions.value);
  lastEmitted.value = serialized;
  emit("update:modelValue", serialized);
}

watch(
  () => props.modelValue,
  (newVal) => {
    const value = newVal || "";
    if (value === lastEmitted.value) return; // our own echo
    const { display, mentionList } = deserialize(value);
    rawText.value = display;
    mentions.value = mentionList;
    prevValue = display;
    lastEmitted.value = value;
    nextTick(() => {
      autosize();
      syncScroll();
    });
  },
);

// ── Autosize (min 1 row, max 4 rows) ─────────────────────────
function autosize() {
  const ta = textareaRef.value;
  if (!ta) return;
  const style = window.getComputedStyle(ta);
  const lineHeight = parseFloat(style.lineHeight) || 20;
  const paddingV =
    parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const borderV =
    parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const maxHeight = lineHeight * 4 + paddingV + borderV;
  ta.style.height = "auto";
  ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
}

function syncScroll() {
  if (overlayRef.value && textareaRef.value) {
    overlayRef.value.scrollTop = textareaRef.value.scrollTop;
    overlayRef.value.scrollLeft = textareaRef.value.scrollLeft;
  }
}

// ── Diff-based mention offset tracking ───────────────────────
function diffAndAdjustMentions(oldVal: string, newVal: string) {
  const oldLen = oldVal.length;
  const newLen = newVal.length;
  const maxPrefix = Math.min(oldLen, newLen);
  let prefixLen = 0;
  while (prefixLen < maxPrefix && oldVal[prefixLen] === newVal[prefixLen])
    prefixLen++;
  let suffixLen = 0;
  const maxSuffix = maxPrefix - prefixLen;
  while (
    suffixLen < maxSuffix &&
    oldVal[oldLen - 1 - suffixLen] === newVal[newLen - 1 - suffixLen]
  )
    suffixLen++;
  const delta = newLen - oldLen;
  const oldEditEnd = oldLen - suffixLen;
  const updated: Mention[] = [];
  for (const m of mentions.value) {
    if (m.end <= prefixLen) {
      updated.push(m);
    } else if (m.start >= oldEditEnd) {
      updated.push({ ...m, start: m.start + delta, end: m.end + delta });
    }
    // else: edit overlaps this mention -> drop it, it degrades to plain text
  }
  mentions.value = updated;
}

function onInput(e: Event) {
  const newValue = (e.target as HTMLTextAreaElement).value;
  diffAndAdjustMentions(prevValue, newValue);
  rawText.value = newValue;
  prevValue = newValue;
  emitValue();
  nextTick(() => {
    autosize();
    syncScroll();
    recalcTrigger();
  });
}

function removeRange(start: number, end: number) {
  if (start === end) return;
  const newText = rawText.value.slice(0, start) + rawText.value.slice(end);
  const delta = start - end;
  const updated = mentions.value
    .filter((m) => !(m.start >= start && m.start < end))
    .map((m) =>
      m.start >= end ? { ...m, start: m.start + delta, end: m.end + delta } : m,
    );
  mentions.value = updated;
  rawText.value = newText;
  prevValue = newText;
  emitValue();
  nextTick(() => {
    autosize();
    const ta = textareaRef.value;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(start, start);
    }
  });
}

// ── Keyboard handling ────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (
    dropdownOpen.value &&
    ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)
  ) {
    handleDropdownKey(e);
    return;
  }

  const ta = e.target as HTMLTextAreaElement;
  if (
    (e.key === "Backspace" || e.key === "Delete") &&
    ta.selectionStart === ta.selectionEnd
  ) {
    const pos = ta.selectionStart;
    const m =
      e.key === "Backspace"
        ? mentions.value.find((m) => m.end === pos)
        : mentions.value.find((m) => m.start === pos);
    if (m) {
      e.preventDefault();
      removeRange(m.start, m.end);
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    emit("submit");
  }
}

function onKeyup(e: KeyboardEvent) {
  if (
    dropdownOpen.value &&
    ["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(e.key)
  ) {
    // Already handled by the dropdown in onKeydown (caret didn't move) — skip recalculation
    // to avoid re-triggering ensureDataLoaded / re-rendering the suggestion list mid-navigation.
    return;
  }
  if (
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
      e.key,
    )
  ) {
    recalcTrigger();
  }
}

function onBlur() {
  setTimeout(() => closeDropdown(), 0);
}

// ── @ trigger detection ──────────────────────────────────────
const dropdownOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const triggerStart = ref(-1);
const query = ref("");
const activeIndex = ref(0);
const dropdownStyle = ref<Record<string, string>>({});

function closeDropdown() {
  dropdownOpen.value = false;
  triggerStart.value = -1;
  query.value = "";
  activeIndex.value = 0;
  searchQuery.value = "";
}

function recalcTrigger() {
  const ta = textareaRef.value;
  if (!ta || ta.selectionStart !== ta.selectionEnd) {
    closeDropdown();
    return;
  }
  const caret = ta.selectionStart;
  const text = rawText.value;
  const uptoCaret = text.slice(0, caret);
  const at = uptoCaret.lastIndexOf("@");
  if (at === -1) {
    closeDropdown();
    return;
  }
  const between = uptoCaret.slice(at + 1);
  if (between.includes("\n") || between.length > 60) {
    closeDropdown();
    return;
  }
  if (mentions.value.some((m) => at >= m.start && at < m.end)) {
    closeDropdown();
    return;
  }
  const charBefore = at > 0 ? text[at - 1] : "";
  if (charBefore && !/\s/.test(charBefore)) {
    closeDropdown();
    return;
  }

  const isNewTrigger = !dropdownOpen.value || triggerStart.value !== at;
  triggerStart.value = at;
  query.value = between;
  dropdownOpen.value = true;
  if (isNewTrigger) {
    ensureDataLoaded();
    nextTick(() => positionDropdown());
  }
}

function positionDropdown() {
  const ta = textareaRef.value;
  const mirror = mirrorRef.value;
  if (!ta || !mirror) return;
  const style = window.getComputedStyle(ta);
  mirror.style.width = ta.clientWidth + "px";

  const textBefore = rawText.value.slice(0, triggerStart.value);
  mirror.textContent = "";
  mirror.appendChild(document.createTextNode(textBefore));
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.appendChild(marker);

  const taRect = ta.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const relTop = markerRect.top - mirrorRect.top;
  const relLeft = markerRect.left - mirrorRect.left;
  const lineHeight = parseFloat(style.lineHeight) || 20;

  let top = taRect.top + relTop - ta.scrollTop;
  let left = taRect.left + relLeft - ta.scrollLeft;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dropdownWidth = Math.min(320, vw - 16);
  const estimatedHeight = 320;

  if (left + dropdownWidth > vw - 8) left = vw - dropdownWidth - 8;
  if (left < 8) left = 8;

  const style_: Record<string, string> = {
    left: `${left}px`,
    width: `${dropdownWidth}px`,
  };
  if (top - estimatedHeight > 8) {
    // enough room above the caret line — open upward (typical for a bottom-docked composer)
    style_.bottom = `${vh - top + 4}px`;
    style_.top = "auto";
  } else {
    style_.top = `${top + lineHeight + 4}px`;
    style_.bottom = "auto";
  }
  dropdownStyle.value = style_;
}

// ── Suggestions (reuses the same search logic as GlobalSearchAutocomplete) ──
const { searchQuery, searchResults, isSearching, ensureDataLoaded } =
  useGlobalSearch();

watch(query, (q) => {
  searchQuery.value = q;
});

const suggestionGroups = computed(() => {
  const r = searchResults.value;
  return {
    collections: r.collections,
    series: r.series,
    portfolios: r.portfolios,
    photos: props.photoLimitReached ? [] : r.photos,
  };
});

const flatSuggestions = computed<SearchResult[]>(() => [
  ...suggestionGroups.value.collections,
  ...suggestionGroups.value.series,
  ...suggestionGroups.value.portfolios,
  ...suggestionGroups.value.photos,
]);

const hasSuggestions = computed(() => flatSuggestions.value.length > 0);

watch(flatSuggestions, () => {
  activeIndex.value = 0;
});

watch(activeIndex, () => {
  nextTick(() => {
    const active = dropdownRef.value?.querySelector(".mention-item.active");
    active?.scrollIntoView({ block: "nearest" });
  });
});

const activeItem = computed(
  () => flatSuggestions.value[activeIndex.value] || null,
);

function isActive(type: string, id: string | number) {
  return (
    !!activeItem.value &&
    activeItem.value.type === type &&
    String(activeItem.value.id) === String(id)
  );
}

function setActive(type: string, id: string | number) {
  const idx = flatSuggestions.value.findIndex(
    (i) => i.type === type && String(i.id) === String(id),
  );
  if (idx >= 0) activeIndex.value = idx;
}

function isAttached(photoId: string | number) {
  return (props.attachedPhotoIds || []).some(
    (id) => String(id) === String(photoId),
  );
}

function handleDropdownKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (flatSuggestions.value.length === 0) return;
    activeIndex.value = (activeIndex.value + 1) % flatSuggestions.value.length;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (flatSuggestions.value.length === 0) return;
    activeIndex.value =
      (activeIndex.value - 1 + flatSuggestions.value.length) %
      flatSuggestions.value.length;
  } else if (e.key === "Enter") {
    e.preventDefault();
    const item = flatSuggestions.value[activeIndex.value];
    if (item) selectSuggestion(item);
    else closeDropdown();
  } else if (e.key === "Tab") {
    const item = flatSuggestions.value[activeIndex.value];
    if (item) {
      e.preventDefault();
      selectSuggestion(item);
    } else {
      closeDropdown();
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeDropdown();
  }
}

function selectSuggestion(item: SearchResult) {
  const ta = textareaRef.value;
  const caret = ta ? ta.selectionStart : rawText.value.length;
  const start = triggerStart.value;

  if (item.type === "photo") {
    const already = isAttached(item.id);
    // Photos are attached out-of-band (not sent as [[photo:id|name]] tokens like the
    // other mention types), so we insert the name as plain text — visible to the user
    // but not treated as a mention chip or serialized into the API payload.
    const insertText = `${item.name} `;
    const before = rawText.value.slice(0, start);
    const after = rawText.value.slice(caret);
    const newText = `${before}${insertText}${after}`;
    const delta = insertText.length - (caret - start);
    mentions.value = mentions.value.map((m) =>
      m.start >= caret ? { ...m, start: m.start + delta, end: m.end + delta } : m,
    );
    rawText.value = newText;
    prevValue = newText;
    emitValue();
    closeDropdown();

    if (already) emit("flash-photo", item.id);
    else emit("attach-photo", item);

    const newCaret = start + insertText.length;
    nextTick(() => {
      autosize();
      if (ta) {
        ta.focus();
        ta.setSelectionRange(newCaret, newCaret);
      }
    });
    return;
  }

  const displayText = `@${item.name}`;
  const before = rawText.value.slice(0, start);
  const after = rawText.value.slice(caret);
  const newText = `${before}${displayText} ${after}`;
  const delta = displayText.length + 1 - (caret - start);

  const updatedMentions = mentions.value.map((m) =>
    m.start >= caret ? { ...m, start: m.start + delta, end: m.end + delta } : m,
  );
  updatedMentions.push({
    start,
    end: start + displayText.length,
    type: item.type as Mention["type"],
    id: Number(item.id),
    name: item.name,
  });
  mentions.value = updatedMentions;
  rawText.value = newText;
  prevValue = newText;
  emitValue();
  closeDropdown();

  const newCaret = start + displayText.length + 1;
  nextTick(() => {
    autosize();
    if (ta) {
      ta.focus();
      ta.setSelectionRange(newCaret, newCaret);
    }
  });
}

function handleWindowResize() {
  if (dropdownOpen.value) positionDropdown();
}

onMounted(() => {
  autosize();
  window.addEventListener("resize", handleWindowResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleWindowResize);
});

defineExpose({
  focus: () => textareaRef.value?.focus(),
});
</script>

<style scoped>
.mention-input-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

/* Shared metrics — MUST stay identical across all three elements below so the
   overlay's glyphs and the caret mirror line up exactly with the real textarea. */
.mention-text-metrics {
  margin: 0;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  letter-spacing: normal;
  padding: 10px 14px;
  border: 1px solid transparent;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  box-sizing: border-box;
}

.mention-textarea {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  min-height: 40px;
  max-height: 120px;
  background: transparent;
  color: transparent;
  caret-color: var(--text-primary);
  border-radius: 0;
  border: 1px solid var(--border-color);
  resize: none;
  overflow-y: auto;
  outline: none;
  transition: border-color 0.15s ease;
}

.mention-textarea:focus {
  border-color: var(--primary-color);
}

.mention-textarea::placeholder {
  color: var(--text-tertiary);
}

.mention-highlight-overlay {
  position: absolute;
  inset: 0;
  z-index: 0;
  color: var(--text-primary);
  pointer-events: none;
  overflow: hidden;
  border-color: transparent;
  border-radius: 0;
}

.mention-chip-overlay {
  color: var(--primary-color);
  background: var(--primary-15);
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.mention-caret-mirror {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  height: auto;
  max-height: none;
  overflow: visible;
  z-index: -1;
  pointer-events: none;
}

/* ── Dropdown ── */
.mention-dropdown {
  position: fixed;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-height: 320px;
  overflow-y: auto;
  z-index: 6000;
}

.mention-dropdown-fade-enter-active,
.mention-dropdown-fade-leave-active {
  transition: opacity 0.12s ease;
}
.mention-dropdown-fade-enter-from,
.mention-dropdown-fade-leave-to {
  opacity: 0;
}

.mention-hint {
  padding: var(--spacing-md) var(--spacing-lg);
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.mention-section {
  padding: var(--spacing-xs) 0;
}

.mention-section:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
}

.mention-section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-lg);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.mention-item:hover,
.mention-item.active {
  background: var(--primary-15);
}

.mention-item-thumb {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-surface);
}

.mention-item-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-item-thumb-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.mention-item-content {
  flex: 1;
  min-width: 0;
}

.mention-item-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mention-item-meta {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.mention-item.attached .mention-item-meta {
  color: var(--primary-color);
}
</style>
