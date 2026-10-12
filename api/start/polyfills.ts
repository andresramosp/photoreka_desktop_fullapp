/*
|--------------------------------------------------------------------------
| Polyfills de entorno
|--------------------------------------------------------------------------
|
| Se cargan antes que nada para tapar diferencias entre el Node de desarrollo
| y el de producción.
|
*/

import { webcrypto } from 'node:crypto'

/**
 * `globalThis.crypto` (Web Crypto) no existe sin flag hasta Node 19.
 *
 * @langchain/core 1.2.x dejó de depender del paquete `uuid` y vendoriza su propio
 * generador en `dist/utils/uuid/`, que llama a `crypto.getRandomValues()` y a
 * `crypto.randomUUID()` SIN importarlos — cuenta con que existan como global. Ese
 * generador se usa para el id de cada ejecución del callback manager, o sea en TODA
 * llamada a un modelo, sea del proveedor que sea. En un Node sin el global, cualquier
 * `.invoke()` muere con `ReferenceError: crypto is not defined`.
 *
 * No se veía en local (Node 22 lo trae de serie) y sí en producción, que va por
 * detrás. El arreglo de fondo es subir el Node de producción a >= 20; esto es la
 * red de seguridad para que la versión de Node deje de ser una dependencia oculta
 * del chat.
 *
 * Es no-op en Node 19+. `webcrypto` cubre `getRandomValues` en todas las versiones
 * afectadas; `randomUUID` puede faltar en las más antiguas, pero el generador de
 * LangChain ya comprueba su existencia y cae a `getRandomValues`.
 */
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    enumerable: false,
    writable: false,
  })
}
