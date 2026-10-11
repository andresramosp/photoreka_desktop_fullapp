// Deja en resources/models los modelos que la API del escritorio ejecuta en local:
// - hf/: MiniLM (all-MiniLM-L6-v2) y el tokenizador de CLIP, de Hugging Face.
// - clip/: CLIP de texto e imagen exportado del servicio Python (scripts/export_clip.py), para que
//   los vectores sean idénticos a los de la nube.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const target = path.resolve(here, '../resources/models')
const pylibs = path.resolve(here, '../.cache/pylibs')
const python = process.env.PHOTOREKA_EXPORT_PYTHON || path.resolve(here, '../../../App/python_cpu/venv/Scripts/python.exe')

// Misma versión de la librería que usa la API, para que tokenizadores y formatos coincidan.
const require = createRequire(path.resolve(here, '../../api/package.json'))
const loaded = await import(pathToFileURL(require.resolve('@huggingface/transformers')).href)
const transformers = loaded.env ? loaded : loaded.default
transformers.env.cacheDir = path.join(target, 'hf')
await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' })
await transformers.AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch32')
console.log('MiniLM y tokenizador de CLIP listos')

const clipDir = path.join(target, 'clip')
if (!['clip_text.onnx', 'clip_image.onnx'].every((f) => fs.existsSync(path.join(clipDir, f)))) {
  if (!fs.existsSync(python)) throw new Error(`No encuentro el Python de exportación: ${python} (variable PHOTOREKA_EXPORT_PYTHON)`)
  fs.mkdirSync(clipDir, { recursive: true })
  if (!fs.existsSync(path.join(pylibs, 'onnx'))) {
    // onnx en una carpeta aparte: no se instala nada en el entorno de Python de App.
    execFileSync(python, ['-I', '-m', 'pip', 'install', '-q', '--no-deps', '--target', pylibs, 'onnx==1.19.1', 'protobuf==6.32.1', 'ml_dtypes==0.5.3'], { stdio: 'inherit' })
  }
  execFileSync(python, ['-I', path.join(here, 'export_clip.py'), clipDir, pylibs], { stdio: 'inherit' })
}
console.log(`Modelos preparados en ${target}`)
