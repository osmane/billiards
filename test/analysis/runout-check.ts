// Headless stub for canvas
try {
  const canvasMod = require('canvas')
  const createCanvas = canvasMod?.createCanvas || canvasMod?.Canvas || null
  if (createCanvas) {
    ;(global as any).document = {
      createElement: (tag: string) => (tag === 'canvas' ? createCanvas(2, 2) : {}),
    }
    ;(global as any).window = undefined
  }
} catch (_) {}

import { TableGeometry } from "../../src/view/tablegeometry"
import { CAROM_PHYSICS, CAROM_BALL_RADIUS, CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH } from "../../src/model/physics/constants"
import { Ball } from "../../src/model/ball"
import { Table } from "../../src/model/table"
import { applyShotFromPose, makeShotPoseFromAim } from "../../src/model/physics/shot"
import { Vector3 } from "three"

const ENGINE_DT = 1 / 512

function measure(mu: number, muS: number): number {
  TableGeometry.setCaromDimensions(CAROM_TABLE_LENGTH, CAROM_TABLE_WIDTH, CAROM_BALL_RADIUS)
  ;(CAROM_PHYSICS as any).mu = mu
  ;(CAROM_PHYSICS as any).muS = muS

  const cueBall = new Ball(new Vector3(0, 0, CAROM_PHYSICS.R), 0xffffff, CAROM_PHYSICS)
  const table = new Table([cueBall])

  const power = 160 * CAROM_BALL_RADIUS
  const aim = { angle: 0, offset: new Vector3(0, 0, 0), power }
  const pose = makeShotPoseFromAim(cueBall, aim as any, 0)
  applyShotFromPose(cueBall, pose)

  let t = 0
  let total = 0
  let last = cueBall.pos.clone()
  while (t < 120 && !table.allStationary()) {
    table.advance(ENGINE_DT)
    t += ENGINE_DT
    const d = cueBall.pos.distanceTo(last)
    if (d > 0) {
      total += d
      last.copy(cueBall.pos)
    }
  }
  return total
}

const combos = [
  { mu: 0.0040, muS: 0.12 },
  { mu: 0.0042, muS: 0.12 },
  { mu: 0.0044, muS: 0.12 },
  { mu: 0.0042, muS: 0.11 },
  { mu: 0.0042, muS: 0.13 },
]

for (const c of combos) {
  const dist = measure(c.mu, c.muS)
  // eslint-disable-next-line no-console
  console.log(`mu=${c.mu.toFixed(4)} muS=${c.muS.toFixed(2)} => ${dist.toFixed(3)} m`)
}
