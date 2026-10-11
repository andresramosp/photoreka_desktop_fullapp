# Photoreka Desktop

Versión de escritorio de Photoreka. `App` no se modifica nunca por el escritorio.

## Estructura

- `api/` y `web/`: copias de `App/api` y `App/web` con su historial de git. Cada una tiene el remoto `upstream`, que apunta a la carpeta de `App` y solo permite traer cambios (el envío está bloqueado).
- `electron/`: código propio del escritorio (arranque de Postgres, de la API y de la ventana).

## Sincronizar con App

En `api/` y en `web/`:

```bash
git fetch upstream
git merge upstream/main
```

Después de cada sincronización: tests de la API y prueba rápida de la app (buscar, abrir una foto, lanzar un análisis).

Reglas:

1. Los archivos de `App` no se editan para el escritorio: se sustituyen por un archivo nuevo. La única zona de conflicto es la lista de abajo.
2. Lo nuevo vive en carpetas nuevas (`api/desktop/`, `web/src/desktop/`, `electron/`).
3. Un fallo que también afecta a la web se arregla en `App` y llega aquí en la siguiente sincronización. No se copia código suelto entre carpetas.
4. Si la lista de sustituciones crece mucho, es señal de que los productos se separan: parar y revisarlo.

## Archivos de App sustituidos o tocados

| Archivo | Qué cambia | Motivo |
|---|---|---|
| `api/adonisrc.ts` | El proveedor de Redis se cambia por `api/desktop/memory_redis_provider.ts`, y se quita la precarga `picks_resume` | En local no hay servidor Redis; Picks es un producto de la nube |
| `api/package.json`, `api/package-lock.json` | Dependencia `ioredis-mock` | Redis en memoria. Si hay conflicto al sincronizar: aceptar la versión de App y volver a ejecutar `npm i ioredis-mock@8` |
| `api/package.json` (mapa `imports`) | `#services/payment_service` apunta a `api/desktop/services/payment_service.ts`, que hereda el original y responde "sin compras" | La tabla `payments` es de la nube; sin esto, el perfil falla y no hay sesión. Es el sitio donde el escritorio consultará la cuenta de la nube |
| `api/config/database.ts` | Las migraciones se leen de `desktop/migrations` | El escritorio tiene su propio esquema (ver abajo) |

## Base de datos del escritorio

Las migraciones de `api/desktop/migrations/` sustituyen a las de App. Crean solo las tablas locales: el catálogo del usuario (fotos, tags, descripciones, colecciones, series, conversaciones, canvas, portfolios), su usuario y sus cachés. Reproducen esas tablas exactamente como quedan tras las migraciones de App hasta `1786400000000_add_duplicate_of_to_picks_photos`, más la columna `users.username`, que producción tiene sin migración. De los índices HNSW solo se crea el de tags: medido con el catálogo mayor (60.000 fotos), emparejar cada tag del análisis baja de ~180 ms a ~5 ms; en descripciones y fotos la búsqueda exacta tarda ~0,3 s y no compensa.

No están, porque su sitio es la nube: invitaciones, pagos, actividad de usuarios, auditoría de subidas, Geo Recovery y Picks.

Provisionales (`1790000000008_provisional_cloud_tables`): `cost_logs`, `public_items` y `geocoding_monthly_usage`. El código actual las usa en flujos normales; se quitan cuando el cobro, la publicación y la geocodificación pasen a la nube.

Al sincronizar, revisar las migraciones nuevas de App:

```bash
git diff --name-only --diff-filter=A ORIG_HEAD HEAD -- database/migrations
```

- Si tocan una tabla local: escribir la equivalente en `api/desktop/migrations/` con un número posterior al último.
- Si solo tocan tablas de nube: no se portan.
- Actualizar aquí la última migración de App cubierta.

Pendiente de portar en cuanto llegue: `1786500000000_add_parent_id_index_to_tags_photos` (está en App sin confirmar; toca `tags_photos`).

## Pendientes conocidos

- Las migraciones de App no construyen una base desde cero, aunque en sus bases nunca fallaron porque se aplicaron en otro orden: `1742052000000_simplify_user_activities_table` modifica una tabla que crea una migración posterior, `1770000000000_create_invites_table` usa `onDelete('setNull')`, que Postgres rechaza, y `1782500000000_drop_photos_granted_from_payments` borra una columna que no existe. No afecta al escritorio, que tiene sus propias migraciones.
- El arranque de la API (`start/kernel.ts`) informa de éxito aunque una migración falle.
- Producción tiene cosas que ninguna migración de App crea: la columna `users.username` (varchar 50, única), que el modelo User usa y el escritorio sí incluye, y la tabla `share_links`, vacía y sin uso en el código, que el escritorio no incluye.
- El worker de imágenes solo acepta el Referer de photoreka.com; Electron lo reescribe de forma provisional.
- Revisar en el escritorio el programador de borrado de fotos (`start/photo_deletion_scheduler`): cada 12 horas borra fotos y barre huérfanas, también en R2.
- La carga del catálogo devuelve todo el catálogo en un JSON (63 MB y 6,6 s la primera vez con 60.000 fotos). Afecta igual a la web.

## Desarrollo

- `node scripts/import-dump.mjs <copia>`: base de pruebas con el usuario de más fotos de una copia de producción.
- `node scripts/dev-token.mjs`: sesión de pruebas para ese usuario; la ventana la usa en modo desarrollo.
- Crear `data/runtime/capture.request` guarda en `data/runtime/window.png` lo que muestra la ventana.
- `node scripts/bench-db.mjs`: mide las consultas vectoriales con y sin HNSW.
