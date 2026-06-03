import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "dist");

const HASHED_ASSET_RE =
  /\.[0-9a-f]{8}\.(js|css|svg|png|jpg|jpeg|gif|webp|ico|woff2?|map)$/i;
const NO_CACHE_FILES_RE =
  /^(index\.html|version\.json|manifest\.webmanifest|manifest\.json|sw\.js|service-worker\.js|workbox-.*\.js)$/i;

app.use(
  express.static(DIST, {
    etag: false,
    lastModified: false,
    maxAge: 0,
    setHeaders(res, filePath) {
      const base = path.basename(filePath);

      if (NO_CACHE_FILES_RE.test(base)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        return;
      }

      if (HASHED_ASSET_RE.test(base)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

app.get("*", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Photoreka web server listening on port ${PORT}`);
});
