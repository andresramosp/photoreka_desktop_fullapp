<template>
  <div class="chat-view">
    <!-- Chat Header (shown only while a conversation is active) -->
    <div v-if="messages.length > 0" class="chat-header">
      <span class="chat-header-title">ChatLab</span>
      <n-button
        quaternary
        size="small"
        @click="resetChat"
        class="new-chat-btn"
        title="New chat"
      >
        <template #icon>
          <n-icon :size="16"><CreateIcon /></n-icon>
        </template>
        New chat
      </n-button>
    </div>

    <!-- Main Chat Area -->
    <div class="chat-main" ref="chatMainRef">
      <!-- Welcome / Suggestions (visible before chatting) -->
      <div v-if="messages.length === 0" class="chat-welcome">
        <div class="welcome-content">
          <n-icon :size="isMobile ? 48 : 64" class="welcome-icon">
            <RobotOutlined />
          </n-icon>

          <h2 class="welcome-title">Talk to your photos</h2>
          <p class="welcome-description">
            Ask questions about your library, get curation advice, or explore
            your catalog with Photoreka's ChatLab assistance.
          </p>

          <div class="suggestion-cards">
            <div
              v-for="(suggestion, index) in suggestions"
              :key="index"
              class="suggestion-card"
              @click="handleSuggestionClick(suggestion)"
            >
              <div class="suggestion-icon">
                <n-icon :size="20">
                  <component :is="suggestion.icon" />
                </n-icon>
              </div>
              <div class="suggestion-content">
                <span class="suggestion-title">{{ suggestion.title }}</span>
                <span class="suggestion-desc">{{
                  suggestion.description
                }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Chat Messages -->
      <div v-else class="chat-messages" ref="messagesRef">
        <div
          v-for="(message, index) in messages"
          :key="index"
          class="message-row"
          :class="{
            'message-user': message.role === 'user',
            'message-assistant': message.role === 'assistant',
          }"
        >
          <div class="message-avatar">
            <AppLogo
              v-if="message.role === 'assistant'"
              layout="icon"
              :height="42"
            />

            <n-icon :size="18" v-else>
              <PersonIcon />
            </n-icon>
          </div>
          <div
            class="message-bubble"
            :class="{ 'error-bubble': message.isError }"
          >
            <template v-if="message.role === 'user'">
              <div
                v-if="
                  message.attachedPhotos && message.attachedPhotos.length > 0
                "
                class="message-photos message-photos--user"
              >
                <div class="message-photos-grid">
                  <div
                    v-for="photo in message.attachedPhotos"
                    :key="photo.id"
                    class="message-photo-item"
                  >
                    <PhotoCardHub
                      :photo="photo"
                      :showName="true"
                      :showFooter="false"
                      :showDelete="false"
                      :showDuplicate="false"
                      :isUploading="photo.isUploading"
                      :selected="isPhotoSelectedInMessage(index, photo.id)"
                      @select="
                        (photoId) => toggleMessagePhotoSelection(index, photoId)
                      "
                      @info="showPhotoInfo"
                    />
                  </div>
                </div>
              </div>
              <p class="message-text">{{ message.content }}</p>
            </template>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div
              v-else
              class="message-text markdown-content"
              v-html="renderMarkdown(message.content)"
            ></div>
            <div
              v-if="message.photoIds && message.photoIds.length > 0"
              class="message-photos"
            >
              <div class="message-photos-grid">
                <div
                  v-for="photo in getPhotosForMessage(message.photoIds)"
                  :key="photo.id"
                  class="message-photo-item"
                >
                  <PhotoCardHub
                    :photo="photo"
                    :showName="true"
                    :showFooter="false"
                    :showDelete="false"
                    :showDuplicate="false"
                    :isUploading="photo.isUploading"
                    :selected="isPhotoSelectedInMessage(index, photo.id)"
                    @select="
                      (photoId) => toggleMessagePhotoSelection(index, photoId)
                    "
                    @info="showPhotoInfo"
                  />
                </div>
              </div>
            </div>
            <div class="message-footer">
              <span class="message-time">{{
                formatTime(message.timestamp)
              }}</span>
              <n-button
                v-if="
                  message.role === 'assistant' &&
                  message.photoIds &&
                  message.photoIds.length > 0
                "
                class="msg-add-to-btn"
                type="primary"
                secondary
                @click="handleAddMessagePhotosToCollection(message.photoIds)"
              >
                <template #icon>
                  <n-icon :size="11"><BookmarksOutline /></n-icon>
                </template>
                Add to collection
              </n-button>
            </div>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-if="isTyping" class="message-row message-assistant">
          <div class="message-avatar">
            <AppLogo layout="icon" :height="42" />
          </div>
          <div class="message-bubble typing-bubble">
            <div class="typing-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Area -->
    <div class="chat-input-area">
      <!-- Context Photos (shown above input when photos are added) -->
      <div v-if="contextPhotos.length > 0" class="context-photos-strip">
        <div class="context-photos-list">
          <div
            v-for="photo in contextPhotos"
            :key="photo.id"
            class="context-photo-wrapper"
          >
            <PhotoCardHub
              :photo="photo"
              :showName="true"
              :showFooter="false"
              :showDelete="false"
              :showDuplicate="false"
              :isUploading="photo.isUploading"
            />
            <button
              class="remove-photo-btn"
              @click="removeContextPhoto(photo.id)"
            >
              <n-icon :size="10"><CloseIcon /></n-icon>
            </button>
          </div>
        </div>
        <!-- <n-button
          quaternary
          size="tiny"
          @click="clearContextPhotos"
          class="clear-btn"
        >
          <n-icon :size="12" style="margin-right: 4px"><CloseIcon /></n-icon>
          Clear all
        </n-button> -->
      </div>

      <div class="chat-input-row">
        <!-- Add photos button (left of input) -->
        <n-button
          quaternary
          circle
          size="large"
          @click="photosDialogVisible = true"
          class="attach-btn"
          title="Add context photos"
        >
          <template #icon>
            <n-icon size="28"><PlusCircleFilled /></n-icon>
          </template>
        </n-button>

        <n-input
          v-model:value="inputText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          placeholder="Type a message..."
          @keydown="handleKeyDown"
          class="chat-input"
        />
        <n-button
          circle
          type="primary"
          :disabled="!inputText.trim() || isSending"
          :loading="isSending"
          @click="sendMessage"
          class="send-button"
        >
          <template #icon>
            <n-icon><SendIcon /></n-icon>
          </template>
        </n-button>
      </div>
    </div>

    <!-- Photos Selection Dialog -->
    <PhotosDialog
      v-model="photosDialogVisible"
      :is-trash="false"
      title="Add Context Photos"
      :displayLightboxTab="false"
      :displaySearch="true"
      @add-photos="onPhotosSelected"
    />

    <!-- Photo Info Dialog -->
    <PhotoInfoDialog
      v-model="showPhotoInfoDialog"
      :selected-photo="selectedDialogPhoto"
    />

    <!-- Collection Modal -->
    <CollectionModal
      :show="showCollectionModal"
      :photo-count="collectionModalPhotoIds.length"
      :photo-ids="collectionModalPhotoIds"
      @add-to-collection="handleCollectionAdded"
      @add-to-series="handleCollectionAdded"
      @cancel="showCollectionModal = false"
    />

    <!-- Photo Tool Selector -->
    <PhotoToolSelector
      :show="showToolSelector"
      :photo-count="selectedPhotoIds.length"
      current-tool="chat"
      :is-processing="isProcessingTool"
      @tool-selected="handleToolSelected"
      @close="closeToolSelector"
    />

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :selected-count="selectedPhotoIds.length"
      :show-delete="false"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :show-attach-to-chat="true"
      :is-deleting="isDeletingPhotos"
      :is-downloading="isDownloading"
      @clear-selection="clearAllSelectionsAndScopes"
      @delete="handleDeleteMultiple"
      @download="handleDownloadMultiple"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="openToolSelector"
      @attach-to-chat="handleAttachToChat"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, onActivated } from "vue";
