import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import {
  buildPortfolioRows,
  PORTFOLIO_DEFAULT_RATIO,
} from "./portfolioGridLayout";

/**
 * Load an image and return its dataURL + aspect ratio.
 * Uses a canvas to convert so jsPDF can embed it. Requires CORS-enabled source.
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        resolve({
          dataUrl,
          ratio:
            img.naturalWidth / img.naturalHeight || PORTFOLIO_DEFAULT_RATIO,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}

/**
 * Decide the page orientation automatically when requested.
 * Heuristic: many columns tend to produce wide, short rows → landscape fits better.
 */
function resolveOrientation(orientation, columns) {
  if (orientation === "portrait" || orientation === "landscape") {
    return orientation;
  }
  // 'auto'
  return columns >= 5 ? "landscape" : "portrait";
}

/**
 * Export the portfolio grid to a PDF preserving the web layout:
 * same column count, same justified-row layout, proportional gap.
 * The layout is paginated across as many PDF pages as needed.
 *
 * @param {Object} opts
 * @param {Array}  opts.photos           Ordered photos [{ id, thumbnailUrl, originalUrl }]
 * @param {number} opts.columns          Columns per row
 * @param {number} opts.gap              Gap in px (as used on web)
 * @param {number} opts.containerWidthPx Width in px of the grid container on web (used to scale gap)
 * @param {boolean} [opts.fillAvailableSpace=true]
 * @param {'auto'|'portrait'|'landscape'} [opts.orientation='auto']
 * @param {string} [opts.filename='portfolio.pdf']
 * @param {string} [opts.pageFormat='a4']
 * @param {number} [opts.marginMm=10]
 * @param {(info:{loaded:number,total:number})=>void} [opts.onProgress]
 */
export async function exportPortfolioToPdf({
  photos,
  columns,
  gap,
  containerWidthPx,
  fillAvailableSpace = true,
  orientation = "auto",
  filename = "portfolio.pdf",
  pageFormat = "a4",
  marginMm = 10,
  onProgress,
}) {
  if (!Array.isArray(photos) || photos.length === 0) {
    throw new Error("No photos to export");
  }
  if (!containerWidthPx || containerWidthPx <= 0) {
    // Fallback to a reasonable value to keep gap proportions sane.
    containerWidthPx = 1400;
  }

  const finalOrientation = resolveOrientation(orientation, columns);

  const pdf = new jsPDF({
    orientation: finalOrientation,
    unit: "mm",
    format: pageFormat,
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const availableWidth = pageWidth - marginMm * 2;
  const availableHeight = pageHeight - marginMm * 2;

  // Scale gap proportionally from px to mm based on the web container width.
  const gapMm = (gap / containerWidthPx) * availableWidth;

  // Pre-load all images (sequentially to limit memory spikes on big sets).
  const loaded = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const url = p.originalUrl || p.thumbnailUrl;
    try {
      const { dataUrl, ratio } = await loadImage(url);
      loaded.push({ id: p.id, dataUrl, ratio });
    } catch (err) {
      console.warn("[portfolioPdfExport] failed to load image", p.id, err);
      loaded.push({ id: p.id, dataUrl: null, ratio: PORTFOLIO_DEFAULT_RATIO });
    }
    onProgress?.({ loaded: i + 1, total: photos.length });
  }

  const rows = buildPortfolioRows({
    photos: loaded,
    columns,
    gap: gapMm,
    containerWidth: availableWidth,
    fillAvailableSpace,
    defaultRatio: PORTFOLIO_DEFAULT_RATIO,
    getAspectRatio: (photo) => photo.ratio,
  });

  // Paginate: lay rows top-to-bottom, inserting page breaks when they overflow.
  let cursorY = marginMm;
  let cursorX = marginMm;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isFirstRowOnPage = cursorY === marginMm;
    const spaceNeeded = row.rowHeight + (isFirstRowOnPage ? 0 : gapMm);

    if (
      !isFirstRowOnPage &&
      cursorY + spaceNeeded > marginMm + availableHeight
    ) {
      pdf.addPage();
      cursorY = marginMm;
    } else if (!isFirstRowOnPage) {
      cursorY += gapMm;
    }

    // If a single row is taller than a page (extreme case), scale it down to fit.
    let drawRowHeight = row.rowHeight;
    let drawWidths = row.ratios.map((ratio) => ratio * row.rowHeight);
    if (drawRowHeight > availableHeight) {
      const scale = availableHeight / drawRowHeight;
      drawRowHeight = availableHeight;
      drawWidths = drawWidths.map((w) => w * scale);
    }

    cursorX = marginMm;
    for (let c = 0; c < row.photos.length; c++) {
      const photo = row.photos[c];
      const w = drawWidths[c];
      if (photo.dataUrl) {
        try {
          pdf.addImage(
            photo.dataUrl,
            "JPEG",
            cursorX,
            cursorY,
            w,
            drawRowHeight,
            undefined,
            "FAST",
          );
        } catch (err) {
          console.warn("[portfolioPdfExport] addImage failed", photo.id, err);
        }
      } else {
        // Placeholder rectangle for failed images
        pdf.setDrawColor(200);
        pdf.setFillColor(240);
        pdf.rect(cursorX, cursorY, w, drawRowHeight, "FD");
      }
      cursorX += w + gapMm;
    }

    cursorY += drawRowHeight;
  }

  pdf.save(filename);
}

/**
 * Export the portfolio grid to a JPEG file by capturing the rendered DOM.
 * Produces a single high-resolution image matching the on-screen layout exactly.
 *
 * @param {Object} opts
 * @param {HTMLElement} opts.gridElement  The grid wrapper DOM element to capture
 * @param {string}  [opts.filename='portfolio.jpg']
 * @param {number}  [opts.scale=2]         Device-pixel scale factor (2 = 2×/retina)
 * @param {number}  [opts.quality=0.92]    JPEG quality 0–1
 */
export async function exportPortfolioToJpeg({
  gridElement,
  filename = "portfolio.jpg",
  scale = 2,
  quality = 0.92,
}) {
  if (!gridElement) throw new Error("No grid element provided");

  const canvas = await html2canvas(gridElement, {
    scale,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas toBlob returned null"));
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      },
      "image/jpeg",
      quality,
    );
  });
}
