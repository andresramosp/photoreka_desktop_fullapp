import { api } from "@/utils/axios";

export type FrontendActivityType = "photo_rank" | "filter_apply" | "ui_action";

/**
 * Log a front-end user activity.
 *
 * Fire-and-forget — never throws, never blocks the caller.
 *
 * @example
 * const { logActivity } = useActivityLogger()
 * logActivity('photo_rank', { photoId: 42, rank: 4 })
 * logActivity('filter_apply', { filter: 'color', value: 'warm' })
 * logActivity('ui_action', { action: 'open_3d_view' })
 */
export function useActivityLogger() {
  function logActivity(
    type: FrontendActivityType,
    metadata?: Record<string, unknown>,
  ): void {
    api.post("/api/activity/log", { type, metadata }).catch(() => {
      // Intentionally silent — activity logging must never affect UX
    });
  }

  return { logActivity };
}
