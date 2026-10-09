// File System Access API (Chromium only). Picks keeps a reference to every
// original instead of a copy, so the user can download it again on a later
// visit. Where the API is missing (Firefox, Safari) the feature is not offered.

import { collectDroppedFiles } from "./dropFiles";
import type { PicksSource } from "./types";

const READ = { mode: "read" } as const;

interface PermissionHandle {
  queryPermission(descriptor: { mode: "read" }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: "read" }): Promise<PermissionState>;
}

interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterable<FileSystemHandle>;
}

interface PickerWindow {
  showOpenFilePicker(options?: object): Promise<FileSystemFileHandle[]>;
  showDirectoryPicker(options?: object): Promise<FileSystemDirectoryHandle>;
}

interface HandleDataTransferItem extends DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

const pickers = window as unknown as Partial<PickerWindow>;

export const originalsSupported =
  typeof pickers.showOpenFilePicker === "function" &&
  typeof pickers.showDirectoryPicker === "function" &&
  typeof window.DataTransferItem !== "undefined" &&
  "getAsFileSystemHandle" in DataTransferItem.prototype;

const PHOTO_TYPES = [
  {
    description: "Photos",
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
  },
];

export const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export const sourcesFromFiles = (files: File[]): PicksSource[] =>
  files.map((file) => ({ file, handle: null, root: null }));

async function fromFileHandle(
  handle: FileSystemFileHandle,
  root: FileSystemHandle,
): Promise<PicksSource> {
  return { file: await handle.getFile(), handle, root };
}

async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  root: FileSystemHandle,
  out: PicksSource[],
): Promise<void> {
  for await (const entry of (dir as IterableDirectoryHandle).values()) {
    if (entry.kind === "file") {
      out.push(await fromFileHandle(entry as FileSystemFileHandle, root));
    } else {
      await walkDirectory(entry as FileSystemDirectoryHandle, root, out);
    }
  }
}

async function fromHandle(handle: FileSystemHandle): Promise<PicksSource[]> {
  if (handle.kind === "file") {
    return [await fromFileHandle(handle as FileSystemFileHandle, handle)];
  }
  const out: PicksSource[] = [];
  await walkDirectory(handle as FileSystemDirectoryHandle, handle, out);
  return out;
}

/** Returns null when the user cancels the picker. */
export async function pickPhotoFiles(): Promise<PicksSource[] | null> {
  try {
    const handles = await pickers.showOpenFilePicker!({
      id: "picks-photos",
      multiple: true,
      types: PHOTO_TYPES,
    });
    return Promise.all(handles.map((handle) => fromFileHandle(handle, handle)));
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

/** Returns null when the user cancels the picker. */
export async function pickPhotoFolder(): Promise<PicksSource[] | null> {
  try {
    const dir = await pickers.showDirectoryPicker!({ id: "picks-photos", mode: "read" });
    return await fromHandle(dir);
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}

export async function collectDroppedSources(
  dataTransfer: DataTransfer,
): Promise<PicksSource[]> {
  if (!originalsSupported) return sourcesFromFiles(await collectDroppedFiles(dataTransfer));

  // The items stop being readable once the drop event finishes dispatching, so
  // every handle is requested synchronously before the first await.
  const pending = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => (item as HandleDataTransferItem).getAsFileSystemHandle!());

  const out: PicksSource[] = [];
  for (const handle of await Promise.all(pending)) {
    if (handle) out.push(...(await fromHandle(handle)));
  }
  return out;
}

export async function hasAccess(roots: FileSystemHandle[]) {
  for (const root of roots) {
    if ((await (root as unknown as PermissionHandle).queryPermission(READ)) !== "granted") {
      return false;
    }
  }
  return true;
}

/** Must run inside a user gesture: it may show the browser's permission prompt. */
export async function requestAccess(roots: FileSystemHandle[]) {
  for (const root of roots) {
    const handle = root as unknown as PermissionHandle;
    if ((await handle.queryPermission(READ)) === "granted") continue;
    if ((await handle.requestPermission(READ)) !== "granted") return false;
  }
  return true;
}
