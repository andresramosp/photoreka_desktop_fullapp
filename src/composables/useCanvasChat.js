// composables/useCanvasChat.js

import { inject, provide } from "vue";

/**
 * The chat docked to a canvas.
 *
 * Same shape as `useChatTemplate`, and for the same reason: ChatView is hosted in several
 * places and none of them should have to thread props through it. The host
 * (CanvasChatPanel) provides the live session; ChatView injects it. Outside a canvas the
 * injection is `null` and ChatView behaves exactly as it did — no prop chain, no flags in
 * the ordinary chat path.
 *
 * A canvas chat is NOT a chat template session: `useChatTemplateSession` stays null here,
 * so everything gated on `isTemplateSession` (the history sidebar, the welcome screen,
 * the new-chat button) keeps working. The template half that DOES apply is server-side
 * only — `backendId` below travels as `templateId` and narrows the agent's tools.
 */
export const CANVAS_CHAT_SESSION = Symbol("canvasChatSession");

/**
 * @typedef {object} CanvasChatSession
 * @property {import("vue").Ref<number|null>} canvasId  the board, null before it is saved
 * @property {() => {canvasId: number, photoIds: number[], visibleIds: number[]}|null} readContext
 *           the board as it is RIGHT NOW, read at send time rather than watched: photos
 *           move and the vision radius slides continuously, and only the state at the
 *           moment the message is sent is the one the user meant.
 * @property {(photo: object) => void} onPhotoDragStart  a photo left the transcript
 */

/** Called by the host that owns the session. */
export function provideCanvasChatSession(session) {
  provide(CANVAS_CHAT_SESSION, session);
}

/**
 * The active canvas session, or `null` in every other chat. Consumers must treat `null`
 * as "behave normally".
 *
 * @returns {CanvasChatSession|null}
 */
export function useCanvasChatSession() {
  return inject(CANVAS_CHAT_SESSION, null);
}
