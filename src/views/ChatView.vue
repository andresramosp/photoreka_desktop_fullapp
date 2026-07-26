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
          <SpiralGridLoader variant="primary" :size="22" />
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

    <!-- Top bar — only inside a conversation. On the welcome screen it would be
         an empty strip holding nothing but the conversations toggle, so that
         toggle floats over the content instead (see below). -->
    <div v-if="hasMessages" class="chat-topbar">
      <div class="chat-topbar-left">
        <n-button
          v-if="showHistory"
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
        <span class="chat-topbar-title">{{ activeConversationTitle }}</span>
      </div>
      <div class="chat-topbar-right">
        <n-button
          quaternary
          size="small"
          class="new-chat-btn"
          @click="handleNewChat"
        >
          <template #icon>
            <n-icon :size="17"><CreateIcon /></n-icon>
          </template>
          <span class="new-chat-label">New chat</span>
        </n-button>
        <n-button
          v-if="allowFullscreen"
          quaternary
          size="small"
          class="fullscreen-btn"
          :class="{ active: isFullscreen }"
          :title="isFullscreen ? 'Exit fullscreen' : 'Expand chat'"
          @click="toggleFullscreen"
        >
          <template #icon>
            <n-icon :size="15">
              <FullscreenExitOutlined v-if="isFullscreen" />
              <FullscreenOutlined v-else />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>

    <template v-else>
      <n-button
        v-if="showHistory"
        quaternary
        size="small"
        class="sidebar-toggle-btn sidebar-toggle-btn--floating"
        :class="{ active: showSidebar }"
        title="Conversations"
        @click="showSidebar = !showSidebar"
      >
        <template #icon>
          <n-icon :size="17"><LayersIcon /></n-icon>
        </template>
      </n-button>

      <n-button
        v-if="allowFullscreen"
        quaternary
        size="small"
        class="fullscreen-btn fullscreen-btn--floating"
        :class="{ active: isFullscreen }"
        :title="isFullscreen ? 'Exit fullscreen' : 'Expand chat'"
        @click="toggleFullscreen"
      >
        <template #icon>
          <n-icon :size="16">
            <FullscreenExitOutlined v-if="isFullscreen" />
            <FullscreenOutlined v-else />
          </n-icon>
        </template>
      </n-button>
    </template>

    <!-- Main Chat Area -->
    <div class="chat-main" ref="chatMainRef">
      <!-- Welcome / Suggestions (visible before chatting) -->
      <div v-if="chatStore.messages.length === 0" class="chat-welcome">
        <div class="welcome-content">
          <!-- <n-icon :size="isMobile ? 48 : 64" class="welcome-icon">
            <RobotOutlined />
          </n-icon> -->
          <div class="welcome-icon-wrap">
            <AppLogo
              layout="icon"
              :height="isMobile ? 48 : 64"
              class="welcome-icon"
            />
          </div>

          <!-- The hidden copy reserves the final size, so typing the title out
               never reflows the content below it. -->
          <h2 class="welcome-title" :aria-label="welcomeTitle">
            <span class="welcome-title-ghost" aria-hidden="true">{{
              welcomeTitle
            }}</span>
            <span class="welcome-title-typed" aria-hidden="true"
              >{{ typedTitle
              }}<span v-if="isTypingTitle" class="welcome-title-caret"></span
            ></span>
          </h2>
          <p class="welcome-description">
            {{
              hasPhotos
                ? "Ask questions about your photos, get curation advice, or explore your catalog with Photoreka's AI assistance."
                : "Your library is empty for now. Ask me anything about how Photoreka works, and import your photos whenever you're ready."
            }}
          </p>

          <!-- Sub-queries panel (shown after clicking a card with subQueries) -->
          <div v-if="activeSuggestion" class="subquery-panel">
            <n-button
              text
              class="subquery-back-btn"
              @click="activeSuggestion = null"
            >
              <template #icon>
                <n-icon :size="14"><ArrowBackIcon /></n-icon>
              </template>
              Back
            </n-button>
            <div class="subquery-panel-header">
              <n-icon :size="18" class="subquery-panel-icon">
                <component :is="activeSuggestion.icon" />
              </n-icon>
              <span class="subquery-panel-title">{{
                activeSuggestion.title
              }}</span>
            </div>
            <div class="subquery-list">
              <n-button
                v-for="(sq, sqIdx) in activeSuggestion.subQueries"
                :key="sqIdx"
                block
                class="subquery-item"
                @click="handleSubQueryClick(sq)"
              >
                <template #icon>
                  <n-icon :size="14" class="subquery-item-icon"
                    ><ChevronForwardIcon
                  /></n-icon>
                </template>
                {{ sq.title }}
              </n-button>
            </div>
          </div>

          <!-- Main suggestion cards -->
          <div v-else class="suggestion-cards">
            <div
              v-for="suggestion in visibleSuggestions"
              :key="suggestion.title"
              class="suggestion-card"
              @click="handleSuggestionClick(suggestion)"
            >
              <div class="suggestion-content">
                <div class="suggestion-title-row">
                  <div class="suggestion-icon">
                    <n-icon :size="18">
                      <component :is="suggestion.icon" />
                    </n-icon>
                  </div>
                  <span class="suggestion-title">{{ suggestion.title }}</span>
                </div>
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

          <!-- Recent conversations + hint: hidden once photos are attached -->
          <Transition name="welcome-footer">
            <div v-if="!photosEverAttached" class="welcome-footer">
              <!-- Recent conversations (welcome screen) -->
              <div
                v-if="
                  showHistory &&
                  !activeSuggestion &&
                  chatStore.conversations.length > 0
                "
                class="recent-convs"
              >
                <!-- <div class="recent-convs-header">
                  <n-icon :size="13" class="recent-convs-icon"
                    ><LayersIcon
                  /></n-icon>
                  <span class="recent-convs-title">Recent conversations</span>
                </div> -->
                <div class="recent-convs-list">
                  <n-button
                    v-for="conv in chatStore.conversations.slice(0, 2)"
                    :key="conv.id"
                    block
                    class="recent-conv-item"
                    @click="handleLoadConversation(conv.id)"
                  >
                    <span class="recent-conv-title">{{
                      conv.title || "Untitled"
                    }}</span>
                    <span class="recent-conv-date">{{
                      formatRelativeDate(conv.updatedAt)
                    }}</span>
                  </n-button>
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
            </div>
          </Transition>

          <!-- With an empty library the chat is all there is to do here, so the
               way out of that state stays one click away. -->
          <router-link
            v-if="!hasPhotos"
            to="/import-area#upload"
            class="welcome-import-btn"
          >
            <n-icon :size="16">
              <CloudUploadIcon />
            </n-icon>
            <span>Import Photos</span>
          </router-link>

          <p
            v-if="hasPhotos && !photosEverAttached"
            class="welcome-hint welcome-hint--bottom"
          >
            <n-button
              text
              class="welcome-hint-link"
              @click="showChatLabInfo = true"
            >
              Learn more about ChatLab
            </n-button>
          </p>
        </div>
      </div>

      <!-- Chat Messages -->
      <div v-else class="chat-messages" ref="messagesRef">
        <!-- Loading indicator when loading a conversation -->
        <div v-if="chatStore.isLoadingMessages" class="loading-messages">
          <SpiralGridLoader variant="primary" :size="40" />
          <span>Loading conversation…</span>
        </div>

        <div
          v-for="(message, index) in chatStore.messages"
          :key="index"
          class="message-row"
          :data-message-index="index"
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
                      :all-photos="message.attachedPhotos"
                      :showName="true"
                      :showFooter="false"
                      :showDelete="false"
                      :showDuplicate="false"
                      :show-flag="false"
                      :show-attach-to-chat="true"
                      :isUploading="photo.isUploading"
                      :selected="isPhotoSelectedInMessage(index, photo.id)"
                      @select="
                        (photoId) => toggleMessagePhotoSelection(index, photoId)
                      "
                      @info="(p) => showPhotoInfo(p, message.attachedPhotos)"
                      @attach-to-chat="handleAttachPhotoToChat"
                    />
                  </div>
                </div>
              </div>
              <p class="message-text">
                <template
                  v-for="(seg, segIdx) in messageMentionSegments(
                    message.content,
                  )"
                  :key="segIdx"
                  ><span
                    v-if="seg.mention"
                    class="mention-chip-sent"
                    @click="navigateToMention(seg)"
                    >{{ seg.text }}</span
                  ><template v-else>{{ seg.text }}</template></template
                >
              </p>
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
                    :all-photos="
                      getPhotosForMessage(message.photoLists[0].photoIds)
                    "
                    :showName="true"
                    :showFooter="false"
                    :showDelete="false"
                    :show-flag="false"
                    :showDuplicate="false"
                    :show-attach-to-chat="true"
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
                    @attach-to-chat="handleAttachPhotoToChat"
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
                <div
                  class="message-photo-list-label"
                  :class="{
                    'message-photo-list-label--narrow': isNarrowPhotoGroup(
                      list.photoIds.length,
                    ),
                  }"
                  :title="list.label"
                >
                  {{ list.label }}
                </div>
                <div
                  class="message-photos-grid"
                  :style="photoGroupGridStyle(list.photoIds.length)"
                >
                  <div
                    v-for="photo in getPhotosForMessage(list.photoIds)"
                    :key="photo.id"
                    class="message-photo-item"
                    :data-photo-id="photo.id"
                  >
                    <PhotoCardHub
                      :photo="photo"
                      :all-photos="getPhotosForMessage(list.photoIds)"
                      :showName="true"
                      :showFooter="false"
                      :show-flag="false"
                      :showDelete="false"
                      :showDuplicate="false"
                      :show-attach-to-chat="true"
                      :isUploading="photo.isUploading"
                      :selected="isPhotoSelectedInMessage(index, photo.id)"
                      @select="
                        (photoId) => toggleMessagePhotoSelection(index, photoId)
                      "
                      @info="
                        (p) =>
                          showPhotoInfo(p, getPhotosForMessage(list.photoIds))
                      "
                      @attach-to-chat="handleAttachPhotoToChat"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div class="message-footer">
              <span class="message-time">{{
                formatTime(message.timestamp)
              }}</span>
              <!-- <n-button
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
              </n-button> -->
            </div>
            <!-- Phase 3 recommended actions -->
            <div
              v-if="message.role === 'assistant' && message.actionsPending"
              class="action-suggestions-skeleton"
            >
              <div class="action-chip-skeleton" />
              <div class="action-chip-skeleton" />
              <div class="action-chip-skeleton" />
            </div>
            <ChatActionSuggestions
              v-else-if="
                message.role === 'assistant' &&
                message.actions &&
                message.actions.length > 0
              "
              :actions="message.actions"
              @execute="handleActionExecute($event, message)"
              @hover-photos="handleActionHoverPhotos($event, index)"
              @clear-hover-photos="clearActionHoverPhotos(index)"
            />
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-if="isTyping" class="message-row message-assistant">
          <div class="message-avatar">
            <AppLogo layout="icon" :height="42" />
          </div>
          <div class="message-bubble typing-bubble">
            <SpiralGridLoader variant="primary" :size="20" :duration="1300" />
            <transition name="phrase-fade" mode="out-in">
              <span :key="loadingPhraseIndex" class="typing-phrase">{{
                shuffledLoadingPhrases[loadingPhraseIndex]
              }}</span>
            </transition>
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
            :class="{
              'flash-highlight': flashingPhotoIds.has(String(photo.id)),
            }"
          >
            <PhotoCardHub
              :photo="photo"
              :all-photos="contextPhotos"
              :showName="true"
              :showFooter="false"
              :showDelete="false"
              :show-flag="false"
              :showDuplicate="false"
              :isUploading="photo.isUploading"
              @info="(p) => showPhotoInfo(p, contextPhotos)"
            />
            <n-button
              circle
              size="tiny"
              class="remove-photo-btn"
              @click="removeContextPhoto(photo.id)"
            >
              <template #icon>
                <n-icon :size="10"><CloseIcon /></n-icon>
              </template>
            </n-button>
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

      <div
        class="chat-input-box"
        :class="{ 'chat-input-box--multiline': isComposerMultiline }"
      >
        <!-- Add photos button -->
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

        <ChatMentionInput
          ref="mentionInputRef"
          v-model="inputText"
          :attached-photo-ids="contextPhotos.map((p) => p.id)"
          :photo-limit-reached="contextPhotos.length >= MAX_PHOTOS_TO_CHAT"
          :reserve-right-px="0"
          :borderless="true"
          :placeholder="chatInputPlaceholder"
          class="chat-input"
          @submit="sendMessage"
          @attach-photo="handleMentionAttachPhoto"
          @flash-photo="handleFlashPhoto"
          @multiline-change="isComposerMultiline = $event"
        />

        <div class="chat-input-controls">
          <div
            v-if="
              !chatStore.isKnowledgeAssistant &&
              (chatStore.chatModes.length > 0 || chatStore.isLoadingModes)
            "
            class="chat-mode-selector"
          >
            <ModePopoverSelector
              v-model="selectedChatModeBinding"
              :options="chatModeOptions"
              header="Intelligence Mode"
              placement="top-end"
              aria-label="Change intelligence mode"
            />
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

    <!-- Demo Safe-Search Warning Modal -->
    <DemoSearchWarningModal
      :show="showDemoWarningModal"
      :type="demoWarningType"
      @close="closeDemoWarningModal"
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
            work, discover hidden gems, and plan your next creative move. It
            never changes your library on its own — any change is proposed as an
            action you choose to confirm, so you stay in control.
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
            <li>
              Offer actions you can confirm — like adding the suggested photos
              to a collection or series, or sending them to another tool.
            </li>
          </ul>

          <h4 class="chatlab-info-h4">
            <n-icon :size="14" class="chatlab-h4-icon chatlab-h4-icon--cannot"
              ><CloseCircleIcon
            /></n-icon>
            What ChatLab cannot do
          </h4>
          <ul>
            <li>Delete photos, collections, series or canvases.</li>
            <li>
              Change anything on its own — every action needs your confirmation.
            </li>
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
            <RouterLink to="/2d-atlas">Atlas</RouterLink>, or
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
            <RouterLink to="atlas">Atlas</RouterLink>, or
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
  watch,
  onMounted,
  onUnmounted,
  onActivated,
} from "vue";
import { NIcon, useMessage } from "naive-ui";
import { useRoute, useRouter } from "vue-router";
import PhotosDialog from "@/components/PhotosDialog.vue";
import SpiralGridLoader from "@/components/SpiralGridLoader.vue";
import PhotoCardHub from "@/components/photoCards/PhotoCardHub.vue";
import PhotoInfoDialog from "@/components/PhotoInfoDialog.vue";
import FloatingActionBar from "@/components/FloatingActionBar.vue";
import CollectionModal from "@/components/CollectionModal.vue";
import PhotoToolSelector from "@/components/PhotoToolSelector.vue";
import ModePopoverSelector from "@/components/ModePopoverSelector.vue";
import ChatMentionInput from "@/components/ChatMentionInput.vue";
import ChatActionSuggestions from "@/components/ChatActionSuggestions.vue";
import DemoSearchWarningModal from "@/components/DemoSearchWarningModal.vue";
import { useDemoSafeSearch } from "@/composables/useDemoSafeSearch";
import { useChatActions } from "@/composables/useChatActions.js";
import { usePhotosStore } from "@/stores/photos.js";
import { useChatStore } from "@/stores/chat.js";
import { useUserStore } from "@/stores/userStore";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import {
  usePhotoToolSelection,
  MAX_PHOTOS_TO_CHAT,
} from "@/composables/usePhotoToolSelection.js";
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
  ShareSocialOutline as SocialIcon,
  BriefcaseOutline as PortfolioIcon,
  TrendingUpOutline as TrendingIcon,
  CreateOutline as CreateIcon,
  BookmarksOutline,
  ChevronForwardOutline as ChevronForwardIcon,
  ArrowBackOutline as ArrowBackIcon,
  InformationCircleOutline as InformationCircleIcon,
  CheckmarkCircleOutline as CheckmarkCircleIcon,
  CloseCircleOutline as CloseCircleIcon,
  EyeOutline as EyeIcon,
  CloudUploadOutline as CloudUploadIcon,
} from "@vicons/ionicons5";
import AppLogo from "@/components/AppLogo.vue";
import {
  PlusCircleFilled,
  RobotOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from "@vicons/antd";
import { getShuffledLoadingPhrases } from "@/utils/chatLoadingPhrases";

defineOptions({ name: "ChatView" });

const props = defineProps<{
  /**
   * Conversation to open on mount. Used by the dashboard, which hosts the chat
   * outside of the /chat-lab routes and so can't pass it through the URL.
   * When omitted the chat opens on the welcome screen.
   */
  conversationId?: string | number | null;
  /**
   * Offers the fullscreen toggle. Only the dashboard host has surroundings to
   * collapse, so it's the only caller that turns this on — the routed view is
   * already fullscreen.
   */
  allowFullscreen?: boolean;
  /** Fullscreen state, owned by the host (the chat only requests the toggle). */
  isFullscreen?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:isFullscreen", value: boolean): void;
}>();

/**
 * Sending the first prompt of a new conversation expands the chat. Flip to
 * false to keep the host layout as-is.
 */
const autoFullscreenOnSend = true;

const toggleFullscreen = () => {
  emit("update:isFullscreen", !props.isFullscreen);
};

const enterFullscreenOnSend = () => {
  if (!autoFullscreenOnSend || !props.allowFullscreen || props.isFullscreen)
    return;
  // The store only assigns an id once the first message lands, so a null id
  // here means we're opening a brand-new conversation.
  if (chatStore.activeConversationId) return;
  emit("update:isFullscreen", true);
};

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
  messageId?: number;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isError?: boolean;
  photoLists?: PhotoList[];
  attachedPhotos?: ContextPhoto[];
  actions?: any[];
}

