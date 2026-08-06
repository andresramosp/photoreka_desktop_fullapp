import { test } from '@japa/runner'
import {
  smoothScores,
  median,
  buildCliques,
  formatLikeSample,
  isExactSimilarityGroup,
  type SmoothingNode,
} from '../../app/utils/score_smoothing_math.js'
import { dhashCompare } from '../../app/utils/dhash_compare.js'
import { isConfirmedSameCapture, isSameShot } from '../../app/utils/score_smoothing_metadata.js'
import {
  HUE_BINS,
  SAT_BINS,
  chromaticProfile,
  histogramIntersection,
  isSameColorGrade,
  parseColorHistogram,
  unsaturatedMass,
} from '../../app/utils/score_smoothing_color.js'
import {
  CRITERION_PROFILES,
  SMOOTHING_CONFIG,
  getCriterionProfile,
  type ResolvedCriterionProfile,
} from '../../config/score_smoothing.js'

/**
 * Construye un grupo de casi-duplicados totalmente conectado. El último valor
 * representa la foto que "llega nueva" al grupo.
 */
function buildGroup(key: string, values: number[], sim: number): SmoothingNode[] {
  return values.map((value, index) => ({
    id: index + 1,
    raw: { [key]: value },
    neighbors: values
      .map((_, other) => ({ id: other + 1, sim }))
      .filter((nb) => nb.id !== index + 1),
  }))
}

function finalValues(nodes: SmoothingNode[], key: string): number[] {
  const outcome = smoothScores(nodes, SMOOTHING_CONFIG)
  return nodes.map((n) => outcome.nodes.get(n.id)!.values[key])
}

const SHOT = {
  maxDateTakenDeltaSeconds: SMOOTHING_CONFIG.maxDateTakenDeltaSeconds,
  maxSettingRatio: SMOOTHING_CONFIG.maxSettingRatio,
}

const CAPTURE = {
  sameCaptureToleranceSeconds: SMOOTHING_CONFIG.sameCaptureToleranceSeconds,
  maxSettingRatio: SMOOTHING_CONFIG.maxSettingRatio,
}

/** Las dos farolas reales: 11 segundos y el zoom girado de 125 a 48 mm. */
const STREETLIGHT_TIGHT = {
  dateTaken: '2026:07:17 18:55:14',
  camera: 'Canon Canon EOS 90D',
  focalLength: 125,
}
const STREETLIGHT_WIDE = {
  dateTaken: '2026:07:17 18:55:25',
  camera: 'Canon Canon EOS 90D',
  focalLength: 48,
}

test.group('score smoothing · misma toma', () => {
  test('sin metadatos comparables no se veta nada: decide el dhash', ({ assert }) => {
    assert.isTrue(isSameShot(null, null, SHOT))
    assert.isTrue(isSameShot({ iso: 100 }, { iso: 400 }, SHOT))
    // Un campo que solo tiene una de las dos tampoco opina.
    assert.isTrue(isSameShot({ focalLength: 50 }, {}, SHOT))
  })

  test('la fecha veta fuera de la ventana', ({ assert }) => {
    assert.isTrue(
      isSameShot({ dateTaken: '2026:08:02 10:00:00' }, { dateTaken: '2026:08:02 10:00:20' }, SHOT)
    )
    assert.isFalse(
      isSameShot({ dateTaken: '2026:08:02 10:00:00' }, { dateTaken: '2026:08:02 10:01:30' }, SHOT)
    )
  })

  test('la focal veta un reencuadre aunque el resto cuadre', ({ assert }) => {
    // Mismo cuerpo y 11 segundos: la fecha y el hardware las dan por buenas. Solo
    // la focal sabe que hubo un zoom de por medio.
    assert.isFalse(isSameShot(STREETLIGHT_TIGHT, STREETLIGHT_WIDE, SHOT))
    assert.isTrue(
      isSameShot(STREETLIGHT_TIGHT, { ...STREETLIGHT_WIDE, focalLength: 125 }, SHOT),
      'con la misma focal no queda nada que vete'
    )
  })

  test('la focal tolera el ruido de formato, no un zoom', ({ assert }) => {
    assert.isTrue(isSameShot({ focalLength: 48 }, { focalLength: '48.0 mm' }, SHOT))
    assert.isTrue(isSameShot({ focalLength: 48 }, { focalLength: 47.9 }, SHOT))
    assert.isFalse(isSameShot({ focalLength: 48 }, { focalLength: 55 }, SHOT))
  })

  test('lee las dos formas de EXIF que escriben las dos rutas de subida', ({ assert }) => {
    // web: anidado. plugin de Lightroom: plano.
    const web = { camera: { make: 'Canon', model: 'EOS 90D' }, settings: { focalLength: 125 } }
    const plugin = { camera: 'EOS 90D', focalLength: 48 }

    // Si los alias no resolvieran, la focal no se leería y esto pasaría.
    assert.isFalse(isSameShot(web, plugin, SHOT), 'la focal debe leerse en ambas formas')
    assert.isTrue(isSameShot(web, { ...plugin, focalLength: 125 }, SHOT))
  })

  test('el hardware solo veta, nunca aprueba', ({ assert }) => {
    assert.isFalse(isSameShot({ cameraModel: 'EOS R5' }, { cameraModel: 'EOS R6' }, SHOT))
    // Compartir cámara NO es evidencia de nada: el catálogo entero la comparte, así
    // que aprobar por aquí sellaba cualquier pareja que llegara.
    assert.isTrue(isSameShot({ camera: { model: 'X-T5' } }, { camera: 'x-t5' }, SHOT))
  })
})

