const countFormatter = new Intl.NumberFormat("en-US");
const eurFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export const formatCount = (n: number) => countFormatter.format(n);
export const formatEur = (n: number) => eurFormatter.format(n);

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatEta(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "estimating…";
  if (ms < 60_000) return "under a minute";
  return `about ${Math.ceil(ms / 60_000)} min`;
}
