<template>
  <div
    ref="chatViewRef"
    class="chat-view"
    :class="{
      'chat-view--split': templateConfig.pinSelectionPanel,
      'chat-view--narrow': isNarrow,
      'chat-view--tight': isTight,
    }"
  >
    <!-- Sidebar Backdrop — conversations sidebar only. The selection space
         stays readable alongside the transcript, so it gets no backdrop at all. -->
    <transition name="backdrop-fade">
      <div
        v-if="showSidebar"
        class="sidebar-backdrop"
        @click="closeSidePanels"
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

    <!-- Selection space — photos kept aside across the whole conversation.
         A template that pins it turns it into a permanent right-hand column
         (see `.chat-view--split`), so it can never be toggled shut. -->
    <ChatSelectionPanel
      v-if="!templateConfig.hideBasket"
      :show="showBasket || !!templateConfig.pinSelectionPanel"
      :photos="basketPhotos"
      :selected-ids="contextPhotoIdSet"
      @close="showBasket = false"
      @select="toggleBasketPhotoAsContext"
      @remove="handleRemoveFromBasket"
    />

    <!-- Top bar — only inside a conversation. On the welcome screen it would be
         an empty strip holding nothing but the conversations toggle, so that
         toggle floats over the content instead (see below).

         A templated session drops it entirely: history, new chat and fullscreen
         are all off there, the pinned selection panel needs no toggle, and the
         conversation title is already in the host modal's own header. -->
    <div v-if="hasMessages && !templateConfig.hideTopbar" class="chat-topbar">
      <div
        class="chat-topbar-left"
        :class="{ 'chat-topbar-left--no-icon': !showHistory }"
      >
        <n-button
          v-if="showHistory"
          quaternary
          size="small"
          class="sidebar-toggle-btn"
          :class="{ active: showSidebar }"
          title="Conversations"
          @click="toggleSidebar"
        >
          <template #icon>
            <n-icon :size="17"><LayersIcon /></n-icon>
          </template>
        </n-button>
        <!-- A templated session's conversation is never listed, so there is no
             stored title to read here — its host names the session instead. -->
        <span v-if="!templateConfig.hideHistory" class="chat-topbar-title">{{
          activeConversationTitle
        }}</span>
      </div>
      <div class="chat-topbar-right">
        <n-button
          v-if="!templateConfig.hideNewChat"
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
        <n-tooltip v-if="!isTemplateSession" trigger="hover" placement="top">
          <template #trigger>
            <n-button
              quaternary
              size="small"
              class="sidebar-toggle-btn curation-toggle-btn"
              :class="{ active: chatStore.curationMode }"
              @click="toggleCurationMode"
            >
              <template #icon>
                <n-icon :size="17"><CurationIcon /></n-icon>
              </template>
            </n-button>
          </template>
          {{
            chatStore.curationMode
              ? "Curation mode on — new searches skip photos already shown, responses are shorter"
              : "Curation mode off — turn on to skip photos already shown and for a faster exploration"
          }}
        </n-tooltip>
        <n-button
          v-if="showBasketToggle"
          quaternary
          size="small"
          class="sidebar-toggle-btn basket-toggle-btn"
          :class="{ active: showBasket }"
          @click="toggleBasketPanel"
        >
          <template #icon>
            <n-icon :size="17"><PicksIcon /></n-icon>
          </template>
          <span v-if="chatStore.basketCount > 0" class="basket-count">{{
            chatStore.basketCount
          }}</span>
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
        @click="toggleSidebar"
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
      <!-- Welcome / Suggestions (visible before chatting). A templated session
           opens by sending its own brief, so it never has a blank state to fill
           — and none of these suggestions belong to the job it was opened for.
           `hideWelcome` is the same argument for a host that is not a template:
           the canvas panel is a narrow column whose subject is the board in front
           of the user, and library-wide prompts point away from it. -->
      <div
        v-if="
          chatStore.messages.length === 0 &&
          !isTemplateSession &&
          !templateConfig.hideWelcome
        "
        class="chat-welcome"
      >
        <div class="welcome-content">
          <!-- <n-icon :size="isMobile ? 48 : 64" class="welcome-icon">
            <RobotOutlined />
          </n-icon> -->
          <div class="welcome-icon-wrap">
            <AppLogo
              layout="icon"
              :height="isNarrow ? 48 : 64"
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

          <!-- Main suggestion cards — two at a time, sliding through the pool -->
          <div v-else ref="suggestionCarouselEl" class="suggestion-carousel">
            <div class="suggestion-viewport">
              <Transition name="suggestion-slide">
                <div :key="suggestionStep" class="suggestion-cards">
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
                        <span class="suggestion-title">{{
                          suggestion.title
                        }}</span>
                      </div>
                      <span class="suggestion-desc">{{
                        suggestion.description
                      }}</span>
                    </div>
                    <n-icon
                      v-if="
                        suggestion.subQueries && suggestion.subQueries.length
                      "
                      :size="14"
                      class="suggestion-expand-icon"
                    >
                      <ChevronForwardIcon />
                    </n-icon>
                  </div>
                </div>
              </Transition>
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
                    @click="toggleSidebar"
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

      <!-- The blank state for a host that dropped the welcome screen. A whole component,
           supplied by the host: the generic suggestion cards point at the library rather
           than at whatever this surface is for, and what needs explaining in their place
           is specific enough to deserve its own artwork. -->
      <div
        v-else-if="chatStore.messages.length === 0 && templateConfig.emptyState"
        class="chat-welcome chat-welcome--compact"
      >
        <component
          :is="templateConfig.emptyState"
          @send-prompt="handleEmptyStatePrompt"
        />
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
                      :selectable="arePhotosSelectable"
                      :selected="isPhotoSelectedInMessage(index, photo.id)"
                      :is-selection-mode="isMessageInSelectionMode(index)"
                      @select="
                        (photoId) => toggleMessagePhotoSelection(index, photoId)
                      "
                      @info="(p) => showPhotoInfo(p, message.attachedPhotos)"
                      @attach-to-chat="handleAttachPhotoToChat"
                      :show-basket-toggle="showBasketToggle"
                      :in-basket="chatStore.isPhotoInBasket(photo.id)"
                      @toggle-basket="handleToggleBasket"
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
              v-html="renderMarkdown(demoTrimReply(message.content))"
              @click="handleMarkdownClick"
              @mouseover="handleMarkdownMouseOver"
              @mouseout="handleMarkdownMouseOut"
            ></div>
            <!-- Photo results: a single untitled batch, rendered as a bare grid -->
            <div v-if="isFlatPhotoList(index)" class="message-photos">
              <div class="message-photos-grid">
                <div
                  v-for="photo in getPhotosForMessage(
                    photoListsByIndex[index][0].photoIds,
                  )"
                  :key="photo.id"
                  class="message-photo-item"
                  :class="{
                    'message-photo-item--draggable': canDragPhoto(photo),
                    'message-photo-item--on-canvas': isPhotoOnCanvas(photo),
                  }"
                  :data-photo-id="photo.id"
                  :draggable="canDragPhoto(photo)"
                  @dragstart="(e) => onPhotoDragStart(e, photo)"
                  @mouseenter="onCanvasPhotoHover(photo)"
                  @mouseleave="onCanvasPhotoHover(null)"
                >
                  <PhotoCardHub
                    :photo="photo"
                    :all-photos="
                      getPhotosForMessage(photoListsByIndex[index][0].photoIds)
                    "
                    :showName="true"
                    :showFooter="false"
                    :showDelete="false"
                    :show-flag="false"
                    :showDuplicate="false"
                    :show-attach-to-chat="true"
                    :isUploading="photo.isUploading"
                    :selectable="arePhotosSelectable"
                    :selected="isPhotoSelectedInMessage(index, photo.id)"
                    :is-selection-mode="isMessageInSelectionMode(index)"
                    @select="
                      (photoId) => toggleMessagePhotoSelection(index, photoId)
                    "
                    @info="
                      (p) =>
                        showPhotoInfo(
                          p,
                          getPhotosForMessage(
                            photoListsByIndex[index][0].photoIds,
                          ),
                        )
                    "
                    @attach-to-chat="handleAttachPhotoToChat"
                    :show-locate="false"
                    @locate="handleLocateOnCanvas"
                    :show-basket-toggle="showBasketToggle"
                    :in-basket="chatStore.isPhotoInBasket(photo.id)"
                    @toggle-basket="handleToggleBasket"
                  />
                </div>
              </div>
            </div>
            <!-- Photo results: titled groups -->
            <div
              v-else-if="photoListsByIndex[index]?.length"
              class="message-photo-lists"
            >
              <div
                v-for="(list, listIdx) in photoListsByIndex[index]"
                :key="listIdx"
                class="message-photo-list"
              >
                <div class="message-photo-list-header">
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
                  <!-- Add-only, never removes: a toggle here would silently
                       undo picks the user made photo by photo. -->
                  <n-button
                    v-if="showBasketToggle && list.photoIds.length > 1"
                    size="tiny"
                    text
                    type="primary"
                    class="group-keep-btn"
                    :disabled="isGroupFullyInBasket(list.photoIds)"
                    :title="
                      isGroupFullyInBasket(list.photoIds)
                        ? 'All of these are already in your selection'
                        : 'Keep all of these in your selection'
                    "
                    @click="handleKeepGroup(list.photoIds, $event)"
                  >
                    <template #icon>
                      <n-icon :size="14"><CheckmarkDoneIcon /></n-icon>
                    </template>
                  </n-button>
                  <!-- Beside a canvas, the same corner instead offers to make the group
                       real: the board has no selection space to keep photos in, it has
                       room. -->
                  <n-button
                    v-if="canMaterializeGroups && list.photoIds.length > 1"
                    size="tiny"
                    text
                    type="primary"
                    class="group-keep-btn"
                    :loading="materializingGroup === `${index}-${listIdx}`"
                    :disabled="materializingGroup !== null"
                    title="Lay this group out on the canvas"
                    @click="handleMaterializeGroup(list, `${index}-${listIdx}`)"
                  >
                    <template #icon>
                      <n-icon :size="14"><GridIcon /></n-icon>
                    </template>
                  </n-button>
                </div>
                <div
                  class="message-photos-grid"
                  :style="photoGroupGridStyle(list.photoIds.length)"
                >
                  <div
                    v-for="photo in getPhotosForMessage(list.photoIds)"
                    :key="photo.id"
                    class="message-photo-item"
                    :class="{
                      'message-photo-item--draggable': canDragPhoto(photo),
                      'message-photo-item--on-canvas': isPhotoOnCanvas(photo),
                    }"
                    :data-photo-id="photo.id"
                    :draggable="canDragPhoto(photo)"
                    @dragstart="(e) => onPhotoDragStart(e, photo)"
                    @mouseenter="onCanvasPhotoHover(photo)"
                    @mouseleave="onCanvasPhotoHover(null)"
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
                      :selectable="arePhotosSelectable"
                      :selected="isPhotoSelectedInMessage(index, photo.id)"
                      :is-selection-mode="isMessageInSelectionMode(index)"
                      @select="
                        (photoId) => toggleMessagePhotoSelection(index, photoId)
                      "
                      @info="
                        (p) =>
                          showPhotoInfo(p, getPhotosForMessage(list.photoIds))
                      "
                      @attach-to-chat="handleAttachPhotoToChat"
                      :show-locate="false"
                      @locate="handleLocateOnCanvas"
                      :show-basket-toggle="showBasketToggle"
                      :in-basket="chatStore.isPhotoInBasket(photo.id)"
                      @toggle-basket="handleToggleBasket"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div class="message-footer">
              <span class="message-time">{{
                formatTime(message.timestamp)
              }}</span>
              <!-- Canvas focus reference. The photos this question was asked about can
                   scroll out of the board's focus while the agent thinks, so the answer
                   loses its subject. This keeps that subject one hover away, styled as the
                   same quiet pill as the panel's own "focused" chip, on the very message
                   it belongs to. Only where there is a board, and only when a focus was
                   actually captured and still resolves to photos. -->
              <n-popover
                v-if="
                  canvasSession &&
                  message.role === 'user' &&
                  canvasContextTotal(message) > 0
                "
                trigger="hover"
                placement="top-end"
                :show-arrow="false"
                :style="{ padding: 0 }"
                raw
              >
                <template #trigger>
                  <n-tag
                    round
                    :bordered="false"
                    size="small"
                    class="focus-ref-chip"
                  >
                    <!-- The same legend as the panel's live chip: one part per level the
                         chat was given, in the same marks and the same order. -->
                    <span class="focus-ref-parts">
                      <span
                        v-if="canvasContextCounts(message).region > 0"
                        class="focus-ref-part"
                      >
                        <CanvasScopeMark type="region" :size="11" />
                        <span>{{ canvasContextCounts(message).region }}</span>
                      </span>
                      <template v-else>
                        <span class="focus-ref-part">
                          <CanvasScopeMark type="focus" :size="11" />
                          <span>{{ canvasContextCounts(message).focus }}</span>
                        </span>
                        <span
                          v-if="canvasContextCounts(message).spotlight > 0"
                          class="focus-ref-part"
                        >
                          <n-icon :size="12"><SpotlightIcon /></n-icon>
                          <span>{{
                            canvasContextCounts(message).spotlight
                          }}</span>
                        </span>
                      </template>
                    </span>
                  </n-tag>
                </template>
                <CanvasChatContext
                  mode="past"
                  :focused-photos="
                    withCanvasGeometry(
                      getPhotosForMessage(message.canvasFocus.focusedIds ?? []),
                      message.canvasFocus.geometry,
                    )
                  "
                  :board-count="message.canvasFocus.boardCount"
                  :spotlighted-photos="
                    withCanvasGeometry(
                      getPhotosForMessage(
                        message.canvasFocus.spotlightIds ?? [],
                      ),
                      message.canvasFocus.geometry,
                    )
                  "
                  :region-mode="canvasContextCounts(message).region > 0"
                  :region-count="canvasContextCounts(message).region"
                />
              </n-popover>
              <!-- Drag affordance. Nothing about a photo in a bubble suggests it can be
                   taken out of the transcript, and a gesture nobody discovers is the same
                   as one that does not exist. Only where there is somewhere to drop it —
                   see `canDragToCanvas` — and only under replies that actually showed
                   photos. -->
              <span
                v-if="canDragToCanvas && photoListsByIndex[index]?.length"
                class="message-drag-hint"
              >
                <n-icon :size="12"><HandLeftOutline /></n-icon>
                Drag any photo onto the canvas
              </span>
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
            <!-- Phase 3 recommended actions. A templated session has exactly one
                 destination for its photos — its own call to action — so generic
                 "add to a collection" chips would only pull the user out of it. -->
            <div
              v-if="
                message.role === 'assistant' &&
                message.actionsPending &&
                !templateConfig.hideActions
              "
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
                message.actions.length > 0 &&
                !templateConfig.hideActions
              "
              :actions="message.actions"
              @execute="handleActionExecute($event, message)"
              @hover-photos="handleActionHoverPhotos($event, index)"
              @clear-hover-photos="clearActionHoverPhotos(index)"
            />
            <!-- Fixed chips declared by the session's template. Independent of
                 the Phase 3 block above: these are written in front-end code,
                 not proposed by the model, and they survive `hideActions`. -->
            <ChatActionSuggestions
              v-if="templateMessageActionsByIndex[index]"
              :actions="templateMessageActionsByIndex[index]"
              @execute="runTemplateMessageAction"
            />
            <!-- Beside a canvas: lay every group this reply proposed out at once,
                 instead of clicking the corner button of each one in turn. -->
            <ChatActionSuggestions
              v-if="canvasGroupActionsByIndex[index]"
              :actions="canvasGroupActionsByIndex[index]"
              @execute="handleMaterializeAllGroups(index)"
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
      <!-- Canvas-only-context warning. Only where there IS a board — a canvas chat can be
           asked to answer with nothing more than the board's own metadata (no halo, no
           hand-picked focus, nothing spotlighted), which is easy to mistake for the agent
           actually looking at photos. Dismissible per occurrence: it reappears once the
           context that triggered it clears and comes back. -->
      <NAlert
        v-if="showCanvasMetadataOnlyWarning"
        type="warning"
        :bordered="false"
        closable
        class="canvas-metadata-only-alert"
        @close="canvasMetadataWarningDismissed = true"
      >
        <template #icon>
          <n-icon><WarningOutline /></n-icon>
        </template>
        No photos in focus — the assistant only sees the canvas's global
        metadata, not the images themselves nor the visual arrangement of the
        canvas.
        <n-checkbox
          size="small"
          :checked="canvasMetadataWarningDismissedForever"
          class="canvas-notice-dismiss-forever"
          @update:checked="dismissCanvasMetadataWarningForever"
        >
          Don't show this again
        </n-checkbox>
      </NAlert>

      <!-- The selection ran past what the chat can be shown, so it travels as a REGION —
           a reduced canvas the assistant reaches as metadata. Said here, where the turn is
           written, because the board's frame alone does not say what changed for the chat. -->
      <NAlert
        v-if="showCanvasRegionNotice"
        type="info"
        :bordered="false"
        closable
        class="canvas-metadata-only-alert"
        @close="canvasRegionNoticeDismissed = true"
      >
        <template #icon>
          <n-icon><InformationCircleIcon /></n-icon>
        </template>
        Too many photos are in focus, creating a region of
        {{ canvasContextReadout.focusedPhotos.length }} photos. The assistant
        works over their metadata, not the images. Select
        {{ canvasContextReadout.maxFocused }} or fewer to create a visual focus.
        <n-checkbox
          size="small"
          :checked="canvasRegionNoticeDismissedForever"
          class="canvas-notice-dismiss-forever"
          @update:checked="dismissCanvasRegionNoticeForever"
        >
          Don't show this again
        </n-checkbox>
      </NAlert>

      <!-- Context Photos (shown above input when photos are added). Shown in the canvas
           chat too: a photo SPOTLIGHTED on the board is board state and wears its badge
           there, but a photo genuinely attached — @-mentioned, or pulled from the
           transcript — is not on the board at all, so the strip is the only place it can
           appear. -->
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
              :selectable="false"
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
          @submit="sendMessage()"
          @attach-photo="handleMentionAttachPhoto"
          @flash-photo="handleFlashPhoto"
          @multiline-change="isComposerMultiline = $event"
        />

        <div class="chat-input-controls">
          <!-- What the chat is about to be told, at the level it is told: the board, the
               focus, the subject. It sits by the composer because this is where the turn
               is written — the panel's header carries the session's switches instead. -->
          <n-popover
            v-if="canvasContextReadout"
            trigger="hover"
            placement="top-end"
            :show-arrow="false"
            :style="{ padding: 0 }"
            raw
          >
            <template #trigger>
              <n-tag
                round
                :bordered="false"
                size="small"
                class="focus-ref-chip"
              >
                <span class="focus-ref-parts">
                  <span class="focus-ref-part">
                    <CanvasScopeMark
                      :type="
                        canvasContextReadout.regionMode ? 'region' : 'focus'
                      "
                      :size="11"
                    />
                    <span>{{ liveFocusChipText }}</span>
                  </span>
                  <span
                    v-if="canvasContextReadout.spotlightedPhotos.length > 0"
                    class="focus-ref-part"
                  >
                    <n-icon :size="12"><SpotlightIcon /></n-icon>
                    <span>{{
                      canvasContextReadout.spotlightedPhotos.length
                    }}</span>
                  </span>
                </span>
              </n-tag>
            </template>
            <CanvasChatContext
              v-bind="canvasContextReadout"
              @clear-focus="canvasSession?.clearFocus()"
              @clear-spotlight="canvasSession?.clearSpotlight()"
            />
          </n-popover>

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
              :disabled="isModeLocked"
              header="Intelligence Mode"
              placement="top-end"
              :aria-label="
                isModeLocked
                  ? 'Intelligence mode, fixed for this session'
                  : 'Change intelligence mode'
              "
            />
          </div>

          <n-button
            circle
            type="primary"
            :disabled="!inputText.trim() || isSending"
            :loading="isSending"
            @click="sendMessage()"
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
      @add-to-portfolio="handleCollectionAdded"
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
            <RouterLink to="/atlas">Atlas</RouterLink>, or
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

    <!-- Curation-mode nudge — shown once, the first time the user asks for another
         round in a normal chat, offering to make progressive exploration the default. -->
    <ChatTemplateHint
      v-if="!isTemplateSession"
      :show="showCurationHint"
      title="Fresh photos each round"
      body="Turn on curation mode and every new search will skip photos you've already seen. Text replies will be shorter to browse faster. Toggle it anytime from the bar above:"
      :inline-icon="CurationIcon"
      action-label="Enable curation mode"
      dismiss-label="Not now"
      @action="enableCurationFromHint"
      @dismiss="dismissCurationHint"
    />

    <!-- Tutorial exit guard — only while the canvas empty-state walkthrough is open.
         Sending a question closes the tutorial and starts the conversation, so a send from
         inside it pauses here and lets the user choose: send now, or stay in the tutorial
         and keep trying scopes and selections against the suggestions. -->
    <ChatTemplateHint
      v-if="canvasSession"
      :show="showTutorialExitHint"
      title="This will close the tutorial"
      body="Sending a question ends the walkthrough and starts the conversation. Keep it open to try different scopes and photo selections on the canvas and watch how the suggested questions change."
      action-label="Send anyway"
      dismiss-label="Keep exploring"
      @action="sendPendingTutorialMessage"
      @dismiss="dismissTutorialExitHint"
    />

    <!-- Floating Action Bar -->
    <FloatingActionBar
      :selected-ids="selectedPhotoIds"
      :show-add-to-collection="true"
      :show-move-to-tool="true"
      :show-attach-to-chat="true"
      :is-downloading="isDownloading"
      @clear-selection="clearAllSelectionsAndScopes"
      @download="handleDownloadMultiple"
      @add-to-collection="handleAddToCollection"
      @move-to-tool="openToolSelector"
      @attach-to-chat="handleAttachToChat"
    />
  </div>
