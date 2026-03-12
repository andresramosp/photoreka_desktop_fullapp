// composables/useTagDisplay.ts
import { computed } from "vue";
export function useTagDisplay(tagsSource) {
  const allowedGroups = [
    "person",
    "animals",
    "objects",
    "environment",
    "misc",
    "toponym",
    "mood",
    "weather",
    "symbols",
  ];

  const filteredTags = computed(() => {
    const seen = new Map();
    const tags = tagsSource() || [];
    for (const tagPhoto of tags) {
      const tag = tagPhoto.tag || tagPhoto; // Soporta tanto `tagPhoto.tag` como `tag`
      const id = tag.id;
      if (allowedGroups.includes(tag.group) && !seen.has(id)) {
        seen.set(id, tagPhoto);
      }
    }
    return Array.from(seen.values()).sort(
      (t1, t2) => (t2.tag || t2).name.length - (t1.tag || t1).name.length,
    );
  });

  const selectedColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary-color")
    .trim();

  const hoverColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--border-color-hover")
    .trim();
  const defaultColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg-tag-pill")
    .trim();
  const textColor = getComputedStyle(document.documentElement)
    .getPropertyValue("--text-on-primary")
    .trim();
  const pillHeight = 18;

  return {
    filteredTags,
    allowedGroups,
    selectedColor,
    hoverColor,
    defaultColor,
    textColor,
    pillHeight,
  };
}
