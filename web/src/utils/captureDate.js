// Fecha de captura (EXIF dateTaken): reloj de pared SIN zona real. Segun la via de
// subida llega como "YYYY-MM-DD HH:MM:SS" (naive, ingesta web), "YYYY:MM:DD HH:MM:SS"
// (EXIF nativo) o ISO con Z/offset (otra via). Para que el usuario lo vea TODO coherente
// —el dato en el dialogo, el histograma y el slider, y que foto entra en cada rango—
// hay que leerlo a valor nominal con UNA convencion, la MISMA que el back
// (api/app/utils/exif_fields.parseExifDateTakenMs): los componentes naive se montan
// sobre UTC; un ISO con zona se respeta tal cual. Al formatear, usar timeZone:"UTC"
// para no dejar que la zona del navegador desplace una toma crepuscular al dia vecino.
export function parseCaptureMs(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw);

  // EXIF nativo: "YYYY:MM:DD HH:MM:SS" (dos puntos en la fecha).
  let m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
    return Number.isNaN(t) ? null : t;
  }
  // Normalizado por la ingesta web: "YYYY-MM-DD HH:MM:SS" (espacio, sin zona).
  m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (m) {
    const t = Date.parse(`${m[1]}T${m[2]}Z`);
    return Number.isNaN(t) ? null : t;
  }
  // ISO con zona (Z u offset): instante real, sin reinterpretar.
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}
