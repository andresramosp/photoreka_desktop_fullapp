<template>
  <Teleport to="body">
    <!-- ── Floating trigger button (visible when panel is closed) ── -->
    <transition name="assistant-fab-anim">
      <button
        v-if="!store.isOpen && store.activeSection"
        class="assistant-fab"
        title="Open Assistant"
        @click="store.open()"
      >
        <n-icon :size="34">
          <ChatIcon />
        </n-icon>
        <!-- <span v-if="store.messages.length > 0" class="assistant-fab-dot" /> -->
      </button>
    </transition>

    <!-- ── Mobile backdrop ── -->
    <transition name="assistant-fade">
      <div
        v-if="store.isOpen && isMobile"
        class="assistant-backdrop"
        @click="store.close()"
      />
    </transition>

    <!-- ── Chat panel ── -->
    <transition name="assistant-slide">
      <div
        v-if="store.isOpen"
        class="assistant-panel"
        :class="{ 'is-mobile': isMobile }"
      >
        <!-- Header -->
        <div class="assistant-panel-header">
          <div class="assistant-header-brand">
            <AppLogo layout="icon" :height="26" />
            <span class="assistant-header-title"
              >{{ store.activeSection }} Help</span
            >
          </div>
          <div class="assistant-header-controls">
            <n-button
              v-if="store.messages.length > 0"
              quaternary
              size="small"
              title="New chat"
              @click="store.clearSession()"
            >
              <template #icon>
                <n-icon :size="14"><CreateIcon /></n-icon>
              </template>
            </n-button>
            <n-button
              quaternary
              size="small"
              title="Close"
              @click="store.close()"
            >
              <template #icon>
                <n-icon :size="16"><CloseIcon /></n-icon>
              </template>
            </n-button>
          </div>
        </div>

        <!-- Messages body -->
        <div class="assistant-body" ref="messagesRef">
          <!-- Welcome state (no messages yet) -->
          <div v-if="store.messages.length === 0" class="assistant-welcome">
            <n-icon :size="54" class="assistant-welcome-icon">
              <ChatIcon />
            </n-icon>
            <p class="assistant-welcome-text">How can I help you here?</p>
            <p class="assistant-welcome-subtitle">
              This is a help assistant. Use
              <span
                class="assistant-subtitle-link"
                @click="navigateTo('/chat-lab')"
                >ChatLab</span
              >
              for advanced photo curation.
            </p>
          </div>

          <!-- Message rows -->
          <div
            v-for="(msg, idx) in store.messages"
            :key="idx"
            class="assistant-msg-row"
            :class="{
              'is-user': msg.role === 'user',
              'is-assistant': msg.role === 'assistant',
            }"
          >
            <div class="assistant-bubble" :class="{ 'is-error': msg.isError }">
              <!-- User bubble: plain text -->
              <p v-if="msg.role === 'user'" class="assistant-msg-text">
                {{ msg.content }}
              </p>

              <!-- Assistant bubble: rendered markdown -->
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div
                v-else
                class="assistant-msg-text markdown-content"
                v-html="renderMarkdown(msg.content)"
                @click="handleMarkdownClick"
              />

              <!-- Photo results (if any) -->
              <div
                v-if="msg.photoLists && msg.photoLists.length > 0"
                class="assistant-photo-results"
              >
                <div
                  v-for="(pList, li) in msg.photoLists"
                  :key="li"
                  class="assistant-photo-list"
                >
                  <p
                    v-if="msg.photoLists.length > 1"
                    class="assistant-photo-list-label"
                  >
                    {{ pList.label }}
                  </p>
                  <div class="assistant-photo-grid">
                    <div
                      v-for="photo in getPhotosForIds(pList.photoIds)"
                      :key="photo.id"
                      class="assistant-photo-item"
                    >
                      <PhotoCardHub
                        :photo="photo"
                        :showName="true"
                        :showFooter="false"
                        :showDelete="false"
                        :showDuplicate="false"
                        :isUploading="false"
                        :selected="false"
                        @info="showPhotoInfo"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="store.isSending" class="assistant-msg-row is-assistant">
            <div class="assistant-bubble">
              <div class="typing-dots"><span /><span /><span /></div>
            </div>
          </div>
        </div>

        <!-- Contact support bar -->
        <div class="assistant-contact-bar">
          Need more help?
          <a href="mailto:hello@photoreka.com" class="assistant-contact-link"
            >hello@photoreka.com</a
          >
        </div>

        <!-- Quick pills row (always visible above the input) -->
        <div v-if="availablePills().length" class="assistant-pills-container">
          <transition name="assistant-pills-fade">
            <div v-if="showPills" class="assistant-pills-row">
              <button
                v-for="pill in availablePills()"
                :key="pill.label"
                class="assistant-pill"
                @click="handlePillClick(pill)"
              >
                {{ pill.label }}
              </button>
            </div>
          </transition>
          <button
            v-if="!showPills"
            class="assistant-pills-toggle"
            title="Show suggestions"
            @click="showPills = true"
          >
            <n-icon :size="14"><ChevronUpIcon /></n-icon>
            <span>Open suggestions</span>
          </button>
        </div>

        <!-- Input area -->
        <div class="assistant-input-area">
          <n-input
            v-model:value="inputText"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            placeholder="Ask anything…"
            @keydown="handleKeyDown"
            class="assistant-input"
          />
          <n-button
            circle
            type="primary"
            size="medium"
            :disabled="!inputText.trim() || store.isSending"
            :loading="store.isSending"
            @click="sendMessage"
          >
            <template #icon>
              <n-icon><SendIcon /></n-icon>
            </template>
          </n-button>
        </div>
      </div>
    </transition>

    <!-- Photo info dialog (teleported with the widget) -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
      :all-photos="[]"
      :current-photo-index="-1"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { NIcon, NButton, NInput } from "naive-ui";