</template>

<script setup lang="ts">
import { isDemoEmail } from "@/config/demoUsers";
import {
  ref,
  computed,
  markRaw,
  nextTick,
  watch,
  onMounted,
  onUnmounted,
  onActivated,
} from "vue";
import { NIcon, NAlert, NCheckbox, useMessage } from "naive-ui";
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
import ChatSelectionPanel from "@/components/ChatSelectionPanel.vue";
import ChatTemplateHint from "@/components/chat-templates/ChatTemplateHint.vue";
import CanvasChatContext from "@/components/canvas/CanvasChatContext.vue";
import CanvasScopeMark from "@/components/canvas/CanvasScopeMark.vue";
import DemoSearchWarningModal from "@/components/DemoSearchWarningModal.vue";
import { useDemoSafeSearch } from "@/composables/useDemoSafeSearch";
import {
  demoMode,
  DEMO_MAX_PHOTO_GROUPS,
  DEMO_MAX_PHOTOS_PER_GROUP,
  DEMO_REVEAL_SCROLL,
  demoTrimReply,
} from "@/utils/demoTyping";
import { revealScrollToBottom } from "@/utils/revealScroll";
import { useFlyToBasket } from "@/composables/useFlyToBasket";
import { useChatActions } from "@/composables/useChatActions.js";
import { useChatTemplateSession } from "@/composables/useChatTemplate";
import { useCanvasChatSession } from "@/composables/useCanvasChat";
import { usePhotoDragToCanvas } from "@/composables/canvas/usePhotoDragToCanvas.js";
import { usePhotosStore } from "@/stores/photos.js";
import { useChatStore } from "@/stores/chat.js";
import { useUserStore } from "@/stores/userStore";
import {
  getSuggestionsForProfile,
  onboardingSuggestions,
  type Suggestion,
  type SubQuery,
} from "@/config/chatSuggestions";
import { useLocalPhotoSelection } from "@/composables/useLocalPhotoSelection.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import {
  usePhotoToolSelection,
  MAX_PHOTOS_TO_CHAT,
} from "@/composables/usePhotoToolSelection.js";
import { marked } from "marked";
import {
  ImageOutline as ImageIcon,
  CloseOutline as CloseIcon,
  PersonOutline as PersonIcon,
  SendOutline as SendIcon,
  ColorPaletteOutline as PaletteIcon,
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
  FlashlightOutline as SpotlightIcon,
  CloudUploadOutline as CloudUploadIcon,
  RibbonOutline as PicksIcon,
  CheckmarkDoneOutline as CheckmarkDoneIcon,
  TelescopeOutline as CurationIcon,
  HandLeftOutline,
  GridOutline as GridIcon,
  WarningOutline,
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
  /**
   * Chrome the host wants off, plus the server-side template it wants on. Same keys as a
   * chat template's `session` block (see `@/config/chatTemplates`), because they answer
   * the same question — what this chat is allowed to show — and a host that narrows the
   * chat without being a guided session (the canvas panel) should not have to invent a
   * second vocabulary for it.
   *
   * A real template session still wins on every key: it owns the whole flow, while this
   * only describes the frame around it.
   *
   * `photoCellSize` is the one key here that is a measurement rather than a switch: how
   * many pixels a photo in a result grid may take, defaulting to DEFAULT_PHOTO_CELL_PX.
   */
  uiConfig?: Record<string, any>;
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
  /**
   * Canvas turns only: the photos the agent saw as images this turn, snapshotted so the
   * reply keeps a reference to what it answered about even after the board's focus moves.
   */
  canvasFocus?: {
    focusedIds: number[];
    spotlightIds?: number[];
    boardCount: number;
    /**
     * Set instead of the ids above when the turn ran over a REGION: the selection outgrew
     * what the chat can be shown, so no photo was. A count is the whole record there,
     * because a count is the whole of what the reply was given about them.
     */
    regionCount?: number;
    /**
     * The board rectangle of each focus/spotlight photo at send time, so the past readout can
     * redraw the same 2D crop the composer showed. Absent on region turns and on messages
     * persisted before this existed — CanvasChatContext falls back to the flat grid then.
     */
    geometry?: {
      id: number;
      x: number;
      y: number;
      width: number;
      height: number;
    }[];
  };
}

