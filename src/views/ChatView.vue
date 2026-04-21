<template>
  <div class="chat-view">
    <!-- Sidebar Backdrop -->
    <transition name="backdrop-fade">
      <div
        v-if="showSidebar"
        class="sidebar-backdrop"
        @click="showSidebar = false"
      />
    </transition>

    <!-- Conversations Sidebar -->
    <transition name="sidebar-slide">
      <div v-if="showSidebar" class="chat-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">Conversations</span>
          <n-button
            quaternary
            size="small"
            @click="handleNewChat"
            title="New conversation"
          >
            <template #icon>
              <n-icon :size="16"><CreateIcon /></n-icon>
            </template>
          </n-button>
        </div>

        <div v-if="chatStore.isLoadingConversations" class="sidebar-loading">
          <n-spin size="small" />
          <span>Loading…</span>
        </div>

        <div
          v-else-if="chatStore.conversations.length === 0"
          class="sidebar-empty"
        >
          <n-icon :size="28" class="sidebar-empty-icon"><LayersIcon /></n-icon>
          <span>No conversations yet</span>
        </div>

        <div v-else class="sidebar-list">
          <div
            v-for="conv in chatStore.conversations"
            :key="conv.id"
            class="sidebar-item"
            :class="{ active: chatStore.activeConversationId === conv.id }"
            @click="handleLoadConversation(conv.id)"
          >
            <div class="sidebar-item-content">
              <span class="sidebar-item-title">{{
                conv.title || "Untitled"
              }}</span>
              <span class="sidebar-item-date">{{
                formatRelativeDate(conv.updatedAt)
              }}</span>
            </div>
            <div class="sidebar-item-delete-wrap" @click.stop>
              <template v-if="pendingDeleteId === conv.id">
                <n-button
                  size="tiny"
                  type="error"
                  class="sidebar-item-confirm-btn"
                  @click.stop="handleDeleteConversation(conv.id)"
                  >Delete</n-button
                >
                <n-button
                  size="tiny"
                  quaternary
                  class="sidebar-item-confirm-btn"
                  @click.stop="pendingDeleteId = null"
                  >Cancel</n-button
                >
              </template>
              <n-button
                v-else
                quaternary
                size="tiny"
                class="sidebar-item-delete"
                @click.stop="pendingDeleteId = conv.id"
                title="Delete conversation"
              >
                <template #icon>
                  <n-icon :size="13"><CloseIcon /></n-icon>
                </template>
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- Persistent Top Bar (always visible) -->
    <div class="chat-topbar">
      <div class="chat-topbar-left">
        <n-button
          v-if="!isDemoUser"
          quaternary
          size="small"
          class="sidebar-toggle-btn"
          :class="{ active: showSidebar }"
          title="Conversations"
          @click="showSidebar = !showSidebar"
        >
          <template #icon>
            <n-icon :size="17"><LayersIcon /></n-icon>
          </template>
        </n-button>
        <span v-if="chatStore.messages.length > 0" class="chat-topbar-title"
          >CHATLAB</span
        >
      </div>
      <n-button
        v-if="chatStore.messages.length > 0"
        quaternary
        size="small"
        class="new-chat-btn"
        @click="handleNewChat"
      >
        <template #icon>
          <n-icon :size="15"><CreateIcon /></n-icon>
        </template>
        New chat
      </n-button>
    </div>

    <!-- Main Chat Area -->
    <div class="chat-main" ref="chatMainRef">
      <!-- Welcome / Suggestions (visible before chatting) -->
      <div v-if="chatStore.messages.length === 0" class="chat-welcome">
        <div class="welcome-content">
          <n-icon :size="isMobile ? 48 : 64" class="welcome-icon">
            <RobotOutlined />
          </n-icon>

          <h2 class="welcome-title">Talk to your photos</h2>
          <p class="welcome-description">
            Ask questions about your library, get curation advice, or explore
            your catalog with Photoreka's ChatLab assistance.
          </p>

          <!-- Sub-queries panel (shown after clicking a card with subQueries) -->
          <div v-if="activeSuggestion" class="subquery-panel">
            <button class="subquery-back-btn" @click="activeSuggestion = null">
              <n-icon :size="14"><ArrowBackIcon /></n-icon>
              <span>Back</span>
            </button>
            <div class="subquery-panel-header">
              <n-icon :size="18" class="subquery-panel-icon">
                <component :is="activeSuggestion.icon" />
              </n-icon>
              <span class="subquery-panel-title">{{
                activeSuggestion.title
              }}</span>
            </div>
            <div class="subquery-list">
              <button
                v-for="(sq, sqIdx) in activeSuggestion.subQueries"
                :key="sqIdx"
                class="subquery-item"
                @click="handleSubQueryClick(sq)"
              >
                <n-icon :size="14" class="subquery-item-icon"
                  ><ChevronForwardIcon
                /></n-icon>
                <span>{{ sq.title }}</span>
              </button>
            </div>
          </div>

          <!-- Main suggestion cards -->
          <div v-else class="suggestion-cards">
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
              <n-icon
                v-if="suggestion.subQueries && suggestion.subQueries.length"
                :size="14"
                class="suggestion-expand-icon"
              >
                <ChevronForwardIcon />
              </n-icon>
            </div>
          </div>

          <!-- Recent conversations (welcome screen) -->
          <div
            v-if="
              !isDemoUser &&
              !activeSuggestion &&
              chatStore.conversations.length > 0
            "
            class="recent-convs"
          >
            <div class="recent-convs-header">
              <n-icon :size="13" class="recent-convs-icon"
                ><LayersIcon
              /></n-icon>
              <span class="recent-convs-title">Recent conversations</span>
            </div>
            <div class="recent-convs-list">
              <button
                v-for="conv in chatStore.conversations.slice(0, 5)"
                :key="conv.id"
                class="recent-conv-item"
                @click="handleLoadConversation(conv.id)"
              >
                <span class="recent-conv-title">{{
                  conv.title || "Untitled"
                }}</span>
                <span class="recent-conv-date">{{
                  formatRelativeDate(conv.updatedAt)
                }}</span>
              </button>
              <button
                v-if="chatStore.conversations.length > 5"
                class="recent-conv-more"
                @click="showSidebar = true"
              >
                <span
                  >View all
                  {{ chatStore.conversations.length }} conversations</span
                >
                <n-icon :size="13"><ChevronForwardIcon /></n-icon>
              </button>
            </div>
          </div>

          <p class="welcome-hint">
            ChatLab is a complementary tool. For best results, use it alongside
            Photoreka's other tools.
            <button class="welcome-hint-link" @click="showChatLabInfo = true">
              Read more
            </button>
          </p>
        </div>
      </div>

      <!-- Chat Messages -->
      <div v-else class="chat-messages" ref="messagesRef">
        <!-- Loading indicator when loading a conversation -->
        <div v-if="chatStore.isLoadingMessages" class="loading-messages">
          <n-spin size="medium" />
          <span>Loading conversation…</span>
        </div>

        <div
          v-for="(message, index) in chatStore.messages"
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
                      @info="(p) => showPhotoInfo(p, message.attachedPhotos)"
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
              @click="handleMarkdownClick"
              @mouseover="handleMarkdownMouseOver"
              @mouseout="handleMarkdownMouseOut"
            ></div>
            <!-- Photo results: single flat list (label === 'result') -->
            <div
              v-if="message.photoLists && message.photoLists.length === 1"
              class="message-photos"
            >
              <div class="message-photos-grid">
                <div
                  v-for="photo in getPhotosForMessage(
                    message.photoLists[0].photoIds,
                  )"
                  :key="photo.id"
                  class="message-photo-item"
                  :data-photo-id="photo.id"
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
                    @info="
                      (p) =>
                        showPhotoInfo(
                          p,
                          getPhotosForMessage(message.photoLists[0].photoIds),
                        )
                    "
                  />
                </div>
              </div>
            </div>
            <!-- Photo results: multiple labeled lists -->
            <div
              v-else-if="message.photoLists && message.photoLists.length > 0"
              class="message-photo-lists"
            >
              <div
                v-for="(list, listIdx) in message.photoLists"
                :key="listIdx"
                class="message-photo-list"
              >
                <div class="message-photo-list-label">{{ list.label }}</div>
                <div class="message-photos-grid">
                  <div
                    v-for="photo in getPhotosForMessage(list.photoIds)"
                    :key="photo.id"
                    class="message-photo-item"
                    :data-photo-id="photo.id"
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
                      @info="
                        (p) =>
                          showPhotoInfo(p, getPhotosForMessage(list.photoIds))
                      "
                    />
                  </div>
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
                  message.photoLists &&
                  message.photoLists.length > 0
                "
                class="msg-add-to-btn"
                type="primary"
                secondary
                @click="handleAddMessagePhotosToCollection(message.photoLists)"
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
              @info="(p) => showPhotoInfo(p, contextPhotos)"
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

        <div class="chat-input-wrap">
          <n-input
            v-model:value="inputText"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            placeholder="Type a message..."
            @keydown="handleKeyDown"
            class="chat-input"
          />
          <n-popover
            v-if="chatStore.chatModes.length > 0 || chatStore.isLoadingModes"
            v-model:show="showModePopover"
            trigger="click"
            placement="top-end"
            :width="260"
            raw
            class="chat-mode-popover"
          >
            <template #trigger>
              <button
                class="chat-mode-chip"
                :title="selectedChatMode?.description || 'Intelligence mode'"
              >
                <n-icon :size="13"><SparklesIcon /></n-icon>
                <span>{{ selectedChatMode?.name || "Mode" }}</span>
              </button>
            </template>
            <div class="chat-mode-panel">
              <div class="chat-mode-panel-header">Intelligence Mode</div>
              <div
                v-for="mode in chatStore.chatModes"
                :key="mode.id"
                class="chat-mode-item"
                :class="{ active: chatStore.selectedModeId === mode.id }"
                @click="handleModeChange(mode.id)"
              >
                <div class="chat-mode-item-header">
                  <span class="chat-mode-item-name">{{ mode.name }}</span>
                  <span
                    v-if="mode.costFactor != null"
                    class="chat-mode-item-cost"
                    >×{{ mode.costFactor }}</span
                  >
                </div>
                <div v-if="mode.description" class="chat-mode-item-desc">
                  {{ mode.description }}
                </div>
              </div>
            </div>
          </n-popover>
        </div>
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
      :all-photos="dialogNavigablePhotos"
      :current-photo-index="currentPhotoIndex"
      @photo-navigate="handlePhotoNavigate"
      @change-photo="selectedDialogPhoto = $event"
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

    <!-- ChatLab Info Dialog -->
    <transition name="backdrop-fade">
      <div
        v-if="showChatLabInfo"
        class="chatlab-info-backdrop"
        @click="showChatLabInfo = false"
      />
    </transition>
    <transition name="chatlab-info-pop">
      <div v-if="showChatLabInfo" class="chatlab-info-dialog">
        <div class="chatlab-info-header">
          <div class="chatlab-info-title-row">
            <n-icon :size="20" class="chatlab-info-icon"
              ><InformationCircleIcon
            /></n-icon>
            <span class="chatlab-info-title">About ChatLab</span>
          </div>
          <n-button quaternary size="small" @click="showChatLabInfo = false">
            <template #icon>
              <n-icon :size="14"><CloseIcon /></n-icon>
            </template>
          </n-button>
        </div>
        <div class="chatlab-info-body">
          <p>
            ChatLab is an advisory companion that helps you reflect on your
            work, discover hidden gems, and plan your next creative move. It is
            <strong>not</strong> an action engine — think of it as a thoughtful
            critic sitting beside you, offering perspective while you stay in
            control.
          </p>

          <h4 class="chatlab-info-h4">
            <n-icon :size="14" class="chatlab-h4-icon chatlab-h4-icon--can"
              ><CheckmarkCircleIcon
            /></n-icon>
            What ChatLab can do
          </h4>
          <ul>
            <li>
              Suggest photos that match a mood, theme, or narrative you
              describe.
            </li>
            <li>
              Propose sequences and series orders with storytelling rationale.
            </li>
            <li>
              Analyze your portfolio for patterns, strengths, and blind spots.
            </li>
            <li>
              Give you personalized feedback and suggestions based on your work.
            </li>
          </ul>

          <h4 class="chatlab-info-h4">
            <n-icon :size="14" class="chatlab-h4-icon chatlab-h4-icon--cannot"
              ><CloseCircleIcon
            /></n-icon>
            What ChatLab cannot do
          </h4>
          <ul>
            <li>Create, edit, or delete collections, series or canvases.</li>
            <li>Delete, move, or modify your photos in any way.</li>
            <li>Perform any write operation on your library.</li>
          </ul>

          <h4 class="chatlab-info-h4">
            <n-icon :size="14" class="chatlab-h4-icon chatlab-h4-icon--scope"
              ><EyeIcon
            /></n-icon>
            Visibility scope
          </h4>
          <p>
            Each prompt returns a focused selection of up to
            <strong>20 photos</strong>. While suggestions are informed by your
            overall library, the output is intentionally limited to keep results
            concise and usable — use
            <RouterLink to="/search">Search</RouterLink>,
            <RouterLink to="/2d-view">Atlas</RouterLink>, or
            <RouterLink to="/workspace">Workspace</RouterLink>
            to explore further.
          </p>

          <h4 class="chatlab-info-h4">
            <n-icon
              :size="14"
              class="chatlab-h4-icon chatlab-h4-icon--aesthetic"
              ><PaletteIcon
            /></n-icon>
            Aesthetic subjectivity
          </h4>
          <p>
            AI curation carries an inherent margin of interpretation. If a
            suggestion doesn't match your vision, try the
            <strong>visual score filters and rankings</strong> in
            <RouterLink to="/search">Search</RouterLink>,
            <RouterLink to="/2d-view">Atlas</RouterLink>, or
            <RouterLink to="/workspace">Workspace</RouterLink> for a data-driven
            first pass, then apply your own eye for the final pick. ChatLab is a
            second opinion, not the last word — the best curation emerges from
            the <strong>simbiosis between you and the system</strong>.
          </p>
        </div>
      </div>
    </transition>

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :selected-ids="selectedPhotoIds"
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
import {
  ref,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  onActivated,
} from "vue";
import { NIcon, NPopover, useMessage } from "naive-ui";
import { useRouter } from "vue-router";
import PhotosDialog from "@/components/PhotosDialog.vue";
import PhotoCardHub from "@/components/photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useChatStore } from "@/stores/chat.js";
import { useUserStore } from "@/stores/userStore";
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
  ChevronForwardOutline as ChevronForwardIcon,
  ArrowBackOutline as ArrowBackIcon,
  InformationCircleOutline as InformationCircleIcon,
  CheckmarkCircleOutline as CheckmarkCircleIcon,
  CloseCircleOutline as CloseCircleIcon,
  EyeOutline as EyeIcon,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import { PlusCircleFilled, RobotOutlined } from "@vicons/antd";