import { useRouter } from "vue-router";
import AppLogo from "@/components/AppLogo.vue";
import PhotoCardHub from "@/components/photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import { useAssistantChatStore } from "@/stores/assistantChat.js";
import { usePhotosStore } from "@/stores/photos.js";
import { marked } from "marked";
import {
  CloseOutline as CloseIcon,
  SendOutline as SendIcon,
  CreateOutline as CreateIcon,
  HelpCircleOutline as ChatIcon,
  ChevronUpOutline as ChevronUpIcon,
} from "@vicons/ionicons5";

// ── Props ────────────────────────────────────────────────────────────────────

interface Pill {
  label: string;
  prompt: string;
  /** If false, only populates input without auto-sending. Defaults to true. */
  autoSend?: boolean;
}

// (No props — section is driven by the store's activeSection)

// ── Store / composables ──────────────────────────────────────────────────────

const store = useAssistantChatStore();
const photosStore = usePhotosStore();
const router = useRouter();

// ── Local state ──────────────────────────────────────────────────────────────

const inputText = ref("");
const messagesRef = ref<HTMLElement | null>(null);
const isMobile = ref(window.innerWidth < 768);
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref<any>(null);
const showPillsBySection = ref<Record<string, boolean>>({});
const clickedPillsBySection = ref<Record<string, Set<string>>>({});

const showPills = computed({
  get: () => showPillsBySection.value[store.activeSection ?? ""] ?? true,
  set: (val: boolean) => {
    showPillsBySection.value[store.activeSection ?? ""] = val;
  },
});

const getClickedPills = (): Set<string> => {
  const key = store.activeSection ?? "";
  if (!clickedPillsBySection.value[key]) {
    clickedPillsBySection.value[key] = new Set();
  }
  return clickedPillsBySection.value[key];
};

// ── Lifecycle ────────────────────────────────────────────────────────────────

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

onMounted(() => window.addEventListener("resize", checkMobile));
onUnmounted(() => window.removeEventListener("resize", checkMobile));

// Scroll to bottom whenever a new message arrives
watch(
  () => store.messages.length,
  (newLen) => {
    scrollToBottom();
    // When a session is cleared, reset this section's pills state
    if (newLen === 0) {
      const key = store.activeSection ?? "";
      delete clickedPillsBySection.value[key];
      showPillsBySection.value[key] = true;
    }
  },
  { flush: "post" },
);