interface ContextPhoto {
  id: string;
  title: string;
  name: string;
  size: number | string;
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
  status?:
    | "uploaded"
    | "preprocessing"
    | "preprocessed"
    | "processing"
    | "processed";
}

const photosStore = usePhotosStore();

/**
 * Set when this chat is docked to a canvas. `null` everywhere else. Deliberately NOT a
 * template session: everything gated on `isTemplateSession` — the history sidebar, the
 * welcome screen, the new-chat button — stays on, because a canvas chat is an ordinary
 * conversation that happens to sit beside a board.
 *
 * Injected up here, ahead of the other sessions, because the store below is chosen from
 * it.
 */
const canvasSession = useCanvasChatSession();

/**
 * A canvas chat gets a store of its own, so it and the dashboard's chat — both alive at
 * once under KeepAlive — don't share one conversation, one transcript and one basket.
 * `null` is the application-wide store every other host uses.
 *
 * Read once, at setup: the host keys this view on the board, so a change of canvas
 * remounts it and the scope is re-read. A scope captured here can never go stale.
 */
const chatStore = useChatStore(canvasSession?.storeScope.value ?? null);

/**
 * Photos in a reply can be dragged onto the board — but only when there IS a board. The
 * same transcript rendered in the dashboard or in a template modal has nowhere to drop
 * them, and a card that looks draggable and does nothing is worse than one that doesn't.
 *
 * Dropping does NOT remove the photo from the reply: a transcript is a record of what was
 * suggested, not a shelf that empties as you take from it.
 */
const { onPhotoDragStart } = usePhotoDragToCanvas();
const canDragToCanvas = computed(() => !!canvasSession);

/**
 * A photo whose twin is already placed on the board. There is nothing to add by dragging
 * it — it is already there — so instead of dragging, hovering it lights up its twin on the
 * canvas (see `onCanvasPhotoHover`), the same affordance the related-photos strip uses.
 */
const isPhotoOnCanvas = (photo: { id: string | number }) => {
  const placed = canvasSession?.boardPhotoIdSet?.value;
  return !!placed && placed.has(Number(photo.id));
};

/** Draggable only where there is a board AND the photo is not already on it. */
const canDragPhoto = (photo: { id: string | number }) =>
  canDragToCanvas.value && !isPhotoOnCanvas(photo);

/**
 * Point at (photo) or release (null) the twin on the board. Only photos already placed
 * have a twin to point at; the rest have nothing to highlight, so they stay quiet.
 */
const onCanvasPhotoHover = (photo: { id: string | number } | null) => {
  if (!canvasSession) return;
  if (photo && !isPhotoOnCanvas(photo)) return;
  canvasSession.highlightOnCanvas?.(photo ? Number(photo.id) : null);
};

/** Eye button on an already-placed card: ask the board to glide to its twin. */
const handleLocateOnCanvas = (photo: { id: string | number }) => {
  canvasSession?.locateOnCanvas?.(Number(photo.id));
};
const userStore = useUserStore();
const message = useMessage();
const route = useRoute();
const router = useRouter();

/**
 * Set when this chat is hosted inside a guided template session (see
 * `@/config/chatTemplates`). `null` everywhere else, which is the normal chat.
 */
const templateSession = useChatTemplateSession();
const isTemplateSession = !!templateSession;

/**
 * What the host has asked this chat to hide, and which server-side template to run on.
 *
 * The name is historical: a guided session was the only thing that ever set these. A
 * plain host (`uiConfig`) now sets the same keys, and a template still overrides it —
 * both cannot be present at once in practice, and if they ever were, the session that
 * owns the whole conversation should win over the frame around it.
 */
const templateConfig = computed<Record<string, any>>(() => ({
  ...(props.uiConfig ?? {}),
  ...(templateSession?.config.value ?? {}),
}));

/**
 * Collections the session was pinned to in its setup form, read live from the
 * session's answers. `scopeField` names which answer holds them — the view knows
 * nothing about what the field means, only where the ids are.
 */
