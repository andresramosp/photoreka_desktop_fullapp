// Emails that are completely excluded from activity logging.
// Neither the middleware nor the frontend-initiated activity endpoint
// will write UserActivity rows for these addresses.
export const NO_ACTIVITY_EMAILS: ReadonlySet<string> = new Set(['andreschennai@gmail.com'])