import { NIcon, useMessage } from "naive-ui";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PhotoCardHub from "@/components/photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { api } from "@/utils/axios.js";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { usePhotoToolSelection } from "@/composables/usePhotoToolSelection.js";
import { marked } from "marked";
import {
  ImagesOutline as ImagesIcon,
  ImageOutline as ImageIcon,
  CloseOutline as CloseIcon,
  SparklesOutline as SparklesIcon,
  PersonOutline as PersonIcon,
  SendOutline as SendIcon,
  SearchOutline as SearchSuggestionIcon,
  ColorPaletteOutline as PaletteIcon,
  StarOutline as StarIcon,
  BulbOutline as BulbIcon,
  LayersOutline as LayersIcon,
  TrendingUpOutline as TrendingIcon,
  CreateOutline as CreateIcon,
  BookmarksOutline,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import { PlusCircleFilled, RobotOutlined } from "@vicons/antd";

defineOptions({ name: "ChatView" });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
  photoIds?: number[];
  attachedPhotos?: ContextPhoto[];
}

interface ContextPhoto {
  id: string;
  title: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  rating: number;
  isUploading: boolean;
  file: any;
  needProcess: boolean;
  isDuplicate: boolean;
  originalFileName: string;
  isCheckingDuplicates: boolean;
  status?: string;
}

