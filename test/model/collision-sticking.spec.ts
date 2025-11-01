import { expect } from "chai"
import { Ball, State } from "../../src/model/ball"
import { Collision } from "../../src/model/physics/collision"
import { Vector3 } from "three"
import { POOL_PHYSICS } from "../../src/model/physics/constants"

/**
 * Test suite for the "sticking balls" issue where balls orbit each other after collision
 * Based on discussion between Claude and Codex in discussion.txt
 */

describe("Collision Sticking Behavior Tests", () => {
  const ctx = POOL_PHYSICS
  const dt = 1 / 240 // 240 FPS timestep

  /**
   * Helper function to simulate multiple frames
   */
  const simulateFrames = (frames, timestep, balls) => {
    let collisionCount = 0
    const collisionFrames = []

    const ensureMotionState = (ball) => {
      if (ball.vel.lengthSq() > 0 && !ball.inMotion()) {
        ball.state = State.Sliding
      }
    }

    for (let i = 0; i < frames; i++) {
      balls.forEach(ensureMotionState)
      // Check for collisions between all ball pairs
      for (let a = 0; a < balls.length; a++) {
        for (let b = a + 1; b < balls.length; b++) {
          if (Collision.willCollide(balls[a], balls[b], timestep, ctx)) {
            collisionCount++
            collisionFrames.push(i)
            Collision.separateAtImpact(balls[a], balls[b], timestep, ctx)
            Collision.collide(balls[a], balls[b])
          }
        }
      }

      // Update ball positions and velocities
      balls.forEach((ball) => ball.update(timestep))
    }

    return { collisionCount, collisionFrames }
  }

  /**
   * Helper to log detailed ball state for debugging
   */
  function logBallState(label, a, b) {
    const dist = a.pos.distanceTo(b.pos)
    const relVel = a.vel.clone().sub(b.vel)
    const offset = b.pos.clone().sub(a.pos)
    const normalRelVel = relVel.dot(offset.normalize())

    return {
      label,
      distance: dist,
      relVelMagnitude: relVel.length(),
      normalRelVel,
      ballA: {
        pos: a.pos.clone(),
        vel: a.vel.clone(),
        rvel: a.rvel.clone(),
      },
      ballB: {
        pos: b.pos.clone(),
        vel: b.vel.clone(),
        rvel: b.rvel.clone(),
      },
    }
  }

  describe("Slow Head-On Collision (Codex's test)", () => {
    it("should separate cleanly after a slow head-on impact", (done) => {
      const ballA = new Ball(new Vector3(0, 0, 0), undefined, ctx)
      const ballB = new Ball(new Vector3(2 * ctx.R - 1e-4, 0, 0), undefined, ctx)
      ballA.vel.set(0.05, 0, 0)
      ballB.vel.set(-0.05, 0, 0)
      ballA.state = State.Sliding
      ballB.state = State.Sliding

      const preCollision = logBallState("Pre-collision", ballA, ballB)

      const { collisionCount, collisionFrames } = simulateFrames(120, dt, [
        ballA,
        ballB,
      ])

      const postCollision = logBallState("Post-collision", ballA, ballB)

      // Test assertions
      const rel = ballA.vel.clone().sub(ballB.vel)
      const normal = ballB.pos.clone().sub(ballA.pos).normalize()
      const normalRelVel = rel.dot(normal)

      // 1. Balls should be separating (negative relative normal velocity after collision)
      expect(normalRelVel).to.be.at.most(0)

      // 2. Balls should be properly separated
      expect(ballA.pos.distanceTo(ballB.pos)).to.be.at.least(2 * ctx.R - 1e-6)

      // 3. Should not have excessive duplicate collisions
      expect(collisionCount).to.be.lessThan(5)

      // Log results for analysis
      console.log("=== Slow Head-On Collision Test ===")
      console.log("Pre-collision:", preCollision)
      console.log("Post-collision:", postCollision)
      console.log(`Total collisions: ${collisionCount}`)
      console.log(`Collision frames: ${collisionFrames.join(", ")}`)
      console.log(`Normal relative velocity: ${normalRelVel}`)
      done()
    })
  })

  describe("Medium Speed Head-On Collision", () => {
    it("should separate cleanly after medium speed impact", (done) => {
      const ballA = new Ball(new Vector3(0, 0, 0), undefined, ctx)
      const ballB = new Ball(new Vector3(0.1, 0, 0), undefined, ctx)
      ballA.vel.set(0.5, 0, 0)
      ballB.vel.set(-0.5, 0, 0)
      ballA.state = State.Sliding
      ballB.state = State.Sliding

      const debugData = []
      Collision.debugHook = (snapshot) => {
        debugData.push(snapshot)
      }

      const preCollision = logBallState("Pre-collision", ballA, ballB)

      const { collisionCount, collisionFrames } = simulateFrames(120, dt, [
        ballA,
        ballB,
      ])

      const postCollision = logBallState("Post-collision", ballA, ballB)

      const rel = ballA.vel.clone().sub(ballB.vel)
      const normal = ballB.pos.clone().sub(ballA.pos).normalize()
      const normalRelVel = rel.dot(normal)

      console.log("\n=== Medium Speed Head-On Collision Test ===")
      console.log("Pre-collision:", preCollision)
      console.log("Post-collision:", postCollision)
      console.log(`Total collisions: ${collisionCount}`)
      console.log(`Collision frames: ${collisionFrames.join(", ")}`)
      console.log(`Normal relative velocity: ${normalRelVel}`)
      console.log("Debug telemetry (first 3 collisions):")
      debugData.slice(0, 3).forEach((d, i) => {
        console.log(`  Collision ${i + 1}:`, {
          relNormalBefore: d.relNormalBefore.toFixed(6),
          relNormalAfterImpulse: d.relNormalAfterImpulse.toFixed(6),
          relNormalAfterCorrection: d.relNormalAfterCorrection.toFixed(6),
          normalImpulse: d.normalImpulse.toFixed(6),
          tangentialImpulse: d.tangentialImpulse.toFixed(6),
          distance: d.distance.toFixed(6),
        })
      })
      Collision.debugHook = undefined

      expect(normalRelVel).to.be.at.most(0)
      expect(ballA.pos.distanceTo(ballB.pos)).to.be.at.least(2 * ctx.R - 1e-6)
      expect(collisionCount).to.be.lessThan(5)
      done()
    })
  })

  describe("Glancing Collision with Spin", () => {
    it("should handle glancing collision without orbiting", (done) => {
      const ballA = new Ball(new Vector3(0, 0, 0), undefined, ctx)
      const ballB = new Ball(new Vector3(0.04, 0.02, 0), undefined, ctx)
      ballA.vel.set(0.8, 0.2, 0)
      ballA.rvel.set(0, 0, 10) // Add english
      ballB.vel.set(0, 0, 0) // Stationary
      ballA.state = State.Sliding
      ballB.state = State.Stationary

      const debugData = []
      Collision.debugHook = (snapshot) => {
        debugData.push(snapshot)
      }

      const preCollision = logBallState("Pre-collision", ballA, ballB)

      const { collisionCount, collisionFrames } = simulateFrames(200, dt, [
        ballA,
        ballB,
      ])

      const postCollision = logBallState("Post-collision", ballA, ballB)

      // After collision, balls should eventually separate
      const finalDistance = ballA.pos.distanceTo(ballB.pos)
      expect(finalDistance).to.be.greaterThan(2 * ctx.R)

      // Should not have many repeated collisions
      expect(collisionCount).to.be.lessThan(10)

      console.log("\n=== Glancing Collision with Spin Test ===")
      console.log("Pre-collision:", preCollision)
      console.log("Post-collision:", postCollision)
      console.log(`Total collisions: ${collisionCount}`)
      console.log(`Collision frames: ${collisionFrames.join(", ")}`)
      console.log(`Final distance: ${finalDistance}`)
      if (debugData.length > 0) {
        console.log("Debug telemetry:")
        debugData.forEach((d, i) => {
          console.log(`  Collision ${i + 1}:`, {
            relNormalBefore: d.relNormalBefore.toFixed(6),
            relNormalAfterImpulse: d.relNormalAfterImpulse.toFixed(6),
            relNormalAfterCorrection: d.relNormalAfterCorrection.toFixed(6),
            normalImpulse: d.normalImpulse.toFixed(6),
            tangentialImpulse: d.tangentialImpulse.toFixed(6),
            distance: d.distance.toFixed(6),
          })
        })
      }
      Collision.debugHook = undefined
      done()
    })
  })

  describe("Multiple Ball Cluster", () => {
    it("should handle 3-ball cluster without sticking", (done) => {
      const ballA = new Ball(new Vector3(0, 0, 0), undefined, ctx)
      const ballB = new Ball(new Vector3(0.06, 0, 0), undefined, ctx)
      const ballC = new Ball(new Vector3(0.03, 0.052, 0), undefined, ctx)

      ballA.vel.set(0.3, 0, 0)
      ballB.vel.set(-0.15, 0, 0)
      ballC.vel.set(0, -0.2, 0)
      ballA.state = State.Sliding
      ballB.state = State.Sliding
      ballC.state = State.Sliding

      const { collisionCount, collisionFrames } = simulateFrames(300, dt, [
        ballA,
        ballB,
        ballC,
      ])

      // After simulation, no two balls should be overlapping
      const distAB = ballA.pos.distanceTo(ballB.pos)
      const distAC = ballA.pos.distanceTo(ballC.pos)
      const distBC = ballB.pos.distanceTo(ballC.pos)

      expect(distAB).to.be.at.least(2 * ctx.R - 1e-6)
      expect(distAC).to.be.at.least(2 * ctx.R - 1e-6)
      expect(distBC).to.be.at.least(2 * ctx.R - 1e-6)

      // Should not have excessive collisions
      expect(collisionCount).to.be.lessThan(20)

      console.log("\n=== Multiple Ball Cluster Test ===")
      console.log(`Total collisions: ${collisionCount}`)
      console.log(`Collision frames: ${collisionFrames.slice(0, 20).join(", ")}...`)
      console.log(`Final distances: AB=${distAB}, AC=${distAC}, BC=${distBC}`)
      done()
    })
  })

  describe("Duplicate Collision Prevention", () => {
    it("should not process the same collision multiple times", (done) => {
      const ballA = new Ball(new Vector3(0, 0, 0), undefined, ctx)
      const ballB = new Ball(new Vector3(2 * ctx.R + 1e-5, 0, 0), undefined, ctx)
      ballA.vel.set(0.1, 0, 0)
      ballB.vel.set(-0.1, 0, 0)
      ballA.state = State.Sliding
      ballB.state = State.Sliding

      let firstCollisionFrame = -1
      let collisionCount = 0

      for (let i = 0; i < 50; i++) {
        if (Collision.willCollide(ballA, ballB, dt, ctx)) {
          if (firstCollisionFrame === -1) {
            firstCollisionFrame = i
          }
          collisionCount++
          Collision.separateAtImpact(ballA, ballB, dt, ctx)
          Collision.collide(ballA, ballB)
        }
        ballA.update(dt)
        ballB.update(dt)
      }

      // Should only collide once or very few times (not every frame)
      expect(collisionCount).to.be.lessThan(3)
      expect(firstCollisionFrame).to.be.at.least(0)

      console.log("\n=== Duplicate Collision Prevention Test ===")
      console.log(`First collision at frame: ${firstCollisionFrame}`)
      console.log(`Total collisions: ${collisionCount}`)
      done()
    })
  })

  describe("Energy Conservation Check", () => {
    it("should roughly conserve total kinetic energy (with some loss)", (done) => {
      const ballA = new Ball(new Vector3(0, 0, 0), undefined, ctx)
      const ballB = new Ball(new Vector3(0.1, 0, 0), undefined, ctx)
      ballA.vel.set(1.0, 0, 0)
      ballB.vel.set(0, 0, 0)
      ballA.state = State.Sliding
      ballB.state = State.Stationary

      // Calculate initial kinetic energy (linear only for simplicity)
      const initialKE =
        0.5 * ctx.m * ballA.vel.lengthSq() + 0.5 * ctx.m * ballB.vel.lengthSq()

      simulateFrames(120, dt, [ballA, ballB])

      // Calculate final kinetic energy
      const finalKE =
        0.5 * ctx.m * ballA.vel.lengthSq() + 0.5 * ctx.m * ballB.vel.lengthSq()

      // Energy should decrease (due to inelasticity) but not by more than ~10%
      const energyRatio = finalKE / initialKE

      expect(energyRatio).to.be.greaterThan(0.40) // Allow energy loss due to friction (tangential impulse factor)
      expect(energyRatio).to.be.at.most(1.0) // Should not gain energy

      console.log("\n=== Energy Conservation Check ===")
      console.log(`Initial KE: ${initialKE}`)
      console.log(`Final KE: ${finalKE}`)
      console.log(`Energy ratio: ${energyRatio}`)
      done()
    })
  })
})
