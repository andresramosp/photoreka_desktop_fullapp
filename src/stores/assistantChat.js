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
  "import-area": "import-area",
  collections: "collections",
  series: "series",
  "series-detail": "series",
  portfolios: "portfolios",
  "portfolio-detail": "portfolios",
  settings: "settings",
};

/**
 * Full UI context descriptions sent verbatim to the backend.
 * Keeps backend free of screen-to-description mapping.
 */
const SECTION_UI_CONTEXT = {
  search:
    "The user is currently on the **Search / Explorer** screen — the main tool to semantically search, filter, and browse their photo library.",
  workspace:
    "The user is currently on the **Workspace** screen — a personal curation board where they pin and organise their favourite or in-progress photos.",
  "import-area":
    "The user is currently on the **Import Area** — the upload and analysis hub where photos are imported, preprocessed, and sent through the AI analysis pipeline.",
  collections:
    "The user is currently on the **Collections** screen — where they create and manage named groups of photos for organisation and curation purposes.",
  series:
    "The user is currently on the **Series** screen — where they create ordered sequences of photos that tell a visual story, with fullscreen viewer and public sharing capabilities.",
  portfolios:
    "The user is currently on the **Portfolios** screen — where AI curates a polished selection of their best photos into an exportable portfolio with customisable layout and style.",
  settings:
    "The user is currently on the **Settings** screen — where they manage their account, billing, API integrations, notification preferences, and usage quotas. Photoreka does not have subscription plans; users purchase fixed photo packages (each includes a bundle of AI analysis credits) or buy additional AI credits separately.",
};

/**
 * Centralised quick-action pills, keyed by section name.
 * Add new sections here.
 */
const PILLS_BY_SECTION = {
  "import-area": [
    {
      label: "Explain how photo analysis works",
      prompt:
        "How does Photoreka's photo analysis work and what data does it extract?",
      autoSend: true,
    },
    {
      label: "I have uploaded new photos, what should I do next?",
      prompt: "I have uploaded new photos, what should I do next?",
      autoSend: true,
    },

    {
      label: "How long does the photo analysis take?",
      prompt: "How long does the photo analysis take?",
      autoSend: true,
    },
  ],
  search: [
    {
      label: "Explain the different search modes in Photoreka",
      prompt:
        "Explain the different search modes in Photoreka and when to use each one.",
      autoSend: true,
    },
    {
      label: "Help me find photos that match a description and filters",
      prompt:
        "Help me find photos that matches a description and some filters using Search tool",
      autoSend: true,
    },
    {
      label: "What do the stars filter mean?",
      prompt: "What do the stars filter mean in the search results?",
      autoSend: true,
    },
    {
      label: "What tips can help me get better search results?",
      prompt: "Give me tips to get better search results in Photoreka.",
      autoSend: true,
    },
  ],
  collections: [
    {
      label: "How do collections work?",
      prompt:
        "What are Collections in Photoreka and how do I use them to organise my photos?",
      autoSend: true,
    },
    {
      label: "How do I add photos to a collection?",
      prompt: "How can I add photos to a collection in Photoreka?",
      autoSend: true,
    },
    {
      label: "What's the different between sets and collections?",
      prompt:
        "What is the difference between sets and collections in Photoreka?",
      autoSend: true,
    },
    {
      label: "What's the difference between collections and series?",
      prompt:
        "What is the difference between Collections and Series in Photoreka, and when should I use each?",
      autoSend: true,
    },
  ],
  series: [
    {
      label: "What is a series and how do I create one?",
      prompt: "What is a Series in Photoreka and how do I create one?",
      autoSend: true,
    },
    {
      label: "What is the difference between series and portfolios?",
      prompt:
        "What is the difference between Series and Portfolios in Photoreka, and when should I use each?",
      autoSend: true,
    },
    {
      label: "How do I reorder photos in a series?",
      prompt:
        "How can I reorder or edit the photos inside a series in Photoreka?",
      autoSend: true,
    },
  ],
  portfolios: [
    {
      label: "How does AI build my portfolio?",
      prompt:
        "How does Photoreka's AI select and curate photos to build a portfolio?",
      autoSend: true,
    },
    {
      label: "How do I export my portfolio?",
      prompt: "What export options are available for portfolios in Photoreka?",
      autoSend: true,
    },
    {
      label: "How can I customise my portfolio's style?",
      prompt:
        "How can I customise the style, theme, or layout of my portfolio in Photoreka?",
      autoSend: true,
    },
  ],
  workspace: [
    {
      label: "How does Workspace work?",
      prompt: "What is the Workspace in Photoreka and how should I use it?",
      autoSend: true,
    },
    {
      label: "How can I organize my photos into collections?",
      prompt: "How do I manage and organize my photos in Photoreka?",
      autoSend: true,
    },
    // aqui va un item para explicar los rankings por criterio y por genero

    {
      label: "How can I rank my photos by aesthetic criteria?",
      prompt:
        "Explain the different photo ranking criteria in Photoreka and how they work.",
      autoSend: true,
    },
    {
      label: "How can I take Workspace photos to another tool?",
      prompt: "How can I take a photo from the Workspace to another tool?",
      autoSend: true,
    },
  ],
  settings: [
    {
      label: "What photo packages are available?",
      prompt:
        "What photo packages can I buy in Photoreka and what do they include?",
      autoSend: true,
    },
    {
      label: "What are AI analysis credits and how are they used?",
      prompt:
        "What are AI analysis credits in Photoreka, how are they consumed, and can I buy extra ones separately?",
      autoSend: true,
    },
    {
      label: "Do photo packages include AI credits?",
      prompt:
        "Do photo packages in Photoreka come with AI analysis credits included?",
      autoSend: true,
    },
    {
      label: "How do I connect Lightroom or other integrations?",
      prompt:
        "How do I connect Lightroom or other third-party integrations in Photoreka settings?",
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

    /** In-session messages for the active section (not persisted across page reloads) */
    messages: [],

    /** True while waiting for the backend response */
    isSending: false,

    /** Conversation ID for the active section */
    conversationId: null,

    /**
     * Saved threads keyed by section name so each section keeps its own
     * isolated history when the user navigates away and comes back.
     * Shape: { [section]: { messages: [], conversationId: string|null } }
     */
    threads: {},
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
     * Each section keeps its own isolated thread — messages and conversationId
     * are saved before switching and restored when coming back.
     * @param {string|null|undefined} routeName
     */
    setActiveRoute(routeName) {
      const newSection = ROUTE_TO_SECTION[routeName] ?? null;

      // Persist the current section's thread before leaving
      if (this.activeSection) {
        this.threads[this.activeSection] = {
          messages: [...this.messages],
          conversationId: this.conversationId,
        };
      }

      this.activeSection = newSection;

      // Restore the new section's thread, or start fresh
      const saved = newSection ? this.threads[newSection] : null;
      this.messages = saved ? [...saved.messages] : [];
      this.conversationId = saved?.conversationId ?? null;

      if (this.isOpen) {
        this.isOpen = false;
      }
    },

    /** Wipe messages and forget the current conversation (start fresh). */
    clearSession() {
      this.messages = [];
      this.conversationId = null;
      if (this.activeSection) {
        delete this.threads[this.activeSection];
      }
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
        ...(this.activeSection && {
          uiContext:
            SECTION_UI_CONTEXT[this.activeSection] ?? this.activeSection,
        }),
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