interface ContextPhoto {
  id: string;
  title: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  originalUrl?: string;
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
const route = useRoute();
const router = useRouter();

const isDemoUser = computed(
  () => userStore.user?.email === "demo@photorekatest.com",
);

const showHistory = computed(() => !isDemoUser.value);

const hasMessages = computed(() => chatStore.messages.length > 0);

const activeConversationTitle = computed(() => {
  // A brand-new conversation has messages but no id yet (assigned once the
  // first reply comes back), so there's nothing in the store to title it with.
  if (!chatStore.activeConversationId) return "New chat";
  return chatStore.activeConversation?.title || "Untitled";
});

/**
 * True when this instance *is* the routed view (mobile). On desktop the chat is
 * hosted inside the dashboard, where writing to the URL would navigate the user
 * away from it — so every router write below is gated on this.
 */
const isRoutedView = computed(
  () => route.name === "chat-lab" || route.name === "chat-lab-conversation",
);

const selectedChatModeBinding = computed({
  get: () => chatStore.selectedModeId,
  set: (value: string | null) => {
    chatStore.selectedModeId = value;
  },
});

const chatModeOptions = computed(() =>
  chatStore.chatModes.map((mode: any) => ({
    label: mode.name,
    value: mode.id,
    description: mode.description,
    costFactor: mode.costFactor ?? null,
  })),
);

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

// Phase 3 — grounded action suggestions rendered under each assistant reply
const { executeAction, isWriteAction } = useChatActions();
const handleActionExecute = async (action: any, chatMessage: ChatMessage) => {
  const executed = await executeAction(action);
  if (!executed) return;

  if (!isWriteAction(action)) return;

  // Persist "used" state so this suggestion is disabled across reloads.
  if (!chatMessage?.messageId) return;
  try {
    await chatStore.markActionUsed(chatMessage.messageId, action);
  } catch (err) {
    console.warn("[ChatView] Failed to persist used action:", err);
  }
};

// Demo safe-search guard
const {
  checkQuery: demoCheckQuery,
  showWarningModal: showDemoWarningModal,
  warningType: demoWarningType,
  closeWarningModal: closeDemoWarningModal,
} = useDemoSafeSearch();

const inputText = ref("");
const isTyping = ref(false);
const isSending = ref(false);
const loadingPhraseIndex = ref(0);
const shuffledLoadingPhrases = ref<string[]>(getShuffledLoadingPhrases());
let loadingPhraseTimer: ReturnType<typeof setTimeout> | null = null;

// Randomized delay so the rotation doesn't feel mechanical/looping.
// Wide spread (0.9s–3.3s) so the variability is actually perceptible.
const nextLoadingPhraseDelay = () => 1200 + Math.random() * 3500;

const scheduleNextLoadingPhrase = () => {
  loadingPhraseTimer = setTimeout(() => {
    if (loadingPhraseIndex.value >= shuffledLoadingPhrases.value.length - 1) {
      shuffledLoadingPhrases.value = getShuffledLoadingPhrases();
      loadingPhraseIndex.value = 0;
    } else {
      loadingPhraseIndex.value += 1;
    }

    scheduleNextLoadingPhrase();
  }, nextLoadingPhraseDelay());
};

const startLoadingPhraseCycle = () => {
  shuffledLoadingPhrases.value = getShuffledLoadingPhrases();
  loadingPhraseIndex.value = 0;
  scheduleNextLoadingPhrase();
};

const stopLoadingPhraseCycle = () => {
  if (loadingPhraseTimer) {
    clearTimeout(loadingPhraseTimer);
    loadingPhraseTimer = null;
  }
};
const photosDialogVisible = ref(false);
const contextPhotos = ref<ContextPhoto[]>([]);
/** Sticky: once photos are attached, the welcome footer stays hidden until a new conversation. */
const photosEverAttached = ref(false);
watch(
  () => contextPhotos.value.length,
  (count) => {
    if (count > 0) photosEverAttached.value = true;
  },
);
const mentionInputRef = ref<{ focus: () => void } | null>(null);
const chatMainRef = ref<HTMLElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);
const isMobile = ref(window.innerWidth < 768);
const isComposerMultiline = ref(false);
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

