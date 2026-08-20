// config/chatTemplates/index.js

import portfolioBuilder from "./portfolioBuilder.js";

/**
 * Registry of chat templates. Adding a new guided session (series, photobook, …)
 * is one file in this folder plus one line here — nothing in ChatView or in the
 * selection panel needs to know it exists.
 *
 * Template shape:
 *   id            unique slug, also the key callers pass to ChatTemplateModal
 *   modal         { title, subtitle, icon }              — chrome of the host modal
 *   setup         { title, description, submitLabel, notice, fields[] }
 *                 fields: { key, type, label, ... } where type is one of
 *                 'text' | 'textarea' | 'slider' | 'intelligenceMode'
 *   session       behaviour flags applied to the chat itself:
 *                 backendId          server-side template id (tools + phase prompts)
 *                 modeField          which field drives the intelligence mode
 *                 hideHistory        no conversations sidebar
 *                 hideNewChat        no "new chat" escape hatch
 *                 hideActions        no Phase 3 suggested actions under replies
 *                 hideTopbar         the host names the session instead
 *                 pinSelectionPanel  selection space always open, split layout
 *                 hiddenConversation created archived — never listed in history
 *   buildPrompt   (values, context) => string            — the long opening brief
 *   maskMessage   (values) => string                     — what the user sees instead
 *   hint          { storageKey, title, body }            — dismissable help after turn 1
 *   closeConfirm  { title, message }                     — warns before closing a started session
 *   panelAction   { label, icon, minPhotos, target, hint, confirm, run } — CTA in the selection panel
 *                 confirm: { storageKey, title, message } — dismissable heads-up before `run`
 */
const CHAT_TEMPLATES = {
  [portfolioBuilder.id]: portfolioBuilder,
};

/** @returns {object|null} */
export function getChatTemplate(id) {
  return CHAT_TEMPLATES[id] ?? null;
}

export function listChatTemplates() {
  return Object.values(CHAT_TEMPLATES);
}
