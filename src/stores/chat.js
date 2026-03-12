// stores/chat.js

import { defineStore } from "pinia";
import { api } from "@/utils/axios";

export const useChatStore = defineStore("chat", {
  state: () => ({
    /** @type {{ id: number, title: string|null, createdAt: string, updatedAt: string }[]} */
    conversations: [],

    /** Currently active conversation ID (null = new conversation, not yet created) */
    activeConversationId: null,

    /** Messages of the active conversation */
    messages: [],

    /** Loading states */
    isLoadingConversations: false,
    isLoadingMessages: false,

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
  },

  actions: {
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
          role: m.role,
          content: m.content,
          timestamp: new Date(m.createdAt),
          isError: m.isError || false,
          photoLists: m.photoGroups || undefined,
          attachedPhotos: undefined, // Not persisted — context photos are ephemeral display
          contextPhotoIds: m.contextPhotoIds || undefined,
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
      });

      return data;
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