/** The only suggestion that stands on its own without a library behind it. */
const appHelpSuggestion: Suggestion = {
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
      prompt: "What are the ways to share my photos or series from Photoreka?",
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
};

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
        title: "Find Hidden Gems",
        prompt:
          "Look for photos that are hidden gems in my library, which may not be immediately obvious but have unique qualities.",
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
    title: "Library Analysis",
    description: "Understand trends and strengths in your catalog",
    icon: SparklesIcon,
    prompt:
      "Analyze my photo library and give me portfolio insights. Where do I excel and what areas could I develop further?",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Identifying Gaps",
        prompt:
          "Based on my current patterns, what subjects or aesthetic styles are underrepresented? Suggest specific steps to enrich my catalogue with new styles or themes.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Overall Work Assessment",
        prompt:
          "Review my entire photo library and provide an honest assessment. Give me an internal ranking of my usage patterns and identify which pieces reach that 'Unique' (10/10) level of impact.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Gender Representation",
        prompt:
          "Analyze my photo library and determine whether men or women appear more frequently as primary subjects across all genres. Break down the distribution and explain if this reflects a stylistic bias, contextual coincidence, or recurring thematic inclination.",
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
    title: "Find similar photos",
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
    title: "Social media ideas",
    description: "Turn photos from your library into posts worth publishing",
    icon: SocialIcon,
    prompt:
      "Help me come up with social media ideas using photos from my library. Suggest concepts, which photos to use, and how to present them.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Post for Today's World Day",
        prompt:
          "Find out which international day or observance is being celebrated today, then design an Instagram post inspired by it using photos from my library. Pick the images that fit best, propose a layout or carousel order, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Weekly Instagram Carousel",
        prompt:
          "Build a 5-10 image Instagram carousel from my library around a single visual theme. Suggest the exact order, explain the narrative arc, and write a caption plus hashtags that match the mood.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "This Week's Posts",
        prompt:
          "Pick 3 photos from my library that would work as standalone posts this week. For each one, explain why it stands out, suggest the best day to publish it, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Behind the Photo Story",
        prompt:
          "Pick one of my strongest photos and turn it into a storytelling post. Explain what makes the image work technically and emotionally, and write a caption that shares the story behind it in my voice.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  {
    title: "Portfolio ideas",
    description: "Discover portfolio themes hiding in your catalog",
    icon: PortfolioIcon,
    prompt:
      "Analyze my photo library and propose portfolio themes I could build from what I already have. For each idea, explain the concept and which photos would anchor it.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Discover My Portfolio Themes",
        prompt:
          "Scan my entire library and propose 3-5 portfolio themes that already exist in my work without me realizing it. For each one, give it a title, describe the concept in a few sentences, and list the photos that would anchor it.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Build a Cohesive 20-Photo Portfolio",
        prompt:
          "Curate a cohesive 20-photo portfolio from my library. Choose a unifying theme, select and sequence the images, and explain why each one earns its place and how the set holds together.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Portfolio for a Specific Audience",
        prompt:
          "Help me tailor a portfolio for a specific audience, such as galleries, editorial clients, or commercial brands. Ask me which one I'm targeting if needed, then suggest which photos from my library fit that audience and how to frame the selection.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Long-Term Project Potential",
        prompt:
          "Look for an unfinished thread in my library that could grow into a long-term photo project or photobook. Explain the concept, show me the photos that already support it, and tell me what I still need to shoot to complete it.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  appHelpSuggestion,
];