// Scroll to bottom when the panel opens (if there are existing messages)
watch(
  () => store.isOpen,
  (val) => {
    if (val) nextTick(() => scrollToBottom());
  },
);

// ── Helpers ──────────────────────────────────────────────────────────────────

const scrollToBottom = async () => {
  await nextTick();
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
};

const availablePills = () => {
  const pills = store.pillsForSection(store.activeSection ?? "");
  const clicked = getClickedPills();
  return pills.filter((pill) => !clicked.has(pill.label));
};

// ── Markdown rendering (mirrors ChatView logic) ───────────────────────────────

const PHOTO_TOKEN = /\[\[photo:(\d+)\|([^\]]+)\]\]/g;
const NESTED_PHOTO_TOKEN = /\[\[photo:\[\[photo:(\d+)\|([^\]]+)\]\][^\]]*\]\]/g;
const URL_TOKEN = /\{url:(\/[^|}\s]*)(?:\|([^}]*))?\}/g;

const normalizePhotoTokens = (text: string): string =>
  text.replace(
    NESTED_PHOTO_TOKEN,
    (_, id, filename) => `[[photo:${id}|${filename}]]`,
  );

const renderMarkdown = (content: string): string => {
  const unescaped = content.replace(/\\n/g, "\n");
  const normalized = normalizePhotoTokens(unescaped);
  const html = marked(normalized) as string;
  return html
    .replace(
      PHOTO_TOKEN,
      (_, id, filename) =>
        `<span class="photo-inline-link" data-photo-id="${id}" title="${filename}">${filename}</span>`,
    )
    .replace(
      URL_TOKEN,
      (_, path, label) =>
        `<span class="app-url-link" data-app-url="${path}">${label || path}</span>`,
    );
};
const handleMarkdownClick = (e: MouseEvent) => {
  // Handle app-internal URL links
  const urlTarget = (e.target as HTMLElement).closest(
    "[data-app-url]",
  ) as HTMLElement | null;
  if (urlTarget) {
    const appUrl = urlTarget.dataset.appUrl;
    if (appUrl) {
      router.push(appUrl);
      return;
    }
  }

  // Photo inline links → open photo info
  const target = (e.target as HTMLElement).closest(
    "[data-photo-id]",
  ) as HTMLElement | null;
  if (!target) return;
  const photoId = target.dataset.photoId;
  if (!photoId) return;
  const photo = photosStore.photos.find((p: any) => String(p.id) === photoId);
  if (photo) showPhotoInfo(photo);
};

// ── Photos ───────────────────────────────────────────────────────────────────

const getPhotosForIds = (photoIds: number[]) =>
  photoIds
    .map((id) => {
      const photo = photosStore.photos.find(
        (p: any) => String(p.id) === String(id),
      );
      if (!photo) return null;
      return {
        id: String(photo.id),
        title: photo.title || photo.name || "Photo",
        name: photo.name || photo.title || "Photo",
        url: photo.url,
        thumbnailUrl: photo.thumbnailUrl || photo.url,
        rating: photo.rating ?? 0,
        isUploading: false,
        file: null,
        needProcess: false,
        isDuplicate: false,
        originalFileName:
          photo.originalFileName || photo.name || photo.title || "photo",
        isCheckingDuplicates: false,
        status: "processed",
      };
    })
    .filter(Boolean);

const showPhotoInfo = async (photo: any) => {
  const full = await (photosStore as any)
    .fetchPhoto(photo.id)
    .catch(() => null);
  if (full) {
    selectedDialogPhoto.value = full;
    showPhotoInfoDialog.value = true;
  }
};

// ── Messaging ────────────────────────────────────────────────────────────────

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || store.isSending) return;
  inputText.value = "";
  await store.sendMessage(text);
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

const handlePillClick = (pill: Pill) => {
  inputText.value = pill.prompt;
  showPills.value = false;
  getClickedPills().add(pill.label);
  if (pill.autoSend !== false) {
    sendMessage();
  }
};