defineOptions({ name: "ChatView" });

interface SubQuery {
  title: string;
  prompt: string;
  needsPhotos: boolean;
  autoSend: boolean;
}

interface Suggestion {
  title: string;
  description: string;
  icon: any;
  prompt: string;
  needsPhotos: boolean;
  autoSend: boolean;
  subQueries?: SubQuery[];
}

interface PhotoList {
  label: string;
  photoIds: number[];
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
  photoLists?: PhotoList[];
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
const chatStore = useChatStore();
const userStore = useUserStore();
const message = useMessage();
const router = useRouter();

const isDemoUser = computed(
  () => userStore.user?.email === "demo@photorekatest.com",
);

const selectedChatMode = computed(() => chatStore.activeMode);

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
const isTyping = ref(false);
const isSending = ref(false);
const photosDialogVisible = ref(false);
const contextPhotos = ref<ContextPhoto[]>([]);
const chatMainRef = ref<HTMLElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const isMobile = ref(window.innerWidth < 768);
const showPhotoInfoDialog = ref(false);
const selectedDialogPhoto = ref<any>(null);
const dialogNavigablePhotos = ref<ContextPhoto[]>([]);

const currentPhotoIndex = computed(() => {
  if (!selectedDialogPhoto.value || dialogNavigablePhotos.value.length === 0)
    return -1;
  return dialogNavigablePhotos.value.findIndex(
    (p) => String(p.id) === String(selectedDialogPhoto.value.id),
  );
});
const showSidebar = ref(false);
const pendingDeleteId = ref<number | null>(null);
const showChatLabInfo = ref(false);
const showModePopover = ref(false);

const suggestions: Suggestion[] = [
  {
    title: "Help me find some photos",
    description:
      "Describe what you're looking for and I'll search your library",
    icon: SearchSuggestionIcon,
    prompt: "Hello, I'm looking for photos that ",
    needsPhotos: false,
    autoSend: false,
    subQueries: [
      {
        title: "Best Portrait Shots from Last 3 Years",
        prompt:
          "Search my library for my strongest portrait photos from the last 3 years. Only in colour and vertical format. Rank them by visual impact, storytelling, and overall cohesion.",
        needsPhotos: false,
        autoSend: true,
      },

      {
        title: "Street Photography Gems",
        prompt:
          "Look for photos that clearly capture a decisive moment, or funny situations that may not stand out as much in terms of aesthetics or composition and have gone unnoticed by me.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Curating Decay Study",
        prompt:
          "Find images with dark, decaying environments. Emphasize shadow, texture, abandonment, and emotional weight. Rank by atmospheric intensity.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Finding photos for awards",
        prompt:
          "Help me find photos for photography awards. They must be from the last year to meet the requirements. Give me suggestions for each specific award.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },

  {
    title: "Sequence my photos",
    description:
      "Get suggestions for sequencing photos into a series or collection",
    icon: LayersIcon,
    prompt:
      "Can you create a sequence using these photos? Suggest a compelling order and explain the narrativeflow you see. Recommend a title for the series.",
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
    subQueries: [
      {
        title: "Editing Style & Consistency",
        prompt:
          "Evaluate the consistency of my visual character across my catalog. Look at color grading, tonal contrast, and exposure patterns. Am I developing a unique 'signature style' or is it still evolving?",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Identifying Portfolio Gaps",
        prompt:
          "Based on my current patterns, what subjects or aesthetic styles are underrepresented? Suggest specific steps to enrich my catalogue with new styles or themes.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Overall Portfolio Assessment",
        prompt:
          "Review my entire photo library and provide an honest assessment. Give me an internal ranking of my usage patterns and identify which pieces reach that 'Unique' (10/10) level of impact.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Gender Presence in Street Work",
        prompt:
          "Analyze my street photography archive and determine whether men or women appear more frequently as primary subjects. Break down the distribution and explain if this reflects a stylistic bias, contextual coincidence, or recurring thematic inclination.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Recurring Subtle Pattern Detection",
        prompt:
          "Scan my entire photo library and identify a subtle recurring pattern, object, gesture, symbol, or specific real-world detail that appears across multiple images. Detect any unconscious fixation I may repeatedly photograph without realizing it.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
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
      "I have multiple versions of the same shot and I can't decide which to keep. Please compare these photos technically and artistically and recommend the strongest one with a clear reason.",
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
    subQueries: [
      {
        title: "How does the search feature work?",
        prompt:
          "Explain how the search feature works in Photoreka, including filters and different search modes.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "How do I create and manage collections?",
        prompt:
          "How do I create collections in Photoreka and add photos to them?",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "How do I organize my photos into series?",
        prompt:
          "How do I create photo series in Photoreka and what are they used for?",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "How do I share my work from Photoreka?",
        prompt:
          "What are the ways to share my photos or series from Photoreka?",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "How does photo analysis work?",
        prompt:
          "How does Photoreka analyze my photos, how is the data stored, and how is my privacy protected?",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
];

const activeSuggestion = ref<Suggestion | null>(null);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

const loadPendingChatPhotos = () => {
  const pending = sessionStorage.getItem("chat_context_photos");
  const pendingMessage = sessionStorage.getItem("chat_pending_message");

  if (!pending && !pendingMessage) return;

  // Always start a fresh conversation when arriving with pending content
  chatStore.startNewConversation();
  contextPhotos.value = [];
  inputText.value = "";
  perMessageSelections.value = {};
  activeSuggestion.value = null;

  if (pending) {
    sessionStorage.removeItem("chat_context_photos");
    try {
      const photos: ContextPhoto[] = JSON.parse(pending);
      if (Array.isArray(photos) && photos.length > 0) {
        contextPhotos.value = photos;
      }
    } catch {
      // ignore parse errors
    }
  }

  if (pendingMessage) {
    sessionStorage.removeItem("chat_pending_message");
    inputText.value = pendingMessage;
    nextTick(() => sendMessage());
  }
};

onMounted(() => {
  chatStore.fetchModes();
  if (!isDemoUser.value) chatStore.fetchConversations();
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
  inputText.value = "";

  const contextPhotoIds = attachedPhotos
    .map((p) => parseInt(p.id, 10))
    .filter((id) => !isNaN(id));

  isTyping.value = true;
  isSending.value = true;
  scrollToBottom();

  try {
    await chatStore.sendMessage(text, contextPhotoIds, attachedPhotos);
  } catch (error: any) {
    const errMsg =
      error?.response?.data?.message ||
      "Something went wrong. Please try again.";
    chatStore.addErrorMessage(errMsg);
  } finally {
    isTyping.value = false;
    isSending.value = false;
    scrollToBottom();
  }
};

const PHOTO_TOKEN = /\[\[photo:(\d+)\|([^\]]+)\]\]/g;
// Matches nested tokens like [[photo:[[photo:123|name.jpg]]|name.jpg]]
const NESTED_PHOTO_TOKEN = /\[\[photo:\[\[photo:(\d+)\|([^\]]+)\]\][^\]]*\]\]/g;
// Matches app-internal URL tokens like {url:/settings} or {url:/settings|Settings}
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
        `<span class="photo-inline-link" data-photo-id="${id}" data-photo-name="${filename}" title="${filename}">${filename}</span>`,
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

  // Handle photo inline links
  const target = (e.target as HTMLElement).closest(
    "[data-photo-id]",
  ) as HTMLElement | null;
  if (!target) return;
  const photoId = target.dataset.photoId;
  if (!photoId) return;
  const photo = photosStore.photos.find((p: any) => String(p.id) === photoId);
  if (photo) {
    // Find the message that contains this photo to build navigable list
    const numericId = parseInt(photoId, 10);
    const parentMsg = chatStore.messages.find((m: any) =>
      m.photoLists?.some((pl: PhotoList) => pl.photoIds.includes(numericId)),
    );
    const navigable = parentMsg?.photoLists
      ? getPhotosForMessage(
          parentMsg.photoLists.flatMap((pl: PhotoList) => pl.photoIds),
        )
      : [];
    showPhotoInfo({ id: photoId } as any, navigable);
  }
};

const handleMarkdownMouseOver = (e: MouseEvent) => {
  const token = (e.target as HTMLElement).closest(
    ".photo-inline-link",
  ) as HTMLElement | null;
  if (!token) return;
  const photoId = token.dataset.photoId;
  if (!photoId) return;
  const bubble = (e.currentTarget as HTMLElement).closest(".message-bubble");
  if (!bubble) return;
  bubble
    .querySelectorAll<HTMLElement>(
      `.message-photo-item[data-photo-id="${photoId}"]`,
    )
    .forEach((el) => el.classList.add("photo-token-hover"));
};

const handleMarkdownMouseOut = (e: MouseEvent) => {
  const token = (e.target as HTMLElement).closest(
    ".photo-inline-link",
  ) as HTMLElement | null;
  if (!token) return;
  const bubble = (e.currentTarget as HTMLElement).closest(".message-bubble");
  if (!bubble) return;
  bubble
    .querySelectorAll<HTMLElement>(".photo-token-hover")
    .forEach((el) => el.classList.remove("photo-token-hover"));
};

const handleSuggestionClick = (suggestion: Suggestion) => {
  // If card has sub-queries, drill into them instead of firing immediately
  if (suggestion.subQueries && suggestion.subQueries.length > 0) {
    inputText.value = "";
    activeSuggestion.value = suggestion;
    return;
  }

  // No sub-queries: original behaviour
  inputText.value = suggestion.prompt;

  if (suggestion.needsPhotos && contextPhotos.value.length === 0) {
    photosDialogVisible.value = true;
    return;
  }

  if (suggestion.autoSend) {
    sendMessage();
  }
};

const handleSubQueryClick = (sq: SubQuery) => {
  activeSuggestion.value = null;

  inputText.value = sq.prompt;

  if (sq.needsPhotos && contextPhotos.value.length === 0) {
    photosDialogVisible.value = true;
    return;
  }

  if (sq.autoSend) {
    sendMessage();
  }
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};

const handleModeChange = (modeId: string) => {
  chatStore.setSelectedMode(modeId);
  showModePopover.value = false;
};

// Context photos management — PhotosDialog emits an array of photo IDs
const onPhotosSelected = (photoIds: string[]) => {
  const existingIds = new Set(contextPhotos.value.map((p) => p.id));
  const remaining = 5 - contextPhotos.value.length;

  const newPhotos: ContextPhoto[] = [];
  let attemptedCount = 0;

  for (const id of photoIds) {
    // Contar intentos de fotos válidas (no duplicadas, existentes)
    if (
      !existingIds.has(id) &&
      photosStore.photos.find((p: any) => p.id === id)
    ) {
      attemptedCount++;
    }

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

  // Show message if tried to add more photos
  if (attemptedCount > newPhotos.length) {
    if (newPhotos.length === 0) {
      message.warning("Can't add more photos. 5 photo limit reached.");
    } else {
      message.warning(
        `Only ${newPhotos.length} photo(s) added. 5 photo limit reached.`,
      );
    }
  }
};

const getAllPhotoIdsFromLists = (photoLists: PhotoList[]): number[] => {
  return photoLists.flatMap((list) => list.photoIds);
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

const handleAddMessagePhotosToCollection = (photoLists: PhotoList[]) => {
  const allIds = getAllPhotoIdsFromLists(photoLists);
  if (allIds.length > 0) {
    collectionModalPhotoIds.value = [...allIds];
    showCollectionModal.value = true;
  }
};

const handleCollectionAdded = () => {
  clearAllSelectionsAndScopes();
  showCollectionModal.value = false;
};

const handleToolSelected = async (
  toolId: string,
  canvasId: number | null = null,
) => {
  await takeToTool(
    toolId,
    selectedPhotoIds.value,
    clearAllSelectionsAndScopes,
    canvasId,
  );
  closeToolSelector();
};

const handleAttachToChat = () => {
  const existingIds = new Set(contextPhotos.value.map((p) => p.id));
  const remaining = 5 - contextPhotos.value.length;
  const newPhotos: ContextPhoto[] = [];
  let attemptedCount = 0;

  for (const id of selectedPhotoIds.value) {
    const strId = String(id);
    // Contar intentos de fotos válidas (no duplicadas, existentes)
    if (
      !existingIds.has(strId) &&
      photosStore.photos.find((p: any) => String(p.id) === strId)
    ) {
      attemptedCount++;
    }

    if (newPhotos.length >= remaining) break;
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

  // Show message if tried to add more photos
  if (attemptedCount > newPhotos.length) {
    if (newPhotos.length === 0) {
      message.warning("Can't add more photos. 5 photo limit reached.");
    } else {
      message.warning(
        `Only ${newPhotos.length} photo(s) added. 5 photo limit reached.`,
      );
    }
  }
};

const showPhotoInfo = async (
  photo: ContextPhoto | { id: string | number },
  navigablePhotos: ContextPhoto[] = [],
) => {
  try {
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    if (fullPhoto) {
      dialogNavigablePhotos.value = navigablePhotos;
      selectedDialogPhoto.value = fullPhoto;
      showPhotoInfoDialog.value = true;
    } else {
      message.error("Photo not found");
    }
  } catch {
    message.error("Could not load photo info");
  }
};

const handlePhotoNavigate = async (newIndex: number) => {
  if (newIndex < 0 || newIndex >= dialogNavigablePhotos.value.length) return;
  const photo = dialogNavigablePhotos.value[newIndex];
  try {
    const fullPhoto = await photosStore.fetchPhoto(photo.id);
    if (fullPhoto) {
      selectedDialogPhoto.value = fullPhoto;
    }
  } catch {
    message.error("Could not load photo info");
  }
};

const clearContextPhotos = () => {
  contextPhotos.value = [];
};

const resetChat = async () => {
  chatStore.startNewConversation();
  contextPhotos.value = [];
  inputText.value = "";
  perMessageSelections.value = {};
  activeSuggestion.value = null;
};

const handleNewChat = () => {
  resetChat();
  showSidebar.value = false;
};

const handleLoadConversation = async (conversationId: number) => {
  try {
    await chatStore.loadConversation(conversationId);
    // Resolve persisted contextPhotoIds → attachedPhotos for display
    for (const msg of chatStore.messages as any[]) {
      if (msg.role === "user" && msg.contextPhotoIds?.length) {
        msg.attachedPhotos = getPhotosForMessage(msg.contextPhotoIds);
        delete msg.contextPhotoIds;
      }
    }
    contextPhotos.value = [];
    inputText.value = "";
    perMessageSelections.value = {};
    activeSuggestion.value = null;
    showSidebar.value = false;
    scrollToBottom();
  } catch {
    message.error("Failed to load conversation");
  }
};

const handleDeleteConversation = async (conversationId: number) => {
  pendingDeleteId.value = null;
  try {
    await chatStore.deleteConversation(conversationId);
    message.success("Conversation deleted");
  } catch {
    message.error("Failed to delete conversation");
  }
};

const formatRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
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

/* ── Sidebar Backdrop ── */
.sidebar-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 99;
  /* backdrop-filter: blur(1px); */
}

.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 0.22s ease;
}
.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

/* ── Sidebar Panel ── */
.chat-sidebar {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 280px;
  z-index: 100;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-md) var(--spacing-md)
    var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.sidebar-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  flex: 1;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
}

.sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  flex: 1;
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
  padding: var(--spacing-xl);
}

.sidebar-empty-icon {
  opacity: 0.35;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-xs) 0;
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.sidebar-list::-webkit-scrollbar {
  width: 3px;
}
.sidebar-list::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 2px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm)
    var(--spacing-lg);
  cursor: pointer;
  border-left: 2px solid transparent;
  transition:
    background 0.15s,
    border-color 0.15s;
  min-height: 52px;
}

.sidebar-item:hover {
  background: color-mix(in srgb, var(--accent-color) 6%, var(--bg-surface));
}

.sidebar-item.active {
  background: color-mix(in srgb, var(--accent-color) 10%, var(--bg-surface));
  border-left-color: var(--accent-color);
}

.sidebar-item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-item-title {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: var(--line-height-tight);
}

.sidebar-item.active .sidebar-item-title {
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
}

.sidebar-item-date {
  font-size: 10px;
  color: var(--text-tertiary);
  opacity: 0.7;
}

.sidebar-item-delete-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.sidebar-item-confirm-btn {
  font-size: 11px !important;
  padding: 0 6px !important;
  height: 20px !important;
}

.sidebar-item-delete {
  flex-shrink: 0;
  color: var(--text-tertiary) !important;
}

/* ── Persistent Top Bar ── */
.chat-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-xs) var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  min-height: 44px;
}

.chat-topbar-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.chat-topbar-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-tertiary);
  letter-spacing: 0.03em;
}

