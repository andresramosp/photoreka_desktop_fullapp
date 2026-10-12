export const PORTFOLIO_DEFAULT_RATIO = 1.5;

function resolveRatio(photo, getAspectRatio, defaultRatio) {
  const ratio = getAspectRatio?.(photo);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : defaultRatio;
}

function computeRowMetrics({
  ratios,
  columns,
  gap,
  containerWidth,
  fillAvailableSpace,
}) {
  const sumRatios = ratios.reduce((total, ratio) => total + ratio, 0);
  let availableWidth = containerWidth - gap * (ratios.length - 1);
  let effectiveSumRatios = sumRatios;

  if (!fillAvailableSpace && ratios.length < columns) {
    const averageRatio = sumRatios / ratios.length;
    const missingSlots = columns - ratios.length;
    availableWidth = containerWidth - gap * (columns - 1);
    effectiveSumRatios += averageRatio * missingSlots;
  }

  const rowHeight = availableWidth / effectiveSumRatios;
  return {
    rowHeight,
    widths: ratios.map((ratio) => ratio * rowHeight),
  };
}

export function buildPortfolioRows({
  photos,
  columns,
  gap,
  containerWidth,
  fillAvailableSpace = true,
  defaultRatio = PORTFOLIO_DEFAULT_RATIO,
  getAspectRatio,
}) {
  if (!containerWidth || !Array.isArray(photos) || photos.length === 0) {
    return [];
  }

  const safeColumns = Math.max(1, Number(columns) || 1);
  const rows = [];

  for (let index = 0; index < photos.length; index += safeColumns) {
    const rowPhotos = photos.slice(index, index + safeColumns);
    const ratios = rowPhotos.map((photo) =>
      resolveRatio(photo, getAspectRatio, defaultRatio),
    );
    const { rowHeight, widths } = computeRowMetrics({
      ratios,
      columns: safeColumns,
      gap,
      containerWidth,
      fillAvailableSpace,
    });

    rows.push({
      photos: rowPhotos,
      ratios,
      rowHeight,
      widths,
    });
  }

  return rows;
}
// Owners arrange a portfolio at roughly this width. Gap is stored in absolute
// px, so anything rendering it elsewhere scales the gap against this width or
// it swamps the photos on a phone.
export const PORTFOLIO_REFERENCE_WIDTH = 1200;

export function responsiveColumns(columns, containerWidth) {
  const safe = Math.max(1, Number(columns) || 1);
  if (!containerWidth) return safe;
  if (containerWidth < 600) return 1;
  if (containerWidth < 900) return Math.min(safe, 2);
  return safe;
}

export function responsiveGap(gap, containerWidth) {
  const safe = Number(gap) || 0;
  if (!containerWidth || !safe) return safe;
  return Math.max(
    8,
    Math.round((safe * containerWidth) / PORTFOLIO_REFERENCE_WIDTH),
  );
}