/**
 * With an empty library every suggestion above is a dead end — they all search,
 * compare or analyze photos the user doesn't have yet. These take their place
 * until there's a catalog to talk about.
 */
const onboardingSuggestions: Suggestion[] = [
  {
    title: "How do I import my photos?",
    description: "Walk me through getting my catalog in",
    icon: CloudUploadIcon,
    prompt:
      "How do I import and analyze my photos into Photoreka? Walk me through the two processes step by step.",
    needsPhotos: false,
    autoSend: true,
  },
  {
    title: "What is Photoreka?",
    description: "Get an overview of what you can do here",
    icon: SparklesIcon,
    prompt:
      "What is Photoreka and how can it help me as a photographer? Give me a short overview.",
    needsPhotos: false,
    autoSend: true,
  },

  // {
  //   title: "What happens after import?",
  //   description: "See what unlocks after your first import",
  //   icon: LayersIcon,
  //   prompt:
  //     "Once my photos are imported and analyzed, what can I do with them in Photoreka? What tools will I have?",
  //   needsPhotos: false,
  //   autoSend: true,
  // },
  // appHelpSuggestion,
];

const hasPhotos = computed(
  () => (photosStore.processedPhotos?.length ?? 0) > 0,
);

const welcomeTitle = computed(() =>
  hasPhotos.value ? "Chat with your library" : "Welcome to Photoreka",
);

// Typewriter for the welcome title, paired with the logo's scale-in.
const TITLE_TYPING_DELAY_MS = 220; // lets the logo start growing first
const TITLE_TYPING_SPEED_MS = 38;

const prefersReducedMotion =
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

const typedTitle = ref("");
const isTypingTitle = ref(false);
let titleTypingTimer: ReturnType<typeof setInterval> | null = null;
let titleTypingDelay: ReturnType<typeof setTimeout> | null = null;

const stopTitleTyping = () => {
  if (titleTypingTimer) clearInterval(titleTypingTimer);
  if (titleTypingDelay) clearTimeout(titleTypingDelay);
  titleTypingTimer = null;
  titleTypingDelay = null;
  isTypingTitle.value = false;
};

const startTitleTyping = () => {
  stopTitleTyping();

  const full = welcomeTitle.value;
  if (prefersReducedMotion) {
    typedTitle.value = full;
    return;
  }

  typedTitle.value = "";
  isTypingTitle.value = true;
  titleTypingDelay = setTimeout(() => {
    let typed = 0;
    titleTypingTimer = setInterval(() => {
      typedTitle.value = full.slice(0, ++typed);
      if (typed >= full.length) stopTitleTyping();
    }, TITLE_TYPING_SPEED_MS);
  }, TITLE_TYPING_DELAY_MS);
};

// Retypes whenever the welcome screen comes back, and also if the title itself
// changes — the photo library can still be loading when the view first renders.
watch(
  () => [chatStore.messages.length === 0, welcomeTitle.value] as const,
  ([isWelcomeVisible]) => {
    if (!isWelcomeVisible) {
      stopTitleTyping();
      typedTitle.value = "";
      return;
    }
    startTitleTyping();
  },
  { immediate: true },
);

const SUGGESTION_WINDOW_DEFAULT = 4;
const SUGGESTION_WINDOW_WITH_RECENTS = 2;
const SUGGESTION_ROTATION_KEY = "chat_suggestion_rotation";

const suggestionWindowSize = computed(() =>
  showHistory.value && chatStore.conversations.length > 0
    ? SUGGESTION_WINDOW_WITH_RECENTS
    : SUGGESTION_WINDOW_DEFAULT,
);

/**
 * Advances once per page load so the welcome screen doesn't always greet the
 * user with the same four cards. Read once at setup: the window must stay put
 * while the view is alive.
 */
const rotationOffset = (() => {
  const stored = Number(localStorage.getItem(SUGGESTION_ROTATION_KEY));
  const next = (Number.isFinite(stored) ? stored : 0) + 1;
  try {
    localStorage.setItem(SUGGESTION_ROTATION_KEY, String(next));
  } catch {
    // Private mode / storage full: rotation just won't persist.
  }
  return next;
})();

const visibleSuggestions = computed(() => {
  const windowSize = suggestionWindowSize.value;
  const pool = hasPhotos.value ? suggestions : onboardingSuggestions;
  if (pool.length <= windowSize) return pool;
  // The window slides backwards through the pool, so each refresh pulls a fresh
  // card in at the front and drops the last one off the back.
  const start = ((-rotationOffset % pool.length) + pool.length) % pool.length;
  return Array.from(
    { length: windowSize },
    (_, i) => pool[(start + i) % pool.length],
  );
});

const activeSuggestion = ref<Suggestion | null>(null);

const checkMobile = () => {
  isMobile.value = window.innerWidth < 768;
};

const chatInputPlaceholder = computed(() =>
  isMobile.value
    ? "Type a message..."
    : "Type a message... Use @ to mention collections, series, portfolios, or photos",
);

const loadPendingChatPhotos = async () => {
  const pending = sessionStorage.getItem("chat_context_photos");
  const pendingMessage = sessionStorage.getItem("chat_pending_message");

  if (!pending && !pendingMessage) return;

  sessionStorage.removeItem("chat_context_photos");
  sessionStorage.removeItem("chat_pending_message");

  // Navigate away from any conversation route so a fresh one is created
  if (isRoutedView.value && route.params.id) {
    await router.replace("/chat-lab");
  }

  // Start a fresh conversation
  chatStore.startNewConversation();
  contextPhotos.value = [];
  photosEverAttached.value = false;
  inputText.value = "";
  perMessageSelections.value = {};
  activeSuggestion.value = null;

  if (pending) {
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
    inputText.value = pendingMessage;
    nextTick(() => sendMessage());
  }
};

/** Load a conversation by ID and resolve attached photos for display. */
const loadConversationById = async (conversationId: number) => {
  try {
    await chatStore.loadConversation(conversationId);
    for (const msg of chatStore.messages as any[]) {
      if (msg.role === "user" && msg.contextPhotoIds?.length) {
        msg.attachedPhotos = getPhotosForMessage(msg.contextPhotoIds);
        delete msg.contextPhotoIds;
      }
    }
    contextPhotos.value = [];
    photosEverAttached.value = false;
    inputText.value = "";
    perMessageSelections.value = {};
    activeSuggestion.value = null;
    scrollToBottom();
  } catch {
    message.error("Failed to load conversation");
    if (isRoutedView.value) router.replace("/chat-lab");
  }
};

const resetChat = async () => {
  chatStore.startNewConversation();
  contextPhotos.value = [];
  photosEverAttached.value = false;
  inputText.value = "";
  perMessageSelections.value = {};
  activeSuggestion.value = null;
};

