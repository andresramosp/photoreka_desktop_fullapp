/**
 * IndexedDB persistence for the geo-recovery flow.
 * All user data (originals, EXIF timestamps, results) is stored here and
 * survives reloads/restarts as long as the user keeps using the same browser.
 */

import { openDB, type IDBPDatabase } from "idb";
import type {
  GeoRecoveryResultsMap,
  LocalPhotoRecord,
  SessionInfo,
} from "./types";

const DB_NAME = "photoreka-geo-recovery";
const DB_VERSION = 1;

const STORE_META = "meta";
const STORE_PHOTOS = "photos";
const STORE_RESULTS = "results";

const META_KEY_SESSION = "session";
const META_KEY_PAID = "paid";

let dbPromise: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_META)) {
          database.createObjectStore(STORE_META);
        }
        if (!database.objectStoreNames.contains(STORE_PHOTOS)) {
          database.createObjectStore(STORE_PHOTOS, {
            keyPath: "clientPhotoId",
          });
        }
        if (!database.objectStoreNames.contains(STORE_RESULTS)) {
          database.createObjectStore(STORE_RESULTS);
        }
      },
    });
  }
  return dbPromise;
}

// ── Session ─────────────────────────────────────────────────────────────────

export async function saveSession(info: SessionInfo): Promise<void> {
  (await db()).put(STORE_META, info, META_KEY_SESSION);
}

export async function loadSession(): Promise<SessionInfo | null> {
  return (
    ((await db()).get(
      STORE_META,
      META_KEY_SESSION,
    ) as Promise<SessionInfo | null>) ?? null
  );
}

export async function setPaid(paid: boolean): Promise<void> {
  (await db()).put(STORE_META, paid, META_KEY_PAID);
}

export async function isPaid(): Promise<boolean> {
  return Boolean(await (await db()).get(STORE_META, META_KEY_PAID));
}

// ── Photos ─────────────────────────────────────────────────────────────────

export async function putPhoto(record: LocalPhotoRecord): Promise<void> {
  (await db()).put(STORE_PHOTOS, record);
}

export async function getPhoto(
  clientPhotoId: string,
): Promise<LocalPhotoRecord | undefined> {
  return (await db()).get(STORE_PHOTOS, clientPhotoId);
}

export async function listPhotos(): Promise<LocalPhotoRecord[]> {
  return (await db()).getAll(STORE_PHOTOS);
}

export async function deletePhoto(clientPhotoId: string): Promise<void> {
  (await db()).delete(STORE_PHOTOS, clientPhotoId);
}

// ── Results ─────────────────────────────────────────────────────────────────

const RESULTS_KEY = "all";

export async function saveResults(
  results: GeoRecoveryResultsMap,
): Promise<void> {
  (await db()).put(STORE_RESULTS, results, RESULTS_KEY);
}

export async function loadResults(): Promise<GeoRecoveryResultsMap> {
  return (
    ((await (await db()).get(STORE_RESULTS, RESULTS_KEY)) as
      | GeoRecoveryResultsMap
      | undefined) ?? {}
  );
}

// ── Reset (start over) ─────────────────────────────────────────────────────

export async function wipeAll(): Promise<void> {
  const database = await db();
  await Promise.all([
    database.clear(STORE_META),
    database.clear(STORE_PHOTOS),
    database.clear(STORE_RESULTS),
  ]);
}

// ── Persistence hint ───────────────────────────────────────────────────────

/**
 * Best-effort: ask the browser to keep our storage from being evicted under
 * disk pressure. Some browsers grant it without prompting, others require a
 * user gesture or PWA install — failing silently is fine.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