.sidebar-toggle-btn {
  color: var(--text-tertiary) !important;
  transition:
    color 0.15s,
    background 0.15s !important;
}

.sidebar-toggle-btn.active {
  color: var(--accent-color) !important;
  background: color-mix(
    in srgb,
    var(--accent-color) 10%,
    transparent
  ) !important;
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

.welcome-hint {
  margin: var(--spacing-xl) auto 0;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  opacity: 0.55;
  line-height: var(--line-height-relaxed);
  text-align: center;
}

.welcome-hint-link {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent-color);
  cursor: pointer;
  font-size: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.85;
  transition: opacity 0.15s;
}

.welcome-hint-link:hover {
  opacity: 1;
}

/* ── ChatLab Info Dialog ── */
.chatlab-info-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
}

.chatlab-info-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 201;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  width: 520px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chatlab-info-pop-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.chatlab-info-pop-leave-active {
  transition: all 0.15s ease;
}
.chatlab-info-pop-enter-from {
  opacity: 0;
  transform: translate(-50%, -48%) scale(0.95);
}
.chatlab-info-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.97);
}

.chatlab-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.chatlab-info-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.chatlab-info-icon {
  color: var(--accent-color);
  opacity: 0.8;
}

.chatlab-info-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.chatlab-info-body {
  padding: var(--spacing-lg) var(--spacing-xl);
  overflow-y: auto;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.chatlab-info-body p {
  margin: 0 0 var(--spacing-md) 0;
}

.chatlab-info-body h4,
.chatlab-info-h4 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: var(--spacing-lg) 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.chatlab-info-body h4:first-child,
.chatlab-info-h4:first-child {
  margin-top: 0;
}

.chatlab-h4-icon {
  flex-shrink: 0;
}
.chatlab-h4-icon--can {
  color: var(--success-color, #52c41a);
}
.chatlab-h4-icon--cannot {
  color: var(--error-color);
}
.chatlab-h4-icon--scope {
  color: var(--accent-color);
}
.chatlab-h4-icon--aesthetic {
  color: var(--accent-color);
  opacity: 0.8;
}

.chatlab-info-body ul {
  margin: 0 0 var(--spacing-md) 0;
  padding-left: var(--spacing-lg);
}

.chatlab-info-body li {
  margin-bottom: var(--spacing-xs);
  position: relative;
}

.chatlab-info-body li::marker {
  color: var(--accent-color);
}

.chatlab-info-body a,
.chatlab-info-body a:visited,
.chatlab-info-body a:link {
  color: var(--accent-color);
  text-decoration: none !important;
  text-underline-offset: 2px;
}

.chatlab-info-closing {
  font-style: italic;
  opacity: 0.75;
  margin-top: var(--spacing-md);
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
  position: relative;
}

.suggestion-card:hover {
  border-color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 5%, var(--bg-surface));
  box-shadow: var(--shadow-md);
}

.suggestion-icon {
  color: var(--accent-color);
  opacity: 0.8;
}

.suggestion-expand-icon {
  position: absolute;
  bottom: var(--spacing-sm);
  right: var(--spacing-sm);
  color: var(--text-tertiary);
  opacity: 0.5;
  transition: opacity 0.15s;
}

.suggestion-card:hover .suggestion-expand-icon {
  opacity: 1;
  color: var(--accent-color);
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

/* ── Sub-queries Panel ── */
.subquery-panel {
  max-width: 640px;
  margin: 0 auto;
  width: 100%;
  animation: fadeSlideIn 0.2s ease;
}

@keyframes fadeSlideIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.subquery-back-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  padding: 0 0 var(--spacing-sm) 0;
  transition: color 0.15s;
}

.subquery-back-btn:hover {
  color: var(--accent-color);
}

.subquery-panel-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.subquery-panel-icon {
  color: var(--accent-color);
  opacity: 0.8;
  flex-shrink: 0;
}

.subquery-panel-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.subquery-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.subquery-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.subquery-item:hover {
  border-color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 5%, var(--bg-surface));
  color: var(--text-primary);
}

