// Paso afterPack de electron-builder: copia la API preparada (stage/api) con sus node_modules.
// electron-builder excluye siempre node_modules de extraResources, así que no puede ir por ahí.
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function afterPack(context) {
  const from = path.resolve(__dirname, '../stage/api')
  const to = path.join(context.appOutDir, 'resources', 'api')
  fs.rmSync(to, { recursive: true, force: true })
  fs.cpSync(from, to, { recursive: true })
}
