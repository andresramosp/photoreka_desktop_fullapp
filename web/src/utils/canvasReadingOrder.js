const toBox = (photo) => {
  const { x, y, height = 0 } = photo.config;
  return { photo, x, top: y, bottom: y + height, centerY: y + height / 2 };
};

// Two photos share a row when either one's vertical center falls inside the
// other's span. Comparing against the row's first photo (not a growing band)
// keeps staggered layouts from chaining every photo into a single row.
const sharesRow = (anchor, box) =>
  box.centerY <= anchor.bottom || anchor.centerY >= box.top;

/**
 * Orders canvas photos the way a page is read: rows top to bottom, and each
 * row left to right. Photos need `config.x`, `config.y` and `config.height`.
 */
export function sortByReadingOrder(photos) {
  const boxes = photos.map(toBox).sort((a, b) => a.centerY - b.centerY);

  const rows = [];
  for (const box of boxes) {
    const row = rows[rows.length - 1];
    if (row && sharesRow(row[0], box)) row.push(box);
    else rows.push([box]);
  }

  return rows.flatMap((row) =>
    row.sort((a, b) => a.x - b.x).map((box) => box.photo),
  );
}
