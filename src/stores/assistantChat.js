// stores/assistantChat.js
// Pinia store for the lightweight floating Assistant Chat widget.
// Intentionally separate from chat.js — no conversation history UI,
// always sends isKnowledgeAssistant:true so the backend uses lighter models.

import { defineStore } from "pinia";
import { api } from "@/utils/axios";

/**
 * Maps router route names to the logical section identifier used for pills
 * and backend context.  Only routes listed here will show the assistant widget.
 */
const ROUTE_TO_SECTION = {
  search: "search",
  workspace: "workspace",
  "sync-area": "sync-area",
};

/**
 * Centralised quick-action pills, keyed by section name.
 * Add new sections here.
 */
const PILLS_BY_SECTION = {
  "sync-area": [
    {
      label: "Explain photo analysis",
      prompt:
        "How does Photoreka's photo analysis work and what data does it extract?",
      autoSend: true,
    },
  ],
  search: [
    {
      label: "Explain search modes",
      prompt:
        "Explain the different search modes in Photoreka and when to use each one.",
      autoSend: true,
    },
    {
      label: "Help me find a photo",
      prompt: "Help me find photos that ",
      autoSend: true,
    },
    {
      label: "How do filters work?",
      prompt:
        "How do the search filters (stars, tags, date range…) work in the Search view?",
      autoSend: true,
    },
    {
      label: "Search tips",
      prompt: "Give me tips to get better search results in Photoreka.",
      autoSend: true,
    },
  ],
  workspace: [
    {
      label: "What is the Workspace?",
      prompt: "What is the Workspace in Photoreka and how should I use it?",
      autoSend: true,
    },
    {
      label: "How to organize photos",
      prompt: "How do I manage and organize my photos in Photoreka?",
      autoSend: true,
    },
    // aqui va un item para explicar los rankings por criterio y por genero
    {
      label: "Explain photo rankings",
      prompt:
        "Explain the different photo ranking criteria in Photoreka and how they work.",
      autoSend: true,
    },
    {
      label: "How can I use Workspace photos?",
      prompt: "How can I take a photo from the Workspace to another tool?",
      autoSend: true,
    },
  ],
};

export const useAssistantChatStore = defineStore("assistantChat", {
  state: () => ({
    /** Whether the chat panel is currently open */
    isOpen: false,

    /**
     * The active section name (e.g. "search", "workspace"), or null when the
     * current route does not support the assistant widget.
     */
    activeSection: null,

    /** In-session messages (not persisted across page reloads) */
    messages: [],

    /** True while waiting for the backend response */
    isSending: false,

    /** Conversation ID maintained for multi-turn context within a session */
    conversationId: null,
  }),

  getters: {
    /**
     * Returns the pills array for a given section name, or an empty array
     * if the section has no registered pills.
     * @param {string} section
     * @returns {Array}
     */
    pillsForSection: () => (section) => PILLS_BY_SECTION[section] ?? [],
  },

  actions: {
    open() {
      this.isOpen = true;
    },

    close() {
      this.isOpen = false;
    },

    toggle() {
      this.isOpen = !this.isOpen;
    },

    /**
     * Called by App.vue's route watcher.  Sets the active section based on
     * the current route name, and closes the panel when navigating to a route
     * that doesn't support the assistant.
     * @param {string|null|undefined} routeName
     */
    setActiveRoute(routeName) {
      const section = ROUTE_TO_SECTION[routeName] ?? null;
      this.activeSection = section;
      if (!section && this.isOpen) {
        this.isOpen = false;
      }
    },

    /** Wipe messages and forget the current conversation (start fresh). */
    clearSession() {
      this.messages = [];
      this.conversationId = null;
    },

    /**
     * Send a message and append both the user bubble and the assistant reply.
     * @param {string} text
     * @param {{ section?: string }} options  - section: logical context name sent to backend
     */
    async sendMessage(text) {
      this.messages.push({
        role: "user",
        content: text,
        timestamp: new Date(),
      });

      this.isSending = true;

      const payload = {
        message: text,
        // Signal to the backend to use lightweight models
        isKnowledgeAssistant: true,
        ...(this.activeSection && { section: this.activeSection }),
        ...(this.conversationId && { conversationId: this.conversationId }),
      };

      try {
        const { data } = await api.post("/api/chat", payload);

        if (data.conversationId && !this.conversationId) {
          this.conversationId = data.conversationId;
        }

        this.messages.push({
          role: "assistant",
          content: data.output,
          timestamp: new Date(),
          photoLists: data.photoGroups || undefined,
        });

        return data;
      } catch (error) {
        const errMsg =
          error?.response?.data?.message ||
          "Something went wrong. Please try again.";

        this.messages.push({
          role: "assistant",
          content: errMsg,
          timestamp: new Date(),
          isError: true,
        });

        throw error;
      } finally {
        this.isSending = false;
      }
    },
  },
});