// Keep state in sync with the route param
watch(
  () => route.params.id,
  async (id) => {
    // Only react when actually on a chat-lab route. ChatView is kept alive and
    // also hosted by the dashboard, so route.params.id would otherwise fire for
    // any route that uses :id (e.g. /collections/:id).
    if (!isRoutedView.value) {
      return;
    }

    if (id) {
      const numId = parseInt(String(id), 10);
      if (!isNaN(numId) && numId !== chatStore.activeConversationId) {
        await loadConversationById(numId);
      }
    } else {
      // /chat-lab with no ID = new conversation
      if (chatStore.activeConversationId !== null) {
        resetChat();
      }
    }
  },
  { immediate: true },
);

// A second redirect can land while this instance is already mounted (the
// dashboard is kept alive), so the requested conversation has to be watched,
// not just read once on mount.
watch(
  () => props.conversationId,
  async (id) => {
    if (isRoutedView.value || !id) return;
    if (String(id) === String(chatStore.activeConversationId)) return;

    const numericId = Number(id);
    if (!Number.isNaN(numericId)) await loadConversationById(numericId);
  },
);

onMounted(async () => {
  chatStore.fetchModes();
  window.addEventListener("resize", checkMobile);

  // Photos handed off from another tool always win: they open a fresh
  // conversation, so they must never land inside an older one.
  const hadPendingHandoff = !!sessionStorage.getItem("chat_context_photos");
  loadPendingChatPhotos();

  if (isDemoUser.value) return;
  await chatStore.fetchConversations();

  // Outside the chat routes (the dashboard) there is no URL to read the
  // conversation from, so open the requested one. With nothing requested we stay
  // on the welcome screen. An already-active conversation is left alone.
  if (isRoutedView.value || hadPendingHandoff) return;
  if (chatStore.activeConversationId || !props.conversationId) return;

  const target = chatStore.conversations.find(
    (c: any) => String(c.id) === String(props.conversationId),
  );

  if (target) await loadConversationById(target.id);
});

// Also fires on keep-alive re-activation (e.g. navigating back to /chat)
onActivated(() => {
  loadPendingChatPhotos();
});

// Covers the case neither onMounted nor onActivated catches: the dashboard
// keeps this instance mounted and active across the /chat-lab redirect, so a
// hand-off while the chat panel is already open wouldn't otherwise be noticed.
watch(
  () => chatStore.pendingHandoffTick,
  () => loadPendingChatPhotos(),
);

onUnmounted(() => {
  window.removeEventListener("resize", checkMobile);
  stopLoadingPhraseCycle();
  stopTitleTyping();
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

  if (demoCheckQuery(text)) return; // blocked – modal will open

  enterFullscreenOnSend();

  // Snapshot and clear attached photos before sending
  const attachedPhotos = [...contextPhotos.value];
  contextPhotos.value = [];
  inputText.value = "";

  const contextPhotoIds = attachedPhotos
    .map((p) => parseInt(p.id, 10))
    .filter((id) => !isNaN(id));

  isTyping.value = true;
  isSending.value = true;
  startLoadingPhraseCycle();
  scrollToBottom();
  const requestStartedAt = performance.now();

  try {
    await chatStore.sendMessage(text, contextPhotoIds, attachedPhotos);
    // After the first message the store assigns a conversationId — reflect it in the URL
    if (
      isRoutedView.value &&
      chatStore.activeConversationId &&
      !route.params.id
    ) {
      router.replace(`/chat-lab/${chatStore.activeConversationId}`);
    }
    // Fire-and-forget: fetch Phase 3 action suggestions; they pop in under the
    // reply a moment later without blocking the message from rendering.
    if (!chatStore.isKnowledgeAssistant) {
      chatStore.fetchActionsForActiveConversation();
    }
  } catch (error: any) {
    // 402 responses (INSUFFICIENT_CREDITS / QUOTA_EXHAUSTED) are handled by
    // the axios interceptor which shows a notification — no in-chat bubble needed.
    if (error?.response?.status === 402) return;
    const errMsg =
      error?.response?.data?.message ||
      "Something went wrong. Please try again.";
    chatStore.addErrorMessage(errMsg);
  } finally {
    // Guarantee the loader stays up long enough to actually see a couple of
    // phrases rotate, even when the backend answers almost instantly.
    const MIN_TYPING_MS = 2600;
    const elapsed = performance.now() - requestStartedAt;
    if (elapsed < MIN_TYPING_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_TYPING_MS - elapsed),
      );
    }
    isTyping.value = false;
    isSending.value = false;
    stopLoadingPhraseCycle();
    scrollToBottom();
    mentionInputRef.value?.focus();
  }
};

// Matches @-mention tokens (collection/series/portfolio) embedded in a sent user message.
// Name capture is lazy over any character (not just "non-]") so resource names that
// themselves contain brackets (e.g. "[Pattern] Marketplace Narratives") still match —
// it stops at the first "]]" it finds rather than the first stray "]".
const MENTION_TOKEN =
  /\[\[(collection|series|portfolio):(\d+)\|([\s\S]+?)\]\]/g;

const MENTION_ROUTE_NAME: Record<string, string> = {
  collection: "collection-detail",
  series: "series-detail",
  portfolio: "portfolio-detail",
};

interface MentionSegment {
  text: string;
  mention: boolean;
  type?: string;
  id?: number;
}

/** Splits a user message into plain-text/mention segments for highlighted, clickable rendering. */
const messageMentionSegments = (content: string): MentionSegment[] => {
  const segs: MentionSegment[] = [];
  let lastIndex = 0;
  MENTION_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segs.push({
        text: content.slice(lastIndex, match.index),
        mention: false,
      });
    }
    segs.push({
      text: match[3],
      mention: true,
      type: match[1],
      id: Number(match[2]),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segs.push({ text: content.slice(lastIndex), mention: false });
  }
  return segs;
};