const photosStore = usePhotosStore();
const message = useMessage();

const { downloadPhoto, downloadPhotosZip, isDownloading } = usePhotoDownload();
const {
  selectedPhotosRecord,
  selectedPhotoIds,
  togglePhotoSelection,
  clearAllSelections,
} = useLocalPhotoSelection();

// Per-message independent selection scopes so the same photo appearing in
// multiple bubbles doesn't get marked in all of them at once.
const perMessageSelections = ref<Record<number, Record<string, boolean>>>({});

const isPhotoSelectedInMessage = (
  messageIndex: number,
  photoId: string | number,
): boolean => {
  return !!perMessageSelections.value[messageIndex]?.[String(photoId)];
};

const toggleMessagePhotoSelection = (
  messageIndex: number,
  photoId: string | number,
) => {
  const id = String(photoId);
  if (!perMessageSelections.value[messageIndex]) {
    perMessageSelections.value[messageIndex] = {};
  }
  perMessageSelections.value[messageIndex][id] =
    !perMessageSelections.value[messageIndex][id];

  // Sync aggregated unique selections to the shared record for FloatingActionBar
  const allSelected = new Set<string>();
  for (const record of Object.values(perMessageSelections.value)) {
    for (const [k, v] of Object.entries(record)) {
      if (v) allSelected.add(k);
    }
  }
  selectedPhotosRecord.value = Object.fromEntries(
    [...allSelected].map((k) => [k, true]),
  );
};

const clearAllSelectionsAndScopes = () => {
  clearAllSelections();
  perMessageSelections.value = {};
};
const {
  isProcessing: isProcessingTool,
  showToolSelector,
  takeToTool,
  openToolSelector,
  closeToolSelector,
} = usePhotoToolSelection();

const showCollectionModal = ref(false);
const collectionModalPhotoIds = ref<(string | number)[]>([]);
const isDeletingPhotos = ref(false);

const inputText = ref("");
const messages = ref<ChatMessage[]>([]);
const isTyping = ref(false);
const isSending = ref(false);
const photosDialogVisible = ref(false);
const contextPhotos = ref<ContextPhoto[]>([]);
const chatMainRef = ref<HTMLElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const isMobile = ref(window.innerWidth < 768);
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref<any>(null);

