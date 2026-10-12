import { useImageProcessing } from "@/composables/useImageProcessing.js";
import {
  UPLOAD_THUMB_MAX_SIZE_BYTES,
  UPLOAD_THUMB_MAX_WIDTH,
} from "@/config/uploadConfig.js";

export interface LocalThumb {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const { resizeImage } = useImageProcessing();

// Same thumbnail the main app uploads, so the scores stay comparable: it is
// the image the model actually looks at.
export async function createLocalThumb(file: File): Promise<LocalThumb> {
  const blob: Blob = await resizeImage(
    file,
    UPLOAD_THUMB_MAX_WIDTH,
    UPLOAD_THUMB_MAX_SIZE_BYTES,
  );
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  return { blob, url: URL.createObjectURL(blob), width, height };
}

export const PICKS_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function isAcceptedImage(file: File): boolean {
  return (
    PICKS_ACCEPTED_TYPES.includes(file.type) ||
    /\.(jpe?g|png|webp)$/i.test(file.name)
  );
}
