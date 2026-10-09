export interface LayoutItem {
  id: string;
  ratio: number;
}

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface JustifiedLayout {
  boxes: LayoutBox[];
  height: number;
}

// Rows are filled until they reach the container width, then scaled so every
// row ends flush. The last, incomplete row keeps the target height instead of
// blowing a couple of photos up to full width.
export function computeJustifiedLayout(
  items: LayoutItem[],
  containerWidth: number,
  targetRowHeight: number,
  gap: number,
): JustifiedLayout {
  const boxes: LayoutBox[] = [];
  if (containerWidth <= 0 || items.length === 0) return { boxes, height: 0 };

  const maxRowHeight = targetRowHeight * 1.5;
  let y = 0;
  let row: LayoutItem[] = [];
  let ratioSum = 0;

  const placeRow = (height: number) => {
    let x = 0;
    for (const item of row) {
      const w = item.ratio * height;
      boxes.push({ id: item.id, x, y, w, h: height });
      x += w + gap;
    }
    y += height + gap;
    row = [];
    ratioSum = 0;
  };

  for (const item of items) {
    row.push(item);
    ratioSum += item.ratio;
    const gaps = gap * (row.length - 1);
    const naturalWidth = ratioSum * targetRowHeight + gaps;
    if (naturalWidth >= containerWidth) {
      placeRow(Math.min(maxRowHeight, (containerWidth - gaps) / ratioSum));
    }
  }
  if (row.length > 0) placeRow(targetRowHeight);

  return { boxes, height: Math.max(0, y - gap) };
}
