import { decodeReplay, prepareThreeCushionEnvironment, createThreeCushionContainer, applyReplayState } from "../helpers/threecushionReplay"
import { initDom, canvas3d } from "../view/dom"
import { R, CAROM_BALL_RADIUS } from "../../src/model/physics/constants"

const REPLAY_URL = "http://localhost:8080/?ruletype=threecushion&state=%28'init%21%5BC%2CB%2CJ70E%2A215530396FNEEK747378752F7096K883651733F%2A1EEK494757503%5D~shots%21%5B%28'type%21'AIM'~offset%21%28'xLyLzH%29~angle%21J02%2A%2A%2A%2A%2A4~power%214.572~pos%21%28'x%21C~y%21B~zH%29~iLelevationH.17%29%5D~startDnowDscoreLwholeGame%21false~v%211%29N00BJ1773N61511E34CJ7098N49591064D%211760838856654~K9F%2C0.H%210J-0.KE9LH~N%2A0%01NLKJHFEDCB%2A_"

describe("Telemetry: Cushion Detection Validation", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("validates all event sources and power calculations", () => {
    const state = decodeReplay(REPLAY_URL)

    console.log("\n=== POWER AND SLIDER ANALYSIS ===")
    console.log("Decoded power from URL:", state.shots[0].power)

    // Calculate maxPower (same as Cue class)
    const maxPower = 160 * R
    console.log("R (ball radius):", R)
    console.log("CAROM_BALL_RADIUS:", CAROM_BALL_RADIUS)
    console.log("Calculated maxPower:", maxPower.toFixed(4))
    console.log("Slider position:", (state.shots[0].power / maxPower * 100).toFixed(2) + "%")

    if (R !== CAROM_BALL_RADIUS) {
      console.log("⚠️  WARNING: R !== CAROM_BALL_RADIUS - physics context may not be applied to Cue!")
    }

    console.log("\n=== SIMULATION WITH DETAILED EVENT LOGGING ===")

    const container = createThreeCushionContainer(canvas3d)
    const { cueBall } = applyReplayState(container, state)

    container.table.cue.hit(cueBall)

    const prevPos = cueBall.pos.clone()
    let distance = 0
    let elapsed = 0
    const maxTimeSeconds = 30
    const stepSeconds = 1 / 60

    // Detailed event tracking
    const cushionEvents: any[] = []
    const ballEvents: any[] = []
    const potEvents: any[] = []
    const allEvents: any[] = []

    // Track initial velocity
    let initialVelocity = 0
    let initialVelocityRecorded = false

    let step = 0
    while (elapsed < maxTimeSeconds) {
      // Record initial velocity after first step
      if (!initialVelocityRecorded && elapsed > 0) {
        initialVelocity = cueBall.vel.length()
        initialVelocityRecorded = true
      }

      const prevOutcomeCount = container.table.outcome.length

      container.advance(stepSeconds)

      // Check for new outcomes
      const newOutcomes = container.table.outcome.slice(prevOutcomeCount)
      for (const outcome of newOutcomes) {
        const event = {
          step,
          time: elapsed.toFixed(3),
          type: outcome.type,
          ballPos: { x: cueBall.pos.x.toFixed(3), y: cueBall.pos.y.toFixed(3) },
          ballVel: cueBall.vel.length().toFixed(3),
          incidentSpeed: outcome.incidentSpeed?.toFixed(3),
          ballId: outcome.ball?.id
        }

        allEvents.push(event)

        if (outcome.type === 'cushion') {
          cushionEvents.push(event)
        } else if (outcome.type === 'ball') {
          ballEvents.push(event)
        } else if (outcome.type === 'pot') {
          potEvents.push(event)
        }
      }

      distance += cueBall.pos.distanceTo(prevPos)
      prevPos.copy(cueBall.pos)

      elapsed += stepSeconds
      step++

      if (container.table.allStationary()) {
        break
      }
    }

    console.log("\n=== EVENT SUMMARY ===")
    console.log("Total events:", allEvents.length)
    console.log("Cushion events:", cushionEvents.length)
    console.log("Ball collision events:", ballEvents.length)
    console.log("Pot events:", potEvents.length)

    if (allEvents.length > 0) {
      console.log("\n=== ALL EVENTS DETAIL ===")
      allEvents.forEach((e, i) => {
        console.log(`Event ${i+1}:`, JSON.stringify(e, null, 2))
      })
    }

    if (cushionEvents.length > 0) {
      console.log("\n=== CUSHION EVENTS DETAIL ===")
      cushionEvents.forEach((e, i) => {
        console.log(`Cushion ${i+1}:`, JSON.stringify(e, null, 2))
      })
    } else {
      console.log("\n⚠️  NO CUSHION EVENTS DETECTED")
    }

    console.log("\n=== CHECK: Alternative Event Sources ===")
    console.log("container.table properties:", Object.keys(container.table).filter(k => k.includes('event') || k.includes('Event')))
    console.log("container properties:", Object.keys(container).filter(k => k.includes('event') || k.includes('Event')))

    console.log("\n=== SIMULATION RESULTS ===")
    console.log("Total distance:", distance.toFixed(2), "meters")
    console.log("Duration:", elapsed.toFixed(2), "seconds")
    console.log("Initial velocity:", initialVelocity.toFixed(3), "m/s")
    console.log("Average velocity:", (distance / elapsed).toFixed(3), "m/s")
    console.log("Final position:", {
      x: cueBall.pos.x.toFixed(3),
      y: cueBall.pos.y.toFixed(3),
      z: cueBall.pos.z.toFixed(3)
    })

    console.log("\n=== CONCLUSION ===")
    if (cushionEvents.length === 0) {
      console.log("✗ container.table.outcome does NOT show any cushion events")
      console.log("  This confirms the ball does not reach the cushions in test environment")
    } else {
      console.log("✓ container.table.outcome correctly captures cushion events")
    }
  })
})
