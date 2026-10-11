# Photoreka Desktop

Versión de escritorio de Photoreka. `App` no se modifica nunca por el escritorio.

## Estructura

- `api/` y `web/`: copias de `App/api` y `App/web` con su historial de git. Cada una tiene el remoto `upstream`, que apunta a la carpeta de `App` y solo permite traer cambios (el envío está bloqueado). `api/` tiene además el remoto `origin` (github.com/andresramosp/photoreka_gateway_api, privado), desde el que Railway despliega el servicio de la nube del escritorio.
- `electron/`: código propio del escritorio (arranque de Postgres, de la API y de la ventana).

## Sincronizar con App

En `api/` y en `web/`:

```bash
git fetch upstream
git merge upstream/main
```

Después de cada sincronización: tests de la API y prueba rápida de la app (buscar, abrir una foto, lanzar un análisis).

Reglas:

1. `App` no se toca nunca por el escritorio. Las copias de `Desktop` sí se editan y se borran libremente.
2. En archivos que App cambia a menudo, mejor sustituir que editar: cada edición es un posible conflicto al sincronizar. Lo que el escritorio no usa se borra; si App lo modifica después, el conflicto se resuelve manteniendo el borrado.
3. Lo nuevo vive en carpetas nuevas (`api/desktop/`, `web/src/desktop/`, `electron/`).
4. Un fallo que también afecta a la web se arregla en `App` y llega aquí en la siguiente sincronización. No se copia código suelto entre carpetas.
5. Si la lista de cambios crece mucho, es señal de que los productos se separan: parar y revisarlo.

## Archivos de App cambiados o borrados en la copia

| Archivo | Qué cambia | Motivo |
|---|---|---|
| `api/adonisrc.ts` | El proveedor de Redis se cambia por `api/desktop/memory_redis_provider.ts`, y se quita la precarga `picks_resume` | En local no hay servidor Redis; Picks es un producto de la nube |
| `api/package.json`, `api/package-lock.json` | Dependencia `ioredis-mock` | Redis en memoria. Si hay conflicto al sincronizar: aceptar la versión de App y volver a ejecutar `npm i ioredis-mock@8` |
| `api/package.json` (mapa `imports`) | `#services/payment_service` apunta a `api/desktop/services/payment_service.ts`, que hereda el original y responde "sin compras" | La tabla `payments` es de la nube; sin esto, el perfil falla y no hay sesión. Es el sitio donde el escritorio consultará la cuenta de la nube |
| `api/config/database.ts` | Las migraciones se leen de `desktop/migrations` | El escritorio tiene su propio esquema (ver abajo) |
| `api/database/` | Borrada | Las migraciones de App no se usan en el escritorio |
| Picks y Geo Recovery | Borrados: controladores, servicios, modelos, prompts, configuración y rutas; `payment_service` ya no les reparte los pagos de Stripe | Productos anónimos de la nube |
| Administración | Borrados los controladores, sus rutas y el middleware `admin`, y los servicios de `app/services/admin/` salvo `admin_users_service`, `admin_payments_service` y `admin_inactive_users_service`, que usa la baja de cuenta | El escritorio no tiene paneles de administración |
| Código muerto y herramientas de la nube | Borrados `vector_service_old`, `artistic_bench_service`, `cloudfare/images-worker.js` y los comandos `artistic_bench_serve`, `railway_compute_cost`, `backfill_cost_logs` y `reset_cost_data` | Sin uso en el escritorio |
| Dependencias de la API | Quitadas `@xenova/transformers` (con la ruta `/api/embeddings`, que nadie llama, y `EmbeddingService.generateEmbeddings`), `googleapis` (el login de Google usa `@googleapis/oauth2`, que ya estaba), y sin uso: `natural`, `lemmatizer`, `image-hash`, `imghash`, `blockhash-core`, `node-mailjet`, `@sendgrid/mail` | Instalador más ligero. Si App cambia `package.json`: aceptar su versión y volver a desinstalarlas |

Se mantienen a propósito, hasta decidirlos con el servicio de IA en la nube: el controlador de cuentas (aunque sus rutas de registro, contraseña, Google y demo ya no existen), el login del plugin de Lightroom contra la API local, correos, invitaciones, pagos y páginas públicas.