const suggestions = [
  {
    title: "Help me find some photos",
    description:
      "Describe what you're looking for and I'll search your library",
    icon: SearchSuggestionIcon,
    prompt: "Hello, I'm looking for photos that ",
    needsPhotos: false,
    autoSend: false,
  },

  {
    title: "Sequence my photos",
    description:
      "Get suggestions for sequencing photos into a series or collection",
    icon: LayersIcon,
    prompt:
      "Can you create a sequence using these photos? Suggest a compelling order and explain the narrative or thematic flow you see. If possible, recommend a title for the series.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Portfolio insights",
    description: "Understand trends and strengths in your catalog",
    icon: SparklesIcon,
    prompt:
      "Analyze my photo library and give me portfolio insights. Where do I excel and what areas could I develop further?",
    needsPhotos: false,
    autoSend: true,
  },
  {
    title: "Find similar photos to these",
    description:
      "Find photos in my library with similar storytelling to these ones",
    icon: ImagesIcon,
    prompt:
      "Look at these photos and find others in my library that share a similar mood, subject matter, or storytelling style. Explain what visual or thematic thread connects them.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Which version is the best?",
    description:
      "I'm unsure which version of a photo to keep. Help me choose the best one",
    icon: StarIcon,
    prompt:
      "I have multiple versions of the same shot and I can't decide which to keep. Please compare these photos technically and artistically — sharpness, exposure, composition, expression — and recommend the strongest one with a clear reason.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Help with the app",
    description: "Ask me anything about how to use Photoreka",
    icon: BulbIcon,
    prompt: "Please explain how to use Photoreka to ",
    needsPhotos: false,
    autoSend: false,
  },
];

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

const loadPendingChatPhotos = () => {
  const pending = sessionStorage.getItem("chat_context_photos");
  if (!pending) return;
  sessionStorage.removeItem("chat_context_photos");
  try {
    const photos: ContextPhoto[] = JSON.parse(pending);
    if (!Array.isArray(photos) || photos.length === 0) return;
    const existingIds = new Set(contextPhotos.value.map((p) => p.id));
    const newPhotos = photos.filter((p) => !existingIds.has(p.id));
    contextPhotos.value.push(...newPhotos);
  } catch {
    // ignore parse errors
  }
};

onMounted(() => {
  resetChat();
  loadPendingChatPhotos();
  window.addEventListener("resize", checkMobile);
});

// Also fires on keep-alive re-activation (e.g. navigating back to /chat)
onActivated(() => {
  loadPendingChatPhotos();
});

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
});

const formatTime = (date: Date) => {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
};

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || isSending.value) return;

  // Snapshot and clear attached photos before sending
  const attachedPhotos = [...contextPhotos.value];
  contextPhotos.value = [];

  // Add user message with attached photos
  messages.value.push({
    role: "user",
    content: text,
    timestamp: new Date(),
    attachedPhotos: attachedPhotos.length > 0 ? attachedPhotos : undefined,
  });
  inputText.value = "";
  scrollToBottom();

  isTyping.value = true;
  isSending.value = true;
  scrollToBottom();

  try {
    const contextPhotoIds = attachedPhotos
      .map((p) => parseInt(p.id, 10))
      .filter((id) => !isNaN(id));

    const { data } = await api.post("/api/chat", {
      message: text,
      ...(contextPhotoIds.length > 0 && { contextPhotoIds }),
    });

    messages.value.push({
      role: "assistant",
      content: data.output,
      timestamp: new Date(),
      photoIds: data.photoIds,
    });
  } catch (error: any) {
    const errMsg =
      error?.response?.data?.message ||
      "Something went wrong. Please try again.";
    messages.value.push({
      role: "assistant",
      content: errMsg,
      timestamp: new Date(),
      isError: true,
    });
  } finally {
    isTyping.value = false;
    isSending.value = false;
    scrollToBottom();
  }
};

const renderMarkdown = (content: string): string => {
  return marked(content) as string;
};

const handleSuggestionClick = (suggestion: {
  title: string;
  prompt: string;
  needsPhotos: boolean;
  autoSend: boolean;
}) => {
  // Always pre-fill first so it's ready when photos are added
  inputText.value = suggestion.prompt;

  if (suggestion.needsPhotos && contextPhotos.value.length === 0) {
    // Open the photo picker — when user confirms, text is already set
    photosDialogVisible.value = true;
    return;
  }

  if (suggestion.autoSend) {
    sendMessage();
  }
  // else: just pre-fills the input so the user can complete and send manually
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

// Context photos management — PhotosDialog emits an array of photo IDs
const onPhotosSelected = (photoIds: string[]) => {
  const existingIds = new Set(contextPhotos.value.map((p) => p.id));
  const remaining = 10 - contextPhotos.value.length;

  const newPhotos: ContextPhoto[] = [];
  for (const id of photoIds) {
    if (newPhotos.length >= remaining) break;
    if (existingIds.has(id)) continue;

    const photo = photosStore.photos.find((p: any) => p.id === id);
    if (!photo) continue;

    newPhotos.push({
      id: photo.id,
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
    });
    existingIds.add(id);
  }

  contextPhotos.value.push(...newPhotos);
  photosDialogVisible.value = false;
};

const getPhotosForMessage = (photoIds: number[]): ContextPhoto[] => {
  return photoIds
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
      } as ContextPhoto;
    })
    .filter(Boolean) as ContextPhoto[];
};

