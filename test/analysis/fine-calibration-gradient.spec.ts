import { expect } from "chai"
import { initDom, canvas3d } from "../view/dom"
import {
  prepareThreeCushionEnvironment,
  simulateThreeCushionScenario,
  ReplayState,
} from "../helpers/threecushionReplay"
import { CAROM_BALL_RADIUS } from "../../src/model/physics/constants"

// Base scenario from the first replay URL
const BASE_STATE: ReplayState = {
  init: [1.19, 0.49185365438461304, 1.2398580312728882, 0.4961657226085663, 1.2022238540649414, -0.6610515117645264],
  shots: [{
    type: "AIM",
    offset: { x: 0.05, y: 0.32, z: 0 },  // Will be varied
    angle: -2.723405664443968,
    power: 0.7315200000000001,
    pos: { x: 1.19, y: 0.49185365438461304, z: 0 },
    i: 0,
    elevation: 0.12217304763960307
  }]
}

describe("Fine-grained calibration: 0.5mm offset steps", () => {
  beforeAll(() => {
    initDom()
    prepareThreeCushionEnvironment()
  })

  it("measures distance sensitivity with 0.5mm physical offset steps", () => {
    console.log("\n" + "=".repeat(100))
    console.log("FINE CALIBRATION TEST: Physical Offset vs Distance (0.5mm steps)")
    console.log("=".repeat(100))
    console.log("Purpose: Verify spin sensitivity is linear and physically plausible at fine granularity")
    console.log("Ball radius: " + (CAROM_BALL_RADIUS * 1000).toFixed(2) + " mm")
    console.log("-".repeat(100))
    console.log("Physical | Normalized | Distance | Duration |  Delta   | Delta-% | mm/m Ratio")
    console.log("Offset   |   Offset   |   (m)    |   (s)    | Dist (m) |         | (sensitivity)")
    console.log("-".repeat(100))

    // Generate offset values: 0.5mm steps from 0.5mm to 5.0mm
    const physicalOffsetsInMm = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 10.0]
    const results: Array<{
      physicalMm: number
      normalizedOffset: number
      distance: number
      duration: number
    }> = []

    for (const physicalMm of physicalOffsetsInMm) {
      const state = JSON.parse(JSON.stringify(BASE_STATE)) as ReplayState
      // Convert physical mm to normalized offset (divided by radius in mm)
      const normalizedOffset = physicalMm / (CAROM_BALL_RADIUS * 1000)
      state.shots[0].offset.x = normalizedOffset

      const result = simulateThreeCushionScenario(canvas3d, state, 30, 1 / 60)
      results.push({
        physicalMm,
        normalizedOffset,
        distance: result.distance,
        duration: result.duration,
      })
    }

    // Print table with delta calculations
    for (let i = 0; i < results.length; i++) {
      const { physicalMm, normalizedOffset, distance, duration } = results[i]

      if (i === 0) {
        console.log(
          `${physicalMm.toFixed(1).padStart(8)} | ${normalizedOffset.toFixed(4).padStart(10)} | ${distance.toFixed(4).padStart(8)} | ${duration.toFixed(3).padStart(8)} | ${"-".padStart(8)} | ${"-".padStart(7)} | ${"-".padStart(12)}`
        )
      } else {
        const deltaDist = distance - results[i - 1].distance
        const deltaPercent = (deltaDist / results[i - 1].distance) * 100
        const physicalDelta = physicalMm - results[i - 1].physicalMm
        const sensitivity = physicalDelta / (deltaDist * 1000) // mm per meter traveled

        console.log(
          `${physicalMm.toFixed(1).padStart(8)} | ${normalizedOffset.toFixed(4).padStart(10)} | ${distance.toFixed(4).padStart(8)} | ${duration.toFixed(3).padStart(8)} | ${deltaDist.toFixed(4).padStart(8)} | ${deltaPercent.toFixed(2).padStart(6)}% | ${sensitivity.toFixed(2).padStart(12)}`
        )
      }
    }

    console.log("-".repeat(100))

    // Calculate average sensitivity and linearity
    let totalSensitivity = 0
    let sensitivities: number[] = []
    for (let i = 1; i < results.length; i++) {
      const deltaDist = results[i].distance - results[i - 1].distance
      const physicalDelta = results[i].physicalMm - results[i - 1].physicalMm
      const sensitivity = physicalDelta / (deltaDist * 1000)
      sensitivities.push(sensitivity)
      totalSensitivity += sensitivity
    }

    const avgSensitivity = totalSensitivity / sensitivities.length
    const sensitivityStdDev = Math.sqrt(
      sensitivities.reduce((sum, s) => sum + Math.pow(s - avgSensitivity, 2), 0) / sensitivities.length
    )

    console.log(`\nStatistics:`)
    console.log(`  Total range: ${results[0].distance.toFixed(4)}m to ${results[results.length - 1].distance.toFixed(4)}m`)
    console.log(`  Average sensitivity: ${avgSensitivity.toFixed(2)} mm offset per meter distance`)
    console.log(`  Std deviation: ${sensitivityStdDev.toFixed(2)} mm/m (lower is more linear)`)
    console.log(`  Linearity coefficient: ${(sensitivityStdDev / avgSensitivity * 100).toFixed(2)}% (target < 10%)`)

    // Physical plausibility check
    const firstDistance = results[0].distance
    const lastDistance = results[results.length - 1].distance
    const totalDistanceChange = lastDistance - firstDistance
    const totalOffsetChange = results[results.length - 1].physicalMm - results[0].physicalMm
    const overallRatio = (totalDistanceChange / firstDistance) * 100

    console.log(`\nPhysical Plausibility:`)
    console.log(`  Offset change: ${results[0].physicalMm}mm → ${results[results.length - 1].physicalMm}mm (${totalOffsetChange.toFixed(1)}mm total)`)
    console.log(`  Distance change: ${overallRatio.toFixed(2)}% (from ${firstDistance.toFixed(4)}m to ${lastDistance.toFixed(4)}m)`)

    if (overallRatio > 50) {
      console.log(`  ⚠️  WARNING: ${overallRatio.toFixed(0)}% distance change may be excessive for ${totalOffsetChange.toFixed(1)}mm offset change`)
    } else if (overallRatio > 30) {
      console.log(`  ⚡ MODERATE: ${overallRatio.toFixed(0)}% distance change is significant but plausible`)
    } else {
      console.log(`  ✓  GOOD: ${overallRatio.toFixed(0)}% distance change is physically reasonable`)
    }

    console.log("=".repeat(100) + "\n")

    expect(results.length).to.equal(physicalOffsetsInMm.length)
  })

  it("tests original scenario pair with current calibration", () => {
    console.log("\n" + "=".repeat(100))
    console.log("ORIGINAL SCENARIO VALIDATION")
    console.log("=".repeat(100))

    const scenario1: ReplayState = {
      init: [1.19, 0.49185365438461304, 1.2398580312728882, 0.4961657226085663, 1.2022238540649414, -0.6610515117645264],
      shots: [{
        type: "AIM",
        offset: { x: 0.05263157894736842, y: 0.3262183652286641, z: 0 },
        angle: -2.723405664443968,
        power: 0.7315200000000001,
        pos: { x: 1.19, y: 0.49185365438461304, z: 0 },
        i: 0,
        elevation: 0.12217304763960307
      }]
    }

    const scenario2: ReplayState = {
      init: [1.19, 0.49185365438461304, 1.2398580312728882, 0.4961657226085663, 1.2022238540649414, -0.6610515117645264],
      shots: [{
        type: "AIM",
        offset: { x: 0.03508771929824561, y: 0.33206631844503837, z: 0 },
        angle: -2.723405664443968,
        power: 0.7315200000000001,
        pos: { x: 1.19, y: 0.49185365438461304, z: 0 },
        i: 0,
        elevation: 0.12217304763960307
      }]
    }

    const result1 = simulateThreeCushionScenario(canvas3d, scenario1, 30, 1 / 60)
    const result2 = simulateThreeCushionScenario(canvas3d, scenario2, 30, 1 / 60)

    const offsetDiffX = Math.abs(scenario2.shots[0].offset.x - scenario1.shots[0].offset.x)
    const offsetDiffY = Math.abs(scenario2.shots[0].offset.y - scenario1.shots[0].offset.y)
    const offsetDiffMag = Math.sqrt(offsetDiffX ** 2 + offsetDiffY ** 2)
    const physicalOffsetDiffMm = offsetDiffMag * CAROM_BALL_RADIUS * 1000

    const distanceDiff = Math.abs(result2.distance - result1.distance)
    const percentChange = (distanceDiff / result1.distance) * 100

    console.log(`Scenario 1: offset=(${scenario1.shots[0].offset.x.toFixed(4)}, ${scenario1.shots[0].offset.y.toFixed(4)})`)
    console.log(`  Distance: ${result1.distance.toFixed(4)}m, Duration: ${result1.duration.toFixed(3)}s`)
    console.log(`\nScenario 2: offset=(${scenario2.shots[0].offset.x.toFixed(4)}, ${scenario2.shots[0].offset.y.toFixed(4)})`)
    console.log(`  Distance: ${result2.distance.toFixed(4)}m, Duration: ${result2.duration.toFixed(3)}s`)
    console.log(`\nDifference:`)
    console.log(`  Offset magnitude: ${offsetDiffMag.toFixed(4)} (${physicalOffsetDiffMm.toFixed(2)} mm physical)`)
    console.log(`  Distance change: ${distanceDiff.toFixed(4)}m (${percentChange.toFixed(2)}%)`)
    console.log(`  Duration change: ${Math.abs(result2.duration - result1.duration).toFixed(3)}s`)

    if (percentChange < 2.0) {
      console.log(`  ✓  EXCELLENT: ${percentChange.toFixed(2)}% change is very realistic`)
    } else if (percentChange < 5.0) {
      console.log(`  ✓  GOOD: ${percentChange.toFixed(2)}% change is acceptable`)
    } else if (percentChange < 15.0) {
      console.log(`  ⚡ MODERATE: ${percentChange.toFixed(2)}% change is plausible but high`)
    } else {
      console.log(`  ⚠️  HIGH: ${percentChange.toFixed(2)}% change may need further tuning`)
    }

    console.log("=".repeat(100) + "\n")

    expect(result1.distance).to.be.greaterThan(0)
    expect(result2.distance).to.be.greaterThan(0)
  })
})