.subquery-item-icon {
  color: var(--accent-color);
  opacity: 0.7;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.subquery-item:hover .subquery-item-icon {
  opacity: 1;
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
  padding: 15px;
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

/* ── Mode selector (embedded in input) ── */
.chat-input-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
}

.chat-input-wrap .chat-input {
  width: 100%;
}

.chat-input-wrap .chat-input :deep(textarea) {
  padding-right: 100px !important;
}

.chat-mode-chip {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px 2px 7px;
  /* border-radius: var(--radius-round); */
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  color: var(--text-tertiary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.4;
  z-index: 1;
  white-space: nowrap;
}

.chat-mode-chip:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 6%, var(--bg-surface));
}

.chat-mode-panel {
  padding: var(--spacing-xs) 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.chat-mode-panel-header {
  padding: var(--spacing-xs) var(--spacing-md) var(--spacing-sm);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.chat-mode-item {
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: pointer;
  transition: background 0.12s;
}

.chat-mode-item:hover {
  background: color-mix(in srgb, var(--accent-color) 6%, var(--bg-surface));
}

.chat-mode-item.active {
  background: color-mix(in srgb, var(--accent-color) 10%, var(--bg-surface));
}

.chat-mode-item.active .chat-mode-item-name {
  color: var(--accent-color);
  font-weight: var(--font-weight-semibold);
}

.chat-mode-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.chat-mode-item-name {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: var(--line-height-tight);
}

.chat-mode-item-cost {
  font-size: 10px;
  color: var(--text-tertiary);
  font-weight: var(--font-weight-semibold);
  opacity: 0.7;
  flex-shrink: 0;
}

.chat-mode-item-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.35;
  margin-top: 2px;
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

  .chat-mode-chip {
    font-size: 10px;
    padding: 2px 8px 2px 5px;
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

  .subquery-item {
    font-size: var(--font-size-xs);
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

.message-photo-lists {
  margin-top: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.message-photo-list {
  border-top: 1px solid var(--border-color);
  padding-top: var(--spacing-sm);
}

.message-photo-list-label {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: var(--spacing-xs);
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
  transition: transform 0.15s ease;
}

.message-photo-item.photo-token-hover {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
  transform: scale(1.04);
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
  text-align: justify;
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

/* ── Inline photo token links ── */
.message-assistant .message-bubble :deep(.photo-inline-link) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--accent-color);
  cursor: pointer;
  font-weight: var(--font-weight-semibold);
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
  border-radius: var(--radius-sm);
  padding: 0 3px;
  transition:
    background 0.15s,
    color 0.15s;
}

.message-assistant .message-bubble :deep(.photo-inline-link:hover) {
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
  text-decoration-style: solid;
}

/* ── Inline app URL links ── */
.message-assistant .message-bubble :deep(.app-url-link),
.message-bubble :deep(.app-url-link) {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--accent-color);
  cursor: pointer;
  font-weight: var(--font-weight-semibold);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 2px;
  border-radius: var(--radius-sm);
  padding: 0 3px;
  transition:
    background 0.15s,
    color 0.15s;
}

.message-assistant .message-bubble :deep(.app-url-link:hover),
.message-bubble :deep(.app-url-link:hover) {
  background: color-mix(in srgb, var(--accent-color) 12%, transparent);
  text-decoration-style: solid;
}

/* ── Recent Conversations (welcome screen) ── */
.recent-convs {
  margin-top: var(--spacing-2xl);
  max-width: 480px;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
}

.recent-convs-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
  padding: 0 var(--spacing-xs);
}

.recent-convs-icon {
  color: var(--text-tertiary);
  opacity: 0.6;
}

.recent-convs-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-tertiary);
}

.recent-convs-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-conv-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.recent-conv-item:hover {
  background: color-mix(in srgb, var(--accent-color) 6%, var(--bg-surface));
  border-color: var(--accent-color);
}

.recent-conv-title {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.recent-conv-item:hover .recent-conv-title {
  color: var(--text-primary);
}

.recent-conv-date {
  font-size: 10px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.recent-conv-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  width: 100%;
  padding: var(--spacing-xs) var(--spacing-md);
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  transition: color 0.15s;
  margin-top: 2px;
}

.recent-conv-more:hover {
  color: var(--accent-color);
}

/* ── Loading messages state ── */
.loading-messages {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xl);
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

/* ── Responsive sidebar ── */
@media (max-width: 768px) {
  .chat-sidebar {
    width: 88vw;
    max-width: 320px;
  }
}
</style>
