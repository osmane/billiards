import { expect } from "chai"
import { initDom, canvas3d } from "../view/dom"
import { prepareThreeCushionEnvironment, createThreeCushionContainer } from "../helpers/threecushionReplay"
import { State } from "../../src/model/ball"
import { CAROM_PHYSICS } from "../../src/model/physics/constants"

describe("Maximum Power Calibration (Target: 12.5m at max power)", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("calibrates friction for 12.5m distance at maximum power", () => {
    const container = createThreeCushionContainer(canvas3d)

    // Setup: Isolated cue ball test (no other balls to interfere)
    const cueBall = container.table.balls[0]
    const ball2 = container.table.balls[1]
    const ball3 = container.table.balls[2]

    // Apply CAROM physics to all balls
    container.table.balls.forEach(ball => {
      ball.updatePhysicsContext(CAROM_PHYSICS)
      ball.state = State.Stationary
    })

    // Set cue ball in center, other balls far away
    cueBall.pos.set(0, 0, 0)
    ball2.pos.set(5, 5, 0)  // Far away
    ball3.pos.set(-5, -5, 0)  // Far away

    container.table.cueball = cueBall

    // Set aim to MAXIMUM POWER (100% slider)
    const cue = container.table.cue
    const maxPower = cue.maxPower // Should be 4.92 m/s with CAROM_BALL_RADIUS

    console.log("\n=== MAXIMUM POWER CALIBRATION ===")
    console.log("Cue maxPower:", maxPower.toFixed(3), "m/s")
    console.log("Cue ballRadius:", cue.ballRadius.toFixed(5), "m")
    console.log("Expected: 4.92 m/s (160 × 0.03075)")
    console.log("")

    // Set maximum power and same angle as replay
    cue.aim.power = maxPower
    cue.aim.angle = -0.02
    cue.aim.offset.set(0, 0, 0)
    cue.aim.pos.copy(cueBall.pos)
    cue.elevation = 0  // Normal shot, not massé

    // Hit the ball
    cue.hit(cueBall)

    // Record initial velocity
    const initialVelocity = cueBall.vel.length()

    // Simulate
    const prevPos = cueBall.pos.clone()
    let distance = 0
    let elapsed = 0
    const maxTimeSeconds = 30
    const stepSeconds = 1 / 60

    while (elapsed < maxTimeSeconds) {
      container.advance(stepSeconds)
      distance += cueBall.pos.distanceTo(prevPos)
      prevPos.copy(cueBall.pos)
      elapsed += stepSeconds

      if (container.table.allStationary()) {
        break
      }
    }

    console.log("=== SIMULATION RESULTS ===")
    console.log("Initial velocity:", initialVelocity.toFixed(3), "m/s")
    console.log("Total distance:", distance.toFixed(2), "meters")
    console.log("Duration:", elapsed.toFixed(2), "seconds")
    console.log("")
    console.log("=== CALIBRATION ASSESSMENT ===")
    console.log("Target distance: 12.5 m")
    console.log("Actual distance:", distance.toFixed(2), "m")
    console.log("Difference:", (distance - 12.5).toFixed(2), "m")
    console.log("Accuracy:", ((distance / 12.5) * 100).toFixed(1) + "%")
    console.log("")

    const isCalibrated = Math.abs(distance - 12.5) < 0.5 // Within 50cm

    if (isCalibrated) {
      console.log("✓ CALIBRATED: Distance within target range (12.0-13.0m)")
    } else if (distance < 12.5) {
      const neededReduction = (12.5 / distance)
      const suggestedMu = CAROM_PHYSICS.mu! / neededReduction
      const suggestedMuS = CAROM_PHYSICS.muS! / neededReduction
      console.log("⚠️  TOO SHORT: Need to reduce friction")
      console.log("   Current: mu=" + CAROM_PHYSICS.mu + ", muS=" + CAROM_PHYSICS.muS)
      console.log("   Suggested: mu=" + suggestedMu.toFixed(4) + ", muS=" + suggestedMuS.toFixed(3))
    } else {
      const neededIncrease = (distance / 12.5)
      const suggestedMu = CAROM_PHYSICS.mu! * neededIncrease
      const suggestedMuS = CAROM_PHYSICS.muS! * neededIncrease
      console.log("⚠️  TOO LONG: Need to increase friction")
      console.log("   Current: mu=" + CAROM_PHYSICS.mu + ", muS=" + CAROM_PHYSICS.muS)
      console.log("   Suggested: mu=" + suggestedMu.toFixed(4) + ", muS=" + suggestedMuS.toFixed(3))
    }
    console.log("===================================\n")
  })
})