## Cuenta de la nube

El escritorio no tiene cuentas locales: el usuario inicia sesión con su cuenta de Photoreka en el navegador, con el mismo flujo que el plugin de Lightroom (rutas `/api/auth_lr/*` de la API de la nube, página `app.photoreka.com/lr-auth`). Lo implementan `api/desktop/services/cloud_account_service.ts`, las rutas `/api/desktop/login/start`, `/api/desktop/login/poll` y `/api/desktop/logout`, y en la web `web/src/desktop/DesktopAuthView.vue` (solo si se compila con `VITE_DESKTOP=true`).

- El usuario local tiene el mismo id que su cuenta en la nube. Al iniciar sesión, al arrancar y cada 15 minutos se copian de la nube su email confirmado, la cuota y los créditos (`users.usage`), y se guarda el último perfil en `cloud_sessions.account`.
- El token de la nube se guarda en `cloud_sessions` cifrado con AES-256-GCM. La clave la genera Electron y la protege con el cifrado del usuario de Windows (`safeStorage`), en `secret.key` de la carpeta de datos.
- Cerrar sesión revoca el token en la nube y borra la sesión local. Si la nube rechaza el token al sincronizar, la sesión local se borra.
- Pendiente en App: la página `lr-auth` habla de Lightroom; el escritorio la usa tal cual hasta que la web tenga un texto genérico.
- Pendiente en producción: una prueba del 2026-10-11 dejó un token de escritorio sin uso de la cuenta de Andrés en `auth_access_tokens` (nombre nulo, sin caducidad). Revocarlo desde la administración.

## Servicio de la nube del escritorio (modo gateway)

La misma API de `api/` arranca como servicio de la nube con `PHOTOREKA_MODE=gateway` (ver `api/desktop/mode.ts` y `api/adonisrc.ts`). En ese modo usa el Redis de verdad, trabaja contra la base de producción y **no aplica migraciones ni ejecuta sockets, eventos ni el borrado programado de fotos**; solo expone las rutas `/gateway` (`api/desktop/gateway/`), autenticadas con el token de la cuenta de la nube.

- `/gateway/compute`: métodos de cálculo de ModelsService (Python, RunPod), con lista blanca en `api/desktop/gateway_methods.ts`.
- `/gateway/analysis`: funciones del análisis. El escritorio manda paquete, tarea, perfil e imágenes; el servicio reconstruye la tarea desde `analyzer_packages.ts`, compone allí el prompt y el esquema, comprueba que el modelo es el de la tarea y que queda cuota, y registra el coste (`photo_analysis`) en `cost_logs` de producción. Los lotes de OpenAI quedan asociados a su dueño en Redis durante 7 días.
- `/gateway/uploads/sign`: firma las subidas a R2 si la clave es del usuario.
- `/gateway/quota/check` y `/gateway/quota/consume`: cuota de análisis de la cuenta.

En el escritorio, `api/desktop/cloud_bridge.ts` redirige al servicio el cálculo, las tareas de descripción y tags, la firma de subidas y la cuota, y hace fallar cualquier llamada directa a un modelo de lenguaje. La dirección del servicio es `PHOTOREKA_GATEWAY`.

Pendiente: la cuota se descuenta al terminar el análisis, como en la web; una app local manipulada podría no avisar. Cerrarlo con reservas por proceso en el servicio.

## Base de datos del escritorio

Las migraciones de `api/desktop/migrations/` sustituyen a las de App. Crean solo las tablas locales: el catálogo del usuario (fotos, tags, descripciones, colecciones, series, conversaciones, canvas, portfolios), su usuario y sus cachés. Reproducen esas tablas exactamente como quedan tras las migraciones de App hasta `1786400000000_add_duplicate_of_to_picks_photos`, más la columna `users.username`, que producción tiene sin migración. De los índices HNSW solo se crea el de tags: medido con el catálogo mayor (60.000 fotos), emparejar cada tag del análisis baja de ~180 ms a ~5 ms; en descripciones y fotos la búsqueda exacta tarda ~0,3 s y no compensa.

