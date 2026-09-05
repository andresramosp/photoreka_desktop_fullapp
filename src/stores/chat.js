// stores/chat.js

import { isDemoEmail } from "@/config/demoUsers";
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

/**
 * Debounce timer and write chain, per store instance.
 *
 * Module-level singletons until the store became scoped (see `useChatStore`): with two
 * chats alive, a shared timer meant one chat's pin cancelled the other's pending save,
 * and a shared chain serialised two unrelated conversations behind each other. Keyed by
 * `$id` rather than held in state because a timer handle and a promise are not data —
 * making them reactive would only cost renders.
 */
const basketSaveState = new Map();
const basketSaveFor = (storeId) => {
  let entry = basketSaveState.get(storeId);
  if (!entry) {
    entry = { timer: null, chain: Promise.resolve() };
    basketSaveState.set(storeId, entry);
  }
  return entry;
};

const chatStoreOptions = {
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

    /**
     * Progressive exploration: when on, every photo request excludes photos already shown
     * in the conversation, so each round brings fresh options instead of repeats. Persisted
     * PER CONVERSATION on the server (POST /api/chat/curation-mode) and read back on load,
     * so it belongs to the conversation, not the browser. Templates that pin curation force
     * the same server-side and ignore this.
     */
    curationMode: false,

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
        const isDemoUser = isDemoEmail(userStore.user?.email);
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
        this.curationMode = data.curationMode === true;
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
          // Canvas turns snapshot the photos the agent saw onto the user message, so the
          // reply keeps a reference to what it answered about (see CanvasChatContext,
          // rendered in `past` mode beside the message).
          canvasFocus: m.metadata?.canvasFocus || undefined,
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
      // A fresh conversation starts un-curated; the toggle is per conversation.
      this.curationMode = false;
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

    /** Toggle progressive exploration; persisted on the conversation so it sticks per chat. */
    setCurationMode(value) {
      this.curationMode = value === true;
      this.persistCurationMode();
    },

    /**
     * Write the current curation-mode flag to the conversation. No-op until it exists on
     * the server — a brand-new chat persists it once the first reply assigns an id (see
     * adoptConversationId). Non-fatal: the toggle still governs the in-session turns, which
     * send it in their own payload regardless.
     */
    persistCurationMode() {
      if (!this.activeConversationId) return;
      api
        .post("/api/chat/curation-mode", {
          conversationId: this.activeConversationId,
          curationMode: this.curationMode,
        })
        .catch((error) =>
          console.warn(
            "[ChatStore] Failed to save curation mode:",
            error?.message,
          ),
        );
    },

    /** Drop a queued basket save (the shelf is about to belong to someone else). */
    cancelBasketSave() {
      const pending = basketSaveFor(this.$id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = null;
    },

    /**
     * Queue a basket write. No-op until the conversation exists on the server —
     * a brand-new chat has nothing to attach the shelf to, so `sendMessage`
     * persists it once the first reply assigns an id.
     */
    scheduleBasketSave() {
      if (!this.activeConversationId) return;
      const pending = basketSaveFor(this.$id);
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = setTimeout(() => {
        pending.timer = null;
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
      const pending = basketSaveFor(this.$id);
      if (!this.activeConversationId) return pending.chain;

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

      pending.chain = pending.chain.then(save, save);
      return pending.chain;
    },

    /**
     * Write any pending basket change now and wait for it to land. Called before
     * sending a message so the server reads an up-to-date shelf.
     */
    async flushBasketSave() {
      const pending = basketSaveFor(this.$id);
      if (pending.timer) {
        this.cancelBasketSave();
        this.persistBasket();
      }
      await pending.chain;
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
     * @param {{canvasId: number, photoIds: number[], discardedIds: number[], focusIds: number[]}|null} [options.canvas]
     *   the board this chat is docked to. `canvasId` also decides WHICH conversation the
     *   turn runs in: the server resolves it from the canvas and ignores `conversationId`,
     *   so a canvas chat cannot fork a second conversation for the same board. Read fresh
     *   on every turn — a board changes between one message and the next.
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
        canvas = null,
      } = options;

      // The focus the agent will see this turn, snapshotted onto the user's bubble so the
      // reply keeps a reference even if the board's focus moves while it thinks. The server
      // persists its own sanitised version (metadata.canvasFocus); this is the optimistic
      // mirror shown until the next reload.
      const canvasFocus =
        canvas?.focusIds?.length > 0
          ? {
              focusedIds: canvas.focusIds,
              boardCount: canvas.photoIds?.length ?? 0,
            }
          : null;

      // Optimistically add user message to UI
      this.messages.push({
        role: "user",
        content: displayContent || text,
        timestamp: new Date(),
        attachedPhotos: attachedPhotos.length > 0 ? attachedPhotos : undefined,
        ...(canvasFocus && { canvasFocus }),
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
        ...(this.curationMode && !knowledgeMode && { curationMode: true }),
        // The board. `canvasPhotoIds` can be empty on a canvas that has nothing on it
        // yet — the id still has to travel, because it is what binds the turn to this
        // canvas's conversation.
        ...(canvas?.canvasId &&
          !knowledgeMode && {
            canvasId: canvas.canvasId,
            ...(canvas.photoIds?.length > 0 && {
              canvasPhotoIds: canvas.photoIds,
            }),
            ...(canvas.discardedIds?.length > 0 && {
              canvasDiscardedIds: canvas.discardedIds,
            }),
            ...(canvas.focusIds?.length > 0 && {
              canvasFocusIds: canvas.focusIds,
            }),
            // The "Canvas only" switch. Sent only when on — the server defaults it off, and
            // it is a no-op anyway without placed photos above.
            ...(canvas.scopedToCanvas &&
              canvas.photoIds?.length > 0 && {
                canvasScopedToCanvas: true,
              }),
          }),
      };

      let data;
      try {
        ({ data } = await api.post("/api/chat", payload));
      } catch (error) {
        // A failed turn still leaves a conversation behind, with this message
        // already written into it — the server returns its id on the error for
        // exactly this. Adopting it keeps a retry inside that conversation
        // instead of opening a second one and losing the history the retry
        // depends on (in a templated session, the opening brief).
        this.adoptConversationId(error?.response?.data?.conversationId, hidden);
        throw error;
      }

      // Store the conversation ID (especially important for new conversations)
      this.adoptConversationId(data.conversationId, hidden);

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
     * Bind this store to the conversation the server just resolved, unless it is
     * already bound to one. Called on BOTH outcomes of a turn — see the catch in
     * `sendMessage` — so a turn that errored still leaves the client pointing at
     * the conversation its message went into.
     *
     * @param {number|undefined} conversationId - id from the response, success or error
     * @param {boolean} hidden - session was created archived; the sidebar never shows it
     */
    adoptConversationId(conversationId, hidden = false) {
      if (!conversationId || this.activeConversationId) return;
      this.activeConversationId = conversationId;
      // Refresh the sidebar to include the new conversation — except when it
      // was created hidden, which the sidebar will never show.
      if (!hidden) this.fetchConversations();
      // Anything pinned before the conversation existed had nowhere to go.
      if (this.basketPhotoIds.length > 0) this.persistBasket();
      // Same for a curation toggle flipped on before the first message landed.
      if (this.curationMode) this.persistCurationMode();
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
};

/**
 * Chat stores, one per scope.
 *
 * There used to be exactly one: the dashboard hosted the only chat, and the templated
 * session modal got away with sharing it by resetting it on open and on close. A chat
 * docked to a canvas is neither — it is long-lived and it is on screen at the same time
 * as the dashboard's, so sharing `activeConversationId`, `messages` and the basket
 * between them would have each answering into the other.
 *
 * `useChatStore()` with no argument is the original store, id and all, so every existing
 * caller is untouched. A scope opens a second, fully independent one.
 */
const chatStoreDefinitions = new Map();

const chatStoreIdFor = (scope) => (scope ? `chat:${scope}` : "chat");

export function useChatStore(scope = null) {
  const id = chatStoreIdFor(scope);
  if (!chatStoreDefinitions.has(id)) {
    chatStoreDefinitions.set(id, defineStore(id, chatStoreOptions));
  }
  return chatStoreDefinitions.get(id)();
}

/**
 * Drop a scoped store for good — its state, its definition and its pending basket write.
 *
 * Called when the thing the scope named is gone (a canvas closed, or switched away from),
 * so a session that opens twenty boards doesn't keep twenty transcripts in memory. The
 * unscoped store is never disposed: it is the application's chat, and something is always
 * about to use it again.
 */
export function disposeChatStore(scope) {
  if (!scope) return;
  const id = chatStoreIdFor(scope);

  const pending = basketSaveState.get(id);
  if (pending?.timer) clearTimeout(pending.timer);
  basketSaveState.delete(id);

  const definition = chatStoreDefinitions.get(id);
  if (definition) {
    // Instantiating to dispose looks odd, but `$dispose` lives on the instance and this
    // resolves the existing one rather than creating a second.
    try {
      definition().$dispose();
    } catch {
      // Pinia is already gone (teardown) — nothing left to release.
    }
    chatStoreDefinitions.delete(id);
  }
}
