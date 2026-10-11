// Paso afterPack de electron-builder: copia la API preparada (stage/api.asar y los binarios
// nativos de api.asar.unpacked). electron-builder excluye siempre node_modules de
// extraResources, y api.asar.unpacked los contiene, así que no puede ir por ahí.
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const stage = path.resolve(__dirname, '../stage')
  const resources = path.join(context.appOutDir, 'resources')
  for (const name of ['api.asar', 'api.asar.unpacked']) {
    fs.rmSync(path.join(resources, name), { recursive: true, force: true })
    fs.cpSync(path.join(stage, name), path.join(resources, name), { recursive: true })
  }
}
