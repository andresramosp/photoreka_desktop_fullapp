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
 * @property {() => {canvasId: number, photoIds: number[], discardedIds: number[], focusIds: number[], scopedToCanvas: boolean}|null} readContext
 *           the board as it is RIGHT NOW, read at send time rather than watched: photos
 *           move and the vision radius slides continuously, and only the state at the
 *           moment the message is sent is the one the user meant. `photoIds` is what is
 *           PLACED and `discardedIds` what is in the trash zone: both are kept out of what
 *           the agent proposes, only the first describes the board. `scopedToCanvas` is the
 *           "Canvas only" switch — when true the server caps every search at `photoIds`.
 * @property {(photo: object) => void} onPhotoDragStart  a photo left the transcript
 * @property {import("vue").Ref<Set<number>>} boardPhotoIdSet  the photos already placed
 *           on the board, so a transcript card can tell whether its twin is on the canvas
 * @property {import("vue").Ref<number>} focusedCount  how many photos are in focus right
 *           now (halo or hand-picked), reactively — the empty state gates its focus-specific
 *           starter prompts on this. Zero when vision is off and nothing is hand-picked.
 * @property {(photoId: number|null) => void} highlightOnCanvas  a transcript card is
 *           pointing at (id) or leaving (null) its twin on the board — the host paints the
 *           accent highlight over the matching canvas photo
 * @property {(photoId: number) => void} locateOnCanvas  the eye button on an
 *           already-placed card was clicked — the host glides the canvas to centre its twin
 * @property {import("vue").Ref<object[]>} pendingAttachments  board photos handed to the
 *           chat (the clip button on a canvas photo, a photo dropped on the composer) that
 *           ChatView has not taken yet. A queue rather than a call so nothing handed over
 *           while the view was still loading is lost — it drains whatever is waiting on mount.
 * @property {() => object[]} takePendingAttachments  empties the queue and returns it
 * @property {import("vue").Ref<Array>} pendingDetachments  the remove half of the spotlight
 *           toggle — ids of board photos to drop from the composer. A queue like
 *           `pendingAttachments`, drained by ChatView; used because the spotlight is toggled
 *           from the board and the canvas chat shows no composer chips to un-attach from.
 * @property {() => Array} takePendingDetachments  empties the detach queue and returns it
 * @property {import("vue").Ref<Set<string>>} attachedPhotoIds  ids of the photos currently
 *           attached to the composer (`contextPhotos`), kept in sync by ChatView so the
 *           board can mark them with a persistent badge. Stringified, matching the id shape
 *           the composer stores. The panel owns the ref and relays it up to the board.
 * @property {import("vue").Ref<object>} contextReadout  the board's half of the context
 *           readout ChatView renders beside the composer — board count, focus photos and
 *           total, the cap, the focus source and whether the halo is on. The attachments'
 *           half never travels: ChatView owns the composer and already has them.
 * @property {() => void} clearFocus  the readout's one action — drop a hand-picked selection
 * @property {() => void} disableHalo  turn the halo off if it is on (idempotent) — the empty
 *           state calls it when the tutorial opens so the walkthrough starts at the board level
 * @property {() => void} fitToView  frame the whole outer vision ring — the empty state calls
 *           it when the tutorial opens so the user sees everything the board level describes
 * @property {() => void} clearSpotlight  detach every spotlighted photo — the empty state
 *           calls it when the tutorial opens so it starts clean at the board level
 * @property {import("vue").Ref<boolean>} tutorialActive  whether the empty state's
 *           walkthrough is open right now. CanvasChatEmptyState writes it; ChatView reads it
 *           to show the "this closes the tutorial" guard before a send goes through.
 * @property {() => void} endTutorial  force `tutorialActive` closed — ChatView calls it when
 *           the user chooses "Send anyway" on that guard
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