const templateScopeCollectionIds = computed<number[]>(() => {
  const key = templateConfig.value.scopeField;
  if (!key) return [];
  const value = templateSession?.values.value?.[key];
  return Array.isArray(value) ? value : [];
});

/**
 * Chips the template pins under a reply, resolved per message index.
 *
 * Built as one map rather than a per-message call from the render function: the
 * transcript re-renders on every keystroke in the composer, and handing
 * ChatActionSuggestions a freshly built array each time would re-trigger its
 * scroll-fade measurement on all of them. This recomputes only when the
 * messages actually change.
 */
const templateMessageActionsByIndex = computed<Record<number, any[]>>(() => {
  const definitions = templateSession?.template.value?.messageActions ?? [];
  if (definitions.length === 0) return {};

  const messages = chatStore.messages as ChatMessage[];
  let latestAssistant = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      latestAssistant = i;
      break;
    }
  }

  const byIndex: Record<number, any[]> = {};
  messages.forEach((message, index) => {
    if (message.role !== "assistant") return;
    const context = { isLatest: index === latestAssistant };
    const matched = definitions.filter((action: any) =>
      action.when ? action.when(message, context) : true,
    );
    if (matched.length > 0) byIndex[index] = matched;
  });
  return byIndex;
});

/** Template chips post a message they declare themselves — nothing else. */
const runTemplateMessageAction = (action: any) => {
  if (!action?.send || isSending.value) return;
  // A chip that declares `replaySearch` is a pagination control (the template's own
  // "show me more" in the bubble footer): flag it so the server pages the previous search
  // deterministically, exactly as the inline {more:…} chip does. Other chips stay ordinary.
  sendMessage({
    text: action.send,
    replaySearch: action.replaySearch === true,
  });
};

const isDemoUser = computed(() => isDemoEmail(userStore.user?.email));

// A templated session owns its own conversation from start to finish: browsing
// the history from inside it would drop the user into an unrelated chat that
// the template's brief and its call to action no longer describe.
const showHistory = computed(
  () => !isDemoUser.value && !templateConfig.value.hideHistory,
);

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

/**
 * A template whose setup form drives the mode (`modeField`) owns it for the
 * whole session: the brief the user signed off on — and the per-round cost they
 * were quoted — both assume the mode they picked there.
 */
const isModeLocked = computed(() => !!templateConfig.value.modeField);

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

// A card's plain click only toggles selection once something in its own
// bubble is already selected — selection in one bubble shouldn't override
// the click-to-info behaviour of photos in a different one.
const isMessageInSelectionMode = (messageIndex: number): boolean => {
  const record = perMessageSelections.value[messageIndex];
  return !!record && Object.values(record).some(Boolean);
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

/**
 * Whether photos inside the bubbles can be clicked to select them (which is what
 * raises the FloatingActionBar). A template can turn it off when the session has
 * its own single destination for a photo.
 */
const arePhotosSelectable = computed(
  () => !templateConfig.value.disablePhotoSelection,
);

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
const chatViewRef = ref<HTMLElement | null>(null);
const chatMainRef = ref<HTMLElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);

/* ── Panel width, not viewport width ──
   This view is rendered at wildly different widths inside the same window: full
   page on /chat-lab, a ~460px column in the dashboard's centre panel (which
   narrows again the moment the app sidebar is expanded), a ~400px shelf beside a
   canvas. A viewport media query sees none of that, so the layout breakpoints
   read the view's OWN width, measured with a ResizeObserver and published as
   `chat-view--narrow` / `chat-view--tight` for the stylesheet.

   These are deliberately NOT the old 768/480 viewport numbers. Those are device
   breakpoints; asked of a panel they call a roomy 700px column a phone. What the
   panel measurements answer is "does the composer still fit on one row" (~560px:
   attach button + mode chip + send leave ~200px of chrome) and "is there room
   for anything but the essentials" (~400px). The device check is kept alongside
   them so phones and tablets get exactly the layout they had before. */
const NARROW_WIDTH_PX = 560;
const TIGHT_WIDTH_PX = 400;

// Seeded from the viewport so the first paint is sane; the observer corrects it
// on mount, before the user can see a wrong layout.
const containerWidth = ref(window.innerWidth);
const viewportWidth = ref(window.innerWidth);

/** A phone or small tablet — a property of the device, not of this panel. */
const isMobile = computed(() => viewportWidth.value < 768);

/** Too narrow for the one-row composer and the roomier spacing around it. */
const isNarrow = computed(
  () => containerWidth.value < NARROW_WIDTH_PX || isMobile.value,
);

/** Narrow enough that secondary copy has to go. */
const isTight = computed(
  () => containerWidth.value < TIGHT_WIDTH_PX || viewportWidth.value < 480,
);

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
const showBasket = ref(false);
const pendingDeleteId = ref<number | null>(null);
const showChatLabInfo = ref(false);

// Curation-mode discovery: shown per conversation (not persisted across conversations).
const CURATION_HINT_KEY = "chat_curation_hint_seen";
const showCurationHint = ref(false);
const curationHintDismissedInCurrentConversation = ref(false);

const toggleCurationMode = () => {
  chatStore.setCurationMode(!chatStore.curationMode);
};

const markCurationHintSeen = () => {
  showCurationHint.value = false;
  curationHintDismissedInCurrentConversation.value = true;
  // Deshabilitado: solo oculta en la conversación actual, no persiste entre conversaciones
  // try {
  //   localStorage.setItem(CURATION_HINT_KEY, "true");
  // } catch {
  //   // Private mode: the nudge may show again next time, which is harmless.
  // }
};

// Called the first time the user asks for another round in a normal chat: if they aren't
// already curating and haven't seen this before, offer to make exclusion the default.
const maybeSuggestCuration = () => {
  if (isTemplateSession || chatStore.curationMode) return;
  // The hint tells the user to use the toggle "from the bar above", so it has nothing to
  // offer a host that hid the bar — the canvas panel, where the exclusion that matters is
  // the board's own and is applied server-side regardless.
  if (templateConfig.value.hideTopbar) return;
  if (curationHintDismissedInCurrentConversation.value) return;
  showCurationHint.value = true;
};

const enableCurationFromHint = () => {
  chatStore.setCurationMode(true);
  markCurationHintSeen();
};

const dismissCurationHint = () => {
  markCurationHintSeen();
};

// Tutorial exit guard: while the canvas empty-state walkthrough is open, the first send
// (a typed question or a picked suggestion pill) is held back so the user can confirm they
// want to leave the tutorial. Not persisted — it is a guard tied to live tutorial state,
// not a one-time discovery tip.
const showTutorialExitHint = ref(false);
// The send held back while the hint is up, replayed verbatim once the user chooses.
let pendingTutorialSend: { text?: string; display?: string | null } | null =
  null;
// Set only while replaying the held send, so the guard in sendMessage lets it through
// instead of catching its own replay (the tutorial is still open at that instant).
let bypassTutorialGuard = false;

// "Send anyway": close the tutorial and replay the held send.
const sendPendingTutorialMessage = () => {
  showTutorialExitHint.value = false;
  canvasSession?.endTutorial?.();
  const pending = pendingTutorialSend;
  pendingTutorialSend = null;
  bypassTutorialGuard = true;
  if (pending) sendMessage(pending);
  bypassTutorialGuard = false;
};

// "Keep exploring": drop the held send, leave the composer and the tutorial untouched.
const dismissTutorialExitHint = () => {
  showTutorialExitHint.value = false;
  pendingTutorialSend = null;
};

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

/* Always two cards on the welcome screen — the grid decides how to place them.
   Side by side while there is room for two columns, stacked once there isn't; a
   narrow panel loses the row, not the second suggestion. */
const SUGGESTION_WINDOW_SIZE = 2;
const SUGGESTION_ROTATION_KEY = "chat_suggestion_rotation";
const SUGGESTION_CAROUSEL_INTERVAL = 6000;

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

// The card set follows the user's profile: a commercial photographer gets
// brief- and client-shaped prompts where a general one gets personal-work ones.
const suggestionPool = computed(() =>
  hasPhotos.value
    ? getSuggestionsForProfile(userStore.user?.profiles)
    : onboardingSuggestions,
);

// Counts window-sized steps taken through the pool. Stepping by the window size
// rather than paging by a fixed page count keeps the walk moving forward even
// when the pool doesn't divide evenly — pages would jump backwards on wrap and
// re-show a card that was just on screen.
const suggestionStep = ref(0);
const suggestionCarouselEl = ref<HTMLElement | null>(null);
let suggestionTimer: ReturnType<typeof setInterval> | null = null;

const visibleSuggestions = computed(() => {
  const windowSize = SUGGESTION_WINDOW_SIZE;
  const pool = suggestionPool.value;
  if (pool.length <= windowSize) return pool;
  // The window slides backwards through the pool, so each refresh pulls a fresh
  // card in at the front and drops the last one off the back.
  const offset = rotationOffset + suggestionStep.value * windowSize;
  const start = ((-offset % pool.length) + pool.length) % pool.length;
  return Array.from(
    { length: windowSize },
    (_, i) => pool[(start + i) % pool.length],
  );
});

onMounted(() => {
  // One interval for the life of the view: restarting it on hover or on a pool
  // change would reset the countdown and make the cadence look erratic.
  suggestionTimer = setInterval(() => {
    const pool = suggestionPool.value;
    if (pool.length <= SUGGESTION_WINDOW_SIZE) return;
    // Hover is read per tick rather than latched by mouseenter/mouseleave: the
    // welcome screen can unmount from under the cursor (picking a card opens the
    // sub-query panel), and a latched pause would never be released.
    if (suggestionCarouselEl.value?.matches(":hover")) return;
    suggestionStep.value = (suggestionStep.value + 1) % pool.length;
  }, SUGGESTION_CAROUSEL_INTERVAL);
});

onUnmounted(() => {
  if (suggestionTimer) clearInterval(suggestionTimer);
  suggestionTimer = null;
});

const activeSuggestion = ref<Suggestion | null>(null);