const navigateTo = (path: string) => {
  router.push(path);
  store.close();
};
</script>

<style scoped>
/* ══════════════════════════════════════════════
   FAB – floating action button
   ══════════════════════════════════════════════ */

.assistant-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1400;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  background: var(--accent-color, #6366f1);
  color: var(--text-on-accent, #e8e8e8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.assistant-fab:hover {
  transform: scale(1.07);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.45);
}

.assistant-fab-dot {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #f59e0b;
  border: 2px solid var(--primary-color, #6366f1);
}

/* FAB appear / disappear */
.assistant-fab-anim-enter-from,
.assistant-fab-anim-leave-to {
  opacity: 0;
  transform: scale(0.6);
}
.assistant-fab-anim-enter-active,
.assistant-fab-anim-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

/* ══════════════════════════════════════════════
   Backdrop (mobile only)
   ══════════════════════════════════════════════ */

.assistant-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1490;
}

.assistant-fade-enter-from,
.assistant-fade-leave-to {
  opacity: 0;
}
.assistant-fade-enter-active,
.assistant-fade-leave-active {
  transition: opacity 0.25s ease;
}

/* ══════════════════════════════════════════════
   Panel
   ══════════════════════════════════════════════ */

.assistant-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 450px;
  z-index: 1500;
  background: var(--bg-card);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.4);
}

/* Mobile: full screen */
.assistant-panel.is-mobile {
  width: 100%;
  left: 0;
  border-left: none;
}

/* Slide-in from right */
.assistant-slide-enter-from,
.assistant-slide-leave-to {
  transform: translateX(100%);
}
.assistant-slide-enter-active {
  transition: transform 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}
.assistant-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.6, 1);
}

/* ══════════════════════════════════════════════
   Header
   ══════════════════════════════════════════════ */

.assistant-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.assistant-header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.assistant-header-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.assistant-header-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* ══════════════════════════════════════════════
   Body – message list
   ══════════════════════════════════════════════ */

.assistant-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}

.assistant-body::-webkit-scrollbar {
  width: 4px;
}
.assistant-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

/* ── Welcome ── */
.assistant-welcome {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 12px;
  text-align: center;
}

.assistant-welcome-icon {
  opacity: 0.35;
  color: var(--primary-color, #6366f1);
}

.assistant-welcome-text {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0;
}

.assistant-welcome-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
  line-height: 1.5;
}