const navigateToMention = (seg: MentionSegment) => {
  if (!seg.type || seg.id == null) return;
  const routeName = MENTION_ROUTE_NAME[seg.type];
  if (!routeName) return;
  router.push({ name: routeName, params: { id: seg.id } });
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

const PHOTO_TOKEN_NAME_MAX_LENGTH = 18;

const truncatePhotoName = (filename: string): string => {
  if (filename.length <= PHOTO_TOKEN_NAME_MAX_LENGTH) return filename;
  const dotIndex = filename.lastIndexOf(".");
  const ext = dotIndex > 0 ? filename.slice(dotIndex) : "";
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const keep = Math.max(PHOTO_TOKEN_NAME_MAX_LENGTH - ext.length - 1, 3);
  return `${base.slice(0, keep)}…${ext}`;
};

// Called straight from the template for every message, so it re-parses the whole
// transcript on each render — including once per keystroke while composing.
// Message content is immutable once rendered, so the HTML is cached by content.
const markdownCache = new Map<string, string>();
const MARKDOWN_CACHE_MAX = 400;

const renderMarkdown = (content: string): string => {
  const memo = markdownCache.get(content);
  if (memo !== undefined) return memo;
  const rendered = renderMarkdownUncached(content);
  if (markdownCache.size >= MARKDOWN_CACHE_MAX) markdownCache.clear();
  markdownCache.set(content, rendered);
  return rendered;
};

const renderMarkdownUncached = (content: string): string => {
  const unescaped = content.replace(/\\n/g, "\n");
  const normalized = normalizePhotoTokens(unescaped);
  const html = marked(normalized) as string;
  return html
    .replace(
      PHOTO_TOKEN,
      (_, id, filename) =>
        `<span class="photo-inline-link" data-photo-id="${id}" data-photo-name="${filename}" title="${filename}">${truncatePhotoName(filename)}</span>`,
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
  const photo = findPhotoById(photoId);
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

const getActionPhotoIds = (action: any): string[] => {
  const ids = action?.params?.photoIds;
  if (!Array.isArray(ids)) return [];
  return ids.map((id: string | number) => String(id));
};

const handleActionHoverPhotos = (action: any, messageIndex: number) => {
  const photoIds = getActionPhotoIds(action);
  const row = messagesRef.value?.querySelector<HTMLElement>(
    `.message-row[data-message-index="${messageIndex}"]`,
  );
  const bubble = row?.querySelector<HTMLElement>(".message-bubble");
  if (!bubble) return;

  // Clear previous action-driven highlights in this same bubble.
  bubble
    .querySelectorAll<HTMLElement>(".message-photo-item.photo-action-hover")
    .forEach((el) => {
      el.classList.remove("photo-action-hover", "photo-token-hover");
    });

  if (photoIds.length === 0) return;

  for (const photoId of photoIds) {
    bubble
      .querySelectorAll<HTMLElement>(
        `.message-photo-item[data-photo-id="${photoId}"]`,
      )
      .forEach((el) => {
        // Reuse the existing token hover visual style.
        el.classList.add("photo-action-hover", "photo-token-hover");
      });
  }
};

const clearActionHoverPhotos = (messageIndex: number) => {
  const row = messagesRef.value?.querySelector<HTMLElement>(
    `.message-row[data-message-index="${messageIndex}"]`,
  );
  const bubble = row?.querySelector<HTMLElement>(".message-bubble");
  if (!bubble) return;
  bubble
    .querySelectorAll<HTMLElement>(".message-photo-item.photo-action-hover")
    .forEach((el) => {
      el.classList.remove("photo-action-hover", "photo-token-hover");
    });
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

// O(1) id → photo index. A linear .find() over the store is fine for a few
// hundred photos, but libraries here reach tens of thousands, and every scan
// walks a deeply reactive array: each element read wraps the photo in a proxy
// and registers a dependency on the calling effect. Doing that from the render
// function (see getPhotosForMessage) meant millions of tracked reads per
// keystroke. This computed pays that cost once, and only when the list changes.
const photosById = computed(() => {
  const map = new Map<string, any>();
  for (const p of (photosStore.photos as any[]) || []) {
    map.set(String(p.id), p);
  }
  return map;
});

const findPhotoById = (id: string | number): any =>
  photosById.value.get(String(id));

// Builds a ContextPhoto display entry from a photosStore photo — shared by every
// path that can attach a photo to the chat (dialog picker, floating action bar, @-mentions).
const buildContextPhotoEntry = (photo: any): ContextPhoto => ({
  id: String(photo.id),
  title: photo.title || photo.name || "Photo",
  name: photo.name || photo.title || "Photo",
  url: photo.url,
  thumbnailUrl: photo.thumbnailUrl || photo.url,
  originalUrl: photo.originalUrl,
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

// Context photos management — PhotosDialog emits an array of photo IDs
const onPhotosSelected = (photoIds: string[]) => {
  const existingIds = new Set(contextPhotos.value.map((p) => p.id));
  const remaining = MAX_PHOTOS_TO_CHAT - contextPhotos.value.length;

  const newPhotos: ContextPhoto[] = [];
  let attemptedCount = 0;

  for (const id of photoIds) {
    // Contar intentos de fotos válidas (no duplicadas, existentes)
    if (!existingIds.has(id) && findPhotoById(id)) {
      attemptedCount++;
    }

    if (newPhotos.length >= remaining) break;
    if (existingIds.has(id)) continue;

    const photo = findPhotoById(id);
    if (!photo) continue;

    newPhotos.push(buildContextPhotoEntry(photo));
    existingIds.add(id);
  }

  contextPhotos.value.push(...newPhotos);
  photosDialogVisible.value = false;

  // Show message if tried to add more photos
  if (attemptedCount > newPhotos.length) {
    if (newPhotos.length === 0) {
      message.warning(
        `Can't add more photos. ${MAX_PHOTOS_TO_CHAT} photo limit reached.`,
      );
    } else {
      message.warning(
        `Only ${newPhotos.length} photo(s) added. ${MAX_PHOTOS_TO_CHAT} photo limit reached.`,
      );
    }
  }
};

const getAllPhotoIdsFromLists = (photoLists: PhotoList[]): number[] => {
  return photoLists.flatMap((list) => list.photoIds);
};

// The template calls this once per photo group *and* once more per photo inside
// it (the :all-photos binding), so a bubble with N photos resolves the same list
// N+1 times on every single render — including every keystroke in the composer.
// Results are memoized by the photoIds array identity so repeated calls in one
// render are free and PhotoCardHub keeps receiving a stable :all-photos array
// instead of a fresh one each time. The cache is dropped whenever the store's
// photo list changes, which is what photosById's identity tracks.
let photoGroupCacheOwner: unknown = null;
let photoGroupCache = new WeakMap<object, ContextPhoto[]>();

const getPhotosForMessage = (photoIds: number[]): ContextPhoto[] => {
  const byId = photosById.value;
  if (photoGroupCacheOwner !== byId) {
    photoGroupCacheOwner = byId;
    photoGroupCache = new WeakMap();
  }

  if (!photoIds) return [];
  const cached = photoGroupCache.get(photoIds);
  if (cached) return cached;

  const resolved = photoIds
    .map((id) => {
      const photo = byId.get(String(id));
      if (!photo) return null;
      return buildContextPhotoEntry(photo);
    })
    .filter(Boolean) as ContextPhoto[];

  photoGroupCache.set(photoIds, resolved);
  return resolved;
};

// Labeled photo groups size themselves to their own photo count instead of
// always spanning the full bubble width. This lets the flex-wrap container flow
// small groups side by side (columns) and only stack them (rows) once they no
// longer fit — so three single-photo groups become three columns rather than
// three rows, while a group of five still fills its own row. Photo size stays
// constant (~one cell); only the group's width and column count change.
const PHOTO_CELL_PX = 118;
const PHOTO_GRID_GAP_PX = 8; // must match .message-photos-grid gap (--spacing-sm)

const photoGroupCols = (count: number): number =>
  Math.max(1, Math.min(count || 1, isMobile.value ? 3 : 5));

// Fixes the grid's own width to its column count so the surrounding surface
// (background/border/padding) hugs it naturally, with no extra math needed.
const photoGroupGridStyle = (count: number): Record<string, string> => {
  const cols = photoGroupCols(count);
  return {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    width: `${cols * PHOTO_CELL_PX + (cols - 1) * PHOTO_GRID_GAP_PX}px`,
    maxWidth: "100%",
  };
};

// Narrow groups (fewer photos than the row can hold) sit side by side in a
// tight column, where a wrapping two-line label reads as misaligned clutter —
// so those get a smaller, single-line, ellipsized label instead.
const isNarrowPhotoGroup = (count: number): boolean =>
  photoGroupCols(count) < (isMobile.value ? 3 : 5);

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
      .map((id: number) => findPhotoById(id))
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
  const remaining = MAX_PHOTOS_TO_CHAT - contextPhotos.value.length;
  const newPhotos: ContextPhoto[] = [];
  let attemptedCount = 0;

  for (const id of selectedPhotoIds.value) {
    const strId = String(id);
    // Contar intentos de fotos válidas (no duplicadas, existentes)
    if (!existingIds.has(strId) && findPhotoById(strId)) {
      attemptedCount++;
    }

    if (newPhotos.length >= remaining) break;
    if (existingIds.has(strId)) continue;

    const photo = findPhotoById(strId);
    if (!photo) continue;

    newPhotos.push(buildContextPhotoEntry(photo));
    existingIds.add(strId);
  }

  contextPhotos.value.push(...newPhotos);
  clearAllSelectionsAndScopes();

  // Show message if tried to add more photos
  if (attemptedCount > newPhotos.length) {
    if (newPhotos.length === 0) {
      message.warning(
        `Can't add more photos. ${MAX_PHOTOS_TO_CHAT} photo limit reached.`,
      );
    } else {
      message.warning(
        `Only ${newPhotos.length} photo(s) added. ${MAX_PHOTOS_TO_CHAT} photo limit reached.`,
      );
    }
  }
};

// Called from PhotoCardHub's attach-to-chat shortcut button — the photo is already
// resolved to a display-shaped object (message bubbles, results), so it's attached
// directly without a store lookup.
const handleAttachPhotoToChat = (photo: any) => {
  const strId = String(photo.id);
  if (contextPhotos.value.some((p) => p.id === strId)) {
    message.info("Photo already attached");
    return;
  }
  if (contextPhotos.value.length >= MAX_PHOTOS_TO_CHAT) {
    message.warning(
      `Can't add more photos. ${MAX_PHOTOS_TO_CHAT} photo limit reached.`,
    );
    return;
  }
  contextPhotos.value.push(buildContextPhotoEntry(photo));
};

// Called when a photo is selected from the @-mention dropdown inside the composer.
const handleMentionAttachPhoto = async (result: { id: string | number }) => {
  const strId = String(result.id);
  if (contextPhotos.value.some((p) => p.id === strId)) return; // already attached — dropdown already routes this to flash-photo
  if (contextPhotos.value.length >= MAX_PHOTOS_TO_CHAT) {
    message.warning(
      `Can't add more photos. ${MAX_PHOTOS_TO_CHAT} photo limit reached.`,
    );
    return;
  }
  const photo =
    findPhotoById(strId) || (await photosStore.fetchPhoto(result.id));
  if (!photo) return;
  contextPhotos.value.push(buildContextPhotoEntry(photo));
};

// Briefly pulses an already-attached photo's card in primary when re-mentioned via @.
const flashingPhotoIds = ref<Set<string>>(new Set());
const handleFlashPhoto = (photoId: string | number) => {
  const id = String(photoId);
  flashingPhotoIds.value = new Set(flashingPhotoIds.value).add(id);
  setTimeout(() => {
    const next = new Set(flashingPhotoIds.value);
    next.delete(id);
    flashingPhotoIds.value = next;
  }, 900);
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

const handleNewChat = async () => {
  showSidebar.value = false;
  if (isRoutedView.value && route.params.id) {
    // Navigate to base route; watcher will call resetChat()
    await router.push("/chat-lab");
  } else {
    // Already on /chat-lab, or hosted by the dashboard: reset in-place
    resetChat();
  }
};

const handleLoadConversation = async (conversationId: number) => {
  showSidebar.value = false;

  // Hosted by the dashboard: load in-place, the URL isn't ours to drive.
  if (!isRoutedView.value) {
    if (conversationId !== chatStore.activeConversationId) {
      await loadConversationById(conversationId);
    }
    return;
  }

  // Navigate to the conversation route; the watcher handles loading
  if (String(conversationId) !== String(route.params.id)) {
    await router.push(`/chat-lab/${conversationId}`);
  }
};

const handleDeleteConversation = async (conversationId: number) => {
  pendingDeleteId.value = null;
  try {
    await chatStore.deleteConversation(conversationId);
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
  /* gap: var(--spacing-xs); */
  padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm)
    var(--spacing-lg);
  cursor: pointer;
  border-left: 2px solid transparent;
  transition:
    background 0.15s,
    border-color 0.15s;
  /* min-height: 52px; */
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
  padding: var(--spacing-xs) var(--spacing-xs);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  min-height: 35px;
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

/* Flex centra la caja de línea, no los glifos: la fuente reserva mucho más
   hueco sobre las mayúsculas que bajo la baseline. Recortamos la caja a la
   tinta real para que centrarla sea centrar lo que se ve. */
.chat-topbar-title,
.new-chat-label {
  line-height: 1;
  text-box: trim-both cap alphabetic;
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

/* On the welcome screen there is no top bar to sit in, so the toggle floats
   over the content rather than reserving a strip of its own. */
.sidebar-toggle-btn--floating {
  position: absolute;
  top: 7px;
  left: 3px;
  z-index: 50;
}

.chat-topbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.new-chat-btn {
  color: var(--text-secondary) !important;
  font-size: var(--font-size-xs) !important;
}

/* ── Fullscreen toggle (dashboard host only) ── */
.fullscreen-btn {
  color: var(--text-tertiary) !important;
  transition:
    color 0.15s,
    background 0.15s !important;
}

/* .fullscreen-btn.active,
.fullscreen-btn:hover {
  color: var(--accent-color) !important;
} */

.fullscreen-btn--floating {
  position: absolute;
  top: 7px;
  right: 6px;
  z-index: 50;
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

.context-photo-wrapper.flash-highlight {
  animation: contextPhotoFlash 0.9s ease;
}

.action-suggestions-skeleton {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.action-chip-skeleton {
  width: 96px;
  height: 28px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    var(--border-color) 0%,
    var(--bg-hover) 50%,
    var(--border-color) 100%
  );
  background-size: 200% 100%;
  animation: actionChipShimmer 1.4s ease-in-out infinite;
}

.action-chip-skeleton:nth-child(2) {
  width: 120px;
}

.action-chip-skeleton:nth-child(3) {
  width: 80px;
}

@keyframes actionChipShimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@keyframes contextPhotoFlash {
  0% {
    box-shadow: 0 0 0 3px var(--primary-color);
  }
  70% {
    box-shadow: 0 0 0 3px var(--primary-color);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.mention-chip-sent {
  color: var(--primary-color);
  background: var(--primary-15);
  border-radius: 3px;
  padding: 0 2px;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
  transition:
    background 0.15s,
    color 0.15s;
}

.mention-chip-sent:hover {
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  text-decoration-style: solid;
}

.remove-photo-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  background: var(--bg-container);
  border-color: var(--border-color);
  color: var(--text-tertiary);
  transition: all 0.15s;
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
  padding: var(--spacing-xl) var(--spacing-2xl);
  position: relative;
}

.welcome-content {
  text-align: center;
  max-width: 720px;
  width: 100%;
}

.welcome-icon {
  color: var(--text-tertiary);
}

/* Wrapper, not the logo itself: AppLogo owns its own opacity, and nesting keeps
   the animation from overwriting it. */
.welcome-icon-wrap {
  animation: welcome-icon-in 3000ms cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: transform, opacity;
}

@keyframes welcome-icon-in {
  from {
    opacity: 0.1;
    /* transform: scale(0.4) translateY(10px); */
  }
  to {
    opacity: 1;
    /* transform: scale(1) translateY(0); */
  }
}

.welcome-title {
  position: relative;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-xs) 0;
}

.welcome-title-ghost {
  visibility: hidden;
}

.welcome-title-typed {
  position: absolute;
  inset: 0;
}

.welcome-title-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 3px;
  vertical-align: -0.12em;
  background: currentColor;
  opacity: 0.7;
  animation: welcome-caret-blink 900ms steps(1, end) infinite;
}

@keyframes welcome-caret-blink {
  0%,
  50% {
    opacity: 0.7;
  }
  50.1%,
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-icon-wrap {
    animation: none;
  }

  .welcome-title-caret {
    display: none;
  }
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
  line-height: var(--line-height-relaxed);
  text-align: center;
}

.welcome-hint--bottom {
  position: absolute;
  left: 50%;
  bottom: var(--spacing-lg);
  transform: translateX(-50%);
  margin: 0;
  z-index: 2;
}

.welcome-hint-link {
  height: auto;
  padding: 0;
  color: var(--accent-color);
  font-size: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  opacity: 0.85;
  transition: opacity 0.15s;
}

.welcome-hint-link:hover {
  opacity: 1;
}

.welcome-import-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: var(--spacing-xl) auto 0;
  padding: 10px 22px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent-color) 42%, transparent);
  background: color-mix(in srgb, var(--bg-card) 82%, transparent);
  color: color-mix(in srgb, var(--text-primary) 80%, var(--accent-color) 20%);
  text-decoration: none;
  font-size: var(--font-size-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.welcome-import-btn:hover {
  background: color-mix(
    in srgb,
    var(--bg-surface-hover) 90%,
    var(--accent-color) 10%
  );
  border-color: color-mix(in srgb, var(--accent-color) 60%, transparent);
  color: var(--text-primary);
}

.welcome-import-btn:active {
  transform: scale(0.97);
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
  /* Column count follows the panel's own width, not the viewport's: the chat
     column narrows when the app sidebar opens while the viewport stays wide,
     and a media query can't see that. Two up while there's room, one when not. */
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  /* Rows hug their content — never absorb the free space in the welcome column.
     Items within a row still stretch to match each other's height. */
  align-content: start;
  gap: var(--spacing-md);
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.suggestion-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xs);
  padding: var(--spacing-lg);
  /* Room for the absolutely-positioned expand chevron. */
  padding-right: calc(var(--spacing-lg) + var(--spacing-md));
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

.suggestion-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.suggestion-icon {
  display: flex;
  color: var(--primary-color);
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
  height: auto;
  padding: 0;
  margin-bottom: var(--spacing-sm);
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
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
  justify-content: flex-start;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-surface);
  border-color: var(--border-color);
  border-radius: var(--radius-md);
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

  /* El hueco que la burbuja debe dejar libre: avatar (32px) + gap (8px). */
  --bubble-gutter: 40px;
  /* Medida de lectura. Al topar aquí, toda columna más ancha que la medida
     produce exactamente los mismos saltos de línea. */
  --bubble-measure: 680px;
  /* Por debajo de la medida la burbuja sigue a la columna, pero a saltos. */
  --bubble-step: 48px;
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

/* La columna del chat anima su ancho (fullscreen del dashboard, plegado de
   paneles, resize de ventana). Con un ancho en % la burbuja re-envolvía el
   texto en cada frame de esa animación. Ahora el ancho se topa en una medida
   de lectura fija —así todo ancho de columna por encima de ella da los mismos
   saltos de línea y las burbujas solo se deslizan— y, por debajo, se cuantiza
   en escalones, de modo que el texto se recoloca en 2-3 saltos discretos en
   vez de continuamente. El gutter se descuenta del 100% para que la burbuja
   nunca desborde la fila y flexbox no active el shrink (que volvería a hacer
   el ajuste continuo); el shrink queda solo como red de seguridad. */
.message-bubble {
  flex: 0 1 auto;
  min-width: 0;
  /* Fallback para navegadores sin round(): continuo, como antes. */
  width: min(100% - var(--bubble-gutter), var(--bubble-measure));
  width: max(
    240px,
    round(
      down,
      min(100% - var(--bubble-gutter), var(--bubble-measure)),
      var(--bubble-step)
    )
  );
  padding: 15px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  color: var(--text-primary);
}

.message-assistant .message-bubble {
  background: var(--bg-container);
  border: 1px solid var(--border-color);
  border-top-left-radius: var(--radius-xs);
}

.message-user .message-bubble {
  background: var(--bg-container);
  color: var(--text-primary);
  border-top-right-radius: var(--radius-xs);
}

.message-text,
.message-assistant .message-bubble :deep(.markdown-content) {
  font-size: 14px;
  font-weight: 300;
  line-height: var(--line-height-relaxed);
  word-break: break-word;
  margin: 0;
}

.message-text {
  animation: messageTextFadeIn 0.45s ease;
}

@keyframes messageTextFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.message-user .message-time {
  color: rgba(255, 255, 255, 0.7);
}

/* ── Typing Indicator ── */
.typing-bubble {
  padding: var(--spacing-sm) var(--spacing-lg);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.typing-phrase {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  letter-spacing: 0.02em;
}

.phrase-fade-enter-active,
.phrase-fade-leave-active {
  transition: opacity 0.3s ease;
}
.phrase-fade-enter-from,
.phrase-fade-leave-to {
  opacity: 0;
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

/* ── Input box ──
   Flexbox with wrap + order, not grid: each wrapped line sizes itself
   independently, so the text row never inherits reserved width from the
   controls row below it (grid's shared column tracks did exactly that and
   left an awkward gap at the end of the text).
   Single line: attach | text | controls, all on one row.
   Multiline: text takes the full row on top; attach + controls drop to
   their own row below (forced by flex-basis: 100% on the text item, which
   pushes everything after it onto the next wrapped line). */
.chat-input-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  /* column-gap: var(--spacing-sm);
  row-gap: var(--spacing-xs); */
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  background: var(--bg-surface);
  padding: var(--spacing-xs) var(--spacing-sm);
  transition: border-color 0.15s ease;
}

.chat-input-box--multiline {
  padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-xs);
}

.chat-input-box:focus-within {
  border-color: var(--primary-color);
}

.attach-btn {
  order: 1;
  flex-shrink: 0;
  color: var(--text-tertiary) !important;
}

.chat-input {
  order: 2;
  flex: 1 1 auto;
  min-width: 0;
}

.chat-input-controls {
  order: 3;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

.chat-input-box--multiline .chat-input {
  order: 1;
  flex-basis: 100%;
}

.chat-input-box--multiline .attach-btn {
  order: 2;
}

.chat-input-box--multiline .chat-input-controls {
  order: 3;
  margin-left: auto;
}

.chat-mode-selector {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.send-button {
  flex-shrink: 0;
}

/* ── Responsive ── */
@media (max-width: 768px) {
  /* Columns are handled by auto-fit above; only the breathing room shrinks. */
  .suggestion-cards {
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

  /* Always stacked on mobile — a single row is too cramped to be worth it,
     and switching layouts on the first line-wrap would cause a visible jump. */
  .chat-input-box {
    padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-xs);
  }

  .chat-input-box .chat-input {
    order: 1;
    flex-basis: 100%;
  }

  .chat-input-box .attach-btn {
    order: 2;
  }

  .chat-input-box .chat-input-controls {
    order: 3;
    margin-left: auto;
    gap: var(--spacing-xs);
  }

  .chat-mode-selector :deep(.mode-selector-chip) {
    width: 35px;
    height: 35px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    gap: 0;
  }

  .chat-mode-selector
    :deep(.mode-selector-chip > span:not(.mode-selector-chip-badge)) {
    display: none;
  }

  .chat-mode-selector :deep(.mode-selector-chip .n-icon) {
    font-size: 16px !important;
  }

  .chat-mode-selector :deep(.mode-selector-chip-badge) {
    display: inline-flex;
  }

  .context-photo-wrapper {
    width: 100px !important;
    height: 100px !important;
  }
}

@media (max-width: 480px) {
  .suggestion-card {
    padding: var(--spacing-md);
    padding-right: calc(var(--spacing-md) + var(--spacing-md));
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
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  /* Groups keep their content-based width; when several share a row they
     spread out edge to edge instead of packing to the left, so a columnar
     layout fills the whole width. A group that owns its row stays flush left. */
  /* justify-content: space-between; */
  gap: var(--spacing-md);
}

.message-photo-list {
  flex: 0 1 auto;
  min-width: 0;
  padding: var(--spacing-sm);
  background: var(--primary-08);
  /* border: 1px solid var(--border-color); */
  border-radius: var(--radius-md);
}

.message-photo-list-label {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  line-height: 1.3;
  /* Reserves room for a 2-line label (e.g. "Honorable Mention") so every
     group's label block is the same height and the photos below start
     perfectly aligned across columns, whether their own label wraps or not. */
  margin-bottom: var(--spacing-sm);
}

/* Narrow (column-packed) groups: a wrapped 2-line label reads as a misaligned
   jumble next to its neighbors, so it collapses to one truncated line instead. */
.message-photo-list-label--narrow {
  font-size: 10px;
  min-height: 1.3em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  outline: 1px solid var(--accent-color);
  outline-offset: 1px;
}

@media (max-width: 768px) {
  .message-avatar {
    width: 28px;
    height: 28px;
  }

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
/* Collapses out (and back in) when photos are attached to the composer */
.welcome-footer-enter-active,
.welcome-footer-leave-active {
  overflow: hidden;
  transition:
    opacity 0.28s ease,
    max-height 0.4s ease,
    transform 0.4s ease;
}

.welcome-footer-enter-from,
.welcome-footer-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
}

.welcome-footer-enter-to,
.welcome-footer-leave-from {
  opacity: 1;
  max-height: 480px;
}

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
  gap: var(--spacing-sm);
}

.recent-conv-item {
  height: auto;
  padding: var(--spacing-xs) var(--spacing-xs);
  background: color-mix(in srgb, var(--bg-container) 40%, transparent);
  border-color: var(--border-color);
  border-radius: var(--radius-md);
  transition:
    background 0.15s,
    border-color 0.15s;
}

.recent-conv-item :deep(.n-button__content) {
  width: 100%;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.recent-conv-item:hover {
  /* background: color-mix(in srgb, var(--accent-color) 6%, var(--bg-surface)); */
  border-color: var(--accent-color);
}

.recent-conv-title {
  font-size: var(--font-size-sm);
  line-height: 1.5;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

/* .recent-conv-item:hover .recent-conv-title {
  color: var(--text-primary);
} */

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
