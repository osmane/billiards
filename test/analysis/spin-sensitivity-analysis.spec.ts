import { expect } from "chai"
import { initDom, canvas3d } from "../view/dom"
import {
  decodeReplay,
  prepareThreeCushionEnvironment,
  simulateThreeCushionScenario,
} from "../helpers/threecushionReplay"
import { CAROM_BALL_DIAMETER, CAROM_PHYSICS } from "../../src/model/physics/constants"

const REPLAY_URLS = [
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH05263157894736842~yH3262183652286641~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823384561~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
  "http://localhost:8080/?ruletype=threecushion&state=%28%27init%21%5BB%2C%2AK398580312728882DJ61657226085663K22238540649414D0.6610515117645264%5D~shots%21%5B%28%27type%21%27AIM%27~offset%21%28%27xH03508771929824561~yH33206631844503837~zE%29~angle%21-2.723405664443968~powerH73152FFFFF1~pos%21%28%27x%21B~y%21%2A~zE%29~iE~elevationH12217304763960307%29%5D~startCnowCscoreE~wholeGame%21false~v%211%29%2AJ185365438461304B1.19F694370269775C%211760823424674~D%2C-E%210F00HE.J0.49KD1.2%01KJHFEDCB%2A_",
]

describe("Detailed spin sensitivity analysis for three-cushion", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("analyzes physical plausibility of spin-distance relationship", () => {
    const states = REPLAY_URLS.map(decodeReplay)

    console.log("\n========================================")
    console.log("PHYSICAL ANALYSIS OF SPIN SENSITIVITY")
    console.log("========================================\n")

    // Decode offset differences
    const offset1 = states[0].shots[0].offset
    const offset2 = states[1].shots[0].offset
    const offsetDiffX = offset2.x - offset1.x
    const offsetDiffY = offset2.y - offset1.y
    const offsetDiffMagnitude = Math.sqrt(offsetDiffX**2 + offsetDiffY**2)

    console.log("Shot Parameter Comparison:")
    console.log("------------------------------------------")
    console.log(`Scenario 1 offset: (${offset1.x.toFixed(4)}, ${offset1.y.toFixed(4)})`)
    console.log(`Scenario 2 offset: (${offset2.x.toFixed(4)}, ${offset2.y.toFixed(4)})`)
    console.log(`Offset difference: (${offsetDiffX.toFixed(4)}, ${offsetDiffY.toFixed(4)})`)
    console.log(`Offset difference magnitude: ${offsetDiffMagnitude.toFixed(4)}`)
    console.log(`Offset as fraction of ball radius: ${(offsetDiffMagnitude / (CAROM_BALL_DIAMETER/2)).toFixed(3)}`)

    // Run simulations
    const results = states.map((state) =>
      simulateThreeCushionScenario(canvas3d, state, 30, 1 / 60)
    )

    console.log("\nSimulation Results:")
    console.log("------------------------------------------")
    results.forEach((result, idx) => {
      console.log(`\nScenario ${idx + 1}:`)
      console.log(`  Distance traveled: ${result.distance.toFixed(4)} m`)
      console.log(`  Duration: ${result.duration.toFixed(3)} s`)
      console.log(`  Final position: (${result.finalPos.x.toFixed(4)}, ${result.finalPos.y.toFixed(4)})`)
      console.log(`  Final velocity: ${result.finalVel.toFixed(6)} m/s`)
      console.log(`  Final spin: ${result.finalSpin.toFixed(6)} rad/s`)
    })

    const distanceDiff = Math.abs(results[0].distance - results[1].distance)
    const durationDiff = Math.abs(results[0].duration - results[1].duration)
    const positionDiff = results[1].finalPos.clone().sub(results[0].finalPos).length()

    console.log("\nDifference Metrics:")
    console.log("------------------------------------------")
    console.log(`Travel distance difference: ${distanceDiff.toFixed(4)} m (${((distanceDiff/results[0].distance)*100).toFixed(2)}%)`)
    console.log(`Duration difference: ${durationDiff.toFixed(3)} s (${((durationDiff/results[0].duration)*100).toFixed(2)}%)`)
    console.log(`Final position displacement: ${positionDiff.toFixed(4)} m`)
    console.log(`Final position displacement (ball diameters): ${(positionDiff/CAROM_BALL_DIAMETER).toFixed(2)}`)

    console.log("\nPhysics Context (CAROM_PHYSICS):")
    console.log("------------------------------------------")
    console.log(`Ball radius: ${CAROM_PHYSICS.R.toFixed(5)} m`)
    console.log(`Ball mass: ${CAROM_PHYSICS.m.toFixed(3)} kg`)
    console.log(`Rolling friction (mu): ${CAROM_PHYSICS.mu}`)
    console.log(`Sliding friction (muS): ${CAROM_PHYSICS.muS}`)
    console.log(`Spin decay (rho): ${CAROM_PHYSICS.rho}`)
    console.log(`Spin stop threshold: ${CAROM_PHYSICS.spinStopThreshold}`)

    console.log("\nPhysical Plausibility Assessment:")
    console.log("------------------------------------------")

    // Calculate spin-to-distance sensitivity ratio
    const spinSensitivity = distanceDiff / offsetDiffMagnitude
    console.log(`Spin-to-distance sensitivity: ${spinSensitivity.toFixed(2)} m per unit offset`)

    // Calculate energy implications
    const estimatedInitialKE1 = 0.5 * CAROM_PHYSICS.m * Math.pow(states[0].shots[0].power * 10, 2)
    const estimatedInitialKE2 = 0.5 * CAROM_PHYSICS.m * Math.pow(states[1].shots[0].power * 10, 2)
    console.log(`Estimated initial KE (both scenarios): ${estimatedInitialKE1.toFixed(3)} J`)

    // Work done by friction
    const workByFriction1 = CAROM_PHYSICS.muS! * CAROM_PHYSICS.m * 9.8 * results[0].distance
    const workByFriction2 = CAROM_PHYSICS.muS! * CAROM_PHYSICS.m * 9.8 * results[1].distance
    console.log(`Work by sliding friction (scenario 1): ${workByFriction1.toFixed(3)} J`)
    console.log(`Work by sliding friction (scenario 2): ${workByFriction2.toFixed(3)} J`)
    console.log(`Friction work difference: ${Math.abs(workByFriction2 - workByFriction1).toFixed(3)} J`)

    // Dimensionless analysis
    const reynoldsEffect = offsetDiffMagnitude / (CAROM_BALL_DIAMETER/2)
    console.log(`\nSpin offset as percentage of ball radius: ${(reynoldsEffect * 100).toFixed(2)}%`)

    const distanceRatio = results[1].distance / results[0].distance
    console.log(`Distance ratio (scenario 2 / scenario 1): ${distanceRatio.toFixed(3)}`)

    console.log("\n========================================")
    console.log("CONCLUSION")
    console.log("========================================")

    if (distanceRatio > 1.8) {
      console.log("⚠️  ALERT: Distance ratio exceeds 1.8x for such small spin change")
      console.log("   This suggests potentially unrealistic spin sensitivity.")
      console.log("   A ~1.85% change in offset produces ~110% distance change.")
    } else if (distanceRatio > 1.3) {
      console.log("⚠️  WARNING: Moderate sensitivity detected")
      console.log("   Distance varies by more than 30% for small spin change.")
    } else {
      console.log("✓  ACCEPTABLE: Spin sensitivity appears reasonable")
    }

    expect(results.length).to.equal(2)
  })
})