const handleViewportResize = () => {
  viewportWidth.value = window.innerWidth;
};

let containerObserver: ResizeObserver | null = null;

watch(chatViewRef, (el) => {
  containerObserver?.disconnect();
  containerObserver = null;
  if (!el) return;
  containerObserver = new ResizeObserver(() => {
    containerWidth.value = el.clientWidth;
  });
  containerObserver.observe(el);
  containerWidth.value = el.clientWidth;
});

const chatInputPlaceholder = computed(() => {
  // A host in a narrow column names its own subject: the default spells out the @
  // mention syntax, which is three lines of placeholder in a 400px panel and describes
  // the library rather than the board the user is looking at.
  if (templateConfig.value.placeholder) return templateConfig.value.placeholder;
  return isNarrow.value
    ? "Type a message..."
    : "Use @ to mention collections, series, portfolios, or photos";
});

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
    contextPhotos.value = [];
    photosEverAttached.value = false;
    inputText.value = "";
    perMessageSelections.value = {};
    activeSuggestion.value = null;
    curationHintDismissedInCurrentConversation.value = false;
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
  curationHintDismissedInCurrentConversation.value = false;
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

/**
 * Opens a templated session: reveals the selection space the template curates
 * into, then sends its opening brief. Returns true when it owns this mount, in
 * which case none of the other opening paths apply.
 */
const consumeTemplatePrompt = (): boolean => {
  const pending = templateSession?.pendingPrompt.value;
  if (!pending || !templateSession) return false;

  // Consumed, not just read: the brief must never be sent twice into the same
  // conversation if this view is remounted.
  templateSession.pendingPrompt.value = null;

  if (templateConfig.value.pinSelectionPanel) showBasket.value = true;
  nextTick(() => sendMessage({ text: pending.text, display: pending.display }));
  return true;
};

