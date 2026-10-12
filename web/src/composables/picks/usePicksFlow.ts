import { computed, ref, shallowRef } from "vue";
import { PICKS_FREE_TRIAL_PHOTOS, PICKS_JURIES, PICKS_MAX_PHOTOS } from "@/config/picks";
import { isAcceptedImage } from "@/utils/picks/localThumbs";
import {
  createDemoPhotos,
  mockCritique,
  mockGenres,
  mockScores,
  simulateJudging,
  simulateUpload,
} from "@/utils/picks/mock";
import { countJuryPhotos, rankPhotos, scoreFor } from "@/utils/picks/ranking";
import {
  deleteSessionOriginals,
  saveOriginal,
  saveSessionRoots,
} from "@/utils/picks/originalsStore";
import {
  apiErrorMessage,
  createFreeSession,
  createSession,
  getResults,
  getStatus,
  markUploadComplete,
  type PicksServerPhoto,
  type PicksStatusResponse,
} from "@/utils/picks/api";
import { createPicksUploader, type PicksUploader } from "@/utils/picks/uploader";
import type {
  PicksJudgingState,
  PicksPhoto,
  PicksRankingMode,
  PicksSource,
  PicksStep,
  PicksTransferState,
} from "@/utils/picks/types";

const RECENT_LIMIT = 40;
const LEADERS_LIMIT = 5;
const RESULTS_DELAY_MS = 1400;
const POLL_MS = 2500;
const OVERALL: PicksRankingMode = { kind: "jury", juryId: PICKS_JURIES[0].id };

const sourceKey = ({ file }: PicksSource) => `${file.name}|${file.size}|${file.lastModified}`;
const emptyTransfer = (): PicksTransferState => ({
  total: 0,
  uploaded: 0,
  failed: 0,
  startedAt: null,
});

const fromServer = (photo: PicksServerPhoto): PicksPhoto => ({
  id: photo.clientPhotoId,
  name: photo.name,
  thumbUrl: photo.thumbUrl ?? "",
  width: photo.width,
  height: photo.height,
  scores: photo.scores,
  critique: photo.critique,
  genres: photo.genres,
  duplicates: photo.duplicates,
});

