// stores/chat.js

import { defineStore } from "pinia";
import { api } from "@/utils/axios";
import { useUserStore } from "@/stores/userStore";
import { usePhotosStore } from "@/stores/photos.js";
import { SECTION_UI_CONTEXT } from "@/stores/assistantChat.js";

/**
 * Basket writes are debounced: pinning photos is a click storm (and a whole
 * result group lands in one go), and every write sends the entire shelf anyway.
 */
const BASKET_SAVE_DEBOUNCE_MS = 600;
let basketSaveTimer = null;
/**
 * Saves are chained rather than fired in parallel, so an earlier request can't
 * land after a later one and overwrite the shelf with a stale array.
 */
let basketSaveChain = Promise.resolve();

export const useChatStore = defineStore("chat", {
  state: () => ({
    /** @type {{ id: string, name: string, description: string, modelPhase1: string, modelPhase2Cheap: string, modelPhase2Expensive: string, modelPhase2Lite: string }[]} */
    chatModes: [],

    /** Selected chat intelligence mode ID */
    selectedModeId: null,

    /** Server-provided default chat intelligence mode ID */
    defaultModeId: null,

    /** @type {{ id: number, title: string|null, createdAt: string, updatedAt: string }[]} */
    conversations: [],

    /** Currently active conversation ID (null = new conversation, not yet created) */
    activeConversationId: null,

    /** Messages of the active conversation */
    messages: [],

    /**
     * Selection space ("basket"): photo IDs the user pinned while chatting, kept
     * across the whole conversation so they don't have to scroll the history
     * back up to find them. Stored as strings — the ids flowing through the
     * chat UI come from both the API (numbers) and photo cards (strings).
     *
     * Persisted on the conversation itself (POST /api/chat/basket), so it
     * survives a reload; `loadConversation` reads it back from the payload.
     */
    basketPhotoIds: [],

    /** Loading states */
    isLoadingConversations: false,
    isLoadingMessages: false,
    isLoadingModes: false,

    /** Total conversations count (from server pagination) */
    totalConversations: 0,

    /**
     * Bumped whenever a photo/message hand-off is written to sessionStorage
     * (see usePhotoToolSelection.takeToChat / ProcessingSummaryModal). The
     * dashboard keeps ChatView mounted across the /chat-lab redirect, so a
     * hand-off while it's already active wouldn't otherwise be noticed —
     * ChatView watches this to know when to re-check sessionStorage.
     */
    pendingHandoffTick: 0,
  }),

  getters: {
    hasActiveConversation: (state) => state.activeConversationId !== null,

    basketCount: (state) => state.basketPhotoIds.length,

    isPhotoInBasket: (state) => (photoId) =>
      state.basketPhotoIds.includes(String(photoId)),

    /**
     * With no photos analysed there is nothing to curate, so the chat drops to
     * the lightweight help assistant: cheaper models on the backend, and no
     * grounded actions to suggest (they'd all point at an empty library).
     */
    isKnowledgeAssistant: () =>
      (usePhotosStore().processedPhotos?.length ?? 0) === 0,

    activeConversation: (state) => {
      if (!state.activeConversationId) return null;
      return state.conversations.find(
        (c) => c.id === state.activeConversationId,
      );
    },

    activeMode: (state) => {
      if (!state.selectedModeId) return state.chatModes[0] || null;
      return (
        state.chatModes.find((mode) => mode.id === state.selectedModeId) ||
        state.chatModes[0] ||
        null
      );
    },
  },

  actions: {
    async fetchModes() {
      this.isLoadingModes = true;
      try {
        const { data } = await api.get("/api/chat/modes");
        this.chatModes = data.modes || [];
        this.defaultModeId =
          data.defaultModeId || this.chatModes[0]?.id || null;

        // Demo users are steered to the cheaper "scout" mode; everyone else
        // always gets 'default' if it exists, otherwise the server default.
        const userStore = useUserStore();
        const isDemoUser = userStore.user?.email === "demo@photorekatest.com";
        const preferredModeId = isDemoUser ? "scout" : "default";
        const preferredMode = this.chatModes.find(
          (mode) => mode.id === preferredModeId,
        );
        this.selectedModeId = preferredMode?.id || this.defaultModeId;
      } catch (error) {
        console.error("[ChatStore] Failed to fetch chat modes:", error);
      } finally {
        this.isLoadingModes = false;
      }
    },

    setSelectedMode(modeId) {
      const exists = this.chatModes.some((mode) => mode.id === modeId);
      if (!exists) return;
      this.selectedModeId = modeId;
    },

    /**
     * Fetch the list of conversations for the sidebar.
     */
    async fetchConversations() {
      this.isLoadingConversations = true;
      try {
        const { data } = await api.get("/api/conversations");
        this.conversations = data.conversations || [];
        this.totalConversations = data.total || 0;
      } catch (error) {
        console.error("[ChatStore] Failed to fetch conversations:", error);
      } finally {
        this.isLoadingConversations = false;
      }
    },

    /**
     * Load a specific conversation and all its messages.
     * @param {number} conversationId
     */
    async loadConversation(conversationId) {
      this.isLoadingMessages = true;
      // A save still queued for the outgoing conversation would fire against the
      // incoming one with the wrong shelf.
      this.cancelBasketSave();
      try {
        const { data } = await api.get(`/api/conversations/${conversationId}`);
        this.activeConversationId = data.id;
        // Server-side pruned: ids whose photo is gone never come back.
        this.basketPhotoIds = (data.selectedPhotoIds || []).map(String);
        this.messages = (data.messages || []).map((m) => ({
          messageId: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.createdAt),
          isError: m.isError || false,
          photoLists: m.photoGroups || undefined,
          attachedPhotos: undefined, // Not persisted — context photos are ephemeral display
          contextPhotoIds: m.contextPhotoIds || undefined,
          // Phase 3 suggested actions are persisted on the message metadata
          actions: m.metadata?.actions || undefined,
        }));
      } catch (error) {
        console.error("[ChatStore] Failed to load conversation:", error);
        throw error;
      } finally {
        this.isLoadingMessages = false;
      }
    },

    /**
     * Start a new conversation (locally — the server creates it on the first message).
     */
    startNewConversation() {
      this.cancelBasketSave();
      this.activeConversationId = null;
      this.messages = [];
      this.basketPhotoIds = [];
    },

    /**
     * Selection space — add/remove a photo the user wants to keep at hand for
     * the rest of the conversation.
     * @param {string|number} photoId
     */
    toggleBasketPhoto(photoId) {
      const id = String(photoId);
      const index = this.basketPhotoIds.indexOf(id);
      if (index === -1) this.basketPhotoIds.push(id);
      else this.basketPhotoIds.splice(index, 1);
      this.scheduleBasketSave();
    },

    /**
     * Add several photos at once (a whole result group), skipping the ones
     * already there so the shelf never shows a photo twice.
     * @param {(string|number)[]} photoIds
     */
    addBasketPhotos(photoIds) {
      const seen = new Set(this.basketPhotoIds);
      for (const photoId of photoIds) {
        const id = String(photoId);
        if (seen.has(id)) continue;
        seen.add(id);
        this.basketPhotoIds.push(id);
      }
      this.scheduleBasketSave();
    },

    /** @param {string|number} photoId */
    removeBasketPhoto(photoId) {
      const id = String(photoId);
      this.basketPhotoIds = this.basketPhotoIds.filter((p) => p !== id);
      this.scheduleBasketSave();
    },

    clearBasket() {
      this.basketPhotoIds = [];
      this.scheduleBasketSave();
    },

    /** Drop a queued basket save (the shelf is about to belong to someone else). */
    cancelBasketSave() {
      if (basketSaveTimer) clearTimeout(basketSaveTimer);
      basketSaveTimer = null;
    },

    /**
     * Queue a basket write. No-op until the conversation exists on the server —
     * a brand-new chat has nothing to attach the shelf to, so `sendMessage`
     * persists it once the first reply assigns an id.
     */
    scheduleBasketSave() {
      if (!this.activeConversationId) return;
      if (basketSaveTimer) clearTimeout(basketSaveTimer);
      basketSaveTimer = setTimeout(() => {
        basketSaveTimer = null;
        this.persistBasket();
      }, BASKET_SAVE_DEBOUNCE_MS);
    },

    /**
     * Write the current basket. Non-fatal: the shelf still works in-session if
     * the request fails, and the next change retries with the same full array.
     *
     * The response is not written back into state — it would clobber photos
     * pinned while the request was in flight.
     */
    persistBasket() {
      if (!this.activeConversationId) return basketSaveChain;

      const conversationId = this.activeConversationId;
      const photoIds = this.basketPhotoIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0);

      const save = () =>
        api
          .post("/api/chat/basket", { conversationId, photoIds })
          .then(({ data }) => {
            // The server drops ids that aren't the user's and caps the shelf, so a
            // shorter answer means part of the basket won't come back on reload.
            const stored = data?.selectedPhotoIds?.length ?? 0;
            if (stored !== photoIds.length) {
              console.warn(
                `[ChatStore] Basket stored ${stored}/${photoIds.length} photos`,
              );
            }
          })
          .catch((error) =>
            console.warn("[ChatStore] Failed to save basket:", error?.message),
          );

      basketSaveChain = basketSaveChain.then(save, save);
      return basketSaveChain;
    },

    /**
     * Write any pending basket change now and wait for it to land. Called before
     * sending a message so the server reads an up-to-date shelf.
     */
    async flushBasketSave() {
      if (basketSaveTimer) {
        this.cancelBasketSave();
        this.persistBasket();
      }
      await basketSaveChain;
    },

    /**
     * Signal that a photo/message hand-off just landed in sessionStorage.
     */
    notifyPendingHandoff() {
      this.pendingHandoffTick++;
    },

    /**
     * Send a message. Creates a conversation on-the-fly if needed.
     * Returns the assistant response data.
     *
     * @param {string} text
     * @param {number[]} contextPhotoIds
     * @param {object[]} attachedPhotos - ephemeral photo objects for display
     * @param {object} options
     * @param {string|null} [options.displayContent] - what to render in the user's
     *   bubble instead of `text`. Templated sessions open with a long generated
     *   brief that would be noise to read back. Display-only, and that is enough:
     *   `hidden` keeps the conversation out of the sidebar, so the raw brief is
     *   never rendered again after this session ends.
     * @param {boolean} [options.hidden] - create the conversation already archived
     *   (server-side, and only on the turn that creates it). The conversation is
     *   still fully persisted — history, basket and pagination all keep working.
     * @param {string|null} [options.templateId] - guided session this turn belongs
     *   to. Only the id travels: the server owns the tool allowlist and the prompts
     *   it swaps in. Must be sent on EVERY turn of the session, not just the first —
     *   the server holds no per-conversation template state, so a turn without it
     *   silently runs on the full generalist tool set.
     * @param {number[]} [options.templateScopeCollectionIds] - collections this session is
     *   pinned to. Same contract as `templateId`: sent on every turn, ignored by the server
     *   unless the template declares a scope, and enforced inside `search_advanced` itself.
     */
    async sendMessage(
      text,
      contextPhotoIds = [],
      attachedPhotos = [],
      options = {},
    ) {
      const {
        displayContent = null,
        hidden = false,
        templateId = null,
        templateScopeCollectionIds = [],
      } = options;

      // Optimistically add user message to UI
      this.messages.push({
        role: "user",
        content: displayContent || text,
        timestamp: new Date(),
        attachedPhotos: attachedPhotos.length > 0 ? attachedPhotos : undefined,
      });

      // One writer for the basket: land any pending change before the turn runs,
      // instead of racing the debounce against the request.
      await this.flushBasketSave();

      const knowledgeMode = this.isKnowledgeAssistant;

      const payload = {
        message: text,
        // The intelligence mode picks curation models, which the help assistant
        // never reaches — sending it would only misreport the cost factor.
        ...(!knowledgeMode &&
          this.selectedModeId && { modeId: this.selectedModeId }),
        ...(knowledgeMode && {
          isKnowledgeAssistant: true,
          uiContext: SECTION_UI_CONTEXT.empty_dashboard,
        }),
        ...(this.activeConversationId && {
          conversationId: this.activeConversationId,
        }),
        ...(contextPhotoIds.length > 0 && { contextPhotoIds }),
        ...(hidden && { hidden: true }),
        ...(templateId && !knowledgeMode && { templateId }),
        ...(templateId &&
          !knowledgeMode &&
          templateScopeCollectionIds.length > 0 && {
            templateScopeCollectionIds,
          }),
      };

      const { data } = await api.post("/api/chat", payload);

      // Store the conversation ID (especially important for new conversations)
      if (data.conversationId && !this.activeConversationId) {
        this.activeConversationId = data.conversationId;
        // Refresh the sidebar to include the new conversation — except when it
        // was created hidden, which the sidebar will never show.
        if (!hidden) this.fetchConversations();
        // Anything pinned before the conversation existed had nowhere to go.
        if (this.basketPhotoIds.length > 0) this.persistBasket();
      }

      // Add assistant message
      this.messages.push({
        role: "assistant",
        content: data.output,
        timestamp: new Date(),
        photoLists: data.photoGroups,
        actionsPending: !knowledgeMode,
      });

      return data;
    },

    /**
     * Fetch Phase 3 action suggestions for the latest assistant turn and attach
     * them to that message. Async & non-fatal: the message is already rendered.
     */
    async fetchActionsForActiveConversation() {
      if (!this.activeConversationId) return;
      const pendingMsg = [...this.messages]
        .reverse()
        .find((m) => m.role === "assistant" && !m.isError);
      try {
        const { data } = await api.post("/api/chat/actions", {
          conversationId: this.activeConversationId,
        });
        const actions = data.actions || [];
        const messageId = data.messageId ?? null;
        for (let i = this.messages.length - 1; i >= 0; i--) {
          const msg = this.messages[i];
          if (msg.role === "assistant" && !msg.isError) {
            if (messageId != null) msg.messageId = messageId;
            if (actions.length > 0) msg.actions = actions;
            msg.actionsPending = false;
            break;
          }
        }
      } catch (error) {
        // Non-fatal — suggestions are a progressive enhancement.
        console.warn("[ChatStore] Failed to fetch actions:", error?.message);
        if (pendingMsg) pendingMsg.actionsPending = false;
      }
    },

    /**
     * Persist that a suggested action was used and sync updated action state
     * back into the target assistant message.
     */
    async markActionUsed(messageId, action) {
      if (!this.activeConversationId || !messageId || !action) return [];
      const { data } = await api.post("/api/chat/actions/used", {
        conversationId: this.activeConversationId,
        messageId,
        action,
      });

      const actions = data.actions || [];
      if (actions.length === 0) return actions;

      const msg = this.messages.find(
        (m) => Number(m.messageId) === Number(messageId),
      );
      if (msg) msg.actions = actions;

      return actions;
    },

    /**
     * Add an error message bubble (used when sendMessage throws).
     * @param {string} errorMsg
     */
    addErrorMessage(errorMsg) {
      this.messages.push({
        role: "assistant",
        content: errorMsg,
        timestamp: new Date(),
        isError: true,
      });
    },

    /**
     * Delete a conversation.
     * @param {number} conversationId
     */
    async deleteConversation(conversationId) {
      await api.delete(`/api/conversations/${conversationId}`);
      this.conversations = this.conversations.filter(
        (c) => c.id !== conversationId,
      );

      // If we just deleted the active conversation, reset
      if (this.activeConversationId === conversationId) {
        this.startNewConversation();
      }
    },

    /**
     * Rename a conversation.
     * @param {number} conversationId
     * @param {string} title
     */
    async renameConversation(conversationId, title) {
      await api.patch(`/api/conversations/${conversationId}`, { title });
      const conv = this.conversations.find((c) => c.id === conversationId);
      if (conv) {
        conv.title = title;
      }
    },
  },
});
