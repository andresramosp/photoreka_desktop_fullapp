// stores/chat.js

import { defineStore } from "pinia";
import { api } from "@/utils/axios";

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

    /** Loading states */
    isLoadingConversations: false,
    isLoadingMessages: false,
    isLoadingModes: false,

    /** Total conversations count (from server pagination) */
    totalConversations: 0,
  }),

  getters: {
    hasActiveConversation: (state) => state.activeConversationId !== null,

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

        // Always pick the 'default' mode if it exists, otherwise fall back to server default
        const defaultMode = this.chatModes.find(
          (mode) => mode.id === "default",
        );
        this.selectedModeId = defaultMode?.id || this.defaultModeId;
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
      try {
        const { data } = await api.get(`/api/conversations/${conversationId}`);
        this.activeConversationId = data.id;
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
      this.activeConversationId = null;
      this.messages = [];
    },

    /**
     * Send a message. Creates a conversation on-the-fly if needed.
     * Returns the assistant response data.
     *
     * @param {string} text
     * @param {number[]} contextPhotoIds
     * @param {object[]} attachedPhotos - ephemeral photo objects for display
     */
    async sendMessage(text, contextPhotoIds = [], attachedPhotos = []) {
      // Optimistically add user message to UI
      this.messages.push({
        role: "user",
        content: text,
        timestamp: new Date(),
        attachedPhotos: attachedPhotos.length > 0 ? attachedPhotos : undefined,
      });

      const payload = {
        message: text,
        ...(this.selectedModeId && { modeId: this.selectedModeId }),
        ...(this.activeConversationId && {
          conversationId: this.activeConversationId,
        }),
        ...(contextPhotoIds.length > 0 && { contextPhotoIds }),
      };

      const { data } = await api.post("/api/chat", payload);

      // Store the conversation ID (especially important for new conversations)
      if (data.conversationId && !this.activeConversationId) {
        this.activeConversationId = data.conversationId;
        // Refresh the sidebar to include the new conversation
        this.fetchConversations();
      }

      // Add assistant message
      this.messages.push({
        role: "assistant",
        content: data.output,
        timestamp: new Date(),
        photoLists: data.photoGroups,
        actionsPending: true,
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
