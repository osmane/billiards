/**
 * @jest-environment jsdom
 */

import { Vector3 } from "three"
import { Table } from "../../src/model/table"
import { Ball } from "../../src/model/ball"
import { TrajectoryPredictor } from "../../src/model/trajectorypredictor"
import { CAROM_PHYSICS } from "../../src/model/physics/constants"
import { AimEvent } from "../../src/events/aimevent"
import { applyShotFromPose } from "../../src/model/physics/shot"
import { ENGINE_DT, TRAJECTORY_SAMPLE_DT } from "../../src/model/physics/engine"

describe("Ten strong shots parity (predictor vs simulation)", () => {
  it("keeps avg<2mm, max<10mm for 10 strong cue-ball-only shots", () => {
    const predictor = new TrajectoryPredictor()
    const shots = 10

    // Choose 10 evenly spaced angles [0, 2π)
    const angles: number[] = Array.from({ length: shots }, (_, i) => (i / shots) * Math.PI * 2)

    for (const angle of angles) {
      // Single cue ball on carom table (no object balls => no ball-ball collision)
      const cueBall = new Ball(new Vector3(0, 0, CAROM_PHYSICS.R), 0xffffff, CAROM_PHYSICS)
      const table = new Table([cueBall])

      const power = 4.5 // strong shot in m/s range compatible with product scale
      const elevation = 0 // keep simpler baseline
      const offset = new Vector3(0, 0, 0)

      const aim = new AimEvent()
      aim.angle = angle
      aim.offset = offset
      aim.power = power
      aim.elevation = elevation

      // Predictor
      const predictions = predictor.predictTrajectory(table, aim, undefined, false, elevation)
      const cuePred = predictions.find(p => p.ballId === cueBall.id)
      expect(cuePred).toBeDefined()
      expect(cuePred!.points.length).toBeGreaterThan(1)

      // Real simulation from same pose
      const cueDir = new Vector3(Math.cos(angle + Math.PI), Math.sin(angle + Math.PI), 0).normalize()
      const hitPoint = cueBall.pos.clone() // center hit
      applyShotFromPose(cueBall, { cueDir, hitPointWorld: hitPoint, elevation, power })

      let t = 0
      const real: Array<{ pos: Vector3; time: number }> = []
      real.push({ pos: cueBall.pos.clone(), time: 0 })
      while (t < 1.0 && !table.allStationary()) {
        table.advance(ENGINE_DT)
        t += ENGINE_DT
        if (t - real[real.length - 1].time >= TRAJECTORY_SAMPLE_DT) {
          real.push({ pos: cueBall.pos.clone(), time: t })
        }
      }

      // Compare: real timestamps vs nearest predicted point
      let maxErr = 0
      let sumErr = 0
      let n = 0
      for (let i = 0; i < real.length && i < 40; i++) {
        const rt = real[i].time
        let nearest = cuePred!.points[0]
        let best = Math.abs(nearest.time - rt)
        for (const p of cuePred!.points) {
          const d = Math.abs(p.time - rt)
          if (d < best) { best = d; nearest = p }
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
      // thresholds per requirement
      expect(avgErr).toBeLessThan(0.002) // < 2mm
      expect(maxErr).toBeLessThan(0.010) // < 10mm
    }
  })
})

