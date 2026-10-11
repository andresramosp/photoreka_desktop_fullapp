# Photoreka Desktop

Versión de escritorio de Photoreka. `App` no se modifica nunca por el escritorio.

## Estructura

- `api/` y `web/`: copias de `App/api` y `App/web` con su historial de git. Cada una tiene el remoto `upstream`, que apunta a la carpeta de `App` y solo permite traer cambios (el envío está bloqueado).
- `gateway/`: servicio de la nube del escritorio, otra copia recortada de `App/api` (ver su README). Además de `upstream` tiene el remoto `origin` (github.com/andresramosp/photoreka_gateway_api, privado), desde el que Railway lo despliega. La rama `respaldo-api-local` de ese repositorio guarda la versión anterior, en la que el servicio era un modo de `api/`.
- `electron/`: código propio del escritorio (arranque de Postgres, de la API y de la ventana).

## Sincronizar con App

En `api/`, `web/` y `gateway/` (este con sus propias reglas, en su README):

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
| `api/app/services/models_service.ts` | Reescrito: vectores en local, el resto del cálculo por la nube y nada de proveedores de modelos ni RunPod. Conserva los tipos, precios y utilidades que importan otros archivos | Ver "Servicio de la nube del escritorio". Al sincronizar, los cambios de App en este archivo van a `gateway/` y aquí se descartan |
| Tareas de análisis (`visionDescriptionTask.ts`, `tagTask.ts`, `analyzerTask.ts`) y `analyzer_packages.ts` | Llaman a las funciones de `api/desktop/cloud_functions.ts` sin prompt ni esquema; la configuración de paquetes ya no lleva prompts, y la tarea artística marca `keyedResponse` en lugar de su esquema | El servicio compone los prompts con su copia de la configuración, que debe coincidir en nombres de tareas y modelos |
| Prompts del análisis | Borrados `visual_aspects.ts` y `visual_scores.ts`, y los prompts del análisis de `descriptions.ts` y `tags.ts` (quedan los de informes y notas) | Viven en `gateway/` |
| `catalog_controller.ts` y `usage_service.ts` | Las fotos se suben a la carpeta `desktop/` de R2 con URLs que firma la nube, y la cuota de análisis se consulta y descuenta en la nube | El escritorio no tiene el secreto del worker de subida, y la cuota es de la cuenta |
| Sin uso | Borrados la tarea de detección de objetos (ningún paquete la usa), RunPod (`runpod_service`, la ruta `/api/warmUp` y sus decoradores) y `jsonUtils` | |
| Dependencias de la API | Quitadas `@xenova/transformers` (con la ruta `/api/embeddings`, que nadie llama, y `EmbeddingService.generateEmbeddings`), `googleapis` (el login de Google usa `@googleapis/oauth2`, que ya estaba), y sin uso: `natural`, `lemmatizer`, `image-hash`, `imghash`, `blockhash-core`, `node-mailjet`, `@sendgrid/mail`, `@anthropic-ai/sdk`, `@aws-sdk/credential-providers`, `@aws-sdk/s3-request-presigner`, `form-data`, `jsonwebtoken`, `munkres-js` y los tipos de `jsonwebtoken` y `nodemailer` | Instalador más ligero. Si App cambia `package.json`: aceptar su versión y volver a desinstalarlas |

Se mantienen a propósito, hasta decidirlos con el servicio de IA en la nube: el controlador de cuentas (aunque sus rutas de registro, contraseña, Google y demo ya no existen), el login del plugin de Lightroom contra la API local, correos, invitaciones, pagos y páginas públicas.

## Cuenta de la nube

El escritorio no tiene cuentas locales: el usuario inicia sesión con su cuenta de Photoreka en el navegador, con el mismo flujo que el plugin de Lightroom (rutas `/api/auth_lr/*` de la API de la nube, página `app.photoreka.com/lr-auth`). Lo implementan `api/desktop/services/cloud_account_service.ts`, las rutas `/api/desktop/login/start`, `/api/desktop/login/poll` y `/api/desktop/logout`, y en la web `web/src/desktop/DesktopAuthView.vue` (solo si se compila con `VITE_DESKTOP=true`).

- El usuario local tiene el mismo id que su cuenta en la nube. Al iniciar sesión, al arrancar y cada 15 minutos se copian de la nube su email confirmado, la cuota y los créditos (`users.usage`), y se guarda el último perfil en `cloud_sessions.account`.
- El token de la nube se guarda en `cloud_sessions` cifrado con AES-256-GCM. La clave la genera Electron y la protege con el cifrado del usuario de Windows (`safeStorage`), en `secret.key` de la carpeta de datos.
- Cerrar sesión revoca el token en la nube y borra la sesión local. Si la nube rechaza el token al sincronizar, la sesión local se borra.
- Pendiente en App: la página `lr-auth` habla de Lightroom; el escritorio la usa tal cual hasta que la web tenga un texto genérico.
- Pendiente en producción: una prueba del 2026-10-11 dejó un token de escritorio sin uso de la cuenta de Andrés en `auth_access_tokens` (nombre nulo, sin caducidad). Revocarlo desde la administración.

## Servicio de la nube del escritorio

Es el proyecto `gateway/`, desplegado en Railway (su README explica qué hace). La API local solo sale a la nube por dos sitios: el inicio de sesión y la sincronización de la cuenta (`api/desktop/services/cloud_account_service.ts`), y las funciones con nombre de `api/desktop/cloud_functions.ts`, que es donde se ve todo lo que se le pide al servicio:

- Análisis: describir imágenes (Gemini, OpenAI, Qwen), extraer tags y los lotes diferidos de OpenAI. Solo viajan la identidad de la tarea (paquete, nombre, perfil), el modelo y los datos; el prompt y el esquema los compone el servicio, que además comprueba el modelo y la cuota y registra el coste.
- Cálculo aún no portado: histogramas de color, UMAP y clusters.
- Firma de subidas a R2, y consulta y descuento de la cuota de análisis.

Cada llamada va con el token de la cuenta de la nube del usuario. La dirección del servicio es `PHOTOREKA_GATEWAY`.

Todavía llaman a modelos de lenguaje desde la API local, sin función de la nube: búsqueda, chat, informes y revisión, portfolios, inferencia de ubicación, tags de notas y canvas sugeridos. En el escritorio fallan con un aviso (`ModelsService` lo da en sus métodos `getGPTResponse`, `getGeminiResponse` y `getJevResponse`). Cada una pasará a su propia función del servicio, y sus prompts se irán con ella. El chat es un caso aparte, porque llama a los proveedores a través de LangChain.

Los costes son cosa de la administración y del cobro de créditos, así que se registran solo en la nube. El análisis ya no registra costes en local, ni mide el consumo de Railway. Las demás funciones con modelos de lenguaje aún calculan su coste en local, porque de él sale el cobro de créditos; se les quita al portarlas, y después se borran la tabla `cost_logs` y la columna `users.cost_history`.

Las fotos del escritorio se guardan en R2 en su propia carpeta, desktop/main/<id>/ y desktop/thumbs/<id>/, y el servicio solo firma claves de esa carpeta: así ninguna limpieza de la nube que recorra main/<id>/ contra la base de producción puede tocarlas.

Pendiente: borrar fotos desde el escritorio no borra sus archivos en R2 (no tiene credenciales); hará falta una ruta del servicio. El worker de subida solo anota el dueño en los metadatos de main/ y thumbs/ (cambio pequeño en App).

Pendiente: la cuota se descuenta al terminar el análisis, como en la web; una app local manipulada podría no avisar. Cerrarlo con reservas por proceso en el servicio.

## Modelos locales (sin Python)

El escritorio calcula en la API, con ONNX, los vectores que en la nube calcula el servicio Python (`api/desktop/ml/local_models.ts`), con resultados idénticos:

- Texto MiniLM (`Xenova/all-MiniLM-L6-v2`, media de tokens normalizada).
- Texto e imagen CLIP, exportados del propio servicio Python con `electron/scripts/export_clip.py`. Su open_clip (3.2.0) carga los pesos de OpenAI con activación GELU en lugar de QuickGELU, así que el CLIP ONNX público no coincide (similitud 0,77–0,97). La imagen se redimensiona con una réplica del bicúbico de Pillow (`api/desktop/ml/pil_resize.ts`); con sharp quedaban diferencias de hasta 0,98.
- Validado el 2026-10-11 contra vectores de producción: 300 fragmentos, 300 tags y 100 fotos, todos idénticos (coseno 1,000000).

`npm run prepare:models` en `electron/` deja los modelos en `electron/resources/models` (668 MB): MiniLM y el tokenizador de CLIP de Hugging Face, y el CLIP exportado con el Python de `App/python_cpu` (variable `PHOTOREKA_EXPORT_PYTHON`; `onnx` se instala aparte en `electron/.cache/pylibs`, sin tocar ese entorno). Las versiones de `@huggingface/transformers` (3.8.1) y `onnxruntime-node` (1.21.0) están fijadas.

Sigue en la nube, hasta portarlo: histogramas de color, UMAP (atlas 3D, nube de tags) y clusters (revisión de informes).

Recomendación para App: fijar `open_clip_torch==3.2.0` en `python_cpu/requirements.txt`. Si una versión nueva corrigiera la activación, los vectores CLIP nuevos dejarían de coincidir con los guardados.

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

- Instalador de 714 MB con los modelos (203 MB sin ellos); instalado ocupa 1,5 GB en ~2.050 archivos. Instalar tarda ~70 s y desinstalar ~9 s.
- Primer arranque ~11 s (incluye crear la base); los siguientes ~3 s.
- Tras un cierre brusco, el siguiente arranque detecta y para el Postgres que quedó vivo.
- Desinstalar deja los datos del usuario en `%APPDATA%\Photoreka`.

## Desarrollo

- La app instalada y la de desarrollo comparten la carpeta de datos de Electron (`%APPDATA%\Photoreka`), donde está la clave de `safeStorage` de la que depende `secret.key`. No borrar esa carpeta entera al limpiar pruebas: solo lo que crea la app instalada (`pgdata`, `secret.key`, registros). No pueden estar abiertas a la vez.

- `node scripts/import-dump.mjs <copia>`: base de pruebas con el usuario de más fotos de una copia de producción.
- `node scripts/dev-token.mjs`: sesión de pruebas para ese usuario; la ventana la usa en modo desarrollo si no hay otra sesión. Para ver la pantalla de login, renombrar `data/runtime/dev-token.txt`.
- Crear `data/runtime/capture.request` guarda en `data/runtime/window.png` lo que muestra la ventana.
- `node scripts/bench-db.mjs`: mide las consultas vectoriales con y sin HNSW.
