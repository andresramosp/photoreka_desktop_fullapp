import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { PICKS_RETENTION_DAYS } from "@/config/picks";

// Only references to the originals are stored (a few bytes each), never the
// image data, so a 5,000-photo session costs next to nothing on disk.

interface SessionRecord {
  sessionId: string;
  createdAt: number;
  roots: FileSystemHandle[];
}

export interface OriginalRecord {
  key: string;
  sessionId: string;
  photoId: string;
  name: string;
  handle: FileSystemFileHandle;
}

interface PicksDB extends DBSchema {
  sessions: { key: string; value: SessionRecord };
  originals: { key: string; value: OriginalRecord; indexes: { bySession: string } };
}

const DB_NAME = "photoreka-picks";
const DB_VERSION = 1;
const DAY_MS = 86_400_000;

let dbPromise: Promise<IDBPDatabase<PicksDB>> | null = null;

function db() {
  dbPromise ??= openDB<PicksDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore("sessions", { keyPath: "sessionId" });
      database
        .createObjectStore("originals", { keyPath: "key" })
        .createIndex("bySession", "sessionId");
    },
  });
  return dbPromise;
}

const originalKey = (sessionId: string, photoId: string) => `${sessionId}/${photoId}`;

export async function saveSessionRoots(sessionId: string, roots: FileSystemHandle[]) {
  const database = await db();
  const existing = await database.get("sessions", sessionId);
  await database.put("sessions", {
    sessionId,
    createdAt: existing?.createdAt ?? Date.now(),
    roots,
  });
}

export async function loadSessionRoots(sessionId: string): Promise<FileSystemHandle[]> {
  return (await (await db()).get("sessions", sessionId))?.roots ?? [];
}

export async function saveOriginal(
  sessionId: string,
  photoId: string,
  name: string,
  handle: FileSystemFileHandle,
) {
  await (await db()).put("originals", {
    key: originalKey(sessionId, photoId),
    sessionId,
    photoId,
    name,
    handle,
  });
}

export async function getOriginal(sessionId: string, photoId: string) {
  return (await db()).get("originals", originalKey(sessionId, photoId));
}


export async function deleteSessionOriginals(sessionId: string) {
  const tx = (await db()).transaction(["sessions", "originals"], "readwrite");
  await tx.objectStore("sessions").delete(sessionId);
  let cursor = await tx.objectStore("originals").index("bySession").openCursor(sessionId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function purgeExpiredOriginals() {
  const cutoff = Date.now() - PICKS_RETENTION_DAYS * DAY_MS;
  const sessions = await (await db()).getAll("sessions");
  for (const session of sessions) {
    if (session.createdAt < cutoff) await deleteSessionOriginals(session.sessionId);
  }
}
