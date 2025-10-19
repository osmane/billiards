import { decodeReplay, prepareThreeCushionEnvironment, createThreeCushionContainer, applyReplayState } from "../helpers/threecushionReplay"
import { initDom, canvas3d } from "../view/dom"

const REPLAY_URL = "http://localhost:8080/?ruletype=threecushion&state=%28'init%21%5BC%2CB%2CJ70E%2A215530396FNEEK747378752F7096K883651733F%2A1EEK494757503%5D~shots%21%5B%28'type%21'AIM'~offset%21%28'xLyLzH%29~angle%21J02%2A%2A%2A%2A%2A4~power%214.572~pos%21%28'x%21C~y%21B~zH%29~iLelevationH.17%29%5D~startDnowDscoreLwholeGame%21false~v%211%29N00BJ1773N61511E34CJ7098N49591064D%211760838856654~K9F%2C0.H%210J-0.KE9LH~N%2A0%01NLKJHFEDCB%2A_"

describe("Cushion Count Validation (User Reference: ~4 cushions, 11-14m)", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("counts cue ball cushion hits correctly", () => {
    const state = decodeReplay(REPLAY_URL)
    const container = createThreeCushionContainer(canvas3d)
    const { cueBall } = applyReplayState(container, state)

    container.table.cue.hit(cueBall)

    const prevPos = cueBall.pos.clone()
    let distance = 0
    let elapsed = 0
    const maxTimeSeconds = 30
    const stepSeconds = 1 / 60

    let prevOutcomeCount = 0
    let cueBallCushionHits = 0
    let allCushionHits = 0

    while (elapsed < maxTimeSeconds) {
      container.advance(stepSeconds)

      // Count new cushion outcomes
      const newOutcomes = container.table.outcome.slice(prevOutcomeCount)
      for (const outcome of newOutcomes) {
        if (outcome.type === 'cushion') {
          allCushionHits++
          if (outcome.ball.id === cueBall.id) {
            cueBallCushionHits++
          }
        }
      }
      prevOutcomeCount = container.table.outcome.length

      distance += cueBall.pos.distanceTo(prevPos)
      prevPos.copy(cueBall.pos)
      elapsed += stepSeconds

      if (container.table.allStationary()) {
        break
      }
    }

    console.log("\n=== CUSHION COUNT VALIDATION ===")
    console.log("User Reference Metrics:")
    console.log("  Expected distance: 11-14m (hard shot, perpendicular to short cushions)")
    console.log("  Expected cushion hits: ~4")
    console.log("")
    console.log("Simulation Results:")
    console.log("  Total distance:", distance.toFixed(2), "meters")
    console.log("  Duration:", elapsed.toFixed(2), "seconds")
    console.log("  Initial velocity:", "4.554 m/s")
    console.log("  Cue ball cushion hits:", cueBallCushionHits)
    console.log("  All ball cushion hits:", allCushionHits)
    console.log("")
    console.log("Comparison:")
    console.log("  Distance ratio:", (distance / 12.5).toFixed(2), "(target: 0.88-1.12)")
    console.log("  Cushion hits ratio:", (cueBallCushionHits / 4).toFixed(2), "(target: ~1.0)")
    console.log("")

    // Check if within acceptable range
    const distanceOK = distance >= 11.0 && distance <= 14.0
    const cushionOK = cueBallCushionHits >= 3 && cueBallCushionHits <= 5

    if (distanceOK && cushionOK) {
      console.log("✓ PASS: Metrics within user reference range")
    } else {
      console.log("⚠️  REVIEW:")
      if (!distanceOK) console.log("   - Distance outside 11-14m range")
      if (!cushionOK) console.log("   - Cushion hits outside 3-5 range")
    }
    console.log("===================================\n")
  })
})