const removeContextPhoto = (id: string) => {
  contextPhotos.value = contextPhotos.value.filter((p) => p.id !== id);
};

// Selection action handlers
const handleDeleteMultiple = async () => {
  isDeletingPhotos.value = true;
  try {
    await photosStore.deletePhotos(selectedPhotoIds.value);
    clearAllSelectionsAndScopes();
    message.success("Photos deleted");
  } catch {
    message.error("Error deleting photos");
  } finally {
    isDeletingPhotos.value = false;
  }
};

const handleDownloadMultiple = async () => {
  try {
    const photosToDownload = selectedPhotoIds.value
      .map((id: number) => photosStore.photos.find((p: any) => p.id == id))
      .filter(Boolean);
    if (photosToDownload.length === 1) {
      await downloadPhoto(photosToDownload[0]);
    } else {
      await downloadPhotosZip(photosToDownload);
    }
  } catch (error) {
    console.error("Download failed:", error);
  }
};

const handleAddToCollection = () => {
  if (selectedPhotoIds.value.length > 0) {
    collectionModalPhotoIds.value = [...selectedPhotoIds.value];
    showCollectionModal.value = true;
  }
};

const handleAddMessagePhotosToCollection = (photoIds: number[]) => {
  if (photoIds && photoIds.length > 0) {
    collectionModalPhotoIds.value = [...photoIds];
    showCollectionModal.value = true;
  }
};

const handleCollectionAdded = () => {
  clearAllSelectionsAndScopes();
  showCollectionModal.value = false;
};

const handleToolSelected = async (toolId: string) => {
  await takeToTool(toolId, selectedPhotoIds.value, clearAllSelectionsAndScopes);
  closeToolSelector();
};

const handleAttachToChat = () => {
  const existingIds = new Set(contextPhotos.value.map((p) => p.id));
  const remaining = 10 - contextPhotos.value.length;
  const newPhotos: ContextPhoto[] = [];

  for (const id of selectedPhotoIds.value) {
    if (newPhotos.length >= remaining) break;
    const strId = String(id);
    if (existingIds.has(strId)) continue;

    const photo = photosStore.photos.find((p: any) => String(p.id) === strId);
    if (!photo) continue;

    newPhotos.push({
      id: strId,
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
    });
    existingIds.add(strId);
  }

  contextPhotos.value.push(...newPhotos);
  clearAllSelectionsAndScopes();
};

const showPhotoInfo = async (photo: ContextPhoto) => {
  try {
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    if (fullPhoto) {
      selectedDialogPhoto.value = fullPhoto;
      showPhotoInfoDialog.value = true;
    } else {
      message.error("Photo not found");
    }
  } catch {
    message.error("Could not load photo info");
  }
};

const clearContextPhotos = () => {
  contextPhotos.value = [];
};

const resetChat = async () => {
  try {
    api.get("/api/chat/reset");
  } catch {
    // silently ignore reset errors
  }
  messages.value = [];
  contextPhotos.value = [];
  inputText.value = "";
  perMessageSelections.value = {};
};
</script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* ── Chat Header ── */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.chat-header-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-tertiary);
  letter-spacing: 0.03em;
}

.new-chat-btn {
  color: var(--text-secondary) !important;
  font-size: var(--font-size-xs) !important;
}

/* ── Context Photos Strip (inside input area) ── */
.context-photos-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  padding-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.context-photos-list {
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
  align-items: center;
  padding-bottom: 2px; /* room for scrollbar */
}

.context-photos-list::-webkit-scrollbar {
  height: 4px;
}

.context-photos-list::-webkit-scrollbar-track {
  background: transparent;
}

.context-photos-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.context-photo-wrapper {
  position: relative;
  flex-shrink: 0;
  width: 120px;
  height: 120px;
  border-radius: 12px;
}

