// composables/useChatTemplate.js

import { inject, provide } from "vue";

/**
 * A "chat template" turns the generalist ChatView into a session aimed at one
 * concrete job (building a portfolio, ordering a series, …). Everything that is
 * specific to that job — the setup form, the long opening brief, the panel's
 * call to action — lives in a declarative object under `@/config/chatTemplates`.
 *
 * The host (ChatTemplateModal) provides the live session; ChatView and
 * ChatSelectionPanel inject it. Outside a templated session the injection is
 * `null` and both behave exactly as they did before — no prop chain, no flags
 * threaded through the normal chat flow.
 */
export const CHAT_TEMPLATE_SESSION = Symbol("chatTemplateSession");

/**
 * @typedef {object} ChatTemplateSession
 * @property {import("vue").ComputedRef<object|null>} template  the declarative template
 * @property {import("vue").ComputedRef<object>}      config    `template.session` (behaviour flags)
 * @property {import("vue").Ref<object>}              values    the setup form's answers
 * @property {import("vue").Ref<{text: string, display: string|null}|null>} pendingPrompt
 *           the opening brief, consumed once by ChatView on mount
 * @property {import("vue").ComputedRef<object|null>} panelAction resolved CTA for the selection panel
 * @property {import("vue").Ref<boolean>}             isRunningAction
 * @property {(photoIds: (string|number)[]) => Promise<void>} runPanelAction
 */

/** Called by the host that owns the session. */
export function provideChatTemplateSession(session) {
  provide(CHAT_TEMPLATE_SESSION, session);
}

/**
 * The active session, or `null` in a plain chat. Consumers must treat `null` as
 * "behave normally" — that is the case every existing caller is in.
 *
 * @returns {ChatTemplateSession|null}
 */
export function useChatTemplateSession() {
  return inject(CHAT_TEMPLATE_SESSION, null);
}