/**
 * Dos del iPhone reales, tomadas con un segundo de diferencia. Todo coincide —cámara,
 * focal, ISO, apertura— menos la hora y la obturación, que es lo único que delata que
 * son dos disparos y no dos revelados del mismo.
 */
const IPHONE_FIRST = {
  dateTaken: '2023-10-24 17:12:51',
  camera: 'Apple iPhone 14',
  focalLength: 5.7,
  aperture: 1.5,
  iso: 50,
  exposureTime: 0.004854368932038835,
}
const IPHONE_SECOND = {
  ...IPHONE_FIRST,
  dateTaken: '2023-10-24 17:12:52',
  exposureTime: 0.003003003003003003,
}

test.group('score smoothing · mismo disparo', () => {
  test('dos revelados de una captura comparten hora y ajustes', ({ assert }) => {
    // Virar, pasar a blanco y negro o reexportar no toca el EXIF del original.
    assert.isTrue(isConfirmedSameCapture(IPHONE_FIRST, { ...IPHONE_FIRST }, CAPTURE))
  })

  test('un segundo de diferencia ya son dos disparos', ({ assert }) => {
    // El caso real: con el margen de 1s que había antes, estas dos pasaban por
    // versiones la una de la otra.
    assert.isFalse(isConfirmedSameCapture(IPHONE_FIRST, IPHONE_SECOND, CAPTURE))
    assert.isFalse(isConfirmedSameCapture(STREETLIGHT_TIGHT, STREETLIGHT_WIDE, CAPTURE))
  })

  test('dentro del mismo segundo, la exposición separa la ráfaga', ({ assert }) => {
    // Aquí el reloj ya no puede ayudar: el EXIF no baja del segundo. Lo único que
    // queda es que el automatismo movió la obturación entre un disparo y el otro.
    const sameSecond = { ...IPHONE_SECOND, dateTaken: IPHONE_FIRST.dateTaken }
    assert.isFalse(isConfirmedSameCapture(IPHONE_FIRST, sameSecond, CAPTURE))

    assert.isTrue(
      isConfirmedSameCapture(
        IPHONE_FIRST,
        { ...sameSecond, exposureTime: IPHONE_FIRST.exposureTime },
        CAPTURE
      ),
      'con la misma exposición no queda nada que vete'
    )
  })

  test('el ISO también separa, y lee las dos formas del EXIF', ({ assert }) => {
    const nested = { dateTaken: '2023-10-24 17:12:51', settings: { iso: 50 } }
    const flat = { dateTaken: '2023-10-24 17:12:51', iso: 400 }

    assert.isFalse(isConfirmedSameCapture(nested, flat, CAPTURE))
    assert.isTrue(isConfirmedSameCapture(nested, { ...flat, iso: 50 }, CAPTURE))
  })

  test('los ajustes solo vetan: ausentes o con ruido de formato, no opinan', ({ assert }) => {
    const base = { dateTaken: '2023-10-24 17:12:51', exposureTime: 0.005 }

    // Si a una le falta el campo, ese campo no dice nada.
    assert.isTrue(isConfirmedSameCapture(base, { dateTaken: base.dateTaken }, CAPTURE))
    // Mismo valor escrito de dos maneras por las dos rutas de subida.
    assert.isTrue(isConfirmedSameCapture(base, { ...base, exposureTime: '0.00501' }, CAPTURE))
  })

  test('sin fecha legible en alguna de las dos no consta el disparo', ({ assert }) => {
    // Al contrario que `isSameShot`, aquí la ausencia NO aprueba: sin EXIF la pareja
    // sigue agrupando, pero se queda en `default`.
    assert.isFalse(isConfirmedSameCapture({ dateTaken: '2026:07:17 18:55:14' }, {}, CAPTURE))
    assert.isFalse(isConfirmedSameCapture(null, null, CAPTURE))
    assert.isFalse(
      isConfirmedSameCapture({ dateTaken: 'basura' }, { dateTaken: 'basura' }, CAPTURE)
    )
  })
})

