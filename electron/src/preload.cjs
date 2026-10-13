// Puente mínimo entre la web y el sistema: la ruta en disco de los archivos que importa el usuario
// y las acciones sobre originales que solo puede hacer Electron. CommonJS porque la ventana va
// con sandbox, donde el preload no puede ser un módulo ES.
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('photorekaDesktop', {
  platform: process.platform,
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  },
  showOriginal: (filePath) => ipcRenderer.invoke('originals:show', filePath),
  openOriginal: (filePath) => ipcRenderer.invoke('originals:open', filePath),
  chooseFile: (previousPath) => ipcRenderer.invoke('originals:choose-file', previousPath),
  chooseFolder: () => ipcRenderer.invoke('originals:choose-folder'),
})