.assistant-subtitle-link {
  color: var(--accent-color, #818cf8);
  cursor: pointer;
  transition: color 0.15s;
}

.assistant-subtitle-link:hover {
  color: var(--primary-color, #a5b4fc);
}

/* ── Message rows ── */
.assistant-msg-row {
  display: flex;
  flex-direction: column;
}
.assistant-msg-row.is-user {
  align-items: flex-end;
}
.assistant-msg-row.is-assistant {
  align-items: flex-start;
}

.assistant-bubble {
  max-width: 88%;
  padding: 9px 13px;
  border-radius: 16px;
  font-size: 13.5px;
  line-height: 1.55;
}

.is-user .assistant-bubble {
  background: var(--primary-color, #6366f1);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.is-assistant .assistant-bubble {
  background: var(--bg-surface-hover);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.assistant-bubble.is-error {
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.28);
  color: #fca5a5;
}

.assistant-msg-text {
  margin: 0;
  word-break: break-word;
}

/* ── Markdown inside assistant bubbles ── */
.is-assistant .assistant-bubble :deep(.markdown-content p) {
  margin: 0 0 6px;
}
.is-assistant .assistant-bubble :deep(.markdown-content p:last-child) {
  margin-bottom: 0;
}
.is-assistant .assistant-bubble :deep(.markdown-content h1),
.is-assistant .assistant-bubble :deep(.markdown-content h2),
.is-assistant .assistant-bubble :deep(.markdown-content h3),
.is-assistant .assistant-bubble :deep(.markdown-content h4) {
  font-weight: 600;
  margin: 10px 0 5px;
  font-size: 0.9em;
  color: var(--text-primary);
}
.is-assistant .assistant-bubble :deep(.markdown-content ul),
.is-assistant .assistant-bubble :deep(.markdown-content ol) {
  padding-left: 18px;
  margin: 5px 0;
}
.is-assistant .assistant-bubble :deep(.markdown-content li) {
  margin-bottom: 3px;
}
.is-assistant .assistant-bubble :deep(.markdown-content code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.87em;
}
.is-assistant .assistant-bubble :deep(.markdown-content pre) {
  background: rgba(0, 0, 0, 0.3);
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}
.is-assistant .assistant-bubble :deep(.markdown-content pre code) {
  background: none;
  padding: 0;
}
.is-assistant .assistant-bubble :deep(.markdown-content strong) {
  font-weight: 600;
}
.is-assistant .assistant-bubble :deep(.markdown-content a),
.is-assistant .assistant-bubble :deep(.photo-inline-link),
.is-assistant .assistant-bubble :deep(.app-url-link) {
  color: var(--primary-color, #818cf8);
  cursor: pointer;
  text-decoration: underline;
}

/* ── Typing indicator ── */
.typing-dots {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 16px;
}
.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-tertiary);
  animation: assistant-bounce 1.4s infinite both;
}
.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes assistant-bounce {
  0%,
  80%,
  100% {
    transform: scale(0.75);
    opacity: 0.4;
  }
  40% {
    transform: scale(1.1);
    opacity: 1;
  }
}

/* ── Photo results ── */
.assistant-photo-results {
  margin-top: 10px;
}
.assistant-photo-list {
  margin-bottom: 8px;
}
.assistant-photo-list-label {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
  margin: 0 0 5px;
}
.assistant-photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}
.assistant-photo-item {
  border-radius: 6px;
  overflow: hidden;
  aspect-ratio: 1;
}

/* ══════════════════════════════════════════════
   Contact support bar
   ══════════════════════════════════════════════ */

.assistant-contact-bar {
  flex-shrink: 0;
  padding: 7px 14px;
  border-top: 1px solid var(--border-color);
  font-size: 11.5px;
  color: var(--text-tertiary);
  text-align: center;
}

.assistant-contact-link {
  color: var(--accent-color, #818cf8);
  text-decoration: none;
  transition: color 0.15s;
}
.assistant-contact-link:hover {
  color: var(--primary-color, #a5b4fc);
  text-decoration: underline;
}

/* ══════════════════════════════════════════════
   Pills row
   ══════════════════════════════════════════════ */

.assistant-pills-container {
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  display: flex;
  min-height: 35px;
}

.assistant-pills-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  max-height: 220px;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  scrollbar-width: thin;
}
.assistant-pills-row::-webkit-scrollbar {
  width: 4px;
}
.assistant-pills-row::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.assistant-pills-fade-enter-active,
.assistant-pills-fade-leave-active {
  transition:
    opacity 0.15s ease,
    max-height 0.15s ease;
}
.assistant-pills-fade-enter-from,
.assistant-pills-fade-leave-to {
  opacity: 0;
  max-height: 0;
}

.assistant-pills-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 8px;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
}
.assistant-pills-toggle:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.03);
}

.assistant-pill {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-color, #818cf8);
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
  line-height: 1.4;
  text-align: left;
  width: 100%;
}
.assistant-pill:hover {
  background: rgba(99, 102, 241, 0.18);
  border-color: rgba(99, 102, 241, 0.45);
}

/* ══════════════════════════════════════════════
   Input area
   ══════════════════════════════════════════════ */

.assistant-input-area {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.assistant-input {
  flex: 1;
}

.assistant-input :deep(textarea) {
  background: transparent !important;
  font-size: 13.5px;
  resize: none;
}

/* ══════════════════════════════════════════════
   Mobile overrides
   ══════════════════════════════════════════════ */

@media (max-width: 768px) {
  .assistant-panel {
    width: 100%;
    border-left: none;
  }
  .assistant-photo-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