export function usePicksFlow() {
  const step = ref<PicksStep>("welcome");
  const files = shallowRef<PicksSource[]>([]);
  /** Signed order token: the key to this order, also used in the results URL. */
  const token = ref<string | null>(null);
  const sessionId = ref<string | null>(null);
  const photos = ref<PicksPhoto[]>([]);
  const transfer = ref<PicksTransferState>(emptyTransfer());
  const judging = ref<PicksJudgingState | null>(null);
  const recentIds = ref<string[]>([]);
  const mode = ref<PicksRankingMode>({ ...OVERALL });
  const fatalError = ref<string | null>(null);
  // Set when this tab is not the one uploading (a reopened link): the server says when it is done.
  const serverUploadDone = ref(false);
  const uploadsHere = ref(false);
  /** Free-trial mode on the welcome screen: the selection is capped. */
  const trial = ref(false);
  /** The open order is a free trial (no email, upsell on the results). */
  const isTrialOrder = ref(false);

  const selectedKeys = new Set<string>();
  // Copies whose judged twin has not reached the photo list yet.
  const pendingCopies = new Map<string, string[]>();
  const queuedKeys = new Set<string>();
  // Folders or files the user granted access to; permission is restored on them.
  const roots = new Set<FileSystemHandle>();
  const objectUrls: string[] = [];
  let uploader: PicksUploader | null = null;
  let sessionRequest: Promise<void> | null = null;
  let stopTimers: (() => void)[] = [];
  let cursor: string | null = null;
  let paid = false;
  let uploadCompleteSent = false;
  // Bumped whenever the session is discarded, so in-flight work stops writing.
  let runId = 0;

  const uploadFinished = computed(() => {
    if (!uploadsHere.value) return serverUploadDone.value;
    const { total, uploaded, failed } = transfer.value;
    return total > 0 && uploaded + failed >= total;
  });
  const uploading = computed(
    () => uploadsHere.value && transfer.value.startedAt !== null && !uploadFinished.value,
  );

  const ranked = computed(() => rankPhotos(photos.value, mode.value));
  const juryCounts = computed(() => countJuryPhotos(photos.value));
  const judgedCount = computed(() => photos.value.filter((p) => p.scores).length);

  const photoById = computed(() => {
    const map = new Map<string, PicksPhoto>();
    for (const photo of photos.value) map.set(photo.id, photo);
    return map;
  });

  const recent = computed(() =>
    recentIds.value
      .map((id) => photoById.value.get(id))
      .filter((photo): photo is PicksPhoto => Boolean(photo))
      .map((photo) => ({ photo, score: scoreFor(photo, OVERALL) })),
  );

  const leaders = computed(() =>
    step.value === "processing"
      ? rankPhotos(photos.value, OVERALL).slice(0, LEADERS_LIMIT)
      : [],
  );

  // ── Selection ────────────────────────────────────────────────────────────

  function addFiles(incoming: PicksSource[]): { rejected: number; overLimit: number } {
    const next = [...files.value];
    let rejected = 0;
    let overLimit = 0;
    for (const source of incoming) {
      if (!isAcceptedImage(source.file)) {
        rejected++;
        continue;
      }
      const key = sourceKey(source);
      if (selectedKeys.has(key)) continue;
      if (next.length >= selectionLimit()) {
        overLimit++;
        continue;
      }
      selectedKeys.add(key);
      if (source.root) roots.add(source.root);
      next.push(source);
    }
    files.value = next;
    return { rejected, overLimit };
  }

  const selectionLimit = () => (trial.value ? PICKS_FREE_TRIAL_PHOTOS : PICKS_MAX_PHOTOS);

  /** Switching to the trial keeps the first photos that fit; returns how many were dropped. */
  function setTrial(on: boolean): number {
    trial.value = on;
    const extra = files.value.length - selectionLimit();
    if (extra <= 0) return 0;
    const kept = files.value.slice(0, selectionLimit());
    clearSelection();
    addFiles(kept);
    return extra;
  }

  // Unpaid sessions take their stored references with them; paid ones keep
  // them so the private link can still offer the originals.
  function discardSession({ keepOriginals }: { keepOriginals: boolean }) {
    runId++;
    stopTimers.forEach((stop) => stop());
    stopTimers = [];
    uploader?.cancel();
    uploader = null;
    uploadsHere.value = false;
    sessionRequest = null;
    objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url));
    pendingCopies.clear();
    queuedKeys.clear();
    if (sessionId.value && !keepOriginals) void deleteSessionOriginals(sessionId.value);
    token.value = null;
    sessionId.value = null;
    cursor = null;
    paid = false;
    uploadCompleteSent = false;
    serverUploadDone.value = false;
    fatalError.value = null;
    isTrialOrder.value = false;
    photos.value = [];
    transfer.value = emptyTransfer();
    judging.value = null;
    recentIds.value = [];
  }

  function clearSelection() {
    files.value = [];
    selectedKeys.clear();
    roots.clear();
  }

  function clearFiles() {
    discardSession({ keepOriginals: false });
    clearSelection();
  }

  // ── Upload (starts when the checkout opens, before payment) ──────────────

  type OpenOrder = () => ReturnType<typeof createSession>;

  async function ensureSession(open: OpenOrder): Promise<void> {
    if (token.value) return;
    const run = runId;
    sessionRequest ??= open().then(({ sessionToken, session }) => {
      if (run !== runId) return;
      token.value = sessionToken;
      sessionId.value = session.id;
      isTrialOrder.value = session.isFree;
      uploadsHere.value = true;
      uploader = createPicksUploader(sessionToken, {
        onUploaded: (thumb, source) => {
          if (run !== runId) return URL.revokeObjectURL(thumb.thumbUrl);
          objectUrls.push(thumb.thumbUrl);
          transfer.value.uploaded++;
          maybeCompleteUpload();
          if (source.handle) void saveOriginal(session.id, thumb.clientPhotoId, thumb.name, source.handle);
          // A fast verdict can land before this callback; keep one entry per photo.
          const existing = photoById.value.get(thumb.clientPhotoId);
          if (existing) {
            existing.thumbUrl = thumb.thumbUrl;
            return;
          }
          photos.value.push({
            id: thumb.clientPhotoId,
            name: thumb.name,
            thumbUrl: thumb.thumbUrl,
            width: thumb.width,
            height: thumb.height,
            scores: null,
            critique: null,
            genres: null,
            duplicates: pendingCopies.get(thumb.clientPhotoId) ?? [],
          });
          pendingCopies.delete(thumb.clientPhotoId);
        },
        onDuplicate: (copy) => {
          if (run !== runId) return;
          transfer.value.uploaded++;
          maybeCompleteUpload();
          const twin = photoById.value.get(copy.duplicateOf);
          if (twin) twin.duplicates = [...(twin.duplicates ?? []), copy.name];
          else pendingCopies.set(copy.duplicateOf, [...(pendingCopies.get(copy.duplicateOf) ?? []), copy.name]);
        },
        onFailed: (source, error) => {
          if (run !== runId) return;
          console.warn("[Picks] Upload failed for", source.file.name, error);
          transfer.value.failed++;
          maybeCompleteUpload();
        },
      });
    });
    try {
      await sessionRequest;
    } finally {
      sessionRequest = null;
    }
  }

  /** Throws when the order cannot be opened (network, rate limit). */
  async function startUpload(): Promise<void> {
    const run = runId;
    await ensureSession(() => createSession(files.value.length));
    if (run === runId) enqueuePending();
  }

  function enqueuePending() {
    if (!uploader || !sessionId.value) return;

    const pending = files.value.filter((s) => !queuedKeys.has(sourceKey(s)));
    if (pending.length === 0) return;
    pending.forEach((s) => queuedKeys.add(sourceKey(s)));
    transfer.value.total = files.value.length;
    transfer.value.startedAt ??= Date.now();
    if (roots.size > 0) void saveSessionRoots(sessionId.value, [...roots]);

    for (const source of pending) uploader.add(source, crypto.randomUUID());
  }

  // The server stops waiting for photos only once the order is paid and every
  // upload settled: before paying, the buyer may still add more.
  function maybeCompleteUpload() {
    if (!paid || !uploadFinished.value || uploadCompleteSent || !token.value) return;
    uploadCompleteSent = true;
    markUploadComplete(token.value).catch(() => (uploadCompleteSent = false));
  }

  // ── Judging (server) ─────────────────────────────────────────────────────

  function mergeJudged(serverPhotos: PicksServerPhoto[]) {
    const fresh: string[] = [];
    for (const server of serverPhotos) {
      const local = photoById.value.get(server.clientPhotoId);
      if (local?.scores) continue;
      if (local) {
        local.scores = server.scores;
        local.critique = server.critique;
        local.genres = server.genres;
      } else {
        photos.value.push(fromServer(server));
      }
      fresh.push(server.clientPhotoId);
    }
    if (fresh.length) {
      recentIds.value = [...fresh.reverse(), ...recentIds.value].slice(0, RECENT_LIMIT);
    }
  }

  function applyStatus(status: PicksStatusResponse) {
    cursor = status.cursor ?? cursor;
    mergeJudged(status.photos);
    // Copies are done as soon as they are registered: they share their twin's verdict.
    if (judging.value) judging.value.judged = status.counts.judged + status.counts.duplicate;
    if (!uploadsHere.value) {
      // Reopened link: this tab mirrors the upload instead of running it.
      transfer.value = {
        total: status.session.paidCount ?? status.counts.registered,
        uploaded: status.counts.registered,
        failed: 0,
        startedAt: transfer.value.startedAt ?? Date.parse(status.session.createdAt),
      };
      serverUploadDone.value =
        status.session.uploadCompleted ||
        status.counts.registered >= (status.session.paidCount ?? Infinity);
    }
  }

  function finishJudging(status: PicksStatusResponse, run: number) {
    if (!judging.value) return;
    judging.value.done = true;
    if (status.counts.judged === 0) {
      fatalError.value =
        "We could not judge your photos. Our team has been notified and will contact you.";
      return;
    }
    setTimeout(() => run === runId && loadResults(), RESULTS_DELAY_MS);
  }

  function startPolling() {
    const run = runId;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (run !== runId || !token.value) return;
      try {
        const status = await getStatus(token.value, cursor);
        if (run !== runId) return;
        applyStatus(status);
        if (status.session.status === "completed" || status.session.status === "failed") {
          return finishJudging(status, run);
        }
      } catch (error) {
        console.warn("[Picks] Status poll failed", error);
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    stopTimers.push(() => timer && clearTimeout(timer));
  }

  /**
   * Free trial: the order is born "paid" for its photos, so it skips the
   * checkout and goes straight to judging. Throws on the daily limits (429).
   */
  async function startFreeTrial(): Promise<void> {
    const run = runId;
    await ensureSession(() => createFreeSession(files.value.length));
    if (run !== runId) return;
    enqueuePending();
    confirmPayment();
  }

  /** The browser confirmed the payment with the API: judging is running server-side. */
  function confirmPayment() {
    paid = true;
    step.value = "processing";
    judging.value = { judged: 0, startedAt: Date.now(), done: false };
    recentIds.value = [];
    maybeCompleteUpload();
    startPolling();
  }

  async function loadResults() {
    if (!token.value) return;
    const run = runId;
    const { photos: judged } = await getResults(token.value);
    if (run !== runId) return;
    mergeJudged(judged);
    step.value = "results";
  }

  /** Reopens an order from its link: results, live progress, or nothing usable. */
  async function openOrder(orderToken: string): Promise<"results" | "processing" | "unpaid"> {
    discardSession({ keepOriginals: true });
    const run = runId;
    try {
      const status = await getStatus(orderToken, null);
      if (run !== runId) return "unpaid";
      if (!status.session.paid) return "unpaid";

      token.value = orderToken;
      sessionId.value = status.session.id;
      isTrialOrder.value = status.session.isFree;
      paid = true;
      if (status.session.status === "processing") {
        step.value = "processing";
        judging.value = { judged: 0, startedAt: Date.now(), done: false };
        applyStatus(status);
        startPolling();
        return "processing";
      }
      if (status.counts.judged === 0) {
        fatalError.value = "We could not judge the photos of this order. Our team has been notified.";
        return "results";
      }
      const { photos: judged } = await getResults(orderToken);
      if (run !== runId) return "results";
      photos.value = judged.map(fromServer);
      step.value = "results";
      return "results";
    } catch (error) {
      fatalError.value = apiErrorMessage(error, "This ranking could not be loaded.");
      throw error;
    }
  }

  // ── Demo (?mock=…, dev only) ─────────────────────────────────────────────

  function applyMockJudgement(ids: string[]) {
    const state = judging.value;
    if (!state) return;
    for (const id of ids) {
      const photo = photoById.value.get(id);
      if (!photo) continue;
      photo.scores = mockScores(id);
      photo.critique = mockCritique(id, photo.scores);
      photo.genres = mockGenres(id);
    }
    state.judged += ids.length;
    recentIds.value = [...[...ids].reverse(), ...recentIds.value].slice(0, RECENT_LIMIT);
  }

  function loadDemo(kind: "results" | "processing", count: number) {
    discardSession({ keepOriginals: false });
    const run = runId;
    const scored = kind === "results";
    const demo = createDemoPhotos(count, scored);
    serverUploadDone.value = scored;
    transfer.value = { total: count, uploaded: scored ? count : 0, failed: 0, startedAt: Date.now() };
    if (scored) {
      photos.value = demo;
      step.value = "results";
      return;
    }
    stopTimers.push(
      simulateUpload(demo, (photo) => {
        if (run !== runId) return;
        photos.value.push(photo);
        transfer.value.uploaded++;
        if (transfer.value.uploaded >= count) serverUploadDone.value = true;
      }),
    );
    step.value = "processing";
    judging.value = { judged: 0, startedAt: Date.now(), done: false };
    stopTimers.push(
      simulateJudging({
        total: () => transfer.value.total,
        pendingIds: () => photos.value.filter((p) => !p.scores).map((p) => p.id),
        uploadFinished: () => serverUploadDone.value,
        onJudged: (ids) => run === runId && applyMockJudgement(ids),
        onDone: () => {
          if (run !== runId || !judging.value) return;
          judging.value.done = true;
          setTimeout(() => run === runId && (step.value = "results"), RESULTS_DELAY_MS);
        },
      }),
    );
  }

  function reset() {
    discardSession({ keepOriginals: true });
    clearSelection();
    trial.value = false;
    mode.value = { ...OVERALL };
    step.value = "welcome";
  }

  return {
    step,
    files,
    token,
    sessionId,
    transfer,
    judging,
    uploading,
    uploadFinished,
    fatalError,
    trial,
    isTrialOrder,
    mode,
    ranked,
    juryCounts,
    judgedCount,
    recent,
    leaders,
    addFiles,
    clearFiles,
    setTrial,
    startUpload,
    startFreeTrial,
    confirmPayment,
    openOrder,
    loadDemo,
    reset,
  };
}