No están, porque su sitio es la nube: invitaciones, pagos, actividad de usuarios, auditoría de subidas, Geo Recovery y Picks.

Provisionales (`1790000000008_provisional_cloud_tables`): `cost_logs`, `public_items` y `geocoding_monthly_usage`. El código actual las usa en flujos normales; se quitan cuando el cobro, la publicación y la geocodificación pasen a la nube.

Al sincronizar, las migraciones nuevas de App reaparecen en `api/database/migrations/`. Para cada una:

- Si toca una tabla local: escribir la equivalente en `api/desktop/migrations/` con un número posterior al último.
- Si solo toca tablas de nube: no se porta.
- Después, borrarla de `api/database/migrations/` y actualizar aquí la última migración de App cubierta.

Pendiente de portar en cuanto llegue: `1786500000000_add_parent_id_index_to_tags_photos` (está en App sin confirmar; toca `tags_photos`).

## Pendientes conocidos

- Las migraciones de App no construyen una base desde cero, aunque en sus bases nunca fallaron porque se aplicaron en otro orden: `1742052000000_simplify_user_activities_table` modifica una tabla que crea una migración posterior, `1770000000000_create_invites_table` usa `onDelete('setNull')`, que Postgres rechaza, y `1782500000000_drop_photos_granted_from_payments` borra una columna que no existe. No afecta al escritorio, que tiene sus propias migraciones.
- El arranque de la API (`start/kernel.ts`) informa de éxito aunque una migración falle.
- Producción tiene cosas que ninguna migración de App crea: la columna `users.username` (varchar 50, única), que el modelo User usa y el escritorio sí incluye, y la tabla `share_links`, vacía y sin uso en el código, que el escritorio no incluye.
- El worker de imágenes solo acepta el Referer de photoreka.com; Electron lo reescribe de forma provisional.
- Revisar en el escritorio el programador de borrado de fotos (`start/photo_deletion_scheduler`): cada 12 horas borra fotos y barre huérfanas, también en R2.
- La carga del catálogo devuelve todo el catálogo en un JSON (63 MB y 6,6 s la primera vez con 60.000 fotos). Afecta igual a la web.
- Un usuario registrado en local queda sin email confirmado, sin créditos y sin cuota de análisis: vienen de la cuenta de la nube (fase 1).

## Instalador

`npm run dist` en `electron/` (antes: `build:api`, `build:web` y `prepare:postgres`). Genera `electron/dist/Photoreka Setup <versión>.exe`: instalación por usuario, sin permisos de administrador. La API viaja con sus dependencias de producción, podadas (sin tipos, mapas, documentación, tests ni las herramientas de compilación de Adonis) y empaquetadas en un solo `api.asar`; los binarios nativos de sharp van aparte en `api.asar.unpacked`. Todo lo prepara `scripts/stage-api.mjs`, y `scripts/after-pack.cjs` lo copia porque electron-builder excluye siempre `node_modules` de `extraResources`.

Probado el 2026-10-11 en Windows 11, con PATH mínimo y rutas no ASCII (ver `ansiSafePath` en `src/postgres.mjs`):

- Instalador de 203 MB; instalado ocupa 606 MB en ~1.900 archivos. Instalar tarda ~26 s y desinstalar ~9 s.
- Primer arranque ~11 s (incluye crear la base); los siguientes ~3 s.
- Tras un cierre brusco, el siguiente arranque detecta y para el Postgres que quedó vivo.
- Desinstalar deja los datos del usuario en `%APPDATA%\Photoreka`.

## Desarrollo

- `node scripts/import-dump.mjs <copia>`: base de pruebas con el usuario de más fotos de una copia de producción.
- `node scripts/dev-token.mjs`: sesión de pruebas para ese usuario; la ventana la usa en modo desarrollo si no hay otra sesión. Para ver la pantalla de login, renombrar `data/runtime/dev-token.txt`.
- Crear `data/runtime/capture.request` guarda en `data/runtime/window.png` lo que muestra la ventana.
- `node scripts/bench-db.mjs`: mide las consultas vectoriales con y sin HNSW.
