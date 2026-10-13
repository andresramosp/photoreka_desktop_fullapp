import fs from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell } from 'electron'

// Acciones sobre los originales en el disco, para el preload (preload.cjs). Solo atienden a la
// web propia y solo sobre imágenes que existen: openPath abre con la aplicación predeterminada
// y nunca debe lanzar un ejecutable.
const ORIGINAL_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

const isExistingImage = (filePath) =>
  typeof filePath === 'string' &&
  path.isAbsolute(filePath) &&
  ORIGINAL_EXTENSIONS.has(path.extname(filePath).toLowerCase()) &&
  fs.existsSync(filePath)

export function registerOriginalsActions({ webOrigin, getWindow }) {
  const handle = (channel, handler) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!event.senderFrame?.url.startsWith(`${webOrigin}/`)) return null
      return handler(...args)
    })

  handle('originals:show', (filePath) => {
    if (!isExistingImage(filePath)) return false
    shell.showItemInFolder(filePath)
    return true
  })
  handle('originals:open', async (filePath) => {
    if (!isExistingImage(filePath)) return false
    return (await shell.openPath(filePath)) === ''
  })
  // Empieza en la carpeta donde estaba el original, si sigue existiendo.
  handle('originals:choose-file', async (previousPath) => {
    const folder = typeof previousPath === 'string' && path.isAbsolute(previousPath) ? path.dirname(previousPath) : null
    const result = await dialog.showOpenDialog(getWindow(), {
      properties: ['openFile'],
      defaultPath: folder && fs.existsSync(folder) ? folder : undefined,
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  handle('originals:choose-folder', async () => {
    const result = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