// ── Revelado ──────────────────────────────────────────────────
//
// El histograma es HSV, 16 tonos × 4 saturaciones, aplanado en `tono * 4 + sat`.
// OpenCV pone H = 0 cuando S = 0, así que la celda 0 se traga todo lo acromático.

/** Celda del histograma para un tono y una saturación dados. */
function cell(hue: number, sat: number): number {
  return hue * SAT_BINS + sat
}

/** Histograma sintético a partir de pares `[celda, masa]`. */
function histogram(cells: [number, number][]): number[] {
  const hist = new Array<number>(HUE_BINS * SAT_BINS).fill(0)
  for (const [index, mass] of cells) hist[index] += mass
  return hist
}

const GRADE = SMOOTHING_CONFIG.colorGrade

/** Retrato en color: piel en dos saturaciones, ojos azules y bastante zona pálida. */
const COLOR_PORTRAIT = histogram([
  [0, 0.4], // acromático: fondo quemado, sombras
  [cell(1, 1), 0.15],
  [cell(1, 2), 0.35],
  [cell(8, 2), 0.1],
])

test.group('score smoothing · revelado', () => {
  test('el vector se lee igual venga como string o como array, y a cualquier escala', ({
    assert,
  }) => {
    const parsed = parseColorHistogram(JSON.stringify(COLOR_PORTRAIT))
    // Llega normalizado en L2 desde cv2.normalize, así que la escala del vector no
    // puede significar nada: se rehace en L1 y cada bin pasa a ser una fracción.
    const scaled = parseColorHistogram(COLOR_PORTRAIT.map((value) => value * 7.3))

    assert.isNotNull(parsed)
    assert.isNotNull(scaled)
    for (let i = 0; i < parsed!.length; i++) {
      assert.closeTo(parsed![i], scaled![i], 1e-12, `bin ${i}`)
    }
    assert.closeTo(
      parsed!.reduce((a, b) => a + b, 0),
      1,
      1e-9
    )
  })

  test('un vector que no sirve se queda en null', ({ assert }) => {
    assert.isNull(parseColorHistogram(null))
    assert.isNull(parseColorHistogram('no es json'))
    assert.isNull(parseColorHistogram([1, 2, 3]), 'longitud distinta de 64')
    assert.isNull(parseColorHistogram(new Array(64).fill(0)), 'sin masa que repartir')
    assert.isNull(parseColorHistogram(histogram([[0, -1]])), 'masa negativa')
  })

  test('la masa insaturada distingue el blanco y negro del color', ({ assert }) => {
    // Una foto en gris manda TODOS sus píxeles a la celda 0.
    const monochrome = parseColorHistogram(histogram([[0, 1]]))!
    const color = parseColorHistogram(COLOR_PORTRAIT)!

    assert.closeTo(unsaturatedMass(monochrome), 1, 1e-9)
    assert.closeTo(unsaturatedMass(color), 0.4, 1e-9)
    // Sin color, comparar tonos no significa nada.
    assert.isNull(chromaticProfile(monochrome, GRADE.minChromaticMass))
  })

  test('el mismo retrato en color y en blanco y negro son revelados distintos', ({ assert }) => {
    // El caso que el filtro de etiquetas del LLM dejaba pasar: dhash da distancia 0
    // porque la luminancia se conserva, y bastaba con que el LLM llamara "color" a
    // las dos para que la pareja se corrigiera como si fuera la misma foto.
    const monochrome = parseColorHistogram(histogram([[0, 1]]))!
    const color = parseColorHistogram(COLOR_PORTRAIT)!

    assert.isFalse(isSameColorGrade(monochrome, color, GRADE))
  })

  test('dos fotogramas de la misma toma comparten revelado', ({ assert }) => {
    // Ruido de grano y compresión: masa que baila entre bins, pero poca.
    const burst = parseColorHistogram(
      histogram([
        [0, 0.4],
        [cell(1, 1), 0.16],
        [cell(1, 2), 0.34],
        [cell(8, 2), 0.1],
      ])
    )!

    assert.isTrue(isSameColorGrade(parseColorHistogram(COLOR_PORTRAIT)!, burst, GRADE))
  })

  test('un viraje de tono cambia el revelado sin tocar la saturación', ({ assert }) => {
    // Misma masa insaturada: solo se ha desplazado el tono de la piel un bin.
    const warmed = parseColorHistogram(
      histogram([
        [0, 0.4],
        [cell(2, 1), 0.15],
        [cell(2, 2), 0.35],
        [cell(8, 2), 0.1],
      ])
    )!
    const color = parseColorHistogram(COLOR_PORTRAIT)!

    assert.closeTo(unsaturatedMass(warmed), unsaturatedMass(color), 1e-9)
    assert.isFalse(isSameColorGrade(color, warmed, GRADE))
  })

  test('un decolorido cambia el revelado sin tocar el tono', ({ assert }) => {
    const washedOut = parseColorHistogram(
      histogram([
        [0, 0.75],
        [cell(1, 1), 0.1],
        [cell(1, 2), 0.1],
        [cell(8, 2), 0.05],
      ])
    )!

    assert.isFalse(isSameColorGrade(parseColorHistogram(COLOR_PORTRAIT)!, washedOut, GRADE))
  })

  test('el pico acromático no tapa el viraje: por eso son dos comprobaciones', ({ assert }) => {
    // Dos fotos muy oscuras con el poco color que tienen en tonos opuestos. Medido
    // de una vez, el 90% de masa compartida en la celda 0 las daría por iguales.
    const darkRed = parseColorHistogram(
      histogram([
        [0, 0.9],
        [cell(1, 2), 0.1],
      ])
    )!
    const darkBlue = parseColorHistogram(
      histogram([
        [0, 0.9],
        [cell(9, 2), 0.1],
      ])
    )!

    assert.isAtLeast(histogramIntersection(darkRed, darkBlue), 0.9, 'medido de una vez, iguales')
    assert.isFalse(isSameColorGrade(darkRed, darkBlue, GRADE), 'separado, revelados distintos')
  })

  test('sin histograma falla cerrado', ({ assert }) => {
    const color = parseColorHistogram(COLOR_PORTRAIT)!
    // No se puede afirmar que compartan revelado, así que el grupo se degrada a
    // `version` y se corrige poco. Sigue siendo más blando que el filtro anterior,
    // que directamente tiraba la pareja.
    assert.isFalse(isSameColorGrade(color, null, GRADE))
    assert.isFalse(isSameColorGrade(null, null, GRADE))
  })
})