onMounted(async () => {
  // Only when they're missing: fetchModes also (re)picks the selected mode, and
  // a templated session has already chosen one before this view mounted.
  if (chatStore.chatModes.length === 0) chatStore.fetchModes();
  window.addEventListener("resize", handleViewportResize);

  // Mounted onto a conversation someone else loaded (the canvas panel), so start at
  // the end of it rather than at the first message.
  if (chatStore.messages.length > 0) jumpToLatest();

  if (consumeTemplatePrompt()) return;

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
  window.removeEventListener("resize", handleViewportResize);
  containerObserver?.disconnect();
  containerObserver = null;
  stopLoadingPhraseCycle();
  stopTitleTyping();
  stopRevealScroll();
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

/**
 * Open a transcript at its latest message.
 *
 * Normally `loadConversationById` does the pinning, but a host can load the
 * conversation itself before this view mounts — the canvas panel opens the board's
 * last chat that way — and then nothing has scrolled. The bottom is re-pinned over
 * the next frames because bubbles keep growing after the first paint (photo grids
 * size themselves off the measured panel width, markdown renders images).
 */
const jumpToLatest = async () => {
  await scrollToBottom();
  requestAnimationFrame(() => scrollToBottom());
  window.setTimeout(scrollToBottom, 200);
};

// A reply lands as one block, so jumping to its end would skip everything the
// answer actually says — it's walked down instead, at a slower pace while
// recording (see @/utils/revealScroll).
let cancelRevealScroll: (() => void) | null = null;

const stopRevealScroll = () => {
  cancelRevealScroll?.();
  cancelRevealScroll = null;
};

const revealReply = async () => {
  stopRevealScroll();
  await nextTick();
  if (!messagesRef.value) return;
  cancelRevealScroll = revealScrollToBottom(
    messagesRef.value,
    demoMode.value ? DEMO_REVEAL_SCROLL : undefined,
  );
};

/**
 * @param text     overrides the composer. Used by templated sessions, whose
 *                 opening brief is generated rather than typed.
 * @param display  what to show in the user's own bubble instead of `text` — a
 *                 friendly stand-in for a long machine-written prompt. Local to
 *                 this session: the server still stores the real message.
 */
const sendMessage = async ({
  text: override,
  display,
  replaySearch = false,
}: {
  text?: string;
  display?: string | null;
  replaySearch?: boolean;
} = {}) => {
  const text = (override ?? inputText.value).trim();
  if (!text || isSending.value) return;

  if (demoCheckQuery(text)) return; // blocked – modal will open

  // Sending from inside the canvas tutorial closes it: hold the send and let the user
  // confirm. Placed before anything is mutated (fullscreen, cleared input/attachments) so a
  // "Keep exploring" leaves the composer as it was. The replay from "Send anyway" sets
  // `bypassTutorialGuard` so it passes straight through.
  if (canvasSession?.tutorialActive?.value && !bypassTutorialGuard) {
    pendingTutorialSend = { text, display };
    showTutorialExitHint.value = true;
    return;
  }

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
  stopRevealScroll();
  scrollToBottom();
  const requestStartedAt = performance.now();

  try {
    await chatStore.sendMessage(text, contextPhotoIds, attachedPhotos, {
      displayContent: display ?? null,
      // Only the turn that creates the conversation can act on this, which is
      // the one carrying the template's brief.
      hidden: !!templateConfig.value.hiddenConversation,
      // Every turn, not just the first: the server keeps no per-conversation
      // template state, so a turn that omits it runs on the full tool set.
      templateId: templateConfig.value.backendId ?? null,
      // Same reason, same cadence — the pin is re-sent rather than remembered.
      templateScopeCollectionIds: templateScopeCollectionIds.value,
      // Read at send time, never watched: photos move and the vision radius slides
      // continuously, and the board the user meant is the one under their cursor when
      // they pressed enter.
      canvas: canvasSession?.readContext() ?? null,
      // True only when this send came from the "show me more" chip — a deterministic
      // next-page replay of the previous search. Any typed message leaves it false.
      replaySearch,
    });
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
    if (!chatStore.isKnowledgeAssistant && !templateConfig.value.hideActions) {
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
    revealReply();
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

/**
 * The assistant's offer of another round, e.g. `{more:muéstrame más}`. The label
 * is written in the language of the reply; the key never is.
 *
 * What gets SENT on click is the constant below, not the label: the token only
 * decides where the button goes and what it reads. A click spends credits, so
 * the message it sends is ours, not something the model wrote for the user.
 */
const MORE_TOKEN = /\{more:([^}]*)\}/g;
const SHOW_ME_MORE = "show me more";

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
  // The prompt asks for at most one {more:...} per reply, but the model is not a
  // parser: if it slips and emits a second one, only the first becomes a real
  // button — later ones fall back to their plain label so the offer never
  // appears to repeat itself.
  let moreTokenSeen = false;
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
    )
    .replace(MORE_TOKEN, (_, label) => {
      if (moreTokenSeen) return label || SHOW_ME_MORE;
      moreTokenSeen = true;
      return `<span class="chat-send-chip" data-send="more" role="button" tabindex="0">${label || SHOW_ME_MORE}</span>`;
    });
};

const handleMarkdownClick = (e: MouseEvent) => {
  // Inline "send this for me" chips. Whitelisted by key, and the payload comes
  // from here — never from the token — so a stray or malformed one is inert
  // rather than a message put in the user's mouth.
  const sendTarget = (e.target as HTMLElement).closest(
    "[data-send]",
  ) as HTMLElement | null;
  if (sendTarget) {
    if (sendTarget.dataset.send === "more" && !isSending.value) {
      // The BUTTON path: flag it so the server pages the previous search deterministically,
      // skipping Phase 1 planning. Typing "show me more" by hand never sets this — it goes
      // through the composer, not here — so it stays an ordinary, re-planned request.
      sendMessage({ text: SHOW_ME_MORE, replaySearch: true });
      maybeSuggestCuration();
    }
    return;
  }

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

// A starter pill from a host's empty state (the canvas panel). Its prompts are complete
// questions that only make sense once the board is in the right state — the empty state
// has already gated them on that — so this just fires, letting sendMessage attach the
// board/focus context on its own. No photo dialog: context here is the canvas, not attached
// photos.
const handleEmptyStatePrompt = (prompt: string) => {
  sendMessage({ text: prompt });
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
  size: photo.size ?? 0,
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

/**
 * The two numbers the chip on a sent canvas message shows — the same partition the context
 * panel draws: a photo that was both spotlighted and in the focus counts once, as
 * spotlighted, because that is the finer level. See CanvasChatContext.
 *
 * Cheap enough to call per render: `getPhotosForMessage` is memoized on the id array, and
 * a spotlight is at most a dozen long.
 */
const canvasContextCounts = (
  message: any,
): { focus: number; spotlight: number; region: number } => {
  // A region turn stored no ids — none of its photos was shown — so its count stands on
  // its own and needs no photo to resolve. It never coexists with a focus.
  const region = message.canvasFocus?.regionCount ?? 0;
  if (region > 0) return { focus: 0, spotlight: 0, region };
  const focused = getPhotosForMessage(message.canvasFocus?.focusedIds ?? []);
  const spotlighted = getPhotosForMessage(
    message.canvasFocus?.spotlightIds ?? [],
  );
  const spotlightIds = new Set(spotlighted.map((photo) => String(photo.id)));
  return {
    focus: focused.filter((photo) => !spotlightIds.has(String(photo.id)))
      .length,
    spotlight: spotlighted.length,
    region: 0,
  };
};

/** Whether a sent message captured any board context at all — the chip's gate. */
const canvasContextTotal = (message: any): number => {
  const counts = canvasContextCounts(message);
  return counts.focus + counts.spotlight + counts.region;
};

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

/**
 * Merge a past turn's persisted board rectangles onto its reconstructed photos, as the
 * `config` the 2D crop reads. Reconstructed photos come back by id from the CURRENT store and
 * carry no send-time position, so without this the past readout could draw no crop. Returns
 * the photos untouched when the message carries no geometry (turns sent before it was
 * persisted) — the readout then shows its counts and simply draws no crop. A photo whose rect
 * is missing keeps no config and drops out of the crop, the same as one no longer on the board.
 */
const withCanvasGeometry = (
  photos: ContextPhoto[],
  geometry?: {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[],
): ContextPhoto[] => {
  if (!geometry?.length) return photos;
  const rectById = new Map(geometry.map((rect) => [String(rect.id), rect]));
  return photos.map((photo) => {
    const rect = rectById.get(String(photo.id));
    return rect ? { ...photo, config: rect } : photo;
  });
};

// Attached context photos are persisted by id only (contextPhotoIds); their display
// objects are not. Rebuild them whenever a conversation's messages are (re)loaded so a
// reload shows them again. Lives here rather than in loadConversationById because the
// canvas chat loads through the store directly (CanvasChatPanel), never calling it.
watch(
  () => chatStore.messages,
  (messages) => {
    for (const msg of messages as any[]) {
      if (
        msg.role === "user" &&
        msg.contextPhotoIds?.length &&
        !msg.attachedPhotos
      ) {
        msg.attachedPhotos = getPhotosForMessage(msg.contextPhotoIds);
        delete msg.contextPhotoIds;
      }
    }
  },
  { immediate: true },
);

// Labeled photo groups size themselves to their own photo count instead of
// always spanning the full bubble width. This lets the flex-wrap container flow
// small groups side by side (columns) and only stack them (rows) once they no
// longer fit — so three single-photo groups become three columns rather than
// three rows, while a group of five still fills its own row. Photo size stays
// constant (~one cell); only the group's width and column count change.
const DEFAULT_PHOTO_CELL_PX = 118;
const PHOTO_GRID_GAP_PX = 8; // must match .message-photos-grid gap (--spacing-sm)
/* The gutter a scrolling grid keeps around its cells so a photo's hover ring
   isn't clipped. Must match .message-photos-grid padding; it sits inside the
   width below, which is a border-box measurement. */
const PHOTO_GRID_RING_PX = 4;

/**
 * How big one photo gets, at most. The host's call (`photoCellSize`): a full-width chat has
 * the room for a card you can read a frame in, while a 400px panel beside a board is better
 * served showing more of the answer at once than fewer, larger photos.
 */
const photoCellPx = computed<number>(() => {
  const configured = Number(templateConfig.value.photoCellSize);
  return configured > 0 ? configured : DEFAULT_PHOTO_CELL_PX;
});

/* Everything between the transcript's own edges and a group's grid: the column's
   padding, the avatar gutter, and the bubble's and group's padding. */
const PHOTO_GRID_CHROME_PX = 40 + 40 + 30 + 16;

/* However much room the bubble has, a group stops here: five default cells, the width the
   whole layout was drawn around. A width and not a column count on purpose — a host that
   shrinks its cells (`photoCellSize`) should get MORE of them per row within the same
   block, not a group that ends up narrower than everything around it. */
const MAX_PHOTO_GRID_WIDTH_PX =
  5 * DEFAULT_PHOTO_CELL_PX + 4 * PHOTO_GRID_GAP_PX;

/* How many cells fit across, measured rather than assumed: the same transcript
   renders full width on the dashboard and inside a ~400px canvas panel, where
   five cells do not fit and a group would otherwise be squeezed or stretched. */
const maxPhotoCols = ref(5);

const updateMaxPhotoCols = () => {
  const available = Math.min(
    (messagesRef.value?.clientWidth ?? 0) - PHOTO_GRID_CHROME_PX,
    MAX_PHOTO_GRID_WIDTH_PX,
  );
  const fits = Math.floor(
    (available + PHOTO_GRID_GAP_PX) / (photoCellPx.value + PHOTO_GRID_GAP_PX),
  );
  maxPhotoCols.value = Math.max(1, isNarrow.value ? Math.min(3, fits) : fits);
};

// A host that hands down a different cell size re-measures with it.
watch(photoCellPx, updateMaxPhotoCols);

let photoColsObserver: ResizeObserver | null = null;

watch(messagesRef, (el) => {
  photoColsObserver?.disconnect();
  photoColsObserver = null;
  if (!el) return;
  photoColsObserver = new ResizeObserver(updateMaxPhotoCols);
  photoColsObserver.observe(el);
  updateMaxPhotoCols();
});

onUnmounted(() => {
  photoColsObserver?.disconnect();
  photoColsObserver = null;
});

const photoGroupCols = (count: number): number =>
  Math.max(1, Math.min(count || 1, maxPhotoCols.value));

// Fixes the grid's own width to its column count so the surrounding surface
// (background/border/padding) hugs it naturally, with no extra math needed.
const photoGroupGridStyle = (count: number): Record<string, string> => {
  const cols = photoGroupCols(count);
  return {
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    width: `${cols * photoCellPx.value + (cols - 1) * PHOTO_GRID_GAP_PX + 2 * PHOTO_GRID_RING_PX}px`,
    maxWidth: "100%",
  };
};

// Narrow groups (fewer photos than the row can hold) sit side by side in a
// tight column, where a wrapping two-line label reads as misaligned clutter —
// so those get a smaller, single-line, ellipsized label instead.
const isNarrowPhotoGroup = (count: number): boolean =>
  photoGroupCols(count) < maxPhotoCols.value;

/**
 * The photo groups actually rendered under each reply, by message index.
 *
 * Exactly `message.photoLists` in normal use. Demo mode caps both how many
 * groups a reply shows and how many photos each one holds — trimmed to what
 * fits in a single row, so no group ever wraps on camera. Toggling it re-cuts
 * the transcript in place, no reload needed.
 *
 * Built as one map rather than sliced from the render function: the transcript
 * re-renders on every keystroke in the composer, and getPhotosForMessage
 * memoizes on the photoIds array identity, so a fresh slice per render would
 * miss that cache every time.
 */
const photoListsByIndex = computed<Record<number, PhotoList[]>>(() => {
  const byIndex: Record<number, PhotoList[]> = {};
  const perRow = photoGroupCols(DEMO_MAX_PHOTOS_PER_GROUP);
  (chatStore.messages as ChatMessage[]).forEach((message, index) => {
    const lists = message.photoLists;
    if (!lists || lists.length === 0) return;
    byIndex[index] = demoMode.value
      ? lists.slice(0, DEMO_MAX_PHOTO_GROUPS).map((list) => ({
          ...list,
          photoIds: list.photoIds.slice(0, perRow),
        }))
      : lists;
  });
  return byIndex;
});

/** The label the server gives a batch it had no grouping for; never shown as a title. */
const UNGROUPED_LABEL = "result";

/**
 * A reply whose photos are one untitled batch: a bare grid, with no group header.
 *
 * Beside a canvas the store titles that batch on the way in (see `normalizePhotoGroups`),
 * so it falls through to the titled branch and gets the header — and with it the button
 * that lays the group out on the board.
 */
const isFlatPhotoList = (index: number): boolean => {
  const lists = photoListsByIndex.value[index];
  if (lists?.length !== 1) return false;
  const label = lists[0].label?.trim();
  return !label || label === UNGROUPED_LABEL;
};

const removeContextPhoto = (id: string) => {
  contextPhotos.value = contextPhotos.value.filter((p) => p.id !== id);
};

// ── Selection space ("basket") ──────────────────────────────────────────────
// A shelf of photos that lives beside the transcript for the whole conversation,
// so a photo the user liked ten messages ago is still one click away. The ids
// live in the store (per conversation, and persisted server-side later); the
// display objects are resolved here from the photos store.

/**
 * Desktop-only: the toggle it depends on takes the place of the fullscreen
 * button on the photo cards, which itself only exists on desktop.
 *
 * A host can also drop it outright (`hideBasket`). The selection space is a shelf you
 * curate INTO across a conversation, so it only earns its keep where the conversation is
 * the workspace; beside a canvas the board already is one, and a second place to put
 * photos aside would compete with it.
 */
const showBasketToggle = computed(
  () => !isMobile.value && !templateConfig.value.hideBasket,
);

const { launch: launchFlight } = useFlyToBasket();

const basketPhotos = computed<ContextPhoto[]>(() =>
  chatStore.basketPhotoIds
    .map((id: string) => findPhotoById(id))
    .filter(Boolean)
    .map((photo: any) => buildContextPhotoEntry(photo)),
);

const contextPhotoIdSet = computed(
  () => new Set(contextPhotos.value.map((p) => p.id)),
);

const toggleBasketPanel = () => {
  showBasket.value = !showBasket.value;
  if (showBasket.value) showSidebar.value = false;
};

const toggleSidebar = () => {
  showSidebar.value = !showSidebar.value;
  if (showSidebar.value) showBasket.value = false;
};

const closeSidePanels = () => {
  showSidebar.value = false;
  showBasket.value = false;
};

/**
 * The basket toggle, used only as the direction the fly-in ghosts head for.
 * With the panel pinned open there is no toggle (nor topbar), so the ghosts
 * aim at the panel itself — which is where they were always headed anyway.
 */
const basketTargetEl = (): Element | null => {
  const root = chatMainRef.value?.closest(".chat-view") ?? document;
  return (
    root.querySelector(".basket-toggle-btn") ??
    root.querySelector(".chat-sidebar--right")
  );
};

/** From a photo card inside a message bubble — pins/unpins the photo. */
const handleToggleBasket = (photo: any, origin: DOMRect | null) => {
  // Only the add direction flies; removing shouldn't throw a photo at the panel.
  if (!chatStore.isPhotoInBasket(photo.id) && origin) {
    launchFlight(
      [{ rect: origin, src: photo.thumbnailUrl || photo.url }],
      basketTargetEl(),
    );
  }
  const adding = !chatStore.isPhotoInBasket(photo.id);
  chatStore.toggleBasketPhoto(photo.id);
  if (adding) maybeSuggestCuration();
};

// Group-level shortcut. Both helpers go through getPhotosForMessage so ids the
// library can't resolve are ignored consistently: they'd never show up in the
// panel, so counting them would leave the button enabled forever.
const isGroupFullyInBasket = (photoIds: number[]): boolean => {
  const photos = getPhotosForMessage(photoIds);
  return (
    photos.length > 0 && photos.every((p) => chatStore.isPhotoInBasket(p.id))
  );
};

/**
 * Whether a labelled group in a reply can be laid out on the board. Only beside a canvas —
 * everywhere else the transcript has nowhere to put it.
 */
const canMaterializeGroups = computed(() => !!canvasSession?.materializeGroup);

/** The group currently being laid out, as "messageIndex-listIndex". Null when idle. */
const materializingGroup = ref<string | null>(null);

/**
 * Make a labelled group real on the board: the host brings any photo that is not there
 * yet, then lays the whole set out as one block in the order this reply gave it.
 *
 * One at a time — two groups landing at once would each pick a clear area against a board
 * the other is still moving through, and could be laid out on top of each other.
 */
const handleMaterializeGroup = async (list: PhotoList, key: string) => {
  if (!canvasSession?.materializeGroup || materializingGroup.value) return;

  const groupPhotos = getPhotosForMessage(list.photoIds);
  if (groupPhotos.length === 0) return;

  materializingGroup.value = key;
  try {
    await canvasSession.materializeGroup({
      label: list.label,
      photos: groupPhotos,
    });
  } finally {
    materializingGroup.value = null;
  }
};

/**
 * The groups in a reply worth laying out: a one-photo "group" is a single result, not an
 * arrangement, so it is left to the drag gesture like any other photo.
 */
const materializableLists = (index: number): PhotoList[] =>
  (photoListsByIndex.value[index] ?? []).filter(
    (list) => list.photoIds.length > 1,
  );

/**
 * "Group all", pinned under a reply that proposed more than one group. The per-group
 * button in each header does one at a time; this is the same act for the whole reply,
 * where it belongs — at the foot of the answer, in the suggested-actions row.
 */
const canvasGroupActionsByIndex = computed<Record<number, any[]>>(() => {
  if (!canMaterializeGroups.value) return {};
  const busy = materializingGroup.value !== null;
  const byIndex: Record<number, any[]> = {};
  Object.keys(photoListsByIndex.value).forEach((key) => {
    const index = Number(key);
    const count = materializableLists(index).length;
    if (count < 2) return;
    byIndex[index] = [
      {
        label: `Group all (${count})`,
        tooltip: "Lay every group in this reply out on the canvas",
        icon: markRaw(GridIcon),
        used: busy,
      },
    ];
  });
  return byIndex;
});

/** One after another, for the reason `handleMaterializeGroup` lays them out one at a time. */
const handleMaterializeAllGroups = async (index: number) => {
  const lists = materializableLists(index);
  for (let i = 0; i < lists.length; i++) {
    await handleMaterializeGroup(lists[i], `${index}-all-${i}`);
  }
};

const handleKeepGroup = (photoIds: number[], event: MouseEvent) => {
  const photos = getPhotosForMessage(photoIds);

  // Rects are read before the store update, and scoped to the group the button
  // belongs to — the same photo may also be rendered in other bubbles.
  const group = (event.currentTarget as HTMLElement | null)?.closest(
    ".message-photo-list",
  );
  const flyers = photos
    .filter((p) => !chatStore.isPhotoInBasket(p.id))
    .map((p) => {
      const el = group?.querySelector(
        `[data-photo-id="${p.id}"] .photo-container`,
      );
      return el
        ? { rect: el.getBoundingClientRect(), src: p.thumbnailUrl || p.url }
        : null;
    })
    .filter((f): f is { rect: DOMRect; src: string } => f !== null);

  launchFlight(flyers, basketTargetEl());
  chatStore.addBasketPhotos(photos.map((p) => p.id));
  maybeSuggestCuration();
};

const handleRemoveFromBasket = (photoId: string) => {
  chatStore.removeBasketPhoto(photoId);
  // Leaving it attached to the composer after removing it from the shelf would
  // strand a photo the user can no longer see or reach.
  removeContextPhoto(String(photoId));
};

/**
 * Selecting a basket photo attaches it as context for the next message directly
 * — no attach button in between, unlike the bubble cards.
 */
const toggleBasketPhotoAsContext = (photoId: string) => {
  const id = String(photoId);
  if (contextPhotoIdSet.value.has(id)) {
    removeContextPhoto(id);
    return;
  }
  if (contextPhotos.value.length >= MAX_PHOTOS_TO_CHAT) {
    message.warning(
      `Can't add more photos. ${MAX_PHOTOS_TO_CHAT} photo limit reached.`,
    );
    return;
  }
  const photo = findPhotoById(id);
  if (!photo) return;
  contextPhotos.value.push(buildContextPhotoEntry(photo));
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

/**
 * The board's half of the context readout shown beside the composer — the attachments'
 * half is `contextPhotos`, right here. Null in every chat that is not docked to a canvas,
 * which is what the chip's `v-if` reads.
 */
const canvasContextReadout = computed(
  () => canvasSession?.contextReadout.value ?? null,
);

/**
 * True when a canvas chat's only context is the board's global metadata — no halo, no
 * hand-picked focus, nothing spotlighted. Dismissed locally per occurrence: it resets as
 * soon as the underlying condition goes away, so it comes back the next time it applies
 * rather than staying silenced for the rest of the conversation. The checkbox silences it
 * for good.
 */
const CANVAS_METADATA_WARNING_DISMISS_KEY =
  "chat_canvas_metadata_warning_dismissed";
const canvasMetadataWarningDismissed = ref(false);
const canvasMetadataWarningDismissedForever = ref(
  localStorage.getItem(CANVAS_METADATA_WARNING_DISMISS_KEY) === "true",
);
const dismissCanvasMetadataWarningForever = (checked: boolean) => {
  canvasMetadataWarningDismissedForever.value = checked;
  localStorage.setItem(CANVAS_METADATA_WARNING_DISMISS_KEY, String(checked));
};
const isCanvasMetadataOnlyContext = computed(() => {
  const readout = canvasContextReadout.value;
  if (!readout) return false;
  return (
    readout.focusedPhotos.length === 0 && readout.spotlightedPhotos.length === 0
  );
});
watch(isCanvasMetadataOnlyContext, (isMetadataOnly) => {
  if (!isMetadataOnly) canvasMetadataWarningDismissed.value = false;
});
const showCanvasMetadataOnlyWarning = computed(
  () =>
    isCanvasMetadataOnlyContext.value &&
    !canvasMetadataWarningDismissed.value &&
    !canvasMetadataWarningDismissedForever.value,
);

/**
 * The selection ran past what the chat can be shown, so it travels as a REGION — metadata
 * only, no images. Closing it dismisses per occurrence, as the warning above does; the
 * checkbox silences it for good.
 */
const CANVAS_REGION_NOTICE_DISMISS_KEY = "chat_canvas_region_notice_dismissed";
const canvasRegionNoticeDismissed = ref(false);
const canvasRegionNoticeDismissedForever = ref(
  localStorage.getItem(CANVAS_REGION_NOTICE_DISMISS_KEY) === "true",
);
const dismissCanvasRegionNoticeForever = (checked: boolean) => {
  canvasRegionNoticeDismissedForever.value = checked;
  localStorage.setItem(CANVAS_REGION_NOTICE_DISMISS_KEY, String(checked));
};
const isCanvasRegionContext = computed(
  () => canvasContextReadout.value?.regionMode === true,
);
watch(isCanvasRegionContext, (isRegion) => {
  if (!isRegion) canvasRegionNoticeDismissed.value = false;
});
const showCanvasRegionNotice = computed(
  () =>
    isCanvasRegionContext.value &&
    !canvasRegionNoticeDismissed.value &&
    !canvasRegionNoticeDismissedForever.value,
);

/**
 * The focus count, MINUS whatever is spotlighted: the two levels partition the photos, so
 * a photo counted in both would make the chip add up to more than the chat was given. Same
 * rule the readout itself draws — see CanvasChatContext.
 */
const liveFocusChipText = computed(() => {
  const readout = canvasContextReadout.value;
  if (!readout) return "0";
  // A region has no spotlight to subtract: nothing in it is shown, so nothing is singled out.
  if (readout.regionMode) return String(readout.focusedPhotos.length);
  const spotlightIds = new Set(
    (readout.spotlightedPhotos ?? []).map((photo: any) => String(photo.id)),
  );
  return String(
    readout.focusedPhotos.filter(
      (photo: any) => !spotlightIds.has(String(photo.id)),
    ).length,
  );
});

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
@import "@/assets/chat-side-panel.scss";

.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* The selection space is an overlay in the normal chat — a shelf you slide in
   and out. A template that pins it open for a whole session needs it to be a
   column instead, with the transcript never underneath it.
   `position: absolute` resolves against the padding box, so padding here insets
   the flow content (topbar, transcript, composer) by exactly the panel's width
   while the panel itself stays flush against the right edge. */
.chat-view--split {
  padding-right: 300px;
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
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
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

/* ── Selection space toggle (the panel itself is ChatSelectionPanel) ── */
/* naive-ui gives the icon slot a symmetric 6px margin (both sides), which on
   top of the badge's own spacing read as a gap. Tightening the icon's right
   margin here lets the badge sit right up against it. */
.basket-toggle-btn :deep(.n-button__icon) {
  margin: 0 3px 0 0 !important;
}

.basket-count {
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  line-height: 1;
  padding: 2px 5px;
  border-radius: 8px;
  background: var(--primary-color);
  color: #fff;
}

.basket-toggle-btn--floating {
  position: absolute;
  top: 7px;
  right: 6px;
  z-index: 50;
}

/* Makes room for the fullscreen toggle when the host offers one. */
.basket-toggle-btn--shifted {
  right: 38px;
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

/* Demo users never get the history toggle, so without this the title would
   otherwise sit flush against the topbar's own edge. */
.chat-topbar-left--no-icon {
  padding-left: var(--spacing-sm);
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
  min-width: 0;
}

.welcome-content {
  text-align: center;
  max-width: 720px;
  width: 100%;
  /* Flex items refuse to shrink below their min-content width by default, so a
     single wide child (a card grid, a nowrap button) would drag the whole column
     past the panel's edge. The column follows the panel; children fit inside it. */
  min-width: 0;
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

/* Compact variant: no typing animation, so the title is plain text and needs none of
   the ghost/typed overlay the full welcome screen uses to reserve its final size. */
.chat-welcome--compact {
  padding: var(--spacing-lg);
}

.chat-welcome--compact .welcome-content {
  max-width: 320px;
}

.compact-title {
  font-size: var(--font-size-lg);
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
/* The reading width lives here, on a plain block, and NOT on the grid below.
   `repeat(auto-fit, …)` resolves its repetition count against the grid
   container's own definite size or max size: with `max-width: 550px` sitting on
   the grid it always resolved to two columns — even in a 420px panel — and the
   two 260px minimums then forced the whole welcome column 120px wider than the
   panel, which is what spilled the cards out past its right edge. Capping the
   wrapper instead leaves the grid's width purely inherited, so the repetition
   count is computed against the room that actually exists. */
.suggestion-carousel {
  position: relative;
  width: 100%;
  max-width: 550px;
  margin: 0 auto;
}

/* Clips the outgoing/incoming pages while they cross, and holds its height so
   the welcome column doesn't jump as cards of different lengths swap in. */
.suggestion-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
  display: grid;
  /* `minmax(0, 1fr)` rather than the implicit `auto` track: an auto track can
     never be narrower than the page it holds, which would reintroduce the same
     min-content floor the cards grid was just freed from. */
  grid-template-columns: minmax(0, 1fr);
}

.suggestion-viewport > * {
  grid-area: 1 / 1;
  min-width: 0;
}

.suggestion-slide-enter-active,
.suggestion-slide-leave-active {
  transition:
    transform 0.45s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.35s ease;
}

.suggestion-slide-enter-from {
  transform: translateX(24px);
  opacity: 0;
}

.suggestion-slide-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}

.suggestion-cards {
  display: grid;
  /* Column count follows the panel's own width, not the viewport's: the chat
     column narrows when the app sidebar opens while the viewport stays wide,
     and a media query can't see that. Two up while there's room, one when not. */
  /* `min()` keeps the track from being a hard 260px floor: below that width the
     single column follows the panel instead of overflowing it. */
  grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  /* Rows hug their content — never absorb the free space in the welcome column.
     Items within a row still stretch to match each other's height. */
  align-content: start;
  gap: var(--spacing-md);
  width: 100%;
}

.suggestion-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xs);
  padding: var(--spacing-lg);
  /* Room for the absolutely-positioned expand chevron. */
  padding-right: calc(var(--spacing-lg) + var(--spacing-md));
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: left;
  position: relative;
}

.suggestion-card:hover {
  border-color: var(--accent-color);
  /* background: color-mix(in srgb, var(--accent-color) 5%, var(--bg-surface));
  box-shadow: var(--shadow-md); */
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

.canvas-metadata-only-alert {
  margin-bottom: var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.canvas-metadata-only-alert :deep(.n-alert-body__content) {
  font-size: var(--font-size-sm);
  line-height: 1.4;
}

.canvas-metadata-only-alert :deep(.n-base-icon) {
  font-size: 15px;
}

.canvas-notice-dismiss-forever {
  display: flex;
  justify-content: flex-end;
  margin-top: 2px;
  font-size: var(--font-size-xs);
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

/* ── Responsive ──
   Keyed to `.chat-view--narrow` / `--tight`, which the view sets from its own
   measured width (see NARROW_WIDTH_PX in the script). A media query would only
   see the window, and this view spends most of its life in a panel far narrower
   than the window it sits in — the dashboard's centre column, a canvas shelf —
   so the window's width says nothing about the room the composer actually has. */

/* Columns are handled by auto-fit above; only the breathing room shrinks. */
.chat-view--narrow .suggestion-cards {
  gap: var(--spacing-sm);
}

.chat-view--narrow .chat-welcome {
  padding: var(--spacing-lg);
}

.chat-view--narrow .welcome-title {
  font-size: var(--font-size-xl);
}

.chat-view--narrow .welcome-description {
  font-size: var(--font-size-sm);
}

.chat-view--narrow .chat-messages {
  padding: var(--spacing-md);
}

.chat-view--narrow .chat-input-area {
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
}

/* Always stacked once the column is narrow — a single row is too cramped to be
   worth it, and switching layouts on the first line-wrap would cause a visible
   jump. */
.chat-view--narrow .chat-input-box {
  padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-xs);
}

.chat-view--narrow .chat-input-box .chat-input {
  order: 1;
  flex-basis: 100%;
}

.chat-view--narrow .chat-input-box .attach-btn {
  order: 2;
}

.chat-view--narrow .chat-input-box .chat-input-controls {
  order: 3;
  margin-left: auto;
  gap: var(--spacing-xs);
}

.chat-view--narrow .chat-mode-selector :deep(.mode-selector-chip) {
  width: 35px;
  height: 35px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  gap: 0;
}

.chat-view--narrow
  .chat-mode-selector
  :deep(.mode-selector-chip > span:not(.mode-selector-chip-badge)) {
  display: none;
}

.chat-view--narrow .chat-mode-selector :deep(.mode-selector-chip .n-icon) {
  font-size: 16px !important;
}

.chat-view--narrow .chat-mode-selector :deep(.mode-selector-chip-badge) {
  display: inline-flex;
}

.chat-view--narrow .context-photo-wrapper {
  width: 100px !important;
  height: 100px !important;
}

.chat-view--narrow .message-avatar {
  width: 28px;
  height: 28px;
}

.chat-view--narrow .message-user .message-bubble,
.chat-view--narrow .message-assistant .message-bubble {
  width: 92%;
}

.chat-view--narrow .message-photos-grid {
  grid-template-columns: repeat(3, 1fr);
}

.chat-view--tight .suggestion-card {
  padding: var(--spacing-md);
  padding-right: calc(var(--spacing-md) + var(--spacing-md));
}

.chat-view--tight .suggestion-desc {
  display: none;
}

.chat-view--tight .subquery-item {
  font-size: var(--font-size-xs);
}

/* ── Message Footer ── */
.message-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--spacing-md);
  gap: var(--spacing-sm);
}

.message-time {
  font-size: 10px;
  color: var(--text-tertiary);
  opacity: 0.7;
}

/* Canvas focus reference — the same pill as the panel header's "focused" chip (primary
   accent, roomy padding), so a past turn's focus reads with the live one. A record here,
   not a control, so the cursor stays default. */
.focus-ref-chip.n-tag {
  height: 26px;
  padding: 0 12px;

  cursor: pointer !important;

  border: 1px solid color-mix(in srgb, var(--primary-color) 26%, transparent);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
  color: var(--primary-color);
  background-color: color-mix(in srgb, var(--primary-color) 14%, transparent);
  cursor: default;
  transition:
    color 0.15s,
    background-color 0.15s;
}

/* The chip's parts — one per level the chat was given. Mirrors `.ccp-chip-parts` on the
   panel's live chip, so the same reading applies before and after sending. */
.focus-ref-parts {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.focus-ref-part {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.focus-ref-part .n-icon {
  color: currentColor;
}

.focus-ref-chip.n-tag:hover {
  background-color: color-mix(in srgb, var(--primary-color) 20%, transparent);
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

/* The label keeps its own bottom margin (it's what reserves the two-line block
   that aligns photos across columns), so the row only has to place the button
   beside it and top-align them. */
.message-photo-list-header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-xs);
}

.message-photo-list-header .message-photo-list-label {
  flex: 1;
  min-width: 0;
}

.group-keep-btn {
  flex-shrink: 0;
  transition: color 0.15s !important;
}

.group-keep-btn:not(.n-button--disabled):hover {
  color: var(--accent-color) !important;
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

/* A reply can hand back sixty photos under one label, and at one cell each that batch runs
   several screens down the transcript, burying the answer's own text and every group after
   it. So a result grid is capped at about four rows and the rest scrolls in place. Only the
   assistant's results: the photos a user attached to their own message are few and are part
   of what they wrote, so they are never cut. */
.message-photo-list .message-photos-grid,
.message-photos:not(.message-photos--user) .message-photos-grid {
  max-height: 500px;
  overflow-y: auto;
  /* Scrolling clips, and a photo's hover ring is an outline — painted OUTSIDE
     its cell, so with the grid's edge flush against the cells the ring is cut
     off on whichever side touches it. The sides survive (they bleed into the
     column gap), the top and bottom don't: every group's first and last row sit
     on the edge, and the smaller the cell the more groups fit in a single row
     that is both. This gutter gives the ring room to land in; the negative
     margin cancels it, so the photos stay exactly where they were. */
  padding: 4px; /* PHOTO_GRID_RING_PX */
  margin: -4px;
}

.message-photo-item {
  border-radius: var(--radius-md);
  aspect-ratio: 1;
  transition: transform 0.15s ease;
}

/* Only where there is a board to drop onto — see `canDragToCanvas`. */
.message-photo-item--draggable {
  cursor: grab;
}

/* Sits beside the timestamp in the footer, at the same weight as it: a standing note
   about what is possible, not a call to action competing with the photos above it. */
.message-drag-hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  opacity: 0.8;
}

.message-photo-item--draggable:active {
  cursor: grabbing;
}

/* Already on the board: not draggable — hovering it locates its twin on the canvas
   instead, so the pointer reads "look at", not "grab". */
.message-photo-item--on-canvas {
  cursor: pointer;
}

.message-photo-item.photo-token-hover {
  outline: 1px solid var(--accent-color);
  outline-offset: 1px;
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

/* ── Inline "send this for me" chips ── */
/* A pill, not an underlined link: this one doesn't navigate, it sends a message
   and spends credits, so it has to read as a button rather than as prose. */
.message-bubble :deep(.chat-send-chip) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  /* padding: 1px 9px; */
  margin: 0 1px;
  border-radius: 999px;
  /* border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
  background: color-mix(in srgb, var(--primary-color) 10%, transparent); */
  color: var(--accent-color);
  font-size: 0.92em;
  font-weight: var(--font-weight-semibold);
  line-height: 1.5;
  cursor: pointer;
  user-select: none;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.message-bubble :deep(.chat-send-chip:hover) {
  background: color-mix(in srgb, var(--primary-color) 20%, transparent);
  border-color: var(--primary-color);
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
  margin-top: var(--spacing-lg);
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
</style>