.remove-photo-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-round);
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-tertiary);
  transition: all 0.15s;
  padding: 0;
  z-index: 10;
}

.remove-photo-btn:hover {
  background: var(--error-color);
  color: white;
  border-color: var(--error-color);
}

.clear-btn {
  flex-shrink: 0;
  font-size: var(--font-size-xs) !important;
  color: var(--text-tertiary) !important;
  white-space: nowrap;
}

/* ── Chat Main Area ── */
.chat-main {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Welcome / Suggestions ── */
.chat-welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
}

.welcome-content {
  text-align: center;
  max-width: 720px;
  width: 100%;
}

.welcome-icon {
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-lg);
}

.welcome-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-sm) 0;
}

.welcome-description {
  font-size: var(--font-size-md);
  color: var(--text-tertiary);
  margin: 0 0 var(--spacing-2xl) 0;
  line-height: var(--line-height-relaxed);
}

/* ── Suggestion Cards Grid ── */
.suggestion-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
  max-width: 640px;
  margin: 0 auto;
}

.suggestion-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
}

.suggestion-card:hover {
  border-color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 5%, var(--bg-surface));
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.suggestion-icon {
  color: var(--accent-color);
  opacity: 0.8;
}

.suggestion-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.suggestion-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  line-height: var(--line-height-tight);
}

.suggestion-desc {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: var(--line-height-relaxed);
}

/* ── Chat Messages ── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-lg) var(--spacing-xl);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.message-row {
  display: flex;
  gap: var(--spacing-sm);
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  align-items: flex-start;
}

.message-user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-round);
  /* background: var(--bg-surface); */
  /* border: 1px solid var(--border-color); */
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
}

.message-user .message-avatar {
  background: var(--primary-color);
  border-color: var(--accent-color);
  color: white;
}

.message-bubble {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-lg);
  max-width: 90%;
  position: relative;
  color: var(--text-primary);
}

.message-assistant .message-bubble {
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-top-left-radius: var(--radius-xs);
  width: 80%;
}

.message-user .message-bubble {
  background: var(--bg-container);
  color: var(--text-primary);
  border-top-right-radius: var(--radius-xs);
  width: 80%;
}

.message-text {
  margin: 0;
  font-size: 14px;

  line-height: var(--line-height-relaxed);
  word-break: break-word;
}

.message-user .message-time {
  color: rgba(255, 255, 255, 0.7);
}

/* ── Typing Indicator ── */
.typing-bubble {
  padding: var(--spacing-md) var(--spacing-lg);
}

.typing-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-round);
  background: var(--text-tertiary);
  animation: typingBounce 1.4s infinite ease-in-out;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typingBounce {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* ── Input Area ── */
.chat-input-area {
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  padding: var(--spacing-md) var(--spacing-lg) var(--spacing-lg);
}

.chat-input-area > * {
  max-width: 960px;
  margin-left: auto;
  margin-right: auto;
}

.chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-sm);
}

.attach-btn {
  flex-shrink: 0;
  color: var(--text-tertiary) !important;
}

.chat-input {
  flex: 1;
}

.send-button {
  flex-shrink: 0;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  .suggestion-cards {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-sm);
  }

  .chat-welcome {
    padding: var(--spacing-lg);
  }

  .welcome-title {
    font-size: var(--font-size-xl);
  }

  .welcome-description {
    font-size: var(--font-size-sm);
  }

  .chat-messages {
    padding: var(--spacing-md);
  }

  .chat-input-area {
    padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
  }

  .chat-input-row {
    gap: var(--spacing-xs);
  }

  .context-photo-wrapper {
    width: 100px !important;
    height: 100px !important;
  }
}

@media (max-width: 480px) {
  .suggestion-cards {
    grid-template-columns: 1fr;
  }

  .suggestion-card {
    flex-direction: row;
    align-items: center;
    padding: var(--spacing-md);
  }

  .suggestion-desc {
    display: none;
  }
}

/* ── Message Footer ── */
.message-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--spacing-xs);
  gap: var(--spacing-sm);
}

