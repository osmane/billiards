/*
  Run a small grid search over (mu, muS) to match ~12.5 m total runout
  in 3-cushion mode at max power, center hit, zero elevation.
  Headless Node setup: stub minimal DOM canvas for materials.
*/

const ENGINE_DT = 1 / 512
const TARGET = 12.5

type Result = { mu: number; muS: number; distance: number }

async function main() {
  // Headless stubs: use node-canvas for createElement('canvas')
  try {
    const canvasMod = require('canvas')
    const createCanvas = canvasMod?.createCanvas || canvasMod?.Canvas || null
    if (createCanvas) {
      ;(global as any).document = {
        createElement: (tag: string) => {
          if (tag === 'canvas') {
            return createCanvas(2, 2)
          }
          return {}
        },
      }
      ;(global as any).window = undefined
    }
  } catch (_) {
    // ignore; most physics code does not need materials in this script
  }

  const { Ball } = await import("../../src/model/ball")
  const { Table } = await import("../../src/model/table")
  const { TableGeometry } = await import("../../src/view/tablegeometry")
  const constants = await import("../../src/model/physics/constants")
  const { applyShotFromPose, makeShotPoseFromAim } = await import("../../src/model/physics/shot")
  const { Vector3 } = await import("three")

  function setFriction(mu: number, muS: number) {
    ;(constants as any).CAROM_PHYSICS.mu = mu
    ;(constants as any).CAROM_PHYSICS.muS = muS
  }

  function measureRunout(mu: number, muS: number): number {
    // Set carom geometry
    TableGeometry.setCaromDimensions(constants.CAROM_TABLE_LENGTH, constants.CAROM_TABLE_WIDTH, constants.CAROM_BALL_RADIUS)

    // Build table with single carom cue ball
    const cueBall = new Ball(new Vector3(0, 0, (constants as any).CAROM_PHYSICS.R), 0xffffff, (constants as any).CAROM_PHYSICS)
    const table = new Table([cueBall])

    // Apply friction overrides to physics context (must happen before shot)
    setFriction(mu, muS)

    // Shot: max power, straight, center, elevation 0
    const power = 160 * constants.CAROM_BALL_RADIUS
    const aim = { angle: 0, offset: new Vector3(0, 0, 0), power }
    const elevation = 0
    const pose = makeShotPoseFromAim(cueBall, aim as any, elevation)
    applyShotFromPose(cueBall, pose)

    // Integrate until stop or timeout
    let last = cueBall.pos.clone()
    let total = 0
    let t = 0
    const TMAX = 120
    while (t < TMAX && !table.allStationary()) {
      table.advance(ENGINE_DT)
      t += ENGINE_DT
      const d = cueBall.pos.distanceTo(last)
      if (Number.isFinite(d) && d > 0) {
        total += d
        last.copy(cueBall.pos)
      }
    }
    return total
  }

  const muList = [0.0030, 0.0036, 0.0042, 0.0048, 0.0054, 0.0060]
  const muSList = [0.10, 0.11, 0.12, 0.13]
  const eeList = [0.95, 0.97]
  const muWList = [0.14, 0.12]
  const rtList = [0.06, 0.08, 0.10] // rollingTransition
  const spinStopList = [0.04, 0.05, 0.06]
  const results: Result[] = []

  for (const mu of muList) {
    for (const muS of muSList) {
      for (const ee of eeList) {
        for (const muw of muWList) {
          for (const rt of rtList) {
            for (const sp of spinStopList) {
              if (typeof (constants as any).setee === 'function') (constants as any).setee(ee)
              const setW = (constants as any)['set׬w'] || (constants as any)['setμw']
              if (typeof setW === 'function') setW(muw)
              ;(constants as any).CAROM_PHYSICS.rollingTransition = rt
              ;(constants as any).CAROM_PHYSICS.spinStopThreshold = sp
              const distance = measureRunout(mu, muS)
              results.push({ mu, muS, distance })
              // eslint-disable-next-line no-console
              console.log(`mu=${mu.toFixed(4)} muS=${muS.toFixed(2)} ee=${ee.toFixed(2)} μw=${muw.toFixed(2)} rt=${rt.toFixed(2)} spin=${sp.toFixed(2)} -> ${distance.toFixed(3)} m`)
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => Math.abs(a.distance - TARGET) - Math.abs(b.distance - TARGET))

  const top = results.slice(0, 6)
  // eslint-disable-next-line no-console
  console.log("\nTop candidates (closest to 12.5 m):")
  top.forEach((r, i) => {
    // eslint-disable-next-line no-console
    console.log(`${i + 1}. mu=${r.mu.toFixed(4)} muS=${r.muS.toFixed(2)} -> ${r.distance.toFixed(3)} m (err=${Math.abs(r.distance - TARGET).toFixed(3)})`)
  })
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
