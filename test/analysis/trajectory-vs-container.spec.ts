/**
 * @jest-environment jsdom
 */

import { initDom, canvas3d } from "../view/dom"
import { createThreeCushionContainer, prepareThreeCushionEnvironment } from "../helpers/threecushionReplay"
import { ENGINE_DT, TRAJECTORY_SAMPLE_DT } from "../../src/model/physics/engine"
import { Vector3 } from "three"

describe("Trajectory vs Real Simulation (Container path)", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("basic straight shot: predicted cue ball path matches simulation", () => {
    const container = createThreeCushionContainer(canvas3d)

    // Configure a simple, center hit, zero elevation, straight shot along +X
    const cue = container.table.cue
    const cueBall = container.table.cueball

    cue.aim.power = 2.0
    cue.aim.angle = 0 // along +X (cue points to -X, shot goes +X)
    cue.aim.offset.set(0, 0, 0)
    cue.elevation = 0
    cue.aim.elevation = 0

    // Ensure cue meshes reflect aim/elevation before prediction
    cue.moveTo(cueBall.pos)

    // Get predictions using the same objects production uses
    const predictions = container.trajectoryPredictor.predictTrajectory(
      container.table,
      cue.aim,
      container.rules,
      cue.masseMode,
      cue.elevation,
      false
    )

    const cueBallPrediction = predictions.find((p) => p.ballId === cueBall.id)
    expect(cueBallPrediction).toBeDefined()
    expect(cueBallPrediction!.points.length).toBeGreaterThan(1)

    // Run real simulation using production hit path
    container.table.cue.hit(cueBall)

    let time = 0
    const real: Array<{ pos: Vector3; time: number }> = []
    real.push({ pos: cueBall.pos.clone(), time: 0 })

    while (time < 1.0 && !container.table.allStationary()) {
      container.advance(ENGINE_DT)
      time += ENGINE_DT
      if (real.length === 0 || time - real[real.length - 1].time >= TRAJECTORY_SAMPLE_DT) {
        real.push({ pos: cueBall.pos.clone(), time })
      }
    }

    // Compare at common sample times
    let maxErr = 0
    let sumErr = 0
    let n = 0
    for (let i = 0; i < real.length && i < 40; i++) {
      const rt = real[i].time
      // nearest predicted
      let nearest = cueBallPrediction!.points[0]
      let bestDt = Math.abs(nearest.time - rt)
      for (const p of cueBallPrediction!.points) {
        const dt = Math.abs(p.time - rt)
        if (dt < bestDt) { bestDt = dt; nearest = p }
      }
      const dx = nearest.position.x - real[i].pos.x
      const dy = nearest.position.y - real[i].pos.y
      const dz = nearest.position.z - real[i].pos.z
      const err = Math.sqrt(dx*dx + dy*dy + dz*dz)
      maxErr = Math.max(maxErr, err)
      sumErr += err
      n++
    }

    const avgErr = n ? sumErr / n : 0

    // Tight thresholds: < 1mm avg, < 5mm max for basic shot
    expect(avgErr).toBeLessThan(0.001)
    expect(maxErr).toBeLessThan(0.005)
  })
})