interface Scenario {
  name: string
  criterion: string
  values: number[]
  sim: number
}

const SCENARIOS: Scenario[] = [
  { name: 'Par · desviación ligera', criterion: 'composition', values: [8.0, 8.5], sim: 0.98 },
  { name: 'Par · desviación media', criterion: 'composition', values: [7.8, 9.1], sim: 0.98 },
  { name: 'Par · desviación dramática', criterion: 'composition', values: [5.0, 8.5], sim: 0.98 },
  {
    name: 'Grupo 3+1 · ligera',
    criterion: 'composition',
    values: [8.0, 8.1, 8.2, 8.6],
    sim: 0.985,
  },
  {
    name: 'Grupo 3+1 · media',
    criterion: 'composition',
    values: [8.0, 8.1, 8.2, 9.5],
    sim: 0.985,
  },
  {
    name: 'Grupo 5+1 · dramática',
    criterion: 'composition',
    values: [8.0, 8.0, 8.0, 8.0, 8.0, 5.0],
    sim: 0.996,
  },
  { name: 'Par · ligera', criterion: 'humor', values: [6.0, 6.8], sim: 0.98 },
  { name: 'Par · media', criterion: 'humor', values: [5.0, 7.0], sim: 0.98 },
  { name: 'Par · dramática', criterion: 'humor', values: [3.0, 8.0], sim: 0.98 },
  { name: 'Grupo 3+1 · dramática', criterion: 'humor', values: [7.9, 8.0, 8.1, 5.0], sim: 0.985 },
  {
    name: 'Grupo 5+1 · dramática',
    criterion: 'humor',
    values: [8.0, 8.0, 8.0, 8.0, 8.0, 5.0],
    sim: 0.996,
  },
  {
    name: 'Grupo 3+1 · media',
    criterion: 'strangeness',
    values: [7.0, 7.0, 7.1, 8.6],
    sim: 0.985,
  },
]

test.group('score smoothing · escenarios', () => {
  test('tabla de resultados', ({ assert }) => {
    const rows: string[] = []

    for (const scenario of SCENARIOS) {
      const nodes = buildGroup(scenario.criterion, scenario.values, scenario.sim)
      const after = finalValues(nodes, scenario.criterion)
      const gapBefore = Math.max(...scenario.values) - Math.min(...scenario.values)
      const gapAfter = Math.max(...after) - Math.min(...after)

      rows.push(
        [
          scenario.name.padEnd(28),
          scenario.criterion.padEnd(13),
          scenario.sim.toFixed(3),
          scenario.values.join(' / ').padEnd(26),
          after.join(' / ').padEnd(26),
          `${gapBefore.toFixed(1)} → ${gapAfter.toFixed(1)}`,
        ].join(' | ')
      )

      // El hueco nunca crece.
      assert.isAtMost(Number(gapAfter.toFixed(6)), Number(gapBefore.toFixed(6)))
    }

    console.log('\n' + rows.join('\n') + '\n')
  })
})

