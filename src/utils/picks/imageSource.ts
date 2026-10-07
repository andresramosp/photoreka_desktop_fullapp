import { inject, type InjectionKey } from "vue";
import type { PicksPhoto } from "./types";

type ImageSource = (photo: PicksPhoto) => string;

/** Large views ask for the best image available: the original when the browser holds it. */
export const PICKS_LARGE_IMAGE: InjectionKey<ImageSource> = Symbol("picksLargeImage");

export function useLargeImage(): ImageSource {
  return inject(PICKS_LARGE_IMAGE, (photo) => photo.thumbUrl);
}
