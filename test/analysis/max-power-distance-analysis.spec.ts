import { decodeReplay, prepareThreeCushionEnvironment, createThreeCushionContainer, applyReplayState } from "../helpers/threecushionReplay"
import { initDom, canvas3d } from "../view/dom"

const REPLAY_URL = "http://localhost:8080/?ruletype=threecushion&state=%28'init%21%5BC%2CB%2CJ70E%2A215530396FNEEK747378752F7096K883651733F%2A1EEK494757503%5D~shots%21%5B%28'type%21'AIM'~offset%21%28'xLyLzH%29~angle%21J02%2A%2A%2A%2A%2A4~power%214.572~pos%21%28'x%21C~y%21B~zH%29~iLelevationH.17%29%5D~startDnowDscoreLwholeGame%21false~v%211%29N00BJ1773N61511E34CJ7098N49591064D%211760838856654~K9F%2C0.H%210J-0.KE9LH~N%2A0%01NLKJHFEDCB%2A_"

describe("Maximum power distance analysis", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("analyzes distance traveled with maximum power shot", () => {
    const state = decodeReplay(REPLAY_URL)

    console.log("=== Shot Parameters ===")
    console.log("Shot offset (x, y, z):", state.shots[0].offset)
    console.log("Shot angle:", state.shots[0].angle)
    console.log("Shot power:", state.shots[0].power)
    console.log("Shot elevation:", state.shots[0].elevation)
    console.log("Shot position:", state.shots[0].pos)
    console.log("Ball index:", state.shots[0].i)

    console.log("\n=== Initial Ball Positions (decoded from state.init) ===")
    console.log("State init array:", state.init)

    // Custom simulation with cushion hit tracking
    const container = createThreeCushionContainer(canvas3d)
    const { cueBall } = applyReplayState(container, state)

    container.table.cue.hit(cueBall)

    const prevPos = cueBall.pos.clone()
    let distance = 0
    let elapsed = 0
    let cushionHits = 0
    let longCushionHits = 0  // X axis (long cushions)
    let shortCushionHits = 0  // Y axis (short cushions)
    const maxTimeSeconds = 30
    const stepSeconds = 1 / 60

    // Track cushion proximity
    const tableHalfLength = 2.84 / 2  // Half length (X axis - long cushions)
    const tableHalfWidth = 1.42 / 2   // Half width (Y axis - short cushions)
    const cushionThreshold = 0.05  // 5cm from edge
    let maxXReached = Math.abs(cueBall.pos.x)
    let maxYReached = Math.abs(cueBall.pos.y)

    // Track initial velocity
    let initialVelocity = 0
    let initialVelocityRecorded = false

    while (elapsed < maxTimeSeconds) {
      // Record initial velocity after first step
      if (!initialVelocityRecorded && elapsed > 0) {
        initialVelocity = cueBall.vel.length()
        initialVelocityRecorded = true
      }

      const prevOutcomeCount = container.table.outcome.length

      container.advance(stepSeconds)

      // Check for new cushion outcomes
      const newOutcomes = container.table.outcome.slice(prevOutcomeCount)
      for (const outcome of newOutcomes) {
        if (outcome.type === 'cushion') {
          cushionHits++

          // Determine if it's a long or short cushion by checking ball position
          const ballX = Math.abs(cueBall.pos.x)
          const ballY = Math.abs(cueBall.pos.y)

          // If closer to X edge, it's a short cushion (X axis)
          // If closer to Y edge, it's a long cushion (Y axis)
          if (ballX > tableHalfLength - 0.1) {
            shortCushionHits++  // Hit short cushion (X edge)
          } else if (ballY > tableHalfWidth - 0.1) {
            longCushionHits++   // Hit long cushion (Y edge)
          }
        }
      }

      distance += cueBall.pos.distanceTo(prevPos)
      prevPos.copy(cueBall.pos)

      // Track maximum extent reached
      maxXReached = Math.max(maxXReached, Math.abs(cueBall.pos.x))
      maxYReached = Math.max(maxYReached, Math.abs(cueBall.pos.y))

      elapsed += stepSeconds
      if (container.table.allStationary()) {
        break
      }
    }

    console.log("\n=== Simulation Results ===")
    console.log("Total distance traveled:", distance.toFixed(2), "meters")
    console.log("Duration:", elapsed.toFixed(2), "seconds")
    console.log("Total cushion hits:", cushionHits)
    console.log("  - Short cushion hits (X axis):", shortCushionHits)
    console.log("  - Long cushion hits (Y axis):", longCushionHits)
    console.log("Initial velocity:", initialVelocity.toFixed(3), "m/s")

    console.log("\n=== Cushion Proximity Analysis ===")
    console.log("Table half-length (X limit):", tableHalfLength.toFixed(3), "m")
    console.log("Table half-width (Y limit):", tableHalfWidth.toFixed(3), "m")
    console.log("Max X reached:", maxXReached.toFixed(3), "m", `(${(maxXReached / tableHalfLength * 100).toFixed(1)}% of limit)`)
    console.log("Max Y reached:", maxYReached.toFixed(3), "m", `(${(maxYReached / tableHalfWidth * 100).toFixed(1)}% of limit)`)

    const reachedXCushion = maxXReached > (tableHalfLength - cushionThreshold)
    const reachedYCushion = maxYReached > (tableHalfWidth - cushionThreshold)

    if (reachedXCushion) {
      console.log(`✓ Ball reached X cushion (within ${cushionThreshold}m threshold)`)
    }
    if (reachedYCushion) {
      console.log(`✓ Ball reached Y cushion (within ${cushionThreshold}m threshold)`)
    }
    if (!reachedXCushion && !reachedYCushion) {
      console.log("⚠️  Ball did NOT reach any cushion!")
    }

    console.log("\nFinal position:", {
      x: cueBall.pos.x.toFixed(3),
      y: cueBall.pos.y.toFixed(3),
      z: cueBall.pos.z.toFixed(3)
    })
    console.log("Final velocity:", cueBall.vel.length().toFixed(4))
    console.log("Final spin:", cueBall.rvel.length().toFixed(4))
    console.log("Final state:", cueBall.state)

    // Table dimensions for reference (typical carom table)
    const tableLength = 2.84 // meters (10 feet)
    const tableWidth = 1.42 // meters (5 feet)
    const tableDiagonal = Math.sqrt(tableLength**2 + tableWidth**2)

    console.log("\n=== Distance Analysis ===")
    console.log("Table length:", tableLength.toFixed(2), "meters")
    console.log("Table width:", tableWidth.toFixed(2), "meters")
    console.log("Table diagonal:", tableDiagonal.toFixed(2), "meters")
    console.log("Distance / table length:", (distance / tableLength).toFixed(2), "times")
    console.log("Distance / table diagonal:", (distance / tableDiagonal).toFixed(2), "times")

    // Realism assessment
    console.log("\n=== Realism Assessment ===")
    console.log("Shot power:", state.shots[0].power, "/ 5.0 (max)")
    console.log("Power percentage:", ((state.shots[0].power / 5.0) * 100).toFixed(1) + "%")

    // User expectation: "2 kısa banda çarparak 3 uzun bant mesafesi"
    console.log("\n=== User Expectation vs Reality ===")
    console.log("User expects: 2 short cushion hits, ~3 table lengths distance (8.52m)")
    console.log("Simulation shows:", shortCushionHits, "short cushion hits,", (distance / tableLength).toFixed(2), "table lengths (", distance.toFixed(2), "m)")

    if (shortCushionHits === 2) {
      console.log("✓ Cushion hits MATCH user expectation!")
    } else {
      console.log(`⚠️  Cushion hits MISMATCH: Expected 2, got ${shortCushionHits}`)
    }

    const expectedDistance = 3 * tableLength
    const distanceError = Math.abs(distance - expectedDistance) / expectedDistance * 100
    console.log(`Distance accuracy: ${(100 - distanceError).toFixed(1)}% (error: ${distanceError.toFixed(1)}%)`)

    // Average velocity calculation
    const avgVelocity = distance / elapsed
    console.log("\n=== Velocity Analysis ===")
    console.log(`Initial velocity: ${initialVelocity.toFixed(3)} m/s`)
    console.log(`Average velocity: ${avgVelocity.toFixed(3)} m/s`)
    console.log(`Duration: ${elapsed.toFixed(2)} seconds`)

    // Expected initial velocity for 91.4% power
    const expectedInitialVel = (state.shots[0].power / 5.0) * 6.0 // Assume max velocity ~6 m/s
    console.log(`Expected initial velocity: ~${expectedInitialVel.toFixed(2)} m/s`)
    const velError = Math.abs(initialVelocity - expectedInitialVel) / expectedInitialVel * 100
    console.log(`Initial velocity accuracy: ${(100 - velError).toFixed(1)}% (error: ${velError.toFixed(1)}%)`)

    // Typical carom ball speeds:
    // - Soft shot: 0.5-1.5 m/s
    // - Medium shot: 1.5-3.0 m/s
    // - Hard shot: 3.0-5.0 m/s
    // - Maximum power: 5.0-7.0 m/s (initial velocity)
    if (initialVelocity < 3.0) {
      console.log("⚠️  WARNING: Initial velocity too low for 91.4% power shot!")
    }
  })
})