test.group('score smoothing · invariantes', () => {
  test('un grupo coherente no se toca', ({ assert }) => {
    // `composition` declara `tol: 0`, así que "de acuerdo" significa literalmente el
    // mismo valor: con tolerancia cero, cualquier dispersión colapsa a la mediana.
    const agreed = buildGroup('composition', [8.1, 8.1, 8.1, 8.1], 0.996)
    const agreedOutcome = smoothScores(agreed, SMOOTHING_CONFIG)
    for (const node of agreed) {
      assert.deepEqual(agreedOutcome.nodes.get(node.id)!.moved, {})
      assert.isFalse(agreedOutcome.nodes.get(node.id)!.changed)
    }

    // Y con una tolerancia declarada, lo que ya cabe dentro de ella tampoco se mueve.
    // El perfil se inyecta porque esto comprueba el MOTOR, no la calibración.
    const withinTol = buildGroup('composition', [8.0, 8.1, 8.2, 8.15], 0.996)
    const withinTolOutcome = smoothScores(withinTol, SMOOTHING_CONFIG, () => ({
      tol: 0.4,
      maxShift: 2,
    }))
    for (const node of withinTol) {
      assert.deepEqual(withinTolOutcome.nodes.get(node.id)!.moved, {})
    }
  })

  test('una foto sin vecinos nunca se mueve', ({ assert }) => {
    const nodes: SmoothingNode[] = [{ id: 1, raw: { composition: 3.0 }, neighbors: [] }]
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG)
    assert.deepEqual(outcome.nodes.get(1)!.moved, {})
    assert.equal(outcome.nodes.get(1)!.values.composition, 3.0)
  })

  test('el tope duro nunca se supera', ({ assert }) => {
    for (const criterion of ['composition', 'humor', 'strangeness']) {
      const profile = getCriterionProfile(criterion)
      // Caso extremo: 9 vecinos idénticos y una foto en el lado opuesto de la escala.
      const values = [...Array(9).fill(9.0), 1.0]
      const nodes = buildGroup(criterion, values, 0.999)
      const outcome = smoothScores(nodes, SMOOTHING_CONFIG)

      for (const node of nodes) {
        const raw = node.raw[criterion]
        const final = outcome.nodes.get(node.id)!.values[criterion]
        assert.isAtMost(
          Math.abs(final - raw),
          profile.maxShift + 1e-9,
          `${criterion}: ${raw} → ${final} supera el tope`
        )
      }
    }
  })

  test('la diferencia permitida es la variedad que sobrevive en el grupo', ({ assert }) => {
    // Con margen de sobra, al terminar nadie queda a más de `tol` de la mediana.
    const profile: ResolvedCriterionProfile = { tol: 0.4, maxShift: 5 }
    const nodes = buildGroup('x', [6.0, 8.0, 8.1, 9.5], 0.996)
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG, () => profile)
    const after = nodes.map((n) => outcome.nodes.get(n.id)!.values.x)
    const m = median(after)

    for (const value of after) {
      assert.isAtMost(Math.abs(value - m), profile.tol + 0.05, `${value} se salió de la banda`)
    }
    // Y sigue habiendo variedad: no han acabado todas iguales.
    assert.isAbove(Math.max(...after) - Math.min(...after), 0)
  })

  test('diferencia permitida 0 hace que caigan justo en la mediana', ({ assert }) => {
    const profile: ResolvedCriterionProfile = { tol: 0, maxShift: 5 }
    const nodes = buildGroup('x', [7.8, 8.0, 8.2, 8.4], 0.996)
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG, () => profile)
    const after = nodes.map((n) => outcome.nodes.get(n.id)!.values.x)

    assert.deepEqual(after, [8.1, 8.1, 8.1, 8.1])
  })

  test('máximo 0 deja el criterio intacto', ({ assert }) => {
    const profile: ResolvedCriterionProfile = { tol: 0.4, maxShift: 0 }
    const nodes = buildGroup('x', [3.0, 8.0, 8.0, 8.0], 0.999)
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG, () => profile)

    for (const node of nodes) {
      assert.deepEqual(outcome.nodes.get(node.id)!.moved, {})
      assert.equal(outcome.nodes.get(node.id)!.values.x, node.raw.x)
    }
  })

  test('el máximo corta cuando no da para llegar a la banda', ({ assert }) => {
    const profile: ResolvedCriterionProfile = { tol: 0.4, maxShift: 0.6 }
    const nodes = buildGroup('x', [8.0, 8.0, 8.0, 5.0], 0.999)
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG, () => profile)
    const after = nodes.map((n) => outcome.nodes.get(n.id)!.values.x)

    // Las tres coherentes no se mueven; la descolgada gasta su margen y se queda ahí.
    assert.deepEqual(after, [8, 8, 8, 5.6])
  })

  test('nadie cruza al otro lado de la mediana', ({ assert }) => {
    for (const scenario of SCENARIOS) {
      const nodes = buildGroup(scenario.criterion, scenario.values, scenario.sim)
      const outcome = smoothScores(nodes, SMOOTHING_CONFIG)
      const after = nodes.map((n) => outcome.nodes.get(n.id)!.values[scenario.criterion])
      const m = median(after)

      for (const node of nodes) {
        const result = outcome.nodes.get(node.id)!
        if (!result.changed) continue
        const final = result.values[scenario.criterion]
        const rawSide = Math.sign(node.raw[scenario.criterion] - m)
        // Puede quedarse en la mediana, pero nunca pasarse al lado contrario.
        if (rawSide !== 0 && final !== m) {
          assert.equal(
            Math.sign(final - m),
            rawSide,
            `${scenario.name}: ${node.raw[scenario.criterion]} → ${final} cruzó la mediana ${m}`
          )
        }
      }
    }
  })

  test('el orden relativo dentro del grupo se conserva', ({ assert }) => {
    const values = [5.0, 6.2, 7.4, 8.1, 9.6]
    const nodes = buildGroup('composition', values, 0.996)
    const after = finalValues(nodes, 'composition')

    for (let i = 1; i < values.length; i++) {
      assert.isAtLeast(
        after[i],
        after[i - 1],
        `inversión de orden: ${values[i - 1]}→${after[i - 1]} vs ${values[i]}→${after[i]}`
      )
    }
  })

  test('idempotencia: reejecutar desde los valores originales da lo mismo', ({ assert }) => {
    const nodes = buildGroup('composition', [8.0, 8.1, 8.2, 9.5], 0.99)
    const first = smoothScores(nodes, SMOOTHING_CONFIG)
    const second = smoothScores(nodes, SMOOTHING_CONFIG)

    for (const node of nodes) {
      assert.deepEqual(first.nodes.get(node.id)!.values, second.nodes.get(node.id)!.values)
      assert.deepEqual(first.nodes.get(node.id)!.moved, second.nodes.get(node.id)!.moved)
    }
  })

  test('convergencia: se alcanza el punto fijo dentro del presupuesto', ({ assert }) => {
    for (const scenario of SCENARIOS) {
      const nodes = buildGroup(scenario.criterion, scenario.values, scenario.sim)
      const outcome = smoothScores(nodes, SMOOTHING_CONFIG)
      assert.isTrue(outcome.converged, `${scenario.name} no convergió`)
      assert.isBelow(outcome.iterations, SMOOTHING_CONFIG.maxIterations)
    }
  })

  test('un perfil más permisivo corrige menos que uno estricto', ({ assert }) => {
    // Se inyectan los perfiles en vez de leer la config real: este test comprueba el
    // MOTOR, y debe seguir pasando cualquiera que sea la calibración del momento.
    const nodes = buildGroup('composition', [8.0, 8.0, 8.0, 6.0], 0.99)

    const strict = smoothScores(nodes, SMOOTHING_CONFIG, () => ({ tol: 0.1, maxShift: 1.0 }))
    const lenient = smoothScores(nodes, SMOOTHING_CONFIG, () => ({ tol: 0.6, maxShift: 0.4 }))

    const strictValue = strict.nodes.get(4)!.values.composition
    const lenientValue = lenient.nodes.get(4)!.values.composition

    // El estricto acerca la foto desviada mucho más a la mediana del grupo (8.0).
    assert.isAbove(strictValue, lenientValue)
    assert.closeTo(strictValue, 7.0, 0.01, 'tope de 1.0 desde el original')
    assert.closeTo(lenientValue, 6.4, 0.01, 'tope de 0.4 desde el original')
  })

  test('tol 0 hace que todas acaben en la mediana exacta', ({ assert }) => {
    const nodes = buildGroup('composition', [8.0, 8.2, 8.6], 0.99)
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG, () => ({ tol: 0, maxShift: 2 }))
    const finals = nodes.map((n) => outcome.nodes.get(n.id)!.values.composition)

    assert.deepEqual(finals, [8.2, 8.2, 8.2])
  })

  test('la huella exacta es de grupo, no de pareja suelta', ({ assert }) => {
    assert.isTrue(isExactSimilarityGroup(buildGroup('humor', [2.5, 3.0], 1)))
    assert.isFalse(isExactSimilarityGroup(buildGroup('humor', [2.5, 3.0], 63 / 64)))
    assert.isFalse(isExactSimilarityGroup([{ id: 1, raw: { humor: 5 }, neighbors: [] }]))
  })

  test('un duplicado exacto colapsa; una ráfaga conserva su tolerancia', ({ assert }) => {
    // Números reales de dos subidas del mismo archivo: Originality 6.0 y 8.0.
    // Con `default` la tolerancia de 0.1 deja 0.2 puntos de diferencia entre dos
    // archivos idénticos, que es justo lo que no tiene ninguna justificación.
    const burst = buildGroup('strangeness', [6.0, 8.0], 1)
    const burstOutcome = smoothScores(burst, SMOOTHING_CONFIG)
    assert.deepEqual(
      burst.map((node) => burstOutcome.nodes.get(node.id)!.values.strangeness),
      [6.9, 7.1]
    )

    const duplicate = buildGroup('strangeness', [6.0, 8.0], 1)
    for (const node of duplicate) node.profileMode = 'duplicate'
    const duplicateOutcome = smoothScores(duplicate, SMOOTHING_CONFIG)
    assert.deepEqual(
      duplicate.map((node) => duplicateOutcome.nodes.get(node.id)!.values.strangeness),
      [7.0, 7.0]
    )
  })

  test('en duplicate ningún criterio conserva diferencia', ({ assert }) => {
    // No se calibra por criterio: si nada distingue a las dos fotos, no hay eje en
    // el que una diferencia pueda ser legítima.
    for (const criterion of Object.keys(CRITERION_PROFILES)) {
      const profile = getCriterionProfile(criterion, 'duplicate')
      assert.equal(profile.tol, 0, criterion)

      const nodes = buildGroup(criterion, [4.0, 9.0], 1)
      for (const node of nodes) node.profileMode = 'duplicate'
      const outcome = smoothScores(nodes, SMOOTHING_CONFIG)
      const finals = nodes.map((node) => outcome.nodes.get(node.id)!.values[criterion])
      assert.deepEqual(finals, [6.5, 6.5], criterion)
    }
  })

  test('un revelado distinto solo frena lo que depende del color', ({ assert }) => {
    // El eje no es estético contra humano: es si el revelado toca lo que el criterio
    // mide. La composición es geometría y no se mueve al desaturar, así que va con
    // la historia y la gracia, no con la estética.
    const shrink = (key: string) =>
      getCriterionProfile(key, 'version').maxShift / getCriterionProfile(key, 'default').maxShift

    for (const sensitive of ['aesthetic_quality', 'strangeness', 'subject_clarity']) {
      for (const invariant of ['composition', 'visual_games', 'storytelling', 'humor']) {
        assert.isBelow(
          shrink(sensitive),
          shrink(invariant),
          `${sensitive} debería frenarse más que ${invariant} entre revelados`
        )
      }
    }

    // La composición no se frena en absoluto: se corrige igual sea o no una versión.
    assert.equal(shrink('composition'), 1)
  })

  test('un grupo de revelados distintos gasta un margen menor', ({ assert }) => {
    const defaultProfile = getCriterionProfile('aesthetic_quality', 'default')
    const versionProfile = getCriterionProfile('aesthetic_quality', 'version')
    assert.isBelow(versionProfile.maxShift, defaultProfile.maxShift)

    // Dos valores en extremos opuestos: los dos perfiles agotan su tope, así que lo
    // que se ve es exactamente cuánto deja moverse cada uno.
    const sameGrade = buildGroup('aesthetic_quality', [2.5, 8.0], 1)
    const sameGradeOutcome = smoothScores(sameGrade, SMOOTHING_CONFIG)
    assert.equal(
      sameGradeOutcome.nodes.get(1)!.values.aesthetic_quality,
      Math.round((2.5 + defaultProfile.maxShift) * 10) / 10
    )

    const graded = buildGroup('aesthetic_quality', [2.5, 8.0], 1)
    for (const node of graded) node.profileMode = 'version'
    const gradedOutcome = smoothScores(graded, SMOOTHING_CONFIG)
    assert.equal(
      gradedOutcome.nodes.get(1)!.values.aesthetic_quality,
      Math.round((2.5 + versionProfile.maxShift) * 10) / 10
    )
    assert.equal(
      gradedOutcome.nodes.get(2)!.values.aesthetic_quality,
      Math.round((8.0 - versionProfile.maxShift) * 10) / 10
    )
  })

  test('entre revelados, una diferencia estética moderada se respeta entera', ({ assert }) => {
    // 0.8 puntos de estética entre dos revelados cabe dentro de `tol`: una versión
    // en blanco y negro puede ser legítimamente más bonita que la de color.
    const graded = buildGroup('aesthetic_quality', [7.0, 7.8], 1)
    for (const node of graded) node.profileMode = 'version'
    const gradedOutcome = smoothScores(graded, SMOOTHING_CONFIG)

    for (const node of graded) {
      assert.deepEqual(gradedOutcome.nodes.get(node.id)!.moved, {})
    }

    // Con el mismo revelado, esa misma diferencia sí se cierra.
    const sameGrade = buildGroup('aesthetic_quality', [7.0, 7.8], 1)
    const sameGradeOutcome = smoothScores(sameGrade, SMOOTHING_CONFIG)
    assert.isTrue(sameGradeOutcome.nodes.get(1)!.changed)

    // Y esa misma diferencia en un criterio invariante al color no se libra por ser
    // una versión: el encuadre y la historia son los mismos en las dos.
    for (const invariant of ['composition', 'storytelling']) {
      const invariantGroup = buildGroup(invariant, [7.0, 7.8], 1)
      for (const node of invariantGroup) node.profileMode = 'version'
      const invariantOutcome = smoothScores(invariantGroup, SMOOTHING_CONFIG)
      assert.isTrue(invariantOutcome.nodes.get(1)!.changed, invariant)
    }
  })

  test('maxShift 0 deja el criterio intacto', ({ assert }) => {
    const nodes = buildGroup('composition', [8.0, 8.0, 8.0, 3.0], 0.99)
    const outcome = smoothScores(nodes, SMOOTHING_CONFIG, () => ({ tol: 0.1, maxShift: 0 }))

    for (const node of nodes) {
      assert.deepEqual(outcome.nodes.get(node.id)!.moved, {})
    }
  })
})