.message-time {
  font-size: 10px;
  color: var(--text-tertiary);
  opacity: 0.7;
}

.msg-add-to-btn {
  font-size: var(--font-size-xs) !important;
  /* color: var(--text-tertiary) !important; */
  height: 20px !important;
  padding: 0 6px !important;
  opacity: 1;
  transition: opacity 0.15s;
}

/* ── Message Photos Grid ── */
.message-photos {
  margin-top: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
  padding-top: var(--spacing-sm);
}

.message-photos--user {
  margin-top: 0;
  margin-bottom: var(--spacing-sm);
  border-top: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.25);
  padding-top: 0;
  padding-bottom: var(--spacing-sm);
}

.message-photos-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--spacing-sm);
}

.message-photo-item {
  border-radius: var(--radius-md);
  aspect-ratio: 1;
}

@media (max-width: 768px) {
  .message-user .message-bubble,
  .message-assistant .message-bubble {
    width: 92%;
  }

  .message-photos-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ── Error bubble ── */
.error-bubble {
  border-color: var(--error-color) !important;
  background: color-mix(
    in srgb,
    var(--error-color) 8%,
    var(--bg-surface)
  ) !important;
}

/* ── Markdown content (assistant messages) ── */
.message-assistant .message-bubble :deep(.markdown-content) {
  font-size: 14px;

  line-height: var(--line-height-relaxed);
  word-break: break-word;
  margin: 0;
}

.message-assistant .message-bubble :deep(.markdown-content p) {
  margin: 0 0 var(--spacing-sm) 0;
}

.message-assistant .message-bubble :deep(.markdown-content p:last-child) {
  margin-bottom: 0;
}

.message-assistant .message-bubble :deep(.markdown-content h1),
.message-assistant .message-bubble :deep(.markdown-content h2),
.message-assistant .message-bubble :deep(.markdown-content h3),
.message-assistant .message-bubble :deep(.markdown-content h4) {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: var(--spacing-md) 0 var(--spacing-xs) 0;
  line-height: var(--line-height-tight);
}

.message-assistant .message-bubble :deep(.markdown-content h1) {
  font-size: var(--font-size-lg);
}
.message-assistant .message-bubble :deep(.markdown-content h2) {
  font-size: var(--font-size-md);
}
.message-assistant .message-bubble :deep(.markdown-content h3) {
  font-size: var(--font-size-sm);
}

.message-assistant .message-bubble :deep(.markdown-content ul),
.message-assistant .message-bubble :deep(.markdown-content ol) {
  margin: var(--spacing-xs) 0 var(--spacing-sm) 0;
  padding-left: var(--spacing-lg);
}

.message-assistant .message-bubble :deep(.markdown-content li) {
  margin-bottom: var(--spacing-xs);
}

.message-assistant .message-bubble :deep(.markdown-content code) {
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 0.875em;
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
}

.message-assistant .message-bubble :deep(.markdown-content pre) {
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  overflow-x: auto;
  margin: var(--spacing-sm) 0;
}

.message-assistant .message-bubble :deep(.markdown-content pre code) {
  background: none;
  border: none;
  padding: 0;
  font-size: var(--font-size-xs);
}

.message-assistant .message-bubble :deep(.markdown-content blockquote) {
  border-left: 3px solid var(--accent-color);
  margin: var(--spacing-sm) 0;
  padding: var(--spacing-xs) var(--spacing-md);
  color: var(--text-tertiary);
  font-style: italic;
}

.message-assistant .message-bubble :deep(.markdown-content a) {
  color: var(--accent-color);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.message-assistant .message-bubble :deep(.markdown-content strong) {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.message-assistant .message-bubble :deep(.markdown-content table) {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-xs);
  margin: var(--spacing-sm) 0;
}

.message-assistant .message-bubble :deep(.markdown-content th),
.message-assistant .message-bubble :deep(.markdown-content td) {
  border: 1px solid var(--border-color);
  padding: var(--spacing-xs) var(--spacing-sm);
  text-align: left;
}

.message-assistant .message-bubble :deep(.markdown-content th) {
  background: var(--bg-body);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.message-assistant .message-bubble :deep(.markdown-content hr) {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: var(--spacing-md) 0;
}
</style>
