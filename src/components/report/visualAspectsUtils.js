import theme from "@/config/theme.js";

const { colors } = theme;

const CHART_COLORS = [
  colors.blue[600],
  colors.blue[400],
  colors.cyan[600],
  colors.purple[500],
  colors.pink[500],
  colors.blue[500],
  colors.purple[400],
  colors.cyan[500],
  colors.blue[300],
  colors.purple[600],
];

export const getAspectSliceColor = (index) =>
  CHART_COLORS[index % CHART_COLORS.length];

export const buildVisualAspectsData = (
  photos = [],
  visualAspectsOptions = [],
) => {
  if (!Array.isArray(photos) || photos.length === 0) {
    return [];
  }

  const data = visualAspectsOptions.map((aspect) => {
    const valueCounts = {};
    let totalPhotosWithAspect = 0;

    (aspect.children || []).forEach((child) => {
      valueCounts[child.value] = 0;
    });

    photos.forEach((photo) => {
      const visualAspects = photo?.descriptions?.visual_aspects;
      if (!visualAspects || !visualAspects[aspect.key]) {
        return;
      }

      const aspectValues = visualAspects[aspect.key];
      if (!Array.isArray(aspectValues) || aspectValues.length === 0) {
        return;
      }

      totalPhotosWithAspect += 1;

      aspectValues.forEach((value) => {
        if (Object.prototype.hasOwnProperty.call(valueCounts, value)) {
          valueCounts[value] += 1;
        }
      });
    });

    const breakdown = (aspect.children || [])
      .map((child) => ({
        label: child.label,
        value: child.value,
        count: valueCounts[child.value] || 0,
      }))
      .sort((a, b) => b.count - a.count);

    const activeBarsCount = breakdown.filter((item) => item.count > 0).length;

    return {
      key: aspect.key,
      label: aspect.label,
      totalPhotos: totalPhotosWithAspect,
      breakdown,
      activeBarsCount,
    };
  });

  return data.sort((a, b) => b.activeBarsCount - a.activeBarsCount);
};