test.group('score smoothing · piezas', () => {
  test('mediana con número par de elementos', ({ assert }) => {
    assert.equal(median([8.0, 9.0]), 8.5)
    assert.closeTo(median([8.0, 8.1, 8.2, 9.5]), 8.15, 1e-9)
    assert.equal(median([5]), 5)
  })

  test('el tipo original del score se conserva al reescribir', ({ assert }) => {
    // El schema del LLM emite strings; hay filas antiguas con number y consumidores
    // que comprueban `typeof === 'number'`. Cambiar el tipo rompería esos filtros.
    assert.strictEqual(formatLikeSample('7.5', 8.1), '8.1')
    assert.strictEqual(formatLikeSample(7.5, 8.1), 8.1)
    assert.strictEqual(formatLikeSample(undefined, 8.1), 8.1)
  })

  test('dhashCompare agrupa por distancia de Hamming', ({ assert }) => {
    // Mismo comportamiento que espera la detección de duplicados, que comparte
    // este módulo con el regularizador a través del worker de CPU.
    const photoHashes = [
      { id: 1, hash: 'ffffffff00000000' },
      { id: 2, hash: 'ffffffff00000000' }, // idéntico al 1
      { id: 3, hash: 'ffffffff00000001' }, // a 1 bit
      { id: 4, hash: '0123456789abcdef' }, // lejano
    ]
    const result = dhashCompare({
      photoHashes,
      photosToCheckIds: [1, 2, 3, 4],
      threshold: 7.5,
    })

    assert.deepEqual(result, { 1: [2, 3], 2: [1, 3], 3: [1, 2] })
  })

  test('un grupo nunca encadena fotos que no se parecen entre sí', ({ assert }) => {
    // Cadena: 1~2 y 2~3, pero 1 y 3 NO se parecen. Antes los tres caían en el mismo
    // grupo (componente conexa) y una foto acababa influida por otra que no era suya.
    const adjacency = new Map([
      [1, [{ id: 2, sim: 0.99 }]],
      [
        2,
        [
          { id: 1, sim: 0.99 },
          { id: 3, sim: 0.99 },
        ],
      ],
      [3, [{ id: 2, sim: 0.99 }]],
    ])

    const groups = buildCliques(adjacency, SMOOTHING_CONFIG.maxGroupSize)

    assert.isFalse(
      groups.some((group) => group.includes(1) && group.includes(3)),
      '1 y 3 no se parecen: no pueden compartir grupo'
    )
    // Y dentro de cada grupo, todos son vecinos de todos.
    for (const group of groups) {
      for (const id of group) {
        const neighbors = new Set((adjacency.get(id) ?? []).map((nb) => nb.id))
        for (const other of group) {
          if (other !== id) assert.isTrue(neighbors.has(other))
        }
      }
    }
  })

  test('cada foto pertenece como mucho a un grupo', ({ assert }) => {
    const adjacency = new Map([
      [
        1,
        [
          { id: 2, sim: 0.99 },
          { id: 3, sim: 0.99 },
        ],
      ],
      [
        2,
        [
          { id: 1, sim: 0.99 },
          { id: 3, sim: 0.99 },
        ],
      ],
      [
        3,
        [
          { id: 1, sim: 0.99 },
          { id: 2, sim: 0.99 },
        ],
      ],
      [4, [{ id: 5, sim: 0.99 }]],
      [5, [{ id: 4, sim: 0.99 }]],
    ])

    const groups = buildCliques(adjacency, SMOOTHING_CONFIG.maxGroupSize)
    const seen = new Set<number>()
    for (const group of groups) {
      for (const id of group) {
        assert.isFalse(seen.has(id), `la foto ${id} aparece en dos grupos`)
        seen.add(id)
      }
    }

    assert.deepEqual(
      groups.map((g) => [...g].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]),
      [
        [1, 2, 3],
        [4, 5],
      ]
    )
  })
})
